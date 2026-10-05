import { mat4, type Mat4, quat, vec3 } from '../math';
import type { ModelMesh } from './modelMesh';

/**
 * Skeleton of a model (spec §33, §67, §68).
 *
 * FROM THE SPEC:
 * - each bone has a parent (or none: a root) and a PIVOT;
 * - a bone's transform is built around its pivot:   T(pivot) × animatedTransform × T(−pivot);
 * - transforms are parent-relative and propagated:  boneWorld = parentWorld × localBone;
 *   a root uses the model's own base transform (here: identity — the model matrix is applied later);
 * - one 4 × 4 matrix per bone goes into the matrix palette (§37).
 * A consequence of the pivot scheme: with every bone at rest (no translation, no rotation, scale 1) every
 * matrix is the identity, so the vertices stay where the mesh put them — there is no inverse bind matrix.
 *
 * OUR CHOICES (the document does not settle them):
 * - a root is marked parent −1 (the original file uses 0xFFFF);
 * - a parent must come BEFORE its children in the list, so one pass propagates the whole hierarchy and a
 *   cycle cannot be written;
 * - animatedTransform = translation × rotation × scale, in that order;
 * - at most 256 bones (a vertex stores bone indices in one byte).
 *
 * BILLBOARD BONES (spec §88) — FROM THE SPEC: billboarding is done at the bone-matrix level; a bone is either
 * normal, a spherical billboard, or a cylindrical billboard with one of its three local axes locked; a model can
 * mix normal and camera-facing parts on one skeleton.
 * OUR CHOICES: which way a billboard faces — its local +x goes to the camera's right, +z to the camera's up and
 * −y towards the viewer (the engine's own « z up, y forward »); a cylindrical billboard keeps its locked axis
 * where the hierarchy put it and turns around it; the bone keeps its pivot position and its (uniform) scale,
 * only its orientation is replaced; its children inherit the result. The original stores the kind in flag bits
 * (0x08, 0x10, 0x18, 0x20) without saying which value locks which axis: here the kind is named.
 */
export type BoneBillboard = 'spherical' | 'cylindricalX' | 'cylindricalY' | 'cylindricalZ';

/** The camera's axes as unit vectors, in the space the bone matrices live in (the model's). */
export interface BillboardCamera {
  readonly right: readonly [number, number, number];
  readonly up: readonly [number, number, number];
  /** From the camera into the scene. */
  readonly forward: readonly [number, number, number];
}
export interface Bone {
  readonly name: string;
  /** Index of the parent bone, or −1 for a root. */
  readonly parent: number;
  /** Point the bone turns and scales around, in model space. */
  readonly pivot: readonly [number, number, number];
  /** Absent: a normal bone. */
  readonly billboard?: BoneBillboard | undefined;
}

export interface Skeleton {
  readonly bones: readonly Bone[];
}

export const NO_PARENT = -1;
export const MAX_BONES = 256;

/** The animated part of one bone. At rest: no translation, identity rotation, scale 1. */
export interface BonePose {
  readonly translation: readonly [number, number, number];
  /** Unit quaternion x, y, z, w. */
  readonly rotation: readonly [number, number, number, number];
  readonly scale: readonly [number, number, number];
}

export const REST_POSE: BonePose = { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };

export function validateSkeleton(skeleton: Skeleton): void {
  const n = skeleton.bones.length;
  if (n < 1 || n > MAX_BONES) throw new Error(`skeleton: a skeleton has 1..${MAX_BONES} bones (got ${n})`);
  skeleton.bones.forEach((bone, index) => {
    if (!Number.isInteger(bone.parent) || bone.parent < NO_PARENT) throw new Error(`skeleton: bone ${index} ("${bone.name}") has an invalid parent ${bone.parent}`);
    if (bone.parent >= index) throw new Error(`skeleton: bone ${index} ("${bone.name}") must come after its parent ${bone.parent}`);
    if (bone.pivot.length !== 3 || !bone.pivot.every(Number.isFinite)) throw new Error(`skeleton: bone ${index} ("${bone.name}") needs a finite pivot`);
    if (bone.billboard !== undefined && !['spherical', 'cylindricalX', 'cylindricalY', 'cylindricalZ'].includes(bone.billboard)) throw new Error(`skeleton: bone ${index} ("${bone.name}") has an unknown billboard kind "${String(bone.billboard)}"`);
  });
}

