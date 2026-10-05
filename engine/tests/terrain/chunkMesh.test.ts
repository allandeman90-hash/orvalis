import { describe, expect, it } from 'vitest';
import {
  buildChunkGeometry,
  buildChunkIndices,
  buildChunkWireIndices,
  holeBit,
  holeCount,
  isCellHole,
  NO_HOLES,
  centerVertexIndex,
  type ChunkGeometry,
  chunkVertexGridPosition,
  createTerrainConfig,
  ORVALIS_DEFAULT,
  outerVertexIndex,
  syntheticChunkHeights,
  VANILLA_REFERENCE,
} from '../../src/terrain';

const flatHeights = () => new Float32Array(145);
const isCenter = (index: number) => index % 17 >= 9;

/** z component of the triangle normal: > 0 when counter-clockwise seen from above (+z). */
function windingZ(g: ChunkGeometry, t: number): number {
  const [a, b, c] = [g.indices[t * 3]!, g.indices[t * 3 + 1]!, g.indices[t * 3 + 2]!];
  const p = (i: number, k: number) => g.positions[i * 3 + k]!;
  return (p(b, 0) - p(a, 0)) * (p(c, 1) - p(a, 1)) - (p(b, 1) - p(a, 1)) * (p(c, 0) - p(a, 0));
}
/** Number of triangles that do NOT face up. */
function wronglyWound(g: ChunkGeometry): number {
  let bad = 0;
  for (let t = 0; t < g.triangleCount; t++) if (!(windingZ(g, t) > 0)) bad++;
  return bad;
}

describe('chunk topology (P1.2b)', () => {
  const g = buildChunkGeometry(ORVALIS_DEFAULT, flatHeights());

  it('exact counts for a chunk without holes', () => {
    expect(g.vertexCount).toBe(145);
    expect(g.triangleCount).toBe(256);
    expect(g.indices.length).toBe(768);
    expect(g.positions.length).toBe(145 * 3);
    expect(g.positions).toBeInstanceOf(Float32Array);
    expect(g.indices).toBeInstanceOf(Uint16Array);
  });

  it('81 outer vertices and 64 centre vertices', () => {
    let outer = 0, center = 0;
    for (let i = 0; i < 145; i++) {
      if (isCenter(i)) center++;
      else outer++;
    }
    expect([outer, center]).toEqual([81, 64]);
    for (let i = 0; i < 145; i++) {
      const { u, v } = chunkVertexGridPosition(i);
      expect(Number.isInteger(u) && Number.isInteger(v)).toBe(!isCenter(i)); // centres sit on half-integers
    }
  });

  it('every index is valid and every vertex is used', () => {
    const used = new Set<number>();
    for (const i of g.indices) {
      expect(i).toBeLessThan(145);
      used.add(i);
    }
    expect(used.size).toBe(145);
  });

  it('every triangle is one centre + two outer vertices (a fan, not a plain grid)', () => {
    for (let t = 0; t < 256; t++) {
      const tri = [g.indices[t * 3]!, g.indices[t * 3 + 1]!, g.indices[t * 3 + 2]!];
      expect(tri.filter(isCenter)).toHaveLength(1);
      expect(isCenter(tri[0]!)).toBe(true); // the centre comes first
      expect(new Set(tri).size).toBe(3);
    }
  });

  it('each centre vertex is the hub of exactly 4 triangles covering its cell', () => {
    const fans = new Map<number, number[][]>();
    for (let t = 0; t < 256; t++) {
      const c = g.indices[t * 3]!;
      (fans.get(c) ?? fans.set(c, []).get(c)!).push([g.indices[t * 3 + 1]!, g.indices[t * 3 + 2]!]);
    }
    expect(fans.size).toBe(64);
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 8; i++) {
        const fan = fans.get(centerVertexIndex(i, j))!;
        expect(fan).toHaveLength(4);
        const corners = [outerVertexIndex(i, j), outerVertexIndex(i + 1, j), outerVertexIndex(i + 1, j + 1), outerVertexIndex(i, j + 1)];
        // The 4 rim edges of the fan are exactly the 4 sides of the cell, in counter-clockwise order.
        expect(fan).toEqual([[corners[0], corners[1]], [corners[1], corners[2]], [corners[2], corners[3]], [corners[3], corners[0]]]);
      }
    }
  });

  it('outer vertices are shared as expected: corners 2 triangles, edges 4, interior 8', () => {
    const uses = new Array<number>(145).fill(0);
    for (const i of g.indices) uses[i]!++;
    for (let j = 0; j <= 8; j++) {
      for (let i = 0; i <= 8; i++) {
        const border = (i === 0 || i === 8 ? 1 : 0) + (j === 0 || j === 8 ? 1 : 0);
        expect(uses[outerVertexIndex(i, j)], `outer (${i},${j})`).toBe([8, 4, 2][border]);
      }
    }
  });

  it('no two triangles are the same', () => {
    const keys = new Set<string>();
    for (let t = 0; t < 256; t++) keys.add([g.indices[t * 3], g.indices[t * 3 + 1], g.indices[t * 3 + 2]].sort().join(','));
    expect(keys.size).toBe(256);
  });

  it('the index list does not depend on heights or scale', () => {
    expect(Array.from(buildChunkIndices())).toEqual(Array.from(g.indices));
    expect(Array.from(buildChunkGeometry(VANILLA_REFERENCE, syntheticChunkHeights(VANILLA_REFERENCE, 'hill', 9)).indices)).toEqual(Array.from(g.indices));
  });

  it('vertex order: 9 outer vertices then 8 centres, row after row', () => {
    expect([outerVertexIndex(0, 0), outerVertexIndex(8, 0), centerVertexIndex(0, 0), centerVertexIndex(7, 0), outerVertexIndex(0, 1)]).toEqual([0, 8, 9, 16, 17]);
    expect(outerVertexIndex(8, 8)).toBe(144);
    expect(chunkVertexGridPosition(0)).toEqual({ u: 0, v: 0 });
    expect(chunkVertexGridPosition(9)).toEqual({ u: 0.5, v: 0.5 });
    expect(chunkVertexGridPosition(144)).toEqual({ u: 8, v: 8 });
    expect(() => chunkVertexGridPosition(145)).toThrow(/0\.\.144/);
    expect(() => chunkVertexGridPosition(-1)).toThrow(/0\.\.144/);
  });
});

