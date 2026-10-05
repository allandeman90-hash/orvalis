import { batchLightingPath, type Building, type BuildingBatchClass, buildBuildingLiquidGeometry, BUILDING_VERTEX_LAYOUT, type CollisionKind, collisionIndices, type BuildingMaterialState, buildingMaterialState, groupIsInterior, packBuildingGroup, validateBuilding } from '../building';
import { mat4, type Mat4 } from '../math';
import { LIQUID_LAYOUT, LIQUID_SHADER, LIQUID_UNIFORM_BYTES, LIQUID_UNIFORM_FLOATS, BUILDING_DEBUG_MODE, BUILDING_SHADER, BUILDING_UNIFORM_BYTES, BUILDING_UNIFORM_FLOATS, type BufferHandle, type BuildingDebugMode, type PipelineHandle, type RendererBackend, type TextureHandle } from '../renderer';
import type { LiquidType } from '../terrain';
import { DEFAULT_TERRAIN_LIGHTING, LIQUID_MATERIALS, LIQUID_PASS_ORDER, type LiquidFrameStyle, liquidFrameAt, liquidFrames, liquidTint, lightingUniforms, type TerrainFog, type TerrainLighting, terrainLight, validateTerrainFog } from '../terrainRender';

declare const buildingBrand: unique symbol;
export type BuildingId = number & { readonly [buildingBrand]: true };

export interface BuildingInstance {
  readonly building: BuildingId;
  /** Building → world: rotation, translation and uniform scale. */
  readonly matrix: Mat4;
  /**
   * The groups to draw (indices). Absent: every group. This is where a visibility system (portals, later) says
   * what can be seen — the renderer never draws a group that is not listed (spec §134: « do not submit every group »).
   */
  readonly visibleGroups?: ReadonlySet<number> | undefined;
}

export interface BuildingDrawOptions {
  readonly debugMode: BuildingDebugMode;
  readonly eye?: ArrayLike<number> | undefined;
  /**
   * 'opaque' = only the batches that write depth, 'blended' = only the others, absent = both, in that order.
   * Lets a scene draw the props between the two: a prop behind a pane of glass must be drawn before the glass.
   */
  readonly pass?: 'opaque' | 'blended' | undefined;
  /**
   * Draws a COLLISION set instead of the render batches (debug view, P6.3): the group's vertices with the set's
   * own index array, one flat colour per group, two-sided. Drawn in the opaque pass.
   */
  readonly collision?: CollisionKind | undefined;
}

/** Flat colours of the debug views: one per group (cycled), one per batch class. */
export const GROUP_DEBUG_COLOURS: ReadonlyArray<readonly [number, number, number]> = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, 0, 1], [0, 1, 1]];
export const CLASS_DEBUG_COLOURS: Readonly<Record<BuildingBatchClass, readonly [number, number, number]>> = { trans: [1, 0, 0], interior: [0, 1, 0], exterior: [0, 0, 1] };

export interface BuildingRendererOptions {
  /** Liquid textures: generated wave patterns (default), or one flat colour per frame for exact pixel checks. */
  readonly liquidFrames?: LiquidFrameStyle | undefined;
  /** Units covered by one repeat of a liquid texture. NOT from the spec (its scale is unresolved there). Default 16, like the terrain. */
  readonly liquidTextureSize?: number | undefined;
  /** Engine units per yard, for the liquid grid step (spec §128, given in yards). Default 1. */
  readonly unitsPerYard?: number | undefined;
}

export interface BuildingLiquidDrawOptions {
  /** Time the liquid animation is at, in milliseconds. */
  readonly timeMs: number;
  /** Camera position (world), for the fog. */
  readonly eye?: ArrayLike<number> | undefined;
}

/** Colour of the portal polygons in the debug view. */
export const PORTAL_DEBUG_COLOUR: readonly [number, number, number] = [1, 0, 1];
const COLLISION_VIEW_STATE: BuildingMaterialState = { blend: 'opaque', cullMode: 'none', depthWrite: true, transparent: false, unlit: true, alphaReference: 0 };

