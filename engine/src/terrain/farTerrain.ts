import { CHUNKS_PER_TILE, type TerrainConfig } from './config';
import { type TileCoord, tileOrigin, worldToTile, type WorldPoint } from './coords';
import type { TerrainPaint } from './paint';
import type { ChunkBounds, WorldHeightFunction } from './tile';

/**
 * Far terrain (spec §14, §262): a very cheap, low-detail stand-in for a tile,
 * drawn behind the detailed terrain so that the landscape continues beyond the
 * tiles that are loaded.
 *
 * One far tile = 17 × 17 outer heights + 16 × 16 inner heights = 545 heights,
 * with the same centre-fan topology as a chunk, at the scale of one cell per
 * chunk: 16 × 16 cells × 4 triangles = 1024 triangles.
 *
 * VERTEX ORDER (ours, same idea as a chunk): rows alternate — 17 outer
 * vertices, then the 16 centres of the cells above them.
 *     outer (i, j), 0..16 → j · 33 + i          centre (i, j), 0..15 → j · 33 + 17 + i
 *
 * OUR CHOICES (not in the reference document):
 * - Normals come from the height FUNCTION (central differences) rather than
 *   from the far triangles: two far tiles then agree exactly on their shared
 *   border without any stitching. When far tiles are read from files instead,
 *   this will need the neighbours' heights.
 * - A far tile carries one colour per vertex, meant to look like the detailed
 *   terrain seen from far away (the renderer derives it from the texture
 *   layers' average colours and the paint's alphas). No texture, no mask.
 */
export const FAR_CELLS = CHUNKS_PER_TILE; // 16
export const FAR_OUTER = FAR_CELLS + 1; // 17
const FAR_ROW = FAR_OUTER + FAR_CELLS; // 33
export const FAR_VERTICES = FAR_OUTER * FAR_OUTER + FAR_CELLS * FAR_CELLS; // 545
export const FAR_TRIANGLES = FAR_CELLS * FAR_CELLS * 4; // 1024

export function farOuterIndex(i: number, j: number): number {
  return j * FAR_ROW + i;
}

export function farCenterIndex(i: number, j: number): number {
  return j * FAR_ROW + FAR_OUTER + i;
}

/** Position of far vertex `index` inside its tile, in far cells (= chunks): integers for outer vertices, halves for centres. */
export function farVertexGridPosition(index: number): { readonly u: number; readonly v: number } {
  if (!Number.isInteger(index) || index < 0 || index >= FAR_VERTICES) throw new Error(`terrain: far vertex index must be an integer in 0..${FAR_VERTICES - 1} (got ${index})`);
  const j = Math.floor(index / FAR_ROW), k = index - j * FAR_ROW;
  return k < FAR_OUTER ? { u: k, v: j } : { u: k - FAR_OUTER + 0.5, v: j + 0.5 };
}

let sharedIndices: Uint16Array | null = null;

/** Triangle indices of a far tile (3072), counter-clockwise seen from above. The same for every far tile. */
export function farTileIndices(): Uint16Array {
  if (sharedIndices) return sharedIndices;
  const indices = new Uint16Array(FAR_TRIANGLES * 3);
  let n = 0;
  for (let j = 0; j < FAR_CELLS; j++) {
    for (let i = 0; i < FAR_CELLS; i++) {
      const c = farCenterIndex(i, j), bl = farOuterIndex(i, j), br = farOuterIndex(i + 1, j), tl = farOuterIndex(i, j + 1), tr = farOuterIndex(i + 1, j + 1);
      indices[n++] = c; indices[n++] = bl; indices[n++] = br;
      indices[n++] = c; indices[n++] = br; indices[n++] = tr;
      indices[n++] = c; indices[n++] = tr; indices[n++] = tl;
      indices[n++] = c; indices[n++] = tl; indices[n++] = bl;
    }
  }
  sharedIndices = indices;
  return indices;
}

export interface FarTile {
  readonly coord: TileCoord;
  readonly origin: WorldPoint;
  /** 545 × (x, y, z), world units. */
  readonly positions: Float32Array;
  /** 545 × unit normal. */
  readonly normals: Float32Array;
  /** 545 × (alpha of layer 1, 2, 3), 0..1 — all zero when the tile was built without paint. */
  readonly layerAlphas: Float32Array;
  /** Layer ids of the paint (palette indices). */
  readonly layers: readonly [number, number, number, number];
  readonly bounds: ChunkBounds;
}

