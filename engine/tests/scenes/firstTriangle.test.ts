import { describe, expect, it } from 'vitest';
import { NullBackend, VERTEX_COLOR_LAYOUT, VERTEX_COLOR_SHADER, validateVertexLayout } from '../../src/renderer';
import { createFirstTriangleScene, FIRST_TRIANGLE_CLEAR } from '../../src/scenes/firstTriangle';

describe('first-triangle workload (backend-agnostic)', () => {
  it('issues exactly: clear, one draw of one triangle, end', () => {
    const backend = new NullBackend();
    const scene = createFirstTriangleScene(backend);
    expect(scene.render(16 / 9)).toEqual({ drawCalls: 1, triangles: 1 });
    expect(backend.events.map((e) => e.type)).toEqual(['beginFrame', 'draw', 'endFrame']);
    const begin = backend.events[0]!;
    expect(begin.type === 'beginFrame' && begin.clear).toEqual(FIRST_TRIANGLE_CLEAR);
    const draw = backend.events[1]!;
    expect(draw.type === 'draw' && draw.call.vertexCount).toBe(3);
  });
  it('renders the same thing every frame and releases its resources', () => {
    const backend = new NullBackend();
    const scene = createFirstTriangleScene(backend);
    for (let i = 0; i < 3; i++) expect(scene.render(16 / 9)).toEqual({ drawCalls: 1, triangles: 1 });
    expect([backend.liveBufferCount, backend.livePipelineCount]).toEqual([1, 1]);
    scene.dispose();
    expect([backend.liveBufferCount, backend.livePipelineCount]).toEqual([0, 0]);
  });
});

describe('vertexColor shader pair', () => {
  it('has a valid layout and both language versions', () => {
    expect(() => validateVertexLayout(VERTEX_COLOR_LAYOUT)).not.toThrow();
    expect(VERTEX_COLOR_SHADER.wgsl).toContain('fn vs_main');
    expect(VERTEX_COLOR_SHADER.wgsl).toContain('fn fs_main');
    expect(VERTEX_COLOR_SHADER.glslVertex.startsWith('#version 300 es')).toBe(true);
    expect(VERTEX_COLOR_SHADER.glslFragment.startsWith('#version 300 es')).toBe(true);
  });
  it('declares the same attribute locations in WGSL, GLSL and the layout', () => {
    for (const a of VERTEX_COLOR_LAYOUT.attributes) {
      expect(VERTEX_COLOR_SHADER.wgsl).toContain(`@location(${a.location})`);
      expect(VERTEX_COLOR_SHADER.glslVertex).toContain(`layout(location = ${a.location})`);
    }
  });
});
