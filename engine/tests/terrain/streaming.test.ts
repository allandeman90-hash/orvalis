import { describe, expect, it } from 'vitest';
import {
  buildTerrainTile,
  fixtureTileProvider,
  ORVALIS_DEFAULT,
  paintFixture,
  type TerrainTile,
  TILE_BUILD_UNITS,
  TileBuildJob,
  tileHeightFixture,
  outerVertexIndex,
  STREAM_FIXTURE,
  type StreamingConfig,
  type TerrainChunk,
  TerrainMap,
  TerrainStreamer,
  type TileCoord,
  tileChunkIndex,
  VANILLA_REFERENCE,
} from '../../src/terrain';

const config = ORVALIS_DEFAULT;
const T = config.tileSize;
const centre = (x: number, y: number): [number, number] => [(x + 0.5) * T, (y + 0.5) * T];
const keys = (coords: Iterable<TileCoord>): string[] => [...coords].map((c) => `${c.x},${c.y}`).sort();
const residents = (map: TerrainMap): string[] => keys([...map.tiles()].map((t) => t.tile.coord));
const nrm = (c: TerrainChunk, v: number): number[] => Array.from(c.geometry.normals.subarray(v * 3, v * 3 + 3));

function setup(streaming: Partial<StreamingConfig> = {}, flat = true) {
  const map = new TerrainMap('continent', config);
  // Flat tiles are much cheaper to reason about; the relief only matters for the normals test.
  const provider = fixtureTileProvider(config, STREAM_FIXTURE, flat ? 'flat' : undefined);
  const streamer = new TerrainStreamer(map, provider, { loadRadius: 1, unloadRadius: 2, maxLoadsPerUpdate: 100, ...streaming });
  return { map, provider, streamer };
}

describe('fixture provider', () => {
  it('describes a sparse map: 31 of the 35 tiles of the rectangle exist', () => {
    const provider = fixtureTileProvider(config, STREAM_FIXTURE, 'flat');
    expect(STREAM_FIXTURE.tiles.length).toBe(31);
    expect(provider.has({ x: 0, y: 0 })).toBe(true);
    for (const [x, y] of [[1, 1], [-2, 0], [3, -2], [-3, 2], [4, 0], [0, 3], [100, 100]] as const) expect(provider.has({ x, y })).toBe(false);
    expect(() => provider.build({ x: 1, y: 1 })).toThrow(/does not exist/);
    expect(provider.build({ x: -3, y: -2 }).tile.coord).toEqual({ x: -3, y: -2 });
    expect(provider.builds).toBe(1);
  });
});

