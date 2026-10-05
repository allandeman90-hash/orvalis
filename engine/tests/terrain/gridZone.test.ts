import { describe, expect, it } from 'vitest';
import { buildTerrainTile, createTerrainConfig, decodeGridZone, encodeGridZone, type GridZone, gridZonePaint, gridZoneSampler, gridZoneTiles, heightFieldTileProvider, ORVALIS_DEFAULT, outerVertexIndex, centerVertexIndex, tileChunkIndex, validateGridZone } from '../../src/terrain';

/** 2 × 1 cells of size 10 at origin (100, −20); heights chosen so that the two diagonals give different centres. */
const small = (diagonal: 'rising' | 'falling'): GridZone => ({
  id: 'small',
  originX: 100,
  originY: -20,
  cellSize: 10,
  cols: 2,
  rows: 1,
  diagonal,
  //                         y = −20          y = −10
  heights: new Float32Array([0, 4, 8, /**/ 2, 10, 6]),
  channels: ['a', 'b'],
  weights: new Uint8Array([0, 255, 255, 0, 0, 0, /**/ 51, 0, 255, 102, 0, 0]),
});

describe('grid zone: sampling', () => {
  it('returns the stored height exactly at every node', () => {
    for (const diagonal of ['rising', 'falling'] as const) {
      const zone = small(diagonal), { heightAt } = gridZoneSampler(zone);
      for (let j = 0; j <= 1; j++) for (let i = 0; i <= 2; i++) expect(heightAt(100 + 10 * i, -20 + 10 * j)).toBe(zone.heights[j * 3 + i]);
    }
  });

  it('puts the cell centre on the chosen diagonal', () => {
    // First cell: h00 = 0, h10 = 4, h01 = 2, h11 = 10.
    expect(gridZoneSampler(small('rising')).heightAt(105, -15)).toBe((0 + 10) / 2);
    expect(gridZoneSampler(small('falling')).heightAt(105, -15)).toBe((4 + 2) / 2);
  });

  it('is linear inside each of the two triangles of a cell', () => {
    const rising = gridZoneSampler(small('rising')).heightAt, falling = gridZoneSampler(small('falling')).heightAt;
    // rising, lower-right triangle (00, 10, 11): plane 0 + 4u + 6v ; upper-left (00, 11, 01): 0 + 8u + 2v
    expect(rising(108, -18)).toBeCloseTo(4 * 0.8 + 6 * 0.2, 12);
    expect(rising(102, -12)).toBeCloseTo(8 * 0.2 + 2 * 0.8, 12);
    // falling, lower-left triangle (00, 10, 01): 0 + 4u + 2v ; upper-right (11, 01, 10): 10 − 8(1 − u) − 6(1 − v)
    expect(falling(102, -18)).toBeCloseTo(4 * 0.2 + 2 * 0.2, 12);
    expect(falling(108, -12)).toBeCloseTo(10 - 8 * 0.2 - 6 * 0.2, 12);
  });

  it('is continuous across the diagonal and across cell borders', () => {
    for (const diagonal of ['rising', 'falling'] as const) {
      const { heightAt } = gridZoneSampler(small(diagonal));
      const e = 1e-9;
      for (const [x, y] of [[105, -15], [103, -13], [103, -17], [110, -14], [110 - e, -14], [114, -16]] as const) {
        expect(Math.abs(heightAt(x + e, y) - heightAt(x - e, y))).toBeLessThan(1e-7);
        expect(Math.abs(heightAt(x, y + e) - heightAt(x, y - e))).toBeLessThan(1e-7);
      }
    }
  });

  it('clamps positions outside the rectangle to its border', () => {
    const { heightAt } = gridZoneSampler(small('falling'));
    expect(heightAt(-1e6, -1e6)).toBe(0);
    expect(heightAt(1e6, 1e6)).toBe(6);
    expect(heightAt(1e6, -20)).toBe(8);
    expect(heightAt(105, 500)).toBe(heightAt(105, -10));
    expect(() => heightAt(Number.NaN, 0)).toThrow(/finite/);
  });

  it('samples weight channels 0..1 with the same rule', () => {
    const sampler = gridZoneSampler(small('falling'));
    expect(sampler.weightAt(0, 100, -20)).toBe(0);
    expect(sampler.weightAt(1, 100, -20)).toBe(1);
    expect(sampler.weightAt(0, 110, -20)).toBe(1);
    expect(sampler.weightAt(0, 100, -10)).toBeCloseTo(0.2, 12);
    expect(sampler.weightAt(0, 105, -15)).toBeCloseTo((1 + 0.2) / 2, 12); // centre = middle of the falling diagonal (10, 01)
    expect(() => sampler.weightAt(2, 100, -20)).toThrow(/channel/);
  });
});

