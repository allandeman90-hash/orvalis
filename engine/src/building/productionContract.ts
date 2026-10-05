import { BUILDING_BLEND, BUILDING_MATERIAL_FLAG, MAX_BUILDING_MATERIAL_TEXTURES, type BuildingBatchClass, type BuildingBounds } from './building';

/**
 * Production-facing WMO-like environment contract.
 *
 * Existing Building/Cottage/Basin objects are decoded runtime fixtures: they already contain texels and geometry.
 * Production content instead needs stable asset references so AssetManager can stream/decode root data, groups,
 * doodad models and textures independently without turning the fixture builders into a world file format.
 *
 * Primary reference: master 1.12.1 spec §§103–120, 132–136, 165, 171–173.
 * Secondary reference: OpenWow WMO/WMOGroup/WMO_Part_Material.
 */

export type EnvironmentWrapMode = 'repeat' | 'clamp';

export interface EnvironmentTextureDefinition {
  readonly id: string;
  readonly asset: string;
  readonly wrapS?: EnvironmentWrapMode;
  readonly wrapT?: EnvironmentWrapMode;
}

/**
 * Small fixed-function-like material record. `textureIds` preserves both texture references even though the
 * current V0 renderer samples only the first; V2.4 may use the second without changing production manifests.
 */
export interface EnvironmentMaterialDefinition {
  readonly id: string;
  readonly flags: number;
  readonly blendMode: number;
  readonly textureIds: readonly string[];
  /** Optional authored self-illumination colour used by SIDN/night-glow style material work later. */
  readonly emissiveColor?: readonly [number, number, number, number];
}

export interface BuildingGroupBatchContract {
  readonly firstIndex: number;
  readonly indexCount: number;
  readonly materialId: string;
  readonly batchClass: BuildingBatchClass;
}

/**
 * One independently streamable/cullable building cell. Large vertex/index payloads remain in external assets;
 * the manifest keeps only what root-level resolution/streaming needs before that payload is decoded.
 */
export interface BuildingGroupAssetDefinition {
  readonly id: string;
  readonly geometryAsset: string;
  readonly flags: number;
  readonly bounds: BuildingBounds;
  readonly batches: readonly BuildingGroupBatchContract[];
  /** Optional one-colour-per-vertex source; omitted means white/no baked colour. */
  readonly vertexColorAsset?: string;
  /** Optional semantic collision payload (triangle flags/BSP or an original equivalent). */
  readonly collisionAsset?: string;
  /** Optional group-local liquid payload. */
  readonly liquidAsset?: string;
  /** Root doodad placement ids visible from this group. */
  readonly doodadIds?: readonly string[];
  /** Root fog ids referenced by this group; runtime limit remains four. */
  readonly fogIds?: readonly string[];
}

export interface EnvironmentDoodadModelDefinition {
  readonly id: string;
  readonly modelAsset: string;
}

export interface EnvironmentDoodadPlacementDefinition {
  readonly id: string;
  readonly modelId: string;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
  readonly scale: number;
  readonly color: readonly [number, number, number, number];
}

/** Set 0 is conventionally the global/always-on set; one additional set can be selected per placement. */
export interface EnvironmentDoodadSetDefinition {
  readonly id: string;
  readonly doodadIds: readonly string[];
}

export interface EnvironmentPortalDefinition {
  readonly id: string;
  readonly fromGroupId: string;
  readonly toGroupId: string;
  /** External polygon/plane payload, intentionally independent from group geometry. */
  readonly asset: string;
}

export interface EnvironmentFogDefinition {
  readonly id: string;
  readonly asset: string;
}

/** Kept now although current building rendering relies mainly on baked colours/global light. */
export interface EnvironmentLocalLightDefinition {
  readonly id: string;
  readonly kind: 'omni' | 'spot' | 'direct' | 'ambient';
  readonly position: readonly [number, number, number];
  readonly color: readonly [number, number, number];
  readonly intensity: number;
  readonly attenuationStart: number;
  readonly attenuationEnd: number;
}

