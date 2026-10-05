import { MOVEMENT } from './constants';

/**
 * The player's collision volume (P8.4, spec §203, §206, §207): a vertical CAPSULE — every point within `radius`
 * of a vertical segment — tested against triangles.
 *
 * FROM THE SPEC: fallback radius 1/3 yard and height 2.0277777 yards (the active model overrides them); a
 * collision skin of about 0.02; on a collision the move loses its part into the surface (v' = v − N·(v·N)),
 * repeated for a small bounded number of corrections.
 *
 * OUR CHOICES:
 * - the correction is made on the POSITION: after the move, the capsule is pushed out of every triangle it is
 *   too close to, along the shortest way out. Pushed out of a wall it was driven into at an angle, what is left
 *   of the move is exactly its part along the wall — the slide;
 * - the capsule is kept `skin` away from the surfaces; one correction per pass, out of the deepest contact,
 *   capped at 4 passes;
 * - the capsule starts a GROUND SNAP (0.2) above the feet: what is lower than that belongs to the ground probe
 *   (P8.3), and a capsule that started at the feet would rub against every slope it walks on;
 * - surfaces the character can walk on (≤ 50°) that are under the capsule are not obstacles: they are ground.
 */
export type Vec3 = readonly [number, number, number];

export interface CapsuleShape {
  readonly radius: number;
  /** Feet to top of the head. */
  readonly height: number;
  /** How far above the feet the capsule starts. */
  readonly lift: number;
  /** Distance kept between the capsule and the surfaces. */
  readonly skin: number;
}

/** The document's fallback dimensions (§203), in yards × unitsPerYard. */
export function defaultCapsule(unitsPerYard = 1): CapsuleShape {
  return { radius: MOVEMENT.collisionRadius * unitsPerYard, height: MOVEMENT.collisionHeight * unitsPerYard, lift: MOVEMENT.groundSnap * unitsPerYard, skin: MOVEMENT.collisionSkin * unitsPerYard };
}

/** The capsule's axis for feet at `feet`: from `bottom` to `top` (z of the two sphere centres). */
export function capsuleAxis(feetZ: number, shape: CapsuleShape): { bottom: number; top: number } {
  const bottom = feetZ + shape.lift + shape.radius;
  return { bottom, top: Math.max(bottom, feetZ + shape.height - shape.radius) };
}

export const CAPSULE_MAX_PASSES = 4;

/** Closest point of triangle abc to p (Ericson, « Real-Time Collision Detection » §5.1.5). */
export function closestPointOnTriangle(out: [number, number, number], p: Vec3, a: Vec3, b: Vec3, c: Vec3): [number, number, number] {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2], acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
  const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  const set = (x: number, y: number, z: number): [number, number, number] => {
    out[0] = x;
    out[1] = y;
    out[2] = z;
    return out;
  };
  if (d1 <= 0 && d2 <= 0) return set(a[0], a[1], a[2]);
  const bpx = p[0] - b[0], bpy = p[1] - b[1], bpz = p[2] - b[2];
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return set(b[0], b[1], b[2]);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return set(a[0] + abx * v, a[1] + aby * v, a[2] + abz * v);
  }
  const cpx = p[0] - c[0], cpy = p[1] - c[1], cpz = p[2] - c[2];
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return set(c[0], c[1], c[2]);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return set(a[0] + acx * w, a[1] + acy * w, a[2] + acz * w);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return set(b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w);
  }
  const denominator = va + vb + vc;
  if (denominator === 0) return set(a[0], a[1], a[2]); // a degenerate triangle
  const v = vb / denominator, w = vc / denominator;
  return set(a[0] + abx * v + acx * w, a[1] + aby * v + acy * w, a[2] + abz * v + acz * w);
}

/**
 * Closest points between the VERTICAL segment (x, y, z0..z1) and the segment pq (Ericson §5.1.9):
 * returns [z on the vertical one, t on pq].
 */
function closestVerticalToSegment(x: number, y: number, z0: number, z1: number, p: Vec3, q: Vec3): [number, number] {
  const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
  const L = z1 - z0, d2x = q[0] - p[0], d2y = q[1] - p[1], d2z = q[2] - p[2];
  const rx = x - p[0], ry = y - p[1], rz = z0 - p[2];
  const a = L * L, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz, c = L * rz, b = L * d2z;
  let s: number, t: number;
  if (a <= 1e-18 && e <= 1e-18) return [z0, 0];
  if (a <= 1e-18) {
    s = 0;
    t = clamp01(f / e);
  } else if (e <= 1e-18) {
    t = 0;
    s = clamp01(-c / a);
  } else {
    const denominator = a * e - b * b;
    s = denominator > 1e-18 ? clamp01((b * f - c * e) / denominator) : 0;
    t = (b * s + f) / e;
    if (t < 0) {
      t = 0;
      s = clamp01(-c / a);
    } else if (t > 1) {
      t = 1;
      s = clamp01((b - c) / a);
    }
  }
  return [z0 + s * L, t];
}

export interface SegmentTriangleClosest {
  /** Height of the nearest point of the vertical segment. */
  z: number;
  /** Nearest point of the triangle. */
  point: [number, number, number];
  distance: number;
}

const scratch: [number, number, number] = [0, 0, 0];

/**
 * The nearest points between the vertical segment (x, y, z0..z1) and triangle abc.
 * Exact: either the segment crosses the triangle (distance 0), or the nearest pair involves an END of the
 * segment (point–triangle) or an EDGE of the triangle (segment–segment).
 */