describe('chunk winding (P1.2d): counter-clockwise seen from above = front face', () => {
  it.each(['flat', 'slope', 'hill'] as const)('all 256 triangles of a %s chunk face up', (kind) => {
    for (const config of [ORVALIS_DEFAULT, VANILLA_REFERENCE]) {
      expect(wronglyWound(buildChunkGeometry(config, syntheticChunkHeights(config, kind, 12)))).toBe(0);
    }
  });
  it('an inverted winding is detected', () => {
    const g = buildChunkGeometry(ORVALIS_DEFAULT, flatHeights());
    const flipped = Uint16Array.from(g.indices);
    for (let t = 0; t < 256; t++) [flipped[t * 3 + 1], flipped[t * 3 + 2]] = [flipped[t * 3 + 2]!, flipped[t * 3 + 1]!];
    expect(wronglyWound({ ...g, indices: flipped })).toBe(256);
    const oneFlipped = Uint16Array.from(g.indices);
    [oneFlipped[1], oneFlipped[2]] = [oneFlipped[2]!, oneFlipped[1]!];
    expect(wronglyWound({ ...g, indices: oneFlipped })).toBe(1);
  });
});

describe.each([
  ['Orvalis 4', ORVALIS_DEFAULT],
  ['Vanilla 25/6', VANILLA_REFERENCE],
  ['cell 1', createTerrainConfig(1)],
  ['cell 3.7', createTerrainConfig(3.7)],
] as const)('chunk physical extent (P1.2e) — %s', (_name, config) => {
  const size = config.chunkSize;
  const extent = (g: ChunkGeometry) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < 145; i++) {
      minX = Math.min(minX, g.positions[i * 3]!);
      maxX = Math.max(maxX, g.positions[i * 3]!);
      minY = Math.min(minY, g.positions[i * 3 + 1]!);
      maxY = Math.max(maxY, g.positions[i * 3 + 1]!);
    }
    return { minX, minY, maxX, maxY };
  };

  it('covers exactly chunkSize × chunkSize from its origin', () => {
    const e = extent(buildChunkGeometry(config, flatHeights()));
    expect([e.minX, e.minY]).toEqual([0, 0]);
    expect(e.maxX).toBe(Math.fround(size));
    expect(e.maxY).toBe(Math.fround(size));
  });

  it('min corner, max corner and centre are where they should be', () => {
    const g = buildChunkGeometry(config, flatHeights());
    const at = (index: number) => [g.positions[index * 3], g.positions[index * 3 + 1]];
    expect(at(outerVertexIndex(0, 0))).toEqual([0, 0]);
    expect(at(outerVertexIndex(8, 8))).toEqual([Math.fround(size), Math.fround(size)]);
    expect(at(outerVertexIndex(4, 4))).toEqual([Math.fround(size / 2), Math.fround(size / 2)]); // chunk centre is an outer vertex
    expect(at(centerVertexIndex(0, 0))).toEqual([Math.fround(config.cellSize / 2), Math.fround(config.cellSize / 2)]);
    expect(at(centerVertexIndex(7, 7))).toEqual([Math.fround(size - config.cellSize / 2), Math.fround(size - config.cellSize / 2)]);
  });

  it('follows its origin, including negative ones', () => {
    const ox = -3 * size, oy = 5 * size;
    const e = extent(buildChunkGeometry(config, flatHeights(), ox, oy));
    expect(e.minX).toBe(Math.fround(ox));
    expect(e.minY).toBe(Math.fround(oy));
    expect(e.maxX).toBeCloseTo(ox + size, 3);
    expect(e.maxY).toBeCloseTo(oy + size, 3);
  });

  it('outer vertices are one cell apart, centres sit in the middle of their cell', () => {
    const g = buildChunkGeometry(config, flatHeights());
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 8; i++) {
        const x = (index: number) => g.positions[index * 3]!, y = (index: number) => g.positions[index * 3 + 1]!;
        expect(x(outerVertexIndex(i + 1, j)) - x(outerVertexIndex(i, j))).toBeCloseTo(config.cellSize, 4);
        expect(y(outerVertexIndex(i, j + 1)) - y(outerVertexIndex(i, j))).toBeCloseTo(config.cellSize, 4);
        const c = centerVertexIndex(i, j);
        expect(x(c)).toBeCloseTo((x(outerVertexIndex(i, j)) + x(outerVertexIndex(i + 1, j))) / 2, 4);
        expect(y(c)).toBeCloseTo((y(outerVertexIndex(i, j)) + y(outerVertexIndex(i, j + 1))) / 2, 4);
      }
    }
  });
});