interface GpuBatch {
  readonly firstIndex: number;
  readonly indexCount: number;
  readonly state: BuildingMaterialState;
  readonly pipeline: PipelineHandle;
  readonly texture: TextureHandle;
  readonly batchClass: BuildingBatchClass;
  /** BUILDING_LIGHTING_PATH of the batch in its group. */
  readonly lightingPath: number;
}
interface GpuGroup {
  readonly vertexBuffer: BufferHandle;
  readonly indexBuffer: BufferHandle;
  readonly interior: boolean;
  readonly batches: readonly GpuBatch[];
  /** Index buffers of the collision sets over the same vertex buffer; null when a set is empty. */
  readonly collision: Readonly<Record<CollisionKind, { readonly buffer: BufferHandle; readonly indexCount: number } | null>>;
  /** The group's liquid surface, when it has wet tiles and a kind. */
  readonly liquid: { readonly type: LiquidType; readonly vertexBuffer: BufferHandle; readonly indexBuffer: BufferHandle; readonly indexCount: number } | null;
}
interface GpuBuilding {
  readonly building: Building;
  readonly textures: readonly TextureHandle[];
  readonly groups: readonly GpuGroup[];
  /** The portal polygons as triangle fans (debug view); null when the building has none. */
  readonly portals: { readonly vertexBuffer: BufferHandle; readonly indexBuffer: BufferHandle; readonly indexCount: number } | null;
}

/**
 * Draws buildings (P6.1): each GROUP keeps its own vertex and index buffer — groups are never merged — and is
 * drawn batch by batch, each batch with the pipeline and texture of its material. Opaque and alpha-tested batches
 * of every visible group come first, the blended ones after (in the order given, not sorted).
 * The two passes can be drawn separately (options.pass), so that props are drawn in between (P6.2).
 * Textures and materials belong to the building and are shared by its groups.
 */
export class BuildingRenderer {
  private readonly pipelines = new Map<string, PipelineHandle>();
  private readonly buildings = new Map<number, GpuBuilding>();
  private readonly uniforms = new Float32Array(BUILDING_UNIFORM_FLOATS);
  private readonly lightScratch = new Float32Array(12);
  private readonly mvp = mat4.create();
  private nextId = 1;
  private lighting: TerrainLighting = DEFAULT_TERRAIN_LIGHTING;
  private fog: TerrainFog | null = null;

  private readonly liquidPipeline: PipelineHandle;
  private readonly liquidOpaquePipeline: PipelineHandle;
  private readonly liquidFrameTextures = new Map<LiquidType, TextureHandle[]>();
  private readonly liquidUniforms = new Float32Array(LIQUID_UNIFORM_FLOATS);
  private readonly liquidFrameStyle: LiquidFrameStyle;
  private readonly liquidUvPerUnit: number;
  private readonly unitsPerYard: number;
  private readonly inverse = mat4.create();

  constructor(private readonly backend: RendererBackend, private readonly label = 'building', options: BuildingRendererOptions = {}) {
    const repeat = options.liquidTextureSize ?? 16;
    if (!(repeat > 0) || !Number.isFinite(repeat)) throw new Error(`building renderer: liquidTextureSize must be a finite number > 0 (got ${repeat})`);
    this.liquidUvPerUnit = 1 / repeat;
    this.liquidFrameStyle = options.liquidFrames ?? 'procedural';
    this.unitsPerYard = options.unitsPerYard ?? 1;
    // Like the terrain's liquids: blended ones test depth without writing it; opaque ones (magma) write it. Two-sided.
    this.liquidPipeline = backend.createPipeline({ shader: LIQUID_SHADER, vertexLayout: LIQUID_LAYOUT, uniformBytes: LIQUID_UNIFORM_BYTES, textureCount: 1, depthWrite: false, cullMode: 'none', blend: 'alpha', label: `${label}-liquid` });
    this.liquidOpaquePipeline = backend.createPipeline({ shader: LIQUID_SHADER, vertexLayout: LIQUID_LAYOUT, uniformBytes: LIQUID_UNIFORM_BYTES, textureCount: 1, cullMode: 'none', label: `${label}-liquid-opaque` });
  }

  /** One fan per portal polygon, in the building vertex layout (white, the plane's normal). */
  private uploadPortals(building: Building): GpuBuilding['portals'] {
    const portals = building.portals ?? [], pool = building.portalVertices;
    if (portals.length === 0 || !pool) return null;
    const count = portals.reduce((sum, portal) => sum + portal.vertexCount, 0);
    const data = new Uint8Array(count * BUILDING_VERTEX_LAYOUT.stride).fill(255), view = new DataView(data.buffer), indices: number[] = [];
    let v = 0;
    for (const portal of portals) {
      for (let k = 0; k < portal.vertexCount; k++, v++) {
        const at = v * BUILDING_VERTEX_LAYOUT.stride, source = (portal.startVertex + k) * 3;
        for (let c = 0; c < 3; c++) {
          view.setFloat32(at + c * 4, pool[source + c]!, true);
          view.setFloat32(at + 12 + c * 4, portal.plane[c]!, true);
        }
        view.setFloat32(at + 24, 0, true);
        view.setFloat32(at + 28, 0, true);
        if (k >= 2) indices.push(v - k, v - 1, v);
      }
    }
    return { vertexBuffer: this.backend.createBuffer({ usage: 'vertex', data, label: `${building.name}-portal-vertices` }), indexBuffer: this.backend.createBuffer({ usage: 'index', data: new Uint16Array(indices), label: `${building.name}-portal-indices` }), indexCount: indices.length };
  }

