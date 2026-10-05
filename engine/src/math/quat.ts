import type { Mat4 } from './mat4';
import type { Vec3 } from './vec3';

/** Unit quaternion stored as [x, y, z, w] in float32. */
export type Quat = Float32Array;

export function create(): Quat {
  const q = new Float32Array(4);
  q[3] = 1;
  return q;
}

export function set(out: Quat, x: number, y: number, z: number, w: number): Quat {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  out[3] = w;
  return out;
}

/** `axis` must be normalized; `angle` in radians. */
export function fromAxisAngle(out: Quat, axis: Vec3, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return set(out, axis[0]! * s, axis[1]! * s, axis[2]! * s, Math.cos(angle / 2));
}

/** out = a × b (b's rotation is applied first). Safe when `out` aliases an input. */
export function multiply(out: Quat, a: Quat, b: Quat): Quat {
  const ax = a[0]!, ay = a[1]!, az = a[2]!, aw = a[3]!;
  const bx = b[0]!, by = b[1]!, bz = b[2]!, bw = b[3]!;
  return set(
    out,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  );
}

/** A zero quaternion normalizes to identity (never NaN). */
export function normalize(out: Quat, a: Quat): Quat {
  const len = Math.hypot(a[0]!, a[1]!, a[2]!, a[3]!);
  if (len === 0) return set(out, 0, 0, 0, 1);
  const i = 1 / len;
  return set(out, a[0]! * i, a[1]! * i, a[2]! * i, a[3]! * i);
}

/**
 * Spherical interpolation along the shortest arc (spec §38: rotation tracks use
 * normalized quaternion interpolation / slerp). Falls back to nlerp when the
 * inputs are nearly parallel.
 */
export function slerp(out: Quat, a: Quat, b: Quat, t: number): Quat {
  const ax = a[0]!, ay = a[1]!, az = a[2]!, aw = a[3]!;
  let bx = b[0]!, by = b[1]!, bz = b[2]!, bw = b[3]!;
  let cos = ax * bx + ay * by + az * bz + aw * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  let sa: number, sb: number;
  if (1 - cos > 1e-6) {
    const omega = Math.acos(cos);
    const sin = Math.sin(omega);
    sa = Math.sin((1 - t) * omega) / sin;
    sb = Math.sin(t * omega) / sin;
  } else {
    sa = 1 - t;
    sb = t;
  }
  set(out, sa * ax + sb * bx, sa * ay + sb * by, sa * az + sb * bz, sa * aw + sb * bw);
  return normalize(out, out);
}

/** Rotates vector `v` by unit quaternion `q`. Safe when `out` aliases `v`. */
export function rotateVec3(out: Vec3, q: Quat, v: Vec3): Vec3 {
  const qx = q[0]!, qy = q[1]!, qz = q[2]!, qw = q[3]!;
  const vx = v[0]!, vy = v[1]!, vz = v[2]!;
  // t = 2 * (q.xyz × v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  out[0] = vx + qw * tx + (qy * tz - qz * ty);
  out[1] = vy + qw * ty + (qz * tx - qx * tz);
  out[2] = vz + qw * tz + (qx * ty - qy * tx);
  return out;
}

/** Rotation matrix (column-major) from a unit quaternion. */
export function toMat4(out: Mat4, q: Quat): Mat4 {
  const x = q[0]!, y = q[1]!, z = q[2]!, w = q[3]!;
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z;
  const wx = w * x, wy = w * y, wz = w * z;
  out[0] = 1 - 2 * (yy + zz); out[1] = 2 * (xy + wz); out[2] = 2 * (xz - wy); out[3] = 0;
  out[4] = 2 * (xy - wz); out[5] = 1 - 2 * (xx + zz); out[6] = 2 * (yz + wx); out[7] = 0;
  out[8] = 2 * (xz + wy); out[9] = 2 * (yz - wx); out[10] = 1 - 2 * (xx + yy); out[11] = 0;
  out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
  return out;
}