describe('synthetic heights (P1.2c)', () => {
  const config = ORVALIS_DEFAULT;
  const z = (g: ChunkGeometry, index: number) => g.positions[index * 3 + 2]!;

  it('flat: every height is 0 and the height goes to z', () => {
    const g = buildChunkGeometry(config, syntheticChunkHeights(config, 'flat', 12));
    for (let i = 0; i < 145; i++) expect(z(g, i)).toBe(0);
    expect([g.minHeight, g.maxHeight]).toEqual([0, 0]);
  });

  it('slope: rises linearly with x, does not depend on y', () => {
    const g = buildChunkGeometry(config, syntheticChunkHeights(config, 'slope', 12));
    for (let j = 0; j <= 8; j++) {
      for (let i = 0; i <= 8; i++) expect(z(g, outerVertexIndex(i, j))).toBeCloseTo((i / 8) * 12, 5);
    }
    expect(z(g, centerVertexIndex(0, 3))).toBeCloseTo((0.5 / 8) * 12, 5);
    expect([g.minHeight, g.maxHeight]).toEqual([0, 12]);
  });

  it('hill: highest at the chunk centre, zero on the border, symmetric', () => {
    const g = buildChunkGeometry(config, syntheticChunkHeights(config, 'hill', 12));
    expect(z(g, outerVertexIndex(4, 4))).toBeCloseTo(12, 5);
    expect(g.maxHeight).toBeCloseTo(12, 5);
    for (let k = 0; k <= 8; k++) {
      for (const index of [outerVertexIndex(k, 0), outerVertexIndex(k, 8), outerVertexIndex(0, k), outerVertexIndex(8, k)]) expect(Math.abs(z(g, index))).toBeLessThan(1e-5);
    }
    expect(z(g, outerVertexIndex(2, 5))).toBeCloseTo(z(g, outerVertexIndex(6, 3)), 5);
    expect(z(g, centerVertexIndex(3, 3))).toBeGreaterThan(z(g, centerVertexIndex(1, 1)));
  });

  it('amplitude scales the relief', () => {
    const a = syntheticChunkHeights(config, 'hill', 5), b = syntheticChunkHeights(config, 'hill', 10);
    for (let i = 0; i < 145; i++) expect(b[i]).toBeCloseTo(a[i]! * 2, 5);
  });
});

