import type { ModelMeshBuilder } from './modelMesh';

/**
 * Lofts: rounded shapes made of a stack of elliptical rings joined by smooth surfaces — the building block of the
 * engine's code-built original models (the mannequin, its equipment). OUR OWN modelling helper; nothing here
 * comes from the reference document.
 */
type V3 = readonly [number, number, number];
type Influences = ReadonlyArray<readonly [number, number]>;

/** One ring of a loft: an ellipse of radii `ru` (along the loft's u axis) and `rv` (along its v axis). */
export interface LoftRing {
  readonly center: V3;
  readonly ru: number;
  readonly rv: number;
  /** Up to 4 [bone, weight] pairs, weights adding up to 255. */
  readonly influences: Influences;
}

/**
 * A stack of rings. The rings are listed in the direction `u × v` (for the default axes x and y: upwards).
 * Both ends are closed by a flat cap unless said otherwise.
 */
export interface LoftShape {
  readonly name: string;
  readonly sides: number;
  readonly rings: readonly LoftRing[];
  /** Default: x. */
  readonly u?: V3;
  /** Default: y. */
  readonly v?: V3;
  readonly openStart?: boolean;
  readonly openEnd?: boolean;
}

/** Rectangle of the texture a loft is unwrapped into, in texels, and the texture's size. */
export interface LoftTextureRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly textureSize: number;
}

export const loftRing = (x: number, y: number, z: number, ru: number, rv: number, ...influences: Array<readonly [number, number]>): LoftRing => ({ center: [x, y, z], ru, rv, influences });

const cross = (a: V3, b: V3): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): [number, number, number] => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};

/** Triangles of a loft: 2 per side between two rings, plus `sides` per closed end. */
export function loftTriangleCount(loft: LoftShape): number {
  return (loft.rings.length - 1) * loft.sides * 2 + (loft.openStart ? 0 : loft.sides) + (loft.openEnd ? 0 : loft.sides);
}

/**
 * Adds a loft to a mesh being built. It is unwrapped into `rect`: around the rings from left to right (starting on
 * the +u side), along the loft from the bottom of the rectangle to its top.
 */
export function addLoft(b: ModelMeshBuilder, loft: LoftShape, rect: LoftTextureRect): void {
  const u = loft.u ?? [1, 0, 0], v = loft.v ?? [0, 1, 0], along = cross(u, v), { sides, rings } = loft;
  if (sides < 3 || rings.length < 2) throw new Error(`loft "${loft.name}" needs at least 3 sides and 2 rings`);
  const region = rect, size = rect.textureSize;
  // Half a texel inside the rectangle, so that filtering never reaches the neighbouring region.
  const uvOf = (s: number, t: number): [number, number] => [(region.x + 0.5 + s * (region.width - 1)) / size, (region.y + 0.5 + (1 - t) * (region.height - 1)) / size];
  const point = (r: LoftRing, k: number): [number, number, number] => {
    const a = (k / sides) * 2 * Math.PI, c = Math.cos(a) * r.ru, s = Math.sin(a) * r.rv;
    return [r.center[0] + u[0] * c + v[0] * s, r.center[1] + u[1] * c + v[1] * s, r.center[2] + u[2] * c + v[2] * s];
  };
  // Smooth normals of the side surface: for each vertex, the normal of its ellipse tilted by the slope towards its
  // neighbours — obtained as the cross product of the tangent around the ring and the tangent along the loft.
  const grid: number[][] = [];
  rings.forEach((r, i) => {
    const row: number[] = [];
    for (let k = 0; k <= sides; k++) {
      const around = [point(r, k + 1), point(r, k - 1)], before = rings[Math.max(0, i - 1)]!, after = rings[Math.min(rings.length - 1, i + 1)]!;
      const tangent: V3 = [around[0]![0] - around[1]![0], around[0]![1] - around[1]![1], around[0]![2] - around[1]![2]];
      const up = [point(after, k), point(before, k)];
      const rise: V3 = [up[0]![0] - up[1]![0], up[0]![1] - up[1]![1], up[0]![2] - up[1]![2]];
      row.push(b.vertex(point(r, k), unit(cross(tangent, rise)), uvOf(k / sides, i / (rings.length - 1)), r.influences));
    }
    grid.push(row);
  });
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < sides; k++) {
    const a = grid[i]![k]!, c = grid[i]![k + 1]!, d = grid[i + 1]![k + 1]!, e = grid[i + 1]![k]!;
    b.triangle(a, c, d);
    b.triangle(a, d, e);
  }
  // Flat caps: a fan around the ring's centre, facing away from the loft.
  const cap = (r: LoftRing, t: number, outwards: number): void => {
    const normal: V3 = [along[0] * outwards, along[1] * outwards, along[2] * outwards];
    const centre = b.vertex(r.center, normal, uvOf(0.5, t), r.influences);
    const rim: number[] = [];
    for (let k = 0; k <= sides; k++) rim.push(b.vertex(point(r, k), normal, uvOf(k / sides, t), r.influences));
    for (let k = 0; k < sides; k++) {
      if (outwards > 0) b.triangle(centre, rim[k]!, rim[k + 1]!);
      else b.triangle(centre, rim[k + 1]!, rim[k]!);
    }
  };
  if (!loft.openStart) cap(rings[0]!, 0, -1);
  if (!loft.openEnd) cap(rings[rings.length - 1]!, 1, 1);
}

