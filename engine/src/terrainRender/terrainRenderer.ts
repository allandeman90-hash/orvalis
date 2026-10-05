import { type Aabb, aabbIntersectsFrustum, createFrustum, frustumFromViewProjection } from '../camera';
import type { Mat4 } from '../math';
import {
  LIQUID_LAYOUT,
  LIQUID_SHADER,
  LIQUID_UNIFORM_BYTES,
  LIQUID_UNIFORM_FLOATS,
  type PipelineHandle,
  type BufferHandle,
  type RendererBackend,
  TERRAIN_DEBUG_LAYOUT,
  TERRAIN_DEBUG_MODE,
  TERRAIN_DEBUG_SHADER,
  TERRAIN_DEBUG_SOLID,
  TERRAIN_DEBUG_UNIFORM_BYTES,
  TERRAIN_DEBUG_UNIFORM_FLOATS,
  TERRAIN_FAR_SHADER,
  TERRAIN_FAR_UNIFORM_BYTES,
  TERRAIN_FAR_UNIFORM_FLOATS,
  TERRAIN_TEXTURED_SHADER,
  TERRAIN_TEXTURED_TEXTURES,
  TERRAIN_TEXTURED_UNIFORM_BYTES,
  TERRAIN_TEXTURED_UNIFORM_FLOATS,
  type TerrainDebugMode,
  type TextureHandle,
} from '../renderer';
import { buildChunkBorderLineIndices, buildChunkLiquidGeometry, buildChunkWireIndices, type ChunkLiquid, CHUNKS_PER_TILE, type LiquidType, liquidTypeOfCell, FAR_TRIANGLES, FAR_VERTICES, type FarTile, farTileIndices, holeCount, MASK_LIT, MASK_SIZE, type TerrainChunk, type TerrainTile, type TileCoord } from '../terrain';
import { liquidFrameAt, liquidFrames, type LiquidFrameStyle } from './liquidAnimation';
import { LIQUID_MATERIALS, LIQUID_PASS_ORDER, type LiquidMaterial, liquidTint, validateLiquidMaterials } from './liquidMaterials';
import { meanColour, type TextureImage } from './terrainTextures';
import { DEFAULT_TERRAIN_LIGHTING, lightingUniforms, type TerrainFog, terrainLight, type TerrainLighting, UNLIT_TERRAIN_LIGHTING, validateTerrainFog } from './lighting';

/** Colour of the chunk-bound lines. */
export const CHUNK_BOUNDS_COLOR = [1, 1, 0] as const;

/** Debug colour of a terrain vertex (0..1 per channel). */
export type TerrainVertexColour = (x: number, y: number, z: number, tile: TerrainTile) => readonly [number, number, number];

export interface TerrainDrawOptions {
  readonly wireframe: boolean;
  readonly debugMode: TerrainDebugMode;
  /** Border of every drawn chunk as lines on top of the terrain. */
  readonly chunkBounds: boolean;
  /** Frustum culling per chunk. */
  readonly culling: boolean;
  /** Camera position, world units. Needed for fog; without it the terrain is drawn unfogged. */
  readonly eye?: ArrayLike<number>;
  /**
   * Matrix used for the far terrain (same camera, a far plane much further away). Without it the far
   * terrain is drawn with the main matrix and anything beyond that matrix's far plane is clipped.
   */
  readonly farViewProjection?: Mat4;
}

export interface TerrainDrawResult {
  /** Chunks whose box intersects the frustum (all chunks when culling is off: nothing is tested). */
  readonly visibleChunks: number;
  /** Chunks really handed to the backend: visible and with at least one triangle. */
  readonly submittedChunks: number;
  /** Far tiles drawn this frame (0 in the debug views and in wireframe). */
  readonly farTilesDrawn: number;
  /** Visible chunks whose liquid was drawn this frame. */
  readonly liquidChunksDrawn: number;
  /** Animation frame 0..29 the liquids were (or would have been) drawn with. */
  readonly liquidFrame: number;
}

export interface TerrainTotals {
  readonly tiles: number;
  readonly chunks: number;
  readonly vertices: number;
  readonly triangles: number;
  readonly holes: number;
  /** Uploaded chunks that have liquid, and their liquid cells. */
  readonly liquidChunks: number;
  readonly liquidCells: number;
  readonly liquidCellsByType: Readonly<Record<LiquidType, number>>;
}

