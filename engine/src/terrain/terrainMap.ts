import type { TerrainConfig } from './config';
import { type TileCoord, worldToChunk, worldToTile } from './coords';
import { CELLS_PER_CHUNK, CELLS_PER_TILE, CHUNKS_PER_TILE } from './config';
import { outerVertexIndex } from './chunkMesh';
import { FALLBACK_NORMAL } from './chunkNormals';
import { type TerrainChunk, type TerrainTile, tileChunkIndex } from './tile';

/**
 * A map (continent, island group, dungeon…) is a SPARSE set of terrain tiles:
 *     MapId → (TileCoord → tile)
 * Tile coordinates are unbounded integers, negative included. Nothing is
 * allocated for a tile that is not there: memory and every operation depend
 * only on the number of resident tiles, never on the extent of the map. There
 * is no 64 × 64 grid anywhere.
 *
 * Several maps can exist side by side (TerrainWorld); each has its own
 * TerrainConfig and its own coordinate space.
 *
 * NORMALS ACROSS TILE BORDERS (P1.8): the normals on the outer border of a
 * tile depend on which neighbours are resident. Whenever a tile is added or
 * removed, the map re-computes the border normals of that tile and of its up
 * to 8 neighbours: for every shared node, the own edge sums of all resident
 * tiles sharing it are added (always in the same order, so every copy gets
 * bit-identical numbers) and normalised. The normals are therefore a function
 * of the SET of resident tiles, not of the order in which they arrived.
 * This rewrites `geometry.normals` of border chunks IN PLACE: a TerrainTile
 * must belong to at most one map, and whoever holds GPU copies must refresh
 * the tiles listed in the value returned by set() / delete().
 */
export type MapId = string;

/**
 * What a tile is comes from the DATA of the map, never from its coordinates.
 * The engine does not interpret the value yet ('land' is the only kind built
 * today); it is carried so that future kinds (ocean, void…) need no new rule
 * based on position.
 */
export type TileKind = string;

export interface MapTile {
  readonly kind: TileKind;
  readonly tile: TerrainTile;
}

export interface TileCoordBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

function tileKey(coord: TileCoord): string {
  if (!Number.isSafeInteger(coord.x) || !Number.isSafeInteger(coord.y)) throw new Error(`terrain: tile coordinates must be integers (got ${coord.x}, ${coord.y})`);
  return `${coord.x},${coord.y}`; // −0 prints as "0"
}

export class TerrainMap {
  private readonly entries = new Map<string, MapTile>();

  constructor(
    readonly id: MapId,
    readonly config: TerrainConfig,
    /** false = every tile keeps the normals it was built with (test control: shows the seams between tiles). */
    readonly stitchTileBorders: boolean = true,
  ) {
    if (id.length === 0) throw new Error('terrain: a map needs a non-empty id');
  }

  /** Number of resident tiles. */
  get tileCount(): number {
    return this.entries.size;
  }

  has(coord: TileCoord): boolean {
    return this.entries.has(tileKey(coord));
  }

  /** undefined when the tile is absent — which is a normal state, not an error. */
  get(coord: TileCoord): MapTile | undefined {
    return this.entries.get(tileKey(coord));
  }

  /**
   * Adds the tile at its own coordinates, replacing a tile already there.
   * Returns the coordinates of the resident tiles whose border normals were
   * recomputed (the tile itself and its resident neighbours).
   */
  set(tile: TerrainTile, kind: TileKind = 'land'): TileCoord[] {
    if (tile.config !== this.config) throw new Error(`terrain: tile ${tile.coord.x},${tile.coord.y} was built with another TerrainConfig than map "${this.id}"`);
    this.entries.set(tileKey(tile.coord), { kind, tile });
    return this.restitchAround(tile.coord);
  }

  /** Removes a tile. Returns the resident neighbours whose border normals were recomputed; null when there was no such tile. */
  delete(coord: TileCoord): TileCoord[] | null {
    if (!this.entries.delete(tileKey(coord))) return null;
    return this.restitchAround(coord);
  }

