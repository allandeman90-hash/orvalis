import { describe, expect, it } from 'vitest';
import { buildMipChain, MAX_TEXTURE_SIZE, NullBackend, POSITION_COLOR_LAYOUT, POSITION_COLOR_MVP_SHADER, resolvePipelineState, resolveTexture } from '../../src/renderer';

const rgba = (w: number, h: number, fill = 255): Uint8Array => new Uint8Array(w * h * 4).fill(fill);
const pipeline = { shader: POSITION_COLOR_MVP_SHADER, vertexLayout: POSITION_COLOR_LAYOUT };

describe('texture descriptors', () => {
  it('applies defaults: repeat, linear, no mipmaps', () => {
    const t = resolveTexture({ width: 4, height: 2, data: rgba(4, 2) });
    expect([t.width, t.height, t.wrap, t.filter, t.levels.length]).toEqual([4, 2, 'repeat', 'linear', 1]);
    expect(resolveTexture({ width: 3, height: 5, data: rgba(3, 5), wrap: 'clamp', filter: 'nearest' })).toMatchObject({ wrap: 'clamp', filter: 'nearest' });
  });

  it('rejects wrong sizes and wrong data length', () => {
    expect(() => resolveTexture({ width: 0, height: 4, data: rgba(1, 1) })).toThrow(/size/);
    expect(() => resolveTexture({ width: 2.5, height: 4, data: rgba(1, 1) })).toThrow(/size/);
    expect(() => resolveTexture({ width: MAX_TEXTURE_SIZE * 2, height: 1, data: rgba(1, 1) })).toThrow(/size/);
    expect(() => resolveTexture({ width: 4, height: 4, data: rgba(4, 3) })).toThrow(/64 bytes/);
    expect(() => resolveTexture({ width: 3, height: 4, data: rgba(3, 4), mipmaps: true })).toThrow(/power-of-two/);
  });
});

describe('mip chain (computed once on the CPU, identical on both backends)', () => {
  it('goes down to 1 × 1, halving each side', () => {
    const levels = buildMipChain(rgba(8, 2), 8, 2);
    expect(levels.map((l) => l.length / 4)).toEqual([16, 4, 2, 1]); // 8×2, 4×1, 2×1, 1×1
  });

  it('each texel is the rounded average of the 2 × 2 texels above it', () => {
    // 2 × 2, one channel pattern: 0, 10, 20, 31 → average 15.25 → 15
    const data = new Uint8Array([0, 0, 0, 255, 10, 100, 0, 255, 20, 100, 0, 255, 31, 101, 3, 255]);
    const [, top] = buildMipChain(data, 2, 2);
    expect(Array.from(top!)).toEqual([15, 75, 1, 255]); // 61/4 = 15.25 → 15 ; 301/4 = 75.25 → 75 ; 3/4 → 1
  });

  it('a flat colour stays exactly that colour at every level', () => {
    const data = new Uint8Array(16 * 16 * 4);
    for (let i = 0; i < 256; i++) data.set([40, 160, 60, 255], i * 4);
    for (const level of buildMipChain(data, 16, 16)) for (let i = 0; i < level.length; i += 4) expect(Array.from(level.subarray(i, i + 4))).toEqual([40, 160, 60, 255]);
  });

  it('a checkerboard averages to mid grey', () => {
    const data = new Uint8Array(4 * 4 * 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) data.set((x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255], (y * 4 + x) * 4);
    const levels = buildMipChain(data, 4, 4);
    expect(Array.from(levels[2]!)).toEqual([128, 128, 128, 255]);
  });
});

describe('NullBackend — textures follow the same contract as the real backends', () => {
  it('creates, inspects and destroys textures', () => {
    const b = new NullBackend();
    const t = b.createTexture({ width: 4, height: 4, data: rgba(4, 4), mipmaps: true });
    expect(b.liveTextureCount).toBe(1);
    expect(b.textureInfo(t).levels.length).toBe(3);
    b.destroyTexture(t);
    expect(b.liveTextureCount).toBe(0);
    expect(() => b.destroyTexture(t)).toThrow(/unknown or destroyed texture/);
    expect(() => b.createTexture({ width: 2, height: 2, data: rgba(1, 1) })).toThrow(/16 bytes/);
  });

  it('a pipeline declares how many textures it samples; a draw must give exactly that many, all alive', () => {
    const b = new NullBackend();
    expect(resolvePipelineState(pipeline).textureCount).toBe(0);
    expect(() => b.createPipeline({ ...pipeline, textureCount: 9 })).toThrow(/textureCount/);
    expect(() => b.createPipeline({ ...pipeline, textureCount: -1 })).toThrow(/textureCount/);
    const p = b.createPipeline({ ...pipeline, textureCount: 2, uniformBytes: 64 });
    const plain = b.createPipeline({ ...pipeline, uniformBytes: 64 });
    const v = b.createBuffer({ usage: 'vertex', data: new Float32Array(18) });
    const t1 = b.createTexture({ width: 1, height: 1, data: rgba(1, 1) }), t2 = b.createTexture({ width: 1, height: 1, data: rgba(1, 1) });
    const uniforms = new Float32Array(16);
    b.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    b.draw({ pipeline: p, vertexBuffer: v, vertexCount: 3, uniforms, textures: [t1, t2] });
    expect(() => b.draw({ pipeline: p, vertexBuffer: v, vertexCount: 3, uniforms, textures: [t1] })).toThrow(/expects 2 texture\(s\), draw call provides 1/);
    expect(() => b.draw({ pipeline: p, vertexBuffer: v, vertexCount: 3, uniforms })).toThrow(/expects 2 texture/);
    expect(() => b.draw({ pipeline: plain, vertexBuffer: v, vertexCount: 3, uniforms, textures: [t1] })).toThrow(/expects 0 texture/);
    expect(b.endFrame()).toEqual({ drawCalls: 1, triangles: 1 });
    b.destroyTexture(t2);
    b.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    expect(() => b.draw({ pipeline: p, vertexBuffer: v, vertexCount: 3, uniforms, textures: [t1, t2] })).toThrow(/unknown or destroyed texture/);
    b.endFrame();
    b.dispose();
    expect(b.liveTextureCount).toBe(0);
  });
});
