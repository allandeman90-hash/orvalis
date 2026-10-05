import { describe, expect, it } from 'vitest';
import { NullBackend } from '../../src/renderer';
import { parseSceneRequest, parseWorldPoint } from '../../src/scenes/select';
import { createTerrainStreamScene } from '../../src/scenes/terrainStream';
import { ORVALIS_DEFAULT } from '../../src/terrain';
import { TerrainRenderer } from '../../src/terrainRender';
import { buildTerrainTile, TerrainMap, tileHeightFixture } from '../../src/terrain';

const T = ORVALIS_DEFAULT.tileSize;
const base = { config: ORVALIS_DEFAULT, focus: { x: 256, y: 256 }, streaming: { loadRadius: 1, unloadRadius: 2, maxLoadsPerUpdate: 1 }, view: 'above', heightKind: 'flat', frameBudgetMs: Number.POSITIVE_INFINITY } as const;
const settle = (scene: ReturnType<typeof createTerrainStreamScene>, frames = 40): void => {
  for (let k = 0; k < frames; k++) scene.render(16 / 9);
};

describe('terrain stream scene (backend-agnostic)', () => {
  it('loads one tile per frame around the focus, then stays stable', () => {
    const backend = new NullBackend();
    const scene = createTerrainStreamScene(backend, base);
    const tiles: number[] = [];
    for (let k = 0; k < 10; k++) {
      scene.render(16 / 9);
      tiles.push(scene.terrain.tiles!);
    }
    expect(tiles).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 8, 8]); // 3 × 3 minus the absent tile (1,1)
    expect(scene.terrain).toMatchObject({ map: 'continent', tiles: 8, chunks: 8 * 256, vertices: 8 * 37120, triangles: 8 * 65536 });
    expect(scene.terrain.streaming).toMatchObject({ focus: { x: 256, y: 256 }, focusTile: { x: 0, y: 0 }, loadRadius: 1, unloadRadius: 2, pending: 0, gpuQueue: 0, loadedTotal: 8, unloadedTotal: 0 });
    expect(backend.liveBufferCount).toBe(8 * 256 + 3);
  });

  it('moving the focus loads ahead, unloads behind and frees the GPU buffers of unloaded tiles', () => {
    const backend = new NullBackend();
    const scene = createTerrainStreamScene(backend, base);
    settle(scene);
    scene.setFocus(2.5 * T, 256); // tile (2, 0)
    settle(scene);
    expect(scene.terrain.streaming).toMatchObject({ focusTile: { x: 2, y: 0 }, pending: 0, loadedTotal: 14, unloadedTotal: 3 });
    expect(scene.terrain.tiles).toBe(11);
    expect(backend.liveBufferCount).toBe(11 * 256 + 3);
    scene.setFocus(1e7, 1e7); // nothing exists there
    settle(scene, 3);
    expect(scene.terrain.tiles).toBe(8); // unloading is spread too: one tile per frame
    expect(scene.terrain.streaming!.pending).toBe(8);
    settle(scene, 12);
    expect(scene.terrain).toMatchObject({ tiles: 0, chunks: 0, triangles: 0, visibleChunks: 0, submittedChunks: 0 });
    expect(scene.render(16 / 9)).toEqual({ drawCalls: 0, triangles: 0 });
    expect(backend.liveBufferCount).toBe(3); // only the shared index buffers remain
    scene.moveFocus(-1e7 + 256, -1e7 + 256);
    settle(scene);
    expect(scene.terrain.tiles).toBe(8);
    scene.dispose();
    expect([backend.liveBufferCount, backend.livePipelineCount]).toEqual([0, 0]);
  });

  it('only what the camera sees is submitted, and the camera follows the focus', () => {
    const backend = new NullBackend();
    const scene = createTerrainStreamScene(backend, { ...base, zoom: 4 });
    settle(scene);
    // Same footprint as the tile scene at zoom 4 (16 × 10 chunks), centred on the focus: all inside tile (0,0).
    expect(scene.terrain).toMatchObject({ visibleChunks: 160, submittedChunks: 160, chunks: 8 * 256 });
    const matrixBefore = Array.from(backend.events.flatMap((e) => (e.type === 'draw' ? [e] : [])).at(-1)!.call.uniforms!);
    scene.moveFocus(100, 0);
    scene.render(16 / 9);
    const matrixAfter = Array.from(backend.events.flatMap((e) => (e.type === 'draw' ? [e] : [])).at(-1)!.call.uniforms!);
    expect(matrixAfter).not.toEqual(matrixBefore);
    expect(scene.focus).toEqual({ x: 356, y: 256 });
    expect(() => scene.setFocus(Number.NaN, 0)).toThrow(/finite/);
  });

  it('what is on the GPU always matches the map: tiles that arrive later re-stitch their neighbours there too', () => {
    const backend = new NullBackend();
    const scene = createTerrainStreamScene(backend, { ...base, heightKind: 'dunes', culling: false });
    const check = (): number => {
      backend.events.length = 0;
      scene.render(16 / 9);
      const drawn = backend.events.flatMap((e) => (e.type === 'draw' ? [backend.bufferData(e.call.vertexBuffer) as Float32Array] : []));
      // Culling is off, so draws follow the loading order of the tiles, chunk by chunk.
      const chunks = [...scene.map.tiles()].flatMap((t) => t.tile.chunks);
      expect(drawn.length).toBe(chunks.length);
      drawn.forEach((data, c) => {
        const normals = chunks[c]!.geometry.normals;
        for (let v = 0; v < 145; v++) {
          if (data[v * 9 + 3] !== normals[v * 3] || data[v * 9 + 4] !== normals[v * 3 + 1] || data[v * 9 + 5] !== normals[v * 3 + 2]) throw new Error(`stale normal on the GPU: draw ${c}, vertex ${v}`);
        }
      });
      return drawn.length;
    };
    for (let k = 0; k < 12; k++) check(); // while tiles arrive one per frame
    scene.setFocus(2.5 * T, 256);
    for (let k = 0; k < 12; k++) check(); // while tiles arrive and leave
    expect(check()).toBe(11 * 256);
  });

  it('a resident tile whose neighbour arrives gets its border chunks re-uploaded with the new normals', () => {
    const backend = new NullBackend();
    const renderer = new TerrainRenderer(backend, () => [0, 0, 0]);
    const map = new TerrainMap('m', ORVALIS_DEFAULT);
    const f = tileHeightFixture(ORVALIS_DEFAULT, 'dunes');
    const a = buildTerrainTile(ORVALIS_DEFAULT, { x: 0, y: 0 }, f), b = buildTerrainTile(ORVALIS_DEFAULT, { x: 1, y: 0 }, f);
    map.set(a);
    renderer.addTile(a);
    expect(() => renderer.addTile(a)).toThrow(/already uploaded/);
    const uploaded = (): Float32Array[] => {
      backend.events.length = 0;
      backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
      renderer.draw(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), { wireframe: false, debugMode: 'color', chunkBounds: false, culling: false });
      backend.endFrame();
      return backend.events.flatMap((e) => (e.type === 'draw' ? [backend.bufferData(e.call.vertexBuffer) as Float32Array] : []));
    };
    const before = uploaded().map((d) => Array.from(d));
    map.set(b); // stitches a's east border
    expect(uploaded().map((d) => Array.from(d))).toEqual(before); // the GPU copy is stale until refreshed
    expect(renderer.refreshTileBorder({ x: 0, y: 0 })).toBe(true);
    expect(renderer.refreshTileBorder({ x: 5, y: 5 })).toBe(false);
    const after = uploaded();
    expect(after.length).toBe(256);
    // The GPU copy now holds the tile's current normals, chunk by chunk.
    after.forEach((data, c) => {
      const normals = a.chunks[c]!.geometry.normals;
      for (let v = 0; v < 145; v++) expect([data[v * 9 + 3], data[v * 9 + 4], data[v * 9 + 5]]).toEqual([normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]]);
    });
    expect(after.filter((d, c) => Array.from(d).some((x, k) => x !== before[c]![k])).length).toBeGreaterThan(8); // the east column changed
    expect(backend.liveBufferCount).toBe(256 + 3); // nothing leaked by the refresh
    expect(renderer.removeTile({ x: 0, y: 0 })).toBe(true);
    expect(renderer.removeTile({ x: 0, y: 0 })).toBe(false);
    renderer.dispose();
    expect(backend.liveBufferCount).toBe(0);
  });
});

