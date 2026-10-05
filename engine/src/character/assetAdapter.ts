import { mat4, quat, vec3, type Mat4 } from '../math';
import { modelSubmeshes, type ExternalModelAsset } from '../model';
import { type CharacterComposite, type CharacterLayer, type CharacterSection } from './composite';
import { EQUIPMENT_LAYER_OF_SLOT, EQUIPMENT_SLOTS, type EquipmentSlot } from './equipment';
import type { ExternalCharacterSectionAsset } from './externalSection';
import { BASELINE_VARIANT, geosetVariantsOf, type GeosetSelection } from './geosets';
import {
  CHARACTER_SOCKET_NAMES,
  type CharacterBodyContract,
  type CharacterSocketName,
  type CharacterTextureAppearancePart,
  type Quat,
  type ResolvedCharacterAttachment,
  type ResolvedItemAppearance,
  type Vec3,
  validateCharacterBodyContract,
} from './productionContract';
import { CHARACTER_REGION_NAMES, type CharacterRegionName } from './textureLayout';

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

/** One resolved attached appearance after its external child model and body-specific socket have both been bound. */
export interface BoundCharacterAttachment {
  readonly appearance: ResolvedCharacterAttachment;
  readonly model: ExternalModelAsset;
  readonly socket: BoundCharacterSocket;
}

/** Resolved visual appearances currently occupying equipment slots. Gameplay stats do not enter this map. */
export type ProductionAppearanceEquipment = Readonly<Partial<Record<EquipmentSlot, ResolvedItemAppearance>>>;
/** External composite sources already loaded through AssetManager, keyed by the authored asset URL. */
export type CharacterSectionAssetRegistry = ReadonlyMap<string, ExternalCharacterSectionAsset>;

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

function equipmentLayer(slot: EquipmentSlot): CharacterLayer | undefined {
  const layer = EQUIPMENT_LAYER_OF_SLOT[slot];
  return layer === undefined ? undefined : (`equipment${layer}` as CharacterLayer);
}

/**
 * Applies production appearance textures to the existing P5 CharacterComposite.
 * Calling it with a changed equipment map also clears stale regions from slots that were unequipped.
 */
export function applyResolvedAppearanceTextures(composite: CharacterComposite, equipment: ProductionAppearanceEquipment, assets: CharacterSectionAssetRegistry): void {
  for (const slot of EQUIPMENT_SLOTS) {
    const appearance = equipment[slot];
    const layer = equipmentLayer(slot);
    if (appearance && appearance.textures.length > 0 && layer === undefined) {
      throw new Error(`character asset: slot ${slot} cannot paint composite textures`);
    }
    if (layer === undefined) continue;

    const sections = new Map<CharacterRegionName, CharacterSection>();
    for (const part of appearance?.textures ?? []) {
      const asset = assets.get(part.asset);
      if (!asset) throw new Error(`character asset: appearance "${appearance!.id}" needs unloaded texture "${part.asset}"`);
      const section = bindCharacterTextureAppearancePart(part, asset);
      if (sections.has(part.region)) throw new Error(`character asset: appearance "${appearance!.id}" paints region ${part.region} twice`);
      sections.set(part.region, section);
    }
    for (const region of CHARACTER_REGION_NAMES) composite.setSection(layer, region, sections.get(region) ?? null);
  }
}

/**
 * Combines body-resolved geoset requests using the existing P5 rule: the highest requested variant wins.
 * Variant 1 may legitimately be absent from the mesh ("show nothing" baseline); authored higher variants must exist.
 */
