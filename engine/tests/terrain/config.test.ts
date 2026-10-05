import { describe, expect, it } from 'vitest';
import {
  CELLS_PER_CHUNK,
  CELLS_PER_TILE,
  CHUNKS_PER_TILE,
  createTerrainConfig,
  MAX_TRIANGLES_PER_CHUNK,
  ORVALIS_DEFAULT,
  VANILLA_REFERENCE,
  VERTICES_PER_CHUNK,
} from '../../src/terrain';

describe('terrain topology (fixed)', () => {
  it('tile = 16 × 16 chunks, chunk = 8 × 8 cells', () => {
    expect(CHUNKS_PER_TILE).toBe(16);
    expect(CELLS_PER_CHUNK).toBe(8);
    expect(CELLS_PER_TILE).toBe(128);
  });
  it('a chunk has 145 height vertices and at most 256 triangles', () => {
    expect(VERTICES_PER_CHUNK).toBe(145); // 9×9 outer + 8×8 centres
    expect(MAX_TRIANGLES_PER_CHUNK).toBe(256); // 64 cells × 4
  });
});

describe('terrain physical scale (configurable)', () => {
  it.each([4, 25 / 6, 1, 0.5, 3.7, 10])('cellSize %f: chunk and tile sizes are derived', (cellSize) => {
    const c = createTerrainConfig(cellSize);
    expect(c.cellSize).toBe(cellSize);
    expect(c.chunkSize).toBe(cellSize * 8);
    expect(c.tileSize).toBe(cellSize * 8 * 16);
    expect(c.cellsPerChunk).toBe(8);
    expect(c.chunksPerTile).toBe(16);
  });
  it('Orvalis profile: cell 4, chunk 32, tile 512', () => {
    expect([ORVALIS_DEFAULT.cellSize, ORVALIS_DEFAULT.chunkSize, ORVALIS_DEFAULT.tileSize]).toEqual([4, 32, 512]);
  });
  it('Vanilla reference profile matches the documented sizes', () => {
    expect(VANILLA_REFERENCE.cellSize).toBeCloseTo(4.1666667, 6);
    expect(VANILLA_REFERENCE.chunkSize).toBeCloseTo(33.333333, 5);
    expect(VANILLA_REFERENCE.tileSize).toBeCloseTo(533.333333, 4);
  });
  it('both profiles share the same topology', () => {
    for (const p of [ORVALIS_DEFAULT, VANILLA_REFERENCE]) expect([p.cellsPerChunk, p.chunksPerTile]).toEqual([8, 16]);
  });
  it('a config cannot be mutated', () => {
    expect(Object.isFrozen(ORVALIS_DEFAULT)).toBe(true);
    expect(() => {
      (ORVALIS_DEFAULT as { cellSize: number }).cellSize = 5;
    }).toThrow();
  });
  it('rejects an invalid cell size', () => {
    for (const bad of [0, -4, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => createTerrainConfig(bad)).toThrow(/cellSize/);
  });
});