describe('terrain stream scene — work spread over frames (regression: stutter when a tile arrives)', () => {
  /** A clock that advances by 1 « ms » each time it is read: the budget becomes a number of work units. */
  const fakeClock = () => {
    let t = 0;
    return () => t++;
  };
  const budgeted = (frameBudgetMs: number) => ({ ...base, heightKind: 'dunes' as const, paint: 'natural' as const, debugMode: 'textured' as const, frameBudgetMs, now: fakeClock() });

  it('no frame does more than its budget: a tile is built and uploaded over many frames', () => {
    const backend = new NullBackend();
    const scene = createTerrainStreamScene(backend, budgeted(40));
    let frames = 0, worstUploads = 0, previous = backend.liveBufferCount + backend.liveTextureCount;
    while ((scene.terrain.streaming!.pending > 0 || scene.terrain.streaming!.gpuQueue > 0 || frames === 0) && frames < 5000) {
      scene.render(16 / 9);
      frames++;
      const live = backend.liveBufferCount + backend.liveTextureCount;
      worstUploads = Math.max(worstUploads, live - previous);
      previous = live;
    }
    // 8 tiles × 513 build units + 8 × 256 chunk uploads, at most ~20 units of each kind per frame.
    expect(frames).toBeGreaterThan(8 * 513 / 20);
    expect(frames).toBeLessThan(5000);
    // An upload task creates 1 vertex buffer + 1 mask (+ shared index buffers the first time). When no build is
    // running the whole budget (40 units) goes to the GPU queue: at most 40 tasks — never a whole tile (512 objects) in one frame.
    expect(worstUploads).toBeLessThanOrEqual(2 * 40 + 2);
    expect(worstUploads).toBeGreaterThan(0);
    expect(scene.terrain).toMatchObject({ tiles: 8, chunks: 8 * 256 });
    expect(scene.terrain.streaming).toMatchObject({ pending: 0, gpuQueue: 0, loadedTotal: 8 });
    // The fake clock ticks once per read: the reported work per frame stays near the budget (40), never a whole tile.
    expect(scene.terrain.streaming!.workMaxMs).toBeLessThanOrEqual(45);
    expect(scene.terrain.streaming!.workMaxMs).toBeGreaterThan(20);
  });

  it('the result is the same as without a budget: same tiles, same normals on the GPU', () => {
    const drawn = (frameBudgetMs: number): number[][] => {
      const backend = new NullBackend();
      const scene = createTerrainStreamScene(backend, { ...budgeted(frameBudgetMs), culling: false });
      for (let k = 0; k < 4000 && (k < 2 || scene.terrain.streaming!.pending > 0 || scene.terrain.streaming!.gpuQueue > 0); k++) scene.render(16 / 9);
      scene.setFocus(2.5 * T, 256);
      for (let k = 0; k < 4000 && (k < 2 || scene.terrain.streaming!.pending > 0 || scene.terrain.streaming!.gpuQueue > 0); k++) scene.render(16 / 9);
      backend.events.length = 0;
      scene.render(16 / 9);
      // Sorted by chunk origin, so that the order of arrival does not matter.
      return backend.events
        .flatMap((e) => (e.type === 'draw' ? [Array.from(backend.bufferData(e.call.vertexBuffer) as Float32Array)] : []))
        .sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
    };
    const sliced = drawn(16), atOnce = drawn(Number.POSITIVE_INFINITY);
    expect(sliced.length).toBe(11 * 256);
    expect(sliced).toEqual(atOnce);
  });

  it('nothing leaks when tiles leave while their uploads are still queued', () => {
    const backend = new NullBackend();
    const scene = createTerrainStreamScene(backend, budgeted(16));
    for (let k = 0; k < 150; k++) scene.render(16 / 9); // in the middle of loading
    scene.setFocus(1e7, 1e7); // everything must go, including half-uploaded tiles and the build in progress
    for (let k = 0; k < 4000 && (k < 2 || scene.terrain.streaming!.gpuQueue > 0); k++) scene.render(16 / 9);
    expect(scene.terrain).toMatchObject({ tiles: 0, chunks: 0 });
    expect(backend.liveTextureCount).toBe(4 + 1); // palette + default mask
    expect(backend.liveBufferCount).toBe(3); // shared index buffers only
    scene.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });

  it('rejects a non-positive budget', () => {
    expect(() => createTerrainStreamScene(new NullBackend(), { ...base, frameBudgetMs: 0 })).toThrow(/frameBudgetMs/);
  });
});

