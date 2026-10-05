import type { AssetLoader } from '../assets';
import type { ModelTexture } from './fixtures';
import type { BoneTracks, Track, TrackInterpolation } from './animation';
import type { ModelMaterial, ModelSubmesh } from './material';
import { type ModelMesh, validateModelMesh } from './modelMesh';
import { type ModelAnimation, type Sequence, validateModelAnimation } from './sequence';
import { type Bone, type BoneBillboard, type Skeleton, validateSkinning } from './skeleton';

/**
 * V1.1 external model package. This is an Orvalis-owned interchange format,
 * deliberately small and boring: JSON on disk, typed arrays after decode.
 * It is NOT a WoW/M2 container and contains no proprietary data.
 *
 * A package is self-contained for the first production ingestion proof:
 * mesh + skeleton + animation + one diffuse texture. Later V1 work may split
 * shared textures/animations into separate AssetManager resources without
 * changing the runtime ModelMesh/Skeleton/ModelAnimation contracts.
 */
export const ORVALIS_MODEL_FORMAT = 'orvalis-model-1';
export const ORVALIS_MODEL_ASSET_TYPE = 'orvalis-model';

export interface ExternalModelAsset {
  readonly format: typeof ORVALIS_MODEL_FORMAT;
  readonly sourceUrl: string;
  /** Stable authored rig identifier. Optional for generic props; required by the V1.2 character adapter. */
  readonly rigId?: string;
  readonly mesh: ModelMesh;
  readonly skeleton: Skeleton;
  readonly animation: ModelAnimation;
  readonly texture: ModelTexture;
}

type JsonObject = Record<string, unknown>;

function object(value: unknown, what: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`model asset: ${what} must be an object`);
  return value as JsonObject;
}

function string(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`model asset: ${what} must be a non-empty string`);
  return value;
}

function integer(value: unknown, what: string, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw new Error(`model asset: ${what} must be an integer in ${min}..${max}`);
  return value as number;
}

function finite(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`model asset: ${what} must be finite`);
  return value;
}

function list(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`model asset: ${what} must be an array`);
  return value;
}

function numericList(value: unknown, what: string): number[] {
  return list(value, what).map((entry, index) => finite(entry, `${what}[${index}]`));
}

function byteList(value: unknown, what: string): number[] {
  return list(value, what).map((entry, index) => integer(entry, `${what}[${index}]`, 0, 255));
}

function u16List(value: unknown, what: string): number[] {
  return list(value, what).map((entry, index) => integer(entry, `${what}[${index}]`, 0, 0xffff));
}

function vec3(value: unknown, what: string): [number, number, number] {
  const a = numericList(value, what);
  if (a.length !== 3) throw new Error(`model asset: ${what} must have 3 numbers`);
  return [a[0]!, a[1]!, a[2]!];
}

function billboard(value: unknown, what: string): BoneBillboard | undefined {
  if (value === undefined) return undefined;
  if (value === 'spherical' || value === 'cylindricalX' || value === 'cylindricalY' || value === 'cylindricalZ') return value;
  throw new Error(`model asset: ${what} has an unknown billboard kind`);
}

function decodeMaterials(mesh: JsonObject): { materials?: ModelMaterial[]; submeshes?: ModelSubmesh[] } {
  const rawMaterials = mesh.materials;
  const rawSubmeshes = mesh.submeshes;
  if (rawMaterials === undefined && rawSubmeshes === undefined) return {};
  if (rawMaterials === undefined || rawSubmeshes === undefined) throw new Error('model asset: mesh materials and submeshes must be supplied together');
  const materials = list(rawMaterials, 'mesh.materials').map((entry, index): ModelMaterial => {
    const m = object(entry, `mesh.materials[${index}]`);
    return {
      renderFlags: integer(m.renderFlags, `mesh.materials[${index}].renderFlags`, 0, 0xffff),
      blendMode: integer(m.blendMode, `mesh.materials[${index}].blendMode`, 0, 6),
    };
  });
  const submeshes = list(rawSubmeshes, 'mesh.submeshes').map((entry, index): ModelSubmesh => {
    const s = object(entry, `mesh.submeshes[${index}]`);
    return {
      geosetId: integer(s.geosetId, `mesh.submeshes[${index}].geosetId`, 0, 0xffff),
      indexStart: integer(s.indexStart, `mesh.submeshes[${index}].indexStart`, 0),
      indexCount: integer(s.indexCount, `mesh.submeshes[${index}].indexCount`, 3),
      material: integer(s.material, `mesh.submeshes[${index}].material`, 0),
    };
  });
  return { materials, submeshes };
}

function decodeMesh(root: JsonObject): ModelMesh {
  const mesh = object(root.mesh, 'mesh');
  const positions = numericList(mesh.positions, 'mesh.positions');
  if (positions.length % 3 !== 0) throw new Error('model asset: mesh.positions must hold 3 numbers per vertex');
  const sections = decodeMaterials(mesh);
  const decoded: ModelMesh = {
    name: string(mesh.name, 'mesh.name'),
    vertexCount: positions.length / 3,
    positions: new Float32Array(positions),
    normals: new Float32Array(numericList(mesh.normals, 'mesh.normals')),
    uvs: new Float32Array(numericList(mesh.uvs, 'mesh.uvs')),
    boneWeights: new Uint8Array(byteList(mesh.boneWeights, 'mesh.boneWeights')),
    boneIndices: new Uint8Array(byteList(mesh.boneIndices, 'mesh.boneIndices')),
    indices: new Uint16Array(u16List(mesh.indices, 'mesh.indices')),
    boneCount: integer(mesh.boneCount, 'mesh.boneCount', 1, 256),
    ...sections,
  };
  validateModelMesh(decoded);
  return decoded;
}

