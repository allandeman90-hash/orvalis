import { describe, expect, it } from 'vitest';
import {
  BODY_GEOSET, buildMannequinModel, CHARACTER_REGIONS, CHARACTER_TEXTURE_SIZE, loftTriangleCount, characterGeosetSelection, GEOSET_GROUP, geosetGroup, geosetId, geosetVariant, geosetVariantsOf, hiddenGeosetsOf, MANNEQUIN_BONE, MANNEQUIN_COLOURS,
  MANNEQUIN_SECTIONS, MANNEQUIN_SKELETON, mannequinTexture, visibleGeosets,
} from '../../src/character';
import { formatOverlay } from '../../src/debug';
import { computeBoneMatrices, modelBounds, modelSubmeshes, validateSkinning } from '../../src/model';
import { NullBackend } from '../../src/renderer';
import { createModelScene } from '../../src/scenes/modelScene';
import { parseSceneRequest } from '../../src/scenes/select';

describe('geoset ids: group × 100 + variant (spec §55)', () => {
  it('the first variant of the 16 groups gives the recovered bases 1, 101, 201 … 1501', () => {
    expect(Array.from({ length: 16 }, (_, group) => geosetId(group, 1))).toEqual([1, 0x65, 0xc9, 0x12d, 0x191, 0x1f5, 0x259, 701, 0x321, 0x385, 0x3e9, 0x44d, 0x4b1, 0x515, 0x579, 0x5dd]);
  });
  it('splits an id back into group and variant', () => {
    expect([geosetGroup(402), geosetVariant(402)]).toEqual([4, 2]);
    expect([geosetGroup(3), geosetVariant(3)]).toEqual([0, 3]);
    expect([geosetGroup(1501), geosetVariant(1501)]).toEqual([15, 1]);
  });
  it('rejects a group or a variant out of range', () => {
    expect(() => geosetId(16, 1)).toThrow(/group must be 0..15/);
    expect(() => geosetId(0, 0)).toThrow(/variant must be 1..99/);
    expect(() => geosetId(0, 100)).toThrow(/variant/);
  });
});

describe('geoset selection (spec §55: disable all, enable baselines, apply choices, commit)', () => {
  it('with no choice: the body and variant 1 of every group', () => {
    const visible = visibleGeosets();
    expect(visible.size).toBe(17);
    expect(visible.has(BODY_GEOSET)).toBe(true);
    for (let group = 0; group < 16; group++) expect(visible.has(group * 100 + 1)).toBe(true);
  });
  it('a choice replaces the baseline of its group and of that group only', () => {
    const visible = visibleGeosets({ [GEOSET_GROUP.hair]: 3, [GEOSET_GROUP.boots]: 2 });
    expect([visible.has(3), visible.has(1), visible.has(502), visible.has(501), visible.has(401), visible.has(0)]).toEqual([true, false, true, false, true, true]);
  });
  it('appearance and equipment become a selection', () => {
    expect(characterGeosetSelection({ hairStyle: 2, facialHair: 2 }, { gloves: 2, boots: 1 })).toEqual({ 0: 2, 1: 2, 4: 2, 5: 1 });
    expect(characterGeosetSelection()).toEqual({ 0: 1, 1: 1, 4: 1, 5: 1 });
  });
  it('rejects an unknown group', () => {
    expect(() => visibleGeosets({ 20: 1 })).toThrow(/unknown group 20/);
  });
});