export interface TerrainMaterialOptions {
  /** Layer textures; chunk materials refer to them by index. */
  readonly palette: readonly TextureImage[];
  /**
   * How many times a layer texture repeats across one chunk. NOT from the
   * reference document (it does not give the scale): plain configuration.
   */
  readonly layerRepeatsPerChunk: number;
  /** Sun and ambient light of the textured mode. Default DEFAULT_TERRAIN_LIGHTING. */
  readonly lighting?: TerrainLighting;
  /** false = textured terrain is drawn unlit and without baked shadow (debug). Default true. */
  readonly lit?: boolean;
  /** Distance fog of the textured mode. Default: none. */
  readonly fog?: TerrainFog;
  /** Liquid textures: generated wave patterns (default), or one flat colour per frame for exact pixel checks. */
  readonly liquidFrames?: LiquidFrameStyle | undefined;
  /** World units covered by one repeat of a liquid texture. NOT from the spec. Default 16. */
  readonly liquidTextureSize?: number | undefined;
}

/** One flat mid-grey texture: what a renderer created without material options shows in textured mode. */
export const DEFAULT_TERRAIN_MATERIAL: TerrainMaterialOptions = {
  palette: [{ name: 'default-grey', width: 1, height: 1, data: new Uint8Array([128, 128, 128, 255]) }],
  layerRepeatsPerChunk: 4,
};

/**
 * Depth-buffer slices (spec §15): the far terrain is pinned to a thin slice at the back, 0.955..0.960 in the
 * original; everything detailed is mapped in front of it. So the far terrain can never poke through
 * detailed geometry, whatever their shapes, and the two passes may use different projection matrices.
 */
export const DETAIL_DEPTH_RANGE: readonly [number, number] = [0, 0.955];
export const FAR_DEPTH_RANGE: readonly [number, number] = [0.955, 0.96];

type Indexed = { readonly buffer: BufferHandle; readonly count: number } | null;

interface GpuChunk {
  readonly source: TerrainChunk;
  /** The 4 layer textures then the mask, in shader order. */
  readonly textures: readonly TextureHandle[];
  /** The chunk's own mask texture, or null when it uses the shared default mask. */
  readonly ownMask: TextureHandle | null;
  /** chunk uniform of the textured shader: origin x, y, 1 / chunkSize, layer uv scale. */
  readonly chunkUniform: readonly [number, number, number, number];
  readonly bounds: Aabb;
  vertexBuffer: BufferHandle;
  readonly triangles: Indexed;
  readonly wire: Indexed;
  /** The chunk's liquid: its own vertex buffer and one index buffer per liquid class; null when it has none. */
  readonly liquid: { readonly vertexBuffer: BufferHandle; readonly groups: ReadonlyArray<{ readonly type: LiquidType; readonly buffer: BufferHandle; readonly count: number }> } | null;
}

interface GpuTile {
  readonly tile: TerrainTile;
  /** Chunks uploaded so far (all 256 once the tile's uploads are done). */
  readonly chunks: GpuChunk[];
  /** Set by removeTile: tasks of this tile still queued must not upload anything. */
  removed: boolean;
}

const keyOf = (coord: TileCoord): string => `${coord.x},${coord.y}`;

/**
 * GPU side of the terrain: owns the buffers of the resident tiles and draws
 * them. One vertex buffer and one draw call PER CHUNK (never merged), index
 * buffers shared between chunks with the same hole mask, frustum culling per
 * chunk. Tiles can be added and removed at any time between two frames, which
 * is what streaming needs. GPU work can be DEFERRED: it is then queued and done
 * a few tasks per frame by processPending(), so that a tile arriving or leaving
 * never costs one long frame.
 *
 * Rendering modes: 'textured' (4 layers blended by the chunk's mask — no
 * lighting yet), or the debug views 'color' and 'normals'.
 */
