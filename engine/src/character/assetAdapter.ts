import { modelSubmeshes, type ExternalModelAsset } from '../model';
import type { CharacterSection } from './composite';
import type { ExternalCharacterSectionAsset } from './externalSection';
import { geosetVariantsOf } from './geosets';
import {
  CHARACTER_SOCKET_NAMES,
  type CharacterBodyContract,
  type CharacterSocketName,
  type CharacterTextureAppearancePart,
  type Quat,
  type Vec3,
  validateCharacterBodyContract,
} from './productionContract';

/** A production socket after its semantic bone name has been resolved against one loaded skeleton. */
export interface BoundCharacterSocket {
  readonly name: CharacterSocketName;
  readonly boneName: string;
  readonly boneIndex: number;
  readonly position: Vec3;
  readonly rotation?: Quat;
  readonly scale?: Vec3;
}

/** Runtime-ready binding between an authored body manifest and the externally loaded model package it names. */
export interface BoundCharacterBodyAsset {
  readonly body: CharacterBodyContract;
  readonly model: ExternalModelAsset;
  readonly sockets: Readonly<Record<CharacterSocketName, BoundCharacterSocket>>;
  /** Semantic geoset name -> variants that actually exist in the loaded mesh. */
  readonly geosetVariants: Readonly<Record<string, readonly number[]>>;
}

function namedBones(asset: ExternalModelAsset): Map<string, number> {
  const byName = new Map<string, number>();
  asset.skeleton.bones.forEach((bone, index) => {
    if (bone.name.trim().length === 0) throw new Error(`character asset: model "${asset.mesh.name}" has an unnamed bone at index ${index}`);
    if (byName.has(bone.name)) throw new Error(`character asset: model "${asset.mesh.name}" has duplicate bone name "${bone.name}"`);
    byName.set(bone.name, index);
  });
  return byName;
}

/**
 * Resolves a V0.1 production body contract against a V1.1 external model.
 *
 * This is intentionally a pure CPU adapter: AssetManager owns loading, ModelRenderer owns GPU upload, and this
 * layer only proves that authored semantic character data really matches the loaded mesh/skeleton.
 */
export function bindCharacterBodyAsset(body: CharacterBodyContract, asset: ExternalModelAsset): BoundCharacterBodyAsset {
  validateCharacterBodyContract(body);

  if (asset.sourceUrl !== body.modelAsset) {
    throw new Error(`character asset: body "${body.id}" expects model "${body.modelAsset}", got "${asset.sourceUrl}"`);
  }
  if (asset.rigId === undefined) {
    throw new Error(`character asset: model "${asset.mesh.name}" has no rigId but body "${body.id}" requires "${body.rigId}"`);
  }
  if (asset.rigId !== body.rigId) {
    throw new Error(`character asset: body "${body.id}" requires rig "${body.rigId}", model provides "${asset.rigId}"`);
  }
  if (!modelSubmeshes(asset.mesh).some((submesh) => submesh.geosetId === 0)) {
    throw new Error(`character asset: body "${body.id}" model has no always-visible body geoset 0`);
  }

  const bones = namedBones(asset);
  const sockets = {} as Record<CharacterSocketName, BoundCharacterSocket>;
  for (const name of CHARACTER_SOCKET_NAMES) {
    const authored = body.sockets[name];
    const boneIndex = bones.get(authored.bone);
    if (boneIndex === undefined) {
      throw new Error(`character asset: body "${body.id}" socket ${name} refers to missing bone "${authored.bone}"`);
    }
    sockets[name] = {
      name,
      boneName: authored.bone,
      boneIndex,
      position: authored.position,
      ...(authored.rotation === undefined ? {} : { rotation: authored.rotation }),
      ...(authored.scale === undefined ? {} : { scale: authored.scale }),
    };
  }

  const geosetVariants: Record<string, readonly number[]> = {};
  for (const [name, group] of Object.entries(body.geosetGroups)) geosetVariants[name] = geosetVariantsOf(asset.mesh, group);

  return { body, model: asset, sockets, geosetVariants };
}

/**
 * Proves that one externally loaded RGBA section is exactly the source declared by an appearance part.
 * The returned CharacterSection can be passed directly to CharacterComposite.setSection().
 */
export function bindCharacterTextureAppearancePart(part: CharacterTextureAppearancePart, asset: ExternalCharacterSectionAsset): CharacterSection {
  if (asset.sourceUrl !== part.asset) {
    throw new Error(`character asset: texture part for ${part.region} expects "${part.asset}", got "${asset.sourceUrl}"`);
  }
  if (asset.section.region !== part.region) {
    throw new Error(`character asset: texture "${asset.sourceUrl}" is for region ${asset.section.region}, appearance requires ${part.region}`);
  }
  if (asset.section.alpha !== part.alpha) {
    throw new Error(`character asset: texture "${asset.sourceUrl}" uses alpha ${asset.section.alpha}, appearance requires ${part.alpha}`);
  }
  return asset.section;
}
