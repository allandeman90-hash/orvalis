import type { Building, BuildingBounds, BuildingGroup } from './building';

/**
 * Collision geometry of a building (spec §122–§125, §193).
 *
 * FROM THE SPEC:
 * - every triangle carries semantic flags: 0x02 NOCAMCOLLIDE, 0x04 DETAIL, 0x08 COLLISION (the full bit table is
 *   NOT final in the document);
 * - the player (walking) path keeps the non-DETAIL faces; the camera path keeps DETAIL but excludes NOCAMCOLLIDE —
 *   so thin decoration can stop the camera without blocking the player;
 * - the face sets share the group's vertex positions and differ only by their INDEX arrays: no copy of the vertices;
 * - broad phase: whole-building box → group box → a spatial grid → triangle test; never « every triangle ».
 *
 * OUR CHOICES (the document does not settle them):
 * - the two sets are exactly « not DETAIL » and « not NOCAMCOLLIDE »: flag 0x08 is stored but NOT consulted (the
 *   document recovers its name, not a rule that uses it);
 * - a group without triangle flags has all of them at 0: every triangle is in both sets;
 * - the grid is uniform, one per group and per set, with cells of `cellSize` units (default 2, at most 32 cells
 *   per axis);
 * - a triangle is hit from BOTH sides (a wall drawn one-sided still stops a ray from behind);
 * - queries are in the BUILDING's space; the props (doodads) have no collision yet.
 */
export const BUILDING_TRIANGLE_FLAG = { noCamCollide: 0x02, detail: 0x04, collision: 0x08 } as const;
export type CollisionKind = 'player' | 'camera';
export const COLLISION_KINDS: readonly CollisionKind[] = ['player', 'camera'];
export const DEFAULT_COLLISION_CELL_SIZE = 2;
const MAX_CELLS_PER_AXIS = 32;

/** Does a triangle with these flags belong to the set of `kind`. */
export function triangleCollides(flags: number, kind: CollisionKind): boolean {
  return kind === 'player' ? (flags & BUILDING_TRIANGLE_FLAG.detail) === 0 : (flags & BUILDING_TRIANGLE_FLAG.noCamCollide) === 0;
}

/** The numbers of the group's triangles that are in the set of `kind`, ascending. */
export function collisionTriangles(group: BuildingGroup, kind: CollisionKind): number[] {
  const out: number[] = [];
  for (let t = 0; t < group.indices.length / 3; t++) if (triangleCollides(group.triangleFlags?.[t] ?? 0, kind)) out.push(t);
  return out;
}

/** The index array of one set: it refers to the group's own vertices. */
export function collisionIndices(group: BuildingGroup, kind: CollisionKind): Uint16Array {
  const triangles = collisionTriangles(group, kind), out = new Uint16Array(triangles.length * 3);
  triangles.forEach((t, k) => out.set(group.indices.subarray(t * 3, t * 3 + 3), k * 3));
  return out;
}

export interface CollisionHit {
  /** Along the (normalized) direction, from the origin. */
  readonly distance: number;
  readonly point: [number, number, number];
  /** Unit geometric normal of the triangle (counter-clockwise side), whichever side was hit. */
  readonly normal: [number, number, number];
  readonly group: number;
  /** Number of the triangle in the group's index array (its indices start at 3 × triangle). */
  readonly triangle: number;
  readonly flags: number;
}

type Vec = readonly [number, number, number];