export class TerrainRenderer {
  private readonly tiles = new Map<string, GpuTile>();
  private readonly triangleBuffers = new Map<number, Indexed>();
  private readonly wireBuffers = new Map<number, Indexed>();
  private readonly terrainPipeline;
  private readonly wirePipeline;
  private readonly boundsPipeline;
  private readonly texturedPipeline;
  private readonly farPipeline;
  private readonly farTiles = new Map<string, { readonly tile: FarTile; readonly vertexBuffer: BufferHandle }>();
  private farIndexBuffer: BufferHandle | null = null;
  private readonly farUniforms = new Float32Array(TERRAIN_FAR_UNIFORM_FLOATS);
  private readonly farFrustum = createFrustum();
  private readonly paletteMeans: ReadonlyArray<readonly [number, number, number]>;
  /** false = far tiles are kept but not drawn (debug). */
  farVisible = true;
  private readonly palette: TextureHandle[];
  /** Mask for chunks without material: no layer over the base. */
  private readonly defaultMask: TextureHandle;
  private readonly texturedUniforms = new Float32Array(TERRAIN_TEXTURED_UNIFORM_FLOATS);
  private readonly lightScratch = new Float32Array(12);
  private readonly boundsBuffer: BufferHandle;
  private readonly borderLineCount: number;
  private readonly layerRepeatsPerChunk: number;
  private lighting: TerrainLighting;
  /** Lighting and baked shadows applied in textured mode; false = unlit (debug). */
  lit: boolean;
  private fog: TerrainFog | null;
  /** false = the configured fog is not applied (debug). */
  fogged = true;
  /** false = liquids are not drawn (debug). */
  liquidVisible = true;
  /** false = liquids keep their full class opacity whatever the depth (debug). */
  liquidDepthResponse = true;
  private readonly liquidPipeline: PipelineHandle;
  private readonly liquidOpaquePipeline: PipelineHandle;
  private liquidMaterials: Readonly<Record<LiquidType, LiquidMaterial>> = LIQUID_MATERIALS;
  private readonly liquidCellsByType: Record<LiquidType, number> = { river: 0, ocean: 0, magma: 0, slime: 0 };
  private readonly liquidUniforms = new Float32Array(LIQUID_UNIFORM_FLOATS);
  /** The 30 frames of each class that has been needed so far (created when its first cell is uploaded). */
  private readonly liquidFrameTextures = new Map<LiquidType, TextureHandle[]>();
  private readonly liquidFrameStyle: LiquidFrameStyle;
  private readonly liquidUvPerUnit: number;
  /** Time the liquid animation is at, in milliseconds (spec §23). Set it every frame. */
  liquidTimeMs = 0;
  private liquidChunkCount = 0;
  private liquidCellCount = 0;
  private readonly frustum = createFrustum();
  private readonly visible: GpuChunk[] = [];
  private readonly terrainUniforms = new Float32Array(TERRAIN_DEBUG_UNIFORM_FLOATS);
  private readonly boundsUniforms = new Float32Array(TERRAIN_DEBUG_UNIFORM_FLOATS);
  private readonly queue: Array<() => void> = [];
  private queueHead = 0;
  private tileCount = 0;
  private chunkCount = 0;
  private vertexCount = 0;
  private triangleTotal = 0;
  private holeTotal = 0;

  constructor(
    private readonly backend: RendererBackend,
    private readonly colour: TerrainVertexColour,
    label = 'terrain',
    material: TerrainMaterialOptions = DEFAULT_TERRAIN_MATERIAL,
  ) {
    if (material.palette.length === 0) throw new Error('terrain renderer: the texture palette is empty');
    if (!(material.layerRepeatsPerChunk > 0) || !Number.isFinite(material.layerRepeatsPerChunk)) throw new Error(`terrain renderer: layerRepeatsPerChunk must be > 0 (got ${material.layerRepeatsPerChunk})`);
    this.layerRepeatsPerChunk = material.layerRepeatsPerChunk;
    this.lighting = material.lighting ?? DEFAULT_TERRAIN_LIGHTING;
    lightingUniforms(this.lighting); // validates
    this.lit = material.lit ?? true;
    if (material.fog) validateTerrainFog(material.fog);
    this.fog = material.fog ?? null;
    this.texturedPipeline = backend.createPipeline({
      shader: TERRAIN_TEXTURED_SHADER,
      vertexLayout: TERRAIN_DEBUG_LAYOUT,
      uniformBytes: TERRAIN_TEXTURED_UNIFORM_BYTES,
      textureCount: TERRAIN_TEXTURED_TEXTURES,
      depthRange: DETAIL_DEPTH_RANGE,
      label: `${label}-textured`,
    });
    this.paletteMeans = material.palette.map((image) => {
      const [r, g, b] = meanColour(image);
      return [r / 255, g / 255, b / 255] as const;
    });
    this.palette = material.palette.map((image) => backend.createTexture({ width: image.width, height: image.height, data: image.data, wrap: 'repeat', filter: 'linear', mipmaps: true, label: `layer-${image.name}` }));
    const blank = new Uint8Array(4);
    blank[0] = MASK_LIT;
    this.defaultMask = backend.createTexture({ width: 1, height: 1, data: blank, wrap: 'clamp', filter: 'linear', label: 'mask-default' });
    const base = { shader: TERRAIN_DEBUG_SHADER, vertexLayout: TERRAIN_DEBUG_LAYOUT, uniformBytes: TERRAIN_DEBUG_UNIFORM_BYTES, depthRange: DETAIL_DEPTH_RANGE };
    this.terrainPipeline = backend.createPipeline({ ...base, label: `${label}-terrain` });
    this.wirePipeline = backend.createPipeline({ ...base, topology: 'line-list', label: `${label}-wireframe` });
    // Bounds are an overlay: no depth test, so the lines never z-fight with the surface they lie on.
    this.boundsPipeline = backend.createPipeline({ ...base, topology: 'line-list', depthTest: false, depthWrite: false, label: `${label}-chunk-bounds` });
    const borderLines = buildChunkBorderLineIndices();
    this.borderLineCount = borderLines.length;
    this.boundsBuffer = backend.createBuffer({ usage: 'index', data: borderLines, label: 'chunk-bounds-indices' });
    this.boundsUniforms.set([TERRAIN_DEBUG_SOLID, ...CHUNK_BOUNDS_COLOR], 16);
    this.farPipeline = backend.createPipeline({ shader: TERRAIN_FAR_SHADER, vertexLayout: TERRAIN_DEBUG_LAYOUT, uniformBytes: TERRAIN_FAR_UNIFORM_BYTES, depthRange: FAR_DEPTH_RANGE, label: `${label}-far` });
    // Liquids: tested against the terrain's depth, never written to it; seen from both sides.
    this.liquidPipeline = backend.createPipeline({ shader: LIQUID_SHADER, vertexLayout: LIQUID_LAYOUT, uniformBytes: LIQUID_UNIFORM_BYTES, textureCount: 1, depthRange: DETAIL_DEPTH_RANGE, depthWrite: false, cullMode: 'none', blend: 'alpha', label: `${label}-liquid` });
    // Opaque liquid classes (magma): they replace what is behind and write depth, like terrain.
    this.liquidOpaquePipeline = backend.createPipeline({ shader: LIQUID_SHADER, vertexLayout: LIQUID_LAYOUT, uniformBytes: LIQUID_UNIFORM_BYTES, textureCount: 1, depthRange: DETAIL_DEPTH_RANGE, cullMode: 'none', label: `${label}-liquid-opaque` });
    this.liquidFrameStyle = material.liquidFrames ?? 'procedural';
    const repeat = material.liquidTextureSize ?? 16;
    if (!(repeat > 0) || !Number.isFinite(repeat)) throw new Error(`terrain renderer: liquidTextureSize must be a finite number > 0 (got ${repeat})`);
    this.liquidUvPerUnit = 1 / repeat;
  }

