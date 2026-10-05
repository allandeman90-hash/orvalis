import { describe, expect, it } from 'vitest';
import {
  buildFixtureWorld,
  buildTerrainTile,
  createTerrainConfig,
  MAP_FIXTURES,
  ORVALIS_DEFAULT,
  outerVertexIndex,
  type TerrainChunk,
  TerrainMap,
  TerrainWorld,
  tileChunkIndex,
  tileHeightFixture,
  VANILLA_REFERENCE,
} from '../../src/terrain';

const config = ORVALIS_DEFAULT;
const flat = (x: number, y: number, c = config) => buildTerrainTile(c, { x, y }, () => 0);
const pos = (c: TerrainChunk, v: number): number[] => Array.from(c.geometry.positions.subarray(v * 3, v * 3 + 3));
const nrm = (c: TerrainChunk, v: number): number[] => Array.from(c.geometry.normals.subarray(v * 3, v * 3 + 3));

describe('TerrainMap — sparse set of tiles', () => {
  it('starts empty; an absent tile is undefined, not an error', () => {
    const map = new TerrainMap('test', config);
    expect(map.tileCount).toBe(0);
    expect(map.has({ x: 0, y: 0 })).toBe(false);
    expect(map.get({ x: 0, y: 0 })).toBeUndefined();
    expect(map.tileAt(10, 10)).toBeUndefined();
    expect(map.chunkAt(10, 10)).toBeUndefined();
    expect(map.coordBounds()).toBeNull();
    expect([...map.tiles()]).toEqual([]);
    expect(map.delete({ x: 0, y: 0 })).toBeNull();
  });

  it('stores tiles by coordinate, negative included, and nothing in between', () => {
    const map = new TerrainMap('test', config);
    const a = flat(0, 0), b = flat(-1, 0), c = flat(-7, 12);
    map.set(a);
    map.set(b);
    map.set(c, 'ocean');
    expect(map.tileCount).toBe(3);
    expect(map.get({ x: 0, y: 0 })?.tile).toBe(a);
    expect(map.get({ x: -1, y: 0 })?.tile).toBe(b);
    expect(map.get({ x: -7, y: 12 })).toEqual({ kind: 'ocean', tile: c });
    expect(map.get({ x: -0, y: 0 })?.tile).toBe(a); // −0 is 0
    for (const absent of [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -7, y: 11 }, { x: 12, y: -7 }]) {
      expect(map.has(absent)).toBe(false);
      expect(map.get(absent)).toBeUndefined();
    }
    expect([...map.tiles()].map((t) => t.tile)).toEqual([a, b, c]);
    expect(map.coordBounds()).toEqual({ minX: -7, minY: 0, maxX: 0, maxY: 12 });
  });

  it('absent tiles cost nothing: two tiles two million tiles apart are just two entries', () => {
    const map = new TerrainMap('test', config);
    map.set(flat(1_000_000, -1_000_000));
    map.set(flat(-1_000_000, 1_000_000));
    expect(map.tileCount).toBe(2);
    expect([...map.tiles()].length).toBe(2);
    expect(map.coordBounds()).toEqual({ minX: -1_000_000, minY: -1_000_000, maxX: 1_000_000, maxY: 1_000_000 });
    expect(map.has({ x: 0, y: 0 })).toBe(false);
    expect(map.has({ x: 63, y: 63 })).toBe(false); // and no 64 × 64 limit either way
    expect(map.has({ x: 1_000_000, y: -1_000_000 })).toBe(true);
  });

  it('the tile kind comes from the data given with the tile, never from its position', () => {
    const map = new TerrainMap('test', config);
    map.set(flat(3, 3));
    map.set(flat(3, 4), 'ocean');
    expect(map.get({ x: 3, y: 3 })?.kind).toBe('land'); // default when the data says nothing else
    expect(map.get({ x: 3, y: 4 })?.kind).toBe('ocean');
    map.set(flat(3, 3), 'void'); // same place, other data → other kind
    expect(map.get({ x: 3, y: 3 })?.kind).toBe('void');
    expect(map.tileCount).toBe(2);
  });

  it('set replaces, delete removes', () => {
    const map = new TerrainMap('test', config);
    const first = flat(2, -5), second = flat(2, -5);
    map.set(first);
    map.set(second);
    expect(map.tileCount).toBe(1);
    expect(map.get({ x: 2, y: -5 })?.tile).toBe(second);
    expect(map.delete({ x: 2, y: -5 })).toEqual([]);
    expect(map.tileCount).toBe(0);
    expect(map.coordBounds()).toBeNull();
  });

  it('refuses a tile built with another TerrainConfig, non-integer coordinates and an empty id', () => {
    const map = new TerrainMap('test', config);
    expect(() => map.set(flat(0, 0, VANILLA_REFERENCE))).toThrow(/another TerrainConfig/);
    expect(() => map.set(flat(0, 0, createTerrainConfig(4)))).toThrow(/another TerrainConfig/); // same numbers, still not this map's config object
    expect(() => map.get({ x: 0.5, y: 0 })).toThrow(/integers/);
    expect(() => map.has({ x: Number.NaN, y: 0 })).toThrow(/integers/);
    expect(() => new TerrainMap('', config)).toThrow(/id/);
  });

  it('world position → resident tile / chunk, on both sides of the origin and at borders', () => {
    const map = new TerrainMap('test', config);
    const a = flat(0, 0), b = flat(-1, 0);
    map.set(a);
    map.set(b);
    expect(map.tileAt(1, 1)?.tile).toBe(a);
    expect(map.tileAt(-1, 1)?.tile).toBe(b);
    expect(map.tileAt(0, 0)?.tile).toBe(a); // x = 0 belongs to tile 0
    expect(map.tileAt(-512, 0)?.tile).toBe(b);
    expect(map.tileAt(511.99, 511.99)?.tile).toBe(a);
    expect(map.tileAt(512, 0)).toBeUndefined(); // tile (1, 0) is absent
    expect(map.tileAt(0, -0.01)).toBeUndefined(); // tile (0, −1) is absent
    expect(map.chunkAt(40, 70)).toBe(a.chunks[tileChunkIndex(1, 2)]);
    expect(map.chunkAt(-1, 1)).toBe(b.chunks[tileChunkIndex(15, 0)]);
    expect(map.chunkAt(-512, 511)).toBe(b.chunks[tileChunkIndex(0, 15)]);
    expect(map.chunkAt(600, 0)).toBeUndefined();
  });
});

