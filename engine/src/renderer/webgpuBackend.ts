import { DepthRange } from '../math';
import {
  assertValidSize,
  type BackendInfo,
  BackendUnavailableError,
  type BufferDescriptor,
  type BufferHandle,
  type ClearColor,
  type DrawCall,
  FrameGuard,
  type FrameStats,
  type PipelineDescriptor,
  type PipelineHandle,
  type RendererBackend,
  type RendererDebug,
  resolvePipelineState,
  type ResolvedPipelineState,
  resolveTexture,
  type TextureDescriptor,
  type TextureHandle,
  type Rgba,
  validateDrawCall,
  validateVertexLayout,
  type VertexLayout,
  BLEND_FACTORS,
  validateBufferUpdate,
} from './backend';

interface GpuBufferEntry {
  readonly buffer: GPUBuffer;
  readonly usage: BufferDescriptor['usage'];
  readonly byteLength: number;
}

interface GpuTextureEntry {
  readonly texture: GPUTexture;
  readonly view: GPUTextureView;
  readonly sampler: GPUSampler;
}

interface GpuUniformSlot {
  /** null when the pipeline has no uniform block. */
  readonly buffer: GPUBuffer | null;
  bindGroup: GPUBindGroup;
  /** Texture handles the bind group was built with. */
  textureKey: string;
}

interface GpuPipelineEntry {
  readonly pipeline: GPURenderPipeline;
  readonly layout: VertexLayout;
  readonly state: ResolvedPipelineState;
  /**
   * One uniform buffer + bind group per draw of the current frame: every draw
   * keeps its own values until the frame is submitted. Grows on demand, reused
   * across frames.
   */
  readonly uniformSlots: GpuUniformSlot[];
  uniformSlotsUsed: number;
}

/** Depth buffer format shared by every pipeline (they all render in the same pass). */
const DEPTH_FORMAT: GPUTextureFormat = 'depth24plus';

/** WebGPU requires copy rows to be aligned on 256 bytes. */
const COPY_ROW_ALIGNMENT = 256;

/**
 * WebGPU backend (spec §253, preferred). Same contract as WebGL2: triangle
 * lists, indexed or not, one vertex buffer per draw, depth buffer, one uniform
 * block per pipeline.
 * Not handled yet: device loss/restore (see PROJECT_STATUS.md).
 */
export class WebGPUBackend implements RendererBackend, RendererDebug {
  readonly info: BackendInfo = { kind: 'webgpu', depthRange: DepthRange.ZeroToOne };

  private nextHandle = 1;
  private readonly buffers = new Map<number, GpuBufferEntry>();
  private readonly pipelines = new Map<number, GpuPipelineEntry>();
  private readonly textures = new Map<number, GpuTextureEntry>();
  private readonly frame = new FrameGuard();
  private readonly errors: string[] = [];

