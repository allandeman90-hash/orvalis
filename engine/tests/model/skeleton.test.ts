import { describe, expect, it } from 'vitest';
import {
  boneLocalMatrix, bonePivotPosition, buildTreeModel, computeBoneMatrices, NO_PARENT, REST_POSE, rotationPose, type Skeleton, SKELETON_AXIS_LENGTH, skeletonLines, skinNormal, skinPosition,
  TREE_POSES, TREE_SKELETON, validateSkeleton, validateSkinning,
} from '../../src/model';

const close = (a: ArrayLike<number>, b: ArrayLike<number>, digits = 6): void => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i]!, digits);
};
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const apply = (m: ArrayLike<number>, p: readonly [number, number, number]): number[] => [m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!, m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!, m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!];
const rad = (d: number): number => (d * Math.PI) / 180;

/** A three-bone arm along +x: shoulder at 0, elbow at 2, wrist at 3. */
const ARM: Skeleton = { bones: [{ name: 'shoulder', parent: NO_PARENT, pivot: [0, 0, 0] }, { name: 'elbow', parent: 0, pivot: [2, 0, 0] }, { name: 'wrist', parent: 1, pivot: [3, 0, 0] }] };

describe('bone local matrix: T(pivot) × T × R × S × T(−pivot) (spec §68)', () => {
  it('is the identity at rest, whatever the pivot', () => {
    close(boneLocalMatrix(new Float32Array(16), [3, -2, 7], REST_POSE), IDENTITY);
  });

  it('turns around the pivot: the pivot itself does not move', () => {
    const m = boneLocalMatrix(new Float32Array(16), [2, 0, 0], rotationPose([0, 0, 1], 90));
    close(apply(m, [2, 0, 0]), [2, 0, 0]);
    close(apply(m, [3, 0, 0]), [2, 1, 0]); // one unit beyond the pivot along x → turned to +y
    close(apply(m, [0, 0, 0]), [2, -2, 0]);
    // Without the pivot the same rotation would have turned around the origin.
    close(apply(boneLocalMatrix(new Float32Array(16), [0, 0, 0], rotationPose([0, 0, 1], 90)), [3, 0, 0]), [0, 3, 0]);
  });

  it('scales around the pivot and translates after', () => {
    const scaled = boneLocalMatrix(new Float32Array(16), [1, 1, 1], { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [2, 2, 2] });
    close(apply(scaled, [1, 1, 1]), [1, 1, 1]);
    close(apply(scaled, [2, 1, 1]), [3, 1, 1]);
    const moved = boneLocalMatrix(new Float32Array(16), [1, 1, 1], { translation: [0, 5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] });
    close(apply(moved, [1, 1, 1]), [1, 6, 1]);
    // All three: scale, then rotate, then translate (seen from the pivot).
    const all = boneLocalMatrix(new Float32Array(16), [1, 0, 0], { translation: [10, 0, 0], rotation: rotationPose([0, 0, 1], 90).rotation, scale: [2, 1, 1] });
    close(apply(all, [2, 0, 0]), [11, 2, 0]); // 1 beyond the pivot → × 2 along x → turned to +y → + (10, 0, 0)
  });

  it('normalises the quaternion and refuses nonsense', () => {
    const m = boneLocalMatrix(new Float32Array(16), [0, 0, 0], { translation: [0, 0, 0], rotation: [0, 0, 2, 2], scale: [1, 1, 1] }); // 90° around z, ×2√2
    close(apply(m, [1, 0, 0]), [0, 1, 0]);
    expect(() => boneLocalMatrix(new Float32Array(16), [0, 0, 0], { translation: [0, 0, 0], rotation: [0, 0, 0, 0], scale: [1, 1, 1] })).toThrow(/non-zero rotation/);
    expect(() => boneLocalMatrix(new Float32Array(16), [0, 0, 0], { translation: [Number.NaN, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] })).toThrow(/finite/);
    expect(() => rotationPose([0, 0, 0], 10)).toThrow(/zero vector/);
  });
});

