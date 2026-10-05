import { CHUNKS_PER_TILE, type TerrainConfig } from './config';

/**
 * Terrain addressing. The ground plane is (x, y); height is z (same convention
 * as the reference document).
 *
 * Tile coordinates are plain integers with NO bounds: negative values are
 * normal and nothing assumes a 64 × 64 grid. A map is a sparse set of tiles.
 */
export interface TileCoord {
  readonly x: number;
  readonly y: number;
}

/** A chunk inside its tile: chunkX and chunkY are in 0..15. */
export interface ChunkAddress {
  readonly tile: TileCoord;
  readonly chunkX: number;
  readonly chunkY: number;
}

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Index k of the half-open interval [k·size, (k+1)·size) containing w.
 *
 * A plain Math.floor(w / size) can be off by one right at a boundary when
 * `size` is not exactly representable (e.g. 533.333…): the boundary itself is
 * the floating-point product k·size, and dividing it back may land a hair
 * below k. The correction steps make this function agree exactly with
 * gridOrigin(), so origin → index → origin always round-trips.
 */
function gridIndex(w: number, size: number): number {
  if (!Number.isFinite(w)) throw new Error(`terrain: world coordinate must be finite (got ${w})`);
  let k = Math.floor(w / size);
  while (w < k * size) k--;
  while (w >= (k + 1) * size) k++;
  return k + 0; // turns -0 into 0
}

function assertInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`terrain: ${name} must be an integer (got ${value})`);
}

export function worldToTile(config: TerrainConfig, x: number, y: number): TileCoord {
  return { x: gridIndex(x, config.tileSize), y: gridIndex(y, config.tileSize) };
}

export function worldToChunk(config: TerrainConfig, x: number, y: number): ChunkAddress {
  // Global chunk index first, then split: the tile found here is always the
  // one worldToTile() returns, because tile k starts exactly where chunk 16·k starts.
  const gx = gridIndex(x, config.chunkSize);
  const gy = gridIndex(y, config.chunkSize);
  const tileX = Math.floor(gx / CHUNKS_PER_TILE);
  const tileY = Math.floor(gy / CHUNKS_PER_TILE);
  return { tile: { x: tileX + 0, y: tileY + 0 }, chunkX: gx - tileX * CHUNKS_PER_TILE, chunkY: gy - tileY * CHUNKS_PER_TILE };
}

/** World position of the tile's minimum corner (lowest x and y). */
export function tileOrigin(config: TerrainConfig, tile: TileCoord): WorldPoint {
  assertInteger(tile.x, 'tile.x');
  assertInteger(tile.y, 'tile.y');
  return { x: tile.x * config.tileSize + 0, y: tile.y * config.tileSize + 0 };
}

/** World position of the chunk's minimum corner. */
export function chunkOrigin(config: TerrainConfig, address: ChunkAddress): WorldPoint {
  assertInteger(address.tile.x, 'tile.x');
  assertInteger(address.tile.y, 'tile.y');
  for (const [value, name] of [[address.chunkX, 'chunkX'], [address.chunkY, 'chunkY']] as const) {
    if (!Number.isInteger(value) || value < 0 || value >= CHUNKS_PER_TILE) {
      throw new Error(`terrain: ${name} must be an integer in 0..${CHUNKS_PER_TILE - 1} (got ${value})`);
    }
  }
  // Same expression shape as gridIndex(): (global chunk index) × chunkSize.
  return {
    x: (address.tile.x * CHUNKS_PER_TILE + address.chunkX) * config.chunkSize + 0,
    y: (address.tile.y * CHUNKS_PER_TILE + address.chunkY) * config.chunkSize + 0,
  };
}
