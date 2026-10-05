import { LIQUID_TYPES, type LiquidType } from '../terrain';

/**
 * Liquid carried by a building GROUP (the document's « MLIQ », spec §127–§131, §166): canals, fountains, pools.
 *
 * FROM THE SPEC:
 * - it is separate from the terrain's liquid and belongs to one group (it is drawn only while that group is);
 * - a height grid: vertex (i, j) = base + (i × STEP, j × STEP, height[i, j]) with STEP = 4.166666507720947 yards
 *   (byte-verified constant);
 * - xVerts × yVerts vertices make (xVerts − 1) × (yVerts − 1) tiles; a wet tile is 2 triangles; a tile whose flag
 *   has the low nibble 0xF is a HOLE and makes no geometry;
 * - ONE liquid kind for the whole surface: the group's liquid value when its low nibble is not 0xF, else the low
 *   nibble of the first tile that is not a hole;
 * - texture coordinates are anchored in the model's space, so neighbouring surfaces continue each other (the
 *   exact original texture scale is unresolved in the document).
 *
 * OUR CHOICES (the document does not settle them):
 * - the kind nibbles are the terrain's (0 river, 1 ocean, 2 magma, 3 slime): §130 lists families, not values;
 * - how many engine units make a yard is a parameter (`unitsPerYard`, default 1), as for the model distance fade;
 * - a tile is split along the diagonal (i, j) → (i + 1, j + 1), like the terrain's liquid cells;
 * - NO depth response: the grid knows no ground under it, so the liquid keeps the full opacity of its class;
 * - a surface with no wet tile, or no resolvable kind, draws nothing.
 */
export const BUILDING_LIQUID_CELL_STEP = 4.166666507720947;
export const BUILDING_LIQUID_HOLE = 0x0f;
/** Group liquid value meaning « not set: take the kind from the tiles ». */
export const BUILDING_LIQUID_UNSET = 0x0f;

export interface BuildingLiquid {
  /** Vertex-grid dimensions, ≥ 2 each. */
  readonly xVerts: number;
  readonly yVerts: number;
  /** Position of vertex (0, 0), in the building's space; heights are added to its z. */
  readonly base: readonly [number, number, number];
  /** xVerts × yVerts heights, vertex (i, j) at j × xVerts + i. */
  readonly heights: Float32Array;
  /** (xVerts − 1) × (yVerts − 1) flags, tile (i, j) at j × (xVerts − 1) + i. Low nibble: kind, or 0xF = hole. */
  readonly tiles: Uint8Array;
  /** The group's liquid value (§130). Absent = 0xF: the kind comes from the tiles. */
  readonly groupLiquid?: number | undefined;
}

export function validateBuildingLiquid(liquid: BuildingLiquid, what = 'liquid'): void {
  const { xVerts, yVerts } = liquid;
  if (!Number.isInteger(xVerts) || !Number.isInteger(yVerts) || xVerts < 2 || yVerts < 2 || xVerts * yVerts > 65536) throw new Error(`${what}: the vertex grid must be at least 2 × 2 and hold at most 65536 vertices (got ${xVerts} × ${yVerts})`);
  if (liquid.heights.length !== xVerts * yVerts) throw new Error(`${what}: ${xVerts} × ${yVerts} vertices need ${xVerts * yVerts} heights (got ${liquid.heights.length})`);
  if (liquid.tiles.length !== (xVerts - 1) * (yVerts - 1)) throw new Error(`${what}: ${xVerts - 1} × ${yVerts - 1} tiles need ${(xVerts - 1) * (yVerts - 1)} flags (got ${liquid.tiles.length})`);
  if (![...liquid.base, ...liquid.heights].every(Number.isFinite)) throw new Error(`${what}: the base and the heights must be finite`);
  if (liquid.groupLiquid !== undefined && (!Number.isInteger(liquid.groupLiquid) || liquid.groupLiquid < 0 || liquid.groupLiquid > 255)) throw new Error(`${what}: the group liquid value must be one byte (got ${liquid.groupLiquid})`);
  for (const nibble of [(liquid.groupLiquid ?? BUILDING_LIQUID_UNSET) & 0x0f, ...Array.from(liquid.tiles, (flag) => flag & 0x0f)]) {
    if (nibble !== BUILDING_LIQUID_HOLE && !LIQUID_TYPES[nibble]) throw new Error(`${what}: unknown liquid kind ${nibble}`);
  }
}

