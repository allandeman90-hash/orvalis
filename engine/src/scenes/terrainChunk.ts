import { type LookAtCamera, viewProjectionMatrix, WORLD_UP } from '../camera';
import { mat4, vec3 } from '../math';
import {
  type ClearColor,
  type FrameStats,
  POSITION_COLOR_LAYOUT,
  POSITION_COLOR_MVP_SHADER,
  POSITION_COLOR_MVP_UNIFORM_BYTES,
  type RendererBackend,
  TERRAIN_DEBUG_LAYOUT,
  TERRAIN_DEBUG_MODE,
  TERRAIN_DEBUG_SHADER,
  TERRAIN_DEBUG_UNIFORM_BYTES,
  TERRAIN_DEBUG_UNIFORM_FLOATS,
  type TerrainDebugMode,
} from '../renderer';
import { buildChunkGeometry, buildChunkWireIndices, holeCount, type SyntheticHeightKind, syntheticChunkHeights, type TerrainConfig, type TileCoord } from '../terrain';
import type { Scene } from './firstTriangle';

export const TERRAIN_CHUNK_CLEAR: ClearColor = { r: 11 / 255, g: 14 / 255, b: 20 / 255, a: 1 };

/**
 * - oblique: three-quarter view, for a person looking at the page
 * - above:   straight down, +x to the right and +y up on screen (used by the pixel tests)
 * - below:   straight up from under the ground; with back-face culling the terrain must vanish
 */
export type ChunkView = 'oblique' | 'above' | 'below';

export interface TerrainChunkSceneOptions {
  readonly config: TerrainConfig;
  readonly heightKind: SyntheticHeightKind;
  readonly view: ChunkView;
  /**
   * Adds a large flat magenta quad BELOW the chunk and draws it AFTER the
   * terrain. Without a working depth buffer it would paint over the terrain.
   */
  readonly underlay: boolean;
  /** 4×4 hole mask (bit = hx + 4·hy, each bit removes 2×2 cells). Default: no hole. */
  readonly holes?: number;
  /** Start in wireframe (lines only, no filled triangles). Default: false. */
  readonly wireframe?: boolean;
  /** What the terrain shows: its debug colours (default) or its normals as colours. */
  readonly debugMode?: TerrainDebugMode;
}

export interface TerrainStats {
  /** Present when the scene shows a TerrainMap: its id and its number of resident tiles. */
  readonly map?: string;
  readonly tiles?: number;
  /** Present when the scene shows a TerrainTile. */
  readonly tile?: TileCoord;
  readonly chunks: number;
  readonly vertices: number;
  readonly triangles: number;
  /** Chunks handed to the renderer this frame (visible AND with at least one triangle). */
  readonly submittedChunks: number;
  /** Present when frustum culling exists in the scene. */
  readonly culling?: boolean;
  /** Chunks whose bounding box intersects the view frustum; undefined when culling is off (nothing is tested). */
  readonly visibleChunks?: number;
  readonly culledChunks?: number;
  readonly drawCalls: number;
  /** Number of set bits in the hole mask (0..16). */
  readonly holes: number;
  readonly wireframe: boolean;
  readonly debugMode: TerrainDebugMode;
  /** Present when the scene can draw chunk bounds. */
  readonly chunkBounds?: boolean;
  /** Present when the scene has far terrain. */
  readonly far?: { readonly visible: boolean; readonly tiles: number; readonly drawn: number; readonly radius: number };
  /** Present when the scene has a distance fog: whether it is applied. */
  readonly fog?: boolean;
  /** Present when the scene can draw a sky: whether it is switched on. */
  readonly sky?: boolean;
  /** Present when uploaded chunks have liquid: chunks and cells with liquid, chunks drawn last frame, and whether liquids are shown. */
  readonly liquid?: { readonly visible: boolean; readonly chunks: number; readonly cells: number; readonly drawn: number; readonly byType: Readonly<Record<'river' | 'ocean' | 'magma' | 'slime', number>>; readonly frame: number };
  /** Present when the scene can light textured terrain. */
  readonly lit?: boolean;
  /** Present when tiles are streamed around a focus point. */
  readonly streaming?: StreamingStats;
}