  /** Debug view: every portal polygon as a flat, two-sided shape of one colour. Returns the triangles drawn. */
  drawPortals(viewProjection: Mat4, instances: readonly BuildingInstance[], colour: readonly [number, number, number] = PORTAL_DEBUG_COLOUR): number {
    const u = this.uniforms;
    let triangles = 0;
    for (const instance of instances) {
      const gpu = this.buildings.get(instance.building);
      if (!gpu) throw new Error(`building renderer: unknown building ${instance.building}`);
      if (!gpu.portals) continue;
      mat4.multiply(this.mvp, viewProjection, instance.matrix);
      u.set(this.mvp, 0);
      u.set(instance.matrix, 16);
      u.fill(0, 44, 56);
      u.set([BUILDING_DEBUG_MODE.groups, 0, 1, 0, colour[0], colour[1], colour[2], 0], 56);
      this.backend.draw({ pipeline: this.pipelineFor(COLLISION_VIEW_STATE), vertexBuffer: gpu.portals.vertexBuffer, indexBuffer: gpu.portals.indexBuffer, indexCount: gpu.portals.indexCount, firstIndex: 0, uniforms: u, textures: [gpu.textures[0]!] });
      triangles += gpu.portals.indexCount / 3;
    }
    return triangles;
  }

  private ensureLiquidFrames(type: LiquidType): void {
    if (this.liquidFrameTextures.has(type)) return;
    this.liquidFrameTextures.set(type, liquidFrames(type, LIQUID_MATERIALS[type], this.liquidFrameStyle).map((image) => this.backend.createTexture({ width: image.width, height: image.height, data: image.data, wrap: 'repeat', filter: 'linear', mipmaps: true, label: `${this.label}-liquid-${type}` })));
  }

  private uploadLiquid(building: Building, group: Building['groups'][number]): GpuGroup['liquid'] {
    if (!group.liquid) return null;
    const geometry = buildBuildingLiquidGeometry(group.liquid, this.unitsPerYard);
    if (!geometry.type || geometry.wetTiles === 0) return null;
    this.ensureLiquidFrames(geometry.type);
    return {
      type: geometry.type,
      vertexBuffer: this.backend.createBuffer({ usage: 'vertex', data: geometry.vertices, label: `${building.name}-${group.name}-liquid-vertices` }),
      indexBuffer: this.backend.createBuffer({ usage: 'index', data: geometry.indices, label: `${building.name}-${group.name}-liquid-indices` }),
      indexCount: geometry.indices.length,
    };
  }

  private pipelineFor(state: BuildingMaterialState): PipelineHandle {
    const key = `${state.blend}/${state.cullMode}/${state.depthWrite ? 'write' : 'keep'}`;
    let pipeline = this.pipelines.get(key);
    if (pipeline === undefined) {
      pipeline = this.backend.createPipeline({ shader: BUILDING_SHADER, vertexLayout: BUILDING_VERTEX_LAYOUT, uniformBytes: BUILDING_UNIFORM_BYTES, textureCount: 1, blend: state.blend, cullMode: state.cullMode, depthWrite: state.depthWrite, label: `${this.label}-${key}` });
      this.pipelines.set(key, pipeline);
    }
    return pipeline;
  }

