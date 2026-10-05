import { describe, expect, it } from 'vitest';
import { NullBackend } from '../../src/renderer';
import { parseHoleMask, parseSceneRequest } from '../../src/scenes/select';
import { createTerrainChunkScene, TERRAIN_CHUNK_CLEAR } from '../../src/scenes/terrainChunk';
import { ORVALIS_DEFAULT, VANILLA_REFERENCE } from '../../src/terrain';

const options = { config: ORVALIS_DEFAULT, heightKind: 'hill', view: 'above', underlay: false } as const;

describe('terrain chunk scene (backend-agnostic)', () => {
  it('draws exactly one chunk: 1 indexed draw, 256 triangles, 768 indices', () => {
    const backend = new NullBackend();
    const scene = createTerrainChunkScene(backend, options);
    expect(scene.terrain).toEqual({ chunks: 1, vertices: 145, triangles: 256, submittedChunks: 1, drawCalls: 1, holes: 0, wireframe: false, debugMode: 'color' });
    expect(scene.render(16 / 9)).toEqual({ drawCalls: 1, triangles: 256 });
    const [begin, draw] = backend.events;
    expect(begin!.type === 'beginFrame' && begin!.clear).toEqual(TERRAIN_CHUNK_CLEAR);
    expect(draw!.type === 'draw' && draw!.call.indexCount).toBe(768);
    expect(draw!.type === 'draw' && draw!.call.uniforms?.byteLength).toBe(80);
  });

  it('the terrain pipeline uses depth and culls back faces', () => {
    const backend = new NullBackend();
    createTerrainChunkScene(backend, options).render(1);
    const draw = backend.events.find((e) => e.type === 'draw')!;
    expect(draw.type === 'draw' && backend.pipelineState(draw.call.pipeline)).toMatchObject({ depthTest: true, depthWrite: true, cullMode: 'back' });
  });

  it('the underlay adds one two-triangle draw AFTER the terrain', () => {
    const backend = new NullBackend();
    const scene = createTerrainChunkScene(backend, { ...options, underlay: true });
    expect(scene.render(1)).toEqual({ drawCalls: 2, triangles: 258 });
    const draws = backend.events.filter((e) => e.type === 'draw');
    expect(draws.map((d) => d.type === 'draw' && d.triangles)).toEqual([256, 2]);
    expect(scene.terrain.drawCalls).toBe(1); // the quad is not terrain
  });

  it('the projection matrix follows the aspect ratio', () => {
    const backend = new NullBackend();
    const scene = createTerrainChunkScene(backend, options);
    // The scene reuses one matrix array between frames, so each frame is copied right away.
    const lastMatrix = (): number[] => {
      const draw = backend.events.filter((e) => e.type === 'draw').at(-1);
      return draw?.type === 'draw' && draw.call.uniforms ? Array.from(draw.call.uniforms) : [];
    };
    scene.render(1);
    const square = lastMatrix();
    scene.render(2);
    const wide = lastMatrix();
    expect(wide[0]).toBeCloseTo(square[0]! / 2, 6); // x scale halves when the surface is twice as wide
    expect(wide[5]).toBeCloseTo(square[5]!, 6); // y scale unchanged
  });

  it('works with another physical scale and with every view and height kind', () => {
    for (const config of [ORVALIS_DEFAULT, VANILLA_REFERENCE]) {
      for (const view of ['oblique', 'above', 'below'] as const) {
        for (const heightKind of ['flat', 'slope', 'hill'] as const) {
          const backend = new NullBackend();
          const scene = createTerrainChunkScene(backend, { config, heightKind, view, underlay: true });
          expect(scene.render(16 / 9)).toEqual({ drawCalls: 2, triangles: 258 });
          const draw = backend.events.find((e) => e.type === 'draw')!;
          expect(draw.type === 'draw' && Array.from(draw.call.uniforms!).every(Number.isFinite)).toBe(true);
        }
      }
    }
  });

  it('dispose releases every resource', () => {
    const backend = new NullBackend();
    const scene = createTerrainChunkScene(backend, { ...options, underlay: true });
    expect([backend.liveBufferCount, backend.livePipelineCount]).toEqual([5, 3]);
    scene.dispose();
    expect([backend.liveBufferCount, backend.livePipelineCount]).toEqual([0, 0]);
  });
});

