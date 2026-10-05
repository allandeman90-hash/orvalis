import { describe, expect, it } from 'vitest';
import { DepthRange } from '../../src/math';
import { NullBackend, type PipelineDescriptor, type RendererBackend, validateVertexLayout } from '../../src/renderer';

const CLEAR = { r: 0, g: 0, b: 0, a: 1 };
const shader = { wgsl: '// wgsl', glslVertex: '// vs', glslFragment: '// fs' };
/** position (xyz) + color (rgb), 24 bytes per vertex */
const layout = {
  stride: 24,
  attributes: [
    { location: 0, format: 'float32x3', offset: 0 },
    { location: 1, format: 'float32x3', offset: 12 },
  ],
} as const;
const pipelineDesc: PipelineDescriptor = { shader, vertexLayout: layout };
const triangle = () => new Float32Array(3 * 6); // 3 vertices

function setup() {
  const b = new NullBackend();
  const pipeline = b.createPipeline(pipelineDesc);
  const vertexBuffer = b.createBuffer({ usage: 'vertex', data: triangle() });
  return { b, pipeline, vertexBuffer };
}

describe('NullBackend', () => {
  it('satisfies the RendererBackend interface and reports its identity', () => {
    const b: RendererBackend = new NullBackend();
    expect(b.info.kind).toBe('null');
    expect(b.info.depthRange).toBe(DepthRange.ZeroToOne);
  });

  it('a nominal frame returns draw-call and triangle counts', () => {
    const { b, pipeline, vertexBuffer } = setup();
    const quad = b.createBuffer({ usage: 'vertex', data: new Float32Array(6 * 6) });
    b.beginFrame(CLEAR);
    b.draw({ pipeline, vertexBuffer, vertexCount: 3 });
    b.draw({ pipeline, vertexBuffer: quad, vertexCount: 6 });
    expect(b.endFrame()).toEqual({ drawCalls: 2, triangles: 3 });
    expect(b.events.map((e) => e.type)).toEqual(['beginFrame', 'draw', 'draw', 'endFrame']);
  });

  it('statistics reset every frame; an empty frame is valid', () => {
    const { b, pipeline, vertexBuffer } = setup();
    b.beginFrame(CLEAR);
    b.draw({ pipeline, vertexBuffer, vertexCount: 3 });
    b.endFrame();
    b.beginFrame(CLEAR);
    expect(b.endFrame()).toEqual({ drawCalls: 0, triangles: 0 });
  });

  it('enforces frame bracketing', () => {
    const { b, pipeline, vertexBuffer } = setup();
    expect(() => b.draw({ pipeline, vertexBuffer, vertexCount: 3 })).toThrow(/outside beginFrame/);
    expect(() => b.endFrame()).toThrow(/without beginFrame/);
    b.beginFrame(CLEAR);
    expect(() => b.beginFrame(CLEAR)).toThrow(/twice/);
  });

  it('rejects destroyed or foreign handles', () => {
    const { b, pipeline, vertexBuffer } = setup();
    b.destroyBuffer(vertexBuffer);
    expect(b.liveBufferCount).toBe(0);
    b.beginFrame(CLEAR);
    expect(() => b.draw({ pipeline, vertexBuffer, vertexCount: 3 })).toThrow(/destroyed buffer/);
    expect(() => b.destroyBuffer(vertexBuffer)).toThrow(/destroyed buffer/);
    const fresh = b.createBuffer({ usage: 'vertex', data: triangle() });
    b.destroyPipeline(pipeline);
    expect(() => b.draw({ pipeline, vertexBuffer: fresh, vertexCount: 3 })).toThrow(/destroyed pipeline/);
    expect(() => b.destroyPipeline(pipeline)).toThrow(/destroyed pipeline/);
  });

  it('handles are never reused after destruction', () => {
    const b = new NullBackend();
    const first = b.createBuffer({ usage: 'vertex', data: triangle() });
    b.destroyBuffer(first);
    expect(b.createBuffer({ usage: 'vertex', data: triangle() })).not.toBe(first);
  });

  it('rejects a non-vertex buffer used as vertex buffer', () => {
    const { b, pipeline } = setup();
    const index = b.createBuffer({ usage: 'index', data: new Uint16Array([0, 1, 2]) });
    b.beginFrame(CLEAR);
    expect(() => b.draw({ pipeline, vertexBuffer: index, vertexCount: 3 })).toThrow(/expected "vertex"/);
  });

  it('rejects draws that are not whole triangles or read past the buffer', () => {
    const { b, pipeline, vertexBuffer } = setup();
    b.beginFrame(CLEAR);
    for (const vertexCount of [0, 2, 4, -3, 1.5]) {
      expect(() => b.draw({ pipeline, vertexBuffer, vertexCount })).toThrow(/multiple of 3/);
    }
    expect(() => b.draw({ pipeline, vertexBuffer, vertexCount: 6 })).toThrow(/buffer holds/);
    expect(() => b.draw({ pipeline, vertexBuffer, vertexCount: 3, firstVertex: 1 })).toThrow(/buffer holds/);
    expect(() => b.draw({ pipeline, vertexBuffer, vertexCount: 3, firstVertex: -1 })).toThrow(/firstVertex/);
    expect(b.endFrame()).toEqual({ drawCalls: 0, triangles: 0 }); // rejected draws are not counted
  });

  it('rejects empty buffers and incomplete shaders', () => {
    const b = new NullBackend();
    expect(() => b.createBuffer({ usage: 'vertex', data: new Float32Array(0) })).toThrow(/empty buffer/);
    expect(() => b.createPipeline({ vertexLayout: layout, shader: { ...shader, wgsl: '  ' } })).toThrow(/WGSL/);
    expect(() => b.createPipeline({ vertexLayout: layout, shader: { ...shader, glslFragment: '' } })).toThrow(/GLSL/);
  });

  it('resize stores a valid size and rejects invalid ones', () => {
    const b = new NullBackend();
    b.resize(1280, 720);
    expect([b.width, b.height]).toEqual([1280, 720]);
    for (const [w, h] of [[0, 720], [1280, -1], [1.5, 2], [Number.NaN, 1]] as const) {
      expect(() => b.resize(w, h)).toThrow(/invalid size/);
    }
    expect([b.width, b.height]).toEqual([1280, 720]);
  });

  it('dispose releases everything and makes the backend unusable', () => {
    const { b, pipeline, vertexBuffer } = setup();
    b.dispose();
    expect(b.liveBufferCount + b.livePipelineCount).toBe(0);
    expect(() => b.beginFrame(CLEAR)).toThrow(/disposed/);
    expect(() => b.createBuffer({ usage: 'vertex', data: triangle() })).toThrow(/disposed/);
    expect(() => b.draw({ pipeline, vertexBuffer, vertexCount: 3 })).toThrow(/disposed/);
    expect(() => b.dispose()).not.toThrow(); // idempotent
  });
});