  addBuilding(building: Building): BuildingId {
    validateBuilding(building);
    const textures = building.textures.map((texture) => this.backend.createTexture({ width: texture.width, height: texture.height, data: texture.data, wrap: 'repeat', filter: 'linear', mipmaps: true, label: texture.name }));
    const states = building.materials.map(buildingMaterialState);
    const collisionBuffer = (group: Building['groups'][number], kind: CollisionKind): GpuGroup['collision'][CollisionKind] => {
      const indices = collisionIndices(group, kind);
      return indices.length === 0 ? null : { buffer: this.backend.createBuffer({ usage: 'index', data: indices, label: `${building.name}-${group.name}-${kind}-collision` }), indexCount: indices.length };
    };
    const groups = building.groups.map((group): GpuGroup => ({
      vertexBuffer: this.backend.createBuffer({ usage: 'vertex', data: packBuildingGroup(group), label: `${building.name}-${group.name}-vertices` }),
      indexBuffer: this.backend.createBuffer({ usage: 'index', data: group.indices, label: `${building.name}-${group.name}-indices` }),
      interior: groupIsInterior(group.flags),
      collision: { player: collisionBuffer(group, 'player'), camera: collisionBuffer(group, 'camera') },
      liquid: this.uploadLiquid(building, group),
      batches: group.batches.map((batch) => {
        const state = states[batch.material]!;
        return { firstIndex: batch.firstIndex, indexCount: batch.indexCount, state, pipeline: this.pipelineFor(state), texture: textures[building.materials[batch.material]!.textures[0]!]!, batchClass: batch.batchClass, lightingPath: batchLightingPath(group.flags, batch.batchClass) };
      }),
    }));
    const id = this.nextId++;
    this.buildings.set(id, { building, textures, groups, portals: this.uploadPortals(building) });
    return id as BuildingId;
  }

  removeBuilding(id: BuildingId): boolean {
    const gpu = this.buildings.get(id);
    if (!gpu) return false;
    for (const group of gpu.groups) {
      this.backend.destroyBuffer(group.vertexBuffer);
      this.backend.destroyBuffer(group.indexBuffer);
      for (const set of Object.values(group.collision)) if (set) this.backend.destroyBuffer(set.buffer);
      if (group.liquid) {
        this.backend.destroyBuffer(group.liquid.vertexBuffer);
        this.backend.destroyBuffer(group.liquid.indexBuffer);
      }
    }
    if (gpu.portals) {
      this.backend.destroyBuffer(gpu.portals.vertexBuffer);
      this.backend.destroyBuffer(gpu.portals.indexBuffer);
    }
    for (const texture of gpu.textures) this.backend.destroyTexture(texture);
    this.buildings.delete(id);
    return true;
  }

  get buildingCount(): number {
    return this.buildings.size;
  }

  setLighting(lighting: TerrainLighting): void {
    lightingUniforms(lighting); // validates
    this.lighting = lighting;
  }

  /** null removes the fog. */
  setFog(fog: TerrainFog | null): void {
    if (fog) validateTerrainFog(fog);
    this.fog = fog;
  }

  /** Must be called between beginFrame() and endFrame(). */
  draw(viewProjection: Mat4, instances: readonly BuildingInstance[], options: BuildingDrawOptions): { readonly groups: number; readonly draws: number; readonly triangles: number } {
    const u = this.uniforms;
    lightingUniforms(this.lighting, this.lightScratch);
    u.set(this.lightScratch.subarray(0, 3), 32);
    u[35] = 0;
    u.set(this.lightScratch.subarray(4, 12), 36);
    const fog = options.eye ? this.fog : null;
    if (fog && options.eye) u.set([options.eye[0]!, options.eye[1]!, options.eye[2]!, 0, fog.color[0], fog.color[1], fog.color[2], 0, fog.start, 1 / (fog.end - fog.start), 0, 0], 44);
    else u.fill(0, 44, 56);
    let groups = 0, draws = 0, triangles = 0;
    for (const transparent of options.pass === 'opaque' ? [false] : options.pass === 'blended' ? [true] : [false, true]) {
      for (const instance of instances) {
        const gpu = this.buildings.get(instance.building);
        if (!gpu) throw new Error(`building renderer: unknown building ${instance.building}`);
        mat4.multiply(this.mvp, viewProjection, instance.matrix);
        u.set(this.mvp, 0);
        u.set(instance.matrix, 16);
        gpu.groups.forEach((group, index) => {
          if (instance.visibleGroups && !instance.visibleGroups.has(index)) return;
          if (!transparent) groups++;
          if (options.collision) {
            const set = group.collision[options.collision];
            if (transparent || !set) return;
            const colour = GROUP_DEBUG_COLOURS[index % GROUP_DEBUG_COLOURS.length]!;
            u.set([BUILDING_DEBUG_MODE.groups, 0, 1, 0, colour[0], colour[1], colour[2], 0], 56);
            this.backend.draw({ pipeline: this.pipelineFor(COLLISION_VIEW_STATE), vertexBuffer: group.vertexBuffer, indexBuffer: set.buffer, indexCount: set.indexCount, firstIndex: 0, uniforms: u, textures: [gpu.textures[0]!] });
            draws++;
            triangles += set.indexCount / 3;
            return;
          }
          for (const batch of group.batches) {
            if (batch.state.transparent !== transparent) continue;
            const debug = options.debugMode === 'groups' ? GROUP_DEBUG_COLOURS[index % GROUP_DEBUG_COLOURS.length]! : options.debugMode === 'classes' ? CLASS_DEBUG_COLOURS[batch.batchClass] : [0, 0, 0];
            u.set([BUILDING_DEBUG_MODE[options.debugMode], batch.lightingPath, batch.state.unlit ? 1 : 0, batch.state.alphaReference, debug[0], debug[1], debug[2], 0], 56);
            this.backend.draw({ pipeline: batch.pipeline, vertexBuffer: group.vertexBuffer, indexBuffer: group.indexBuffer, indexCount: batch.indexCount, firstIndex: batch.firstIndex, uniforms: u, textures: [batch.texture] });
            draws++;
            triangles += batch.indexCount / 3;
          }
        });
      }
    }
    return { groups, draws, triangles };
  }