  /** Registered tiles, and what is currently drawable (uploaded chunks only). */
  get totals(): TerrainTotals {
    return { tiles: this.tileCount, chunks: this.chunkCount, vertices: this.vertexCount, triangles: this.triangleTotal, holes: this.holeTotal, liquidChunks: this.liquidChunkCount, liquidCells: this.liquidCellCount, liquidCellsByType: { ...this.liquidCellsByType } };
  }

  has(coord: TileCoord): boolean {
    return this.tiles.has(keyOf(coord));
  }

  /**
   * Registers a tile and uploads its chunks. Throws when a tile is already
   * present at these coordinates.
   * @param deferred false (default): everything is uploaded before returning.
   *   true: one task per chunk is queued for processPending(); the tile's
   *   chunks are drawn as they get uploaded.
   */
  addTile(tile: TerrainTile, deferred = false): void {
    const key = keyOf(tile.coord);
    if (this.tiles.has(key)) throw new Error(`terrain renderer: tile ${key} is already uploaded`);
    const entry: GpuTile = { tile, chunks: [], removed: false };
    this.tiles.set(key, entry);
    this.tileCount++;
    for (const chunk of tile.chunks) {
      this.schedule(deferred, () => {
        if (entry.removed) return;
        entry.chunks.push(this.uploadChunk(tile, chunk));
        this.count(chunk, 1);
      });
    }
  }

  /**
   * Stops drawing a tile and frees its GPU resources. False when it was not registered.
   * @param deferred true: the buffers and masks are freed by processPending(), a few per call.
   */
  removeTile(coord: TileCoord, deferred = false): boolean {
    const entry = this.tiles.get(keyOf(coord));
    if (!entry) return false;
    entry.removed = true; // uploads of this tile still in the queue become no-ops
    this.tiles.delete(keyOf(coord));
    this.tileCount--;
    for (const chunk of entry.chunks) {
      this.count(chunk.source, -1);
      this.schedule(deferred, () => {
        this.backend.destroyBuffer(chunk.vertexBuffer);
        if (chunk.ownMask !== null) this.backend.destroyTexture(chunk.ownMask);
        if (chunk.liquid) {
          this.backend.destroyBuffer(chunk.liquid.vertexBuffer);
          for (const group of chunk.liquid.groups) this.backend.destroyBuffer(group.buffer);
        }
      });
    }
    return true;
  }