describe('hierarchy propagation: boneWorld = parentWorld × local (spec §67)', () => {
  it('gives identity matrices at rest: the mesh stays where it was modelled', () => {
    const palette = computeBoneMatrices(ARM, []);
    expect(palette.length).toBe(48);
    for (let b = 0; b < 3; b++) close(palette.subarray(b * 16, b * 16 + 16), IDENTITY);
    const tree = buildTreeModel(), rest = computeBoneMatrices(TREE_SKELETON, TREE_POSES.rest);
    for (let v = 0; v < tree.vertexCount; v++) close(skinPosition(tree, rest, v), Array.from(tree.positions.subarray(v * 3, v * 3 + 3)));
  });

  it('carries the children along with their parent', () => {
    // Shoulder turned 90° around z: the whole arm now points along +y.
    const palette = computeBoneMatrices(ARM, [rotationPose([0, 0, 1], 90)]);
    close(bonePivotPosition(ARM, palette, 0), [0, 0, 0]);
    close(bonePivotPosition(ARM, palette, 1), [0, 2, 0]);
    close(bonePivotPosition(ARM, palette, 2), [0, 3, 0]);
    // The children were not posed: their matrices are their parent's.
    close(palette.subarray(16, 32), palette.subarray(0, 16));
    close(palette.subarray(32, 48), palette.subarray(0, 16));
  });

  it('composes rotations down the chain, each around its own carried pivot', () => {
    // Shoulder +90° and elbow +90° around z: upper arm along +y, forearm along −x.
    const palette = computeBoneMatrices(ARM, [rotationPose([0, 0, 1], 90), rotationPose([0, 0, 1], 90)]);
    close(bonePivotPosition(ARM, palette, 1), [0, 2, 0]);
    close(bonePivotPosition(ARM, palette, 2), [-1, 2, 0]);
    // A point of the hand, modelled at (4, 0, 0), i.e. 1 beyond the wrist.
    close(apply(palette.subarray(32, 48), [4, 0, 0]), [-2, 2, 0]);
    // Only the elbow bent: the shoulder's matrix stays the identity.
    const elbowOnly = computeBoneMatrices(ARM, [undefined, rotationPose([0, 0, 1], 90)]);
    close(elbowOnly.subarray(0, 16), IDENTITY);
    close(bonePivotPosition(ARM, elbowOnly, 2), [2, 1, 0]);
  });

  it('handles several roots and reuses the output array', () => {
    const two: Skeleton = { bones: [{ name: 'a', parent: NO_PARENT, pivot: [0, 0, 0] }, { name: 'b', parent: NO_PARENT, pivot: [5, 0, 0] }, { name: 'c', parent: 1, pivot: [6, 0, 0] }] };
    const out = new Float32Array(48);
    expect(computeBoneMatrices(two, [rotationPose([0, 0, 1], 180), rotationPose([0, 0, 1], 90)], out)).toBe(out);
    close(bonePivotPosition(two, out, 2), [5, 1, 0]); // carried by root b, not by root a
    expect(() => computeBoneMatrices(two, [], new Float32Array(32))).toThrow(/48 floats/);
  });

  it('refuses a skeleton whose parents do not come first', () => {
    validateSkeleton(ARM);
    validateSkeleton(TREE_SKELETON);
    expect(() => validateSkeleton({ bones: [] })).toThrow(/1\.\.256 bones/);
    expect(() => validateSkeleton({ bones: [{ name: 'a', parent: 1, pivot: [0, 0, 0] }, { name: 'b', parent: NO_PARENT, pivot: [0, 0, 0] }] })).toThrow(/bone 0 \("a"\) must come after its parent 1/);
    expect(() => validateSkeleton({ bones: [{ name: 'self', parent: 0, pivot: [0, 0, 0] }] })).toThrow(/must come after its parent/); // its own parent = a cycle
    expect(() => validateSkeleton({ bones: [{ name: 'a', parent: -2, pivot: [0, 0, 0] }] })).toThrow(/invalid parent/);
    expect(() => validateSkeleton({ bones: [{ name: 'a', parent: NO_PARENT, pivot: [0, Number.NaN, 0] }] })).toThrow(/finite pivot/);
    expect(() => validateSkinning(buildTreeModel(), ARM)).not.toThrow(); // both have 3 bones
    expect(() => validateSkinning(buildTreeModel(), { bones: ARM.bones.slice(0, 2) })).toThrow(/made for 3 bone\(s\) but the skeleton has 2/);
  });
});

describe('the tree skeleton and its test pose', () => {
  const tree = buildTreeModel();

  it('is a chain trunk → lower foliage → top, pivoting where each part starts', () => {
    expect(TREE_SKELETON.bones.map((b) => [b.name, b.parent, ...b.pivot])).toEqual([['trunk', -1, 0, 0, 0], ['lower', 0, 0, 0, 2.2], ['top', 1, 0, 0, 4]]);
    validateSkinning(tree, TREE_SKELETON);
  });

  it('bend: the lower foliage leans 20°, the top 40°, the trunk stays', () => {
    const palette = computeBoneMatrices(TREE_SKELETON, TREE_POSES.bend);
    close(palette.subarray(0, 16), IDENTITY);
    close(bonePivotPosition(TREE_SKELETON, palette, 1), [0, 0, 2.2]);
    // The top's pivot, 1.8 above the lower pivot, is swung 20° around +x: towards −y.
    close(bonePivotPosition(TREE_SKELETON, palette, 2), [0, -1.8 * Math.sin(rad(20)), 2.2 + 1.8 * Math.cos(rad(20))]);
    // The top bone's own z axis is tilted 40°.
    close(Array.from(palette.subarray(32 + 8, 32 + 11)), [0, -Math.sin(rad(40)), Math.cos(rad(40))]);
  });

  it('CPU skinning (spec §60): weighted sum of the bone matrices', () => {
    const palette = computeBoneMatrices(TREE_SKELETON, TREE_POSES.bend);
    // A trunk vertex (bone 0 only) does not move.
    close(skinPosition(tree, palette, 0), Array.from(tree.positions.subarray(0, 3)));
    // The tip of the tree: bone 2 only. Find it: z = 7, weights 255 on bone 2.
    let tip = -1, ring = -1;
    for (let v = 0; v < tree.vertexCount; v++) {
      if (tree.positions[v * 3 + 2] === 7 && tip < 0) tip = v;
      if (tree.boneWeights[v * 4] === 128 && ring < 0) ring = v;
    }
    const top = bonePivotPosition(TREE_SKELETON, palette, 2);
    close(skinPosition(tree, palette, tip), [0, top[1] - 3 * Math.sin(rad(40)), top[2] + 3 * Math.cos(rad(40))]);
    // A vertex of the upper ring: 128/255 of bone 1 and 127/255 of bone 2.
    const p = Array.from(tree.positions.subarray(ring * 3, ring * 3 + 3)) as [number, number, number];
    const by1 = apply(palette.subarray(16, 32), p), by2 = apply(palette.subarray(32, 48), p);
    close(skinPosition(tree, palette, ring), by1.map((c, k) => (128 * c + 127 * by2[k]!) / 255));
    expect(() => skinPosition(tree, palette.subarray(0, 32), tip)).toThrow(/outside the palette/);
  });
});

