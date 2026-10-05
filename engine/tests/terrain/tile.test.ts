import { describe, expect, it } from 'vitest';
import {
  buildChunkBorderLineIndices,
  buildTerrainTile,
  centerVertexIndex,
  chunkOrigin,
  createTerrainConfig,
  FALLBACK_NORMAL,
  ORVALIS_DEFAULT,
  outerVertexIndex,
  type TerrainChunk,
  type TerrainTile,
  TILE_OUTER_NODES,
  tileChunkIndex,
  tileHeightFixture,
  tileOuterNodeIndex,
  VANILLA_REFERENCE,
  worldToChunk,
} from '../../src/terrain';

const CONFIGS = [ORVALIS_DEFAULT, VANILLA_REFERENCE, createTerrainConfig(1)];
const TILES = [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -2, y: 3 }];

const pos = (c: TerrainChunk, v: number): number[] => Array.from(c.geometry.positions.subarray(v * 3, v * 3 + 3));
const nrm = (c: TerrainChunk, v: number): number[] => Array.from(c.geometry.normals.subarray(v * 3, v * 3 + 3));
const chunkAt = (t: TerrainTile, cx: number, cy: number): TerrainChunk => t.chunks[tileChunkIndex(cx, cy)]!;
const hills = (config = ORVALIS_DEFAULT, coord = { x: 0, y: 0 }, options = {}): TerrainTile => buildTerrainTile(config, coord, tileHeightFixture(config, 'hills'), options);

describe('TerrainTile — structure and totals', () => {
  it('has exactly 16 × 16 = 256 chunks, each keeping its identity', () => {
    const tile = hills(ORVALIS_DEFAULT, { x: -2, y: 3 });
    expect(tile.chunks.length).toBe(256);
    expect(tile.coord).toEqual({ x: -2, y: 3 });
    expect(tile.config).toBe(ORVALIS_DEFAULT);
    const seen = new Set<string>();
    tile.chunks.forEach((chunk, index) => {
      expect(index).toBe(chunk.chunkY * 16 + chunk.chunkX);
      expect(chunk.address).toEqual({ tile: { x: -2, y: 3 }, chunkX: chunk.chunkX, chunkY: chunk.chunkY });
      expect(chunk.chunkX >= 0 && chunk.chunkX <= 15 && chunk.chunkY >= 0 && chunk.chunkY <= 15).toBe(true);
      seen.add(`${chunk.chunkX},${chunk.chunkY}`);
    });
    expect(seen.size).toBe(256);
  });

  it('stores 37 120 vertices, 65 536 triangles and 196 608 indices without holes', () => {
    const tile = hills();
    expect(tile.vertexCount).toBe(37120);
    expect(tile.triangleCount).toBe(65536);
    expect(tile.indexCount).toBe(196608);
    // Counted for real, not just reported.
    let vertices = 0, indices = 0;
    for (const chunk of tile.chunks) {
      expect(chunk.geometry.positions.length).toBe(145 * 3);
      expect(chunk.geometry.normals.length).toBe(145 * 3);
      expect(chunk.geometry.indices.length).toBe(768);
      vertices += chunk.geometry.positions.length / 3;
      indices += chunk.geometry.indices.length;
    }
    expect([vertices, indices, indices / 3]).toEqual([37120, 196608, 65536]);
  });

  it('chunks stay independent: no two chunks share an array', () => {
    const tile = hills();
    expect(new Set(tile.chunks.map((c) => c.geometry.positions)).size).toBe(256);
    expect(new Set(tile.chunks.map((c) => c.geometry.normals)).size).toBe(256);
  });

  it('rejects invalid tile coordinates and chunk indices', () => {
    expect(() => buildTerrainTile(ORVALIS_DEFAULT, { x: 0.5, y: 0 }, () => 0)).toThrow();
    expect(() => tileChunkIndex(16, 0)).toThrow();
    expect(() => tileChunkIndex(0, -1)).toThrow();
    expect(() => buildTerrainTile(ORVALIS_DEFAULT, { x: 0, y: 0 }, () => Number.NaN)).toThrow(/not finite/);
  });
});