  /**
   * Re-uploads the chunks on the outer border of a tile (60 of 256): their
   * normals change when a neighbouring tile arrives or leaves (TerrainMap
   * stitching). False when the tile is not registered. A border chunk that is
   * still waiting for its first upload needs nothing: it will read the current normals.
   */
  refreshTileBorder(coord: TileCoord, deferred = false): boolean {
    const entry = this.tiles.get(keyOf(coord));
    if (!entry) return false;
    const last = CHUNKS_PER_TILE - 1;
    for (const chunk of entry.chunks) {
      const { chunkX, chunkY } = chunk.source;
      if (chunkX !== 0 && chunkY !== 0 && chunkX !== last && chunkY !== last) continue;
      this.schedule(deferred, () => {
        if (entry.removed) return; // its buffers are being freed by removeTile's own tasks
        this.backend.destroyBuffer(chunk.vertexBuffer);
        chunk.vertexBuffer = this.uploadVertices(entry.tile, chunk.source);
      });
    }
    return true;
  }

  get farTileCount(): number {
    return this.farTiles.size;
  }

  /**
   * Uploads a far tile (545 vertices, one draw). Its vertex colours are the average colours of the texture
   * layers, blended with the paint's alphas exactly like the detailed shader blends the textures — so a far
   * tile looks like its detailed version seen from a distance.
   */
  addFarTile(tile: FarTile): void {
    const key = keyOf(tile.coord);
    if (this.farTiles.has(key)) throw new Error(`terrain renderer: far tile ${key} is already uploaded`);
    const means = tile.layers.map((id) => this.paletteMeans[id] ?? this.paletteMeans[0]!);
    const vertices = new Float32Array(FAR_VERTICES * 9);
    for (let i = 0; i < FAR_VERTICES; i++) {
      const colour = [means[0]![0], means[0]![1], means[0]![2]];
      for (let layer = 1; layer <= 3; layer++) {
        const alpha = tile.layerAlphas[i * 3 + layer - 1]!;
        for (let c = 0; c < 3; c++) colour[c] = colour[c]! + (means[layer]![c]! - colour[c]!) * alpha;
      }
      vertices.set([tile.positions[i * 3]!, tile.positions[i * 3 + 1]!, tile.positions[i * 3 + 2]!, tile.normals[i * 3]!, tile.normals[i * 3 + 1]!, tile.normals[i * 3 + 2]!, colour[0]!, colour[1]!, colour[2]!], i * 9);
    }
    this.farIndexBuffer ??= this.backend.createBuffer({ usage: 'index', data: farTileIndices(), label: 'far-indices' });
    this.farTiles.set(key, { tile, vertexBuffer: this.backend.createBuffer({ usage: 'vertex', data: vertices, label: `far-${key}` }) });
  }

  removeFarTile(coord: TileCoord): boolean {
    const entry = this.farTiles.get(keyOf(coord));
    if (!entry) return false;
    this.backend.destroyBuffer(entry.vertexBuffer);
    this.farTiles.delete(keyOf(coord));
    return true;
  }

  /** GPU tasks (chunk uploads, refreshes, frees) waiting for processPending(). */
  /** null removes the fog. */
  setFog(fog: TerrainFog | null): void {
    if (fog) validateTerrainFog(fog);
    this.fog = fog;
  }

  /** True when a fog is configured (whether or not it is currently applied). */
  get hasFog(): boolean {
    return this.fog !== null;
  }

  /**
   * Colour the frame should be cleared with so that fogged terrain fades into the background
   * (« fog colour ≈ horizon colour »); null when no fog applies to this rendering mode.
   */
  fogBackground(options: Pick<TerrainDrawOptions, 'debugMode' | 'wireframe'>): { r: number; g: number; b: number; a: number } | null {
    if (!this.fog || !this.fogged || options.debugMode !== 'textured' || options.wireframe) return null;
    return { r: this.fog.color[0], g: this.fog.color[1], b: this.fog.color[2], a: 1 };
  }

  /**
   * Day/night values (P2.2, P2.3): replaces the light COLOURS, the fog COLOUR and, when given, the light
   * DIRECTION (the lighting sun); the shadow factor and the fog distances are kept. Cheap: meant to be called
   * every frame.
   */
  setEnvironment(environment: {
    readonly ambient: readonly [number, number, number];
    readonly diffuse: readonly [number, number, number];
    readonly fogColor: readonly [number, number, number];
    readonly toLight?: readonly [number, number, number] | undefined;
  }): void {
    this.setLighting({ ...this.lighting, ambient: environment.ambient, diffuse: environment.diffuse, ...(environment.toLight ? { toLight: environment.toLight } : {}) });
    if (this.fog) this.setFog({ ...this.fog, color: environment.fogColor });
  }

  /** Replaces the material of every liquid class (see liquidMaterials.ts). */
  setLiquidMaterials(materials: Readonly<Record<LiquidType, LiquidMaterial>>): void {
    validateLiquidMaterials(materials);
    this.liquidMaterials = materials;
    // The frames carry the class colour: those already made are rebuilt.
    for (const type of [...this.liquidFrameTextures.keys()]) {
      for (const texture of this.liquidFrameTextures.get(type)!) this.backend.destroyTexture(texture);
      this.liquidFrameTextures.delete(type);
      this.ensureLiquidFrames(type);
    }
  }