describe('skeleton debug lines', () => {
  it('draws a yellow link to the parent and three axes per bone', () => {
    const lines = skeletonLines(TREE_SKELETON, computeBoneMatrices(TREE_SKELETON, TREE_POSES.rest));
    // 3 bones × 3 axes + 2 links = 11 lines = 22 vertices of 6 floats.
    expect(lines.length).toBe(22 * 6);
    const segments: number[][] = [];
    for (let k = 0; k < lines.length; k += 12) segments.push(Array.from(lines.subarray(k, k + 12)));
    const yellow = segments.filter((s) => s[3] === 1 && s[4] === 1 && s[5] === 0);
    expect(yellow.map((s) => [s[0], s[1], s[2], s[6], s[7], s[8]])).toEqual([[0, 0, 0, 0, 0, Math.fround(2.2)], [0, 0, Math.fround(2.2), 0, 0, 4]]); // stored as 32-bit floats
    // Root axes at the origin: x red, y green, z blue, each SKELETON_AXIS_LENGTH long.
    close(segments[0]!, [0, 0, 0, 1, 0, 0, SKELETON_AXIS_LENGTH, 0, 0, 1, 0, 0]);
    close(segments[1]!, [0, 0, 0, 0, 1, 0, 0, SKELETON_AXIS_LENGTH, 0, 0, 1, 0]);
    close(segments[2]!, [0, 0, 0, 0, 0, 1, 0, 0, SKELETON_AXIS_LENGTH, 0, 0, 1]);
  });

  it('follows the pose', () => {
    const palette = computeBoneMatrices(TREE_SKELETON, TREE_POSES.bend);
    const lines = skeletonLines(TREE_SKELETON, palette);
    const top = bonePivotPosition(TREE_SKELETON, palette, 2);
    // Last segment = the top bone's z axis (blue), tilted 40°.
    const last = Array.from(lines.subarray(lines.length - 12));
    close(last.slice(0, 3), top);
    close(last.slice(6, 9), [0, top[1] - SKELETON_AXIS_LENGTH * Math.sin(rad(40)), top[2] + SKELETON_AXIS_LENGTH * Math.cos(rad(40))]);
    expect(last.slice(3, 6)).toEqual([0, 0, 1]);
  });
});

describe('skinNormal: the normal goes through the same blend, as a direction', () => {
  const tree = buildTreeModel();
  const length = (v: readonly number[]): number => Math.hypot(v[0]!, v[1]!, v[2]!);
  it('is the mesh normal (normalised) at rest', () => {
    const rest = computeBoneMatrices(TREE_SKELETON, TREE_POSES.rest);
    for (let v = 0; v < tree.vertexCount; v++) {
      const n = [tree.normals[v * 3]!, tree.normals[v * 3 + 1]!, tree.normals[v * 3 + 2]!], l = length(n);
      close(skinNormal(tree, rest, v), n.map((c) => c / l), 5);
    }
  });
  it('turns with the bone and ignores its translation: a downward normal on the lower foliage leans 20° in the bend pose', () => {
    const bend = computeBoneMatrices(TREE_SKELETON, TREE_POSES.bend);
    let checked = 0;
    for (let v = 0; v < tree.vertexCount; v++) {
      if (tree.normals[v * 3 + 2] !== -1 || tree.boneIndices[v * 4] !== 1 || tree.boneWeights[v * 4] !== 255) continue;
      close(skinNormal(tree, bend, v), [0, Math.sin(rad(20)), -Math.cos(rad(20))], 5);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
  it('always has length 1, also on vertices shared between two bones', () => {
    const bend = computeBoneMatrices(TREE_SKELETON, TREE_POSES.bend);
    for (let v = 0; v < tree.vertexCount; v++) expect(length(skinNormal(tree, bend, v))).toBeCloseTo(1, 6);
  });
});
