import { describe, expect, it } from 'vitest';
import {
  type Attachment, ATTACHMENT_ID, attachmentMatrix, type BillboardCamera, billboardCameraIn, buildOrnamentModel, computeBoneMatrices, findAttachment, NO_PARENT, ORNAMENT_SKELETON, rotationPose,
  type Skeleton, TREE_ATTACHMENTS, TREE_POSES, TREE_SKELETON, validateAttachments, validateSkeleton, validateSkinning,
} from '../../src/model';

const close = (a: ArrayLike<number>, b: ArrayLike<number>, digits = 5): void => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i]!, digits);
};
const apply = (m: ArrayLike<number>, p: readonly number[], w = 1): number[] => [m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]! * w, m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]! * w, m[2]! * p[0]! + m[6]! * p[1]! + m[10]! * p[2]! + m[14]! * w];
const bone = (palette: Float32Array, index: number): Float32Array => palette.subarray(index * 16, index * 16 + 16);

describe('attachments (spec §70)', () => {
  const top = findAttachment(TREE_ATTACHMENTS, ATTACHMENT_ID.top);

  it('the tree has a « top » socket on its top bone, above the tip', () => {
    expect(top).toMatchObject({ name: 'top', bone: 2, position: [0, 0, 7.3] });
    expect(() => validateAttachments(TREE_ATTACHMENTS, TREE_SKELETON.bones.length)).not.toThrow();
  });

  it('at rest the socket matrix is a plain translation to the socket', () => {
    const m = attachmentMatrix(new Float32Array(16), top, computeBoneMatrices(TREE_SKELETON, TREE_POSES.rest));
    close(m, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 7.3, 1]);
  });

  it('the socket moves and TURNS with its bone', () => {
    const palette = computeBoneMatrices(TREE_SKELETON, TREE_POSES.bend);
    const m = attachmentMatrix(new Float32Array(16), top, palette);
    close(apply(m, [0, 0, 0]), apply(bone(palette, 2), top.position));
    // The top bone has turned 40° in all around +x: the child's +z leans by as much.
    close(apply(m, [0, 0, 1], 0), [0, -Math.sin((40 * Math.PI) / 180), Math.cos((40 * Math.PI) / 180)]);
  });

  it('rejects a duplicate id, a bone outside the skeleton, an unknown id', () => {
    const a: Attachment = { id: 4, name: 'a', bone: 0, position: [0, 0, 0] };
    expect(() => validateAttachments([a, { ...a, name: 'b' }], 1)).toThrow(/id 4 is used twice/);
    expect(() => validateAttachments([{ ...a, bone: 3 }], 3)).toThrow(/bone 3 but the model has 3/);
    expect(() => findAttachment(TREE_ATTACHMENTS, 99)).toThrow(/no attachment with id 99/);
    expect(() => attachmentMatrix(new Float32Array(16), { ...a, bone: 5 }, new Float32Array(16))).toThrow(/outside the palette/);
  });
});