export function closestVerticalSegmentTriangle(out: SegmentTriangleClosest, x: number, y: number, z0: number, z1: number, a: Vec3, b: Vec3, c: Vec3): SegmentTriangleClosest {
  let best = Infinity;
  const take = (z: number, px: number, py: number, pz: number): void => {
    const d = Math.hypot(px - x, py - y, pz - z);
    if (d < best) {
      best = d;
      out.z = z;
      out.point[0] = px;
      out.point[1] = py;
      out.point[2] = pz;
    }
  };
  // Does the vertical line cross the triangle, within the segment? (2D barycentric test on the horizontal plane.)
  const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(det) > 1e-18) {
    const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / det, v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / det, w = 1 - u - v;
    if (u >= 0 && v >= 0 && w >= 0) {
      const z = u * a[2] + v * b[2] + w * c[2];
      if (z >= z0 && z <= z1) take(z, x, y, z);
    }
  }
  if (best > 0) {
    for (const z of [z0, z1]) {
      const p = closestPointOnTriangle(scratch, [x, y, z], a, b, c);
      take(z, p[0], p[1], p[2]);
    }
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const [z, t] = closestVerticalToSegment(x, y, z0, z1, p, q);
      take(z, p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t);
    }
  }
  out.distance = best;
  return out;
}

/** Calls `visit` for every triangle that may touch the box min..max. */
export type TriangleQuery = (min: Vec3, max: Vec3, visit: (a: Vec3, b: Vec3, c: Vec3) => void) => void;

export interface CapsuleResolution {
  /** The feet after the corrections. */
  position: [number, number, number];
  /** Unit directions the capsule was pushed along (away from the surfaces), one per correction. */
  normals: Array<[number, number, number]>;
  /** The capsule was pushed at all. */
  touched: boolean;
  /** The distance kept between the capsule's axis and the surfaces: radius + skin. */
  reach: number;
}

export interface ResolveOptions {
  /**
   * On the ground: corrections move the character on the horizontal plane only (its height belongs to the
   * ground probe). In the air: corrections are free in 3D.
   */
  readonly horizontalOnly: boolean;
  /** cos of the walkable limit: surfaces flatter than that, under the capsule, are ground, not obstacles. */
  readonly walkableCos?: number | undefined;
}

/** Pushes a capsule standing at `feet` out of the triangles around it. */
export function resolveCapsule(feet: Vec3, shape: CapsuleShape, triangles: TriangleQuery, options: ResolveOptions): CapsuleResolution {
  const walkableCos = options.walkableCos ?? Math.cos((MOVEMENT.walkableSlopeDegrees * Math.PI) / 180) - 1e-6;
  const position: [number, number, number] = [feet[0], feet[1], feet[2]], reach = shape.radius + shape.skin;
  const result: CapsuleResolution = { position, normals: [], touched: false, reach };
  const closest: SegmentTriangleClosest = { z: 0, point: [0, 0, 0], distance: 0 };
  // One correction per pass, out of the DEEPEST contact. (Correcting every triangle in turn would let the
  // inner edges of a flat wall — the diagonal between its two triangles — push sideways, like a bump in the wall.)
  const best: SegmentTriangleClosest = { z: 0, point: [0, 0, 0], distance: 0 }, bestNormal: [number, number, number] = [0, 0, 0];
  for (let pass = 0; pass < CAPSULE_MAX_PASSES; pass++) {
    const axis = capsuleAxis(position[2], shape);
    best.distance = Infinity;
    triangles([position[0] - reach, position[1] - reach, axis.bottom - reach], [position[0] + reach, position[1] + reach, axis.top + reach], (a, b, c) => {
      closestVerticalSegmentTriangle(closest, position[0], position[1], axis.bottom, axis.top, a, b, c);
      if (closest.distance >= reach || closest.distance >= best.distance) return;
      // The triangle's own normal (either winding).
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.hypot(nx, ny, nz);
      if (!(nl > 0)) return;
      // Ground, not an obstacle: flat enough to walk on, and under the capsule.
      if (Math.abs(nz) / nl >= walkableCos && closest.point[2] < axis.bottom) return;
      let dx: number, dy: number, dz: number;
      if (closest.distance < 1e-9) {
        // The axis CROSSES the triangle: the way out is the triangle's normal, on the side the capsule's middle is.
        const middle = (axis.bottom + axis.top) / 2, side = (position[0] - a[0]) * nx + (position[1] - a[1]) * ny + (middle - a[2]) * nz >= 0 ? 1 : -1;
        dx = (nx / nl) * side;
        dy = (ny / nl) * side;
        dz = (nz / nl) * side;
      } else {
        // The way out: from the nearest point of the triangle towards the axis.
        dx = (position[0] - closest.point[0]) / closest.distance;
        dy = (position[1] - closest.point[1]) / closest.distance;
        dz = (closest.z - closest.point[2]) / closest.distance;
      }
      // On the ground a surface above or below (a ceiling, the edge of a floor) cannot be left sideways.
      if (options.horizontalOnly && Math.hypot(dx, dy) < 0.3) return;
      best.distance = closest.distance;
      bestNormal[0] = dx;
      bestNormal[1] = dy;
      bestNormal[2] = dz;
    });
    if (best.distance === Infinity) break;
    const depth = reach - best.distance;
    if (options.horizontalOnly) {
      // Keep the height: the same separation is reached by going farther on the horizontal plane.
      const flat = Math.hypot(bestNormal[0], bestNormal[1]);
      position[0] += (bestNormal[0] / flat) * (depth / flat);
      position[1] += (bestNormal[1] / flat) * (depth / flat);
      result.normals.push([bestNormal[0] / flat, bestNormal[1] / flat, 0]);
    } else {
      position[0] += bestNormal[0] * depth;
      position[1] += bestNormal[1] * depth;
      position[2] += bestNormal[2] * depth;
      result.normals.push([bestNormal[0], bestNormal[1], bestNormal[2]]);
    }
    result.touched = true;
  }
  return result;
}
