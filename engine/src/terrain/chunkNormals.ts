/**
 * Per-vertex normals of terrain geometry, computed from the REAL triangles
 * (the 4-triangle fans around the cell centres), not from a 9 × 9 height
 * gradient that would ignore the 64 centre vertices.
 *
 * For each triangle (p0, p1, p2):  faceNormal = cross(p1 − p0, p2 − p0)
 * The cross product is added to the three vertices WITHOUT being normalised
 * first: its length is twice the triangle's area, so a large triangle weighs
 * more than a tiny one. The sums are normalised once, at the end.
 *
 * WINDING: triangles are counter-clockwise seen from +z (engine convention),
 * so the cross product of an upward-facing triangle has z > 0. Nothing here
 * flips or takes an absolute value: a wrong winding shows up as z < 0.
 *
 * HOLES: a triangle removed by the hole mask is not in the index list, so it
 * contributes nothing.
 *
 * ORPHAN VERTICES: a vertex that belongs to no remaining triangle (inside a
 * hole) — or whose sum is degenerate — gets FALLBACK_NORMAL = (0, 0, 1). It is
 * never drawn; the value only keeps the vertex buffer free of zero vectors.
 *
 * CHUNK BORDERS
 *   CURRENT: normal calculation knows one chunk only. A vertex on the border
 *            only receives the faces of its own chunk, so two adjacent chunks
 *            can disagree on a shared vertex (visible seam once lit).
 *   FUTURE:  shared-border normals must account for adjacent chunks. The
 *            calculation is split in two steps for that purpose: face normals
 *            are ACCUMULATED into un-normalised sums, then NORMALISED. The
 *            faces of neighbouring chunks that touch a border vertex can be
 *            added to the sums (`extraSums`) before the final normalisation,
 *            without changing this API.
 */

export const FALLBACK_NORMAL: readonly [number, number, number] = [0, 0, 1];

/**
 * Adds the area-weighted face normal of every triangle to the sums of its
 * three vertices. `sums` holds 3 numbers per vertex and is modified in place.
 */
export function accumulateFaceNormals(sums: Float64Array, positions: ArrayLike<number>, indices: ArrayLike<number>): void {
  if (indices.length % 3 !== 0) throw new Error(`terrain: triangle index count must be a multiple of 3 (got ${indices.length})`);
  if (sums.length !== positions.length) throw new Error(`terrain: normal sums (${sums.length}) and positions (${positions.length}) must have the same length`);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t]! * 3, b = indices[t + 1]! * 3, c = indices[t + 2]! * 3;
    const e1x = positions[b]! - positions[a]!, e1y = positions[b + 1]! - positions[a + 1]!, e1z = positions[b + 2]! - positions[a + 2]!;
    const e2x = positions[c]! - positions[a]!, e2y = positions[c + 1]! - positions[a + 1]!, e2z = positions[c + 2]! - positions[a + 2]!;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) {
      sums[v]! += nx;
      sums[v + 1]! += ny;
      sums[v + 2]! += nz;
    }
  }
}

/** Turns accumulated sums into unit normals; zero or non-finite sums become FALLBACK_NORMAL. */
export function normalizeNormalSums(sums: ArrayLike<number>): Float32Array {
  const normals = new Float32Array(sums.length);
  for (let v = 0; v < sums.length; v += 3) {
    const x = sums[v]!, y = sums[v + 1]!, z = sums[v + 2]!;
    const length = Math.hypot(x, y, z);
    if (length > 0 && Number.isFinite(length)) {
      normals[v] = x / length;
      normals[v + 1] = y / length;
      normals[v + 2] = z / length;
    } else {
      normals[v] = FALLBACK_NORMAL[0];
      normals[v + 1] = FALLBACK_NORMAL[1];
      normals[v + 2] = FALLBACK_NORMAL[2];
    }
  }
  return normals;
}

export interface VertexNormalOptions {
  /**
   * Un-normalised face-normal sums coming from OUTSIDE this mesh (3 numbers per
   * vertex, same vertex order), added before normalisation. Reserved for the
   * faces of adjacent chunks around shared border vertices. Not used yet by
   * the engine: today every chunk is computed alone.
   */
  readonly extraSums?: ArrayLike<number>;
}

/** Unit normal per vertex (3 numbers each), from positions and triangle indices. */
export function computeVertexNormals(positions: ArrayLike<number>, indices: ArrayLike<number>, options: VertexNormalOptions = {}): Float32Array {
  const sums = new Float64Array(positions.length);
  accumulateFaceNormals(sums, positions, indices);
  const extra = options.extraSums;
  if (extra) {
    if (extra.length !== sums.length) throw new Error(`terrain: extraSums must hold ${sums.length} numbers (got ${extra.length})`);
    for (let k = 0; k < sums.length; k++) sums[k]! += extra[k]!;
  }
  return normalizeNormalSums(sums);
}
