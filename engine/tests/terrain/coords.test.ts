import { describe, expect, it } from 'vitest';
import { chunkOrigin, createTerrainConfig, ORVALIS_DEFAULT, tileOrigin, VANILLA_REFERENCE, worldToChunk, worldToTile } from '../../src/terrain';

/** Next representable double below / above v. */
const buf = new DataView(new ArrayBuffer(8));
function nextAfter(v: number, direction: -1 | 1): number {
  if (v === 0) return direction * Number.MIN_VALUE;
  buf.setFloat64(0, v);
  const bits = buf.getBigInt64(0);
  buf.setBigInt64(0, bits + BigInt(v > 0 === direction > 0 ? 1 : -1));
  return buf.getFloat64(0);
}
const below = (v: number) => nextAfter(v, -1);
const above = (v: number) => nextAfter(v, 1);

// Every conversion test runs on several physical scales: the engine must not depend on one.
const PROFILES = [
  ['Orvalis 4', ORVALIS_DEFAULT],
  ['Vanilla 25/6', VANILLA_REFERENCE],
  ['cell 1', createTerrainConfig(1)],
  ['cell 0.3', createTerrainConfig(0.3)],
  ['cell 3.7', createTerrainConfig(3.7)],
  ['cell 7.123456789', createTerrainConfig(7.123456789)],
] as const;