export interface StreamingStats {
  /** World position the tiles are streamed around (the camera target). */
  readonly focus: { readonly x: number; readonly y: number };
  readonly focusTile: TileCoord;
  readonly loadRadius: number;
  readonly unloadRadius: number;
  /** Tiles still to load (existing tiles of the load window not resident yet) plus tiles still to unload. */
  readonly pending: number;
  /** GPU tasks (chunk uploads, refreshes, frees) still queued. */
  readonly gpuQueue: number;
  /** Main-thread time spent on streaming (tile building + GPU queue) in the last frame, and the largest value over the recent frames. */
  readonly workMs: number;
  readonly workMaxMs: number;
  readonly loadedTotal: number;
  readonly unloadedTotal: number;
}

export interface TerrainChunkScene extends Scene {
  /** Live: reflects the current wireframe state. */
  readonly terrain: TerrainStats;
  setWireframe(on: boolean): void;
  toggleWireframe(): boolean;
  setDebugMode(mode: TerrainDebugMode): void;
}

/** Colour of the depth-test quad. */
export const UNDERLAY_COLOR = [1, 0, 1] as const;

/**
 * P1.2 test scene: exactly one synthetic terrain chunk (145 vertices, 256
 * triangles), drawn indexed, with depth and back-face culling. Every size is
 * expressed in chunk sizes, so the scene works with any TerrainConfig.
 *
 * Vertex colours encode position so that orientation can be checked from a
 * picture: red grows with x, green with y, blue with height.
 */
