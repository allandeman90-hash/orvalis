import { describe, expect, it } from 'vitest';
import { NullBackend } from '../../src/renderer';
import { parseHoleChunks, parseSceneRequest, parseTileCoord } from '../../src/scenes/select';
import { createTerrainTileScene } from '../../src/scenes/terrainTile';
import { ORVALIS_DEFAULT, VANILLA_REFERENCE } from '../../src/terrain';

const options = { config: ORVALIS_DEFAULT, tile: { x: 0, y: 0 }, heightKind: 'hills', view: 'oblique' } as const;
const draws = (backend: NullBackend) => backend.events.flatMap((e) => (e.type === 'draw' ? [e] : []));

describe('terrain tile scene (backend-agnostic)', () => {
  it('submits 256 chunks as 256 separate indexed draws: 65 536 triangles', () => {
    const backend = new NullBackend();
    const scene = createTerrainTileScene(backend, options);
    expect(scene.render(16 / 9)).toEqual({ drawCalls: 256, triangles: 65536 });
    expect(scene.terrain).toEqual({ tile: { x: 0, y: 0 }, chunks: 256, vertices: 37120, triangles: 65536, submittedChunks: 256, drawCalls: 256, culling: true, visibleChunks: 256, culledChunks: 0, holes: 0, wireframe: false, debugMode: 'color', chunkBounds: false, lit: true, sky: false });
    const all = draws(backend);
    expect(all.length).toBe(256);
    expect(new Set(all.map((d) => d.call.vertexBuffer)).size).toBe(256); // one vertex buffer per chunk: not merged
    expect(all.every((d) => d.call.indexCount === 768 && d.triangles === 256)).toBe(true);
    expect(all.every((d) => (backend.bufferData(d.call.vertexBuffer) as Float32Array).byteLength === 145 * 36)).toBe(true);
    expect(Array.from(all[0]!.call.uniforms!).every(Number.isFinite)).toBe(true);
  });

  it('holes: a fully holed chunk is not submitted, a partly holed one draws fewer triangles, the others are untouched', () => {
    const backend = new NullBackend();
    const scene = createTerrainTileScene(backend, { ...options, holes: [{ chunkX: 3, chunkY: 4, mask: 1 }, { chunkX: 9, chunkY: 9, mask: 0xffff }] });
    expect(scene.render(1)).toEqual({ drawCalls: 255, triangles: 65536 - 16 - 256 });
    // The fully holed chunk is in view (visible) but has nothing to submit.
    expect(scene.terrain).toMatchObject({ chunks: 256, vertices: 37120, triangles: 65536 - 16 - 256, visibleChunks: 256, submittedChunks: 255, drawCalls: 255, holes: 17 });
    const counts = draws(backend).map((d) => d.call.indexCount);
    expect(counts.filter((c) => c === 768).length).toBe(254);
    expect(counts.filter((c) => c === 720).length).toBe(1);
  });

  it('wireframe (F4) still works: 256 line draws, no triangle', () => {
    const backend = new NullBackend();
    const scene = createTerrainTileScene(backend, options);
    expect(scene.toggleWireframe()).toBe(true);
    expect(scene.render(1)).toEqual({ drawCalls: 256, triangles: 0 });
    expect(draws(backend).every((d) => d.call.indexCount === 800 && backend.pipelineState(d.call.pipeline)?.topology === 'line-list')).toBe(true);
    expect(scene.toggleWireframe()).toBe(false);
  });

  it('chunk bounds: 256 extra line draws on top, without depth test, geometry and terrain statistics unchanged', () => {
    const backend = new NullBackend();
    const scene = createTerrainTileScene(backend, { ...options, chunkBounds: true });
    expect(scene.render(1)).toEqual({ drawCalls: 512, triangles: 65536 });
    expect(scene.terrain).toMatchObject({ chunkBounds: true, drawCalls: 256, triangles: 65536 });
    const all = draws(backend);
    const bounds = all.slice(256);
    expect(bounds.every((d) => d.call.indexCount === 64)).toBe(true);
    expect(backend.pipelineState(bounds[0]!.call.pipeline)).toMatchObject({ topology: 'line-list', depthTest: false, depthWrite: false });
    expect(bounds.map((d) => d.call.vertexBuffer)).toEqual(all.slice(0, 256).map((d) => d.call.vertexBuffer)); // the chunks' own vertices
    expect(Array.from(bounds[0]!.call.uniforms!.slice(16, 20))).toEqual([2, 1, 1, 0]);
    expect(scene.toggleChunkBounds()).toBe(false);
    backend.events.length = 0;
    expect(scene.render(1).drawCalls).toBe(256);
  });

  it('works for negative tiles, another scale, every view, zoom and normals debug', () => {
    for (const config of [ORVALIS_DEFAULT, VANILLA_REFERENCE]) {
      for (const tile of [{ x: -1, y: 0 }, { x: -2, y: 3 }]) {
        for (const view of ['oblique', 'above', 'below'] as const) {
          const backend = new NullBackend();
          const scene = createTerrainTileScene(backend, { config, tile, heightKind: 'hills', view, zoom: view === 'above' ? 16 : 1, debugMode: 'normals', culling: false });
          expect(scene.terrain.tile).toEqual(tile);
          expect(scene.render(16 / 9)).toEqual({ drawCalls: 256, triangles: 65536 });
          const u = draws(backend)[0]!.call.uniforms!;
          expect(Array.from(u).every(Number.isFinite)).toBe(true);
          expect(u[16]).toBe(1);
        }
      }
    }
    expect(() => createTerrainTileScene(new NullBackend(), { ...options, zoom: 0 })).toThrow(/zoom/);
  });

  it('index buffers are shared by hole mask, and dispose releases everything', () => {
    const backend = new NullBackend();
    const scene = createTerrainTileScene(backend, { ...options, holes: [{ chunkX: 1, chunkY: 1, mask: 2 }] });
    // 256 vertex buffers + (triangles, wire) × 2 masks + 1 bounds ; 7 pipelines (terrain, wire, bounds, textured, far, liquid blended, liquid opaque)
    expect([backend.liveBufferCount, backend.livePipelineCount]).toEqual([256 + 4 + 1, 7]);
    scene.dispose();
    expect([backend.liveBufferCount, backend.livePipelineCount]).toEqual([0, 0]);
  });
});