describe.each(PROFILES)('terrain coordinates — %s', (_name, c) => {
  const T = c.tileSize, C = c.chunkSize;

  it('world → tile around the origin', () => {
    expect(worldToTile(c, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(worldToTile(c, -1e-9, -1e-9)).toEqual({ x: -1, y: -1 });
    expect(worldToTile(c, below(0), above(0))).toEqual({ x: -1, y: 0 });
    // x = -1 is in tile -1 as long as a tile is wider than 1 unit (true for every profile here).
    expect(worldToTile(c, -1, 0).x).toBe(-1);
  });

  it('world → tile at the first boundary: tileSize − ε, tileSize, tileSize + ε', () => {
    expect(worldToTile(c, below(T), 0).x).toBe(0);
    expect(worldToTile(c, T, 0).x).toBe(1);
    expect(worldToTile(c, above(T), 0).x).toBe(1);
    expect(worldToTile(c, T - 1e-6, 0).x).toBe(0);
    expect(worldToTile(c, T + 1e-6, 0).x).toBe(1);
  });

  it('world → tile at negative boundaries', () => {
    expect(worldToTile(c, -T, 0).x).toBe(-1); // the boundary belongs to the tile that starts there
    expect(worldToTile(c, below(-T), 0).x).toBe(-2);
    expect(worldToTile(c, above(-T), 0).x).toBe(-1);
    expect(worldToTile(c, -2 * T, 0).x).toBe(-2);
  });

  it('x and y are independent', () => {
    expect(worldToTile(c, 2.5 * T, -3.5 * T)).toEqual({ x: 2, y: -4 });
  });

  it('never returns -0', () => {
    for (const v of [0, -0, T * 0.5]) {
      const t = worldToTile(c, v, v);
      expect(Object.is(t.x, -0) || Object.is(t.y, -0)).toBe(false);
    }
    expect(Object.is(tileOrigin(c, { x: 0, y: 0 }).x, -0)).toBe(false);
    expect(Object.is(chunkOrigin(c, { tile: { x: 0, y: 0 }, chunkX: 0, chunkY: 0 }).x, -0)).toBe(false);
  });

  it('tile → world → tile round-trips exactly on every boundary, far from the origin too', () => {
    for (const k of [-100000, -4097, -381, -120, -65, -64, -3, -2, -1, 0, 1, 2, 3, 45, 63, 64, 65, 380, 4097, 100000]) {
      const origin = tileOrigin(c, { x: k, y: -k });
      expect(worldToTile(c, origin.x, origin.y), `tile ${k}`).toEqual({ x: k, y: -k + 0 });
      expect(worldToTile(c, below(origin.x), 0).x, `just below tile ${k}`).toBe(k - 1);
      expect(worldToTile(c, above(origin.x), 0).x, `just above the origin of tile ${k}`).toBe(k);
    }
  });

  it('a tile is exactly tileSize wide (within float rounding)', () => {
    for (const k of [-380, -1, 0, 1, 380]) {
      const a = tileOrigin(c, { x: k, y: 0 }).x, b = tileOrigin(c, { x: k + 1, y: 0 }).x;
      expect(b - a).toBeCloseTo(T, 6);
    }
  });

  it('world → chunk inside tile (0,0)', () => {
    expect(worldToChunk(c, 0, 0)).toEqual({ tile: { x: 0, y: 0 }, chunkX: 0, chunkY: 0 });
    expect(worldToChunk(c, below(C), 0).chunkX).toBe(0);
    expect(worldToChunk(c, C, 0).chunkX).toBe(1);
    expect(worldToChunk(c, 15.5 * C, 3.25 * C)).toEqual({ tile: { x: 0, y: 0 }, chunkX: 15, chunkY: 3 });
  });

  it('world → chunk across the tile boundary', () => {
    expect(worldToChunk(c, below(T), 0)).toMatchObject({ tile: { x: 0 }, chunkX: 15 });
    expect(worldToChunk(c, T, 0)).toMatchObject({ tile: { x: 1 }, chunkX: 0 });
    expect(worldToChunk(c, above(T), 0)).toMatchObject({ tile: { x: 1 }, chunkX: 0 });
  });

  it('world → chunk on the negative side: local index stays in 0..15', () => {
    expect(worldToChunk(c, below(0), 0)).toMatchObject({ tile: { x: -1 }, chunkX: 15 });
    expect(worldToChunk(c, -1e-9, -1e-9)).toEqual({ tile: { x: -1, y: -1 }, chunkX: 15, chunkY: 15 });
    expect(worldToChunk(c, -T, 0)).toMatchObject({ tile: { x: -1 }, chunkX: 0 });
    expect(worldToChunk(c, below(-T), 0)).toMatchObject({ tile: { x: -2 }, chunkX: 15 });
    expect(worldToChunk(c, -0.5 * C, 0)).toMatchObject({ tile: { x: -1 }, chunkX: 15 });
    expect(worldToChunk(c, -1.5 * C, 0)).toMatchObject({ tile: { x: -1 }, chunkX: 14 });
  });

  it('chunk → world → chunk round-trips for every chunk of several tiles, including distant ones', () => {
    for (const tile of [{ x: 0, y: 0 }, { x: -1, y: -1 }, { x: -120, y: 45 }, { x: 380, y: -240 }, { x: 63, y: 64 }]) {
      for (let cy = 0; cy < 16; cy++) {
        for (let cx = 0; cx < 16; cx++) {
          const address = { tile, chunkX: cx, chunkY: cy };
          const o = chunkOrigin(c, address);
          expect(worldToChunk(c, o.x, o.y)).toEqual(address);
          const below0 = worldToChunk(c, below(o.x), o.y);
          expect(below0.chunkX).toBe(cx === 0 ? 15 : cx - 1);
          expect(below0.tile.x).toBe(cx === 0 ? tile.x - 1 : tile.x);
        }
      }
    }
  });

  it('chunk (0,0) of a tile starts exactly at the tile origin', () => {
    for (const tile of [{ x: 0, y: 0 }, { x: -1, y: 7 }, { x: -120, y: 45 }, { x: 380, y: -240 }, { x: 100000, y: -100000 }]) {
      expect(chunkOrigin(c, { tile, chunkX: 0, chunkY: 0 })).toEqual(tileOrigin(c, tile));
    }
  });

  it('the tile reported by worldToChunk always equals worldToTile', () => {
    // Deterministic pseudo-random points over a wide area, plus points on chunk boundaries.
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
    for (let i = 0; i < 5000; i++) {
      const x = rnd() * 400 * T, y = rnd() * 400 * T;
      const a = worldToChunk(c, x, y);
      expect(a.tile).toEqual(worldToTile(c, x, y));
      expect(a.chunkX >= 0 && a.chunkX < 16 && a.chunkY >= 0 && a.chunkY < 16).toBe(true);
      const o = chunkOrigin(c, a);
      expect(o.x <= x && x < o.x + C * 1.0000001).toBe(true);
    }
    for (let g = -700; g <= 700; g++) {
      const x = g * C;
      expect(worldToChunk(c, x, 0).tile.x).toBe(worldToTile(c, x, 0).x);
      expect(worldToChunk(c, below(x), 0).tile.x).toBe(worldToTile(c, below(x), 0).x);
    }
  });
});

describe('terrain coordinates — no world bounds', () => {
  it('tiles far outside any 64 × 64 grid are ordinary tiles', () => {
    const c = ORVALIS_DEFAULT;
    expect(worldToTile(c, -120 * 512 + 10, 45 * 512 + 10)).toEqual({ x: -120, y: 45 });
    expect(worldToTile(c, 380 * 512 + 500, -240 * 512 + 1)).toEqual({ x: 380, y: -240 });
    expect(tileOrigin(c, { x: 380, y: -240 })).toEqual({ x: 194560, y: -122880 });
    expect(worldToTile(c, 1e9, -1e9)).toEqual({ x: 1953125, y: -1953125 });
  });
});

describe('terrain coordinates — invalid input', () => {
  const c = ORVALIS_DEFAULT;
  it('rejects non-finite world coordinates', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => worldToTile(c, bad, 0)).toThrow(/finite/);
      expect(() => worldToChunk(c, 0, bad)).toThrow(/finite/);
    }
  });
  it('rejects non-integer tile coordinates', () => {
    expect(() => tileOrigin(c, { x: 0.5, y: 0 })).toThrow(/integer/);
    expect(() => tileOrigin(c, { x: 0, y: Number.NaN })).toThrow(/integer/);
  });
  it('rejects chunk indices outside 0..15', () => {
    for (const bad of [-1, 16, 1.5, Number.NaN]) {
      expect(() => chunkOrigin(c, { tile: { x: 0, y: 0 }, chunkX: bad, chunkY: 0 })).toThrow(/chunkX/);
      expect(() => chunkOrigin(c, { tile: { x: 0, y: 0 }, chunkX: 0, chunkY: bad })).toThrow(/chunkY/);
    }
  });
});