/** A mesh and the skeleton its bone indices refer to. */
export function validateSkinning(mesh: ModelMesh, skeleton: Skeleton): void {
  validateSkeleton(skeleton);
  if (mesh.boneCount !== skeleton.bones.length) throw new Error(`model "${mesh.name}": the mesh is made for ${mesh.boneCount} bone(s) but the skeleton has ${skeleton.bones.length}`);
}

const scratchA = mat4.create(), scratchB = mat4.create(), scratchQ = quat.create();
const scratchV = vec3.create();

/** T(pivot) × T(translation) × R(rotation) × S(scale) × T(−pivot), column-major. */
export function boneLocalMatrix(out: Mat4, pivot: readonly [number, number, number], pose: BonePose): Mat4 {
  const q = pose.rotation, length = Math.hypot(q[0], q[1], q[2], q[3]);
  if (!(length > 0) || ![...pose.translation, ...q, ...pose.scale].every(Number.isFinite)) throw new Error('skeleton: a pose needs finite values and a non-zero rotation quaternion');
  // out = T(pivot + translation)
  mat4.fromTranslation(out, vec3.set(scratchV, pivot[0] + pose.translation[0], pivot[1] + pose.translation[1], pivot[2] + pose.translation[2]));
  quat.set(scratchQ, q[0] / length, q[1] / length, q[2] / length, q[3] / length);
  mat4.multiply(out, out, quat.toMat4(scratchA, scratchQ));
  mat4.multiply(out, out, mat4.fromScaling(scratchA, vec3.set(scratchV, pose.scale[0], pose.scale[1], pose.scale[2])));
  return mat4.multiply(out, out, mat4.fromTranslation(scratchA, vec3.set(scratchV, -pivot[0], -pivot[1], -pivot[2])));
}

/**
 * The matrix palette: one model-space matrix per bone, 16 floats each, bone after bone.
 * @param poses one pose per bone; a missing entry means « at rest »
 * @param out reused when given (it must hold 16 × bones floats)
 * @param camera needed when the skeleton has billboard bones
 */
export function computeBoneMatrices(skeleton: Skeleton, poses: ReadonlyArray<BonePose | undefined>, out: Float32Array = new Float32Array(skeleton.bones.length * 16), camera?: BillboardCamera): Float32Array {
  const n = skeleton.bones.length;
  if (out.length !== n * 16) throw new Error(`skeleton: the palette must hold ${n * 16} floats (got ${out.length})`);
  for (let index = 0; index < n; index++) {
    const bone = skeleton.bones[index]!;
    const world = out.subarray(index * 16, index * 16 + 16);
    boneLocalMatrix(scratchB, bone.pivot, poses[index] ?? REST_POSE);
    if (bone.parent === NO_PARENT) world.set(scratchB);
    else {
      if (bone.parent >= index || bone.parent < 0) throw new Error(`skeleton: bone ${index} must come after its parent ${bone.parent}`);
      mat4.multiply(world, out.subarray(bone.parent * 16, bone.parent * 16 + 16), scratchB);
    }
    if (bone.billboard !== undefined) {
      if (!camera) throw new Error(`skeleton: bone ${index} ("${bone.name}") is a billboard: a camera is needed`);
      faceCamera(world, bone.pivot, bone.billboard, camera);
    }
  }
  return out;
}

type V3 = readonly [number, number, number];
const cross = (a: V3, b: V3): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** `v` without its part along the unit vector `axis`, normalised; `fallback` when nothing is left. */
function perpendicular(v: V3, axis: V3, fallback: V3): V3 {
  const d = v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2];
  const r: V3 = [v[0] - d * axis[0], v[1] - d * axis[1], v[2] - d * axis[2]], length = Math.hypot(r[0], r[1], r[2]);
  return length > 1e-6 ? [r[0] / length, r[1] / length, r[2] / length] : fallback;
}

