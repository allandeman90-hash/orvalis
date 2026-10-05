import { computeVertexNormals, type VertexNormalOptions } from './chunkNormals';
import { CELLS_PER_CHUNK, MAX_TRIANGLES_PER_CHUNK, type TerrainConfig, VERTICES_PER_CHUNK } from './config';

/**
 * Geometry of one terrain chunk, with the topology of the reference document
 * (spec §4): 9 × 9 outer-grid vertices + 8 × 8 cell-centre vertices = 145, and
 * each cell drawn as a fan of 4 triangles around its centre vertex:
 *
 *     TL ───── TR        +y
 *      │ \   / │          ↑
 *      │   C   │          └─→ +x      (seen from above, +z towards the viewer)
 *      │ /   \ │
 *     BL ───── BR
 *
 * VERTEX ORDER (our layout; the reference document gives the counts, not the
 * order): rows alternate from low y to high y — 9 outer vertices, then the 8
 * centres of the cells above them — 17 rows in total.
 *     outer (i, j), i and j in 0..8 → index j·17 + i
 *     centre (i, j), i and j in 0..7 → index j·17 + 9 + i
 *
 * WINDING: counter-clockwise seen from above (+z), so the top of the terrain is
 * the front face (engine convention, see FRONT_FACE in the renderer).
 */

const OUTER = CELLS_PER_CHUNK + 1; // 9 vertices per outer row
const ROW = OUTER + CELLS_PER_CHUNK; // 17 vertices per outer+centre row pair

/** Index of the outer-grid vertex (i, j), i and j in 0..8. */
export function outerVertexIndex(i: number, j: number): number {
  return j * ROW + i;
}

/** Index of the centre vertex of cell (i, j), i and j in 0..7. */
export function centerVertexIndex(i: number, j: number): number {
  return j * ROW + OUTER + i;
}

/**
 * Position of vertex `index` inside the chunk, in cell units:
 * outer vertices sit on integers (0..8), centres on half-integers (0.5..7.5).
 */
export function chunkVertexGridPosition(index: number): { readonly u: number; readonly v: number } {
  if (!Number.isInteger(index) || index < 0 || index >= VERTICES_PER_CHUNK) {
    throw new Error(`terrain: vertex index must be an integer in 0..${VERTICES_PER_CHUNK - 1} (got ${index})`);
  }
  const j = Math.floor(index / ROW);
  const k = index - j * ROW;
  return k < OUTER ? { u: k, v: j } : { u: k - OUTER + 0.5, v: j + 0.5 };
}

/**
 * HOLES (spec §6): a 16-bit mask laid out as a 4 × 4 grid over the chunk. Each
 * bit removes a block of 2 × 2 cells (16 triangles), e.g. for a cave entrance.
 * Bit number = hx + 4·hy, with hx = ⌊cellX / 2⌋ and hy = ⌊cellY / 2⌋ (the bit
 * numbering is our choice; the reference document only gives the 4 × 4 shape).
 */
export const HOLE_GRID = 4;
export const CELLS_PER_HOLE = CELLS_PER_CHUNK / HOLE_GRID;
/** No hole at all. */
export const NO_HOLES = 0;

function assertHoleMask(holes: number): void {
  if (!Number.isInteger(holes) || holes < 0 || holes > 0xffff) throw new Error(`terrain: hole mask must be an integer in 0..65535 (got ${holes})`);
}

/** Bit of the hole mask covering cell (i, j). */
export function holeBit(i: number, j: number): number {
  return 1 << (Math.floor(i / CELLS_PER_HOLE) + HOLE_GRID * Math.floor(j / CELLS_PER_HOLE));
}

/** True when cell (i, j) is removed by the mask. */
export function isCellHole(holes: number, i: number, j: number): boolean {
  return (holes & holeBit(i, j)) !== 0;
}

/** Number of 2 × 2 blocks removed by the mask. */
export function holeCount(holes: number): number {
  assertHoleMask(holes);
  let n = 0;
  for (let bit = 0; bit < HOLE_GRID * HOLE_GRID; bit++) if (holes & (1 << bit)) n++;
  return n;
}

/**
 * Triangle indices of a chunk: 768 without holes (64 cells × 4 triangles × 3),
 * 48 fewer per hole block. Cells are emitted row by row, holes are simply skipped.
 */
export function buildChunkIndices(holes: number = NO_HOLES): Uint16Array {
  assertHoleMask(holes);
  const indices = new Uint16Array((MAX_TRIANGLES_PER_CHUNK - holeCount(holes) * CELLS_PER_HOLE * CELLS_PER_HOLE * 4) * 3);
  let n = 0;
  for (let j = 0; j < CELLS_PER_CHUNK; j++) {
    for (let i = 0; i < CELLS_PER_CHUNK; i++) {
      if (isCellHole(holes, i, j)) continue;
      const c = centerVertexIndex(i, j);
      const bl = outerVertexIndex(i, j), br = outerVertexIndex(i + 1, j);
      const tl = outerVertexIndex(i, j + 1), tr = outerVertexIndex(i + 1, j + 1);
      // Fan around the centre, counter-clockwise seen from +z.
      indices[n++] = c; indices[n++] = bl; indices[n++] = br; // bottom
      indices[n++] = c; indices[n++] = br; indices[n++] = tr; // right
      indices[n++] = c; indices[n++] = tr; indices[n++] = tl; // top
      indices[n++] = c; indices[n++] = tl; indices[n++] = bl; // left
    }
  }
  return indices;
}