  private encoder: GPUCommandEncoder | null = null;
  private pass: GPURenderPassEncoder | null = null;
  /** Texture of the frame just rendered; valid until the browser presents it. */
  private frameTexture: GPUTexture | null = null;
  /** Depth buffer, recreated whenever the canvas size changes. */
  private depthTexture: GPUTexture | null = null;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly device: GPUDevice,
    private readonly context: GPUCanvasContext,
    private readonly format: GPUTextureFormat,
  ) {
    device.addEventListener('uncapturederror', (event) => {
      if (this.errors.length < 16) this.errors.push(`webgpu: ${event.error.message}`);
    });
    void device.lost.then((lost) => {
      // Device loss is only recorded for now; recovery arrives with the asset manager.
      if (lost.reason !== 'destroyed' && this.errors.length < 16) this.errors.push(`webgpu: device lost (${lost.reason}) ${lost.message}`);
    });
  }

  /**
   * Rejects with BackendUnavailableError when WebGPU cannot be used.
   * The adapter and device are requested BEFORE touching the canvas, so a
   * refusal at that stage leaves the canvas usable by another backend.
   */
  static async create(canvas: HTMLCanvasElement): Promise<WebGPUBackend> {
    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
    if (!gpu) throw new BackendUnavailableError('webgpu', 'navigator.gpu is missing (browser without WebGPU, or insecure context)');
    let adapter: GPUAdapter | null;
    try {
      adapter = await gpu.requestAdapter();
    } catch (e) {
      throw new BackendUnavailableError('webgpu', `requestAdapter failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!adapter) throw new BackendUnavailableError('webgpu', 'no WebGPU adapter available on this machine');
    let device: GPUDevice;
    try {
      device = await adapter.requestDevice();
    } catch (e) {
      throw new BackendUnavailableError('webgpu', `requestDevice failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    const context = canvas.getContext('webgpu');
    if (!context) {
      device.destroy();
      throw new BackendUnavailableError('webgpu', 'canvas.getContext("webgpu") returned null');
    }
    const format = gpu.getPreferredCanvasFormat();
    // COPY_SRC lets the debug readback copy the frame; it costs nothing when unused.
    context.configure({ device, format, alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    return new WebGPUBackend(canvas, device, context, format);
  }

  resize(width: number, height: number): void {
    this.frame.assertUsable('resize');
    assertValidSize(width, height);
    // The configured context follows the canvas size automatically.
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  createBuffer(desc: BufferDescriptor): BufferHandle {
    this.frame.assertUsable('createBuffer');
    const byteLength = desc.data.byteLength;
    if (byteLength === 0) throw new Error('renderer: cannot create an empty buffer');
    if (desc.usage === 'index' && !(desc.data instanceof Uint16Array)) throw new Error('renderer: index buffers must be Uint16Array');
    if (desc.data instanceof Uint8Array && desc.usage !== 'vertex') throw new Error('renderer: byte buffers (Uint8Array) are for vertices only');
    const usage =
      desc.usage === 'index' ? GPUBufferUsage.INDEX : desc.usage === 'uniform' ? GPUBufferUsage.UNIFORM : GPUBufferUsage.VERTEX;
    const buffer = this.device.createBuffer({
      label: desc.label ?? desc.usage,
      size: Math.ceil(byteLength / 4) * 4, // mapped buffers must be a multiple of 4 bytes
      usage: usage | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint8Array(buffer.getMappedRange()).set(new Uint8Array(desc.data.buffer, desc.data.byteOffset, byteLength));
    buffer.unmap();
    const handle = this.nextHandle++;
    this.buffers.set(handle, { buffer, usage: desc.usage, byteLength });
    return handle as BufferHandle;
  }

  updateBuffer(handle: BufferHandle, data: BufferDescriptor['data']): void {
    this.frame.assertUsable('updateBuffer');
    const entry = this.buffers.get(handle);
    if (!entry) throw new Error(`renderer: unknown or destroyed buffer ${handle}`);
    validateBufferUpdate(entry.usage, entry.byteLength, data);
    // writeBuffer needs a multiple of 4 bytes: a trailing partial word is padded with zeros.
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (data.byteLength % 4 === 0) this.device.queue.writeBuffer(entry.buffer, 0, bytes as Uint8Array<ArrayBuffer>);
    else {
      const padded = new Uint8Array(Math.ceil(data.byteLength / 4) * 4);
      padded.set(bytes);
      this.device.queue.writeBuffer(entry.buffer, 0, padded);
    }
  }

  destroyBuffer(handle: BufferHandle): void {
    this.frame.assertUsable('destroyBuffer');
    const entry = this.buffers.get(handle);
    if (!entry) throw new Error(`renderer: unknown or destroyed buffer ${handle}`);
    entry.buffer.destroy();
    this.buffers.delete(handle);
  }

  createTexture(desc: TextureDescriptor): TextureHandle {
    this.frame.assertUsable('createTexture');
    const resolved = resolveTexture(desc);
    const texture = this.device.createTexture({
      label: desc.label ?? 'texture',
      size: { width: resolved.width, height: resolved.height },
      format: 'rgba8unorm',
      mipLevelCount: resolved.levels.length,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    // Every level comes from the shared CPU mip chain: same texels as on WebGL2.
    resolved.levels.forEach((level, i) => {
      const width = Math.max(1, resolved.width >> i), height = Math.max(1, resolved.height >> i);
      this.device.queue.writeTexture({ texture, mipLevel: i }, level as Uint8Array<ArrayBuffer>, { bytesPerRow: width * 4, rowsPerImage: height }, { width, height });
    });
    const filter: GPUFilterMode = resolved.filter;
    const address: GPUAddressMode = resolved.wrap === 'repeat' ? 'repeat' : 'clamp-to-edge';
    const sampler = this.device.createSampler({ magFilter: filter, minFilter: filter, mipmapFilter: filter, addressModeU: address, addressModeV: address });
    const handle = this.nextHandle++;
    this.textures.set(handle, { texture, view: texture.createView(), sampler });
    return handle as TextureHandle;
  }

  destroyTexture(handle: TextureHandle): void {
    this.frame.assertUsable('destroyTexture');
    const entry = this.textures.get(handle);
    if (!entry) throw new Error(`renderer: unknown or destroyed texture ${handle}`);
    entry.texture.destroy();
    this.textures.delete(handle);
  }

  /**
   * Unlike WebGL2, WGSL compile errors are not thrown here: WebGPU reports
   * them asynchronously, so they surface through drainErrors().
   */
  createPipeline(desc: PipelineDescriptor): PipelineHandle {
    this.frame.assertUsable('createPipeline');
    validateVertexLayout(desc.vertexLayout);
    const state = resolvePipelineState(desc);
    const label = desc.label ?? 'pipeline';
    const module = this.device.createShaderModule({ label, code: desc.shader.wgsl });
    const pipeline = this.device.createRenderPipeline({
      label,
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: desc.vertexLayout.stride,
            attributes: desc.vertexLayout.attributes.map((a) => ({ shaderLocation: a.location, offset: a.offset, format: a.format })),
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.format,
            // Colour: the mode's equation (the factor names are WebGPU's own). Alpha: destination kept.
            ...(state.blend !== 'opaque'
              ? { blend: { color: { srcFactor: BLEND_FACTORS[state.blend].src, dstFactor: BLEND_FACTORS[state.blend].dst, operation: 'add' as const }, alpha: { srcFactor: 'zero' as const, dstFactor: 'one' as const, operation: 'add' as const } } }
              : {}),
          },
        ],
      },
      // Engine convention: counter-clockwise = front face.
      primitive: { topology: state.topology, frontFace: 'ccw', cullMode: state.topology === 'line-list' ? 'none' : state.cullMode },
      // Every pipeline declares the depth attachment of the shared pass; one that
      // neither tests nor writes simply ignores it.
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: state.depthWrite, depthCompare: state.depthTest ? 'less' : 'always' },
    });
    const handle = this.nextHandle++;
    this.pipelines.set(handle, { pipeline, layout: desc.vertexLayout, state, uniformSlots: [], uniformSlotsUsed: 0 });
    return handle as PipelineHandle;
  }

  destroyPipeline(handle: PipelineHandle): void {
    this.frame.assertUsable('destroyPipeline');
    const entry = this.pipelines.get(handle);
    if (!entry) throw new Error(`renderer: unknown or destroyed pipeline ${handle}`);
    for (const slot of entry.uniformSlots) slot.buffer?.destroy();
    this.pipelines.delete(handle);
  }

  beginFrame(clear: ClearColor): void {
    this.frame.begin();
    this.frameTexture = this.context.getCurrentTexture();
    const { width, height } = this.frameTexture;
    if (!this.depthTexture || this.depthTexture.width !== width || this.depthTexture.height !== height) {
      this.depthTexture?.destroy();
      this.depthTexture = this.device.createTexture({ label: 'depth', size: { width, height }, format: DEPTH_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    }
    for (const p of this.pipelines.values()) p.uniformSlotsUsed = 0;
    this.encoder = this.device.createCommandEncoder({ label: 'frame' });
    this.pass = this.encoder.beginRenderPass({
      label: 'main',
      colorAttachments: [
        {
          view: this.frameTexture.createView(),
          clearValue: { r: clear.r, g: clear.g, b: clear.b, a: clear.a },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: { view: this.depthTexture.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
  }

  draw(call: DrawCall): void {
    this.frame.assertInFrame();
    const pipeline = this.pipelines.get(call.pipeline);
    if (!pipeline) throw new Error(`renderer: unknown or destroyed pipeline ${call.pipeline}`);
    const buffer = this.buffers.get(call.vertexBuffer);
    if (!buffer) throw new Error(`renderer: unknown or destroyed buffer ${call.vertexBuffer}`);
    if (buffer.usage !== 'vertex') throw new Error(`renderer: buffer ${call.vertexBuffer} has usage "${buffer.usage}", expected "vertex"`);
    let index: GpuBufferEntry | undefined;
    if (call.indexBuffer !== undefined) {
      index = this.buffers.get(call.indexBuffer);
      if (!index) throw new Error(`renderer: unknown or destroyed buffer ${call.indexBuffer}`);
      if (index.usage !== 'index') throw new Error(`renderer: buffer ${call.indexBuffer} has usage "${index.usage}", expected "index"`);
    }
    const triangles = validateDrawCall(call, {
      vertexBufferBytes: buffer.byteLength,
      stride: pipeline.layout.stride,
      ...(index ? { indexBufferBytes: index.byteLength } : {}),
      uniformBytes: pipeline.state.uniformBytes,
      topology: pipeline.state.topology,
      textureCount: pipeline.state.textureCount,
    });

    const pass = this.pass!;
    pass.setPipeline(pipeline.pipeline);
    // The viewport's depth bounds map the pipeline's fragments to its slice of the depth buffer.
    pass.setViewport(0, 0, this.frameTexture!.width, this.frameTexture!.height, pipeline.state.depthRange[0], pipeline.state.depthRange[1]);
    if (call.uniforms || (call.textures?.length ?? 0) > 0) {
      const slot = this.bindSlot(pipeline, call.textures ?? []);
      // Uniform data never lives in a SharedArrayBuffer; the cast only satisfies the WebGPU typings.
      if (slot.buffer && call.uniforms) this.device.queue.writeBuffer(slot.buffer, 0, call.uniforms as Float32Array<ArrayBuffer>);
      pass.setBindGroup(0, slot.bindGroup);
    }
    pass.setVertexBuffer(0, buffer.buffer);
    if (index) {
      pass.setIndexBuffer(index.buffer, 'uint16');
      pass.drawIndexed(call.indexCount!, 1, call.firstIndex ?? 0, 0, 0);
    } else {
      pass.draw(call.vertexCount!, 1, call.firstVertex ?? 0, 0);
    }
    this.frame.count(triangles);
  }

  /**
   * Next free slot of the pipeline for this frame: its own uniform buffer (when
   * the pipeline has a uniform block) and a bind group holding that buffer and
   * the draw's textures. The bind group is rebuilt only when the textures differ
   * from the ones the slot was last used with.
   */
  private bindSlot(pipeline: GpuPipelineEntry, textures: readonly TextureHandle[]): GpuUniformSlot {
    const key = textures.join(',');
    const build = (buffer: GPUBuffer | null): GPUBindGroup => {
      const entries: GPUBindGroupEntry[] = [];
      if (buffer) entries.push({ binding: 0, resource: { buffer } });
      textures.forEach((handle, i) => {
        const entry = this.textures.get(handle);
        if (!entry) throw new Error(`renderer: unknown or destroyed texture ${handle}`);
        entries.push({ binding: 1 + 2 * i, resource: entry.view }, { binding: 2 + 2 * i, resource: entry.sampler });
      });
      return this.device.createBindGroup({ layout: pipeline.pipeline.getBindGroupLayout(0), entries });
    };
    let slot = pipeline.uniformSlots[pipeline.uniformSlotsUsed];
    if (!slot) {
      const buffer = pipeline.state.uniformBytes > 0 ? this.device.createBuffer({ label: 'globals', size: pipeline.state.uniformBytes, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }) : null;
      slot = { buffer, bindGroup: build(buffer), textureKey: key };
      pipeline.uniformSlots.push(slot);
    } else if (slot.textureKey !== key) {
      slot.bindGroup = build(slot.buffer);
      slot.textureKey = key;
    }
    pipeline.uniformSlotsUsed++;
    return slot;
  }

  endFrame(): FrameStats {
    const stats = this.frame.end();
    this.pass!.end();
    this.device.queue.submit([this.encoder!.finish()]);
    this.pass = null;
    this.encoder = null;
    return stats;
  }

  async readPixels(points: ReadonlyArray<readonly [number, number]>): Promise<Rgba[]> {
    this.frame.assertUsable('readPixels');
    const texture = this.frameTexture;
    if (!texture) throw new Error('renderer: readPixels needs a rendered frame');
    const { width, height } = texture;
    const bytesPerRow = Math.ceil((width * 4) / COPY_ROW_ALIGNMENT) * COPY_ROW_ALIGNMENT;
    const staging = this.device.createBuffer({
      label: 'readback',
      size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    // The copy is encoded and submitted synchronously, while the frame texture is still valid.
    const encoder = this.device.createCommandEncoder({ label: 'readback' });
    encoder.copyTextureToBuffer({ texture }, { buffer: staging, bytesPerRow, rowsPerImage: height }, { width, height });
    this.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const data = new Uint8Array(staging.getMappedRange());
    const bgra = this.format.startsWith('bgra');
    const out = points.map(([x, y]): Rgba => {
      const i = y * bytesPerRow + x * 4; // texture rows start at the top
      const a = data[i]!, b = data[i + 1]!, c = data[i + 2]!, d = data[i + 3]!;
      return bgra ? [c, b, a, d] : [a, b, c, d];
    });
    staging.unmap();
    staging.destroy();
    return out;
  }

  async drainErrors(): Promise<string[]> {
    // Validation errors are delivered after the GPU process has handled the queue.
    if (!this.frame.isDisposed) await this.device.queue.onSubmittedWorkDone();
    return this.errors.splice(0);
  }

  dispose(): void {
    if (this.frame.isDisposed) return;
    for (const b of this.buffers.values()) b.buffer.destroy();
    for (const p of this.pipelines.values()) for (const slot of p.uniformSlots) slot.buffer?.destroy();
    for (const t of this.textures.values()) t.texture.destroy();
    this.textures.clear();
    this.depthTexture?.destroy();
    this.depthTexture = null;
    this.buffers.clear();
    this.pipelines.clear();
    this.pass = null;
    this.encoder = null;
    this.frameTexture = null;
    this.context.unconfigure();
    this.device.destroy();
    this.frame.dispose();
  }
}