describe('NullBackend — indexed draws, uniforms and pipeline state (P1.2a)', () => {
  const quadVertices = () => new Float32Array(4 * 6);
  const quadIndices = () => new Uint16Array([0, 1, 2, 0, 2, 3]);
  function indexedSetup() {
    const b = new NullBackend();
    const pipeline = b.createPipeline({ ...pipelineDesc, uniformBytes: 64 });
    const vertexBuffer = b.createBuffer({ usage: 'vertex', data: quadVertices() });
    const indexBuffer = b.createBuffer({ usage: 'index', data: quadIndices() });
    const uniforms = new Float32Array(16);
    return { b, pipeline, vertexBuffer, indexBuffer, uniforms };
  }

  it('an indexed draw counts indexCount / 3 triangles', () => {
    const { b, pipeline, vertexBuffer, indexBuffer, uniforms } = indexedSetup();
    b.beginFrame(CLEAR);
    b.draw({ pipeline, vertexBuffer, indexBuffer, indexCount: 6, uniforms });
    b.draw({ pipeline, vertexBuffer, indexBuffer, indexCount: 3, firstIndex: 3, uniforms });
    expect(b.endFrame()).toEqual({ drawCalls: 2, triangles: 3 });
  });

  it('pipeline defaults: depth test and write on, back faces culled, no uniforms', () => {
    const b = new NullBackend();
    expect(b.pipelineState(b.createPipeline(pipelineDesc))).toEqual({ uniformBytes: 0, depthTest: true, depthWrite: true, cullMode: 'back', topology: 'triangle-list', textureCount: 0, depthRange: [0, 1], blend: 'opaque' });
    const custom = b.createPipeline({ ...pipelineDesc, uniformBytes: 64, depthTest: false, depthWrite: false, cullMode: 'none', topology: 'line-list', textureCount: 0, depthRange: [0, 1], blend: 'alpha' });
    expect(b.pipelineState(custom)).toEqual({ uniformBytes: 64, depthTest: false, depthWrite: false, cullMode: 'none', topology: 'line-list', textureCount: 0, depthRange: [0, 1], blend: 'alpha' });
    expect(() => b.createPipeline({ ...pipelineDesc, blend: 'additive' as 'alpha' })).toThrow(/blend must be/);
  });

  it('rejects a uniform block size that is not a multiple of 16', () => {
    const b = new NullBackend();
    for (const uniformBytes of [8, 60, -16, 1.5]) expect(() => b.createPipeline({ ...pipelineDesc, uniformBytes })).toThrow(/multiple of 16/);
  });

  it('uniforms must match the pipeline exactly', () => {
    const { b, pipeline, vertexBuffer, indexBuffer } = indexedSetup();
    const plain = b.createPipeline(pipelineDesc);
    b.beginFrame(CLEAR);
    expect(() => b.draw({ pipeline, vertexBuffer, indexBuffer, indexCount: 6 })).toThrow(/expects 64 bytes of uniforms, draw call provides 0/);
    expect(() => b.draw({ pipeline, vertexBuffer, indexBuffer, indexCount: 6, uniforms: new Float32Array(4) })).toThrow(/expects 64 bytes/);
    expect(() => b.draw({ pipeline: plain, vertexBuffer, indexBuffer, indexCount: 6, uniforms: new Float32Array(16) })).toThrow(/expects 0 bytes/);
  });

  it('index buffers must be Uint16 and used as index buffers', () => {
    const { b, pipeline, vertexBuffer, indexBuffer, uniforms } = indexedSetup();
    expect(() => b.createBuffer({ usage: 'index', data: new Uint32Array([0, 1, 2]) })).toThrow(/Uint16Array/);
    b.beginFrame(CLEAR);
    expect(() => b.draw({ pipeline, vertexBuffer, indexBuffer: vertexBuffer, indexCount: 3, uniforms })).toThrow(/expected "index"/);
    expect(() => b.draw({ pipeline, vertexBuffer: indexBuffer, indexBuffer, indexCount: 3, uniforms })).toThrow(/expected "vertex"/);
    b.destroyBuffer(indexBuffer);
    expect(() => b.draw({ pipeline, vertexBuffer, indexBuffer, indexCount: 3, uniforms })).toThrow(/destroyed buffer/);
  });

  it('rejects index ranges that are not whole triangles or overrun the buffer', () => {
    const { b, pipeline, vertexBuffer, indexBuffer, uniforms } = indexedSetup();
    b.beginFrame(CLEAR);
    for (const indexCount of [0, 4, -3, 2.5]) expect(() => b.draw({ pipeline, vertexBuffer, indexBuffer, indexCount, uniforms })).toThrow(/indexCount/);
    expect(() => b.draw({ pipeline, vertexBuffer, indexBuffer, uniforms })).toThrow(/indexCount/);
    expect(() => b.draw({ pipeline, vertexBuffer, indexBuffer, indexCount: 9, uniforms })).toThrow(/index buffer holds 6/);
    expect(() => b.draw({ pipeline, vertexBuffer, indexBuffer, indexCount: 6, firstIndex: 3, uniforms })).toThrow(/index buffer holds 6/);
    expect(() => b.draw({ pipeline, vertexBuffer, indexBuffer, indexCount: 3, firstIndex: -1, uniforms })).toThrow(/firstIndex/);
    expect(b.endFrame()).toEqual({ drawCalls: 0, triangles: 0 });
  });

  it('line-list pipelines take pairs of vertices and draw no triangle', () => {
    const b = new NullBackend();
    const lines = b.createPipeline({ ...pipelineDesc, topology: 'line-list' });
    const vertexBuffer = b.createBuffer({ usage: 'vertex', data: new Float32Array(4 * 6) });
    const indexBuffer = b.createBuffer({ usage: 'index', data: new Uint16Array([0, 1, 1, 2, 2, 3]) });
    b.beginFrame(CLEAR);
    b.draw({ pipeline: lines, vertexBuffer, vertexCount: 4 });
    b.draw({ pipeline: lines, vertexBuffer, indexBuffer, indexCount: 6 });
    expect(() => b.draw({ pipeline: lines, vertexBuffer, vertexCount: 3 })).toThrow(/multiple of 2/);
    expect(() => b.draw({ pipeline: lines, vertexBuffer, indexBuffer, indexCount: 5 })).toThrow(/multiple of 2/);
    expect(b.endFrame()).toEqual({ drawCalls: 2, triangles: 0 });
  });

  it('the two draw forms cannot be mixed', () => {
    const { b, pipeline, vertexBuffer, indexBuffer, uniforms } = indexedSetup();
    b.beginFrame(CLEAR);
    expect(() => b.draw({ pipeline, vertexBuffer, indexBuffer, indexCount: 6, vertexCount: 3, uniforms })).toThrow(/not vertexCount/);
    expect(() => b.draw({ pipeline, vertexBuffer, vertexCount: 3, indexCount: 3, uniforms })).toThrow(/need an indexBuffer/);
    expect(() => b.draw({ pipeline, vertexBuffer, uniforms })).toThrow(/vertexCount/);
  });
});