export function createTerrainChunkScene(backend: RendererBackend, options: TerrainChunkSceneOptions): TerrainChunkScene {
  const { config } = options;
  const size = config.chunkSize;
  const amplitude = 0.375 * size;
  const holes = options.holes ?? 0;
  const geometry = buildChunkGeometry(config, syntheticChunkHeights(config, options.heightKind, amplitude), 0, 0, holes);
  const wireData = buildChunkWireIndices(holes);
  let wireframe = options.wireframe ?? false;
  let debugMode: TerrainDebugMode = options.debugMode ?? 'color';

  // position · normal · colour (TERRAIN_DEBUG_LAYOUT)
  const vertices = new Float32Array(geometry.vertexCount * 9);
  for (let i = 0; i < geometry.vertexCount; i++) {
    const x = geometry.positions[i * 3]!, y = geometry.positions[i * 3 + 1]!, z = geometry.positions[i * 3 + 2]!;
    const n = geometry.normals;
    vertices.set([x, y, z, n[i * 3]!, n[i * 3 + 1]!, n[i * 3 + 2]!, 0.15 + 0.7 * (x / size), 0.15 + 0.7 * (y / size), 0.2 + 0.6 * (z / amplitude)], i * 9);
  }

  const terrainPipeline = backend.createPipeline({
    shader: TERRAIN_DEBUG_SHADER,
    vertexLayout: TERRAIN_DEBUG_LAYOUT,
    uniformBytes: TERRAIN_DEBUG_UNIFORM_BYTES,
    label: 'terrain-debug',
  });
  const vertexBuffer = backend.createBuffer({ usage: 'vertex', data: vertices, label: 'chunk-vertices' });
  // A fully holed chunk has no index at all, and a backend refuses an empty buffer.
  const indexBuffer = geometry.indices.length > 0 ? backend.createBuffer({ usage: 'index', data: geometry.indices, label: 'chunk-indices' }) : null;
  // Wireframe: same vertices, one line per unique triangle edge. Lines are drawn
  // INSTEAD of the filled triangles, so there is no z-fighting to bias away.
  const wirePipeline = backend.createPipeline({
    shader: TERRAIN_DEBUG_SHADER,
    vertexLayout: TERRAIN_DEBUG_LAYOUT,
    uniformBytes: TERRAIN_DEBUG_UNIFORM_BYTES,
    topology: 'line-list',
    label: 'terrain-wireframe',
  });
  const wireBuffer = wireData.length > 0 ? backend.createBuffer({ usage: 'index', data: wireData, label: 'chunk-wire-indices' }) : null;

  // Depth-test quad: below the lowest terrain point, wider than the chunk, visible from both sides.
  const c = size / 2, h = 1.25 * size, zq = -0.15625 * size;
  const [qr, qg, qb] = UNDERLAY_COLOR;
  // prettier-ignore
  const quad = new Float32Array([
    c - h, c - h, zq, qr, qg, qb,
    c + h, c - h, zq, qr, qg, qb,
    c + h, c + h, zq, qr, qg, qb,
    c - h, c + h, zq, qr, qg, qb,
  ]);
  const quadPipeline = options.underlay
    ? backend.createPipeline({
        shader: POSITION_COLOR_MVP_SHADER,
        vertexLayout: POSITION_COLOR_LAYOUT,
        uniformBytes: POSITION_COLOR_MVP_UNIFORM_BYTES,
        cullMode: 'none',
        label: 'underlay',
      })
    : null;
  const quadVertices = options.underlay ? backend.createBuffer({ usage: 'vertex', data: quad, label: 'underlay-vertices' }) : null;
  const quadIndices = options.underlay ? backend.createBuffer({ usage: 'index', data: new Uint16Array([0, 1, 2, 0, 2, 3]), label: 'underlay-indices' }) : null;

  const centre = vec3.create(c, c, 0);
  const distance = 1.875 * size;
  const common = { target: centre, fovY: Math.PI / 3, near: size / 64, far: size * 16 };
  const camera: LookAtCamera =
    options.view === 'above'
      ? { ...common, eye: vec3.create(c, c, distance), up: vec3.create(0, 1, 0) }
      : options.view === 'below'
        ? { ...common, eye: vec3.create(c, c, -distance), up: vec3.create(0, 1, 0) }
        : { ...common, eye: vec3.create(c - 1.1 * size, c - 1.1 * size, 1.1 * size), up: WORLD_UP };

  // The model matrix is identity: the chunk is already in world space.
  const mvp = mat4.create();
  // Terrain uniform block: the same matrix, then params.x = debug mode.
  const terrainUniforms = new Float32Array(TERRAIN_DEBUG_UNIFORM_FLOATS);

  return {
    get terrain(): TerrainStats {
      return { chunks: 1, vertices: geometry.vertexCount, triangles: geometry.triangleCount, submittedChunks: indexBuffer ? 1 : 0, drawCalls: indexBuffer ? 1 : 0, holes: holeCount(holes), wireframe, debugMode };
    },
    setWireframe(on: boolean): void {
      wireframe = on;
    },
    setDebugMode(mode: TerrainDebugMode): void {
      debugMode = mode;
    },
    toggleWireframe(): boolean {
      wireframe = !wireframe;
      return wireframe;
    },
    render(aspect: number): FrameStats {
      viewProjectionMatrix(mvp, camera, aspect, backend.info.depthRange);
      terrainUniforms.set(mvp, 0);
      terrainUniforms[16] = TERRAIN_DEBUG_MODE[debugMode];
      backend.beginFrame(TERRAIN_CHUNK_CLEAR);
      if (wireframe) {
        if (wireBuffer)
          backend.draw({ pipeline: wirePipeline, vertexBuffer, indexBuffer: wireBuffer, indexCount: wireData.length, uniforms: terrainUniforms });
      } else if (indexBuffer) {
        backend.draw({ pipeline: terrainPipeline, vertexBuffer, indexBuffer, indexCount: geometry.indices.length, uniforms: terrainUniforms });
      }
      // Drawn last on purpose: only the depth test keeps it behind the terrain.
      if (quadPipeline && quadVertices && quadIndices) {
        backend.draw({ pipeline: quadPipeline, vertexBuffer: quadVertices, indexBuffer: quadIndices, indexCount: 6, uniforms: mvp });
      }
      return backend.endFrame();
    },
    dispose() {
      backend.destroyBuffer(vertexBuffer);
      if (indexBuffer) backend.destroyBuffer(indexBuffer);
      if (wireBuffer) backend.destroyBuffer(wireBuffer);
      backend.destroyPipeline(terrainPipeline);
      backend.destroyPipeline(wirePipeline);
      if (quadVertices) backend.destroyBuffer(quadVertices);
      if (quadIndices) backend.destroyBuffer(quadIndices);
      if (quadPipeline) backend.destroyPipeline(quadPipeline);
    },
  };
}
