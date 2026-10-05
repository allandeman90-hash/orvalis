import { DepthRange, type Mat4 } from '../math';

/**
 * View frustum as 6 planes, extracted from a view-projection matrix
 * (clip = M · world, column-major storage). A plane is (a, b, c, d) with a
 * unit normal pointing INSIDE:  a·x + b·y + c·z + d ≥ 0  ⇔  inside that plane.
 *
 * Order: left, right, bottom, top, near, far.
 * The near plane depends on the clip-space depth range of the backend
 * (0..1 on WebGPU, −1..1 on WebGL2), exactly like the projection matrix.
 */
export const FRUSTUM_PLANES = 6;
export type Frustum = Float64Array; // 6 × 4 numbers

export function createFrustum(): Frustum {
  return new Float64Array(FRUSTUM_PLANES * 4);
}

export function frustumFromViewProjection(out: Frustum, m: Mat4, depthRange: DepthRange): Frustum {
  // Row i of the matrix: (m[i], m[4 + i], m[8 + i], m[12 + i]).
  const set = (plane: number, a: number, b: number, c: number, d: number): void => {
    const length = Math.hypot(a, b, c);
    if (!(length > 0) || !Number.isFinite(length)) throw new Error('camera: degenerate view-projection matrix, cannot extract frustum planes');
    out[plane * 4] = a / length;
    out[plane * 4 + 1] = b / length;
    out[plane * 4 + 2] = c / length;
    out[plane * 4 + 3] = d / length;
  };
  const r0 = [m[0]!, m[4]!, m[8]!, m[12]!], r1 = [m[1]!, m[5]!, m[9]!, m[13]!], r2 = [m[2]!, m[6]!, m[10]!, m[14]!], r3 = [m[3]!, m[7]!, m[11]!, m[15]!];
  set(0, r3[0]! + r0[0]!, r3[1]! + r0[1]!, r3[2]! + r0[2]!, r3[3]! + r0[3]!); // left:   x ≥ −w
  set(1, r3[0]! - r0[0]!, r3[1]! - r0[1]!, r3[2]! - r0[2]!, r3[3]! - r0[3]!); // right:  x ≤ w
  set(2, r3[0]! + r1[0]!, r3[1]! + r1[1]!, r3[2]! + r1[2]!, r3[3]! + r1[3]!); // bottom: y ≥ −w
  set(3, r3[0]! - r1[0]!, r3[1]! - r1[1]!, r3[2]! - r1[2]!, r3[3]! - r1[3]!); // top:    y ≤ w
  if (depthRange === DepthRange.ZeroToOne) set(4, r2[0]!, r2[1]!, r2[2]!, r2[3]!); // near: z ≥ 0
  else set(4, r3[0]! + r2[0]!, r3[1]! + r2[1]!, r3[2]! + r2[2]!, r3[3]! + r2[3]!); // near: z ≥ −w
  set(5, r3[0]! - r2[0]!, r3[1]! - r2[1]!, r3[2]! - r2[2]!, r3[3]! - r2[3]!); // far:    z ≤ w
  return out;
}

export function pointInFrustum(frustum: Frustum, x: number, y: number, z: number): boolean {
  for (let p = 0; p < FRUSTUM_PLANES * 4; p += 4) {
    if (frustum[p]! * x + frustum[p + 1]! * y + frustum[p + 2]! * z + frustum[p + 3]! < 0) return false;
  }
  return true;
}

/** Axis-aligned box, world units. */
export interface Aabb {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

/**
 * False only when the box is ENTIRELY outside one of the planes.
 * CONSERVATIVE: a box outside the frustum but not outside any single plane
 * (near a frustum corner) is reported as intersecting. So this test may keep
 * a box that is not visible, but it never rejects a visible one.
 */
export function aabbIntersectsFrustum(frustum: Frustum, box: Aabb): boolean {
  for (let p = 0; p < FRUSTUM_PLANES * 4; p += 4) {
    const a = frustum[p]!, b = frustum[p + 1]!, c = frustum[p + 2]!;
    // The box corner furthest along the plane normal.
    const x = a >= 0 ? box.maxX : box.minX, y = b >= 0 ? box.maxY : box.minY, z = c >= 0 ? box.maxZ : box.minZ;
    if (a * x + b * y + c * z + frustum[p + 3]! < 0) return false;
  }
  return true;
}