describe('terrain chunk scene: holes and wireframe (P1.3)', () => {
  it('a hole removes 16 triangles (48 indices) per mask bit; vertices are untouched', () => {
    const backend = new NullBackend();
    const scene = createTerrainChunkScene(backend, { ...options, holes: 0b101 });
    expect(scene.terrain).toMatchObject({ vertices: 145, triangles: 224, holes: 2 });
    expect(scene.render(1)).toEqual({ drawCalls: 1, triangles: 224 });
    const draw = backend.events.find((e) => e.type === 'draw')!;
    expect(draw.type === 'draw' && draw.call.indexCount).toBe(768 - 2 * 48);
  });

  it('a fully holed chunk issues no terrain draw at all', () => {
    const backend = new NullBackend();
    const scene = createTerrainChunkScene(backend, { ...options, holes: 0xffff, underlay: true });
    expect(scene.terrain).toMatchObject({ triangles: 0, holes: 16 });
    expect(scene.render(1)).toEqual({ drawCalls: 1, triangles: 2 }); // only the underlay
    scene.setWireframe(true);
    // every edge belongs to a removed triangle → nothing to draw... except that a 0-index draw must not be issued
    expect(scene.render(1).drawCalls).toBe(1);
  });

  it('wireframe draws lines INSTEAD of triangles, with the same vertices', () => {
    const backend = new NullBackend();
    const scene = createTerrainChunkScene(backend, { ...options, wireframe: true });
    expect(scene.terrain).toMatchObject({ triangles: 256, wireframe: true });
    expect(scene.render(1)).toEqual({ drawCalls: 1, triangles: 0 });
    const draw = backend.events.find((e) => e.type === 'draw')!;
    expect(draw.type === 'draw' && draw.call.indexCount).toBe(800); // 400 unique edges
    expect(draw.type === 'draw' && backend.pipelineState(draw.call.pipeline)).toMatchObject({ topology: 'line-list', depthTest: true });
  });

  it('toggles at run time, back and forth, without creating resources', () => {
    const backend = new NullBackend();
    const scene = createTerrainChunkScene(backend, options);
    const live = [backend.liveBufferCount, backend.livePipelineCount];
    expect(scene.render(1).triangles).toBe(256);
    expect(scene.toggleWireframe()).toBe(true);
    expect(scene.terrain.wireframe).toBe(true);
    expect(scene.render(1).triangles).toBe(0);
    expect(scene.toggleWireframe()).toBe(false);
    expect(scene.render(1).triangles).toBe(256);
    scene.setWireframe(true);
    expect(scene.terrain.wireframe).toBe(true);
    expect([backend.liveBufferCount, backend.livePipelineCount]).toEqual(live);
  });

  it('the wireframe of a holed chunk has fewer edges', () => {
    const backend = new NullBackend();
    const scene = createTerrainChunkScene(backend, { ...options, holes: 1, wireframe: true });
    scene.render(1);
    const draw = backend.events.find((e) => e.type === 'draw')!;
    expect(draw.type === 'draw' && draw.call.indexCount).toBeLessThan(800);
    expect(draw.type === 'draw' && (draw.call.indexCount ?? 1) % 2).toBe(0);
  });
});

