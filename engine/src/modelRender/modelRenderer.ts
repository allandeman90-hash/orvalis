import { mat4, type Mat4 } from '../math';
import { FOG_POLICY_COLOUR, type MaterialState, materialState, MODEL_VERTEX_LAYOUT, type ModelBounds, modelBounds, modelDistanceFade, modelMaterials, type ModelMesh, modelSubmeshes, type ModelTexture, packModelVertices } from '../model';
import { type BufferHandle, MODEL_DEBUG_MODE, MODEL_MATERIAL_OFFSET_FLOATS, MODEL_PALETTE_BONES, MODEL_PALETTE_OFFSET_FLOATS, MODEL_SHADER, MODEL_UNIFORM_BYTES, MODEL_UNIFORM_FLOATS, type ModelDebugMode, type PipelineHandle, type RendererBackend, type TextureHandle } from '../renderer';
import { DEFAULT_TERRAIN_LIGHTING, lightingUniforms, type TerrainFog, type TerrainLighting, validateTerrainFog } from '../terrainRender';

declare const modelBrand: unique symbol;
/** A model uploaded to a ModelRenderer. */
export type ModelId = number & { readonly [modelBrand]: true };

export interface ModelInstance {
  readonly model: ModelId;
  /** Model → world. Rotation, translation and UNIFORM scale only (see the shader). */
  readonly matrix: Mat4;
  /**
   * The matrix palette of this instance: 16 floats per bone of the model (see computeBoneMatrices()).
   * Without it the model is drawn in its rest pose.
   */
  readonly palette?: Float32Array | undefined;
  /** Geoset ids NOT drawn for this instance (spec §31: geoset ids switch sections on and off). */
  readonly hiddenGeosets?: ReadonlySet<number> | undefined;
  /**
   * Multiplies the texture's alpha (spec §80: textureAlpha × materialAlpha). 0..1, default 1. Below 1 the whole
   * instance is drawn in the blended pass (like a distance fade); at 0 it is not drawn.
   */
  readonly alpha?: number | undefined;
  /**
   * A flat light for this instance instead of the scene's sun: the model is lit by this colour alone, from every
   * side (ambient = light, no diffuse). For a prop standing in a building's interior (P6.7). 0..1 each.
   */
  readonly light?: readonly [number, number, number] | undefined;
}

export interface ModelDrawOptions {
  readonly debugMode: ModelDebugMode;
  /** Camera position, for the fog; without it models are drawn unfogged. */
  readonly eye?: ArrayLike<number> | undefined;
  /**
   * Fades models out with distance, by size (spec §94); needs `eye`. An instance whose fade is 0 is not drawn.
   * Absent: no distance fade.
   */
  readonly distanceFade?: { readonly unitsPerYard: number } | undefined;
}

interface GpuModel {
  readonly mesh: ModelMesh;
  readonly vertexBuffer: BufferHandle;
  readonly indexBuffer: BufferHandle;
  readonly texture: TextureHandle;
  readonly indexCount: number;
  readonly batches: readonly Batch[];
  readonly bounds: ModelBounds;
}

/** One submesh, ready to draw. */
interface Batch {
  readonly geosetId: number;
  readonly firstIndex: number;
  readonly indexCount: number;
  readonly state: MaterialState;
  readonly pipeline: PipelineHandle;
  /**
   * State used while the model is fading (its pipeline is created the first time it is needed) (spec §95: « the corresponding blended rendering path »): the same
   * state with alpha blending for an opaque or cutout surface; the normal pipeline for the others.
   */
  readonly fadingState: MaterialState;
}

/**
 * Draws models: one vertex buffer, one index buffer and one texture per model, one draw per instance.
 * Skinned on the GPU (P4.5): each instance may bring its own matrix palette, sent with the other uniforms.
 * Lit like the terrain (same light, same fog), so a model sits in the same world.
 * Materials (P4.6): one draw per visible submesh of each instance. Opaque and cutout submeshes of every instance
 * come first, then the blended ones, in the order given — they are NOT sorted by distance.
 * Distance fade (P4.9): an instance that is fading is drawn entirely in the blended pass, with alpha blending
 * (it keeps writing depth where its material did), its alpha multiplied by the fade; at fade 0 it is skipped.
 */
export class ModelRenderer {
  /** One pipeline per render state in use: blending, culling, depth write. */
  private readonly pipelines = new Map<string, PipelineHandle>();
  private readonly models = new Map<number, GpuModel>();
  private readonly uniforms = new Float32Array(MODEL_UNIFORM_FLOATS);
  private readonly lightScratch = new Float32Array(12);
  private readonly mvp = mat4.create();
  private readonly restPalette = new Float32Array(MODEL_PALETTE_BONES * 16);
  private nextId = 1;
  private lighting: TerrainLighting = DEFAULT_TERRAIN_LIGHTING;
  private fog: TerrainFog | null = null;