export function buildFarTile(config: TerrainConfig, coord: TileCoord, heightAt: WorldHeightFunction, paint?: TerrainPaint): FarTile {
  const origin = tileOrigin(config, coord); // validates the coordinates
  const cell = config.chunkSize; // one far cell = one chunk
  const baseX = coord.x * CHUNKS_PER_TILE, baseY = coord.y * CHUNKS_PER_TILE;
  const positions = new Float32Array(FAR_VERTICES * 3), normals = new Float32Array(FAR_VERTICES * 3), layerAlphas = new Float32Array(FAR_VERTICES * 3);
  let minZ = Number.POSITIVE_INFINITY, maxZ = Number.NEGATIVE_INFINITY;
  const step = cell / 2;
  for (let index = 0; index < FAR_VERTICES; index++) {
    const { u, v } = farVertexGridPosition(index);
    // Same « global cell index × size » expression as everywhere else: shared borders are bit-identical.
    const x = (baseX + u) * cell, y = (baseY + v) * cell, z = heightAt(x, y);
    if (!Number.isFinite(z)) throw new Error(`terrain: height at (${x}, ${y}) is not finite (${z})`);
    positions[index * 3] = x;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = z;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
    const dzdx = (heightAt(x + step, y) - heightAt(x - step, y)) / (2 * step), dzdy = (heightAt(x, y + step) - heightAt(x, y - step)) / (2 * step);
    const length = Math.hypot(dzdx, dzdy, 1);
    normals[index * 3] = -dzdx / length;
    normals[index * 3 + 1] = -dzdy / length;
    normals[index * 3 + 2] = 1 / length;
    if (paint) {
      const [a1, a2, a3] = paint.alphaAt(x, y, z);
      layerAlphas[index * 3] = Math.min(1, Math.max(0, a1));
      layerAlphas[index * 3 + 1] = Math.min(1, Math.max(0, a2));
      layerAlphas[index * 3 + 2] = Math.min(1, Math.max(0, a3));
    }
  }
  return {
    coord,
    origin,
    positions,
    normals,
    layerAlphas,
    layers: paint?.layers ?? [0, 0, 0, 0],
    bounds: { minX: positions[0]!, minY: positions[1]!, minZ: Math.fround(minZ), maxX: positions[(FAR_VERTICES - 1) * 3]!, maxY: positions[(FAR_VERTICES - 1) * 3 + 1]!, maxZ: Math.fround(maxZ) },
  };
}

export interface FarWindowEvents {
  readonly added: FarTile[];
  readonly removed: TileCoord[];
}

/**
 * Keeps the far tiles of the square window of ±`radius` tiles around the
 * focus tile (spec §17.2: ±3, i.e. up to 7 × 7 = 49). Only tiles that exist
 * (`exists`) are built. Far tiles are tiny, so they are built at once, at most
 * `maxBuildsPerUpdate` per update, nearest first.
 */
export class FarTerrainWindow {
  private readonly tiles = new Map<string, FarTile>();

  constructor(
    private readonly config: TerrainConfig,
    private readonly exists: (coord: TileCoord) => boolean,
    private readonly build: (coord: TileCoord) => FarTile,
    readonly radius: number,
    private readonly maxBuildsPerUpdate = 4,
  ) {
    if (!Number.isInteger(radius) || radius < 0) throw new Error(`far terrain: radius must be an integer ≥ 0 (got ${radius})`);
    if (!Number.isInteger(maxBuildsPerUpdate) || maxBuildsPerUpdate < 1) throw new Error(`far terrain: maxBuildsPerUpdate must be an integer ≥ 1 (got ${maxBuildsPerUpdate})`);
  }

  get tileCount(): number {
    return this.tiles.size;
  }

  has(coord: TileCoord): boolean {
    return this.tiles.has(`${coord.x},${coord.y}`);
  }

  update(focusWorldX: number, focusWorldY: number): FarWindowEvents {
    const focus = worldToTile(this.config, focusWorldX, focusWorldY);
    const distance = (c: TileCoord): number => Math.max(Math.abs(c.x - focus.x), Math.abs(c.y - focus.y));
    const events: FarWindowEvents = { added: [], removed: [] };
    for (const [key, tile] of this.tiles) {
      if (distance(tile.coord) > this.radius) {
        this.tiles.delete(key);
        events.removed.push(tile.coord);
      }
    }
    const missing: TileCoord[] = [];
    for (let y = focus.y - this.radius; y <= focus.y + this.radius; y++) {
      for (let x = focus.x - this.radius; x <= focus.x + this.radius; x++) {
        const coord = { x, y };
        if (!this.tiles.has(`${x},${y}`) && this.exists(coord)) missing.push(coord);
      }
    }
    missing.sort((a, b) => distance(a) - distance(b) || a.y - b.y || a.x - b.x);
    for (const coord of missing.slice(0, this.maxBuildsPerUpdate)) {
      const tile = this.build(coord);
      this.tiles.set(`${coord.x},${coord.y}`, tile);
      events.added.push(tile);
    }
    return events;
  }
}
