import { DepthRange } from '../math';
import {
  assertValidSize,
  type BackendInfo,
  type BufferDescriptor,
  type BufferHandle,
  type ClearColor,
  type DrawCall,
  FrameGuard,
  type FrameStats,
  type PipelineDescriptor,
  type PipelineHandle,
  type RendererBackend,
  resolvePipelineState,
  type ResolvedPipelineState,
  type ResolvedTexture,
  resolveTexture,
  type TextureDescriptor,
  type TextureHandle,
  validateBufferUpdate,
  validateDrawCall,
  validateVertexLayout,
} from './backend';

/** One entry of the call log kept by the null backend. */
export type NullBackendEvent =
  | { readonly type: 'resize'; readonly width: number; readonly height: number }
  | { readonly type: 'beginFrame'; readonly clear: ClearColor }
  | { readonly type: 'draw'; readonly call: DrawCall; readonly triangles: number }
  | { readonly type: 'endFrame'; readonly stats: FrameStats };

interface NullPipeline {
  readonly desc: PipelineDescriptor;
  readonly state: ResolvedPipelineState;
}

/**
 * Backend that draws nothing. It enforces the same contract as the real
 * backends (handle lifetime, frame bracketing, draw bounds) and records what
 * it was asked to do, so renderer logic can be unit-tested without a GPU.
 */
export class NullBackend implements RendererBackend {
  readonly info: BackendInfo = { kind: 'null', depthRange: DepthRange.ZeroToOne };
  readonly events: NullBackendEvent[] = [];
  width = 0;
  height = 0;

  private nextHandle = 1;
  private readonly buffers = new Map<number, BufferDescriptor>();
  private readonly pipelines = new Map<number, NullPipeline>();
  private readonly textures = new Map<number, ResolvedTexture>();
  private readonly frame = new FrameGuard();

  /** Test inspection: the data a live buffer was created with. */
  bufferData(handle: BufferHandle): BufferDescriptor['data'] {
    const desc = this.buffers.get(handle);
    if (!desc) throw new Error(`renderer: unknown or destroyed buffer ${handle}`);
    return desc.data;
  }

  get liveTextureCount(): number {
    return this.textures.size;
  }

  /** Test inspection: a live texture with its defaults applied and its mip levels. */
  textureInfo(handle: TextureHandle): ResolvedTexture {
    const texture = this.textures.get(handle);
    if (!texture) throw new Error(`renderer: unknown or destroyed texture ${handle}`);
    return texture;
  }

  createTexture(desc: TextureDescriptor): TextureHandle {
    this.frame.assertUsable('createTexture');
    const handle = this.nextHandle++;
    this.textures.set(handle, resolveTexture(desc));
    return handle as TextureHandle;
  }

  destroyTexture(handle: TextureHandle): void {
    this.frame.assertUsable('destroyTexture');
    if (!this.textures.delete(handle)) throw new Error(`renderer: unknown or destroyed texture ${handle}`);
  }

  get liveBufferCount(): number {
    return this.buffers.size;
  }

  get livePipelineCount(): number {
    return this.pipelines.size;
  }

  /** Resolved state (defaults applied) of a live pipeline, for tests. */
  pipelineState(handle: PipelineHandle): ResolvedPipelineState | undefined {
    return this.pipelines.get(handle)?.state;
  }

  resize(width: number, height: number): void {
    this.frame.assertUsable('resize');
    assertValidSize(width, height);
    this.width = width;
    this.height = height;
    this.events.push({ type: 'resize', width, height });
  }

  createBuffer(desc: BufferDescriptor): BufferHandle {
    this.frame.assertUsable('createBuffer');
    if (desc.data.byteLength === 0) throw new Error('renderer: cannot create an empty buffer');
    if (desc.usage === 'index' && !(desc.data instanceof Uint16Array)) throw new Error('renderer: index buffers must be Uint16Array');
    if (desc.data instanceof Uint8Array && desc.usage !== 'vertex') throw new Error('renderer: byte buffers (Uint8Array) are for vertices only');
    const handle = this.nextHandle++;
    this.buffers.set(handle, desc);
    return handle as BufferHandle;
  }

