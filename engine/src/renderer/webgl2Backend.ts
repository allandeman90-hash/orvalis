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
  resolveTexture,
  type TextureDescriptor,
  type TextureHandle,
  type ResolvedPipelineState,
  type Rgba,
  validateDrawCall,
  validateVertexLayout,
  VERTEX_FORMAT_COMPONENTS,
  type VertexLayout,
  BLEND_FACTORS,
  validateBufferUpdate,
} from './backend';

interface GlBuffer {
  readonly buffer: WebGLBuffer;
  readonly usage: BufferDescriptor['usage'];
  readonly byteLength: number;
}

interface GlTexture {
  readonly texture: WebGLTexture;
}

interface GlPipeline {
  readonly program: WebGLProgram;
  readonly layout: VertexLayout;
  readonly state: ResolvedPipelineState;
  /** Uniform buffer backing the `Globals` block, when the pipeline has one. */
  readonly uniformBuffer: WebGLBuffer | null;
  /** One vertex array object per (vertex buffer, index buffer) pair used with this pipeline. */
  readonly vaos: Map<string, WebGLVertexArrayObject>;
}

/** Binding point of the single uniform block, same number as the WebGPU binding. */
const GLOBALS_BINDING = 0;

function compile(gl: WebGL2RenderingContext, type: number, source: string, label: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('webgl2: createShader failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '(no log)';
    gl.deleteShader(shader);
    throw new Error(`webgl2: ${label} failed to compile: ${log}`);
  }
  return shader;
}

/**
 * WebGL2 fallback backend (spec §253). Triangle lists, indexed or not, one
 * vertex buffer per draw, depth buffer, one uniform block per pipeline.
 * Not handled yet: context loss/restore (see PROJECT_STATUS.md).
 */
export class WebGL2Backend implements RendererBackend, RendererDebug {
  readonly info: BackendInfo = { kind: 'webgl2', depthRange: DepthRange.NegOneToOne };

