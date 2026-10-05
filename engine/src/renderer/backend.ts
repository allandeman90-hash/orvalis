import { DepthRange } from '../math';

/**
 * Graphics backend boundary (spec §253): world and game logic never touch
 * WebGPU or WebGL2 objects directly, only this interface and opaque handles.
 *
 * The surface is deliberately tiny and grows one verified step at a time
 * (textures, index buffers, uniforms and blend state arrive with the phases
 * that need them).
 */
export type BackendKind = 'webgpu' | 'webgl2' | 'null';

/** Name shown to the player and in the debug overlay. */
export const BACKEND_DISPLAY_NAME: Readonly<Record<BackendKind, string>> = {
  webgpu: 'WebGPU',
  webgl2: 'WebGL2',
  null: 'Null',
};

export interface BackendInfo {
  readonly kind: BackendKind;
  /** Clip-space depth convention to pass to mat4.perspective. */
  readonly depthRange: DepthRange;
}

declare const bufferBrand: unique symbol;
declare const pipelineBrand: unique symbol;
declare const textureBrand: unique symbol;
/** Opaque handles: only the backend that created them can interpret them. */
export type BufferHandle = number & { readonly [bufferBrand]: true };
export type TextureHandle = number & { readonly [textureBrand]: true };
export type PipelineHandle = number & { readonly [pipelineBrand]: true };

export type BufferUsage = 'vertex' | 'index' | 'uniform';

export interface BufferDescriptor {
  readonly usage: BufferUsage;
  /** Uint8Array: raw interleaved vertices mixing float and byte attributes (vertex buffers only). */
  readonly data: Float32Array | Uint16Array | Uint32Array | Uint8Array;
  readonly label?: string;
}

/**
 * float32xN: N floats. unorm8x4: 4 bytes read as 0..1 (vec4 in the shader). uint8x4: 4 bytes read as
 * integers 0..255 (`vec4<u32>` in WGSL, `uvec4` in GLSL) — e.g. bone weights and bone indices.
 */
export type VertexFormat = 'float32x2' | 'float32x3' | 'float32x4' | 'unorm8x4' | 'uint8x4';

export const VERTEX_FORMAT_COMPONENTS: Readonly<Record<VertexFormat, number>> = {
  float32x2: 2,
  float32x3: 3,
  float32x4: 4,
  unorm8x4: 4,
  uint8x4: 4,
};

/** Bytes one attribute of each format occupies in a vertex. */
export const VERTEX_FORMAT_BYTES: Readonly<Record<VertexFormat, number>> = {
  float32x2: 8,
  float32x3: 12,
  float32x4: 16,
  unorm8x4: 4,
  uint8x4: 4,
};

export interface VertexAttribute {
  /** Shader location, identical in the WGSL and GLSL sources. */
  readonly location: number;
  readonly format: VertexFormat;
  /** Byte offset inside one vertex. */
  readonly offset: number;
}

export interface VertexLayout {
  /** Bytes per vertex. */
  readonly stride: number;
  readonly attributes: readonly VertexAttribute[];
}

/**
 * A shader is authored twice, once per backend language. There is no
 * transpiler: both sources are hand-written and must stay equivalent.
 */
export interface ShaderSource {
  /** WGSL module with `vs_main` and `fs_main` entry points (WebGPU). */
  readonly wgsl: string;
  /** GLSL ES 3.00 vertex shader (WebGL2). */
  readonly glslVertex: string;
  /** GLSL ES 3.00 fragment shader (WebGL2). */
  readonly glslFragment: string;
}

export type CullMode = 'none' | 'back';

/** What the vertices (or indices) of a draw describe. */
export type PrimitiveTopology = 'triangle-list' | 'line-list';

/**
 * Winding convention of the whole engine: a triangle whose vertices appear
 * counter-clockwise on screen is FRONT-facing, on every backend.
 */
export const FRONT_FACE = 'ccw';