/**
 * Line indices (pairs) for a wireframe view of the chunk: every edge of every
 * kept triangle exactly once — 400 edges (800 indices) without holes.
 */
export function buildChunkWireIndices(holes: number = NO_HOLES): Uint16Array {
  const triangles = buildChunkIndices(holes);
  const seen = new Set<number>();
  const lines: number[] = [];
  const edge = (a: number, b: number): void => {
    const key = a < b ? a * VERTICES_PER_CHUNK + b : b * VERTICES_PER_CHUNK + a;
    if (seen.has(key)) return;
    seen.add(key);
    lines.push(a, b);
  };
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t]!, b = triangles[t + 1]!, c = triangles[t + 2]!;
    edge(a, b);
    edge(b, c);
    edge(c, a);
  }
  return Uint16Array.from(lines);
}

export interface ChunkGeometry {
  /** 145 × (x, y, z), in world units. */
  readonly positions: Float32Array;
  /** 145 × unit normal (x, y, z), from the remaining triangles only (see chunkNormals.ts). */
  readonly normals: Float32Array;
  /** Triangle indices: 768 without holes, 48 fewer per hole block. */
  readonly indices: Uint16Array;
  /** Hole mask the indices were built with. */
  readonly holes: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly minHeight: number;
  readonly maxHeight: number;
}

/**
 * Builds the geometry of one chunk.
 * @param heights 145 heights (z), in the vertex order described above
 * @param originX world x of the chunk's minimum corner
 * @param originY world y of the chunk's minimum corner
 * @param holes 4 × 4 hole mask (see above); the 145 vertices are always all present
 * @param normalOptions reserved for border normals shared with adjacent chunks (see chunkNormals.ts)
 */
export function buildChunkGeometry(config: TerrainConfig, heights: ArrayLike<number>, originX = 0, originY = 0, holes: number = NO_HOLES, normalOptions: VertexNormalOptions = {}): ChunkGeometry {
  if (heights.length !== VERTICES_PER_CHUNK) {
    throw new Error(`terrain: a chunk needs exactly ${VERTICES_PER_CHUNK} heights (got ${heights.length})`);
  }
  const positions = new Float32Array(VERTICES_PER_CHUNK * 3);
  let minHeight = Number.POSITIVE_INFINITY, maxHeight = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < VERTICES_PER_CHUNK; index++) {
    const { u, v } = chunkVertexGridPosition(index);
    const z = heights[index]!;
    if (!Number.isFinite(z)) throw new Error(`terrain: height ${index} is not finite (${z})`);
    positions[index * 3] = originX + u * config.cellSize;
    positions[index * 3 + 1] = originY + v * config.cellSize;
    positions[index * 3 + 2] = z;
    if (z < minHeight) minHeight = z;
    if (z > maxHeight) maxHeight = z;
  }
  const indices = buildChunkIndices(holes);
  const normals = computeVertexNormals(positions, indices, normalOptions);
  return { positions, normals, indices, holes, vertexCount: VERTICES_PER_CHUNK, triangleCount: indices.length / 3, minHeight, maxHeight };
}

/** 145 heights computed from a function of the position inside the chunk, in world units from its minimum corner. */
export function sampleChunkHeights(config: TerrainConfig, heightAt: (localX: number, localY: number) => number): Float32Array {
  const heights = new Float32Array(VERTICES_PER_CHUNK);
  for (let index = 0; index < VERTICES_PER_CHUNK; index++) {
    const { u, v } = chunkVertexGridPosition(index);
    heights[index] = heightAt(u * config.cellSize, v * config.cellSize);
  }
  return heights;
}

/** Synthetic height fields used to exercise the chunk pipeline. Not a world generator. */
export type SyntheticHeightKind = 'flat' | 'slope' | 'hill';

/**
 * - flat: z = 0 everywhere
 * - slope: z rises linearly with x, from 0 to `amplitude` across the chunk
 * - hill: smooth bump, `amplitude` at the chunk centre, 0 on the border
 */
export function syntheticChunkHeights(config: TerrainConfig, kind: SyntheticHeightKind, amplitude: number): Float32Array {
  const size = config.chunkSize;
  switch (kind) {
    case 'flat':
      return sampleChunkHeights(config, () => 0);
    case 'slope':
      return sampleChunkHeights(config, (x) => (x / size) * amplitude);
    case 'hill':
      return sampleChunkHeights(config, (x, y) => {
        const a = Math.sin((x / size) * Math.PI), b = Math.sin((y / size) * Math.PI);
        return amplitude * a * b;
      });
  }
}
