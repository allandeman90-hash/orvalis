import { type ChunkLiquid, type LiquidSource, sampleChunkLiquid } from './liquid';
import { buildChunkIndices, chunkVertexGridPosition, type ChunkGeometry, NO_HOLES, outerVertexIndex } from './chunkMesh';
import { accumulateFaceNormals, normalizeNormalSums } from './chunkNormals';
import { CELLS_PER_CHUNK, CELLS_PER_TILE, CHUNKS_PER_TILE, type TerrainConfig, VERTICES_PER_CHUNK } from './config';
import { buildChunkMask, type ChunkMaterial, type TerrainPaint } from './paint';
import { type ChunkAddress, chunkOrigin, type TileCoord, tileOrigin, type WorldPoint } from './coords';

/**
 * A terrain tile: 16 × 16 chunks that form ONE continuous surface, while every
 * chunk stays an independent piece of geometry (its own 145 vertices and its
 * own indices), so that chunks can later be culled and submitted one by one.
 * Border vertices are therefore stored twice (four times at chunk corners):
 * 256 × 145 = 37 120 stored vertices. That duplication is deliberate.
 *
 * NO CRACK: the position of a vertex is computed from its GLOBAL cell index
 *     x = (tile.x · 128 + chunkX · 8 + u) · cellSize        (u = 0..8, or +0.5 for centres)
 * and its height from a function of the world position, height = f(x, y).
 * The right edge of a chunk and the left edge of its neighbour evaluate the
 * very same expression, so they are bit-identical — no gap, no overlap.
 *
 * NORMALS
 *   CURRENT: seamless normals between all chunks of one TerrainTile. The
 *            area-weighted face sums of P1.4 are accumulated per chunk, then
 *            the sums of vertices that share a world position (2 chunks on an
 *            edge, 4 at a corner) are merged on the tile's 129 × 129 outer
 *            grid before the single normalisation. Both copies of a vertex
 *            read the same merged sum, so their normals are bit-identical.
 *   TILE BORDERS: a tile built alone only knows its own faces. It keeps the
 *            un-normalised sums of its 4 outer edges (`edgeSums`); when tiles
 *            sit next to each other in a TerrainMap, the map adds the sums of
 *            the tiles sharing a border node and re-normalises (see
 *            terrainMap.ts, P1.8). `outerGridExtraSums` remains available
 *            for a tile used outside a map.
 */

/** Height of the ground at a world position. Must be deterministic. */
export type WorldHeightFunction = (worldX: number, worldY: number) => number;

/**
 * - seamless: normals merged across chunk borders (the engine's behaviour)
 * - isolated: every chunk alone, as in P1.4. Kept ONLY as a control for tests:
 *   it shows the seams that `seamless` removes.
 */
export type TileNormalMode = 'seamless' | 'isolated';

