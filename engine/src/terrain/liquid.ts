import { CELLS_PER_CHUNK } from './config';
import { outerVertexIndex } from './chunkMesh';

/**
 * Liquid of one terrain chunk (spec §21): 9 × 9 liquid vertices, each with its
 * own height (a surface need not be one flat plane), 8 × 8 liquid cells, a flag
 * per cell, and the block's minimum / maximum height.
 *
 * FROM THE SPEC: the 9 × 9 / 8 × 8 layout per chunk, per-vertex heights, the
 * min / max, and the liquid class in the low nibble of the cell flag
 * (0 river, 1 ocean, 2 magma, 3 slime — §22).
 * OUR CHOICES (the document does not settle them):
 * - liquid vertex (i, j) has the same x, y as the chunk's OUTER vertex (i, j):
 *   the liquid grid is the terrain's outer grid;
 * - a cell WITHOUT liquid is flagged 0x0F (« holes » in the roadmap): a chunk
 *   can be partly covered;
 * - each cell is two triangles, split along the diagonal (i, j) → (i + 1, j + 1);
 * - « flow information » is not stored: the document only names it.
 */
export const LIQUID_VERTICES_PER_SIDE = CELLS_PER_CHUNK + 1; // 9
export const LIQUID_VERTICES = LIQUID_VERTICES_PER_SIDE * LIQUID_VERTICES_PER_SIDE; // 81
export const LIQUID_CELLS = CELLS_PER_CHUNK * CELLS_PER_CHUNK; // 64

export const LIQUID_TYPES = ['river', 'ocean', 'magma', 'slime'] as const;
export type LiquidType = (typeof LIQUID_TYPES)[number];
/** Value of the low nibble for each class (spec §22). */
export const LIQUID_TYPE_CODE: Readonly<Record<LiquidType, number>> = { river: 0, ocean: 1, magma: 2, slime: 3 };
/** Cell flag meaning « no liquid in this cell ». */
export const LIQUID_CELL_NONE = 0x0f;

export const liquidVertexIndex = (i: number, j: number): number => j * LIQUID_VERTICES_PER_SIDE + i;
export const liquidCellIndex = (i: number, j: number): number => j * CELLS_PER_CHUNK + i;

/** Class of a cell flag, or null for a cell without liquid. Unknown classes are an error, not « water ». */
export function liquidTypeOfCell(flag: number): LiquidType | null {
  const nibble = flag & 0x0f;
  if (nibble === LIQUID_CELL_NONE) return null;
  const type = LIQUID_TYPES[nibble];
  if (!type) throw new Error(`liquid: unknown liquid class ${nibble} in cell flag ${flag}`);
  return type;
}

export interface ChunkLiquid {
  /** Lowest and highest liquid height over the vertices that belong to at least one cell with liquid. */
  readonly minHeight: number;
  readonly maxHeight: number;
  /** 81 heights (world z), vertex (i, j) at liquidVertexIndex(i, j). */
  readonly heights: Float32Array;
  /** 64 flags, cell (i, j) at liquidCellIndex(i, j). */
  readonly cells: Uint8Array;
  /** Number of cells with liquid, 1..64 (a chunk with none has no ChunkLiquid at all). */
  readonly cellCount: number;
}

/** The liquid at a world position: surface height and class; null = no liquid there. Must be deterministic. */
export type LiquidSource = (worldX: number, worldY: number) => { readonly height: number; readonly type: LiquidType } | null;

/**
 * Samples a liquid source over one chunk.
 * - A cell has liquid when the source has liquid at the cell's CENTRE and the surface there is above the
 *   ground at one of the cell's 4 corners at least (a cell wholly under the ground would never be seen).
 * - A vertex takes the source's height at its own position; where the source has nothing there (edge of a
 *   liquid area), the mean height of the neighbouring cells that have liquid.
 * @param xAt, yAt world coordinate of grid line 0..8 of the chunk (the caller's exact vertex expression)
 * @param terrainPositions the chunk's 145 terrain vertices (x, y, z), for the ground height at the corners
 * @returns null when no cell has liquid
 */