describe('terrain chunk scene: normals (P1.4)', () => {
  const lastTerrainDraw = (backend: NullBackend) => {
    const d = backend.events.find((e) => e.type === 'draw');
    if (d?.type !== 'draw') throw new Error('no draw');
    return d.call;
  };

  it('the terrain vertex buffer holds position · normal · colour (36 bytes per vertex)', () => {
    const backend = new NullBackend();
    const scene = createTerrainChunkScene(backend, { ...options, heightKind: 'flat' });
    scene.render(1);
    const call = lastTerrainDraw(backend);
    expect(backend.pipelineState(call.pipeline)).toMatchObject({ topology: 'triangle-list' });
    const data = backend.bufferData(call.vertexBuffer) as Float32Array;
    expect(data.byteLength).toBe(145 * 36);
    // Flat ground: floats 3..5 of every vertex are the normal (0, 0, 1).
    for (let v = 0; v < 145; v++) expect([data[v * 9 + 3], data[v * 9 + 4], data[v * 9 + 5]]).toEqual([0, 0, 1]);
  });

  it('the debug mode travels in the uniform block after the matrix, and can change at run time', () => {
    const backend = new NullBackend();
    const scene = createTerrainChunkScene(backend, { ...options, debugMode: 'normals' });
    expect(scene.terrain.debugMode).toBe('normals');
    scene.render(1);
    expect(lastTerrainDraw(backend).uniforms![16]).toBe(1);
    scene.setDebugMode('color');
    backend.events.length = 0;
    scene.render(1);
    expect(lastTerrainDraw(backend).uniforms![16]).toBe(0);
    expect(scene.terrain.debugMode).toBe('color');
  });

  it('reads ?terrainDebug', () => {
    expect(parseSceneRequest('?terrainDebug=normals')).toMatchObject({ debugMode: 'normals' });
    expect(parseSceneRequest('?terrainDebug=lit')).toMatchObject({ debugMode: 'color' });
  });
});

describe('parseHoleMask', () => {
  it('reads decimal and hexadecimal masks', () => {
    expect(parseHoleMask('0')).toBe(0);
    expect(parseHoleMask('1024')).toBe(1024);
    expect(parseHoleMask('0x400')).toBe(1024);
    expect(parseHoleMask('65535')).toBe(0xffff);
    expect(parseHoleMask('0xFFFF')).toBe(0xffff);
  });
  it('anything else means no hole', () => {
    for (const bad of [null, '', 'abc', '-1', '65536', '1.5', '0x10000', '1e3', ' ']) expect(parseHoleMask(bad)).toBe(0);
  });
  it('is wired into parseSceneRequest with wireframe', () => {
    expect(parseSceneRequest('?scene=chunk&holes=5&wireframe=on')).toMatchObject({ holes: 5, wireframe: true });
    expect(parseSceneRequest('?scene=chunk&holes=nope&wireframe=yes')).toMatchObject({ holes: 0, wireframe: false, debugMode: 'color' });
  });
});

describe('parseSceneRequest', () => {
  it('defaults to the hill chunk in oblique view, no underlay', () => {
    expect(parseSceneRequest('?scene=chunk')).toEqual({ scene: 'chunk', heightKind: 'hill', view: 'oblique', underlay: false, holes: 0, wireframe: false, debugMode: 'color' });
    expect(parseSceneRequest('?engine=new&scene=chunk')).toEqual({ scene: 'chunk', heightKind: 'hill', view: 'oblique', underlay: false, holes: 0, wireframe: false, debugMode: 'color' });
  });
  it('reads every option', () => {
    expect(parseSceneRequest('?scene=chunk&height=slope&view=above&underlay=on')).toEqual({ scene: 'chunk', heightKind: 'slope', view: 'above', underlay: true, holes: 0, wireframe: false, debugMode: 'color' });
    expect(parseSceneRequest('?scene=chunk&height=FLAT&view=below')).toEqual({ scene: 'chunk', heightKind: 'flat', view: 'below', underlay: false, holes: 0, wireframe: false, debugMode: 'color' });
    expect(parseSceneRequest('?scene=triangle&height=slope')).toEqual({ scene: 'triangle' });
  });
  it('unknown values fall back to the defaults', () => {
    expect(parseSceneRequest('?scene=chunk&height=cliff&view=inside&underlay=maybe')).toEqual({ scene: 'chunk', heightKind: 'hill', view: 'oblique', underlay: false, holes: 0, wireframe: false, debugMode: 'color' });
  });
});