describe('chunk holes (P1.3): 4 × 4 mask, each bit removes 2 × 2 cells', () => {
  const trianglesOf = (indices: Uint16Array) => {
    const out: number[][] = [];
    for (let t = 0; t < indices.length; t += 3) out.push([indices[t]!, indices[t + 1]!, indices[t + 2]!]);
    return out;
  };
  /** Cell (i, j) whose centre vertex is `index`. */
  const cellOfCenter = (index: number) => ({ i: (index % 17) - 9, j: Math.floor(index / 17) });

  it('no hole: the full 256 triangles, same indices as before', () => {
    expect(buildChunkIndices(NO_HOLES).length).toBe(768);
    expect(Array.from(buildChunkIndices(0))).toEqual(Array.from(buildChunkIndices()));
    expect(buildChunkGeometry(ORVALIS_DEFAULT, flatHeights()).holes).toBe(0);
  });

  it('bit numbering: hx + 4·hy, one bit per 2 × 2 block of cells', () => {
    expect(holeBit(0, 0)).toBe(1);
    expect(holeBit(1, 1)).toBe(1); // same block as (0, 0)
    expect(holeBit(2, 0)).toBe(1 << 1);
    expect(holeBit(7, 0)).toBe(1 << 3);
    expect(holeBit(0, 2)).toBe(1 << 4);
    expect(holeBit(4, 4)).toBe(1 << 10);
    expect(holeBit(7, 7)).toBe(1 << 15);
    const bits = new Set<number>();
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) bits.add(holeBit(i, j));
    expect(bits.size).toBe(16);
  });

  it.each([0, 1, 2, 3, 5, 10, 15])('hole bit %i removes exactly its 4 cells (16 triangles, 48 indices)', (bit) => {
    const mask = 1 << bit;
    const indices = buildChunkIndices(mask);
    expect(indices.length).toBe(768 - 48);
    const keptCells = new Map<string, number>();
    for (const [c] of trianglesOf(indices)) {
      const { i, j } = cellOfCenter(c!);
      keptCells.set(`${i},${j}`, (keptCells.get(`${i},${j}`) ?? 0) + 1);
    }
    expect(keptCells.size).toBe(60);
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 8; i++) {
        const inHole = Math.floor(i / 2) + 4 * Math.floor(j / 2) === bit;
        expect(isCellHole(mask, i, j)).toBe(inHole);
        expect(keptCells.get(`${i},${j}`), `cell (${i},${j})`).toBe(inHole ? undefined : 4);
      }
    }
  });

  it('several holes add up; a fully holed chunk has no triangle', () => {
    expect(buildChunkIndices(0b1000_0000_0000_0001).length).toBe(768 - 2 * 48);
    expect(buildChunkIndices(0x00ff).length).toBe(768 - 8 * 48);
    expect(buildChunkIndices(0xffff).length).toBe(0);
    expect(holeCount(0)).toBe(0);
    expect(holeCount(0b1010)).toBe(2);
    expect(holeCount(0xffff)).toBe(16);
  });

  it('remaining triangles are untouched: same triangles as the full chunk, minus the hole', () => {
    const full = trianglesOf(buildChunkIndices()).map((t) => t.join(','));
    const holed = trianglesOf(buildChunkIndices(1 << 10)).map((t) => t.join(','));
    const fullSet = new Set(full);
    for (const t of holed) expect(fullSet.has(t)).toBe(true);
    expect(holed).toEqual(full.filter((t) => !isCellHole(1 << 10, cellOfCenter(Number(t.split(',')[0])).i, cellOfCenter(Number(t.split(',')[0])).j)));
  });

  it('a hole changes indices only: 145 vertices, same positions, winding still up', () => {
    const heights = syntheticChunkHeights(ORVALIS_DEFAULT, 'hill', 12);
    const full = buildChunkGeometry(ORVALIS_DEFAULT, heights);
    const holed = buildChunkGeometry(ORVALIS_DEFAULT, heights, 0, 0, 1 << 10);
    expect(holed.vertexCount).toBe(145);
    expect(Array.from(holed.positions)).toEqual(Array.from(full.positions));
    expect(holed.triangleCount).toBe(240);
    expect(holed.holes).toBe(1 << 10);
    expect(wronglyWound(holed)).toBe(0);
  });

  it('rejects an invalid mask', () => {
    for (const bad of [-1, 0x10000, 1.5, Number.NaN]) {
      expect(() => buildChunkIndices(bad)).toThrow(/hole mask/);
      expect(() => holeCount(bad)).toThrow(/hole mask/);
    }
  });
});

