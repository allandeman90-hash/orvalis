/** 3-component vector stored as float32 (spec §5: keep world math in f32-equivalent precision). */
export type Vec3 = Float32Array;

export function create(x = 0, y = 0, z = 0): Vec3 {
  const v = new Float32Array(3);
  v[0] = x;
  v[1] = y;
  v[2] = z;
  return v;
}

export function set(out: Vec3, x: number, y: number, z: number): Vec3 {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

export function copy(out: Vec3, a: Vec3): Vec3 {
  out[0] = a[0]!;
  out[1] = a[1]!;
  out[2] = a[2]!;
  return out;
}

export function add(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out[0] = a[0]! + b[0]!;
  out[1] = a[1]! + b[1]!;
  out[2] = a[2]! + b[2]!;
  return out;
}

export function sub(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out[0] = a[0]! - b[0]!;
  out[1] = a[1]! - b[1]!;
  out[2] = a[2]! - b[2]!;
  return out;
}

export function scale(out: Vec3, a: Vec3, s: number): Vec3 {
  out[0] = a[0]! * s;
  out[1] = a[1]! * s;
  out[2] = a[2]! * s;
  return out;
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
}

/** Right-handed cross product. Safe when `out` aliases `a` or `b`. */
export function cross(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ax = a[0]!, ay = a[1]!, az = a[2]!;
  const bx = b[0]!, by = b[1]!, bz = b[2]!;
  out[0] = ay * bz - az * by;
  out[1] = az * bx - ax * bz;
  out[2] = ax * by - ay * bx;
  return out;
}

export function length(a: Vec3): number {
  return Math.hypot(a[0]!, a[1]!, a[2]!);
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

/** Normalizes `a`. A zero-length input yields the zero vector (never NaN). */
export function normalize(out: Vec3, a: Vec3): Vec3 {
  const len = length(a);
  if (len === 0) return set(out, 0, 0, 0);
  return scale(out, a, 1 / len);
}

export function lerp(out: Vec3, a: Vec3, b: Vec3, t: number): Vec3 {
  out[0] = a[0]! + (b[0]! - a[0]!) * t;
  out[1] = a[1]! + (b[1]! - a[1]!) * t;
  out[2] = a[2]! + (b[2]! - a[2]!) * t;
  return out;
}