/** Same shape as the camera's Aabb; declared here so that terrain does not depend on the camera. */
export interface ChunkBounds {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

export interface TerrainChunk {
  readonly address: ChunkAddress;
  /** 0..15 inside the tile. */
  readonly chunkX: number;
  readonly chunkY: number;
  /** World position of the chunk's minimum corner, from chunkOrigin(config, address). */
  readonly origin: WorldPoint;
  readonly geometry: ChunkGeometry;
  /** Smallest axis-aligned box containing the chunk's 145 vertices (holes included), for culling. */
  readonly bounds: ChunkBounds;
  /** Texture layers and alpha mask; absent when the tile was built without paint. */
  readonly material?: ChunkMaterial;
  /** Liquid of this chunk (spec §21); absent when the chunk has none. The chunk's bounds include it. */
  readonly liquid?: ChunkLiquid;
}

export interface TerrainTile {
  readonly coord: TileCoord;
  readonly config: TerrainConfig;
  /** World position of the tile's minimum corner. */
  readonly origin: WorldPoint;
  /** 256 chunks; chunk (chunkX, chunkY) is at index chunkY · 16 + chunkX. */
  readonly chunks: readonly TerrainChunk[];
  /** Stored vertices: 256 × 145 = 37 120. */
  readonly vertexCount: number;
  /** 65 536 without holes. */
  readonly triangleCount: number;
  /** 196 608 without holes. */
  readonly indexCount: number;
  readonly minHeight: number;
  readonly maxHeight: number;
  /**
   * Un-normalised face-normal sums of THIS tile's own faces along its 4 outer
   * edges: 129 nodes × 3 numbers each, indexed by the node's position along the
   * edge (gy for west/east, gx for south/north). Corners appear in two edges.
   */
  readonly edgeSums: TileEdgeSums;
}

export interface TileEdgeSums {
  readonly west: Float64Array;
  readonly east: Float64Array;
  readonly south: Float64Array;
  readonly north: Float64Array;
}

/** Nodes per side of the tile's outer-vertex grid: 16 × 8 + 1 = 129. */
export const TILE_OUTER_NODES = CELLS_PER_TILE + 1;

/** Index of chunk (chunkX, chunkY) in TerrainTile.chunks. */
export function tileChunkIndex(chunkX: number, chunkY: number): number {
  if (!Number.isInteger(chunkX) || chunkX < 0 || chunkX >= CHUNKS_PER_TILE || !Number.isInteger(chunkY) || chunkY < 0 || chunkY >= CHUNKS_PER_TILE) {
    throw new Error(`terrain: chunk coordinates must be integers in 0..${CHUNKS_PER_TILE - 1} (got ${chunkX}, ${chunkY})`);
  }
  return chunkY * CHUNKS_PER_TILE + chunkX;
}

/** Index (×3) of outer-grid node (gx, gy), gx and gy in 0..128, in a tile-wide sum array. */
export function tileOuterNodeIndex(gx: number, gy: number): number {
  return gy * TILE_OUTER_NODES + gx;
}

export interface TerrainTileOptions {
  /** Hole mask of each chunk (see chunkMesh.ts). Default: no hole anywhere. */
  readonly holes?: (chunkX: number, chunkY: number) => number;
  /** Default 'seamless'. */
  readonly normals?: TileNormalMode;
  /**
   * FUTURE hook for tile borders: un-normalised face-normal sums coming from
   * faces OUTSIDE this tile, on the tile's 129 × 129 outer grid (3 numbers per
   * node, node (gx, gy) at tileOuterNodeIndex(gx, gy) · 3). Only nodes lying on
   * a chunk border are read; for adjacent tiles only the tile's outer border
   * is meaningful. Ignored in 'isolated' mode.
   */
  readonly outerGridExtraSums?: ArrayLike<number>;
  /** Texture layers and their alpha maps (see paint.ts). Default: no material. */
  readonly paint?: TerrainPaint;
  /** Where there is liquid (see liquid.ts). Default: none. */
  readonly liquid?: LiquidSource | undefined;
}

/** The outer vertices (i, j) of a chunk that lie on its border, i.e. that can be shared with a neighbour. */
function forEachBorderOuterVertex(visit: (i: number, j: number) => void): void {
  for (let j = 0; j <= CELLS_PER_CHUNK; j++) {
    for (let i = 0; i <= CELLS_PER_CHUNK; i++) {
      if (i === 0 || j === 0 || i === CELLS_PER_CHUNK || j === CELLS_PER_CHUNK) visit(i, j);
    }
  }
}

interface ChunkDraft {
  readonly address: ChunkAddress;
  readonly positions: Float32Array;
  readonly indices: Uint16Array;
  readonly holes: number;
  readonly sums: Float64Array;
  readonly minHeight: number;
  readonly maxHeight: number;
}

/** Work units of a tile build: 256 chunk geometries, 1 merge, 256 chunk finalisations. */
export const TILE_BUILD_UNITS = 2 * CHUNKS_PER_TILE * CHUNKS_PER_TILE + 1;

/**
 * Builds a tile in small work units, so that the caller can spread the work
 * over several frames (building a tile with its masks takes far longer than
 * one frame). The result does not depend on how the work is sliced: stepping
 * one unit at a time gives exactly the tile that buildTerrainTile() returns.
 *
 *   units 0..255   geometry of chunk k: positions, indices, own face sums, added to the tile's outer grid
 *   unit 256       the tile's edge sums are read from the grid (and outside sums added, if any)
 *   units 257..512 chunk k finalised: merged border sums read back, normals, bounding box, material mask
 * No unit is long: the merge is spread over the chunk units instead of being one big step.
 */
export class TileBuildJob {
  private readonly origin: WorldPoint;
  private readonly mode: TileNormalMode;
  private readonly baseCellX: number;
  private readonly baseCellY: number;
  private readonly drafts: ChunkDraft[] = [];
  private readonly chunks: TerrainChunk[] = [];
  private minHeight = Number.POSITIVE_INFINITY;
  private maxHeight = Number.NEGATIVE_INFINITY;
  private triangleCount = 0;
  private indexCount = 0;
  private edgeSums: TileEdgeSums | null = null;
  /** Face sums of the outer grid nodes lying on chunk borders, accumulated chunk after chunk. */
  private readonly grid = new Float64Array(TILE_OUTER_NODES * TILE_OUTER_NODES * 3);
  private unit = 0;
  private built: TerrainTile | null = null;

