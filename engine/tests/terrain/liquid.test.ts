import { describe, expect, it } from 'vitest';
import {
  buildChunkLiquidGeometry, buildTerrainTile, createTerrainConfig, LIQUID_CELL_NONE, LIQUID_CELLS, LIQUID_TYPE_CODE, LIQUID_VERTEX_FLOATS, LIQUID_VERTICES,
  liquidCellIndex, liquidFixture, type LiquidSource, liquidTypeOfCell, liquidVertexIndex, outerVertexIndex, sampleChunkLiquid, tileChunkIndex, TileBuildJob, VERTICES_PER_CHUNK,
} from '../../src/terrain';

const config = createTerrainConfig(4); // chunk 32, tile 512
/** Terrain vertices of a chunk at origin (ox, oy) whose ground height is ground(x, y). Only outer vertices matter here. */
function chunkPositions(ox: number, oy: number, ground: (x: number, y: number) => number): Float32Array {
  const p = new Float32Array(VERTICES_PER_CHUNK * 3);
  for (let j = 0; j <= 8; j++) for (let i = 0; i <= 8; i++) {
    const v = outerVertexIndex(i, j) * 3, x = ox + i * 4, y = oy + j * 4;
    p[v] = x;
    p[v + 1] = y;
    p[v + 2] = ground(x, y);
  }
  return p;
}
const sample = (source: LiquidSource, ground: (x: number, y: number) => number, ox = 0, oy = 0) =>
  sampleChunkLiquid(source, (l) => ox + l * 4, (l) => oy + l * 4, chunkPositions(ox, oy, ground));

describe('liquid layout (spec §21–§22)', () => {
  it('is 9 × 9 vertices and 8 × 8 cells per chunk', () => {
    expect(LIQUID_VERTICES).toBe(81);
    expect(LIQUID_CELLS).toBe(64);
    expect(liquidVertexIndex(8, 8)).toBe(80);
    expect(liquidCellIndex(7, 7)).toBe(63);
    expect(liquidVertexIndex(3, 2)).toBe(21);
    expect(liquidCellIndex(3, 2)).toBe(19);
  });

  it('keeps the liquid class in the low nibble: 0 river, 1 ocean, 2 magma, 3 slime', () => {
    expect(LIQUID_TYPE_CODE).toEqual({ river: 0, ocean: 1, magma: 2, slime: 3 });
    expect(liquidTypeOfCell(0)).toBe('river');
    expect(liquidTypeOfCell(1)).toBe('ocean');
    expect(liquidTypeOfCell(2)).toBe('magma');
    expect(liquidTypeOfCell(3)).toBe('slime');
    expect(liquidTypeOfCell(0x41)).toBe('ocean'); // upper bits are not the class
    expect(liquidTypeOfCell(LIQUID_CELL_NONE)).toBeNull();
    expect(liquidTypeOfCell(0xff)).toBeNull();
    expect(() => liquidTypeOfCell(7)).toThrow(/unknown liquid class 7/);
  });
});