  constructor(private readonly backend: RendererBackend, private readonly label = 'model') {
    for (let bone = 0; bone < MODEL_PALETTE_BONES; bone++) this.restPalette[bone * 16] = this.restPalette[bone * 16 + 5] = this.restPalette[bone * 16 + 10] = this.restPalette[bone * 16 + 15] = 1;
  }

  private pipelineFor(state: MaterialState): PipelineHandle {
    const key = `${state.blend}/${state.cullMode}/${state.depthWrite ? 'write' : 'keep'}`;
    let pipeline = this.pipelines.get(key);
    if (pipeline === undefined) {
      pipeline = this.backend.createPipeline({ shader: MODEL_SHADER, vertexLayout: MODEL_VERTEX_LAYOUT, uniformBytes: MODEL_UNIFORM_BYTES, textureCount: 1, blend: state.blend, cullMode: state.cullMode, depthWrite: state.depthWrite, label: `${this.label}-${key}` });
      this.pipelines.set(key, pipeline);
    }
    return pipeline;
  }

  /** Uploads a model. The mesh is validated; the texture is mip-mapped and repeats. */
  addModel(mesh: ModelMesh, texture: ModelTexture): ModelId {
    const vertices = packModelVertices(mesh); // validates
    if (mesh.boneCount > MODEL_PALETTE_BONES) throw new Error(`model renderer: "${mesh.name}" has ${mesh.boneCount} bones, the palette holds ${MODEL_PALETTE_BONES}`);
    const materials = modelMaterials(mesh).map(materialState);
    const batches = modelSubmeshes(mesh).map((submesh): Batch => {
      const state = materials[submesh.material]!;
      return { geosetId: submesh.geosetId, firstIndex: submesh.indexStart, indexCount: submesh.indexCount, state, pipeline: this.pipelineFor(state), fadingState: state.blend === 'opaque' ? { ...state, blend: 'alpha' } : state };
    });
    const id = this.nextId++;
    this.models.set(id, {
      mesh,
      vertexBuffer: this.backend.createBuffer({ usage: 'vertex', data: vertices, label: `${mesh.name}-vertices` }),
      indexBuffer: this.backend.createBuffer({ usage: 'index', data: mesh.indices, label: `${mesh.name}-indices` }),
      texture: this.backend.createTexture({ width: texture.width, height: texture.height, data: texture.data, wrap: 'repeat', filter: 'linear', mipmaps: true, label: texture.name }),
      indexCount: mesh.indices.length,
      batches,
      bounds: modelBounds(mesh),
    });
    return id as ModelId;
  }

  /** Replaces the texture of a model (a character whose composite was rebuilt). The old one is freed. */
  setModelTexture(id: ModelId, texture: ModelTexture): void {
    const model = this.models.get(id);
    if (!model) throw new Error(`model renderer: unknown model ${id}`);
    const next = this.backend.createTexture({ width: texture.width, height: texture.height, data: texture.data, wrap: 'repeat', filter: 'linear', mipmaps: true, label: texture.name });
    this.backend.destroyTexture(model.texture);
    this.models.set(id, { ...model, texture: next });
  }

  removeModel(id: ModelId): boolean {
    const model = this.models.get(id);
    if (!model) return false;
    this.backend.destroyBuffer(model.vertexBuffer);
    this.backend.destroyBuffer(model.indexBuffer);
    this.backend.destroyTexture(model.texture);
    this.models.delete(id);
    return true;
  }