describe('terrain stream scene — fog', () => {
  it('by default the fog is complete at the distance up to which tiles are guaranteed (loadRadius × tileSize)', () => {
    const backend = new NullBackend();
    const scene = createTerrainStreamScene(backend, { ...base, debugMode: 'textured', streaming: { loadRadius: 2, unloadRadius: 3, maxLoadsPerUpdate: 1 } });
    for (let k = 0; k < 30; k++) scene.render(16 / 9);
    expect(scene.terrain.fog).toBe(true);
    const u = backend.events.flatMap((e) => (e.type === 'draw' ? [e] : [])).at(-1)!.call.uniforms!;
    const start = u[40]!, end = start + 1 / u[41]!;
    // Camera 1.875 × (tileSize / 4) above the focus; fog from 15 % to 60 % of the guaranteed distance beyond that.
    const eyeDistance = 1.875 * (T / 4);
    expect(start).toBeCloseTo(eyeDistance + 0.15 * 2 * T, 1);
    expect(end).toBeCloseTo(eyeDistance + 0.6 * 2 * T, 0);
    const off = createTerrainStreamScene(new NullBackend(), { ...base, debugMode: 'textured', fog: 'off' });
    off.render(1);
    expect(off.terrain.fog).toBeUndefined();
  });
});

describe('terrain stream scene — far terrain', () => {
  it('keeps the existing tiles of the ±3 window as far tiles, draws them behind, and T hides them', () => {
    const backend = new NullBackend();
    const scene = createTerrainStreamScene(backend, { ...base, debugMode: 'textured', farRadius: 3, culling: false });
    for (let k = 0; k < 40; k++) scene.render(16 / 9);
    expect(scene.terrain.far).toEqual({ visible: true, tiles: 31, drawn: 31, radius: 3 });
    expect(scene.render(16 / 9).drawCalls).toBe(31 + 8 * 256);
    expect(scene.toggleFar()).toBe(false);
    expect(scene.render(16 / 9).drawCalls).toBe(8 * 256);
    expect(scene.terrain.far).toMatchObject({ visible: false, tiles: 31, drawn: 0 });
    scene.toggleFar();
    scene.setFocus(1e7, 1e7);
    for (let k = 0; k < 20; k++) scene.render(16 / 9);
    expect(scene.terrain.far).toMatchObject({ tiles: 0, drawn: 0 });
    scene.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });

  it('with far terrain the fog reaches the edge of the far window; without it, no far tiles at all', () => {
    const fogEnd = (farRadius: number): number => {
      const backend = new NullBackend();
      const scene = createTerrainStreamScene(backend, { ...base, debugMode: 'textured', farRadius });
      for (let k = 0; k < 12; k++) scene.render(16 / 9);
      if (farRadius === 0) expect(scene.terrain.far).toBeUndefined();
      const u = backend.events.flatMap((e) => (e.type === 'draw' ? [e] : [])).at(-1)!.call.uniforms!;
      return u[40]! + 1 / u[41]!;
    };
    const eyeDistance = 1.875 * (T / 4);
    expect(fogEnd(0)).toBeCloseTo(eyeDistance + 0.6 * T, 0);
    expect(fogEnd(3)).toBeCloseTo(eyeDistance + 0.85 * 3 * T, 0);
  });

  it('reads ?far and ?farRadius', () => {
    expect(parseSceneRequest('?scene=stream')).toMatchObject({ farRadius: 3 });
    expect(parseSceneRequest('?scene=stream&far=off')).toMatchObject({ farRadius: 0 });
    expect(parseSceneRequest('?scene=stream&farRadius=5')).toMatchObject({ farRadius: 5 });
    expect(parseSceneRequest('?scene=stream&farRadius=99')).toMatchObject({ farRadius: 3 });
  });
});