describe('TerrainStreamer — what is resident', () => {
  it('loads the existing tiles of the 3 × 3 window around the focus, nearest first, and nothing else', () => {
    const { map, streamer, provider } = setup();
    expect(streamer.focusTile).toBeNull();
    const events = streamer.update(...centre(0, 0));
    expect(streamer.focusTile).toEqual({ x: 0, y: 0 });
    expect(events.loaded[0]).toEqual({ x: 0, y: 0 }); // the tile under the focus comes first
    expect(keys(events.loaded)).toEqual(['-1,-1', '-1,0', '-1,1', '0,-1', '0,0', '0,1', '1,-1', '1,0']); // (1,1) does not exist
    expect(events.unloaded).toEqual([]);
    expect(events.refreshed).toEqual([]);
    expect(residents(map)).toEqual(keys(events.loaded));
    expect([streamer.pending, streamer.loadedTotal, streamer.unloadedTotal, provider.builds]).toEqual([0, 8, 0, 8]);
    // Nothing more to do while the focus stays in the same tile.
    const again = streamer.update(10, 500);
    expect([again.loaded, again.unloaded, again.refreshed]).toEqual([[], [], []]);
    expect(provider.builds).toBe(8);
  });

  it('spends at most maxLoadsPerUpdate tiles per update and reports what is still pending', () => {
    const { map, streamer } = setup({ maxLoadsPerUpdate: 3 });
    const pending: number[] = [], sizes: number[] = [];
    for (let k = 0; k < 4; k++) {
      const e = streamer.update(...centre(0, 0));
      expect(e.loaded.length).toBeLessThanOrEqual(3);
      pending.push(streamer.pending);
      sizes.push(map.tileCount);
    }
    expect(pending).toEqual([5, 2, 0, 0]);
    expect(sizes).toEqual([3, 6, 8, 8]);
  });

  it('moving east: new tiles are loaded ahead, tiles behind are kept until they pass the unload radius', () => {
    const { map, streamer } = setup();
    streamer.update(...centre(0, 0));
    const step1 = streamer.update(...centre(1, 0));
    expect(keys(step1.loaded)).toEqual(['2,-1', '2,0', '2,1']);
    expect(step1.unloaded).toEqual([]); // column x = −1 is at distance 2: kept (hysteresis)
    expect(map.tileCount).toBe(11);
    const step2 = streamer.update(...centre(2, 0));
    expect(keys(step2.loaded)).toEqual(['3,-1', '3,0', '3,1']);
    expect(keys(step2.unloaded)).toEqual(['-1,-1', '-1,0', '-1,1']); // now at distance 3
    expect(residents(map)).toEqual(['0,-1', '0,0', '0,1', '1,-1', '1,0', '2,-1', '2,0', '2,1', '3,-1', '3,0', '3,1']);
    expect([streamer.loadedTotal, streamer.unloadedTotal]).toEqual([14, 3]);
  });

  it('hysteresis: crossing one tile border back and forth neither loads nor unloads', () => {
    const { streamer, provider } = setup();
    streamer.update(T - 1, 100);
    streamer.update(T + 1, 100);
    const builds = provider.builds;
    for (let k = 0; k < 20; k++) {
      const e = streamer.update(k % 2 === 0 ? T - 1 : T + 1, 100);
      expect([e.loaded.length, e.unloaded.length, e.refreshed.length]).toEqual([0, 0, 0]);
    }
    expect(provider.builds).toBe(builds);
  });

  it('without hysteresis (unload = load) the resident set is exactly the window, whatever the path', () => {
    const { map, streamer } = setup({ loadRadius: 1, unloadRadius: 1 });
    for (const [x, y] of [[0, 0], [1, 0], [2, 1], [-3, -2], [0, 0]] as const) streamer.update(...centre(x, y));
    expect(residents(map)).toEqual(['-1,-1', '-1,0', '-1,1', '0,-1', '0,0', '0,1', '1,-1', '1,0']);
  });

  it('radius 0 keeps only the tile under the focus; a focus over an absent tile keeps nothing', () => {
    const { map, streamer } = setup({ loadRadius: 0, unloadRadius: 0 });
    streamer.update(...centre(2, 2));
    expect(residents(map)).toEqual(['2,2']);
    streamer.update(...centre(1, 1)); // this tile does not exist
    expect(map.tileCount).toBe(0);
    expect(streamer.pending).toBe(0);
  });

  it('far from every tile: everything is unloaded and nothing is pending', () => {
    const { map, streamer } = setup();
    streamer.update(...centre(0, 0));
    const e = streamer.update(1e7, -1e7);
    expect(e.unloaded.length).toBe(8);
    expect([map.tileCount, streamer.pending]).toEqual([0, 0]);
    expect(streamer.focusTile).toEqual({ x: Math.floor(1e7 / T), y: Math.floor(-1e7 / T) });
  });

  it('negative coordinates: the focus tile and the window follow the P1.1 conversion', () => {
    const { map, streamer } = setup();
    streamer.update(-1, -1);
    expect(streamer.focusTile).toEqual({ x: -1, y: -1 });
    expect(residents(map)).toEqual(['-1,-1', '-1,-2', '-1,0', '-2,-1', '-2,-2', '0,-1', '0,-2', '0,0']); // (−2,0) does not exist
    streamer.update(0, 0); // exactly on the border: belongs to tile (0, 0)
    expect(streamer.focusTile).toEqual({ x: 0, y: 0 });
  });

  it('works with another terrain scale', () => {
    const map = new TerrainMap('v', VANILLA_REFERENCE);
    const streamer = new TerrainStreamer(map, fixtureTileProvider(VANILLA_REFERENCE, STREAM_FIXTURE, 'flat'), { loadRadius: 0, unloadRadius: 0, maxLoadsPerUpdate: 1 });
    streamer.update(VANILLA_REFERENCE.tileSize * 2.5, VANILLA_REFERENCE.tileSize * -1.5);
    expect(residents(map)).toEqual(['2,-2']);
  });

  it('rejects bad configuration, bad focus and a provider returning the wrong tile', () => {
    const map = new TerrainMap('m', config);
    const provider = fixtureTileProvider(config, STREAM_FIXTURE, 'flat');
    expect(() => new TerrainStreamer(map, provider, { loadRadius: 2, unloadRadius: 1, maxLoadsPerUpdate: 1 })).toThrow(/unloadRadius/);
    expect(() => new TerrainStreamer(map, provider, { loadRadius: -1, unloadRadius: 1, maxLoadsPerUpdate: 1 })).toThrow(/loadRadius/);
    expect(() => new TerrainStreamer(map, provider, { loadRadius: 1.5, unloadRadius: 2, maxLoadsPerUpdate: 1 })).toThrow(/loadRadius/);
    expect(() => new TerrainStreamer(map, provider, { loadRadius: 1, unloadRadius: 1, maxLoadsPerUpdate: 0 })).toThrow(/maxLoadsPerUpdate/);
    const streamer = new TerrainStreamer(map, provider, { loadRadius: 0, unloadRadius: 0, maxLoadsPerUpdate: 1 });
    expect(() => streamer.update(Number.NaN, 0)).toThrow(/finite/);
    const liar = new TerrainStreamer(new TerrainMap('l', config), { has: () => true, begin: () => provider.begin({ x: 0, y: 0 }) }, { loadRadius: 0, unloadRadius: 0, maxLoadsPerUpdate: 1 });
    expect(() => liar.update(...centre(2, 2))).toThrow(/provider returned/);
  });
});