/** Distance along a unit direction to a triangle, hit from either side; Infinity when missed. */
export function rayTriangle(origin: Vec, direction: Vec, positions: Float32Array, a: number, b: number, c: number): number {
  const ax = positions[a * 3]!, ay = positions[a * 3 + 1]!, az = positions[a * 3 + 2]!;
  const e1x = positions[b * 3]! - ax, e1y = positions[b * 3 + 1]! - ay, e1z = positions[b * 3 + 2]! - az;
  const e2x = positions[c * 3]! - ax, e2y = positions[c * 3 + 1]! - ay, e2z = positions[c * 3 + 2]! - az;
  const px = direction[1] * e2z - direction[2] * e2y, py = direction[2] * e2x - direction[0] * e2z, pz = direction[0] * e2y - direction[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return Infinity; // parallel to the triangle, or a degenerate triangle
  const inv = 1 / det, tx = origin[0] - ax, ty = origin[1] - ay, tz = origin[2] - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return Infinity;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (direction[0] * qx + direction[1] * qy + direction[2] * qz) * inv;
  if (v < 0 || u + v > 1) return Infinity;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t >= 0 ? t : Infinity;
}

/** Parameters [enter, exit] of a ray inside a box, or null when it misses it (within 0..max). */
function rayBox(origin: Vec, direction: Vec, max: number, min: Vec, top: Vec): [number, number] | null {
  let enter = 0, exit = max;
  for (let k = 0; k < 3; k++) {
    if (direction[k] === 0) {
      if (origin[k]! < min[k]! || origin[k]! > top[k]!) return null;
      continue;
    }
    let t0 = (min[k]! - origin[k]!) / direction[k]!, t1 = (top[k]! - origin[k]!) / direction[k]!;
    if (t0 > t1) [t0, t1] = [t1, t0];
    enter = Math.max(enter, t0);
    exit = Math.min(exit, t1);
    if (enter > exit) return null;
  }
  return [enter, exit];
}

/** One set of one group: its triangles in a uniform grid. */
interface CollisionGrid {
  readonly triangles: readonly number[];
  readonly min: [number, number, number];
  readonly max: [number, number, number];
  readonly dims: [number, number, number];
  readonly cell: [number, number, number];
  /** Cell c holds entries cellStart[c] .. cellStart[c + 1] of cellItems (positions in `triangles`). */
  readonly cellStart: Uint32Array;
  readonly cellItems: Uint32Array;
  readonly stamps: Uint32Array;
}

const PAD = 1e-3;

function buildGrid(group: BuildingGroup, triangles: readonly number[], cellSize: number): CollisionGrid | null {
  if (triangles.length === 0) return null;
  const p = group.positions, min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const boxes = new Float32Array(triangles.length * 6);
  triangles.forEach((t, n) => {
    for (let k = 0; k < 3; k++) {
      const values = [0, 1, 2].map((corner) => p[group.indices[t * 3 + corner]! * 3 + k]!);
      // Float32 storage rounds: pad every box so that no triangle falls just outside its cells.
      boxes[n * 6 + k] = Math.min(...values) - PAD;
      boxes[n * 6 + 3 + k] = Math.max(...values) + PAD;
      min[k] = Math.min(min[k]!, boxes[n * 6 + k]!);
      max[k] = Math.max(max[k]!, boxes[n * 6 + 3 + k]!);
    }
  });
  const dims = [0, 1, 2].map((k) => Math.max(1, Math.min(MAX_CELLS_PER_AXIS, Math.ceil((max[k]! - min[k]!) / cellSize)))) as [number, number, number];
  const cell = [0, 1, 2].map((k) => (max[k]! - min[k]!) / dims[k]!) as [number, number, number];
  const range = (n: number, k: number): [number, number] => [
    Math.max(0, Math.min(dims[k]! - 1, Math.floor((boxes[n * 6 + k]! - min[k]!) / cell[k]!))),
    Math.max(0, Math.min(dims[k]! - 1, Math.floor((boxes[n * 6 + 3 + k]! - min[k]!) / cell[k]!))),
  ];
  const each = (visit: (cellIndex: number, n: number) => void): void => {
    for (let n = 0; n < triangles.length; n++) {
      const [x0, x1] = range(n, 0), [y0, y1] = range(n, 1), [z0, z1] = range(n, 2);
      for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) visit((z * dims[1] + y) * dims[0] + x, n);
    }
  };
  const cellStart = new Uint32Array(dims[0] * dims[1] * dims[2] + 1);
  each((c) => cellStart[c + 1]!++);
  for (let c = 0; c < cellStart.length - 1; c++) cellStart[c + 1]! += cellStart[c]!;
  const cellItems = new Uint32Array(cellStart[cellStart.length - 1]!), next = cellStart.slice(0, -1);
  each((c, n) => (cellItems[next[c]!++] = n));
  return { triangles, min, max, dims, cell, cellStart, cellItems, stamps: new Uint32Array(triangles.length) };
}

export interface RaycastOptions {
  /** Only these groups are tested. Absent: every group. */
  readonly groups?: ReadonlySet<number> | undefined;
}

/**
 * The collision sets of one building, ready for queries: per group and per kind an index array over the group's
 * own positions, and a grid. raycast() goes building box → group box → grid cells along the ray → triangles.
 */
export class BuildingCollision {
  readonly bounds: BuildingBounds;
  private readonly grids: ReadonlyArray<Readonly<Record<CollisionKind, CollisionGrid | null>>>;
  private stamp = 0;
  /** Triangle tests made by the last raycast(): what the broad phase left to do. */
  lastTested = 0;