/** Replaces the orientation of a bone matrix by a camera-facing one, keeping where its pivot is and its scale. */
function faceCamera(world: Float32Array, pivot: V3, kind: BoneBillboard, camera: BillboardCamera): void {
  const at: V3 = [world[0]! * pivot[0] + world[4]! * pivot[1] + world[8]! * pivot[2] + world[12]!, world[1]! * pivot[0] + world[5]! * pivot[1] + world[9]! * pivot[2] + world[13]!, world[2]! * pivot[0] + world[6]! * pivot[1] + world[10]! * pivot[2] + world[14]!];
  const scale = Math.hypot(world[0]!, world[1]!, world[2]!) || 1;
  const axis = (k: number): V3 => {
    const length = Math.hypot(world[k * 4]!, world[k * 4 + 1]!, world[k * 4 + 2]!) || 1;
    return [world[k * 4]! / length, world[k * 4 + 1]! / length, world[k * 4 + 2]! / length];
  };
  let x: V3, y: V3, z: V3;
  if (kind === 'spherical') {
    x = camera.right; y = camera.forward; z = camera.up;
  } else if (kind === 'cylindricalZ') {
    z = axis(2); y = perpendicular(camera.forward, z, axis(1)); x = cross(y, z);
  } else if (kind === 'cylindricalX') {
    x = axis(0); y = perpendicular(camera.forward, x, axis(1)); z = cross(x, y);
  } else {
    y = axis(1); z = perpendicular(camera.up, y, axis(2)); x = cross(y, z);
  }
  for (let k = 0; k < 3; k++) {
    world[k] = x[k]! * scale; world[4 + k] = y[k]! * scale; world[8 + k] = z[k]! * scale;
    world[3 + k * 4] = 0;
  }
  // T(at) × R·s × T(−pivot)
  for (let k = 0; k < 3; k++) world[12 + k] = at[k]! - (world[k]! * pivot[0] + world[4 + k]! * pivot[1] + world[8 + k]! * pivot[2]);
  world[15] = 1;
}

/**
 * The camera axes seen from inside a model: the world-space axes taken back through the rotation of `modelMatrix`
 * (a rotation, a translation and a UNIFORM scale).
 */
export function billboardCameraIn(modelMatrix: ArrayLike<number>, right: V3, up: V3, forward: V3): BillboardCamera {
  const back = (v: V3): [number, number, number] => {
    const out: [number, number, number] = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const length = Math.hypot(modelMatrix[k * 4]!, modelMatrix[k * 4 + 1]!, modelMatrix[k * 4 + 2]!) || 1;
      out[k] = (modelMatrix[k * 4]! * v[0] + modelMatrix[k * 4 + 1]! * v[1] + modelMatrix[k * 4 + 2]! * v[2]) / length;
    }
    return out;
  };
  return { right: back(right), up: back(up), forward: back(forward) };
}

/** Where a bone's pivot is once the skeleton is posed: its matrix applied to its own pivot. */
export function bonePivotPosition(skeleton: Skeleton, matrices: Float32Array, bone: number): [number, number, number] {
  const p = skeleton.bones[bone]?.pivot;
  if (!p) throw new Error(`skeleton: no bone ${bone}`);
  const m = matrices.subarray(bone * 16, bone * 16 + 16);
  return [m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!, m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!, m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!];
}

/**
 * Linear blend skinning of one vertex position, on the CPU (spec §60):
 *     skinned = Σ boneMatrix[index_i] × position × weight_i        (weights are bytes: ÷ 255)
 * The reference the GPU version (P4.5) will be checked against.
 */
export function skinPosition(mesh: ModelMesh, matrices: Float32Array, vertex: number): [number, number, number] {
  const x = mesh.positions[vertex * 3]!, y = mesh.positions[vertex * 3 + 1]!, z = mesh.positions[vertex * 3 + 2]!;
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 4; k++) {
    const weight = mesh.boneWeights[vertex * 4 + k]! / 255;
    if (weight === 0) continue;
    const m = mesh.boneIndices[vertex * 4 + k]! * 16;
    if (m + 16 > matrices.length) throw new Error(`skeleton: vertex ${vertex} refers to a bone outside the palette`);
    out[0] += weight * (matrices[m]! * x + matrices[m + 4]! * y + matrices[m + 8]! * z + matrices[m + 12]!);
    out[1] += weight * (matrices[m + 1]! * x + matrices[m + 5]! * y + matrices[m + 9]! * z + matrices[m + 13]!);
    out[2] += weight * (matrices[m + 2]! * x + matrices[m + 6]! * y + matrices[m + 10]! * z + matrices[m + 14]!);
  }
  return out;
}