  constructor(
    private readonly config: TerrainConfig,
    readonly coord: TileCoord,
    private readonly heightAt: WorldHeightFunction,
    private readonly options: TerrainTileOptions = {},
  ) {
    this.origin = tileOrigin(config, coord); // also validates the coordinates
    this.mode = options.normals ?? 'seamless';
    const extra = options.outerGridExtraSums;
    const gridLength = TILE_OUTER_NODES * TILE_OUTER_NODES * 3;
    if (extra && extra.length !== gridLength) throw new Error(`terrain: outerGridExtraSums must hold ${gridLength} numbers (got ${extra.length})`);
    // Global cell index of the tile's minimum corner, per axis.
    this.baseCellX = coord.x * CELLS_PER_TILE;
    this.baseCellY = coord.y * CELLS_PER_TILE;
  }

  get done(): boolean {
    return this.built !== null;
  }

  /** Units done so far, out of TILE_BUILD_UNITS. */
  get unitsDone(): number {
    return this.unit;
  }

  /** The finished tile. Throws while the build is not done. */
  get tile(): TerrainTile {
    if (!this.built) throw new Error(`terrain: tile ${this.coord.x},${this.coord.y} is not built yet (${this.unit}/${TILE_BUILD_UNITS} units)`);
    return this.built;
  }

  /** Does one unit of work. Returns true when the tile is finished. */
  step(): boolean {
    if (this.built) return true;
    const chunkCount = CHUNKS_PER_TILE * CHUNKS_PER_TILE;
    if (this.unit < chunkCount) this.buildGeometry(this.unit);
    else if (this.unit === chunkCount) this.mergeSums();
    else this.finishChunk(this.unit - chunkCount - 1);
    this.unit++;
    if (this.unit === TILE_BUILD_UNITS) {
      this.built = {
        coord: this.coord,
        config: this.config,
        origin: this.origin,
        chunks: this.chunks,
        vertexCount: this.chunks.length * VERTICES_PER_CHUNK,
        triangleCount: this.triangleCount,
        indexCount: this.indexCount,
        minHeight: this.minHeight,
        maxHeight: this.maxHeight,
        edgeSums: this.edgeSums!,
      };
    }
    return this.built !== null;
  }

  /**
   * Works until the tile is finished or `shouldStop()` says so. Always does at
   * least one unit, so a build makes progress whatever the budget.
   */
  advance(shouldStop: () => boolean): boolean {
    do {
      if (this.step()) return true;
    } while (!shouldStop());
    return false;
  }