export interface PipelineDescriptor {
  readonly shader: ShaderSource;
  readonly vertexLayout: VertexLayout;
  /**
   * Size in bytes of the pipeline's single uniform block (binding 0, called
   * `Globals` in both shader languages), or 0/undefined for none. The block may
   * only contain mat4 and vec4 members, so that its layout is identical in
   * WGSL and GLSL std140. Must be a multiple of 16.
   */
  readonly uniformBytes?: number;
  /** Compare against the depth buffer (nearer wins). Default true. */
  readonly depthTest?: boolean;
  /** Write to the depth buffer. Default true. */
  readonly depthWrite?: boolean;
  /** Default 'back': back faces (clockwise on screen) are not drawn. Ignored for lines. */
  readonly cullMode?: CullMode;
  /** Default 'triangle-list'. 'line-list' draws one-pixel segments, two vertices each. */
  readonly topology?: PrimitiveTopology;
  /**
   * Number of textures the shader samples (0..MAX_TEXTURES_PER_PIPELINE, default 0).
   * Texture i is `u_texture<i>` in GLSL, and in WGSL the pair
   * `@group(0) @binding(1 + 2·i)` (texture_2d<f32>) / `@binding(2 + 2·i)` (sampler).
   * Every draw must then provide exactly that many textures.
   */
  readonly textureCount?: number;
  /**
   * Slice [min, max] of the depth buffer this pipeline's fragments are mapped to (default [0, 1], the whole
   * buffer). Lets a pass sit entirely behind another whatever its geometry: e.g. far terrain in [0.955, 0.96]
   * behind a world drawn in [0, 0.955] (spec §15).
   */
  readonly depthRange?: readonly [number, number];
  /**
   * How the fragments combine with what is already drawn. Default 'opaque' (they replace it).
   * 'alpha': colour = source · source.a + destination · (1 − source.a); the alpha stored in the frame is left
   * untouched (the canvas stays opaque). Translucent geometry must be drawn after the opaque one, usually
   * with depthWrite false.
   * The other modes are the additive and multiplicative families of the model materials (spec §79, §98) —
   * see BLEND_FACTORS for the exact colour equation of each. All leave the frame's alpha untouched.
   */
  readonly blend?: BlendMode;
  readonly label?: string;
}

export type BlendMode = 'opaque' | 'alpha' | 'add' | 'addNoAlpha' | 'mod' | 'mod2x';

export type BlendFactor = 'zero' | 'one' | 'src' | 'src-alpha' | 'one-minus-src-alpha' | 'dst';

/**
 * Colour equation of each blending mode: result = source · src + destination · dst (factors per channel).
 *   alpha       s·s.a + d·(1 − s.a)
 *   add         s·s.a + d            (spec: « additive »)
 *   addNoAlpha  s + d                (spec: « no-alpha add »)
 *   mod         s·d                  (spec: « framebuffer multiplication »)
 *   mod2x       2·s·d                (spec: « multiplied result with stronger factor »)
 * The document names the modes; the factors are OUR CHOICE (the usual fixed-function ones for these names).
 */
export const BLEND_FACTORS: Readonly<Record<Exclude<BlendMode, 'opaque'>, { readonly src: BlendFactor; readonly dst: BlendFactor }>> = {
  alpha: { src: 'src-alpha', dst: 'one-minus-src-alpha' },
  add: { src: 'src-alpha', dst: 'one' },
  addNoAlpha: { src: 'one', dst: 'one' },
  mod: { src: 'dst', dst: 'zero' },
  mod2x: { src: 'dst', dst: 'src' },
};

/** Descriptor with every default applied. */
export interface ResolvedPipelineState {
  readonly uniformBytes: number;
  readonly depthTest: boolean;
  readonly depthWrite: boolean;
  readonly cullMode: CullMode;
  readonly topology: PrimitiveTopology;
  readonly textureCount: number;
  readonly depthRange: readonly [number, number];
  readonly blend: BlendMode;
}

export function resolvePipelineState(desc: PipelineDescriptor): ResolvedPipelineState {
  const uniformBytes = desc.uniformBytes ?? 0;
  if (!Number.isInteger(uniformBytes) || uniformBytes < 0 || uniformBytes % 16 !== 0) {
    throw new Error(`renderer: uniformBytes must be a non-negative multiple of 16 (got ${uniformBytes})`);
  }
  const textureCount = desc.textureCount ?? 0;
  if (!Number.isInteger(textureCount) || textureCount < 0 || textureCount > MAX_TEXTURES_PER_PIPELINE) {
    throw new Error(`renderer: textureCount must be an integer in 0..${MAX_TEXTURES_PER_PIPELINE} (got ${textureCount})`);
  }
  const depthRange = desc.depthRange ?? ([0, 1] as const);
  if (!(depthRange[0] >= 0 && depthRange[1] <= 1 && depthRange[0] < depthRange[1])) {
    throw new Error(`renderer: depthRange must satisfy 0 ≤ min < max ≤ 1 (got ${depthRange[0]}, ${depthRange[1]})`);
  }
  return {
    uniformBytes,
    depthTest: desc.depthTest ?? true,
    depthWrite: desc.depthWrite ?? true,
    cullMode: desc.cullMode ?? 'back',
    topology: desc.topology ?? 'triangle-list',
    textureCount,
    depthRange,
    blend: resolveBlend(desc.blend),
  };
}