export function sampleChunkLiquid(source: LiquidSource, xAt: (line: number) => number, yAt: (line: number) => number, terrainPositions: ArrayLike<number>): ChunkLiquid | null {
  const n = CELLS_PER_CHUNK;
  const cells = new Uint8Array(LIQUID_CELLS).fill(LIQUID_CELL_NONE);
  const centreHeights = new Float64Array(LIQUID_CELLS);
  const ground = (i: number, j: number): number => terrainPositions[outerVertexIndex(i, j) * 3 + 2]!;
  let cellCount = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const s = source(xAt(i + 0.5), yAt(j + 0.5));
      if (!s) continue;
      if (!Number.isFinite(s.height)) throw new Error(`liquid: height at cell ${i},${j} is not finite (${s.height})`);
      if (!(s.height > Math.min(ground(i, j), ground(i + 1, j), ground(i, j + 1), ground(i + 1, j + 1)))) continue;
      cells[liquidCellIndex(i, j)] = LIQUID_TYPE_CODE[s.type];
      centreHeights[liquidCellIndex(i, j)] = s.height;
      cellCount++;
    }
  }
  if (cellCount === 0) return null;
  const heights = new Float32Array(LIQUID_VERTICES);
  let minHeight = Number.POSITIVE_INFINITY, maxHeight = Number.NEGATIVE_INFINITY;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      // Cells touching this vertex that have liquid.
      let sum = 0, count = 0;
      for (const [ci, cj] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]] as const) {
        if (ci < 0 || cj < 0 || ci >= n || cj >= n || cells[liquidCellIndex(ci, cj)] === LIQUID_CELL_NONE) continue;
        sum += centreHeights[liquidCellIndex(ci, cj)]!;
        count++;
      }
      const own = source(xAt(i), yAt(j));
      const height = own ? own.height : count > 0 ? sum / count : 0;
      if (!Number.isFinite(height)) throw new Error(`liquid: height at vertex ${i},${j} is not finite (${height})`);
      heights[liquidVertexIndex(i, j)] = height;
      if (count > 0) {
        const stored = heights[liquidVertexIndex(i, j)]!;
        if (stored < minHeight) minHeight = stored;
        if (stored > maxHeight) maxHeight = stored;
      }
    }
  }
  return { minHeight, maxHeight, heights, cells, cellCount };
}

/** Floats per liquid vertex: x, y, z (surface) and depth = surface − ground (≥ 0 where the liquid shows). */
export const LIQUID_VERTEX_FLOATS = 4;

export interface ChunkLiquidGeometry {
  /** 81 vertices × (x, y, z, depth). Every vertex is stored, used or not: indices stay simple. */
  readonly vertices: Float32Array;
  /** One index list per liquid class present, in class order; 6 indices (2 triangles, CCW seen from above) per cell. */
  readonly groups: ReadonlyArray<{ readonly type: LiquidType; readonly indices: Uint16Array; readonly cellCount: number }>;
}

/**
 * Renderable form of a chunk's liquid.
 * @param terrainPositions the chunk's terrain vertices: x, y of the liquid vertices and the ground height under them
 */
export function buildChunkLiquidGeometry(liquid: ChunkLiquid, terrainPositions: ArrayLike<number>): ChunkLiquidGeometry {
  if (liquid.heights.length !== LIQUID_VERTICES || liquid.cells.length !== LIQUID_CELLS) throw new Error(`liquid: expected ${LIQUID_VERTICES} heights and ${LIQUID_CELLS} cells (got ${liquid.heights.length}, ${liquid.cells.length})`);
  const n = CELLS_PER_CHUNK;
  const vertices = new Float32Array(LIQUID_VERTICES * LIQUID_VERTEX_FLOATS);
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const t = outerVertexIndex(i, j) * 3, v = liquidVertexIndex(i, j) * LIQUID_VERTEX_FLOATS, z = liquid.heights[liquidVertexIndex(i, j)]!;
      vertices[v] = terrainPositions[t]!;
      vertices[v + 1] = terrainPositions[t + 1]!;
      vertices[v + 2] = z;
      vertices[v + 3] = Math.max(0, z - terrainPositions[t + 2]!);
    }
  }
  const lists = new Map<LiquidType, number[]>();
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const type = liquidTypeOfCell(liquid.cells[liquidCellIndex(i, j)]!);
      if (!type) continue;
      const a = liquidVertexIndex(i, j), b = liquidVertexIndex(i + 1, j), c = liquidVertexIndex(i + 1, j + 1), d = liquidVertexIndex(i, j + 1);
      let list = lists.get(type);
      if (!list) lists.set(type, (list = []));
      list.push(a, b, c, a, c, d);
    }
  }
  const groups = LIQUID_TYPES.filter((type) => lists.has(type)).map((type) => ({ type, indices: new Uint16Array(lists.get(type)!), cellCount: lists.get(type)!.length / 6 }));
  return { vertices, groups };
}

const smoothInside = (x: number, y: number, cx: number, cy: number, r: number): boolean => (x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r;

/** Synthetic liquids for tests and debug scenes. Not world data. */
export type LiquidFixtureKind = 'sea' | 'lake' | 'classes';

/**
 * - sea: an ocean at height `level` everywhere (it shows wherever the ground is lower).
 * - lake: a river-class disc at height `level`, centre (0.5, 0.5) tile, radius 0.3 tile, in every tile.
 * - classes: the lake's level everywhere, the class depending on the tile quadrant
 *   (south-west river, south-east ocean, north-west magma, north-east slime).
 */
export function liquidFixture(tileSize: number, kind: LiquidFixtureKind, level = 0): LiquidSource {
  const local = (w: number): number => w - Math.floor(w / tileSize) * tileSize;
  if (kind === 'sea') return () => ({ height: level, type: 'ocean' });
  if (kind === 'lake') return (x, y) => (smoothInside(local(x), local(y), tileSize / 2, tileSize / 2, 0.3 * tileSize) ? { height: level, type: 'river' } : null);
  return (x, y) => {
    const east = local(x) >= tileSize / 2, north = local(y) >= tileSize / 2;
    return { height: level, type: north ? (east ? 'slime' : 'magma') : east ? 'ocean' : 'river' };
  };
}