  // Unit k of phase 1: positions, indices and own face sums of chunk k.
  private buildGeometry(k: number): void {
    const { config, heightAt } = this;
    const chunkX = k % CHUNKS_PER_TILE, chunkY = Math.floor(k / CHUNKS_PER_TILE);
    const holes = this.options.holes?.(chunkX, chunkY) ?? NO_HOLES;
    const positions = new Float32Array(VERTICES_PER_CHUNK * 3);
    let lo = Number.POSITIVE_INFINITY, hi = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < VERTICES_PER_CHUNK; index++) {
      const { u, v } = chunkVertexGridPosition(index);
      const x = (this.baseCellX + chunkX * CELLS_PER_CHUNK + u) * config.cellSize;
      const y = (this.baseCellY + chunkY * CELLS_PER_CHUNK + v) * config.cellSize;
      const z = heightAt(x, y);
      if (!Number.isFinite(z)) throw new Error(`terrain: height at (${x}, ${y}) is not finite (${z})`);
      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z;
      if (z < lo) lo = z;
      if (z > hi) hi = z;
    }
    const indices = buildChunkIndices(holes); // validates the mask
    const sums = new Float64Array(VERTICES_PER_CHUNK * 3);
    accumulateFaceNormals(sums, positions, indices);
    this.drafts.push({ address: { tile: this.coord, chunkX, chunkY }, positions, indices, holes, sums, minHeight: lo, maxHeight: hi });
    // Vertices sharing a world position add up on the tile's outer grid (always in chunk order).
    const grid = this.grid;
    forEachBorderOuterVertex((i, j) => {
      const node = tileOuterNodeIndex(chunkX * CELLS_PER_CHUNK + i, chunkY * CELLS_PER_CHUNK + j) * 3;
      const v = outerVertexIndex(i, j) * 3;
      for (let c = 0; c < 3; c++) grid[node + c]! += sums[v + c]!;
    });
    if (lo < this.minHeight) this.minHeight = lo;
    if (hi > this.maxHeight) this.maxHeight = hi;
  }

  // Phase 2: the grid now holds the sums of every chunk. Take the tile's own edge sums, then add outside sums.
  private mergeSums(): void {
    const { grid } = this;
    const extra = this.options.outerGridExtraSums;
    // The tile's own sums along its 4 edges, before anything from outside is added.
    const last = TILE_OUTER_NODES - 1;
    const edge = (nodeOf: (g: number) => number): Float64Array => {
      const out = new Float64Array(TILE_OUTER_NODES * 3);
      for (let g = 0; g < TILE_OUTER_NODES; g++) for (let k = 0; k < 3; k++) out[g * 3 + k] = grid[nodeOf(g) * 3 + k]!;
      return out;
    };
    this.edgeSums = {
      west: edge((g) => tileOuterNodeIndex(0, g)),
      east: edge((g) => tileOuterNodeIndex(last, g)),
      south: edge((g) => tileOuterNodeIndex(g, 0)),
      north: edge((g) => tileOuterNodeIndex(g, last)),
    };
    if (this.mode === 'seamless' && extra) for (let k = 0; k < grid.length; k++) grid[k]! += extra[k]!;
  }

  // Unit k of phase 3: normals, bounding box and material mask of chunk k.
  private finishChunk(k: number): void {
    const { config, options } = this;
    const draft = this.drafts[k]!;
    const { chunkX, chunkY } = draft.address;
    this.triangleCount += draft.indices.length / 3;
    this.indexCount += draft.indices.length;
    if (this.mode === 'seamless') {
      const grid = this.grid;
      forEachBorderOuterVertex((i, j) => {
        const node = tileOuterNodeIndex(chunkX * CELLS_PER_CHUNK + i, chunkY * CELLS_PER_CHUNK + j) * 3;
        const v = outerVertexIndex(i, j) * 3;
        // Every chunk sharing the node reads the same numbers → identical normals.
        for (let c = 0; c < 3; c++) draft.sums[v + c] = grid[node + c]!;
      });
    }
    // Mask texels use the same global-cell expression as the vertices, so chunk borders match exactly.
    const mask = options.paint
      ? buildChunkMask(
          options.paint,
          (t) => (this.baseCellX + chunkX * CELLS_PER_CHUNK + t * CELLS_PER_CHUNK) * config.cellSize,
          (t) => (this.baseCellY + chunkY * CELLS_PER_CHUNK + t * CELLS_PER_CHUNK) * config.cellSize,
          this.heightAt,
        )
      : null;
    const lineX = (line: number): number => (this.baseCellX + chunkX * CELLS_PER_CHUNK + line) * config.cellSize;
    const lineY = (line: number): number => (this.baseCellY + chunkY * CELLS_PER_CHUNK + line) * config.cellSize;
    const liquid = options.liquid ? sampleChunkLiquid(options.liquid, lineX, lineY, draft.positions) : null;
    this.chunks.push({
      address: draft.address,
      chunkX,
      chunkY,
      origin: chunkOrigin(config, draft.address),
      ...(options.paint && mask ? { material: { layers: options.paint.layers, mask } } : {}),
      ...(liquid ? { liquid } : {}),
      // Positions are stored as float32: the box is taken from the stored values, so it contains exactly what is drawn.
      bounds: {
        minX: draft.positions[0]!,
        minY: draft.positions[1]!,
        minZ: Math.fround(liquid ? Math.min(draft.minHeight, liquid.minHeight) : draft.minHeight),
        maxX: draft.positions[(VERTICES_PER_CHUNK - 1) * 3]!,
        maxY: draft.positions[(VERTICES_PER_CHUNK - 1) * 3 + 1]!,
        maxZ: Math.fround(liquid ? Math.max(draft.maxHeight, liquid.maxHeight) : draft.maxHeight),
      },
      geometry: {
        positions: draft.positions,
        normals: normalizeNormalSums(draft.sums),
        indices: draft.indices,
        holes: draft.holes,
        vertexCount: VERTICES_PER_CHUNK,
        triangleCount: draft.indices.length / 3,
        minHeight: draft.minHeight,
        maxHeight: draft.maxHeight,
      },
    });
  }
}

