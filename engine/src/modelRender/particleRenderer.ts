import type { Mat4 } from '../math';
import { type ModelTexture, PARTICLE_VERTEX_FLOATS, particleQuadIndices, type ParticleSystem } from '../model';
import { type BufferHandle, PARTICLE_SHADER, PARTICLE_UNIFORM_BYTES, PARTICLE_VERTEX_LAYOUT, type PipelineHandle, type RendererBackend, type TextureHandle } from '../renderer';

/**
 * Draws one particle system (P4.8): its live particles are expanded on the CPU into camera-facing quads
 * (as the original does, spec §89 step 6), written into ONE vertex buffer that is updated every frame, and
 * drawn in one call.
 *
 * OUR CHOICES: CPU expansion + a buffer update per frame rather than GPU instancing (the backend has no
 * instanced draw yet — the document recommends instancing « whenever possible »; this is the simple first
 * version); particles test the depth buffer and only an 'opaque' emitter writes it; alpha-blended particles
 * are sorted far to near, additive and multiplying ones are not (their result does not depend on the order).
 */
export class ParticleRenderer {
  private readonly pipeline: PipelineHandle;
  private readonly vertexBuffer: BufferHandle;
  private readonly indexBuffer: BufferHandle;
  private readonly texture: TextureHandle;
  private readonly vertices: Float32Array;

  constructor(private readonly backend: RendererBackend, readonly system: ParticleSystem, texture: ModelTexture, label = 'particles') {
    const blend = system.emitter.blend;
    this.vertices = new Float32Array(system.capacity * 4 * PARTICLE_VERTEX_FLOATS);
    this.pipeline = backend.createPipeline({ shader: PARTICLE_SHADER, vertexLayout: PARTICLE_VERTEX_LAYOUT, uniformBytes: PARTICLE_UNIFORM_BYTES, textureCount: 1, blend, cullMode: 'none', depthWrite: blend === 'opaque', label: `${label}-${blend}` });
    this.vertexBuffer = backend.createBuffer({ usage: 'vertex', data: this.vertices, label: `${label}-vertices` });
    this.indexBuffer = backend.createBuffer({ usage: 'index', data: particleQuadIndices(system.capacity), label: `${label}-indices` });
    this.texture = backend.createTexture({ width: texture.width, height: texture.height, data: texture.data, wrap: 'clamp', filter: 'linear', mipmaps: true, label: texture.name });
  }

  /**
   * Must be called between beginFrame() and endFrame(), after the opaque geometry.
   * @param cameraRight, cameraUp unit vectors of the camera, in world space
   * @returns the number of particles drawn
   */
  draw(viewProjection: Mat4, cameraRight: ArrayLike<number>, cameraUp: ArrayLike<number>, eye: ArrayLike<number>): number {
    const count = this.system.writeQuads(this.vertices, cameraRight, cameraUp, this.system.emitter.blend === 'alpha' ? { eye } : undefined);
    if (count === 0) return 0;
    this.backend.updateBuffer(this.vertexBuffer, this.vertices.subarray(0, count * 4 * PARTICLE_VERTEX_FLOATS));
    this.backend.draw({ pipeline: this.pipeline, vertexBuffer: this.vertexBuffer, indexBuffer: this.indexBuffer, indexCount: count * 6, uniforms: viewProjection, textures: [this.texture] });
    return count;
  }

  dispose(): void {
    this.backend.destroyBuffer(this.vertexBuffer);
    this.backend.destroyBuffer(this.indexBuffer);
    this.backend.destroyTexture(this.texture);
    this.backend.destroyPipeline(this.pipeline);
  }
}