describe('validateVertexLayout', () => {
  it('accepts a correct layout', () => {
    expect(() => validateVertexLayout(layout)).not.toThrow();
  });
  it('rejects bad strides', () => {
    for (const stride of [0, -4, 10, 12.5]) {
      expect(() => validateVertexLayout({ stride, attributes: layout.attributes })).toThrow(/stride/);
    }
  });
  it('rejects empty, duplicated or overflowing attributes', () => {
    expect(() => validateVertexLayout({ stride: 12, attributes: [] })).toThrow(/no attribute/);
    expect(() =>
      validateVertexLayout({ stride: 24, attributes: [{ location: 0, format: 'float32x3', offset: 0 }, { location: 0, format: 'float32x3', offset: 12 }] }),
    ).toThrow(/duplicate/);
    expect(() => validateVertexLayout({ stride: 12, attributes: [{ location: 0, format: 'float32x4', offset: 0 }] })).toThrow(/overflows/);
    expect(() => validateVertexLayout({ stride: 12, attributes: [{ location: 0, format: 'float32x2', offset: 8 }] })).toThrow(/overflows/);
    expect(() => validateVertexLayout({ stride: 12, attributes: [{ location: -1, format: 'float32x3', offset: 0 }] })).toThrow(/location/);
  });
});
