/**
 * Terrain topology and physical scale.
 *
 * TOPOLOGY is fixed and comes from the reference document (spec §3–§4):
 *   tile  = 16 × 16 chunks
 *   chunk = 8 × 8 cells, 145 height vertices, at most 256 triangles
 *
 * PHYSICAL SCALE is configurable: only `cellSize` is chosen, everything else
 * is derived from it. No engine code may hard-code a chunk or tile size, and
 * no engine code may depend on a particular profile.
 */

/** Cells along one side of a chunk. */
export const CELLS_PER_CHUNK = 8;
/** Chunks along one side of a tile. */
export const CHUNKS_PER_TILE = 16;
/** Cells along one side of a tile. */
export const CELLS_PER_TILE = CELLS_PER_CHUNK * CHUNKS_PER_TILE;
/** 9 × 9 outer-grid vertices + 8 × 8 cell-centre vertices. */
export const VERTICES_PER_CHUNK = (CELLS_PER_CHUNK + 1) ** 2 + CELLS_PER_CHUNK ** 2;
/** Each cell is a fan of 4 triangles around its centre vertex. */
export const MAX_TRIANGLES_PER_CHUNK = CELLS_PER_CHUNK ** 2 * 4;

export interface TerrainConfig {
  /** Side of one cell, in world units. The only free parameter. */
  readonly cellSize: number;
  readonly cellsPerChunk: typeof CELLS_PER_CHUNK;
  readonly chunksPerTile: typeof CHUNKS_PER_TILE;
  /** Derived: cellSize × cellsPerChunk. */
  readonly chunkSize: number;
  /** Derived: chunkSize × chunksPerTile. */
  readonly tileSize: number;
}

export function createTerrainConfig(cellSize: number): TerrainConfig {
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw new Error(`terrain: cellSize must be a positive finite number (got ${cellSize})`);
  const chunkSize = cellSize * CELLS_PER_CHUNK;
  const tileSize = chunkSize * CHUNKS_PER_TILE;
  return Object.freeze({ cellSize, cellsPerChunk: CELLS_PER_CHUNK, chunksPerTile: CHUNKS_PER_TILE, chunkSize, tileSize });
}

/**
 * Historical profile of the reference client: cell ≈ 4.1667, chunk ≈ 33.333,
 * tile ≈ 533.333 (spec §3). Kept for comparison and tests only.
 */
export const VANILLA_REFERENCE: TerrainConfig = createTerrainConfig(25 / 6);

/** Orvalis profile: cell 4, chunk 32, tile 512. */
export const ORVALIS_DEFAULT: TerrainConfig = createTerrainConfig(4);
