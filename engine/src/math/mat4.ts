import type { Vec3 } from './vec3';

/**
 * 4×4 matrix, column-major (element [col*4 + row]), column vectors, right-handed.
 * Same memory layout WebGL2 and WebGPU expect for uniform upload.
 */
export type Mat4 = Float32Array;

export function create(): Mat4 {
  return identity(new Float32Array(16));
}

export function identity(out: Mat4): Mat4 {
  out.fill(0);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

export function copy(out: Mat4, a: Mat4): Mat4 {
  out.set(a);
  return out;
}

/** out = a × b (b is applied first). Safe when `out` aliases `a` or `b`. */
export function multiply(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  const a00 = a[0]!, a01 = a[1]!, a02 = a[2]!, a03 = a[3]!;
  const a10 = a[4]!, a11 = a[5]!, a12 = a[6]!, a13 = a[7]!;
  const a20 = a[8]!, a21 = a[9]!, a22 = a[10]!, a23 = a[11]!;
  const a30 = a[12]!, a31 = a[13]!, a32 = a[14]!, a33 = a[15]!;
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4]!, b1 = b[c * 4 + 1]!, b2 = b[c * 4 + 2]!, b3 = b[c * 4 + 3]!;
    out[c * 4] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
    out[c * 4 + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
    out[c * 4 + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
    out[c * 4 + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
  }
  return out;
}

export function fromTranslation(out: Mat4, v: Vec3): Mat4 {
  identity(out);
  out[12] = v[0]!;
  out[13] = v[1]!;
  out[14] = v[2]!;
  return out;
}

export function fromScaling(out: Mat4, v: Vec3): Mat4 {
  identity(out);
  out[0] = v[0]!;
  out[5] = v[1]!;
  out[10] = v[2]!;
  return out;
}

/** Depth convention of the target clip space. */
export const enum DepthRange {
  /** WebGL2 / OpenGL: NDC z in [-1, 1]. */
  NegOneToOne = 0,
  /** WebGPU: NDC z in [0, 1]. */
  ZeroToOne = 1,
}

/**
 * Right-handed perspective projection looking down -Z in view space.
 * @param fovY vertical field of view in radians
 */
export function perspective(
  out: Mat4,
  fovY: number,
  aspect: number,
  near: number,
  far: number,
  depth: DepthRange,
): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[11] = -1;
  const nf = 1 / (near - far);
  if (depth === DepthRange.ZeroToOne) {
    out[10] = far * nf;
    out[14] = far * near * nf;
  } else {
    out[10] = (far + near) * nf;
    out[14] = 2 * far * near * nf;
  }
  return out;
}

/** Right-handed view matrix. `up` must not be parallel to (target - eye). */
export function lookAt(out: Mat4, eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const ex = eye[0]!, ey = eye[1]!, ez = eye[2]!;
  // z axis points from target to eye (camera looks down -z)
  let zx = ex - target[0]!, zy = ey - target[1]!, zz = ez - target[2]!;
  let len = Math.hypot(zx, zy, zz);
  if (len === 0) return identity(out);
  zx /= len; zy /= len; zz /= len;
  // x = up × z
  let xx = up[1]! * zz - up[2]! * zy;
  let xy = up[2]! * zx - up[0]! * zz;
  let xz = up[0]! * zy - up[1]! * zx;
  len = Math.hypot(xx, xy, xz);
  if (len === 0) return identity(out);
  xx /= len; xy /= len; xz /= len;
  // y = z × x
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * ex + xy * ey + xz * ez);
  out[13] = -(yx * ex + yy * ey + yz * ez);
  out[14] = -(zx * ex + zy * ey + zz * ez);
  out[15] = 1;
  return out;
}

/** General inverse. Returns null (and leaves `out` untouched) for a singular matrix. */
export function invert(out: Mat4, a: Mat4): Mat4 | null {
  const a00 = a[0]!, a01 = a[1]!, a02 = a[2]!, a03 = a[3]!;
  const a10 = a[4]!, a11 = a[5]!, a12 = a[6]!, a13 = a[7]!;
  const a20 = a[8]!, a21 = a[9]!, a22 = a[10]!, a23 = a[11]!;
  const a30 = a[12]!, a31 = a[13]!, a32 = a[14]!, a33 = a[15]!;
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (det === 0 || !Number.isFinite(det)) return null;
  const inv = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * inv;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * inv;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * inv;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * inv;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * inv;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * inv;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * inv;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * inv;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * inv;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * inv;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * inv;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * inv;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * inv;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * inv;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * inv;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * inv;
  return out;
}

/** Transforms a point (w = 1) and performs the perspective divide. */
export function transformPoint(out: Vec3, m: Mat4, p: Vec3): Vec3 {
  const x = p[0]!, y = p[1]!, z = p[2]!;
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
  const iw = w === 0 ? 1 : 1 / w;
  out[0] = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) * iw;
  out[1] = (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) * iw;
  out[2] = (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) * iw;
  return out;
}

/** Transforms a direction (w = 0): rotation/scale only, no translation. */
export function transformDirection(out: Vec3, m: Mat4, d: Vec3): Vec3 {
  const x = d[0]!, y = d[1]!, z = d[2]!;
  out[0] = m[0]! * x + m[4]! * y + m[8]! * z;
  out[1] = m[1]! * x + m[5]! * y + m[9]! * z;
  out[2] = m[2]! * x + m[6]! * y + m[10]! * z;
  return out;
}