describe('grid zone: file format', () => {
  it('round-trips every field', () => {
    const zone = small('falling');
    const back = decodeGridZone(encodeGridZone(zone));
    expect(back).toEqual(zone);
    expect(back.weights).not.toBe(zone.weights);
    // Also from an ArrayBuffer, as fetch() gives.
    const bytes = encodeGridZone(zone);
    expect(decodeGridZone(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)).toEqual(zone);
  });

  it('is deterministic and has the documented layout', () => {
    const bytes = encodeGridZone(small('rising'));
    expect(encodeGridZone(small('rising'))).toEqual(bytes);
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('OVZ1');
    const headerLength = new DataView(bytes.buffer).getUint32(4, true);
    expect(bytes.length).toBe(8 + Math.ceil(headerLength / 4) * 4 + 6 * 4 + 6 * 2);
  });

  it('refuses damaged files instead of repairing them', () => {
    const bytes = encodeGridZone(small('rising'));
    expect(() => decodeGridZone(bytes.subarray(0, bytes.length - 1))).toThrow(/bytes/);
    expect(() => decodeGridZone(new Uint8Array([...bytes, 0]))).toThrow(/bytes/);
    expect(() => decodeGridZone(new Uint8Array(3))).toThrow(/too short/);
    const wrongMagic = bytes.slice();
    wrongMagic[0] = 88;
    expect(() => decodeGridZone(wrongMagic)).toThrow(/magic/);
    const brokenHeader = bytes.slice();
    brokenHeader[8] = 33;
    expect(() => decodeGridZone(brokenHeader)).toThrow(/JSON/);
    const hugeHeader = bytes.slice();
    new DataView(hugeHeader.buffer).setUint32(4, 1e6, true);
    expect(() => decodeGridZone(hugeHeader)).toThrow(/header length/);
    const nan = bytes.slice();
    new DataView(nan.buffer).setFloat32(nan.length - 6 * 2 - 4, Number.NaN, true);
    expect(() => decodeGridZone(nan)).toThrow(/not finite/);
  });

  it('validates every field', () => {
    const z = small('rising');
    expect(() => validateGridZone({ ...z, id: '' })).toThrow(/id/);
    expect(() => validateGridZone({ ...z, cellSize: 0 })).toThrow(/cellSize/);
    expect(() => validateGridZone({ ...z, cols: 2.5 })).toThrow(/cols/);
    expect(() => validateGridZone({ ...z, originX: Number.POSITIVE_INFINITY })).toThrow(/originX/);
    expect(() => validateGridZone({ ...z, diagonal: 'x' as 'rising' })).toThrow(/diagonal/);
    expect(() => validateGridZone({ ...z, heights: new Float32Array(5) })).toThrow(/heights/);
    expect(() => validateGridZone({ ...z, weights: new Uint8Array(11) })).toThrow(/weight bytes/);
    expect(() => validateGridZone({ ...z, channels: ['a', 'a'] })).toThrow(/unique/);
  });
});