export interface BuildingAssetContract {
  readonly id: string;
  readonly textures: readonly EnvironmentTextureDefinition[];
  readonly materials: readonly EnvironmentMaterialDefinition[];
  readonly groups: readonly BuildingGroupAssetDefinition[];
  readonly doodadModels?: readonly EnvironmentDoodadModelDefinition[];
  readonly doodads?: readonly EnvironmentDoodadPlacementDefinition[];
  readonly doodadSets?: readonly EnvironmentDoodadSetDefinition[];
  readonly portals?: readonly EnvironmentPortalDefinition[];
  readonly fogs?: readonly EnvironmentFogDefinition[];
  readonly localLights?: readonly EnvironmentLocalLightDefinition[];
}

export interface ResolvedEnvironmentMaterial {
  readonly id: string;
  readonly flags: number;
  readonly blendMode: number;
  readonly textures: readonly EnvironmentTextureDefinition[];
  readonly emissiveColor?: readonly [number, number, number, number];
}

export interface ResolvedBuildingGroupBatch {
  readonly firstIndex: number;
  readonly indexCount: number;
  readonly batchClass: BuildingBatchClass;
  readonly material: ResolvedEnvironmentMaterial;
}

export interface ResolvedBuildingGroupContract extends Omit<BuildingGroupAssetDefinition, 'batches'> {
  readonly batches: readonly ResolvedBuildingGroupBatch[];
}

const CLASS_ORDER: readonly BuildingBatchClass[] = ['trans', 'interior', 'exterior'];

function fail(message: string): never {
  throw new Error(`environment contract: ${message}`);
}

function nonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be a non-empty string`);
}

function finiteTuple(value: readonly number[], length: number, label: string): void {
  if (value.length !== length || !value.every(Number.isFinite)) fail(`${label} must contain ${length} finite numbers`);
}

function byteTuple(value: readonly number[], label: string): void {
  if (value.length !== 4 || !value.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) fail(`${label} must contain 4 bytes`);
}

function uniqueById<T extends { readonly id: string }>(values: readonly T[], label: string): Map<string, T> {
  const out = new Map<string, T>();
  for (const value of values) {
    nonEmpty(value.id, `${label} id`);
    if (out.has(value.id)) fail(`duplicate ${label} id "${value.id}"`);
    out.set(value.id, value);
  }
  return out;
}

function validateBounds(bounds: BuildingBounds, label: string): void {
  finiteTuple(bounds.min, 3, `${label} bounds.min`);
  finiteTuple(bounds.max, 3, `${label} bounds.max`);
  for (let axis = 0; axis < 3; axis++) if (bounds.min[axis]! > bounds.max[axis]!) fail(`${label} bounds min exceeds max on axis ${axis}`);
}

export function validateEnvironmentTextureDefinition(texture: EnvironmentTextureDefinition): void {
  nonEmpty(texture.id, 'texture id');
  nonEmpty(texture.asset, `texture "${texture.id}" asset`);
  if (texture.wrapS !== undefined && texture.wrapS !== 'repeat' && texture.wrapS !== 'clamp') fail(`texture "${texture.id}" has invalid wrapS`);
  if (texture.wrapT !== undefined && texture.wrapT !== 'repeat' && texture.wrapT !== 'clamp') fail(`texture "${texture.id}" has invalid wrapT`);
}

export function validateEnvironmentMaterialDefinition(material: EnvironmentMaterialDefinition, textures: ReadonlyMap<string, EnvironmentTextureDefinition>): void {
  nonEmpty(material.id, 'material id');
  if (!Number.isInteger(material.flags) || material.flags < 0 || material.flags > 0xffff) fail(`material "${material.id}" flags must be a 16-bit value`);
  if (!Number.isInteger(material.blendMode) || material.blendMode < 0 || material.blendMode > 0xffff) fail(`material "${material.id}" blendMode must be a 16-bit value`);
  if (material.textureIds.length < 1 || material.textureIds.length > MAX_BUILDING_MATERIAL_TEXTURES) fail(`material "${material.id}" needs 1..${MAX_BUILDING_MATERIAL_TEXTURES} textures`);
  for (const textureId of material.textureIds) {
    nonEmpty(textureId, `material "${material.id}" texture id`);
    if (!textures.has(textureId)) fail(`material "${material.id}" references unknown texture "${textureId}"`);
  }
  if (material.emissiveColor) byteTuple(material.emissiveColor, `material "${material.id}" emissiveColor`);
}

export function validateBuildingAssetContract(building: BuildingAssetContract): void {
  nonEmpty(building.id, 'building id');
  if (building.groups.length === 0) fail(`building "${building.id}" needs at least one group`);

  const textures = uniqueById(building.textures, 'texture');
  for (const texture of textures.values()) validateEnvironmentTextureDefinition(texture);
  const materials = uniqueById(building.materials, 'material');
  for (const material of materials.values()) validateEnvironmentMaterialDefinition(material, textures);
  const groups = uniqueById(building.groups, 'group');

  const doodadModels = uniqueById(building.doodadModels ?? [], 'doodad model');
  for (const model of doodadModels.values()) nonEmpty(model.modelAsset, `doodad model "${model.id}" asset`);
  const doodads = uniqueById(building.doodads ?? [], 'doodad');
  for (const doodad of doodads.values()) {
    if (!doodadModels.has(doodad.modelId)) fail(`doodad "${doodad.id}" references unknown model "${doodad.modelId}"`);
    finiteTuple(doodad.position, 3, `doodad "${doodad.id}" position`);
    finiteTuple(doodad.rotation, 4, `doodad "${doodad.id}" rotation`);
    if (!(Math.hypot(...doodad.rotation) > 0)) fail(`doodad "${doodad.id}" has a zero quaternion`);
    if (!(doodad.scale > 0) || !Number.isFinite(doodad.scale)) fail(`doodad "${doodad.id}" scale must be finite and > 0`);
    byteTuple(doodad.color, `doodad "${doodad.id}" color`);
  }

  const sets = uniqueById(building.doodadSets ?? [], 'doodad set');
  for (const set of sets.values()) {
    const seen = new Set<string>();
    for (const id of set.doodadIds) {
      if (!doodads.has(id)) fail(`doodad set "${set.id}" references unknown doodad "${id}"`);
      if (seen.has(id)) fail(`doodad set "${set.id}" lists doodad "${id}" twice`);
      seen.add(id);
    }
  }
  if (doodads.size > 0 && sets.size === 0) fail(`building "${building.id}" has doodads but no doodad set`);

  const fogs = uniqueById(building.fogs ?? [], 'fog');
  for (const fog of fogs.values()) nonEmpty(fog.asset, `fog "${fog.id}" asset`);

  const listedDoodads = new Set<string>();
  for (const group of groups.values()) {
    nonEmpty(group.geometryAsset, `group "${group.id}" geometryAsset`);
    if (!Number.isInteger(group.flags) || group.flags < 0) fail(`group "${group.id}" has invalid flags`);
    validateBounds(group.bounds, `group "${group.id}"`);
    if (group.vertexColorAsset !== undefined) nonEmpty(group.vertexColorAsset, `group "${group.id}" vertexColorAsset`);
    if (group.collisionAsset !== undefined) nonEmpty(group.collisionAsset, `group "${group.id}" collisionAsset`);
    if (group.liquidAsset !== undefined) nonEmpty(group.liquidAsset, `group "${group.id}" liquidAsset`);
    if (group.batches.length === 0) fail(`group "${group.id}" needs at least one batch`);
    let next = 0, previousClass = 0;
    for (const [index, batch] of group.batches.entries()) {
      if (!materials.has(batch.materialId)) fail(`group "${group.id}" batch ${index} references unknown material "${batch.materialId}"`);
      if (!Number.isInteger(batch.firstIndex) || batch.firstIndex !== next) fail(`group "${group.id}" batch ${index} must start at index ${next}`);
      if (!Number.isInteger(batch.indexCount) || batch.indexCount <= 0 || batch.indexCount % 3 !== 0) fail(`group "${group.id}" batch ${index} must contain whole triangles`);
      const order = CLASS_ORDER.indexOf(batch.batchClass);
      if (order < 0 || order < previousClass) fail(`group "${group.id}" batch ${index} is out of class order`);
      previousClass = order;
      next += batch.indexCount;
    }
    for (const doodadId of group.doodadIds ?? []) {
      if (!doodads.has(doodadId)) fail(`group "${group.id}" references unknown doodad "${doodadId}"`);
      listedDoodads.add(doodadId);
    }
    if ((group.fogIds?.length ?? 0) > 4) fail(`group "${group.id}" references more than 4 fog records`);
    for (const fogId of group.fogIds ?? []) if (!fogs.has(fogId)) fail(`group "${group.id}" references unknown fog "${fogId}"`);
  }
  for (const doodadId of doodads.keys()) if (!listedDoodads.has(doodadId)) fail(`doodad "${doodadId}" is listed by no group`);

  const portals = uniqueById(building.portals ?? [], 'portal');
  for (const portal of portals.values()) {
    if (!groups.has(portal.fromGroupId)) fail(`portal "${portal.id}" has unknown fromGroupId "${portal.fromGroupId}"`);
    if (!groups.has(portal.toGroupId)) fail(`portal "${portal.id}" has unknown toGroupId "${portal.toGroupId}"`);
    if (portal.fromGroupId === portal.toGroupId) fail(`portal "${portal.id}" connects a group to itself`);
    nonEmpty(portal.asset, `portal "${portal.id}" asset`);
  }

  const lights = uniqueById(building.localLights ?? [], 'local light');
  for (const light of lights.values()) {
    finiteTuple(light.position, 3, `local light "${light.id}" position`);
    finiteTuple(light.color, 3, `local light "${light.id}" color`);
    if (!light.color.every((c) => c >= 0 && c <= 1)) fail(`local light "${light.id}" color must be in 0..1`);
    if (!(light.intensity >= 0) || !Number.isFinite(light.intensity)) fail(`local light "${light.id}" intensity must be finite and >= 0`);
    if (!(light.attenuationStart >= 0) || !Number.isFinite(light.attenuationStart) || !(light.attenuationEnd >= light.attenuationStart) || !Number.isFinite(light.attenuationEnd)) fail(`local light "${light.id}" has invalid attenuation range`);
  }
}

export function resolveEnvironmentMaterial(building: BuildingAssetContract, materialId: string): ResolvedEnvironmentMaterial {
  const texturesById = new Map(building.textures.map((texture) => [texture.id, texture]));
  const material = building.materials.find((candidate) => candidate.id === materialId);
  if (!material) fail(`building "${building.id}" has no material "${materialId}"`);
  validateEnvironmentMaterialDefinition(material, texturesById);
  return {
    id: material.id,
    flags: material.flags,
    blendMode: material.blendMode,
    textures: material.textureIds.map((id) => texturesById.get(id)!),
    ...(material.emissiveColor !== undefined ? { emissiveColor: material.emissiveColor } : {}),
  };
}

export function resolveBuildingGroupContract(building: BuildingAssetContract, groupId: string): ResolvedBuildingGroupContract {
  validateBuildingAssetContract(building);
  const group = building.groups.find((candidate) => candidate.id === groupId);
  if (!group) fail(`building "${building.id}" has no group "${groupId}"`);
  return { ...group, batches: group.batches.map((batch) => ({ firstIndex: batch.firstIndex, indexCount: batch.indexCount, batchClass: batch.batchClass, material: resolveEnvironmentMaterial(building, batch.materialId) })) };
}

/** Flags/modes used by fixture runtime remain valid production values; exported here as discoverable anchors. */
export const ENVIRONMENT_MATERIAL_REFERENCE = {
  unlit: BUILDING_MATERIAL_FLAG.unlit,
  twoSided: BUILDING_MATERIAL_FLAG.unculled,
  nightGlow: BUILDING_MATERIAL_FLAG.nightGlow,
  window: BUILDING_MATERIAL_FLAG.window,
  opaque: BUILDING_BLEND.opaque,
  alphaTest: BUILDING_BLEND.alphaTest,
  mod: BUILDING_BLEND.mod,
  mod2x: BUILDING_BLEND.mod2x,
} as const;
