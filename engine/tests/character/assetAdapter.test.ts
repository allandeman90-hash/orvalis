import { describe, expect, it } from 'vitest';
import { bindCharacterBodyAsset, type CharacterBodyContract } from '../../src/character';
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
    const { rigId: _rigId, ...withoutRig } = asset;
    expect(() => bindCharacterBodyAsset(body, withoutRig)).toThrow(/has no rigId/);
  });

  it('rejects missing or ambiguous skeleton bone names before rendering', () => {
    const missing = { ...body, sockets: { ...body.sockets, mainHand: { bone: 'missing.hand', position: [0, 0, 0] as const } } };
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
});