describe('terrain tile scene — frustum culling per chunk (P1.6)', () => {
  const flat = { ...options, heightKind: 'flat', view: 'above' } as const;

  it('zoom 4 from above, flat tile, 16:9: exactly the 16 × 10 chunks under the camera are visible', () => {
    // Visible ground: half-height = 1.875·(512/4)·tan 30° = 138.56 → y in [117.4, 394.6] → chunk rows 3..12 (10 rows);
    // half-width = 138.56·16/9 = 246.3 → x in [9.7, 502.3] → all 16 columns.
    const backend = new NullBackend();
    const scene = createTerrainTileScene(backend, { ...flat, zoom: 4 });
    expect(scene.render(16 / 9)).toEqual({ drawCalls: 160, triangles: 160 * 256 });
    expect(scene.terrain).toMatchObject({ culling: true, visibleChunks: 160, culledChunks: 96, submittedChunks: 160, drawCalls: 160, chunks: 256, triangles: 65536 });
    // Which ones: one draw per chunk, in chunk order → the vertex buffers of rows 3..12.
    const all = new NullBackend();
    const reference = createTerrainTileScene(all, { ...flat, zoom: 4, culling: false });
    reference.render(16 / 9);
    expect(draws(all).length).toBe(256);
    expect(draws(backend).map((d) => d.call.vertexBuffer)).toEqual(draws(all).slice(3 * 16, 13 * 16).map((d) => d.call.vertexBuffer));
  });

  it('the count follows the aspect ratio and the zoom', () => {
    const count = (zoom: number, aspect: number): number => {
      const scene = createTerrainTileScene(new NullBackend(), { ...flat, zoom });
      scene.render(aspect);
      return scene.terrain.visibleChunks!;
    };
    expect(count(1, 16 / 9)).toBe(256);
    expect(count(4, 1)).toBe(100); // half-width = half-height = 138.56 → 10 × 10
    expect(count(16, 16 / 9)).toBe(4 * 4); // x in [194.4, 317.6] → columns 6..9 ; y in [221.4, 290.6] → rows 6..9
    expect(count(64, 1)).toBe(4); // just the 4 chunks around the tile centre
  });

  it('works on a negative tile: same counts as at the origin', () => {
    for (const tile of [{ x: -1, y: 0 }, { x: -2, y: 3 }]) {
      const scene = createTerrainTileScene(new NullBackend(), { ...flat, tile, zoom: 4 });
      scene.render(16 / 9);
      expect(scene.terrain).toMatchObject({ visibleChunks: 160, culledChunks: 96 });
    }
  });

  it('culling off: nothing is tested, everything is submitted, and no "visible" number is claimed', () => {
    const backend = new NullBackend();
    const scene = createTerrainTileScene(backend, { ...flat, zoom: 4, culling: false });
    expect(scene.render(16 / 9).drawCalls).toBe(256);
    expect(scene.terrain).toMatchObject({ culling: false, submittedChunks: 256, drawCalls: 256 });
    expect(scene.terrain.visibleChunks).toBeUndefined();
    expect(scene.toggleCulling()).toBe(true);
    backend.events.length = 0;
    expect(scene.render(16 / 9).drawCalls).toBe(160);
    expect(scene.toggleCulling()).toBe(false);
  });

  it('chunk bounds and wireframe are culled the same way; a holed-out visible chunk is visible but not submitted', () => {
    const backend = new NullBackend();
    const scene = createTerrainTileScene(backend, { ...flat, zoom: 4, chunkBounds: true, holes: [{ chunkX: 8, chunkY: 8, mask: 0xffff }, { chunkX: 0, chunkY: 0, mask: 0xffff }] });
    expect(scene.render(16 / 9).drawCalls).toBe(159 + 160);
    expect(scene.terrain).toMatchObject({ visibleChunks: 160, submittedChunks: 159 });
    scene.toggleWireframe();
    backend.events.length = 0;
    expect(scene.render(16 / 9)).toEqual({ drawCalls: 159 + 160, triangles: 0 });
  });

  it('with relief, the box of a chunk uses its real heights: the same counts on both depth conventions', () => {
    const scene = createTerrainTileScene(new NullBackend(), { ...options, zoom: 3 });
    scene.render(16 / 9);
    const n = scene.terrain.visibleChunks!;
    expect(n).toBeGreaterThan(20);
    expect(n).toBeLessThan(256);
  });
});