  setLighting(lighting: TerrainLighting): void {
    lightingUniforms(lighting); // validates
    this.lighting = lighting;
  }

  get pendingWork(): number {
    return this.queue.length - this.queueHead;
  }

  /**
   * Runs queued GPU tasks, oldest first, until the queue is empty or
   * shouldStop() returns true. Always runs at least one task when there is one,
   * so the queue drains whatever the budget. Returns what is left.
   */
  processPending(shouldStop: () => boolean = () => false): number {
    while (this.queueHead < this.queue.length) {
      this.queue[this.queueHead++]!();
      if (shouldStop()) break;
    }
    if (this.queueHead === this.queue.length) {
      this.queue.length = 0;
      this.queueHead = 0;
    }
    return this.pendingWork;
  }

  private schedule(deferred: boolean, task: () => void): void {
    if (deferred) this.queue.push(task);
    else task();
  }

  private uploadChunk(tile: TerrainTile, chunk: TerrainChunk): GpuChunk {
    const g = chunk.geometry;
    const material = chunk.material;
    // The mask is never mip-mapped and never repeats: it is one image stretched over the chunk.
    const ownMask = material ? this.backend.createTexture({ width: MASK_SIZE, height: MASK_SIZE, data: material.mask, wrap: 'clamp', filter: 'linear', label: `mask-${tile.coord.x}-${tile.coord.y}-${chunk.chunkX}-${chunk.chunkY}` }) : null;
    const layers = material?.layers ?? [0, 0, 0, 0];
    const chunkSize = tile.config.chunkSize;
    return {
      source: chunk,
      textures: [...layers.map((id) => this.paletteTexture(id)), ownMask ?? this.defaultMask],
      ownMask,
      // The origin is the chunk's first stored vertex: exactly the value the vertices were built from.
      chunkUniform: [g.positions[0]!, g.positions[1]!, 1 / chunkSize, this.layerRepeatsPerChunk / chunkSize],
      bounds: chunk.bounds,
      vertexBuffer: this.uploadVertices(tile, chunk),
      triangles: this.shared(this.triangleBuffers, g.holes, () => g.indices, 'chunk-indices'),
      wire: this.shared(this.wireBuffers, g.holes, () => buildChunkWireIndices(g.holes), 'chunk-wire'),
      liquid: chunk.liquid ? this.uploadLiquid(tile, chunk, chunk.liquid) : null,
    };
  }

  /** Creates the 30 animation frames of a class the first time it is needed; they are kept until dispose(). */
  private ensureLiquidFrames(type: LiquidType): void {
    if (this.liquidFrameTextures.has(type)) return;
    this.liquidFrameTextures.set(
      type,
      liquidFrames(type, this.liquidMaterials[type], this.liquidFrameStyle).map((image) => this.backend.createTexture({ width: image.width, height: image.height, data: image.data, wrap: 'repeat', filter: 'linear', mipmaps: true, label: image.name })),
    );
  }

  /** x · y · z · depth per vertex (LIQUID_LAYOUT), and one index buffer per liquid class of the chunk. */
  private uploadLiquid(tile: TerrainTile, chunk: TerrainChunk, liquid: ChunkLiquid): NonNullable<GpuChunk['liquid']> {
    const geometry = buildChunkLiquidGeometry(liquid, chunk.geometry.positions);
    for (const group of geometry.groups) this.ensureLiquidFrames(group.type);
    const label = `liquid-${tile.coord.x}-${tile.coord.y}-${chunk.chunkX}-${chunk.chunkY}`;
    return {
      vertexBuffer: this.backend.createBuffer({ usage: 'vertex', data: geometry.vertices, label }),
      groups: geometry.groups.map((group) => ({ type: group.type, buffer: this.backend.createBuffer({ usage: 'index', data: group.indices, label: `${label}-${group.type}` }), count: group.indices.length })),
    };
  }

  /** Adds (sign 1) or removes (sign −1) one drawable chunk from the totals. */
  private count(chunk: TerrainChunk, sign: 1 | -1): void {
    if (chunk.liquid) {
      this.liquidChunkCount += sign;
      this.liquidCellCount += sign * chunk.liquid.cellCount;
      for (const flag of chunk.liquid.cells) {
        const type = liquidTypeOfCell(flag);
        if (type) this.liquidCellsByType[type] += sign;
      }
    }
    this.chunkCount += sign;
    this.vertexCount += sign * chunk.geometry.vertexCount;
    this.triangleTotal += sign * chunk.geometry.triangleCount;
    this.holeTotal += sign * holeCount(chunk.geometry.holes);
  }