describe('TerrainStreamer — events are enough to mirror the map (what the renderer does)', () => {
  it('random walk of 300 steps: a mirror fed only with events always equals the map', () => {
    const { map, streamer, provider } = setup({ maxLoadsPerUpdate: 2 });
    const mirror = new Set<string>();
    let seed = 42;
    const random = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    let x = 0, y = 0;
    for (let step = 0; step < 300; step++) {
      x += (random() - 0.5) * T * 1.5;
      y += (random() - 0.5) * T * 1.5;
      x = Math.max(-5 * T, Math.min(5 * T, x));
      y = Math.max(-4 * T, Math.min(4 * T, y));
      const e = streamer.update(x, y);
      for (const c of e.unloaded) expect(mirror.delete(`${c.x},${c.y}`)).toBe(true); // never unloads what was not there
      for (const c of e.loaded) {
        expect(mirror.has(`${c.x},${c.y}`)).toBe(false); // never loads twice
        mirror.add(`${c.x},${c.y}`);
      }
      for (const c of e.refreshed) expect(mirror.has(`${c.x},${c.y}`)).toBe(true); // refreshed tiles are resident
      expect([...mirror].sort()).toEqual(residents(map));
      const focus = streamer.focusTile!;
      let beyond = 0;
      for (const { tile } of map.tiles()) {
        if (Math.max(Math.abs(tile.coord.x - focus.x), Math.abs(tile.coord.y - focus.y)) > 2) beyond++;
        expect(provider.has(tile.coord)).toBe(true);
      }
      // Tiles beyond the unload radius leave at most 2 per update (the budget), and the streamer knows how many are left.
      expect(e.unloaded.length).toBeLessThanOrEqual(2);
      expect(beyond).toBe(streamer.pendingUnloads);
      if (streamer.pending === 0) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const c = { x: focus.x + dx, y: focus.y + dy };
          expect(map.has(c)).toBe(provider.has(c)); // the load window is complete
        }
      }
    }
    expect(streamer.loadedTotal - streamer.unloadedTotal).toBe(map.tileCount);
    expect(streamer.loadedTotal).toBeGreaterThan(40);
  });
});