describe('TerrainTile — physical extent and origins', () => {
  it('ORVALIS_DEFAULT: cell 4, chunk 32, tile 512 × 512 exactly', () => {
    const tile = hills();
    expect([ORVALIS_DEFAULT.cellSize, ORVALIS_DEFAULT.chunkSize, ORVALIS_DEFAULT.tileSize]).toEqual([4, 32, 512]);
    expect(pos(chunkAt(tile, 0, 0), outerVertexIndex(0, 0)).slice(0, 2)).toEqual([0, 0]);
    expect(pos(chunkAt(tile, 15, 0), outerVertexIndex(8, 0)).slice(0, 2)).toEqual([512, 0]);
    expect(pos(chunkAt(tile, 0, 15), outerVertexIndex(0, 8)).slice(0, 2)).toEqual([0, 512]);
    expect(pos(chunkAt(tile, 15, 15), outerVertexIndex(8, 8)).slice(0, 2)).toEqual([512, 512]);
  });

  for (const config of CONFIGS) {
    for (const coord of TILES) {
      it(`4 corners, chunk origins and extent (cellSize ${config.cellSize}, tile ${coord.x},${coord.y})`, () => {
        const tile = hills(config, coord);
        const T = config.tileSize, ox = coord.x * T, oy = coord.y * T;
        expect(tile.origin).toEqual({ x: ox, y: oy });
        const corners: Array<[number, number, number, number, number, number]> = [[0, 0, 0, 0, ox, oy], [15, 0, 8, 0, ox + T, oy], [0, 15, 0, 8, ox, oy + T], [15, 15, 8, 8, ox + T, oy + T]];
        for (const [cx, cy, i, j, wx, wy] of corners) {
          const p = pos(chunkAt(tile, cx, cy), outerVertexIndex(i, j));
          expect(p[0]).toBe(Math.fround(wx));
          expect(p[1]).toBe(Math.fround(wy));
        }
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const chunk of tile.chunks) {
          // Origin derived from tile coord + chunk coord + TerrainConfig (P1.1 conversion).
          expect(chunk.origin).toEqual(chunkOrigin(config, chunk.address));
          const first = pos(chunk, outerVertexIndex(0, 0)), last = pos(chunk, outerVertexIndex(8, 8));
          expect(Math.abs(first[0]! - chunk.origin.x)).toBeLessThan(1e-3);
          expect(Math.abs(first[1]! - chunk.origin.y)).toBeLessThan(1e-3);
          expect(Math.abs(last[0]! - first[0]! - config.chunkSize)).toBeLessThan(1e-3);
          expect(Math.abs(last[1]! - first[1]! - config.chunkSize)).toBeLessThan(1e-3);
          // P1.1 round trip: the centre of the chunk maps back to this very chunk, also for negative tiles.
          const centre = pos(chunk, centerVertexIndex(4, 4));
          expect(worldToChunk(config, centre[0]!, centre[1]!)).toEqual(chunk.address);
          for (let v = 0; v < 145; v++) {
            const p = pos(chunk, v);
            minX = Math.min(minX, p[0]!); maxX = Math.max(maxX, p[0]!);
            minY = Math.min(minY, p[1]!); maxY = Math.max(maxY, p[1]!);
          }
        }
        expect([minX, maxX, minY, maxY]).toEqual([ox, ox + T, oy, oy + T].map(Math.fround));
      });
    }
  }
});