describe('the mannequin (original base model)', () => {
  const mesh = buildMannequinModel();
  const idsOf = (hidden: Set<number>): number[] => [...hidden].sort((a, b) => a - b);

  it('is a valid skinned mesh for its 16-bone skeleton, about 1.8 tall, standing on z = 0, facing +y', () => {
    expect(() => validateSkinning(mesh, MANNEQUIN_SKELETON)).not.toThrow();
    expect(MANNEQUIN_SKELETON.bones).toHaveLength(16);
    const bounds = modelBounds(mesh);
    expect(bounds.min[2]).toBeCloseTo(0, 6);
    expect(bounds.max[2]).toBeGreaterThan(1.8);
    expect(bounds.max[2]).toBeLessThan(1.97);
    // Toes point to +y: the feet reach further forward than back.
    expect(bounds.max[1]).toBeGreaterThan(-bounds.min[1]);
    // Symmetric left / right.
    expect(bounds.min[0]).toBeCloseTo(-bounds.max[0], 6);
  });

  it('every bone has a parent before it and the two sides mirror each other', () => {
    const B = MANNEQUIN_BONE, bones = MANNEQUIN_SKELETON.bones;
    for (const [left, right] of [[B.leftUpperArm, B.rightUpperArm], [B.leftForearm, B.rightForearm], [B.leftHand, B.rightHand], [B.leftThigh, B.rightThigh], [B.leftShin, B.rightShin], [B.leftFoot, B.rightFoot]] as const) {
      expect(bones[left]!.pivot).toEqual([-bones[right]!.pivot[0], bones[right]!.pivot[1], bones[right]!.pivot[2]]);
      expect(bones[left]!.pivot[0]).toBeLessThan(0); // left is −x when facing +y
    }
    expect(Array.from(computeBoneMatrices(MANNEQUIN_SKELETON, []).subarray(0, 16))).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('has one submesh per section, made of its lofts', () => {
    const submeshes = modelSubmeshes(mesh);
    expect(submeshes.map((s) => s.geosetId)).toEqual([0, 1, 2, 3, 102, 401, 402, 501, 502]);
    expect(submeshes.map((s) => s.indexCount / 3)).toEqual(MANNEQUIN_SECTIONS.map((section) => section.lofts.reduce((sum, loft) => sum + loftTriangleCount(loft), 0)));
    // A low-poly body, in the spirit of the reference: a few hundred triangles.
    expect(submeshes[0]!.indexCount / 3).toBe(856);
    expect(mesh.indices.length / 3).toBeLessThan(2000);
  });

  it('is rounded: no part of the body is a box — every loft has at least 6 sides and its side normals vary all around', () => {
    for (const section of MANNEQUIN_SECTIONS) for (const loft of section.lofts) expect(loft.sides).toBeGreaterThanOrEqual(6);
    // Around the chest, the normals of the side surface point in at least 10 different horizontal directions.
    const directions = new Set<string>();
    for (let v = 0; v < mesh.vertexCount; v++) {
      if (Math.abs(mesh.positions[v * 3 + 2]! - 1.34) > 1e-6 || Math.abs(mesh.normals[v * 3 + 2]!) > 0.6) continue;
      directions.add(`${Math.round(Math.atan2(mesh.normals[v * 3 + 1]!, mesh.normals[v * 3]!) * 20)}`);
    }
    expect(directions.size).toBeGreaterThanOrEqual(10);
  });

  it('joints are shared between two bones: waist, neck, elbows and knees bend smoothly', () => {
    const B = MANNEQUIN_BONE;
    const sharedAt = (z: number, a: number, b: number): number => {
      let n = 0;
      for (let v = 0; v < mesh.vertexCount; v++) {
        if (Math.abs(mesh.positions[v * 3 + 2]! - z) > 1e-6) continue;
        if (mesh.boneIndices[v * 4] === a && mesh.boneIndices[v * 4 + 1] === b && mesh.boneWeights[v * 4] === 128 && mesh.boneWeights[v * 4 + 1] === 127) n++;
      }
      return n;
    };
    expect(sharedAt(1.12, B.pelvis, B.chest)).toBeGreaterThan(0);
    expect(sharedAt(1.56, B.chest, B.head)).toBeGreaterThan(0);
    expect(sharedAt(1.2, B.leftUpperArm, B.leftForearm)).toBeGreaterThan(0);
    expect(sharedAt(1.2, B.rightUpperArm, B.rightForearm)).toBeGreaterThan(0);
    expect(sharedAt(0.5, B.leftThigh, B.leftShin)).toBeGreaterThan(0);
    expect(sharedAt(0.5, B.rightThigh, B.rightShin)).toBeGreaterThan(0);
  });

  it('the body narrows at the waist and widens at the shoulders; limbs taper', () => {
    // The torso is the first loft: 10 rings of 13 vertices and two caps of 14.
    const TORSO_VERTICES = 10 * 13 + 2 * 14;
    const widthAt = (z: number, minX = -Infinity, maxX = Infinity, first = TORSO_VERTICES, last = mesh.vertexCount): number => {
      let lo = Infinity, hi = -Infinity;
      for (let v = first; v < last; v++) {
        const x = mesh.positions[v * 3]!;
        if (Math.abs(mesh.positions[v * 3 + 2]! - z) > 1e-6 || x < minX || x > maxX) continue;
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
      return hi - lo;
    };
    const torso = (z: number): number => widthAt(z, -Infinity, Infinity, 0, TORSO_VERTICES);
    expect(torso(1.12)).toBeLessThan(torso(1.0)); // waist < hips
    expect(torso(1.12)).toBeLessThan(torso(1.43)); // waist < shoulders
    expect(torso(1.56)).toBeLessThan(torso(1.12) / 2); // neck
    expect(widthAt(0.08, 0, 0.2)).toBeLessThan(widthAt(0.84, 0, 0.2)); // ankle < thigh
    expect(widthAt(0.5, 0, 0.2)).toBeLessThan(widthAt(0.36, 0, 0.2)); // knee < calf
  });

  it('every part is mapped inside its own rectangle of the 256 × 256 texture', () => {
    const size = CHARACTER_TEXTURE_SIZE;
    let v = 0;
    for (const section of MANNEQUIN_SECTIONS) for (const loft of section.lofts) {
      const r = CHARACTER_REGIONS[loft.region];
      const count = loft.rings.length * (loft.sides + 1) + (loft.openStart ? 0 : loft.sides + 2) + (loft.openEnd ? 0 : loft.sides + 2);
      for (let k = 0; k < count; k++, v++) {
        const x = mesh.uvs[v * 2]! * size, y = mesh.uvs[v * 2 + 1]! * size;
        expect(x).toBeGreaterThanOrEqual(r.x + 0.5 - 1e-3);
        expect(x).toBeLessThanOrEqual(r.x + r.width - 0.5 + 1e-3);
        expect(y).toBeGreaterThanOrEqual(r.y + 0.5 - 1e-3);
        expect(y).toBeLessThanOrEqual(r.y + r.height - 0.5 + 1e-3);
      }
    }
    expect(v).toBe(mesh.vertexCount);
  });

  it('the texture regions do not overlap and stay inside the texture', () => {
    const size = CHARACTER_TEXTURE_SIZE, used = new Uint8Array(size * size);
    for (const r of Object.values(CHARACTER_REGIONS)) for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) {
      expect(x < size && y < size).toBe(true);
      expect(used[y * size + x]).toBe(0);
      used[y * size + x] = 1;
    }
  });

  it('every face looks outwards: the counter-clockwise winding agrees with the stored normals', () => {
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const [a, b, c] = [mesh.indices[t]!, mesh.indices[t + 1]!, mesh.indices[t + 2]!].map((v) => [mesh.positions[v * 3]!, mesh.positions[v * 3 + 1]!, mesh.positions[v * 3 + 2]!]);
      const u = [b![0]! - a![0]!, b![1]! - a![1]!, b![2]! - a![2]!], w = [c![0]! - a![0]!, c![1]! - a![1]!, c![2]! - a![2]!];
      const winding = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
      const v = mesh.indices[t]!, normal = [mesh.normals[v * 3]!, mesh.normals[v * 3 + 1]!, mesh.normals[v * 3 + 2]!];
      // The counter-clockwise winding and the stored normal agree.
      expect(winding[0]! * normal[0]! + winding[1]! * normal[1]! + winding[2]! * normal[2]!).toBeGreaterThan(0);
    }
  });

  it('offers 3 hair styles, 1 beard, 2 kinds of hands and feet', () => {
    expect(geosetVariantsOf(mesh, GEOSET_GROUP.hair)).toEqual([1, 2, 3]);
    expect(geosetVariantsOf(mesh, GEOSET_GROUP.facialHair)).toEqual([2]);
    expect(geosetVariantsOf(mesh, GEOSET_GROUP.gloves)).toEqual([1, 2]);
    expect(geosetVariantsOf(mesh, GEOSET_GROUP.boots)).toEqual([1, 2]);
    expect(geosetVariantsOf(mesh, 9)).toEqual([]);
  });

  it('hides every section the selection does not show: baseline look', () => {
    expect(idsOf(hiddenGeosetsOf(mesh))).toEqual([2, 3, 102, 402, 502]);
  });

  it('hides the baseline of a group when another variant is chosen', () => {
    expect(idsOf(hiddenGeosetsOf(mesh, characterGeosetSelection({ hairStyle: 3, facialHair: 2 }, { gloves: 2, boots: 2 })))).toEqual([1, 2, 401, 501]);
  });

  it('the body is never hidden by a selection', () => {
    for (const hair of [1, 2, 3]) expect(hiddenGeosetsOf(mesh, { [GEOSET_GROUP.hair]: hair }).has(BODY_GEOSET)).toBe(false);
  });

  it('the plain texture is 256 × 256 with one flat colour per region', () => {
    const texture = mannequinTexture(), at = (x: number, y: number): number[] => Array.from(texture.data.subarray((y * 256 + x) * 4, (y * 256 + x) * 4 + 4));
    expect([texture.width, texture.height]).toEqual([256, 256]);
    expect(at(10, 10)).toEqual([...MANNEQUIN_COLOURS.skin, 255]); // torso
    expect(at(10, 230)).toEqual([...MANNEQUIN_COLOURS.hair, 255]); // hair
    expect(at(150, 200)).toEqual([...MANNEQUIN_COLOURS.leather, 255]); // boots
  });
});

describe('scene=model&model=character', () => {
  const trianglesOf = (...ids: number[]): number => MANNEQUIN_SECTIONS.filter((section) => ids.includes(section.geosetId)).reduce((sum, section) => sum + section.lofts.reduce((n, loft) => n + loftTriangleCount(loft), 0), 0);
  it('reads the look from the URL, within what exists', () => {
    expect(parseSceneRequest('?scene=model&model=character&hair=3&facialHair=2&gloves=2&boots=2')).toMatchObject({ model: 'character', look: { hair: 3, facialHair: 2, gloves: 2, boots: 2 } });
    expect(parseSceneRequest('?scene=model&model=character&hair=9&boots=x')).toMatchObject({ look: { hair: 1, facialHair: 1, gloves: 1, boots: 1 } });
  });

  it('draws only the sections of the look: one draw call each', () => {
    const backend = new NullBackend();
    const scene = createModelScene(backend, { model: 'character' });
    // body + short hair + bare hands + bare feet (no beard section at all).
    expect(scene.render(16 / 9)).toEqual({ drawCalls: 4, triangles: trianglesOf(0, 1, 401, 501) });
    expect(scene.models).toMatchObject({ bones: 16, look: { hair: 1, facialHair: 1, gloves: 1, boots: 1 } });
    scene.dispose();
    const dressed = createModelScene(new NullBackend(), { model: 'character', look: { hair: 2, facialHair: 2, gloves: 2, boots: 2 } });
    expect(dressed.render(16 / 9)).toEqual({ drawCalls: 5, triangles: trianglesOf(0, 2, 102, 402, 502) });
    dressed.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });

  it('keys cycle through the variants of a section and come back to the first', () => {
    const scene = createModelScene(new NullBackend(), { model: 'character' });
    expect([scene.cycleLook('hair'), scene.cycleLook('hair'), scene.cycleLook('hair')]).toEqual([2, 3, 1]);
    expect([scene.cycleLook('facialHair'), scene.cycleLook('facialHair')]).toEqual([2, 1]);
    expect(scene.cycleLook('boots')).toBe(2);
    expect(scene.render(16 / 9).triangles).toBe(trianglesOf(0, 1, 401, 502));
    const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 4, triangles: 1, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
    expect(formatOverlay({ ...base, models: scene.models })).toContain('Character: hair 1 (1) · facial hair 1 (2) · gloves 1 (3) · boots 2 (4)');
    scene.dispose();
  });

  it('keeps the geosets hidden by request hidden whatever the look; the mannequin stays at rest in the tree poses', () => {
    const scene = createModelScene(new NullBackend(), { model: 'character', hiddenGeosets: [0], pose: 'bend' });
    expect(scene.render(16 / 9).drawCalls).toBe(3);
    scene.cycleLook('hair');
    expect(scene.render(16 / 9).drawCalls).toBe(3);
    expect(Array.from(scene.instances[0]!.palette!.subarray(16, 32))).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    scene.dispose();
  });

  it('refuses a variant the model does not have; the tree has no look', () => {
    expect(() => createModelScene(new NullBackend(), { model: 'character', look: { hair: 7 } })).toThrow(/no hair variant 7 \(it has: 1, 2, 3\)/);
    const tree = createModelScene(new NullBackend(), {});
    expect(tree.models.look).toBeUndefined();
    expect(tree.cycleLook('hair')).toBe(1);
    tree.dispose();
  });
});