describe('sampleChunkLiquid', () => {
  it('returns null when the source has nothing, or when the liquid is under the ground everywhere', () => {
    expect(sample(() => null, () => 0)).toBeNull();
    expect(sample(() => ({ height: 0, type: 'ocean' }), () => 5)).toBeNull();
    expect(sample(() => ({ height: 5, type: 'ocean' }), () => 5)).toBeNull(); // at ground level is not above it
  });

  it('fills every cell of a chunk lying under a flat sea', () => {
    const liquid = sample(() => ({ height: 2, type: 'ocean' }), () => -3)!;
    expect(liquid.cellCount).toBe(64);
    expect([...liquid.cells].every((c) => c === 1)).toBe(true);
    expect([...liquid.heights].every((h) => h === 2)).toBe(true);
    expect(liquid).toMatchObject({ minHeight: 2, maxHeight: 2 });
  });

  it('keeps only the cells where the surface is above the ground at a corner (a shore)', () => {
    // Ground rises with x: 0 at x = 0, 16 at x = 32. Sea at 6.5 → ground below the sea for x < 13.
    const liquid = sample(() => ({ height: 6.5, type: 'ocean' }), (x) => x / 2)!;
    // Cell column i spans x = 4i..4i+4; its lowest corner is at x = 4i → ground 2i < 6.5 ⇔ i ≤ 3.
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) expect(liquid.cells[liquidCellIndex(i, j)]).toBe(i <= 3 ? 1 : LIQUID_CELL_NONE);
    expect(liquid.cellCount).toBe(32);
  });

  it('takes each vertex height from the source: a surface need not be flat', () => {
    const liquid = sample((x, y) => ({ height: 10 + x / 8 - y / 16, type: 'river' }), () => 0, 64, -32)!;
    for (let j = 0; j <= 8; j++) for (let i = 0; i <= 8; i++) expect(liquid.heights[liquidVertexIndex(i, j)]).toBeCloseTo(10 + (64 + 4 * i) / 8 - (-32 + 4 * j) / 16, 5);
    expect(liquid.minHeight).toBeCloseTo(10 + 64 / 8 - 0 / 16, 5); // lowest: x smallest, y largest
    expect(liquid.maxHeight).toBeCloseTo(10 + 96 / 8 + 32 / 16, 5);
    expect([...liquid.cells].every((c) => c === 0)).toBe(true);
  });

  it('where the source stops, border vertices take the mean of the neighbouring liquid cells', () => {
    // Liquid only for x < 10 (cells 0, 1 have their centre inside: x = 2, 6; cell 2's centre is at x = 10: outside).
    const source: LiquidSource = (x) => (x < 10 ? { height: 3, type: 'slime' } : null);
    const liquid = sample(source, () => 0)!;
    expect(liquid.cellCount).toBe(16);
    expect(liquid.cells[liquidCellIndex(1, 4)]).toBe(3);
    expect(liquid.cells[liquidCellIndex(2, 4)]).toBe(LIQUID_CELL_NONE);
    expect(liquid.heights[liquidVertexIndex(2, 4)]).toBe(3); // x = 8: the source still answers
    // A source that stops BEFORE the cells' far edge: the vertex at x = 8 gets the mean of its liquid cells.
    const narrow = sample((x) => (x < 7 ? { height: 3, type: 'slime' } : null), () => 0)!;
    expect(narrow.cellCount).toBe(16);
    expect(narrow.heights[liquidVertexIndex(2, 4)]).toBe(3);
    expect(narrow.heights[liquidVertexIndex(5, 5)]).toBe(0); // belongs to no liquid cell: unused, and not in min/max
    expect(narrow).toMatchObject({ minHeight: 3, maxHeight: 3 });
  });

  it('refuses a non-finite height', () => {
    expect(() => sample(() => ({ height: Number.NaN, type: 'ocean' }), () => 0)).toThrow(/not finite/);
  });
});

describe('buildChunkLiquidGeometry', () => {
  it('stores x, y of the terrain grid, the liquid height, and the depth above the ground', () => {
    const ground = (x: number): number => (x - 32) / 2 - 4; // −4 at the west edge, 12 at the east edge
    const positions = chunkPositions(32, 64, ground);
    const liquid = sampleChunkLiquid(() => ({ height: 1, type: 'ocean' }), (l) => 32 + l * 4, (l) => 64 + l * 4, positions)!;
    const g = buildChunkLiquidGeometry(liquid, positions);
    expect(g.vertices.length).toBe(81 * LIQUID_VERTEX_FLOATS);
    for (let j = 0; j <= 8; j++) for (let i = 0; i <= 8; i++) {
      const v = liquidVertexIndex(i, j) * 4;
      expect([g.vertices[v], g.vertices[v + 1], g.vertices[v + 2]]).toEqual([32 + 4 * i, 64 + 4 * j, 1]);
      expect(g.vertices[v + 3]).toBeCloseTo(Math.max(0, 1 - ground(32 + 4 * i)), 5); // never negative
    }
  });

  it('makes 2 counter-clockwise triangles per liquid cell and none for the others', () => {
    const positions = chunkPositions(0, 0, (x) => x / 2);
    const liquid = sampleChunkLiquid(() => ({ height: 6.5, type: 'ocean' }), (l) => l * 4, (l) => l * 4, positions)!;
    const g = buildChunkLiquidGeometry(liquid, positions);
    expect(g.groups).toHaveLength(1);
    const { type, indices, cellCount } = g.groups[0]!;
    expect(type).toBe('ocean');
    expect(cellCount).toBe(32);
    expect(indices.length).toBe(32 * 6);
    const used = new Set<number>();
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t]!, indices[t + 1]!, indices[t + 2]!].map((v) => [g.vertices[v * 4]!, g.vertices[v * 4 + 1]!] as const);
      const cross = (b![0] - a![0]) * (c![1] - a![1]) - (b![1] - a![1]) * (c![0] - a![0]);
      expect(cross).toBe(16); // area 8 = half a 4 × 4 cell, positive = counter-clockwise seen from +z
      for (const p of [a!, b!, c!]) used.add(p[0]);
    }
    expect(Math.max(...used)).toBe(16); // nothing east of the 4 liquid columns
  });

  it('groups the cells by liquid class, in class order', () => {
    const positions = chunkPositions(240, 240, () => -1); // the chunk straddling the centre of tile 0,0
    const liquid = sampleChunkLiquid(liquidFixture(512, 'classes', 0), (l) => 240 + l * 4, (l) => 240 + l * 4, positions)!;
    const g = buildChunkLiquidGeometry(liquid, positions);
    expect(g.groups.map((x) => [x.type, x.cellCount])).toEqual([['river', 16], ['ocean', 16], ['magma', 16], ['slime', 16]]);
    expect(liquid.cells[liquidCellIndex(0, 0)]).toBe(0);
    expect(liquid.cells[liquidCellIndex(7, 0)]).toBe(1);
    expect(liquid.cells[liquidCellIndex(0, 7)]).toBe(2);
    expect(liquid.cells[liquidCellIndex(7, 7)]).toBe(3);
  });
});