  private nextHandle = 1;
  private readonly buffers = new Map<number, GlBuffer>();
  private readonly pipelines = new Map<number, GlPipeline>();
  private readonly textures = new Map<number, GlTexture>();
  /** For each buffer, the vertex arrays that reference it (so that destroying a buffer does not scan them all). */
  private readonly vaoUses = new Map<number, Array<{ readonly pipeline: GlPipeline; readonly key: string }>>();
  private readonly frame = new FrameGuard();

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gl: WebGL2RenderingContext,
  ) {}

  /** Async for parity with WebGPU. Rejects with BackendUnavailableError when WebGL2 is not available. */
    // No multisampling: the WebGPU backend renders with 1 sample, and both backends must produce the same picture.
    // (MSAA, if wanted later, has to be added to both at the same time.)
  static async create(canvas: HTMLCanvasElement): Promise<WebGL2Backend> {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false });
    if (!gl) throw new BackendUnavailableError('webgl2', 'canvas.getContext("webgl2") returned null');
    return new WebGL2Backend(canvas, gl);
  }

  resize(width: number, height: number): void {
    this.frame.assertUsable('resize');
    assertValidSize(width, height);
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  createBuffer(desc: BufferDescriptor): BufferHandle {
    this.frame.assertUsable('createBuffer');
    if (desc.data.byteLength === 0) throw new Error('renderer: cannot create an empty buffer');
    if (desc.usage === 'index' && !(desc.data instanceof Uint16Array)) throw new Error('renderer: index buffers must be Uint16Array');
    if (desc.data instanceof Uint8Array && desc.usage !== 'vertex') throw new Error('renderer: byte buffers (Uint8Array) are for vertices only');
    const gl = this.gl;
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('webgl2: createBuffer failed');
    const target = desc.usage === 'index' ? gl.ELEMENT_ARRAY_BUFFER : desc.usage === 'uniform' ? gl.UNIFORM_BUFFER : gl.ARRAY_BUFFER;
    // An element buffer binding belongs to the bound VAO: make sure none is bound.
    gl.bindVertexArray(null);
    gl.bindBuffer(target, buffer);
    gl.bufferData(target, desc.data, gl.STATIC_DRAW);
    gl.bindBuffer(target, null);
    const handle = this.nextHandle++;
    this.buffers.set(handle, { buffer, usage: desc.usage, byteLength: desc.data.byteLength });
    return handle as BufferHandle;
  }

  updateBuffer(handle: BufferHandle, data: BufferDescriptor['data']): void {
    this.frame.assertUsable('updateBuffer');
    const entry = this.buffers.get(handle);
    if (!entry) throw new Error(`renderer: unknown or destroyed buffer ${handle}`);
    validateBufferUpdate(entry.usage, entry.byteLength, data);
    const gl = this.gl;
    const target = entry.usage === 'index' ? gl.ELEMENT_ARRAY_BUFFER : entry.usage === 'uniform' ? gl.UNIFORM_BUFFER : gl.ARRAY_BUFFER;
    gl.bindVertexArray(null);
    gl.bindBuffer(target, entry.buffer);
    gl.bufferSubData(target, 0, data);
    gl.bindBuffer(target, null);
  }

  destroyBuffer(handle: BufferHandle): void {
    this.frame.assertUsable('destroyBuffer');
    const entry = this.buffers.get(handle);
    if (!entry) throw new Error(`renderer: unknown or destroyed buffer ${handle}`);
    // Only the vertex arrays that reference this buffer (looked up directly: scanning every
    // vertex array of every pipeline made freeing a tile's 256 buffers take tens of milliseconds).
    for (const use of this.vaoUses.get(handle) ?? []) {
      const vao = use.pipeline.vaos.get(use.key);
      if (vao) {
        this.gl.deleteVertexArray(vao);
        use.pipeline.vaos.delete(use.key);
      }
    }
    this.vaoUses.delete(handle);
    this.gl.deleteBuffer(entry.buffer);
    this.buffers.delete(handle);
  }

  createTexture(desc: TextureDescriptor): TextureHandle {
    this.frame.assertUsable('createTexture');
    const resolved = resolveTexture(desc);
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error('webgl2: createTexture failed');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    // Every level comes from the shared CPU mip chain: same texels as on WebGPU.
    resolved.levels.forEach((level, i) => {
      gl.texImage2D(gl.TEXTURE_2D, i, gl.RGBA8, Math.max(1, resolved.width >> i), Math.max(1, resolved.height >> i), 0, gl.RGBA, gl.UNSIGNED_BYTE, level);
    });
    const mipped = resolved.levels.length > 1;
    const linear = resolved.filter === 'linear';
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, resolved.levels.length - 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipped ? (linear ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_NEAREST) : linear ? gl.LINEAR : gl.NEAREST);
    const wrap = resolved.wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.bindTexture(gl.TEXTURE_2D, null);
    const handle = this.nextHandle++;
    this.textures.set(handle, { texture });
    return handle as TextureHandle;
  }

  destroyTexture(handle: TextureHandle): void {
    this.frame.assertUsable('destroyTexture');
    const entry = this.textures.get(handle);
    if (!entry) throw new Error(`renderer: unknown or destroyed texture ${handle}`);
    this.gl.deleteTexture(entry.texture);
    this.textures.delete(handle);
  }

  createPipeline(desc: PipelineDescriptor): PipelineHandle {
    this.frame.assertUsable('createPipeline');
    validateVertexLayout(desc.vertexLayout);
    const state = resolvePipelineState(desc);
    const gl = this.gl;
    const label = desc.label ?? 'pipeline';
    const vs = compile(gl, gl.VERTEX_SHADER, desc.shader.glslVertex, `${label} vertex shader`);
    let fs: WebGLShader;
    try {
      fs = compile(gl, gl.FRAGMENT_SHADER, desc.shader.glslFragment, `${label} fragment shader`);
    } catch (e) {
      gl.deleteShader(vs);
      throw e;
    }
    const program = gl.createProgram();
    if (!program) throw new Error('webgl2: createProgram failed');
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    // Shaders stay alive through the program; the standalone objects can go.
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? '(no log)';
      gl.deleteProgram(program);
      throw new Error(`webgl2: ${label} failed to link: ${log}`);
    }
    let uniformBuffer: WebGLBuffer | null = null;
    if (state.uniformBytes > 0) {
      const blockIndex = gl.getUniformBlockIndex(program, 'Globals');
      if (blockIndex === gl.INVALID_INDEX) {
        gl.deleteProgram(program);
        throw new Error(`webgl2: ${label} declares uniformBytes but its GLSL has no uniform block named "Globals"`);
      }
      const blockBytes = gl.getActiveUniformBlockParameter(program, blockIndex, gl.UNIFORM_BLOCK_DATA_SIZE) as number;
      if (blockBytes !== state.uniformBytes) {
        gl.deleteProgram(program);
        throw new Error(`webgl2: ${label} uniform block is ${blockBytes} bytes in GLSL but uniformBytes says ${state.uniformBytes}`);
      }
      gl.uniformBlockBinding(program, blockIndex, GLOBALS_BINDING);
      uniformBuffer = gl.createBuffer();
      if (!uniformBuffer) throw new Error('webgl2: createBuffer failed');
      gl.bindBuffer(gl.UNIFORM_BUFFER, uniformBuffer);
      gl.bufferData(gl.UNIFORM_BUFFER, state.uniformBytes, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    }
    // Texture i is the sampler named u_texture<i>, permanently bound to texture unit i.
    gl.useProgram(program);
    for (let i = 0; i < state.textureCount; i++) {
      const location = gl.getUniformLocation(program, `u_texture${i}`);
      if (!location) {
        gl.deleteProgram(program);
        if (uniformBuffer) gl.deleteBuffer(uniformBuffer);
        throw new Error(`webgl2: ${label} declares ${state.textureCount} texture(s) but its GLSL does not use a sampler named "u_texture${i}"`);
      }
      gl.uniform1i(location, i);
    }
    gl.useProgram(null);
    const handle = this.nextHandle++;
    this.pipelines.set(handle, { program, layout: desc.vertexLayout, state, uniformBuffer, vaos: new Map() });
    return handle as PipelineHandle;
  }

  destroyPipeline(handle: PipelineHandle): void {
    this.frame.assertUsable('destroyPipeline');
    const entry = this.pipelines.get(handle);
    if (!entry) throw new Error(`renderer: unknown or destroyed pipeline ${handle}`);
    for (const vao of entry.vaos.values()) this.gl.deleteVertexArray(vao);
    if (entry.uniformBuffer) this.gl.deleteBuffer(entry.uniformBuffer);
    this.gl.deleteProgram(entry.program);
    this.pipelines.delete(handle);
  }

  beginFrame(clear: ClearColor): void {
    this.frame.begin();
    const gl = this.gl;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.depthMask(true); // the clear below only touches depth when writes are enabled
    gl.clearColor(clear.r, clear.g, clear.b, clear.a);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.frontFace(gl.CCW); // engine convention: counter-clockwise = front
  }

  draw(call: DrawCall): void {
    this.frame.assertInFrame();
    const pipeline = this.pipelines.get(call.pipeline);
    if (!pipeline) throw new Error(`renderer: unknown or destroyed pipeline ${call.pipeline}`);
    const buffer = this.buffers.get(call.vertexBuffer);
    if (!buffer) throw new Error(`renderer: unknown or destroyed buffer ${call.vertexBuffer}`);
    if (buffer.usage !== 'vertex') throw new Error(`renderer: buffer ${call.vertexBuffer} has usage "${buffer.usage}", expected "vertex"`);
    let index: GlBuffer | undefined;
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
    const textures = (call.textures ?? []).map((t) => {
      const entry = this.textures.get(t);
      if (!entry) throw new Error(`renderer: unknown or destroyed texture ${t}`);
      return entry;
    });

    const gl = this.gl;
    const { state } = pipeline;
    gl.useProgram(pipeline.program);
    // A pipeline that neither tests nor writes depth simply ignores the depth buffer.
    if (state.depthTest || state.depthWrite) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(state.depthTest ? gl.LESS : gl.ALWAYS);
    } else gl.disable(gl.DEPTH_TEST);
    gl.depthMask(state.depthWrite);
    gl.depthRange(state.depthRange[0], state.depthRange[1]);
    if (state.blend !== 'opaque') {
      const GL_FACTOR = { zero: gl.ZERO, one: gl.ONE, src: gl.SRC_COLOR, 'src-alpha': gl.SRC_ALPHA, 'one-minus-src-alpha': gl.ONE_MINUS_SRC_ALPHA, dst: gl.DST_COLOR } as const;
      const factors = BLEND_FACTORS[state.blend];
      gl.enable(gl.BLEND);
      // Colour: the mode's equation. Alpha: destination kept (ZERO, ONE).
      gl.blendFuncSeparate(GL_FACTOR[factors.src], GL_FACTOR[factors.dst], gl.ZERO, gl.ONE);
    } else gl.disable(gl.BLEND);
    if (state.cullMode === 'back') {
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
    } else gl.disable(gl.CULL_FACE);
    if (pipeline.uniformBuffer && call.uniforms) {
      gl.bindBuffer(gl.UNIFORM_BUFFER, pipeline.uniformBuffer);
      gl.bufferSubData(gl.UNIFORM_BUFFER, 0, call.uniforms);
      gl.bindBufferBase(gl.UNIFORM_BUFFER, GLOBALS_BINDING, pipeline.uniformBuffer);
    }
    textures.forEach((t, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t.texture);
    });
    gl.bindVertexArray(this.vaoFor(pipeline, call.vertexBuffer, buffer, call.indexBuffer, index));
    const mode = state.topology === 'line-list' ? gl.LINES : gl.TRIANGLES;
    if (index) gl.drawElements(mode, call.indexCount!, gl.UNSIGNED_SHORT, (call.firstIndex ?? 0) * 2);
    else gl.drawArrays(mode, call.firstVertex ?? 0, call.vertexCount!);
    gl.bindVertexArray(null);
    this.frame.count(triangles);
  }

  endFrame(): FrameStats {
    return this.frame.end();
  }

  async readPixels(points: ReadonlyArray<readonly [number, number]>): Promise<Rgba[]> {
    this.frame.assertUsable('readPixels');
    const gl = this.gl;
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    // One full-frame read instead of one stall per point.
    const data = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return points.map(([x, y]) => {
      const i = ((h - 1 - y) * w + x) * 4; // GL rows start at the bottom
      return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!] as const;
    });
  }

  async drainErrors(): Promise<string[]> {
    const gl = this.gl;
    const names: Record<number, string> = {
      [gl.INVALID_ENUM]: 'INVALID_ENUM',
      [gl.INVALID_VALUE]: 'INVALID_VALUE',
      [gl.INVALID_OPERATION]: 'INVALID_OPERATION',
      [gl.INVALID_FRAMEBUFFER_OPERATION]: 'INVALID_FRAMEBUFFER_OPERATION',
      [gl.OUT_OF_MEMORY]: 'OUT_OF_MEMORY',
      [gl.CONTEXT_LOST_WEBGL]: 'CONTEXT_LOST_WEBGL',
    };
    const errors: string[] = [];
    for (let code = gl.getError(); code !== gl.NO_ERROR && errors.length < 16; code = gl.getError()) {
      errors.push(`webgl2: ${names[code] ?? `0x${code.toString(16)}`}`);
      if (code === gl.CONTEXT_LOST_WEBGL) break; // reported forever once lost
    }
    return errors;
  }

  dispose(): void {
    if (this.frame.isDisposed) return;
    const gl = this.gl;
    for (const p of this.pipelines.values()) {
      for (const vao of p.vaos.values()) gl.deleteVertexArray(vao);
      if (p.uniformBuffer) gl.deleteBuffer(p.uniformBuffer);
      gl.deleteProgram(p.program);
    }
    for (const b of this.buffers.values()) gl.deleteBuffer(b.buffer);
    for (const t of this.textures.values()) gl.deleteTexture(t.texture);
    this.textures.clear();
    this.vaoUses.clear();
    this.pipelines.clear();
    this.buffers.clear();
    this.frame.dispose();
  }

  private vaoFor(pipeline: GlPipeline, vertexHandle: number, vertex: GlBuffer, indexHandle: number | undefined, index: GlBuffer | undefined): WebGLVertexArrayObject {
    const key = `${vertexHandle}/${indexHandle ?? ''}`;
    const cached = pipeline.vaos.get(key);
    if (cached) return cached;
    const gl = this.gl;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('webgl2: createVertexArray failed');
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertex.buffer);
    for (const a of pipeline.layout.attributes) {
      gl.enableVertexAttribArray(a.location);
      if (a.format === 'uint8x4') gl.vertexAttribIPointer(a.location, 4, gl.UNSIGNED_BYTE, pipeline.layout.stride, a.offset);
      else if (a.format === 'unorm8x4') gl.vertexAttribPointer(a.location, 4, gl.UNSIGNED_BYTE, true, pipeline.layout.stride, a.offset);
      else gl.vertexAttribPointer(a.location, VERTEX_FORMAT_COMPONENTS[a.format], gl.FLOAT, false, pipeline.layout.stride, a.offset);
    }
    // The element buffer binding is recorded in the VAO.
    if (index) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index.buffer);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    pipeline.vaos.set(key, vao);
    for (const h of indexHandle === undefined ? [vertexHandle] : [vertexHandle, indexHandle]) {
      const uses = this.vaoUses.get(h);
      if (uses) uses.push({ pipeline, key });
      else this.vaoUses.set(h, [{ pipeline, key }]);
    }
    return vao;
  }
}
