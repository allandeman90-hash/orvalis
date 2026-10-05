import type { Mat4 } from '../math';
import { type ModelTexture, RIBBON_VERTEX_FLOATS, ribbonStripIndices, type RibbonTrail } from '../model';
import { type BufferHandle, PARTICLE_SHADER, PARTICLE_UNIFORM_BYTES, PARTICLE_VERTEX_LAYOUT, type PipelineHandle, type RendererBackend, type TextureHandle } from '../renderer';

/**
 * Draws one ribbon trail (P4.8b): its edges become one strip of quads in a vertex buffer updated every frame,
 * drawn in one call with the particle shader (texture × colour, no light, no fog). Both sides are visible;
 * the depth buffer is tested, not written.
 */
export class RibbonRenderer {
  private readonly pipeline: PipelineHandle;
  private readonly vertexBuffer: BufferHandle;
  private readonly indexBuffer: BufferHandle;
  private readonly texture: TextureHandle;
  private readonly vertices: Float32Array;

  constructor(private readonly backend: RendererBackend, readonly trail: RibbonTrail, texture: ModelTexture, label = 'ribbon') {
    const edges = trail.capacity + 1; // + the head
    this.vertices = new Float32Array(edges * 2 * RIBBON_VERTEX_FLOATS);
    this.pipeline = backend.createPipeline({ shader: PARTICLE_SHADER, vertexLayout: PARTICLE_VERTEX_LAYOUT, uniformBytes: PARTICLE_UNIFORM_BYTES, textureCount: 1, blend: trail.emitter.blend, cullMode: 'none', depthWrite: false, label: `${label}-${trail.emitter.blend}` });
    this.vertexBuffer = backend.createBuffer({ usage: 'vertex', data: this.vertices, label: `${label}-vertices` });
    this.indexBuffer = backend.createBuffer({ usage: 'index', data: ribbonStripIndices(edges), label: `${label}-indices` });
    this.texture = backend.createTexture({ width: texture.width, height: texture.height, data: texture.data, wrap: 'clamp', filter: 'linear', mipmaps: true, label: texture.name });
  }

  /** Must be called between beginFrame() and endFrame(), after the opaque geometry. Returns the quads drawn. */
  draw(viewProjection: Mat4): number {
    const vertices = this.trail.writeStrip(this.vertices);
    if (vertices < 4) return 0;
    this.backend.updateBuffer(this.vertexBuffer, this.vertices.subarray(0, vertices * RIBBON_VERTEX_FLOATS));
    const quads = vertices / 2 - 1;
    this.backend.draw({ pipeline: this.pipeline, vertexBuffer: this.vertexBuffer, indexBuffer: this.indexBuffer, indexCount: quads * 6, uniforms: viewProjection, textures: [this.texture] });
    return quads;
  }

  dispose(): void {
    this.backend.destroyBuffer(this.vertexBuffer);
    this.backend.destroyBuffer(this.indexBuffer);
    this.backend.destroyTexture(this.texture);
    this.backend.destroyPipeline(this.pipeline);
  }
}