export function resolvedAppearanceGeosetSelection(body: BoundCharacterBodyAsset, appearances: readonly ResolvedItemAppearance[], initial: GeosetSelection = {}): GeosetSelection {
  const selection: Record<number, number> = { ...initial };
  for (const appearance of appearances) {
    if (appearance.bodyId !== body.body.id) {
      throw new Error(`character asset: appearance "${appearance.id}" was resolved for body "${appearance.bodyId}", not "${body.body.id}"`);
    }
    for (const geoset of appearance.geosets) {
      const variants = body.geosetVariants[geoset.name];
      if (variants === undefined) throw new Error(`character asset: body "${body.body.id}" has no semantic geoset "${geoset.name}"`);
      if (geoset.variant !== BASELINE_VARIANT && !variants.includes(geoset.variant)) {
        throw new Error(`character asset: body "${body.body.id}" has no ${geoset.name} variant ${geoset.variant}`);
      }
      selection[geoset.group] = Math.max(selection[geoset.group] ?? BASELINE_VARIANT, geoset.variant);
    }
  }
  return selection;
}

/** Binds the child model of an attached appearance to the body-specific semantic socket it uses. */
export function bindResolvedCharacterAttachment(body: BoundCharacterBodyAsset, appearance: ResolvedCharacterAttachment, model: ExternalModelAsset): BoundCharacterAttachment {
  if (model.sourceUrl !== appearance.modelAsset) {
    throw new Error(`character asset: attachment on ${appearance.socket} expects model "${appearance.modelAsset}", got "${model.sourceUrl}"`);
  }
  return { appearance, model, socket: body.sockets[appearance.socket] };
}

const socketLocal = mat4.create();
const itemLocal = mat4.create();
const component = mat4.create();
const scratchQuat = quat.create();
const scratchVec = vec3.create();

function composeTrs(out: Mat4, label: string, position?: Vec3, rotation?: Quat, scale?: Vec3): Mat4 {
  mat4.identity(out);
  if (position !== undefined) {
    if (!position.every(Number.isFinite)) throw new Error(`character asset: ${label} position must be finite`);
    mat4.multiply(out, out, mat4.fromTranslation(component, vec3.set(scratchVec, position[0], position[1], position[2])));
  }
  if (rotation !== undefined) {
    if (!rotation.every(Number.isFinite) || !(Math.hypot(rotation[0], rotation[1], rotation[2], rotation[3]) > 0)) {
      throw new Error(`character asset: ${label} rotation must be a finite non-zero quaternion`);
    }
    quat.normalize(scratchQuat, quat.set(scratchQuat, rotation[0], rotation[1], rotation[2], rotation[3]));
    mat4.multiply(out, out, quat.toMat4(component, scratchQuat));
  }
  if (scale !== undefined) {
    if (!scale.every(Number.isFinite) || scale.some((value) => value <= 0)) throw new Error(`character asset: ${label} scale must be finite and > 0`);
    if (Math.abs(scale[0] - scale[1]) > 1e-6 || Math.abs(scale[0] - scale[2]) > 1e-6) {
      throw new Error(`character asset: ${label} scale must be uniform for the current ModelRenderer`);
    }
    mat4.multiply(out, out, mat4.fromScaling(component, vec3.set(scratchVec, scale[0], scale[1], scale[2])));
  }
  return out;
}

/**
 * Child-model -> body-model matrix for the current parent palette.
 * Order: animated bone × body socket TRS × item-local TRS.
 */
export function characterAttachmentMatrix(out: Mat4, attachment: BoundCharacterAttachment, palette: Float32Array): Mat4 {
  const at = attachment.socket.boneIndex * 16;
  if (at + 16 > palette.length) {
    throw new Error(`character asset: socket ${attachment.socket.name} bone ${attachment.socket.boneIndex} is outside the palette`);
  }
  composeTrs(socketLocal, `socket ${attachment.socket.name}`, attachment.socket.position, attachment.socket.rotation, attachment.socket.scale);
  composeTrs(itemLocal, `attachment ${attachment.model.sourceUrl}`, attachment.appearance.position, attachment.appearance.rotation, attachment.appearance.scale);
  mat4.multiply(out, palette.subarray(at, at + 16), socketLocal);
  return mat4.multiply(out, out, itemLocal);
}