  /** Draws the uploaded tiles. Must be called between beginFrame() and endFrame(). */
  draw(viewProjection: Mat4, options: TerrainDrawOptions): TerrainDrawResult {
    const { backend, visible } = this;
    const textured = options.debugMode === 'textured' && !options.wireframe;
    this.terrainUniforms.set(viewProjection, 0);
    this.terrainUniforms[16] = TERRAIN_DEBUG_MODE[options.debugMode];
    this.texturedUniforms.set(viewProjection, 0);
    lightingUniforms(this.lit ? this.lighting : UNLIT_TERRAIN_LIGHTING, this.lightScratch);
    this.texturedUniforms.set(this.lightScratch, 20);
    const fog = this.fogged && options.eye ? this.fog : null;
    if (fog && options.eye) {
      this.texturedUniforms.set([options.eye[0]!, options.eye[1]!, options.eye[2]!, 0, fog.color[0], fog.color[1], fog.color[2], 0, fog.start, 1 / (fog.end - fog.start), 0, 0], 32);
    } else {
      this.texturedUniforms.fill(0, 32, 44); // range (0, 0) → factor 0 everywhere
    }
    this.boundsUniforms.set(viewProjection, 0);
    // Far terrain first, in its own slice at the back of the depth buffer. Only in the normal (textured) view.
    let farTilesDrawn = 0;
    if (textured && this.farVisible && this.farTiles.size > 0 && this.farIndexBuffer !== null) {
      const farMatrix = options.farViewProjection ?? viewProjection;
      this.farUniforms.set(farMatrix, 0);
      this.farUniforms.set(this.texturedUniforms.subarray(20, 24), 16); // light (the shadow factor in w is unused)
      this.farUniforms.set(this.texturedUniforms.subarray(24, 44), 20); // ambient, diffuse, eye, fog colour, fog range
      if (options.culling) frustumFromViewProjection(this.farFrustum, farMatrix, backend.info.depthRange);
      for (const entry of this.farTiles.values()) {
        if (options.culling && !aabbIntersectsFrustum(this.farFrustum, entry.tile.bounds)) continue;
        farTilesDrawn++;
        backend.draw({ pipeline: this.farPipeline, vertexBuffer: entry.vertexBuffer, indexBuffer: this.farIndexBuffer, indexCount: FAR_TRIANGLES * 3, uniforms: this.farUniforms });
      }
    }
    // Culling: one box-against-6-planes test per chunk, with the very matrix used to draw.
    visible.length = 0;
    if (options.culling) frustumFromViewProjection(this.frustum, viewProjection, backend.info.depthRange);
    for (const entry of this.tiles.values()) {
      for (const chunk of entry.chunks) if (!options.culling || aabbIntersectsFrustum(this.frustum, chunk.bounds)) visible.push(chunk);
    }
    let submitted = 0;
    const pipeline = options.wireframe ? this.wirePipeline : this.terrainPipeline;
    // One draw per visible chunk. A fully holed chunk has nothing to submit.
    for (const chunk of visible) {
      const indexed = options.wireframe ? chunk.wire : chunk.triangles;
      if (!indexed) continue;
      submitted++;
      if (textured) {
        this.texturedUniforms.set(chunk.chunkUniform, 16);
        backend.draw({ pipeline: this.texturedPipeline, vertexBuffer: chunk.vertexBuffer, indexBuffer: indexed.buffer, indexCount: indexed.count, uniforms: this.texturedUniforms, textures: chunk.textures });
      } else {
        backend.draw({ pipeline, vertexBuffer: chunk.vertexBuffer, indexBuffer: indexed.buffer, indexCount: indexed.count, uniforms: this.terrainUniforms });
      }
    }
    if (options.chunkBounds) {
      for (const chunk of visible) {
        backend.draw({ pipeline: this.boundsPipeline, vertexBuffer: chunk.vertexBuffer, indexBuffer: this.boundsBuffer, indexCount: this.borderLineCount, uniforms: this.boundsUniforms });
      }
    }
    // Liquids last, one pass per class (spec §26: separate queues): opaque classes first, then the blended
    // ones over everything. Not in wireframe nor in the normals view.
    let liquidChunksDrawn = 0;
    const liquidFrame = liquidFrameAt(this.liquidTimeMs);
    if (this.liquidVisible && !options.wireframe && options.debugMode !== 'normals' && this.liquidChunkCount > 0) {
      const u = this.liquidUniforms;
      u.set(viewProjection, 0);
      // Lit like flat ground (a liquid surface is nearly horizontal): ambient + diffuse · max(toLight.z, 0).
      const light = this.lit && textured ? terrainLight(this.lighting, [0, 0, 1]) : ([1, 1, 1] as const);
      for (const chunk of visible) if (chunk.liquid) liquidChunksDrawn++;
      for (const type of LIQUID_PASS_ORDER) {
        if (this.liquidCellsByType[type] === 0) continue;
        const material = this.liquidMaterials[type];
        const frames = this.liquidFrameTextures.get(type);
        if (!frames) continue; // cannot happen: frames are created with the first cell of the class
        const liquidTexture = [frames[liquidFrame]!]; // a fresh list per pass: a draw call keeps the one it was given
        u.set(liquidTint(material, light), 16);
        if (textured && material.fogged) u.set(this.texturedUniforms.subarray(32, 44), 20); // eye, fog colour, fog range
        else u.fill(0, 20, 32);
        u[32] = this.liquidUvPerUnit;
        u[33] = material.depthScale > 0 ? 1 / material.depthScale : 0;
        u[34] = this.liquidDepthResponse && material.depthScale > 0 ? 1 : 0;
        const pipeline = material.blend === 'opaque' ? this.liquidOpaquePipeline : this.liquidPipeline;
        for (const chunk of visible) {
          if (!chunk.liquid) continue;
          for (const group of chunk.liquid.groups) if (group.type === type) backend.draw({ pipeline, vertexBuffer: chunk.liquid.vertexBuffer, indexBuffer: group.buffer, indexCount: group.count, uniforms: u, textures: liquidTexture });
        }
      }
    }
    return { visibleChunks: visible.length, submittedChunks: submitted, farTilesDrawn, liquidChunksDrawn, liquidFrame };
  }