describe('TerrainTile — geometric continuity (no gap, no overlap, no one-cell offset)', () => {
  for (const config of CONFIGS) {
    for (const coord of TILES) {
      it(`every internal border is bit-identical on both sides: x, y, z (cellSize ${config.cellSize}, tile ${coord.x},${coord.y})`, () => {
        const tile = hills(config, coord);
        let horizontal = 0, vertical = 0;
        for (let cy = 0; cy < 16; cy++) {
          for (let cx = 0; cx < 16; cx++) {
            const a = chunkAt(tile, cx, cy);
            if (cx < 15) {
              const b = chunkAt(tile, cx + 1, cy);
              for (let j = 0; j <= 8; j++) {
                expect(pos(a, outerVertexIndex(8, j))).toEqual(pos(b, outerVertexIndex(0, j))); // right edge == left edge
                // Not shifted by one cell:
                expect(pos(a, outerVertexIndex(7, j))[0]).toBeLessThan(pos(b, outerVertexIndex(0, j))[0]!);
                expect(pos(b, outerVertexIndex(1, j))[0]).toBeGreaterThan(pos(a, outerVertexIndex(8, j))[0]!);
                horizontal++;
              }
            }
            if (cy < 15) {
              const b = chunkAt(tile, cx, cy + 1);
              for (let i = 0; i <= 8; i++) {
                expect(pos(a, outerVertexIndex(i, 8))).toEqual(pos(b, outerVertexIndex(i, 0))); // top edge == bottom edge
                expect(pos(a, outerVertexIndex(i, 7))[1]).toBeLessThan(pos(b, outerVertexIndex(i, 0))[1]!);
                vertical++;
              }
            }
          }
        }
        expect([horizontal, vertical]).toEqual([16 * 15 * 9, 16 * 15 * 9]);
      });
    }
  }

  it('every stored height is exactly f(worldX, worldY), and the surface does not restart at each chunk', () => {
    const config = ORVALIS_DEFAULT;
    const f = tileHeightFixture(config, 'hills');
    const tile = buildTerrainTile(config, { x: -1, y: 0 }, f);
    for (const chunk of tile.chunks) {
      for (let v = 0; v < 145; v++) {
        const p = pos(chunk, v);
        expect(p[2]).toBe(Math.fround(f(p[0]!, p[1]!)));
      }
    }
    // Chunks are not copies of each other.
    const heights = (c: TerrainChunk): number[] => Array.from({ length: 145 }, (_, v) => pos(c, v)[2]!);
    expect(heights(chunkAt(tile, 0, 0))).not.toEqual(heights(chunkAt(tile, 1, 0)));
    expect(heights(chunkAt(tile, 0, 0))).not.toEqual(heights(chunkAt(tile, 0, 1)));
    expect(tile.maxHeight - tile.minHeight).toBeGreaterThan(config.chunkSize);
  });

  it('the cell spacing is uniform across a chunk border', () => {
    const tile = hills();
    const a = chunkAt(tile, 6, 9), b = chunkAt(tile, 7, 9);
    const xs = [...Array.from({ length: 9 }, (_, i) => pos(a, outerVertexIndex(i, 3))[0]!), ...Array.from({ length: 8 }, (_, i) => pos(b, outerVertexIndex(i + 1, 3))[0]!)];
    for (let k = 1; k < xs.length; k++) expect(xs[k]! - xs[k - 1]!).toBe(4);
  });
});