describe('scene request — stream', () => {
  it('defaults and options', () => {
    expect(parseSceneRequest('?scene=stream')).toEqual({ scene: 'stream', paint: 'natural', palette: 'procedural', layerRepeatsPerChunk: 4, lit: true, fog: 'on', sky: true, focus: { x: 256, y: 256 }, streaming: { loadRadius: 1, unloadRadius: 2, maxLoadsPerUpdate: 1 }, heightKind: undefined, view: 'oblique', liquidLevel: 0, liquidOff: false, zoom: 4, pitchDegrees: undefined, headingDegrees: undefined, farRadius: 3, frameBudgetMs: 4, stitchTileBorders: true, wireframe: false, debugMode: 'textured', chunkBounds: false, culling: true });
    expect(parseSceneRequest('?scene=stream&focus=-512.5,208.8&loadRadius=2&unloadRadius=4&view=above&zoom=16&tileBorders=raw&height=flat&terrainDebug=normals')).toMatchObject({ focus: { x: -512.5, y: 208.8 }, streaming: { loadRadius: 2, unloadRadius: 4 }, view: 'above', zoom: 16, stitchTileBorders: false, heightKind: 'flat', debugMode: 'normals' });
    // unloadRadius is never below loadRadius; nonsense falls back.
    expect(parseSceneRequest('?scene=stream&loadRadius=3&unloadRadius=1')).toMatchObject({ streaming: { loadRadius: 3, unloadRadius: 3 } });
    expect(parseSceneRequest('?scene=stream&loadRadius=99&focus=here&view=below')).toMatchObject({ streaming: { loadRadius: 1, unloadRadius: 2 }, focus: { x: 256, y: 256 }, view: 'oblique' });
    expect(parseWorldPoint('1e9,2', { x: 7, y: 8 })).toEqual({ x: 7, y: 8 });
    // Fog: on by default here; distances only when both are valid.
    expect(parseSceneRequest('?scene=stream&fog=off')).toMatchObject({ fog: 'off' });
    expect(parseSceneRequest('?scene=stream&fogStart=100&fogEnd=400')).toMatchObject({ fog: { start: 100, end: 400 } });
    expect(parseSceneRequest('?scene=stream&fogStart=400&fogEnd=100')).toMatchObject({ fog: 'on' });
    expect(parseSceneRequest('?scene=tile&fog=on')).toMatchObject({ fog: 'on' });
    expect(parseSceneRequest('?scene=tile&fogStart=1&fogEnd=2')).toMatchObject({ fog: 'off' }); // not asked for
    expect(parseSceneRequest('?scene=stream&frameBudget=12')).toMatchObject({ frameBudgetMs: 12 });
    expect(parseSceneRequest('?scene=stream&frameBudget=off')).toMatchObject({ frameBudgetMs: Number.POSITIVE_INFINITY });
    expect(parseSceneRequest('?scene=stream&frameBudget=0')).toMatchObject({ frameBudgetMs: 4 });
  });
});
