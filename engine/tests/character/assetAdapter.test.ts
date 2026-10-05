import { describe, expect, it } from 'vitest';
import {
  applyResolvedAppearanceTextures,
  bindCharacterBodyAsset,
  bindResolvedCharacterAttachment,
  characterAttachmentMatrix,
  CharacterComposite,
  ORVALIS_CHARACTER_SECTION_FORMAT,
  resolvedAppearanceGeosetSelection,
  type CharacterBodyContract,
  type ExternalCharacterSectionAsset,
  type ResolvedCharacterAttachment,
  type ResolvedItemAppearance,
} from '../../src/character';
import { mat4 } from '../../src/math';
import { ORVALIS_MODEL_FORMAT, type ExternalModelAsset, type ModelMesh } from '../../src/model';

const positions = new Float32Array([
  0, 0, 0, 1, 0, 0, 0, 1, 0,
  0, 0, 1, 1, 0, 1, 0, 1, 1,
]);
const normals = new Float32Array([
  0, 0, 1, 0, 0, 1, 0, 0, 1,
  0, 0, 1, 0, 0, 1, 0, 0, 1,
]);
const uvs = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
const weights = new Uint8Array([
  255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0,
  255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0,
]);
const bones = new Uint8Array(weights.length);

const mesh: ModelMesh = {
  name: 'original-test-body',
  vertexCount: 6,
  positions,
  normals,
  uvs,
  boneWeights: weights,
  boneIndices: bones,
  indices: new Uint16Array([0, 1, 2, 3, 4, 5]),
  boneCount: 2,
  materials: [{ renderFlags: 0, blendMode: 0 }],
  submeshes: [
    { geosetId: 0, indexStart: 0, indexCount: 3, material: 0 },
    { geosetId: 2, indexStart: 3, indexCount: 3, material: 0 },
  ],
};

const asset: ExternalModelAsset = {
  format: ORVALIS_MODEL_FORMAT,
  sourceUrl: 'assets/characters/test-body.orvmodel.json',
  rigId: 'orvalis-humanoid-v1',
  mesh,
  skeleton: {
    bones: [
      { name: 'root', parent: -1, pivot: [0, 0, 0] },
      { name: 'hand.r', parent: 0, pivot: [0.5, 0, 1] },
    ],
  },
  animation: { sequences: [], boneTracks: [undefined, undefined], globalSequences: [] },
  texture: { name: 'test-body-diffuse', width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) },
};

const rootSocket = { bone: 'root', position: [0, 0, 1] as const };
const body: CharacterBodyContract = {
  id: 'test-body',
  modelAsset: asset.sourceUrl,
  rigId: 'orvalis-humanoid-v1',
  compositeLayoutId: 'classic-256-v1',
  geosetGroups: { hair: 0 },
  sockets: {
    head: rootSocket,
    leftShoulder: rootSocket,
    rightShoulder: rootSocket,
    mainHand: { bone: 'hand.r', position: [0.1, 0, 0] },
    offHand: rootSocket,
    shield: rootSocket,
    back: { bone: 'root', position: [0, -0.2, 1], rotation: [0, 0, 0, 1], scale: [1.1, 1.1, 1.1] },
  },
  customization: { skinIds: ['skin-a'], faceIds: ['face-a'], hairStyleIds: ['hair-a'], hairColorIds: ['brown'], facialHairStyleIds: ['none'] },
};

const torsoSource = 'assets/characters/sections/test-shirt-torso.orvsection.json';
const torsoPixels = new Uint8Array(128 * 96 * 4).fill(255);
const torsoAsset: ExternalCharacterSectionAsset = {
  format: ORVALIS_CHARACTER_SECTION_FORMAT,
  sourceUrl: torsoSource,
  section: { name: 'test-shirt-torso', region: 'torso', alpha: 'key', data: torsoPixels },
};
const shirtAppearance: ResolvedItemAppearance = {
  id: 'test-shirt',
  bodyId: body.id,
  textures: [{ region: 'torso', asset: torsoSource, alpha: 'key' }],
  geosets: [],
  attached: [],
  hide: {},
};