function resolveBlend(blend: BlendMode | undefined): BlendMode {
  if (blend === undefined || blend === 'opaque' || blend in BLEND_FACTORS) return blend ?? 'opaque';
  throw new Error(`renderer: blend must be 'opaque' or one of ${Object.keys(BLEND_FACTORS).join(', ')} (got ${String(blend)})`);
}

export const MAX_TEXTURES_PER_PIPELINE = 8;

export type TextureWrap = 'repeat' | 'clamp';
export type TextureFilter = 'linear' | 'nearest';

/**
 * A 2D colour texture, 8 bits per channel, RGBA, uploaded once.
 * - `data` holds width × height × 4 bytes; row 0 is the row sampled at v = 0.
 * - Values are used as they are: no sRGB decoding on either backend.
 * - `mipmaps`: the smaller levels are computed on the CPU by buildMipChain()
 *   and uploaded as such, so both backends sample exactly the same texels
 *   (WebGPU has no built-in mipmap generation, and letting each API make its
 *   own would give two different pictures). Needs power-of-two sizes.
 */
export interface TextureDescriptor {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
  /** Default 'repeat'. */
  readonly wrap?: TextureWrap;
  /** Default 'linear' (trilinear when mipmaps are on). */
  readonly filter?: TextureFilter;
  /** Default false. */
  readonly mipmaps?: boolean;
  readonly label?: string;
}

export interface ResolvedTexture {
  readonly width: number;
  readonly height: number;
  readonly wrap: TextureWrap;
  readonly filter: TextureFilter;
  /** Level 0 first; a single entry when mipmaps are off. */
  readonly levels: readonly Uint8Array[];
}

const isPowerOfTwo = (n: number): boolean => (n & (n - 1)) === 0;

/** Largest texture side accepted on every backend (WebGL2 guarantees at least 2048). */
export const MAX_TEXTURE_SIZE = 2048;

/**
 * Every level of a mip chain, down to 1 × 1, by averaging 2 × 2 texels
 * (rounded to nearest). Sizes must be powers of two.
 */
export function buildMipChain(data: Uint8Array, width: number, height: number): Uint8Array[] {
  if (!isPowerOfTwo(width) || !isPowerOfTwo(height)) throw new Error(`renderer: mipmaps need power-of-two sizes (got ${width}x${height})`);
  const levels = [data];
  let w = width, h = height, src = data;
  while (w > 1 || h > 1) {
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1);
    const dst = new Uint8Array(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
      const y0 = Math.min(h - 1, y * 2), y1 = Math.min(h - 1, y * 2 + 1);
      for (let x = 0; x < nw; x++) {
        const x0 = Math.min(w - 1, x * 2), x1 = Math.min(w - 1, x * 2 + 1);
        for (let c = 0; c < 4; c++) {
          const sum = src[(y0 * w + x0) * 4 + c]! + src[(y0 * w + x1) * 4 + c]! + src[(y1 * w + x0) * 4 + c]! + src[(y1 * w + x1) * 4 + c]!;
          dst[(y * nw + x) * 4 + c] = (sum + 2) >> 2;
        }
      }
    }
    levels.push(dst);
    src = dst;
    w = nw;
    h = nh;
  }
  return levels;
}

/** Validation and defaults shared by all backends. */
export function resolveTexture(desc: TextureDescriptor): ResolvedTexture {
  const { width, height, data } = desc;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_TEXTURE_SIZE || height > MAX_TEXTURE_SIZE) {
    throw new Error(`renderer: texture size must be integers in 1..${MAX_TEXTURE_SIZE} (got ${width}x${height})`);
  }
  if (!(data instanceof Uint8Array) || data.length !== width * height * 4) {
    throw new Error(`renderer: texture data must be a Uint8Array of ${width * height * 4} bytes (RGBA, got ${data.length})`);
  }
  return { width, height, wrap: desc.wrap ?? 'repeat', filter: desc.filter ?? 'linear', levels: desc.mipmaps ? buildMipChain(data, width, height) : [data] };
}

export interface ClearColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/**
 * One draw with the pipeline's topology (triangles: counts are multiples of 3;
 * lines: multiples of 2). Two forms:
 * - non-indexed: `vertexCount` (+ `firstVertex`);
 * - indexed: `indexBuffer` + `indexCount` (+ `firstIndex`), 16-bit indices.
 */