  private restitchAround(coord: TileCoord): TileCoord[] {
    if (!this.stitchTileBorders) return [];
    const changed: TileCoord[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const entry = this.entries.get(tileKey({ x: coord.x + dx, y: coord.y + dy }));
        if (!entry) continue;
        this.stitch(entry.tile);
        changed.push(entry.tile.coord);
      }
    }
    return changed;
  }

  /** Recomputes the normals on the outer border of one resident tile from the resident tiles sharing each node. */
  private stitch(tile: TerrainTile): void {
    const last = CELLS_PER_TILE; // 128: index of the last node of an edge
    const sharers: TerrainTile[] = [];
    const visit = (gx: number, gy: number): void => {
      const dx = gx === 0 ? -1 : gx === last ? 1 : 0, dy = gy === 0 ? -1 : gy === last ? 1 : 0;
      let sx = 0, sy = 0, sz = 0;
      // Candidate sharers, visited in ONE fixed order (by tile y, then x) whichever tile is being stitched.
      sharers.length = 0;
      for (const oy of dy < 0 ? [dy, 0] : dy > 0 ? [0, dy] : [0]) {
        for (const ox of dx < 0 ? [dx, 0] : dx > 0 ? [0, dx] : [0]) {
          const other = ox === 0 && oy === 0 ? tile : this.entries.get(tileKey({ x: tile.coord.x + ox, y: tile.coord.y + oy }))?.tile;
          if (!other) continue;
          // The same node, in the other tile's own grid.
          const nx = gx - ox * last, ny = gy - oy * last;
          const sums = nx === 0 ? other.edgeSums.west : nx === last ? other.edgeSums.east : ny === 0 ? other.edgeSums.south : other.edgeSums.north;
          const at = (nx === 0 || nx === last ? ny : nx) * 3;
          sx += sums[at]!;
          sy += sums[at + 1]!;
          sz += sums[at + 2]!;
        }
      }
      const length = Math.hypot(sx, sy, sz);
      const ok = length > 0 && Number.isFinite(length);
      const n0 = ok ? sx / length : FALLBACK_NORMAL[0], n1 = ok ? sy / length : FALLBACK_NORMAL[1], n2 = ok ? sz / length : FALLBACK_NORMAL[2];
      // The 1, 2 or 4 chunk vertices of this tile that sit on the node.
      for (const [cx, i] of chunkSlots(gx)) {
        for (const [cy, j] of chunkSlots(gy)) {
          const normals = tile.chunks[tileChunkIndex(cx, cy)]!.geometry.normals;
          const v = outerVertexIndex(i, j) * 3;
          normals[v] = n0;
          normals[v + 1] = n1;
          normals[v + 2] = n2;
        }
      }
    };
    for (let g = 0; g <= last; g++) {
      visit(0, g);
      visit(last, g);
      if (g !== 0 && g !== last) {
        visit(g, 0);
        visit(g, last);
      }
    }
  }

  /** Resident tiles, in insertion order. */
  tiles(): IterableIterator<MapTile> {
    return this.entries.values();
  }

  /** Tile containing a world position, if resident. */
  tileAt(worldX: number, worldY: number): MapTile | undefined {
    return this.get(worldToTile(this.config, worldX, worldY));
  }

  /** Chunk containing a world position, if its tile is resident. */
  chunkAt(worldX: number, worldY: number): TerrainChunk | undefined {
    const address = worldToChunk(this.config, worldX, worldY);
    return this.get(address.tile)?.tile.chunks[tileChunkIndex(address.chunkX, address.chunkY)];
  }

  /** Smallest tile-coordinate rectangle containing the resident tiles; null for an empty map. */
  coordBounds(): TileCoordBounds | null {
    let bounds: TileCoordBounds | null = null;
    for (const { tile } of this.entries.values()) {
      const { x, y } = tile.coord;
      bounds = bounds ? { minX: Math.min(bounds.minX, x), minY: Math.min(bounds.minY, y), maxX: Math.max(bounds.maxX, x), maxY: Math.max(bounds.maxY, y) } : { minX: x, minY: y, maxX: x, maxY: y };
    }
    return bounds;
  }
}

/** Chunks of a tile (and the vertex index inside them, along one axis) that hold outer-grid node g (0..128). */
function chunkSlots(g: number): Array<[number, number]> {
  const c = Math.floor(g / CELLS_PER_CHUNK), i = g % CELLS_PER_CHUNK;
  if (i !== 0) return [[c, i]];
  const slots: Array<[number, number]> = [];
  if (c > 0) slots.push([c - 1, CELLS_PER_CHUNK]);
  if (c < CHUNKS_PER_TILE) slots.push([c, 0]);
  return slots;
}

/** The set of maps of the game world: MapId → TerrainMap. */
export class TerrainWorld {
  private readonly maps = new Map<MapId, TerrainMap>();

  get mapCount(): number {
    return this.maps.size;
  }

  createMap(id: MapId, config: TerrainConfig, stitchTileBorders = true): TerrainMap {
    if (this.maps.has(id)) throw new Error(`terrain: map "${id}" already exists`);
    const map = new TerrainMap(id, config, stitchTileBorders);
    this.maps.set(id, map);
    return map;
  }

  get(id: MapId): TerrainMap | undefined {
    return this.maps.get(id);
  }

  delete(id: MapId): boolean {
    return this.maps.delete(id);
  }

  ids(): MapId[] {
    return [...this.maps.keys()];
  }
}
