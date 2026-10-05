import { beforeAll, describe, expect, it } from 'vitest';
import { readPublicAsset } from '../../scripts/readAsset.mjs';
import { legacyHeight, legacyVertexMix, sampleLegacyZone } from '../../scripts/legacyZoneSource.mjs';
import { buildTerrainTile, decodeGridZone, encodeGridZone, type GridZone, gridZoneSampler, gridZoneTiles, legacyToEngine, ORVALIS_DEFAULT, TEST_ZONE, testZonePaint, worldToTile } from '../../src/terrain';

/**
 * M1.1: the committed test-zone asset against its source, the legacy terrain
 * functions (src/world/terrain.js), loaded read-only. Slow by design: the old
 * world's whole height grid is computed once (about 2 s).
 */
const assetBytes = readPublicAsset(TEST_ZONE.url);
let zone: GridZone;

/** Deterministic pseudo-random numbers in 0..1. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

beforeAll(() => {
  zone = decodeGridZone(assetBytes);
  legacyHeight(0, 0); // builds the legacy grid here, so no single test carries the 2 s
}, 30000);

describe('test zone asset', () => {
  it('is 4 × 4 tiles of the Orvalis terrain configuration, at the documented place', () => {
    expect(zone).toMatchObject({ id: 'val-azur-test', originX: -2048, originY: -1024, cellSize: 4, cols: 512, rows: 512, diagonal: 'falling', channels: ['rock', 'dirt', 'sand', 'snow', 'cobble'] });
    const tiles = gridZoneTiles(ORVALIS_DEFAULT, zone);
    expect(tiles).toHaveLength(16);
    expect(tiles[0]).toEqual({ x: -4, y: -2 });
    expect(tiles[15]).toEqual({ x: -1, y: 1 });
    expect(worldToTile(ORVALIS_DEFAULT, TEST_ZONE.focus.x, TEST_ZONE.focus.y)).toEqual({ x: -4, y: -1 });
  });

  it('is byte-identical to a fresh export from the legacy terrain (npm run zone:export)', () => {
    const fresh = encodeGridZone(sampleLegacyZone(TEST_ZONE));
    expect(fresh.length).toBe(assetBytes.length);
    let firstDifference = -1;
    for (let k = 0; k < fresh.length && firstDifference < 0; k++) if (fresh[k] !== assetBytes[k]) firstDifference = k;
    expect(firstDifference).toBe(-1);
  }, 60000);
});

describe('legacy → engine axes', () => {
  it('is the rotation (x, y, z) = (x, −z, y): legacy north (−z) is engine +y', () => {
    expect(legacyToEngine(-1632, 72)).toEqual({ x: -1632, y: -72 });
    expect(legacyToEngine(0, 0)).toEqual({ x: 0, y: 0 });
    expect(Object.is(legacyToEngine(0, 0).y, 0)).toBe(true);
    expect(TEST_ZONE.focus).toEqual({ x: -1632, y: -72 });
  });
});

describe('test zone against the legacy terrain', () => {
  it('gives the legacy height anywhere in the zone', () => {
    const { heightAt } = gridZoneSampler(zone);
    const random = lcg(20261003);
    const { minX, maxX, minZ, maxZ } = TEST_ZONE.legacy;
    let worst = 0;
    for (let k = 0; k < 20000; k++) {
      const x = minX + random() * (maxX - minX), z = minZ + random() * (maxZ - minZ);
      const at = legacyToEngine(x, z);
      worst = Math.max(worst, Math.abs(heightAt(at.x, at.y) - legacyHeight(x, z)));
    }
    expect(worst).toBeLessThan(1e-9);
    // Not a flat zone: the comparison means something.
    let low = Infinity, high = -Infinity;
    for (const h of zone.heights) {
      low = Math.min(low, h);
      high = Math.max(high, h);
    }
    expect(low).toBe(-9); // sea floor at the west edge
    expect(high).toBeGreaterThan(60); // border ridges
  });

  it('gives a mirrored height when the axis conversion is wrong (the test above can tell)', () => {
    const { heightAt } = gridZoneSampler(zone);
    let differing = 0;
    for (const [x, z] of [[-1632, 300], [-1200, -500], [-700, 640], [-300, -900]] as const) if (Math.abs(heightAt(x, z) - legacyHeight(x, z)) > 0.01) differing++;
    expect(differing).toBeGreaterThanOrEqual(3);
  });

  it('builds tiles whose every vertex is on the legacy surface', () => {
    // The tile of the old capital and the north-east corner tile.
    for (const coord of [{ x: -4, y: -1 }, { x: -1, y: 1 }]) {
      const tile = buildTerrainTile(ORVALIS_DEFAULT, coord, gridZoneSampler(zone).heightAt);
      let worst = 0, count = 0;
      for (const chunk of tile.chunks) {
        const p = chunk.geometry.positions;
        for (let v = 0; v < p.length; v += 3) {
          worst = Math.max(worst, Math.abs(p[v + 2]! - legacyHeight(p[v]!, -p[v + 1]!)));
          count++;
        }
      }
      expect(count).toBe(37120);
      expect(worst).toBeLessThan(1e-5); // positions are 32-bit floats
    }
  });

  it('carries the legacy ground mix of every mesh vertex, to 8 bits', () => {
    const sampler = gridZoneSampler(zone);
    const random = lcg(7);
    let worst = 0;
    const seen = [0, 0, 0, 0, 0];
    for (let k = 0; k < 4000; k++) {
      const x = -2048 + 4 * Math.floor(random() * 513), z = -1024 + 4 * Math.floor(random() * 513);
      const mix = legacyVertexMix(x, z);
      for (let c = 0; c < 5; c++) {
        worst = Math.max(worst, Math.abs(sampler.weightAt(c, x, -z) - Math.min(1, Math.max(0, mix[c]!))));
        if (mix[c]! > 0.5) seen[c]!++;
      }
    }
    expect(worst).toBeLessThanOrEqual(0.5 / 255 + 1e-12);
    for (const n of seen) expect(n).toBeGreaterThan(0); // every channel really occurs in the zone
  });

  it('paints dirt on the old capital, sand on the shore, rock on steep ridges, nothing on plain meadow', () => {
    const paint = testZonePaint(zone);
    const at = (x: number, z: number) => paint.alphaAt(x, -z, 0);
    expect(at(-1632, 72)).toEqual([1, 0, 0]); // Havrebleu: cobbles → dirt layer
    expect(at(-1500, 200)).toEqual([0, 0, 0]); // meadow
    expect(at(-1992, 100)).toEqual([0, 0, 1]); // sea floor: sand
    // Somewhere on the northern ridge the legacy mix is full rock (steep slopes also carry 60 % dirt underneath).
    let rock: readonly [number, number, number] | undefined, dirtThere = -1;
    for (let z = -760; z <= -600 && !rock; z += 4) {
      for (let x = -1600; x <= -400 && !rock; x += 4) {
        const mix = legacyVertexMix(x, z);
        if (mix[0] === 1 && mix[2] === 0) {
          rock = at(x, z);
          dirtThere = mix[1]!;
        }
      }
    }
    expect(rock?.[1]).toBe(1);
    expect(rock?.[2]).toBe(0);
    expect(rock?.[0]).toBeCloseTo(dirtThere, 2);
    expect(dirtThere).toBeCloseTo(0.6, 6);
  });
});