export interface DrawCall {
  readonly pipeline: PipelineHandle;
  readonly vertexBuffer: BufferHandle;
  /** Non-indexed form: number of vertices. */
  readonly vertexCount?: number;
  readonly firstVertex?: number;
  /** Indexed form: buffer of Uint16 indices created with usage 'index'. */
  readonly indexBuffer?: BufferHandle;
  /** Indexed form: number of indices. */
  readonly indexCount?: number;
  readonly firstIndex?: number;
  /**
   * Content of the pipeline's uniform block for this draw; required when the
   * pipeline declares one. Backends read it during draw(): the caller may reuse
   * or overwrite the array as soon as draw() returns.
   */
  readonly uniforms?: Float32Array;
  /** Textures sampled by this draw, in shader order; required when the pipeline declares textureCount > 0. */
  readonly textures?: readonly TextureHandle[];
}

/** Bytes per index: indices are always unsigned 16-bit. */
export const INDEX_BYTES = 2;

/** Counters for the debug overlay (draw calls, triangle count). */
export interface FrameStats {
  readonly drawCalls: number;
  readonly triangles: number;
}

export interface RendererBackend {
  readonly info: BackendInfo;
  /** Drawing-buffer size in physical pixels. */
  resize(width: number, height: number): void;
  createBuffer(desc: BufferDescriptor): BufferHandle;
  /**
   * Replaces the start of a buffer's content. For geometry rebuilt every frame (particles, debug lines):
   * create the buffer once at its largest size, then update it. `data` must be of the same kind as at creation
   * and not longer than the buffer; the bytes after it keep their old content.
   */
  updateBuffer(handle: BufferHandle, data: BufferDescriptor['data']): void;
  destroyBuffer(handle: BufferHandle): void;
  createPipeline(desc: PipelineDescriptor): PipelineHandle;
  destroyPipeline(handle: PipelineHandle): void;
  createTexture(desc: TextureDescriptor): TextureHandle;
  destroyTexture(handle: TextureHandle): void;
  /** Starts a frame and clears color and depth. */
  beginFrame(clear: ClearColor): void;
  draw(call: DrawCall): void;
  /** Finishes the frame and returns its statistics. */
  endFrame(): FrameStats;
  /** Releases every GPU resource. The backend is unusable afterwards. */
  dispose(): void;
}

export type Rgba = readonly [number, number, number, number];

/**
 * Debug/test contract implemented by the real backends (not by game code).
 * Everything is asynchronous because WebGPU cannot read the framebuffer or
 * report validation errors synchronously.
 */
export interface RendererDebug {
  /**
   * RGBA (0–255) of drawing-buffer pixels, origin at the top-left.
   * Must be called right after endFrame(), in the same task, before the
   * browser presents the frame.
   */
  readPixels(points: ReadonlyArray<readonly [number, number]>): Promise<Rgba[]>;
  /** GPU/driver errors raised since the previous call; empty when healthy. */
  drainErrors(): Promise<string[]>;
}

/** Thrown by a backend factory when the browser cannot provide that backend. */
export class BackendUnavailableError extends Error {
  constructor(
    readonly kind: BackendKind,
    reason: string,
  ) {
    super(reason);
    this.name = 'BackendUnavailableError';
  }
}

/** Frame bracketing and lifetime rules shared by every backend. */
export class FrameGuard {
  private inFrame = false;
  private disposed = false;
  drawCalls = 0;
  triangles = 0;

  assertUsable(action: string): void {
    if (this.disposed) throw new Error(`renderer: ${action} called on a disposed backend`);
  }

  begin(): void {
    this.assertUsable('beginFrame');
    if (this.inFrame) throw new Error('renderer: beginFrame called twice without endFrame');
    this.inFrame = true;
    this.drawCalls = 0;
    this.triangles = 0;
  }

  assertInFrame(): void {
    this.assertUsable('draw');
    if (!this.inFrame) throw new Error('renderer: draw called outside beginFrame/endFrame');
  }

  count(triangles: number): void {
    this.drawCalls++;
    this.triangles += triangles;
  }

  end(): FrameStats {
    this.assertUsable('endFrame');
    if (!this.inFrame) throw new Error('renderer: endFrame called without beginFrame');
    this.inFrame = false;
    return { drawCalls: this.drawCalls, triangles: this.triangles };
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    this.inFrame = false;
    this.disposed = true;
  }
}

export function assertValidSize(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`renderer: invalid size ${width}x${height}`);
  }
}