describe('TerrainTile — seamless normals between chunks', () => {
  const unit = (n: number[]): void => {
    expect(n.every(Number.isFinite)).toBe(true);
    expect(Math.abs(Math.hypot(n[0]!, n[1]!, n[2]!) - 1)).toBeLessThan(1e-5);
  };

  for (const config of CONFIGS) {
    for (const coord of TILES) {
      it(`shared vertices have bit-identical normals; every normal is unit and finite (cellSize ${config.cellSize}, tile ${coord.x},${coord.y})`, () => {
        const tile = hills(config, coord);
        for (let cy = 0; cy < 16; cy++) {
          for (let cx = 0; cx < 16; cx++) {
            const a = chunkAt(tile, cx, cy);
            if (cx < 15) for (let j = 0; j <= 8; j++) expect(nrm(a, outerVertexIndex(8, j))).toEqual(nrm(chunkAt(tile, cx + 1, cy), outerVertexIndex(0, j)));
            if (cy < 15) for (let i = 0; i <= 8; i++) expect(nrm(a, outerVertexIndex(i, 8))).toEqual(nrm(chunkAt(tile, cx, cy + 1), outerVertexIndex(i, 0)));
          }
        }
        for (const chunk of tile.chunks) for (let v = 0; v < 145; v++) unit(nrm(chunk, v));
      });
    }
  }

  it('where 4 chunks meet, the 4 copies agree and equal the sum of ALL 8 faces around the point', () => {
    const tile = hills();
    for (let cy = 0; cy < 15; cy++) {
      for (let cx = 0; cx < 15; cx++) {
        const copies: Array<[TerrainChunk, number]> = [
          [chunkAt(tile, cx, cy), outerVertexIndex(8, 8)],
          [chunkAt(tile, cx + 1, cy), outerVertexIndex(0, 8)],
          [chunkAt(tile, cx, cy + 1), outerVertexIndex(8, 0)],
          [chunkAt(tile, cx + 1, cy + 1), outerVertexIndex(0, 0)],
        ];
        const want = nrm(...copies[0]!);
        for (const [chunk, v] of copies) {
          expect(pos(chunk, v)).toEqual(pos(...copies[0]!));
          expect(nrm(chunk, v)).toEqual(want);
        }
        if ((cx + cy) % 5 !== 0) continue; // the hand computation below on a sample of crossings
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
        expect(faces).toBe(8); // 2 per chunk
        const l = Math.hypot(sum[0]!, sum[1]!, sum[2]!);
        for (let k = 0; k < 3; k++) expect(want[k]).toBeCloseTo(sum[k]! / l, 6);
      }
    }
  });

  it('control — "isolated" chunks (P1.4 behaviour) DO disagree on the hills, and only border vertices differ', () => {
    const seamless = hills(), isolated = hills(ORVALIS_DEFAULT, { x: 0, y: 0 }, { normals: 'isolated' });
    let disagreements = 0, worst = 0;
    for (let cy = 0; cy < 16; cy++) {
      for (let cx = 0; cx < 15; cx++) {
        for (let j = 0; j <= 8; j++) {
          const a = nrm(chunkAt(isolated, cx, cy), outerVertexIndex(8, j)), b = nrm(chunkAt(isolated, cx + 1, cy), outerVertexIndex(0, j));
          const d = Math.max(...a.map((x, k) => Math.abs(x - b[k]!)));
          if (d > 1e-4) disagreements++;
          worst = Math.max(worst, d);
        }
      }
    }
    expect(disagreements).toBeGreaterThan(1000);
    expect(worst).toBeGreaterThan(0.05);
    // Inside a chunk nothing changes: the merge only touches shared vertices.
    for (let k = 0; k < 256; k += 17) {
      const s = seamless.chunks[k]!, i = isolated.chunks[k]!;
      for (let cj = 0; cj < 8; cj++) for (let ci = 0; ci < 8; ci++) expect(nrm(s, centerVertexIndex(ci, cj))).toEqual(nrm(i, centerVertexIndex(ci, cj)));
      for (let j = 1; j < 8; j++) for (let i2 = 1; i2 < 8; i2++) expect(nrm(s, outerVertexIndex(i2, j))).toEqual(nrm(i, outerVertexIndex(i2, j)));
    }
  });

  it('a plane across the whole tile has one single normal everywhere, tile border included', () => {
    for (const coord of TILES) {
      const tile = buildTerrainTile(ORVALIS_DEFAULT, coord, tileHeightFixture(ORVALIS_DEFAULT, 'slope'));
      const l = Math.hypot(0.25, 0.125, 1), want = [-0.25 / l, -0.125 / l, 1 / l];
      for (const chunk of tile.chunks) for (let v = 0; v < 145; v++) nrm(chunk, v).forEach((x, k) => expect(Math.abs(x - want[k]!)).toBeLessThan(2e-4));
      const flat = buildTerrainTile(ORVALIS_DEFAULT, coord, tileHeightFixture(ORVALIS_DEFAULT, 'flat'));
      for (const chunk of flat.chunks) for (let v = 0; v < 145; v++) expect(nrm(chunk, v)).toEqual([0, 0, 1]);
    }
  });

  it('FUTURE hook: sums from adjacent tiles can be injected on the outer grid', () => {
    const base = hills();
    const extra = new Float64Array(TILE_OUTER_NODES * TILE_OUTER_NODES * 3);
    extra[tileOuterNodeIndex(128, 40) * 3] = 5000; // a face of the tile to the east, leaning +x
    const joined = hills(ORVALIS_DEFAULT, { x: 0, y: 0 }, { outerGridExtraSums: extra });
    const a = chunkAt(joined, 15, 4), v = outerVertexIndex(8, 8); // node (128, 40): corner shared with chunk (15, 5)
    expect(nrm(a, v)[0]).toBeGreaterThan(nrm(chunkAt(base, 15, 4), v)[0]! + 0.1);
    expect(nrm(a, v)).toEqual(nrm(chunkAt(joined, 15, 5), outerVertexIndex(8, 0)));
    unit(nrm(a, v));
    expect(nrm(chunkAt(joined, 3, 3), outerVertexIndex(8, 8))).toEqual(nrm(chunkAt(base, 3, 3), outerVertexIndex(8, 8)));
    expect(() => hills(ORVALIS_DEFAULT, { x: 0, y: 0 }, { outerGridExtraSums: [1, 2, 3] })).toThrow(/outerGridExtraSums/);
  });
});