describe('TerrainWorld — several maps', () => {
  it('maps are independent: own id, own config, own tiles at the same coordinates', () => {
    const world = new TerrainWorld();
    const east = world.createMap('east', ORVALIS_DEFAULT), west = world.createMap('west', VANILLA_REFERENCE);
    expect(world.mapCount).toBe(2);
    expect(world.ids()).toEqual(['east', 'west']);
    expect(world.get('east')).toBe(east);
    expect(world.get('nowhere')).toBeUndefined();
    const a = flat(0, 0, ORVALIS_DEFAULT), b = flat(0, 0, VANILLA_REFERENCE);
    east.set(a);
    west.set(b);
    expect(east.get({ x: 0, y: 0 })?.tile).toBe(a);
    expect(west.get({ x: 0, y: 0 })?.tile).toBe(b);
    east.delete({ x: 0, y: 0 });
    expect(west.tileCount).toBe(1);
    expect(() => world.createMap('east', ORVALIS_DEFAULT)).toThrow(/already exists/);
    expect(world.delete('east')).toBe(true);
    expect(world.delete('east')).toBe(false);
    expect(world.ids()).toEqual(['west']);
  });

  it('fixture world: two maps, sparse, with the tiles their data lists', () => {
    const world = buildFixtureWorld(config);
    expect(world.ids()).toEqual(['archipel', 'bande']);
    for (const fixture of MAP_FIXTURES) {
      const map = world.get(fixture.id)!;
      expect(map.tileCount).toBe(fixture.tiles.length);
      for (const t of fixture.tiles) expect(map.get(t)).toMatchObject({ kind: t.kind, tile: { coord: { x: t.x, y: t.y } } });
    }
    const archipel = world.get('archipel')!;
    expect(archipel.coordBounds()).toEqual({ minX: -1, minY: 0, maxX: 1, maxY: 1 });
    expect([{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: -1, y: 1 }].some((c) => archipel.has(c))).toBe(false); // 3 of the 6 cells are empty
    expect(world.get('bande')!.coordBounds()).toEqual({ minX: 5, minY: -3, maxX: 5, maxY: -2 });
  });
});

describe('adjacent tiles of a map', () => {
  for (const c of [ORVALIS_DEFAULT, VANILLA_REFERENCE]) {
    it(`geometry is bit-identical across a TILE border, around the origin too (cellSize ${c.cellSize})`, () => {
      const f = tileHeightFixture(c, 'hills');
      const left = buildTerrainTile(c, { x: -1, y: 0 }, f), right = buildTerrainTile(c, { x: 0, y: 0 }, f), above = buildTerrainTile(c, { x: 0, y: 1 }, f);
      for (let cy = 0; cy < 16; cy++) {
        for (let j = 0; j <= 8; j++) {
          expect(pos(left.chunks[tileChunkIndex(15, cy)]!, outerVertexIndex(8, j))).toEqual(pos(right.chunks[tileChunkIndex(0, cy)]!, outerVertexIndex(0, j)));
        }
      }
      for (let cx = 0; cx < 16; cx++) {
        for (let i = 0; i <= 8; i++) {
          expect(pos(right.chunks[tileChunkIndex(cx, 15)]!, outerVertexIndex(i, 8))).toEqual(pos(above.chunks[tileChunkIndex(cx, 0)]!, outerVertexIndex(i, 0)));
        }
      }
    });
  }

});