function decodeSkeleton(root: JsonObject): Skeleton {
  const skeleton = object(root.skeleton, 'skeleton');
  const bones = list(skeleton.bones, 'skeleton.bones').map((entry, index): Bone => {
    const b = object(entry, `skeleton.bones[${index}]`);
    const kind = billboard(b.billboard, `skeleton.bones[${index}].billboard`);
    return {
      name: string(b.name, `skeleton.bones[${index}].name`),
      parent: integer(b.parent, `skeleton.bones[${index}].parent`, -1, 255),
      pivot: vec3(b.pivot, `skeleton.bones[${index}].pivot`),
      ...(kind === undefined ? {} : { billboard: kind }),
    };
  });
  return { bones };
}

function interpolation(value: unknown, what: string): TrackInterpolation {
  if (value === 'linear' || value === 'step') return value;
  throw new Error(`model asset: ${what} must be "linear" or "step"`);
}

function decodeTrack(value: unknown, what: string): Track {
  const raw = object(value, what);
  const globalSequence = raw.globalSequence === undefined ? undefined : integer(raw.globalSequence, `${what}.globalSequence`, 0);
  return {
    interpolation: interpolation(raw.interpolation, `${what}.interpolation`),
    timestamps: new Uint32Array(list(raw.timestamps, `${what}.timestamps`).map((entry, index) => integer(entry, `${what}.timestamps[${index}]`, 0, 0xffffffff))),
    values: new Float32Array(numericList(raw.values, `${what}.values`)),
    ...(globalSequence === undefined ? {} : { globalSequence }),
  };
}

function decodeBoneTracks(value: unknown, bone: number): BoneTracks | undefined {
  if (value === null || value === undefined) return undefined;
  const raw = object(value, `animation.boneTracks[${bone}]`);
  return {
    ...(raw.translation === undefined ? {} : { translation: decodeTrack(raw.translation, `animation.boneTracks[${bone}].translation`) }),
    ...(raw.rotation === undefined ? {} : { rotation: decodeTrack(raw.rotation, `animation.boneTracks[${bone}].rotation`) }),
    ...(raw.scale === undefined ? {} : { scale: decodeTrack(raw.scale, `animation.boneTracks[${bone}].scale`) }),
  };
}

function decodeAnimation(root: JsonObject, boneCount: number): ModelAnimation {
  const raw = object(root.animation, 'animation');
  const sequences = list(raw.sequences, 'animation.sequences').map((entry, index): Sequence => {
    const s = object(entry, `animation.sequences[${index}]`);
    const id = s.id === undefined ? undefined : integer(s.id, `animation.sequences[${index}].id`, 0);
    if (typeof s.loop !== 'boolean') throw new Error(`model asset: animation.sequences[${index}].loop must be boolean`);
    return {
      name: string(s.name, `animation.sequences[${index}].name`),
      ...(id === undefined ? {} : { id }),
      start: integer(s.start, `animation.sequences[${index}].start`, 0),
      end: integer(s.end, `animation.sequences[${index}].end`, 0),
      loop: s.loop,
      blendTime: finite(s.blendTime, `animation.sequences[${index}].blendTime`),
    };
  });
  const tracks = list(raw.boneTracks, 'animation.boneTracks');
  if (tracks.length !== boneCount) throw new Error(`model asset: animation.boneTracks has ${tracks.length} entries for ${boneCount} bones`);
  const animation: ModelAnimation = {
    sequences,
    boneTracks: tracks.map((entry, bone) => decodeBoneTracks(entry, bone)),
    globalSequences: list(raw.globalSequences, 'animation.globalSequences').map((entry, index) => integer(entry, `animation.globalSequences[${index}]`, 0)),
  };
  validateModelAnimation(animation, boneCount);
  return animation;
}

function decodeTexture(root: JsonObject): ModelTexture {
  const raw = object(root.texture, 'texture');
  const width = integer(raw.width, 'texture.width', 1, 8192), height = integer(raw.height, 'texture.height', 1, 8192);
  const bytes = byteList(raw.data, 'texture.data');
  if (bytes.length !== width * height * 4) throw new Error(`model asset: texture.data has ${bytes.length} bytes, expected ${width * height * 4}`);
  return { name: string(raw.name, 'texture.name'), width, height, data: new Uint8Array(bytes) };
}

/** Decode and fully validate one external Orvalis model package. */
export function decodeExternalModelAsset(bytes: ArrayBuffer, url = '<memory>'): ExternalModelAsset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (cause) {
    throw new Error(`model asset: ${url} is not valid UTF-8 JSON`, { cause });
  }
  const root = object(parsed, 'root');
  if (root.format !== ORVALIS_MODEL_FORMAT) throw new Error(`model asset: ${url} uses unsupported format "${String(root.format)}"`);
  const rigId = root.rigId === undefined ? undefined : string(root.rigId, 'rigId');
  const mesh = decodeMesh(root);
  const skeleton = decodeSkeleton(root);
  validateSkinning(mesh, skeleton);
  const animation = decodeAnimation(root, skeleton.bones.length);
  return {
    format: ORVALIS_MODEL_FORMAT,
    sourceUrl: url,
    ...(rigId === undefined ? {} : { rigId }),
    mesh,
    skeleton,
    animation,
    texture: decodeTexture(root),
  };
}

/** AssetManager loader: decoding does the CPU validation; upload is identity in V1.1 because ModelRenderer owns GPU upload. */
export function externalModelAssetLoader(): AssetLoader<ExternalModelAsset, ExternalModelAsset> {
  return {
    decode: (bytes, url) => decodeExternalModelAsset(bytes, url),
    upload: (asset) => asset,
  };
}