describe('billboard bones (spec §88)', () => {
  // A camera looking along +x from the west, level: right = −y, up = +z.
  const WEST: BillboardCamera = { right: [0, -1, 0], up: [0, 0, 1], forward: [1, 0, 0] };
  // A camera looking down and north-east.
  const f = [1, 1, -1].map((c) => c / Math.sqrt(3)) as [number, number, number];
  const r = [1, -1, 0].map((c) => c / Math.sqrt(2)) as [number, number, number];
  const TILTED: BillboardCamera = { right: r, up: [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]], forward: f };
  const chain = (billboard: NonNullable<Skeleton['bones'][number]['billboard']>): Skeleton => ({ bones: [{ name: 'arm', parent: NO_PARENT, pivot: [0, 0, 0] }, { name: 'card', parent: 0, pivot: [0, 0, 2], billboard }, { name: 'child', parent: 1, pivot: [0, 0, 3] }] });
  // The parent leans 30° around +x and is 1.5 × bigger.
  const leaning = [{ ...rotationPose([1, 0, 0], 30), scale: [1.5, 1.5, 1.5] as const }];
  const axes = (m: ArrayLike<number>): number[][] => [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((v) => apply(m, v, 0));
  const unit = (v: number[]): number[] => { const l = Math.hypot(...v); return v.map((c) => c / l); };

  it('spherical: local x → camera right, z → camera up, y → view direction (the −y face looks at the viewer)', () => {
    for (const camera of [WEST, TILTED]) {
      const palette = computeBoneMatrices(chain('spherical'), leaning, undefined, camera);
      const [x, y, z] = axes(bone(palette, 1));
      close(unit(x!), camera.right);
      close(unit(y!), camera.forward);
      close(unit(z!), camera.up);
    }
  });

  it('keeps the pivot where the hierarchy put it, and the scale', () => {
    const plain = computeBoneMatrices({ bones: chain('spherical').bones.map(({ billboard: _, ...rest }) => rest) }, leaning);
    const palette = computeBoneMatrices(chain('spherical'), leaning, undefined, TILTED);
    close(apply(bone(palette, 1), [0, 0, 2]), apply(bone(plain, 1), [0, 0, 2]));
    for (const axis of axes(bone(palette, 1))) expect(Math.hypot(...axis)).toBeCloseTo(1.5, 5);
  });

  it('children inherit the camera-facing orientation', () => {
    const palette = computeBoneMatrices(chain('spherical'), leaning, undefined, TILTED);
    close(bone(palette, 2), bone(palette, 1));
  });

  it('does not touch bones that are not billboards', () => {
    const palette = computeBoneMatrices(chain('spherical'), leaning, undefined, TILTED);
    close(bone(palette, 0), bone(computeBoneMatrices(chain('spherical'), leaning, undefined, WEST), 0));
    close(unit(apply(bone(palette, 0), [0, 0, 1], 0)), [0, -0.5, Math.sqrt(3) / 2]);
  });

  it.each([['cylindricalX', 0], ['cylindricalY', 1], ['cylindricalZ', 2]] as const)('%s: the locked axis stays where the hierarchy put it; the basis stays right-handed and orthonormal', (kind, locked) => {
    const plain = computeBoneMatrices({ bones: chain(kind).bones.map(({ billboard: _, ...rest }) => rest) }, leaning);
    const palette = computeBoneMatrices(chain(kind), leaning, undefined, TILTED);
    const now = axes(bone(palette, 1)).map(unit), before = axes(bone(plain, 1)).map(unit);
    close(now[locked]!, before[locked]!);
    const [x, y, z] = now;
    close([x![1]! * y![2]! - x![2]! * y![1]!, x![2]! * y![0]! - x![0]! * y![2]!, x![0]! * y![1]! - x![1]! * y![0]!], z!);
    expect(x![0]! * y![0]! + x![1]! * y![1]! + x![2]! * y![2]!).toBeCloseTo(0, 5);
  });

  it('cylindricalZ turns around its z so that its −y face looks at the viewer as much as it can', () => {
    // Upright bone, camera from the west: y must be the view direction (+x), x = y × z = −y axis.
    const upright = computeBoneMatrices(chain('cylindricalZ'), [], undefined, WEST);
    const [x, y, z] = axes(bone(upright, 1));
    close(y!, [1, 0, 0]);
    close(z!, [0, 0, 1]);
    close(x!, [0, -1, 0]);
    // Tilted camera: y is the view direction flattened onto the horizontal plane.
    const flat = axes(bone(computeBoneMatrices(chain('cylindricalZ'), [], undefined, TILTED), 1));
    close(flat[1]!, [Math.SQRT1_2, Math.SQRT1_2, 0]);
  });

  it('needs a camera, and rejects an unknown kind', () => {
    expect(() => computeBoneMatrices(chain('spherical'), [])).toThrow(/is a billboard: a camera is needed/);
    expect(() => validateSkeleton(chain('conical' as never))).toThrow(/unknown billboard kind/);
  });

  it('billboardCameraIn takes the camera axes back through a model matrix (rotation and uniform scale)', () => {
    // Model turned 90° counter-clockwise around z and doubled: its +x is the world's +y.
    const model = [0, 2, 0, 0, -2, 0, 0, 0, 0, 0, 2, 0, 5, 6, 7, 1];
    const inside = billboardCameraIn(model, [0, 1, 0], [0, 0, 1], [-1, 0, 0]);
    close(inside.right, [1, 0, 0]);
    close(inside.up, [0, 0, 1]);
    close(inside.forward, [0, 1, 0]);
  });

  it('the ornament fixture is a card on a spherical billboard bone', () => {
    const mesh = buildOrnamentModel();
    expect(() => validateSkinning(mesh, ORNAMENT_SKELETON)).not.toThrow();
    expect(ORNAMENT_SKELETON.bones[1]).toMatchObject({ billboard: 'spherical' });
    expect(Array.from(mesh.boneIndices.filter((_, k) => k % 4 === 0))).toEqual([1, 1, 1, 1]);
  });
});