describe('grid zone: as a terrain source', () => {
  const config = createTerrainConfig(4);
  /** One tile at tile (−2, 3), height = a non-linear function so that the diagonal matters. */
  const tileZone = (diagonal: 'rising' | 'falling'): GridZone => {
    const n = 129, heights = new Float32Array(n * n), weights = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      heights[j * n + i] = Math.fround(3 * Math.sin(i * 0.37) * Math.cos(j * 0.23) + 0.01 * i * j);
      weights[j * n + i] = (i * 7 + j * 13) % 256;
    }
    return { id: 'one-tile', originX: -2 * 512, originY: 3 * 512, cellSize: 4, cols: 128, rows: 128, diagonal, heights, channels: ['w'], weights };
  };

  it('lists the tiles it fills, and refuses a zone that does not fill whole tiles', () => {
    expect(gridZoneTiles(config, tileZone('rising'))).toEqual([{ x: -2, y: 3 }]);
    const z = tileZone('rising');
    const two: GridZone = { ...z, cols: 256, heights: new Float32Array(257 * 129), weights: new Uint8Array(257 * 129) };
    expect(gridZoneTiles(config, two)).toEqual([{ x: -2, y: 3 }, { x: -1, y: 3 }]);
    expect(() => gridZoneTiles(config, { ...z, originX: -1000 })).toThrow(/tile corner/);
    expect(() => gridZoneTiles(createTerrainConfig(2), z)).toThrow(/cellSize/);
    expect(() => gridZoneTiles(config, small('rising'))).toThrow(/cellSize/);
    expect(() => gridZoneTiles(createTerrainConfig(10), small('rising'))).toThrow(/whole number of tiles/);
    expect(ORVALIS_DEFAULT.cellSize).toBe(4);
  });

  it('gives a tile whose outer vertices are the zone nodes and whose centre vertices lie on the zone diagonal', () => {
    for (const diagonal of ['rising', 'falling'] as const) {
      const zone = tileZone(diagonal);
      const tile = buildTerrainTile(config, { x: -2, y: 3 }, gridZoneSampler(zone).heightAt);
      for (const [cx, cy] of [[0, 0], [15, 15], [7, 3]] as const) {
        const positions = tile.chunks[tileChunkIndex(cx, cy)]!.geometry.positions;
        for (let j = 0; j <= 8; j++) for (let i = 0; i <= 8; i++) {
          const node = (cy * 8 + j) * 129 + cx * 8 + i;
          expect(positions[outerVertexIndex(i, j) * 3 + 2]).toBe(zone.heights[node]);
        }
        for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
          const node = (cy * 8 + j) * 129 + cx * 8 + i;
          const ends = diagonal === 'rising' ? [zone.heights[node]!, zone.heights[node + 130]!] : [zone.heights[node + 1]!, zone.heights[node + 129]!];
          expect(positions[centerVertexIndex(i, j) * 3 + 2]).toBe(Math.fround((ends[0]! + ends[1]!) / 2));
        }
      }
    }
  });

  it('provides exactly its tiles, under its own name in errors', () => {
    const zone = tileZone('falling');
    const provider = heightFieldTileProvider(config, zone.id, gridZoneTiles(config, zone), gridZoneSampler(zone).heightAt);
    expect(provider.has({ x: -2, y: 3 })).toBe(true);
    expect(provider.has({ x: -1, y: 3 })).toBe(false);
    expect(() => provider.begin({ x: 0, y: 0 })).toThrow(/map "one-tile": tile 0,0 does not exist/);
    expect(provider.build({ x: -2, y: 3 }).kind).toBe('land');
    expect(provider.builds).toBe(1);
  });

  it('maps weight channels to layer alphas (maximum of the listed channels)', () => {
    const zone = small('falling');
    const paint = gridZonePaint(zone, [0, 1, 2, 3], [['a', 'b'], ['b'], []]);
    expect(paint.usesHeight).toBe(false);
    expect(paint.layers).toEqual([0, 1, 2, 3]);
    expect(paint.alphaAt(100, -20, 0)).toEqual([1, 1, 0]); // a = 0, b = 1
    expect(paint.alphaAt(110, -20, 0)).toEqual([1, 0, 0]); // a = 1, b = 0
    expect(paint.alphaAt(120, -20, 0)).toEqual([0, 0, 0]);
    expect(paint.alphaAt(110, -10, 0)[1]).toBeCloseTo(0.4, 12);
    expect(() => gridZonePaint(zone, [0, 1, 2, 3], [['nope'], [], []])).toThrow(/no channel "nope"/);
  });
});