  /**
   * Draws the liquid surfaces of the VISIBLE groups (spec §166), one pass per liquid class: the opaque classes
   * first, then the blended ones. Call it after the opaque geometry (and the props) of the frame.
   * An exterior group's liquid is lit like flat ground under the sun; an interior group's is full-bright
   * (OUR CHOICE, until the interior lighting step).
   */
  drawLiquids(viewProjection: Mat4, instances: readonly BuildingInstance[], options: BuildingLiquidDrawOptions): { readonly surfaces: number; readonly draws: number; readonly triangles: number; readonly frame: number } {
    const u = this.liquidUniforms, frame = liquidFrameAt(options.timeMs);
    let surfaces = 0, draws = 0, triangles = 0;
    const sun = terrainLight(this.lighting, [0, 0, 1]);
    for (const type of LIQUID_PASS_ORDER) {
      const frames = this.liquidFrameTextures.get(type);
      if (!frames) continue;
      const material = LIQUID_MATERIALS[type];
      for (const instance of instances) {
        const gpu = this.buildings.get(instance.building);
        if (!gpu) throw new Error(`building renderer: unknown building ${instance.building}`);
        mat4.multiply(this.mvp, viewProjection, instance.matrix);
        u.set(this.mvp, 0);
        // The vertices stay in the building's space (the texture is anchored there): so must the eye, for the fog.
        const fogged = this.fog && options.eye && material.fogged && mat4.invert(this.inverse, instance.matrix);
        if (fogged && this.fog && options.eye) {
          const m = this.inverse, e = options.eye;
          u.set([m[0]! * e[0]! + m[4]! * e[1]! + m[8]! * e[2]! + m[12]!, m[1]! * e[0]! + m[5]! * e[1]! + m[9]! * e[2]! + m[13]!, m[2]! * e[0]! + m[6]! * e[1]! + m[10]! * e[2]! + m[14]!, 0, this.fog.color[0], this.fog.color[1], this.fog.color[2], 0, this.fog.start, 1 / (this.fog.end - this.fog.start), 0, 0], 20);
        } else u.fill(0, 20, 32);
        u[32] = this.liquidUvPerUnit;
        u[33] = 0;
        u[34] = 0; // no depth response: the grid knows no ground under it
        gpu.groups.forEach((group, index) => {
          if (!group.liquid || group.liquid.type !== type || (instance.visibleGroups && !instance.visibleGroups.has(index))) return;
          u.set(liquidTint(material, group.interior ? [1, 1, 1] : sun), 16);
          this.backend.draw({ pipeline: material.blend === 'opaque' ? this.liquidOpaquePipeline : this.liquidPipeline, vertexBuffer: group.liquid.vertexBuffer, indexBuffer: group.liquid.indexBuffer, indexCount: group.liquid.indexCount, uniforms: u, textures: [frames[frame]!] });
          surfaces++;
          draws++;
          triangles += group.liquid.indexCount / 3;
        });
      }
    }
    return { surfaces, draws, triangles, frame };
  }

  dispose(): void {
    for (const id of [...this.buildings.keys()]) this.removeBuilding(id as BuildingId);
    for (const textures of this.liquidFrameTextures.values()) for (const texture of textures) this.backend.destroyTexture(texture);
    this.liquidFrameTextures.clear();
    this.backend.destroyPipeline(this.liquidPipeline);
    this.backend.destroyPipeline(this.liquidOpaquePipeline);
    for (const pipeline of this.pipelines.values()) this.backend.destroyPipeline(pipeline);
    this.pipelines.clear();
  }
}