describe('TerrainStreamer — normals between streamed tiles', () => {
  it('a tile that arrives next to a resident one makes that neighbour "refreshed", and their border agrees', () => {
    const { map, streamer } = setup({ loadRadius: 0, unloadRadius: 1 }, false);
    streamer.update(...centre(0, 0));
    const first = map.get({ x: 0, y: 0 })!.tile;
    const before = Array.from(first.chunks[tileChunkIndex(15, 5)]!.geometry.normals);
    const e = streamer.update(...centre(1, 0));
    expect(e.loaded).toEqual([{ x: 1, y: 0 }]);
    expect(e.refreshed).toEqual([{ x: 0, y: 0 }]); // still resident (distance 1), border normals changed
    const second = map.get({ x: 1, y: 0 })!.tile;
    expect(Array.from(first.chunks[tileChunkIndex(15, 5)]!.geometry.normals)).not.toEqual(before);
    for (let cy = 0; cy < 16; cy++) {
      for (let j = 0; j <= 8; j++) expect(nrm(first.chunks[tileChunkIndex(15, cy)]!, outerVertexIndex(8, j))).toEqual(nrm(second.chunks[tileChunkIndex(0, cy)]!, outerVertexIndex(0, j)));
    }
    // The first tile leaves: the second is refreshed back to its stand-alone normals.
    const e2 = streamer.update(...centre(2, 0));
    expect(e2.unloaded).toEqual([{ x: 0, y: 0 }]);
    expect(keys(e2.refreshed)).toEqual(['1,0']);
  });
});

describe('TileBuildJob — a tile built in small units', () => {
  const height = tileHeightFixture(config, 'dunes'), paint = paintFixture(config, 'natural');
  const flatten = (t: TerrainTile) => ({
    positions: t.chunks.map((c) => Array.from(c.geometry.positions)),
    normals: t.chunks.map((c) => Array.from(c.geometry.normals)),
    indices: t.chunks.map((c) => Array.from(c.geometry.indices)),
    masks: t.chunks.map((c) => Array.from(c.material!.mask)),
    bounds: t.chunks.map((c) => c.bounds),
    edges: [t.edgeSums.west, t.edgeSums.east, t.edgeSums.south, t.edgeSums.north].map((e) => Array.from(e)),
    totals: [t.vertexCount, t.triangleCount, t.indexCount, t.minHeight, t.maxHeight],
  });

  it('takes exactly 513 units, one at a time, and gives the very same tile as building at once', () => {
    const options = { paint, holes: (cx: number, cy: number) => (cx === 3 && cy === 4 ? 5 : 0) };
    const job = new TileBuildJob(config, { x: -2, y: 3 }, height, options);
    expect(TILE_BUILD_UNITS).toBe(513);
    expect(() => job.tile).toThrow(/not built yet/);
    let steps = 0;
    while (!job.step()) {
      steps++;
      expect(job.done).toBe(false);
      expect(job.unitsDone).toBe(steps);
    }
    expect(steps + 1).toBe(513);
    expect(job.done).toBe(true);
    expect(job.step()).toBe(true); // stepping a finished job is harmless
    expect(flatten(job.tile)).toEqual(flatten(buildTerrainTile(config, { x: -2, y: 3 }, height, options)));
  });

  it('advance() does at least one unit even when told to stop at once, and stops when asked', () => {
    const job = new TileBuildJob(config, { x: 0, y: 0 }, height);
    expect(job.advance(() => true)).toBe(false);
    expect(job.unitsDone).toBe(1);
    let asked = 0;
    job.advance(() => ++asked >= 10);
    expect(job.unitsDone).toBe(11);
    expect(job.advance(() => false)).toBe(true);
    expect(job.unitsDone).toBe(513);
  });

  it('bad input is still refused', () => {
    expect(() => new TileBuildJob(config, { x: 0.5, y: 0 }, height)).toThrow();
    const job = new TileBuildJob(config, { x: 0, y: 0 }, () => Number.NaN);
    expect(() => job.step()).toThrow(/not finite/);
  });
});