/** Builds a whole tile at once. Same result as a TileBuildJob stepped to the end. */
export function buildTerrainTile(config: TerrainConfig, coord: TileCoord, heightAt: WorldHeightFunction, options: TerrainTileOptions = {}): TerrainTile {
  const job = new TileBuildJob(config, coord, heightAt, options);
  while (!job.step());
  return job.tile;
}

/** Line indices (pairs) following the border of a chunk along its outer vertices: 32 edges. */
export function buildChunkBorderLineIndices(): Uint16Array {
  const n = CELLS_PER_CHUNK;
  const lines: number[] = [];
  for (let i = 0; i < n; i++) {
    lines.push(outerVertexIndex(i, 0), outerVertexIndex(i + 1, 0));
    lines.push(outerVertexIndex(i, n), outerVertexIndex(i + 1, n));
    lines.push(outerVertexIndex(0, i), outerVertexIndex(0, i + 1));
    lines.push(outerVertexIndex(n, i), outerVertexIndex(n, i + 1));
  }
  return Uint16Array.from(lines);
}

/** Synthetic world-space height fields for tile tests. Not a world generator. */
export type TileHeightKind = 'flat' | 'slope' | 'hills' | 'dunes';

/**
 * Functions of the WORLD position, so they do not restart at chunk or tile borders.
 * - flat:  z = 0
 * - slope: one plane, z = 0.25·x + 0.125·y
 * - hills: a gentle plane plus hills about 3 to 4 chunks wide, 1 chunkSize high peak to trough.
 *          The wave lengths are not multiples of the chunk size.
 * - dunes: like hills, with wave lengths chosen so that the surface is strongly curved ACROSS tile borders
 *          (x = n·tileSize), which is what makes a normal seam between two tiles visible.
 */
export function tileHeightFixture(config: TerrainConfig, kind: TileHeightKind): WorldHeightFunction {
  const s = config.chunkSize;
  switch (kind) {
    case 'flat':
      return () => 0;
    case 'slope':
      return (x, y) => 0.25 * x + 0.125 * y;
    case 'hills': {
      const kx = (2 * Math.PI) / ((32 / 11) * s), ky = (2 * Math.PI) / (4 * s);
      return (x, y) => 0.04 * x + 0.02 * y + 0.5 * s * Math.sin(kx * x) * Math.cos(ky * y);
    }
    case 'dunes': {
      const kx = (2 * Math.PI) / (2.56 * s), ky = (2 * Math.PI) / (2.9 * s);
      return (x, y) => 0.03 * x + 0.5 * s * Math.sin(kx * x) * Math.sin(ky * y);
    }
  }
}