/** Validation shared by all backends, so they reject the same mistakes. */
export function validateVertexLayout(layout: VertexLayout): void {
  if (!Number.isInteger(layout.stride) || layout.stride <= 0 || layout.stride % 4 !== 0) {
    throw new Error(`renderer: vertex stride must be a positive multiple of 4 (got ${layout.stride})`);
  }
  if (layout.attributes.length === 0) throw new Error('renderer: vertex layout has no attribute');
  const seen = new Set<number>();
  for (const a of layout.attributes) {
    if (!Number.isInteger(a.location) || a.location < 0) throw new Error(`renderer: invalid attribute location ${a.location}`);
    if (seen.has(a.location)) throw new Error(`renderer: duplicate attribute location ${a.location}`);
    seen.add(a.location);
    if (!(a.format in VERTEX_FORMAT_BYTES)) throw new Error(`renderer: unknown vertex format ${String(a.format)}`);
    const end = a.offset + VERTEX_FORMAT_BYTES[a.format];
    if (!Number.isInteger(a.offset) || a.offset < 0 || end > layout.stride) {
      throw new Error(`renderer: attribute at location ${a.location} (${a.format}, offset ${a.offset}) overflows stride ${layout.stride}`);
    }
  }
}

export interface DrawValidationContext {
  readonly vertexBufferBytes: number;
  readonly stride: number;
  /** Byte length of the index buffer when the draw is indexed. */
  readonly indexBufferBytes?: number;
  readonly uniformBytes: number;
  readonly topology: PrimitiveTopology;
  readonly textureCount: number;
}

/** Checks a draw call against its buffers and pipeline. Returns the number of triangles drawn (0 for lines). */
export function validateDrawCall(call: DrawCall, ctx: DrawValidationContext): number {
  const per = ctx.topology === 'line-list' ? 2 : 3;
  const trianglesFor = (count: number): number => (ctx.topology === 'line-list' ? 0 : count / 3);
  const expected = ctx.uniformBytes;
  const given = call.uniforms?.byteLength ?? 0;
  if (given !== expected) {
    throw new Error(`renderer: pipeline expects ${expected} bytes of uniforms, draw call provides ${given}`);
  }
  if ((call.textures?.length ?? 0) !== ctx.textureCount) {
    throw new Error(`renderer: pipeline expects ${ctx.textureCount} texture(s), draw call provides ${call.textures?.length ?? 0}`);
  }
  const indexed = call.indexBuffer !== undefined;
  if (indexed) {
    if (call.vertexCount !== undefined || call.firstVertex !== undefined) {
      throw new Error('renderer: an indexed draw takes indexCount/firstIndex, not vertexCount/firstVertex');
    }
    const count = call.indexCount;
    const first = call.firstIndex ?? 0;
    if (count === undefined || !Number.isInteger(count) || count <= 0 || count % per !== 0) {
      throw new Error(`renderer: indexCount must be a positive multiple of ${per} (got ${count})`);
    }
    if (!Number.isInteger(first) || first < 0) throw new Error(`renderer: invalid firstIndex ${first}`);
    if ((first + count) * INDEX_BYTES > (ctx.indexBufferBytes ?? 0)) {
      throw new Error(`renderer: draw reads ${first + count} indices but the index buffer holds ${(ctx.indexBufferBytes ?? 0) / INDEX_BYTES}`);
    }
    return trianglesFor(count);
  }
  if (call.indexCount !== undefined || call.firstIndex !== undefined) {
    throw new Error('renderer: indexCount/firstIndex need an indexBuffer');
  }
  const count = call.vertexCount;
  const first = call.firstVertex ?? 0;
  if (count === undefined || !Number.isInteger(count) || count <= 0 || count % per !== 0) {
    throw new Error(`renderer: vertexCount must be a positive multiple of ${per} (got ${count})`);
  }
  if (!Number.isInteger(first) || first < 0) throw new Error(`renderer: invalid firstVertex ${first}`);
  if ((first + count) * ctx.stride > ctx.vertexBufferBytes) {
    throw new Error(`renderer: draw reads ${first + count} vertices of ${ctx.stride} bytes but the buffer holds ${ctx.vertexBufferBytes} bytes`);
  }
  return trianglesFor(count);
}

/** Shared checks of updateBuffer(). */
export function validateBufferUpdate(usage: BufferUsage, byteLength: number, data: BufferDescriptor['data']): void {
  if (data.byteLength === 0) throw new Error('renderer: cannot update a buffer with no data');
  if (data.byteLength > byteLength) throw new Error(`renderer: update of ${data.byteLength} bytes does not fit in a buffer of ${byteLength} bytes`);
  if (usage === 'index' && !(data instanceof Uint16Array)) throw new Error('renderer: index buffers must be Uint16Array');
  if (data instanceof Uint8Array && usage !== 'vertex') throw new Error('renderer: byte buffers (Uint8Array) are for vertices only');
}