  constructor(readonly building: Building, readonly cellSize = DEFAULT_COLLISION_CELL_SIZE) {
    if (!(cellSize > 0) || !Number.isFinite(cellSize)) throw new Error(`building collision: the cell size must be a finite number > 0 (got ${cellSize})`);
    this.grids = building.groups.map((group) => ({ player: buildGrid(group, collisionTriangles(group, 'player'), cellSize), camera: buildGrid(group, collisionTriangles(group, 'camera'), cellSize) }));
    const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const group of building.groups) for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, group.bounds.min[k]! - PAD);
      max[k] = Math.max(max[k]!, group.bounds.max[k]! + PAD);
    }
    this.bounds = { min, max };
  }

  /** Triangles in the set of `kind`, over every group. */
  triangleCount(kind: CollisionKind): number {
    return this.grids.reduce((sum, grid) => sum + (grid[kind]?.triangles.length ?? 0), 0);
  }

  /**
   * The nearest triangle of the set along a ray, within `maxDistance`; null when there is none.
   * @param direction any length > 0 (it is normalized here)
   */
  raycast(origin: Vec, direction: Vec, maxDistance: number, kind: CollisionKind, options: RaycastOptions = {}): CollisionHit | null {
    const length = Math.hypot(direction[0], direction[1], direction[2]);
    if (!(length > 0) || !Number.isFinite(length)) throw new Error('building collision: the ray direction must be finite and not zero');
    if (![origin[0], origin[1], origin[2]].every(Number.isFinite)) throw new Error('building collision: the ray origin must be finite');
    if (!(maxDistance >= 0)) throw new Error(`building collision: the maximum distance must be ≥ 0 (got ${maxDistance})`);
    const d: [number, number, number] = [direction[0] / length, direction[1] / length, direction[2] / length];
    this.lastTested = 0;
    let best = Math.min(maxDistance, Number.MAX_VALUE), bestGroup = -1, bestTriangle = -1;
    if (!rayBox(origin, d, best, this.bounds.min, this.bounds.max)) return null;
    this.building.groups.forEach((group, g) => {
      const grid = this.grids[g]![kind];
      if (!grid || (options.groups && !options.groups.has(g))) return;
      const span = rayBox(origin, d, best, grid.min, grid.max);
      if (!span) return;
      const stamp = ++this.stamp;
      // Walk the cells the ray crosses, nearest first (3D DDA).
      const start = span[0];
      const cellOf = [0, 0, 0], step = [0, 0, 0], tNext = [Infinity, Infinity, Infinity], tDelta = [Infinity, Infinity, Infinity];
      for (let k = 0; k < 3; k++) {
        const at = origin[k]! + d[k]! * start;
        cellOf[k] = Math.max(0, Math.min(grid.dims[k]! - 1, Math.floor((at - grid.min[k]!) / grid.cell[k]!)));
        if (d[k]! > 0) {
          step[k] = 1;
          tDelta[k] = grid.cell[k]! / d[k]!;
          tNext[k] = (grid.min[k]! + (cellOf[k]! + 1) * grid.cell[k]! - origin[k]!) / d[k]!;
        } else if (d[k]! < 0) {
          step[k] = -1;
          tDelta[k] = -grid.cell[k]! / d[k]!;
          tNext[k] = (grid.min[k]! + cellOf[k]! * grid.cell[k]! - origin[k]!) / d[k]!;
        }
      }
      for (;;) {
        const c = (cellOf[2]! * grid.dims[1] + cellOf[1]!) * grid.dims[0] + cellOf[0]!;
        for (let i = grid.cellStart[c]!; i < grid.cellStart[c + 1]!; i++) {
          const n = grid.cellItems[i]!;
          if (grid.stamps[n] === stamp) continue;
          grid.stamps[n] = stamp;
          const t = grid.triangles[n]!;
          this.lastTested++;
          const distance = rayTriangle(origin, d, group.positions, group.indices[t * 3]!, group.indices[t * 3 + 1]!, group.indices[t * 3 + 2]!);
          if (distance <= best && (distance < best || bestGroup < 0)) {
            best = distance;
            bestGroup = g;
            bestTriangle = t;
          }
        }
        // Leave through the nearest cell wall; stop once the best hit is nearer than that wall, or outside the grid.
        const axis = tNext[0]! <= tNext[1]! ? (tNext[0]! <= tNext[2]! ? 0 : 2) : tNext[1]! <= tNext[2]! ? 1 : 2;
        if (tNext[axis]! > span[1] || (bestGroup >= 0 && best < tNext[axis]!)) break;
        cellOf[axis]! += step[axis]!;
        if (cellOf[axis]! < 0 || cellOf[axis]! >= grid.dims[axis]) break;
        tNext[axis]! += tDelta[axis]!;
      }
    });
    return bestGroup < 0 ? null : this.hit(origin, d, best, bestGroup, bestTriangle);
  }

  /**
   * Every triangle of the set whose cells touch the box min..max (each one once): what a volume — the player's
   * capsule — has to be tested against. The visitor gets the group's positions and the three vertex indices.
   */
  trianglesInBox(min: Vec, max: Vec, kind: CollisionKind, visit: (positions: Float32Array, a: number, b: number, c: number) => void): void {
    for (let k = 0; k < 3; k++) if (max[k]! < this.bounds.min[k]! || min[k]! > this.bounds.max[k]!) return;
    this.building.groups.forEach((group, g) => {
      const grid = this.grids[g]![kind];
      if (!grid) return;
      const lo = [0, 0, 0], hi = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        if (max[k]! < grid.min[k]! || min[k]! > grid.max[k]!) return;
        lo[k] = Math.max(0, Math.min(grid.dims[k]! - 1, Math.floor((min[k]! - grid.min[k]!) / grid.cell[k]!)));
        hi[k] = Math.max(0, Math.min(grid.dims[k]! - 1, Math.floor((max[k]! - grid.min[k]!) / grid.cell[k]!)));
      }
      const stamp = ++this.stamp;
      for (let z = lo[2]!; z <= hi[2]!; z++) for (let y = lo[1]!; y <= hi[1]!; y++) for (let x = lo[0]!; x <= hi[0]!; x++) {
        const c = (z * grid.dims[1] + y) * grid.dims[0] + x;
        for (let i = grid.cellStart[c]!; i < grid.cellStart[c + 1]!; i++) {
          const n = grid.cellItems[i]!;
          if (grid.stamps[n] === stamp) continue;
          grid.stamps[n] = stamp;
          const t = grid.triangles[n]!;
          visit(group.positions, group.indices[t * 3]!, group.indices[t * 3 + 1]!, group.indices[t * 3 + 2]!);
        }
      }
    });
  }

  /** The same answer by testing every triangle of the set: the reference the grid is checked against. */
  raycastBruteForce(origin: Vec, direction: Vec, maxDistance: number, kind: CollisionKind, options: RaycastOptions = {}): CollisionHit | null {
    const length = Math.hypot(direction[0], direction[1], direction[2]);
    const d: [number, number, number] = [direction[0] / length, direction[1] / length, direction[2] / length];
    let best = maxDistance, bestGroup = -1, bestTriangle = -1;
    this.building.groups.forEach((group, g) => {
      if (options.groups && !options.groups.has(g)) return;
      for (const t of this.grids[g]![kind]?.triangles ?? []) {
        const distance = rayTriangle(origin, d, group.positions, group.indices[t * 3]!, group.indices[t * 3 + 1]!, group.indices[t * 3 + 2]!);
        if (distance <= best && (distance < best || bestGroup < 0)) {
          best = distance;
          bestGroup = g;
          bestTriangle = t;
        }
      }
    });
    return bestGroup < 0 ? null : this.hit(origin, d, best, bestGroup, bestTriangle);
  }

  private hit(origin: Vec, d: Vec, distance: number, g: number, t: number): CollisionHit {
    const group = this.building.groups[g]!, p = group.positions;
    const [a, b, c] = [group.indices[t * 3]! * 3, group.indices[t * 3 + 1]! * 3, group.indices[t * 3 + 2]! * 3];
    const e1 = [p[b]! - p[a]!, p[b + 1]! - p[a + 1]!, p[b + 2]! - p[a + 2]!], e2 = [p[c]! - p[a]!, p[c + 1]! - p[a + 1]!, p[c + 2]! - p[a + 2]!];
    const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
    return { distance, point: [origin[0] + d[0] * distance, origin[1] + d[1] * distance, origin[2] + d[2] * distance], normal: [n[0]! / l, n[1]! / l, n[2]! / l], group: g, triangle: t, flags: group.triangleFlags?.[t] ?? 0 };
  }
}