describe('scene request — tile', () => {
  it('the tile is the default scene', () => {
    expect(parseSceneRequest('')).toEqual({ scene: 'tile', paint: undefined, palette: 'procedural', layerRepeatsPerChunk: 4, lit: true, fog: 'off', sky: false, liquidLevel: 0, tile: { x: 0, y: 0 }, heightKind: 'hills', view: 'oblique', zoom: 1, holes: [], wireframe: false, debugMode: 'color', chunkBounds: false, culling: true, normals: 'seamless' });
  });
  it('reads every tile option', () => {
    expect(parseSceneRequest('?scene=tile&tile=-2,3&height=slope&view=above&zoom=16&chunkBounds=on&wireframe=on&terrainDebug=normals&tileNormals=isolated&holeChunks=3:4:1,9:9:0xffff')).toEqual({
      scene: 'tile', paint: undefined, palette: 'procedural', layerRepeatsPerChunk: 4, lit: true, fog: 'off', sky: false, liquidLevel: 0, tile: { x: -2, y: 3 }, heightKind: 'slope', view: 'above', zoom: 16, holes: [{ chunkX: 3, chunkY: 4, mask: 1 }, { chunkX: 9, chunkY: 9, mask: 0xffff }], wireframe: true, debugMode: 'normals', chunkBounds: true, culling: true, normals: 'isolated',
    });
  });
  it('bad values fall back', () => {
    expect(parseTileCoord('1.5,2')).toEqual({ x: 0, y: 0 });
    expect(parseTileCoord('abc')).toEqual({ x: 0, y: 0 });
    expect(parseTileCoord(' -7 , 12 ')).toEqual({ x: -7, y: 12 });
    expect(parseHoleChunks('16:0:1,0:0:0,x,3:4:70000,2:2:5')).toEqual([{ chunkX: 2, chunkY: 2, mask: 5 }]);
    expect(parseSceneRequest('?zoom=0&tileNormals=x')).toMatchObject({ zoom: 1, normals: 'seamless' });
    expect(parseSceneRequest('?zoom=1000')).toMatchObject({ zoom: 1 });
    expect(parseSceneRequest('?culling=off')).toMatchObject({ culling: false });
    expect(parseSceneRequest('?culling=maybe')).toMatchObject({ culling: true });
  });
});