describe('chunk wireframe indices (P1.3)', () => {
  const edgesOf = (lines: Uint16Array) => {
    const out: string[] = [];
    for (let k = 0; k < lines.length; k += 2) out.push([lines[k]!, lines[k + 1]!].sort((a, b) => a - b).join('-'));
    return out;
  };

  it('full chunk: 400 unique edges (144 cell sides + 256 spokes)', () => {
    const lines = buildChunkWireIndices();
    expect(lines).toBeInstanceOf(Uint16Array);
    expect(lines.length).toBe(800);
    const edges = edgesOf(lines);
    expect(new Set(edges).size).toBe(400);
    const spokes = edges.filter((e) => e.split('-').some((v) => isCenter(Number(v))));
    expect(spokes).toHaveLength(256); // 4 per cell, centre to corner
    expect(edges.length - spokes.length).toBe(144); // 72 horizontal + 72 vertical sides
  });

  it('every line is an edge of a kept triangle, and every triangle edge is drawn', () => {
    for (const holes of [0, 1 << 10, 0x0f0f]) {
      const expected = new Set<string>();
      const tri = buildChunkIndices(holes);
      for (let t = 0; t < tri.length; t += 3) {
        const v = [tri[t]!, tri[t + 1]!, tri[t + 2]!];
        for (const [a, b] of [[v[0]!, v[1]!], [v[1]!, v[2]!], [v[2]!, v[0]!]]) expected.add([a, b].sort((x, y) => x! - y!).join('-'));
      }
      const edges = edgesOf(buildChunkWireIndices(holes));
      expect(new Set(edges)).toEqual(expected);
      expect(edges.length).toBe(expected.size); // no duplicate
    }
  });

  it('a hole removes its spokes but keeps the sides shared with neighbouring cells', () => {
    const edges = new Set(edgesOf(buildChunkWireIndices(1 << 10))); // cells 4..5 × 4..5
    // 16 spokes gone, plus the 4 sides strictly inside the 2 × 2 block.
    expect(edges.size).toBe(400 - 16 - 4);
    const side = [outerVertexIndex(4, 4), outerVertexIndex(5, 4)].sort((a, b) => a - b).join('-'); // border with cell (4, 3)
    expect(edges.has(side)).toBe(true);
    const inner = [outerVertexIndex(5, 4), outerVertexIndex(5, 5)].sort((a, b) => a - b).join('-'); // between two holed cells
    expect(edges.has(inner)).toBe(false);
  });

  it('a fully holed chunk has no line', () => {
    expect(buildChunkWireIndices(0xffff).length).toBe(0);
  });
});

describe('buildChunkGeometry input checks', () => {
  it('needs exactly 145 finite heights', () => {
    expect(() => buildChunkGeometry(ORVALIS_DEFAULT, new Float32Array(144))).toThrow(/145 heights/);
    expect(() => buildChunkGeometry(ORVALIS_DEFAULT, new Float32Array(81))).toThrow(/145 heights/);
    const bad = flatHeights();
    bad[70] = Number.NaN;
    expect(() => buildChunkGeometry(ORVALIS_DEFAULT, bad)).toThrow(/height 70/);
  });
});