describe('liquid in a tile', () => {
  const ground = (x: number, y: number): number => 6 * Math.sin(x / 40) * Math.cos(y / 55);

  it('gives liquid only to the chunks that have some, and widens their bounds to contain it', () => {
    const tile = buildTerrainTile(config, { x: 0, y: 0 }, ground, { liquid: liquidFixture(512, 'lake', 20) });
    const withLiquid = tile.chunks.filter((c) => c.liquid);
    expect(withLiquid.length).toBeGreaterThan(40);
    expect(withLiquid.length).toBeLessThan(120);
    expect(tile.chunks[tileChunkIndex(0, 0)]!.liquid).toBeUndefined(); // far from the lake
    const centre = tile.chunks[tileChunkIndex(8, 8)]!;
    expect(centre.liquid).toMatchObject({ cellCount: 64, minHeight: 20, maxHeight: 20 });
    expect(centre.bounds.maxZ).toBe(20); // the lake is above this chunk's ground
    expect(centre.geometry.maxHeight).toBeLessThan(7);
    // Without liquid the same chunk has its plain terrain bounds.
    const dry = buildTerrainTile(config, { x: 0, y: 0 }, ground);
    expect(dry.chunks[tileChunkIndex(8, 8)]!.liquid).toBeUndefined();
    expect(dry.chunks[tileChunkIndex(8, 8)]!.bounds.maxZ).toBeLessThan(7);
    // The terrain itself is untouched by the liquid.
    expect(tile.chunks[tileChunkIndex(8, 8)]!.geometry.positions).toEqual(dry.chunks[tileChunkIndex(8, 8)]!.geometry.positions);
  });

  it('agrees exactly along chunk and tile borders (same heights on both sides)', () => {
    const source: LiquidSource = (x, y) => ({ height: 9 + Math.sin(x / 30) + Math.cos(y / 45), type: 'river' });
    const a = buildTerrainTile(config, { x: 0, y: 0 }, ground, { liquid: source }), b = buildTerrainTile(config, { x: 1, y: 0 }, ground, { liquid: source });
    const left = a.chunks[tileChunkIndex(3, 5)]!.liquid!, right = a.chunks[tileChunkIndex(4, 5)]!.liquid!;
    for (let j = 0; j <= 8; j++) expect(left.heights[liquidVertexIndex(8, j)]).toBe(right.heights[liquidVertexIndex(0, j)]);
    const east = a.chunks[tileChunkIndex(15, 2)]!.liquid!, west = b.chunks[tileChunkIndex(0, 2)]!.liquid!;
    for (let j = 0; j <= 8; j++) expect(east.heights[liquidVertexIndex(8, j)]).toBe(west.heights[liquidVertexIndex(0, j)]);
  });

  it('gives the same tile whether built at once or unit by unit', () => {
    const options = { liquid: liquidFixture(512, 'sea') };
    const whole = buildTerrainTile(config, { x: -1, y: 2 }, ground, options);
    const job = new TileBuildJob(config, { x: -1, y: 2 }, ground, options);
    while (!job.advance(() => true));
    expect(job.tile.chunks.map((c) => c.liquid?.cellCount ?? 0)).toEqual(whole.chunks.map((c) => c.liquid?.cellCount ?? 0));
    expect(job.tile.chunks.filter((c) => c.liquid).length).toBeGreaterThan(50); // the ground dips below 0 in many places
    expect(job.tile.chunks.filter((c) => !c.liquid).length).toBeGreaterThan(5);
  });
});
