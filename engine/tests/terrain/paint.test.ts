import { describe, expect, it } from 'vitest';
import { buildTerrainTile, MASK_LIT, MASK_SIZE, ORVALIS_DEFAULT, paintFixture, type TerrainTile, tileChunkIndex, tileHeightFixture, VANILLA_REFERENCE } from '../../src/terrain';

const texel = (tile: TerrainTile, cx: number, cy: number, i: number, j: number): number[] => {
  const mask = tile.chunks[tileChunkIndex(cx, cy)]!.material!.mask;
  return Array.from(mask.subarray((j * MASK_SIZE + i) * 4, (j * MASK_SIZE + i) * 4 + 4));
};
const build = (kind: 'quadrants' | 'natural', coord = { x: 0, y: 0 }, config = ORVALIS_DEFAULT): TerrainTile =>
  buildTerrainTile(config, coord, tileHeightFixture(config, 'flat'), { paint: paintFixture(config, kind) });

describe('chunk materials', () => {
  it('a tile built without paint has no material; with paint every chunk gets 4 layers and a 64 × 64 RGBA mask', () => {
    const bare = buildTerrainTile(ORVALIS_DEFAULT, { x: 0, y: 0 }, () => 0);
    expect(bare.chunks.every((c) => c.material === undefined)).toBe(true);
    const tile = build('natural');
    for (const chunk of tile.chunks) {
      expect(chunk.material!.layers).toEqual([0, 1, 2, 3]);
      expect(chunk.material!.mask.length).toBe(64 * 64 * 4);
    }
    expect(MASK_SIZE).toBe(64);
  });

  it('R (baked shadow) is « fully lit » everywhere for now', () => {
    const tile = build('natural');
    for (const chunk of [tile.chunks[0]!, tile.chunks[100]!, tile.chunks[255]!]) {
      for (let k = 0; k < 64 * 64; k++) expect(chunk.material!.mask[k * 4]).toBe(MASK_LIT);
    }
  });

  it('quadrants: G, B, A select layers 1, 2, 3 in the SE, NW and NE quarters of the tile; SW is the base layer alone', () => {
    const tile = build('quadrants');
    expect(texel(tile, 3, 3, 32, 32)).toEqual([255, 0, 0, 0]); // south-west
    expect(texel(tile, 12, 3, 32, 32)).toEqual([255, 255, 0, 0]); // south-east → layer 1
    expect(texel(tile, 3, 12, 32, 32)).toEqual([255, 0, 255, 0]); // north-west → layer 2
    expect(texel(tile, 12, 12, 32, 32)).toEqual([255, 0, 0, 255]); // north-east → layer 3
    // Exactly on the middle line between SW and SE (x = tileSize / 2 is the left edge of chunk 8): half of layer 1.
    expect(texel(tile, 8, 3, 0, 32)).toEqual([255, 128, 0, 0]);
  });

  for (const config of [ORVALIS_DEFAULT, VANILLA_REFERENCE]) {
    for (const coord of [{ x: 0, y: 0 }, { x: -2, y: 3 }]) {
      it(`no seam: the last texel column/row of a chunk equals the first of its neighbour (cellSize ${config.cellSize}, tile ${coord.x},${coord.y})`, () => {
        const tile = build('natural', coord, config);
        let compared = 0;
        for (let cy = 0; cy < 16; cy++) {
          for (let cx = 0; cx < 16; cx++) {
            for (let k = 0; k < 64; k++) {
              if (cx < 15) expect(texel(tile, cx, cy, 63, k)).toEqual(texel(tile, cx + 1, cy, 0, k));
              if (cy < 15) expect(texel(tile, cx, cy, k, 63)).toEqual(texel(tile, cx, cy + 1, k, 0));
              compared++;
            }
          }
        }
        expect(compared).toBe(16 * 16 * 64);
      });
    }
  }

  it('…and across a TILE border too, since alphas are a function of the world position', () => {
    const left = build('natural', { x: -1, y: 0 }), right = build('natural', { x: 0, y: 0 });
    for (let cy = 0; cy < 16; cy++) for (let k = 0; k < 64; k++) expect(texel(left, 15, cy, 63, k)).toEqual(texel(right, 0, cy, 0, k));
  });

  it('the natural paint really uses the three overlay layers, and they vary', () => {
    const tile = build('natural');
    const seen = [new Set<number>(), new Set<number>(), new Set<number>()];
    for (const chunk of tile.chunks) for (let k = 0; k < 64 * 64; k += 7) for (let c = 0; c < 3; c++) seen[c]!.add(chunk.material!.mask[k * 4 + 1 + c]!);
    for (const values of seen) {
      expect(values.has(0)).toBe(true);
      expect(values.has(255)).toBe(true);
      expect(values.size).toBeGreaterThan(20); // smooth transitions, not just 0 and 255
    }
  });

  it('alphas are clamped to 0..255 whatever the paint returns', () => {
    const tile = buildTerrainTile(ORVALIS_DEFAULT, { x: 0, y: 0 }, () => 0, { paint: { layers: [3, 2, 1, 0], alphaAt: () => [-5, 0.5, 9] } });
    expect(texel(tile, 5, 5, 10, 10)).toEqual([255, 0, 128, 255]);
    expect(tile.chunks[0]!.material!.layers).toEqual([3, 2, 1, 0]);
  });
});