describe('TerrainStreamer — time budget', () => {
  /** shouldStop that allows `units` units of build work per update. */
  const allow = (units: number) => {
    let left = units;
    return { stop: () => --left <= 0, reset: () => void (left = units) };
  };

  it('a tile becomes resident only when its build is finished; the same tiles end up resident as without budget', () => {
    const { map, streamer, provider } = setup({ maxLoadsPerUpdate: 1 });
    const budget = allow(100);
    let updates = 0, firstLoadAt = -1;
    while ((updates === 0 || streamer.pending > 0) && updates < 1000) {
      budget.reset();
      const e = streamer.update(...centre(0, 0), budget.stop);
      updates++;
      if (e.loaded.length > 0 && firstLoadAt < 0) firstLoadAt = updates;
      expect(e.loaded.length).toBeLessThanOrEqual(1);
      expect(streamer.pending).toBe(8 - map.tileCount); // the tile being built is still pending
    }
    expect(firstLoadAt).toBe(6); // 513 units at 100 per update
    expect(updates).toBe(8 * 6);
    expect(residents(map)).toEqual(['-1,-1', '-1,0', '-1,1', '0,-1', '0,0', '0,1', '1,-1', '1,0']);
    expect([provider.builds, streamer.loadedTotal, streamer.cancelledTotal, streamer.building]).toEqual([8, 8, 0, null]);
  });

  it('a build in progress is dropped when its tile gets beyond the unload radius, and kept otherwise', () => {
    const { map, streamer, provider } = setup({ loadRadius: 0, unloadRadius: 1, maxLoadsPerUpdate: 1 });
    const budget = allow(50);
    streamer.update(...centre(0, 0), budget.stop);
    expect(streamer.building).toEqual({ x: 0, y: 0 });
    budget.reset();
    streamer.update(...centre(1, 0), budget.stop); // one tile away: still inside the unload radius → keeps building it
    expect(streamer.building).toEqual({ x: 0, y: 0 });
    expect(streamer.cancelledTotal).toBe(0);
    budget.reset();
    streamer.update(...centre(3, 0), budget.stop); // three tiles away → dropped, tile (3,0) started instead
    expect(streamer.cancelledTotal).toBe(1);
    expect(streamer.building).toEqual({ x: 3, y: 0 });
    expect(map.tileCount).toBe(0);
    for (let k = 0; k < 20; k++) {
      budget.reset();
      streamer.update(...centre(3, 0), budget.stop);
    }
    expect(residents(map)).toEqual(['3,0']);
    expect(provider.builds).toBe(2);
  });

  it('with a budget, the streamed normals are bit-identical to the unbudgeted ones', () => {
    const run = (units: number | null) => {
      const { map, streamer } = setup({ maxLoadsPerUpdate: 1 }, false);
      const budget = units === null ? null : allow(units);
      for (const [x, y] of [[0, 0], [1, 0], [2, 0]] as const) {
        for (let k = 0; k < 400 && (k === 0 || streamer.pending > 0); k++) {
          budget?.reset();
          streamer.update(...centre(x, y), budget?.stop);
        }
      }
      return [...map.tiles()].map((t) => ({ key: `${t.tile.coord.x},${t.tile.coord.y}`, normals: t.tile.chunks.map((c) => Array.from(c.geometry.normals)) })).sort((a, b) => a.key.localeCompare(b.key));
    };
    const sliced = run(37), atOnce = run(null);
    expect(sliced.map((t) => t.key)).toEqual(atOnce.map((t) => t.key));
    expect(sliced).toEqual(atOnce);
  });
});

describe('TerrainStreamer — unloading is budgeted too', () => {
  it('unloads at most maxLoadsPerUpdate tiles per update, farthest first, until none is left', () => {
    const { map, streamer } = setup({ maxLoadsPerUpdate: 100 });
    streamer.update(...centre(0, 0));
    const slow = new TerrainStreamer(map, fixtureTileProvider(config, STREAM_FIXTURE, 'flat'), { loadRadius: 1, unloadRadius: 2, maxLoadsPerUpdate: 3 });
    const first = slow.update(1e7, 1e7);
    expect(first.unloaded.length).toBe(3);
    expect(slow.pendingUnloads).toBe(5);
    expect([slow.update(1e7, 1e7).unloaded.length, slow.update(1e7, 1e7).unloaded.length, slow.update(1e7, 1e7).unloaded.length]).toEqual([3, 2, 0]);
    expect([map.tileCount, slow.pendingUnloads]).toEqual([0, 0]);
  });
});