describe('TerrainMap — normals across TILE borders (P1.8)', () => {
  const dunes = tileHeightFixture(config, 'dunes');
  const build = (x: number, y: number) => buildTerrainTile(config, { x, y }, dunes);
  const allNormals = (t: ReturnType<typeof build>): number[] => t.chunks.flatMap((c) => Array.from(c.geometry.normals));
  /** Number of border vertices whose normals differ between the east edge of `left` and the west edge of `right`. */
  const eastWestMismatch = (left: ReturnType<typeof build>, right: ReturnType<typeof build>): number => {
    let n = 0;
    for (let cy = 0; cy < 16; cy++) {
      for (let j = 0; j <= 8; j++) {
        const a = nrm(left.chunks[tileChunkIndex(15, cy)]!, outerVertexIndex(8, j)), b = nrm(right.chunks[tileChunkIndex(0, cy)]!, outerVertexIndex(0, j));
        if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) n++;
      }
    }
    return n;
  };

  it('control: two tiles built alone disagree on their common border', () => {
    expect(eastWestMismatch(build(-1, 0), build(0, 0))).toBeGreaterThan(100);
    // …and a map with stitching switched off leaves them that way.
    const map = new TerrainMap('raw', config, false);
    const l = build(-1, 0), r = build(0, 0);
    expect(map.set(l)).toEqual([]);
    map.set(r);
    expect(eastWestMismatch(l, r)).toBeGreaterThan(100);
  });

  it('in a map, both sides of a tile border get bit-identical normals (east/west and north/south)', () => {
    const map = new TerrainMap('m', config);
    const l = build(-1, 0), r = build(0, 0), up = build(0, 1);
    expect(map.set(l)).toEqual([{ x: -1, y: 0 }]);
    expect(map.set(r)).toEqual([{ x: -1, y: 0 }, { x: 0, y: 0 }]);
    map.set(up);
    expect(eastWestMismatch(l, r)).toBe(0);
    for (let cx = 0; cx < 16; cx++) {
      for (let i = 0; i <= 8; i++) expect(nrm(r.chunks[tileChunkIndex(cx, 15)]!, outerVertexIndex(i, 8))).toEqual(nrm(up.chunks[tileChunkIndex(cx, 0)]!, outerVertexIndex(i, 0)));
    }
    for (const t of [l, r, up]) for (const n of allNormals(t)) expect(Number.isFinite(n)).toBe(true);
  });

  it('the shared normal is the sum of the faces of BOTH tiles (checked by hand)', () => {
    const map = new TerrainMap('m', config);
    const l = build(-1, 0), r = build(0, 0);
    map.set(l);
    map.set(r);
    for (const [cy, j] of [[0, 3], [5, 8], [9, 0], [15, 6]] as const) {
      const copies: Array<[TerrainChunk, number]> = [[l.chunks[tileChunkIndex(15, cy)]!, outerVertexIndex(8, j)], [r.chunks[tileChunkIndex(0, cy)]!, outerVertexIndex(0, j)]];
      // (5, 8) and (9, 0) are chunk corners: the node is also held by the chunk above / below, in both tiles.
      if (j === 8) copies.push([l.chunks[tileChunkIndex(15, cy + 1)]!, outerVertexIndex(8, 0)], [r.chunks[tileChunkIndex(0, cy + 1)]!, outerVertexIndex(0, 0)]);
      if (j === 0) copies.push([l.chunks[tileChunkIndex(15, cy - 1)]!, outerVertexIndex(8, 8)], [r.chunks[tileChunkIndex(0, cy - 1)]!, outerVertexIndex(0, 8)]);
      const sum = [0, 0, 0];
      let faces = 0;
      for (const [chunk, v] of copies) {
        const p = chunk.geometry.positions, idx = chunk.geometry.indices;
        for (let t = 0; t < idx.length; t += 3) {
          const tri = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
          if (!tri.includes(v)) continue;
          faces++;
          const [a, b, c] = tri.map((k) => k * 3) as [number, number, number];
          const e1 = [p[b]! - p[a]!, p[b + 1]! - p[a + 1]!, p[b + 2]! - p[a + 2]!], e2 = [p[c]! - p[a]!, p[c + 1]! - p[a + 1]!, p[c + 2]! - p[a + 2]!];
          sum[0]! += e1[1]! * e2[2]! - e1[2]! * e2[1]!;
          sum[1]! += e1[2]! * e2[0]! - e1[0]! * e2[2]!;
          sum[2]! += e1[0]! * e2[1]! - e1[1]! * e2[0]!;
        }
      }
      expect(faces).toBe(8);
      const len = Math.hypot(sum[0]!, sum[1]!, sum[2]!);
      for (const [chunk, v] of copies) nrm(chunk, v).forEach((x, k) => expect(x).toBeCloseTo(sum[k]! / len, 6));
    }
  });

  it('where 4 tiles meet, the 4 copies of the corner agree', () => {
    const map = new TerrainMap('m', config);
    const a = build(0, 0), b = build(1, 0), c = build(0, 1), d = build(1, 1);
    for (const t of [d, a, c, b]) map.set(t);
    const corner = nrm(a.chunks[tileChunkIndex(15, 15)]!, outerVertexIndex(8, 8));
    expect(nrm(b.chunks[tileChunkIndex(0, 15)]!, outerVertexIndex(0, 8))).toEqual(corner);
    expect(nrm(c.chunks[tileChunkIndex(15, 0)]!, outerVertexIndex(8, 0))).toEqual(corner);
    expect(nrm(d.chunks[tileChunkIndex(0, 0)]!, outerVertexIndex(0, 0))).toEqual(corner);
    // With only the diagonal neighbour resident, the corner is shared by 2 tiles and still agrees.
    const m2 = new TerrainMap('m2', config);
    const a2 = build(0, 0), d2 = build(1, 1);
    m2.set(a2);
    expect(m2.set(d2)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    expect(nrm(d2.chunks[tileChunkIndex(0, 0)]!, outerVertexIndex(0, 0))).toEqual(nrm(a2.chunks[tileChunkIndex(15, 15)]!, outerVertexIndex(8, 8)));
    expect(nrm(a2.chunks[tileChunkIndex(15, 15)]!, outerVertexIndex(8, 8))).not.toEqual(corner);
  });

  it('normals depend on the SET of resident tiles, not on the order of arrival', () => {
    const coords: Array<[number, number]> = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0]];
    const run = (order: number[]): Map<string, number[]> => {
      const map = new TerrainMap('m', config);
      const tiles = coords.map(([x, y]) => build(x, y));
      for (const k of order) map.set(tiles[k]!);
      return new Map(tiles.map((t) => [`${t.coord.x},${t.coord.y}`, allNormals(t)]));
    };
    const first = run([0, 1, 2, 3, 4]), second = run([4, 3, 2, 1, 0]), third = run([2, 4, 0, 3, 1]);
    for (const key of first.keys()) {
      expect(second.get(key)).toEqual(first.get(key));
      expect(third.get(key)).toEqual(first.get(key));
    }
  });

  it('removing a neighbour gives the tile back exactly the normals it has alone; interior normals never change', () => {
    const alone = allNormals(build(0, 0));
    const map = new TerrainMap('m', config);
    const t = build(0, 0);
    map.set(t);
    expect(allNormals(t)).toEqual(alone); // a tile alone in a map = the tile as built
    map.set(build(1, 0));
    map.set(build(0, -1));
    const stitched = allNormals(t);
    expect(stitched).not.toEqual(alone);
    // Only vertices on the tile's outer border may differ.
    let changed = 0;
    t.chunks.forEach((chunk, c) => {
      for (let v = 0; v < 145; v++) {
        const same = [0, 1, 2].every((k) => stitched[(c * 145 + v) * 3 + k] === alone[(c * 145 + v) * 3 + k]);
        if (same) continue;
        changed++;
        const p = pos(chunk, v);
        expect(p[0] === 0 || p[0] === 512 || p[1] === 0 || p[1] === 512).toBe(true);
      }
    });
    expect(changed).toBeGreaterThan(100);
    expect(map.delete({ x: 1, y: 0 })).toEqual([{ x: 0, y: -1 }, { x: 0, y: 0 }]);
    expect(map.delete({ x: 0, y: -1 })).toEqual([{ x: 0, y: 0 }]);
    expect(allNormals(t)).toEqual(alone);
  });

  it('a plane across several tiles keeps one single normal, and holes on a tile border do not break anything', () => {
    const plane = tileHeightFixture(config, 'slope');
    const map = new TerrainMap('m', config);
    const a = buildTerrainTile(config, { x: 0, y: 0 }, plane), b = buildTerrainTile(config, { x: 1, y: 0 }, plane, { holes: (cx) => (cx === 0 ? 0xffff : 0) });
    map.set(a);
    map.set(b);
    const l = Math.hypot(0.25, 0.125, 1), want = [-0.25 / l, -0.125 / l, 1 / l];
    for (const chunk of a.chunks) for (let v = 0; v < 145; v++) nrm(chunk, v).forEach((x, k) => expect(Math.abs(x - want[k]!)).toBeLessThan(2e-4));
    for (const n of allNormals(b)) expect(Number.isFinite(n)).toBe(true);
  });
});