/** The ONE kind of the surface (§130), or null when nothing says it (no group value and every tile a hole). */
export function resolveBuildingLiquidType(liquid: BuildingLiquid): LiquidType | null {
  const group = (liquid.groupLiquid ?? BUILDING_LIQUID_UNSET) & 0x0f;
  if (group !== BUILDING_LIQUID_UNSET) return LIQUID_TYPES[group] ?? null;
  for (const flag of liquid.tiles) if ((flag & 0x0f) !== BUILDING_LIQUID_HOLE) return LIQUID_TYPES[flag & 0x0f] ?? null;
  return null;
}

export const buildingLiquidTileIsHole = (liquid: BuildingLiquid, i: number, j: number): boolean => (liquid.tiles[j * (liquid.xVerts - 1) + i]! & 0x0f) === BUILDING_LIQUID_HOLE;

export interface BuildingLiquidGeometry {
  /** x, y, z, depth (always 0 here) per vertex — the liquid shader's layout; every grid vertex, holes included. */
  readonly vertices: Float32Array;
  /** 6 indices per wet tile. */
  readonly indices: Uint16Array;
  readonly wetTiles: number;
  readonly type: LiquidType | null;
}

export function buildBuildingLiquidGeometry(liquid: BuildingLiquid, unitsPerYard = 1): BuildingLiquidGeometry {
  validateBuildingLiquid(liquid);
  if (!(unitsPerYard > 0) || !Number.isFinite(unitsPerYard)) throw new Error(`liquid: unitsPerYard must be finite and > 0 (got ${unitsPerYard})`);
  const { xVerts, yVerts, base } = liquid, step = BUILDING_LIQUID_CELL_STEP * unitsPerYard;
  const vertices = new Float32Array(xVerts * yVerts * 4);
  for (let j = 0; j < yVerts; j++) for (let i = 0; i < xVerts; i++) vertices.set([base[0] + i * step, base[1] + j * step, base[2] + liquid.heights[j * xVerts + i]!, 0], (j * xVerts + i) * 4);
  const indices: number[] = [];
  for (let j = 0; j < yVerts - 1; j++) for (let i = 0; i < xVerts - 1; i++) {
    if (buildingLiquidTileIsHole(liquid, i, j)) continue;
    const a = j * xVerts + i, b = a + 1, c = a + xVerts + 1, d = a + xVerts;
    indices.push(a, b, c, a, c, d);
  }
  return { vertices, indices: new Uint16Array(indices), wetTiles: indices.length / 6, type: resolveBuildingLiquidType(liquid) };
}

/**
 * Height of the liquid surface at (x, y) of the building's space — on the drawn triangles exactly — or null
 * outside the grid and over a hole.
 */
export function buildingLiquidHeightAt(liquid: BuildingLiquid, x: number, y: number, unitsPerYard = 1): number | null {
  const step = BUILDING_LIQUID_CELL_STEP * unitsPerYard, u = (x - liquid.base[0]) / step, v = (y - liquid.base[1]) / step;
  if (!(u >= 0 && v >= 0 && u <= liquid.xVerts - 1 && v <= liquid.yVerts - 1)) return null;
  const i = Math.min(liquid.xVerts - 2, Math.floor(u)), j = Math.min(liquid.yVerts - 2, Math.floor(v));
  if (buildingLiquidTileIsHole(liquid, i, j)) return null;
  const fu = u - i, fv = v - j, h = (di: number, dj: number): number => liquid.heights[(j + dj) * liquid.xVerts + i + di]!;
  // Triangle (a, b, c) is under the diagonal (fu ≥ fv), triangle (a, c, d) above it.
  const z = fu >= fv ? h(0, 0) + (h(1, 0) - h(0, 0)) * fu + (h(1, 1) - h(1, 0)) * fv : h(0, 0) + (h(1, 1) - h(0, 1)) * fu + (h(0, 1) - h(0, 0)) * fv;
  return liquid.base[2] + z;
}