describe('TerrainTile — holes stay local to their chunk', () => {
  const holes = (cx: number, cy: number): number => (cx === 3 && cy === 4 ? 0b1 : cx === 9 && cy === 9 ? 0xffff : 0);
  const plain = hills(), holed = hills(ORVALIS_DEFAULT, { x: 0, y: 0 }, { holes });

  it('one chunk with a hole, one fully holed, 254 untouched', () => {
    expect(holed.chunks.length).toBe(256);
    expect(holed.vertexCount).toBe(37120); // vertices are never removed
    expect(holed.triangleCount).toBe(65536 - 16 - 256);
    expect(holed.indexCount).toBe(196608 - 48 - 768);
    for (const chunk of holed.chunks) {
      const want = chunk.chunkX === 3 && chunk.chunkY === 4 ? 720 : chunk.chunkX === 9 && chunk.chunkY === 9 ? 0 : 768;
      expect(chunk.geometry.indices.length).toBe(want);
      expect(chunk.geometry.holes).toBe(holes(chunk.chunkX, chunk.chunkY));
      // Positions never change.
      expect(Array.from(chunk.geometry.positions)).toEqual(Array.from(plain.chunks[tileChunkIndex(chunk.chunkX, chunk.chunkY)]!.geometry.positions));
    }
  });

  it('normals: chunks that do not touch a holed chunk are unchanged; shared borders still agree; nothing is NaN', () => {
    for (const chunk of holed.chunks) {
      const nearHole = (Math.abs(chunk.chunkX - 3) <= 1 && Math.abs(chunk.chunkY - 4) <= 1) || (Math.abs(chunk.chunkX - 9) <= 1 && Math.abs(chunk.chunkY - 9) <= 1);
      if (!nearHole) expect(Array.from(chunk.geometry.normals)).toEqual(Array.from(plain.chunks[tileChunkIndex(chunk.chunkX, chunk.chunkY)]!.geometry.normals));
      for (let v = 0; v < 145; v++) {
        const n = nrm(chunk, v);
        expect(n.every(Number.isFinite)).toBe(true);
        expect(Math.abs(Math.hypot(n[0]!, n[1]!, n[2]!) - 1)).toBeLessThan(1e-5);
      }
    }
    for (let cy = 0; cy < 16; cy++) for (let cx = 0; cx < 15; cx++) for (let j = 0; j <= 8; j++) expect(nrm(chunkAt(holed, cx, cy), outerVertexIndex(8, j))).toEqual(nrm(chunkAt(holed, cx + 1, cy), outerVertexIndex(0, j)));
  });

  it('missing faces do not contribute across the border; vertices inside the hole get the fallback', () => {
    const empty = chunkAt(holed, 9, 9);
    expect(nrm(empty, centerVertexIndex(4, 4))).toEqual([...FALLBACK_NORMAL]);
    expect(nrm(empty, outerVertexIndex(4, 4))).toEqual([...FALLBACK_NORMAL]);
    // Left neighbour's right edge: only ITS OWN faces remain there → same as the isolated computation.
    const isolated = hills(ORVALIS_DEFAULT, { x: 0, y: 0 }, { holes, normals: 'isolated' });
    for (let j = 1; j < 8; j++) {
      const got = nrm(chunkAt(holed, 8, 9), outerVertexIndex(8, j)), alone = nrm(chunkAt(isolated, 8, 9), outerVertexIndex(8, j));
      got.forEach((x, k) => expect(x).toBeCloseTo(alone[k]!, 6));
      expect(got).not.toEqual(nrm(chunkAt(plain, 8, 9), outerVertexIndex(8, j)));
    }
    // An invalid mask is refused.
    expect(() => hills(ORVALIS_DEFAULT, { x: 0, y: 0 }, { holes: () => 70000 })).toThrow(/hole mask/);
  });
});

describe('chunk border lines (debug bounds)', () => {
  it('32 edges along the outer border, each vertex on the border', () => {
    const lines = buildChunkBorderLineIndices();
    expect(lines.length).toBe(64);
    const border = new Set<number>();
    for (let i = 0; i <= 8; i++) for (const v of [outerVertexIndex(i, 0), outerVertexIndex(i, 8), outerVertexIndex(0, i), outerVertexIndex(8, i)]) border.add(v);
    for (const v of lines) expect(border.has(v)).toBe(true);
    expect(new Set(lines).size).toBe(32);
  });
});

describe('TerrainTile — chunk bounding boxes (P1.6)', () => {
  for (const coord of TILES) {
    it(`each box is the tightest box around the chunk's 145 stored vertices (tile ${coord.x},${coord.y})`, () => {
      const tile = hills(VANILLA_REFERENCE, coord);
      let withRelief = 0;
      for (const chunk of tile.chunks) {
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (let v = 0; v < 145; v++) pos(chunk, v).forEach((x, k) => { lo[k] = Math.min(lo[k]!, x); hi[k] = Math.max(hi[k]!, x); });
        expect([chunk.bounds.minX, chunk.bounds.minY, chunk.bounds.minZ]).toEqual(lo);
        expect([chunk.bounds.maxX, chunk.bounds.maxY, chunk.bounds.maxZ]).toEqual(hi);
        if (chunk.bounds.maxZ - chunk.bounds.minZ > 1) withRelief++;
      }
      expect(withRelief).toBeGreaterThan(200); // the boxes really follow the hills
    });
  }
});