/**
 * The same blend for a vertex normal, as a direction, re-normalised — what the GPU does.
 * Correct while every bone matrix is a rotation, a translation and a uniform scale.
 */
export function skinNormal(mesh: ModelMesh, matrices: Float32Array, vertex: number): [number, number, number] {
  const x = mesh.normals[vertex * 3]!, y = mesh.normals[vertex * 3 + 1]!, z = mesh.normals[vertex * 3 + 2]!;
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 4; k++) {
    const weight = mesh.boneWeights[vertex * 4 + k]! / 255;
    if (weight === 0) continue;
    const m = mesh.boneIndices[vertex * 4 + k]! * 16;
    if (m + 16 > matrices.length) throw new Error(`skeleton: vertex ${vertex} refers to a bone outside the palette`);
    out[0] += weight * (matrices[m]! * x + matrices[m + 4]! * y + matrices[m + 8]! * z);
    out[1] += weight * (matrices[m + 1]! * x + matrices[m + 5]! * y + matrices[m + 9]! * z);
    out[2] += weight * (matrices[m + 2]! * x + matrices[m + 6]! * y + matrices[m + 10]! * z);
  }
  const length = Math.hypot(out[0], out[1], out[2]) || 1;
  return [out[0] / length, out[1] / length, out[2] / length];
}

/** A rotation of `degrees` around a unit axis, as a pose (no translation, scale 1). */
export function rotationPose(axis: readonly [number, number, number], degrees: number): BonePose {
  const length = Math.hypot(axis[0], axis[1], axis[2]);
  if (!(length > 0)) throw new Error('skeleton: a rotation axis must not be the zero vector');
  const half = (degrees * Math.PI) / 360, s = Math.sin(half) / length;
  return { translation: [0, 0, 0], rotation: [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)], scale: [1, 1, 1] };
}

export const SKELETON_LINK_COLOUR = [1, 1, 0] as const;
/** Length of the three little axes drawn at each bone, in model units. */
export const SKELETON_AXIS_LENGTH = 0.4;

/**
 * Debug picture of a posed skeleton, as line segments (position xyz + colour rgb per vertex, 2 vertices per line):
 * a yellow link from each bone's pivot to its parent's, and at every pivot the bone's own x, y, z axes in red,
 * green and blue.
 */
export function skeletonLines(skeleton: Skeleton, matrices: Float32Array): Float32Array {
  const out: number[] = [];
  const line = (a: readonly number[], b: readonly number[], colour: readonly number[]): void => {
    out.push(a[0]!, a[1]!, a[2]!, colour[0]!, colour[1]!, colour[2]!, b[0]!, b[1]!, b[2]!, colour[0]!, colour[1]!, colour[2]!);
  };
  skeleton.bones.forEach((bone, index) => {
    const at = bonePivotPosition(skeleton, matrices, index);
    if (bone.parent !== NO_PARENT) line(bonePivotPosition(skeleton, matrices, bone.parent), at, SKELETON_LINK_COLOUR);
    const m = matrices.subarray(index * 16, index * 16 + 16);
    for (let axis = 0; axis < 3; axis++) {
      const d = [m[axis * 4]!, m[axis * 4 + 1]!, m[axis * 4 + 2]!], length = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
      const colour = [axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0];
      line(at, [at[0] + (d[0]! / length) * SKELETON_AXIS_LENGTH, at[1] + (d[1]! / length) * SKELETON_AXIS_LENGTH, at[2] + (d[2]! / length) * SKELETON_AXIS_LENGTH], colour);
    }
  });
  return new Float32Array(out);
}