  get modelCount(): number {
    return this.models.size;
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

  /** Draws the instances. Must be called between beginFrame() and endFrame(). Returns the triangles submitted. */
  draw(viewProjection: Mat4, instances: readonly ModelInstance[], options: ModelDrawOptions): { readonly instances: number; readonly triangles: number; readonly draws: number } {
    const u = this.uniforms;
    lightingUniforms(this.lighting, this.lightScratch);
    u.set(this.lightScratch.subarray(0, 3), 32); // unit toLight
    u[35] = 0;
    u.set(this.lightScratch.subarray(4, 12), 36); // ambient, diffuse
    const fog = options.eye ? this.fog : null;
    if (options.eye) u.set([options.eye[0]!, options.eye[1]!, options.eye[2]!, 0], 44);
    else u.fill(0, 44, 48);
    u.set([MODEL_DEBUG_MODE[options.debugMode], 0, 0, 0], 56);
    let triangles = 0, draws = 0;
    const fades = instances.map((instance) => this.fadeOf(instance, options));
    // Opaque and cutout first (they write depth), then everything that blends with what is behind it.
    for (const transparent of [false, true]) {
      for (let i = 0; i < instances.length; i++) {
        const instance = instances[i]!, fade = fades[i]!;
        const model = this.models.get(instance.model);
        if (!model) throw new Error(`model renderer: unknown model ${instance.model}`);
        if (!((instance.alpha ?? 1) >= 0 && (instance.alpha ?? 1) <= 1)) throw new Error(`model renderer: instance alpha must be in 0..1 (got ${instance.alpha})`);
        const alpha = (instance.alpha ?? 1) * fade;
        if (alpha === 0) continue; // faded out by distance, or made invisible (first person): nothing to draw
        // An instance that is partly transparent — by distance or by its own alpha — is drawn blended.
        const fading = alpha < 1;
        const bones = model.mesh.boneCount * 16;
        if (instance.palette && instance.palette.length !== bones) throw new Error(`model renderer: "${model.mesh.name}" needs a palette of ${bones} floats (got ${instance.palette.length})`);
        let prepared = false;
        for (const batch of model.batches) {
          if ((fading || batch.state.transparent) !== transparent || instance.hiddenGeosets?.has(batch.geosetId)) continue;
          if (!prepared) {
            mat4.multiply(this.mvp, viewProjection, instance.matrix);
            u.set(this.mvp, 0);
            u.set(instance.matrix, 16);
            // Only this model's bones are written: its vertices never refer to the entries after them.
            u.set(instance.palette ?? this.restPalette.subarray(0, bones), MODEL_PALETTE_OFFSET_FLOATS);
            if (instance.light) u.set([instance.light[0], instance.light[1], instance.light[2], 0, 0, 0, 0, 0], 36);
            else u.set(this.lightScratch.subarray(4, 12), 36);
            prepared = true;
          }
          const { state } = batch;
          // Fog (spec §83): towards the scene's colour, towards the colour that leaves the frame unchanged, or none.
          if (fog && state.fog !== 'none') {
            const colour = state.fog === 'scene' ? fog.color : FOG_POLICY_COLOUR[state.fog];
            u.set([colour[0], colour[1], colour[2], 0, fog.start, 1 / (fog.end - fog.start), 0, 0], 48);
          } else u.fill(0, 48, 56);
          u.set([state.unlit ? 1 : 0, state.alphaReference, alpha, 0], MODEL_MATERIAL_OFFSET_FLOATS);
          this.backend.draw({ pipeline: fading ? this.pipelineFor(batch.fadingState) : batch.pipeline, vertexBuffer: model.vertexBuffer, indexBuffer: model.indexBuffer, indexCount: batch.indexCount, firstIndex: batch.firstIndex, uniforms: u, textures: [model.texture] });
          triangles += batch.indexCount / 3;
          draws++;
        }
      }
    }
    return { instances: instances.length, triangles, draws };
  }

  /** Distance fade of an instance for these draw options: 1 when the fade is off. */
  fadeOf(instance: ModelInstance, options: Pick<ModelDrawOptions, 'eye' | 'distanceFade'>): number {
    if (!options.distanceFade) return 1;
    if (!options.eye) throw new Error('model renderer: the distance fade needs the camera position (eye)');
    const model = this.models.get(instance.model);
    if (!model) throw new Error(`model renderer: unknown model ${instance.model}`);
    const sphere = this.worldSphere(instance, model.bounds);
    return modelDistanceFade(options.eye, sphere.center, sphere.radius, options.distanceFade.unitsPerYard);
  }

  /** Bounding sphere of an instance in world space (its matrix is a rotation, a translation and a uniform scale). */
  private worldSphere(instance: ModelInstance, bounds: ModelBounds): { center: [number, number, number]; radius: number } {
    const m = instance.matrix, c = bounds.center;
    return {
      center: [m[0]! * c[0] + m[4]! * c[1] + m[8]! * c[2] + m[12]!, m[1]! * c[0] + m[5]! * c[1] + m[9]! * c[2] + m[13]!, m[2]! * c[0] + m[6]! * c[1] + m[10]! * c[2] + m[14]!],
      radius: bounds.radius * Math.hypot(m[0]!, m[1]!, m[2]!),
    };
  }

  dispose(): void {
    for (const id of [...this.models.keys()]) this.removeModel(id as ModelId);
    for (const pipeline of this.pipelines.values()) this.backend.destroyPipeline(pipeline);
    this.pipelines.clear();
  }
}