const swordSource = 'assets/items/test-sword.orvmodel.json';
const swordAsset: ExternalModelAsset = {
  format: asset.format,
  sourceUrl: swordSource,
  mesh: asset.mesh,
  skeleton: asset.skeleton,
  animation: asset.animation,
  texture: asset.texture,
};
const swordAttachment: ResolvedCharacterAttachment = {
  socket: 'mainHand',
  bodySocket: body.sockets.mainHand,
  modelAsset: swordSource,
  position: [0, 0, 1],
  rotation: [0, 0, 0, 1],
  scale: [2, 2, 2],
};

function twoBonePalette(): Float32Array {
  const palette = new Float32Array(32);
  for (let bone = 0; bone < 2; bone++) {
    const at = bone * 16;
    palette[at] = palette[at + 5] = palette[at + 10] = palette[at + 15] = 1;
  }
  palette[28] = 10; // translation x of bone 1
  return palette;
}

describe('V1.2 production character asset binding', () => {
  it('binds the authored rig, semantic sockets and geoset groups to the loaded external model', () => {
    const bound = bindCharacterBodyAsset(body, asset);
    expect(bound.body).toBe(body);
    expect(bound.model).toBe(asset);
    expect(bound.sockets.head).toMatchObject({ boneName: 'root', boneIndex: 0, position: [0, 0, 1] });
    expect(bound.sockets.mainHand).toMatchObject({ boneName: 'hand.r', boneIndex: 1 });
    expect(bound.sockets.back.rotation).toEqual([0, 0, 0, 1]);
    expect(bound.sockets.back.scale).toEqual([1.1, 1.1, 1.1]);
    expect(bound.geosetVariants.hair).toEqual([2]);
  });

  it('requires the exact model asset and rig declared by the body contract', () => {
    expect(() => bindCharacterBodyAsset({ ...body, modelAsset: 'assets/characters/other.orvmodel.json' }, asset)).toThrow(/expects model/);
    expect(() => bindCharacterBodyAsset({ ...body, rigId: 'another-rig' }, asset)).toThrow(/requires rig/);
    const withoutRig: ExternalModelAsset = {
      format: asset.format,
      sourceUrl: asset.sourceUrl,
      mesh: asset.mesh,
      skeleton: asset.skeleton,
      animation: asset.animation,
      texture: asset.texture,
    };
    expect(() => bindCharacterBodyAsset(body, withoutRig)).toThrow(/has no rigId/);
  });

  it('rejects missing or ambiguous skeleton bone names before rendering', () => {
    const missing: CharacterBodyContract = { ...body, sockets: { ...body.sockets, mainHand: { bone: 'missing.hand', position: [0, 0, 0] } } };
    expect(() => bindCharacterBodyAsset(missing, asset)).toThrow(/missing bone/);

    const duplicate: ExternalModelAsset = {
      ...asset,
      skeleton: { bones: [{ name: 'root', parent: -1, pivot: [0, 0, 0] }, { name: 'root', parent: 0, pivot: [0, 0, 0] }] },
    };
    expect(() => bindCharacterBodyAsset(body, duplicate)).toThrow(/duplicate bone name/);
  });

  it('requires an always-visible body geoset 0', () => {
    const noBody: ExternalModelAsset = {
      ...asset,
      mesh: { ...mesh, submeshes: [{ geosetId: 2, indexStart: 0, indexCount: 6, material: 0 }] },
    };
    expect(() => bindCharacterBodyAsset(body, noBody)).toThrow(/geoset 0/);
  });

  it('feeds external appearance textures into the existing P5 composite and clears stale equipment layers', () => {
    const composite = new CharacterComposite({ dither: false });
    const sections = new Map([[torsoSource, torsoAsset]]);
    applyResolvedAppearanceTextures(composite, { shirt: shirtAppearance }, sections);
    expect(Array.from(composite.texture().data.slice(0, 4))).toEqual([255, 255, 255, 255]);

    applyResolvedAppearanceTextures(composite, {}, sections);
    expect(Array.from(composite.texture().data.slice(0, 4))).toEqual([0, 0, 0, 255]);
  });

  it('requires loaded external texture sources and a paintable equipment slot', () => {
    const composite = new CharacterComposite({ dither: false });
    expect(() => applyResolvedAppearanceTextures(composite, { shirt: shirtAppearance }, new Map())).toThrow(/unloaded texture/);
    expect(() => applyResolvedAppearanceTextures(composite, { mainHand: shirtAppearance }, new Map([[torsoSource, torsoAsset]]))).toThrow(/cannot paint/);
  });

  it('combines resolved geosets with the existing highest-variant rule and checks the real mesh', () => {
    const bound = bindCharacterBodyAsset(body, asset);
    const hair: ResolvedItemAppearance = { ...shirtAppearance, id: 'hair-geometry', textures: [], geosets: [{ name: 'hair', group: 0, variant: 2 }] };
    expect(resolvedAppearanceGeosetSelection(bound, [hair])).toEqual({ 0: 2 });
    expect(resolvedAppearanceGeosetSelection(bound, [{ ...hair, id: 'baseline', geosets: [{ name: 'hair', group: 0, variant: 1 }] }], { 0: 2 })).toEqual({ 0: 2 });
    expect(() => resolvedAppearanceGeosetSelection(bound, [{ ...hair, geosets: [{ name: 'hair', group: 0, variant: 3 }] }])).toThrow(/no hair variant 3/);
    expect(() => resolvedAppearanceGeosetSelection(bound, [{ ...hair, bodyId: 'other-body' }])).toThrow(/not "test-body"/);
  });

  it('binds an external child model and follows the animated body bone plus socket/item offsets', () => {
    const boundBody = bindCharacterBodyAsset(body, asset);
    const boundAttachment = bindResolvedCharacterAttachment(boundBody, swordAttachment, swordAsset);
    const matrix = characterAttachmentMatrix(mat4.create(), boundAttachment, twoBonePalette());
    expect(matrix[0]).toBeCloseTo(2);
    expect(matrix[5]).toBeCloseTo(2);
    expect(matrix[10]).toBeCloseTo(2);
    expect(matrix[12]).toBeCloseTo(10.1);
    expect(matrix[13]).toBeCloseTo(0);
    expect(matrix[14]).toBeCloseTo(1);
  });

  it('refuses mismatched attachment assets, unsupported non-uniform scale and invalid palettes', () => {
    const boundBody = bindCharacterBodyAsset(body, asset);
    expect(() => bindResolvedCharacterAttachment(boundBody, swordAttachment, { ...swordAsset, sourceUrl: 'other.orvmodel.json' })).toThrow(/expects model/);

    const nonUniform = bindResolvedCharacterAttachment(boundBody, { ...swordAttachment, scale: [2, 1, 2] }, swordAsset);
    expect(() => characterAttachmentMatrix(mat4.create(), nonUniform, twoBonePalette())).toThrow(/scale must be uniform/);

    const zeroRotation = bindResolvedCharacterAttachment(boundBody, { ...swordAttachment, rotation: [0, 0, 0, 0] }, swordAsset);
    expect(() => characterAttachmentMatrix(mat4.create(), zeroRotation, twoBonePalette())).toThrow(/non-zero quaternion/);

    const bound = bindResolvedCharacterAttachment(boundBody, swordAttachment, swordAsset);
    expect(() => characterAttachmentMatrix(mat4.create(), bound, new Float32Array(16))).toThrow(/outside the palette/);
  });
});