  /** Number of updateBuffer() calls, for tests. */
  bufferUpdates = 0;

  updateBuffer(handle: BufferHandle, data: BufferDescriptor['data']): void {
    this.frame.assertUsable('updateBuffer');
    const desc = this.buffers.get(handle);
    if (!desc) throw new Error(`renderer: unknown or destroyed buffer ${handle}`);
    validateBufferUpdate(desc.usage, desc.data.byteLength, data);
    if (data.constructor !== desc.data.constructor) throw new Error('renderer: a buffer must be updated with the same kind of array it was created with');
    // Keeps its own copy, like a GPU would: the caller may reuse `data`.
    const copy = desc.data.slice();
    (copy as Uint8Array).set(data);
    this.buffers.set(handle, { ...desc, data: copy });
    this.bufferUpdates++;
  }

  destroyBuffer(handle: BufferHandle): void {
    this.frame.assertUsable('destroyBuffer');
    if (!this.buffers.delete(handle)) throw new Error(`renderer: unknown or destroyed buffer ${handle}`);
  }

  createPipeline(desc: PipelineDescriptor): PipelineHandle {
    this.frame.assertUsable('createPipeline');
    validateVertexLayout(desc.vertexLayout);
    const state = resolvePipelineState(desc);
    const { wgsl, glslVertex, glslFragment } = desc.shader;
    if (!wgsl.trim() || !glslVertex.trim() || !glslFragment.trim()) {
      throw new Error('renderer: a pipeline needs WGSL, GLSL vertex and GLSL fragment sources');
    }
    const handle = this.nextHandle++;
    this.pipelines.set(handle, { desc, state });
    return handle as PipelineHandle;
  }

  destroyPipeline(handle: PipelineHandle): void {
    this.frame.assertUsable('destroyPipeline');
    if (!this.pipelines.delete(handle)) throw new Error(`renderer: unknown or destroyed pipeline ${handle}`);
  }

  beginFrame(clear: ClearColor): void {
    this.frame.begin();
    this.events.push({ type: 'beginFrame', clear });
  }

  draw(call: DrawCall): void {
    this.frame.assertInFrame();
    const pipeline = this.pipelines.get(call.pipeline);
    if (!pipeline) throw new Error(`renderer: unknown or destroyed pipeline ${call.pipeline}`);
    const buffer = this.buffers.get(call.vertexBuffer);
    if (!buffer) throw new Error(`renderer: unknown or destroyed buffer ${call.vertexBuffer}`);
    if (buffer.usage !== 'vertex') throw new Error(`renderer: buffer ${call.vertexBuffer} has usage "${buffer.usage}", expected "vertex"`);
    let indexBufferBytes: number | undefined;
    if (call.indexBuffer !== undefined) {
      const index = this.buffers.get(call.indexBuffer);
      if (!index) throw new Error(`renderer: unknown or destroyed buffer ${call.indexBuffer}`);
      if (index.usage !== 'index') throw new Error(`renderer: buffer ${call.indexBuffer} has usage "${index.usage}", expected "index"`);
      indexBufferBytes = index.data.byteLength;
    }
    const triangles = validateDrawCall(call, {
      vertexBufferBytes: buffer.data.byteLength,
      stride: pipeline.desc.vertexLayout.stride,
      ...(indexBufferBytes !== undefined ? { indexBufferBytes } : {}),
      uniformBytes: pipeline.state.uniformBytes,
      topology: pipeline.state.topology,
      textureCount: pipeline.state.textureCount,
    });
    for (const t of call.textures ?? []) if (!this.textures.has(t)) throw new Error(`renderer: unknown or destroyed texture ${t}`);
    this.frame.count(triangles);
    // Like a real backend, read the uniforms NOW: the caller may overwrite its array right after draw() returns.
    this.events.push({ type: 'draw', call: call.uniforms ? { ...call, uniforms: call.uniforms.slice() } : call, triangles });
  }

  endFrame(): FrameStats {
    const stats: FrameStats = this.frame.end();
    this.events.push({ type: 'endFrame', stats });
    return stats;
  }

  dispose(): void {
    this.buffers.clear();
    this.pipelines.clear();
    this.textures.clear();
    this.frame.dispose();
  }
}