  dispose(): void {
    for (const coord of [...this.tiles.values()].map((entry) => entry.tile.coord)) this.removeTile(coord, true);
    this.processPending(); // everything still queued, frees included
    for (const entry of this.farTiles.values()) this.backend.destroyBuffer(entry.vertexBuffer);
    this.farTiles.clear();
    if (this.farIndexBuffer !== null) this.backend.destroyBuffer(this.farIndexBuffer);
    this.farIndexBuffer = null;
    this.backend.destroyPipeline(this.farPipeline);
    this.backend.destroyPipeline(this.liquidPipeline);
    this.backend.destroyPipeline(this.liquidOpaquePipeline);
    for (const frames of this.liquidFrameTextures.values()) for (const texture of frames) this.backend.destroyTexture(texture);
    this.liquidFrameTextures.clear();
    for (const texture of this.palette) this.backend.destroyTexture(texture);
    this.backend.destroyTexture(this.defaultMask);
    this.backend.destroyPipeline(this.texturedPipeline);
    for (const cache of [this.triangleBuffers, this.wireBuffers]) {
      for (const entry of cache.values()) if (entry) this.backend.destroyBuffer(entry.buffer);
      cache.clear();
    }
    this.backend.destroyBuffer(this.boundsBuffer);
    this.backend.destroyPipeline(this.terrainPipeline);
    this.backend.destroyPipeline(this.wirePipeline);
    this.backend.destroyPipeline(this.boundsPipeline);
  }

  /** A layer id outside the palette falls back to texture 0 rather than failing a whole tile. */
  private paletteTexture(id: number): TextureHandle {
    return this.palette[id] ?? this.palette[0]!;
  }

  /** position · normal · colour (TERRAIN_DEBUG_LAYOUT). */
  private uploadVertices(tile: TerrainTile, chunk: TerrainChunk): BufferHandle {
    const g = chunk.geometry;
    const vertices = new Float32Array(g.vertexCount * 9);
    for (let i = 0; i < g.vertexCount; i++) {
      const x = g.positions[i * 3]!, y = g.positions[i * 3 + 1]!, z = g.positions[i * 3 + 2]!;
      const [r, gr, b] = this.colour(x, y, z, tile);
      vertices.set([x, y, z, g.normals[i * 3]!, g.normals[i * 3 + 1]!, g.normals[i * 3 + 2]!, r, gr, b], i * 9);
    }
    return this.backend.createBuffer({ usage: 'vertex', data: vertices, label: `tile-${tile.coord.x}-${tile.coord.y}-chunk-${chunk.chunkX}-${chunk.chunkY}` });
  }

  /** One index buffer per DISTINCT hole mask (almost always a single one), kept until dispose(). */
  private shared(cache: Map<number, Indexed>, mask: number, data: () => Uint16Array, label: string): Indexed {
    if (!cache.has(mask)) {
      const d = data();
      cache.set(mask, d.length > 0 ? { buffer: this.backend.createBuffer({ usage: 'index', data: d, label: `${label}-${mask}` }), count: d.length } : null);
    }
    return cache.get(mask) ?? null;
  }
}
