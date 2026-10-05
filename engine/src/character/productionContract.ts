import type { SectionAlpha } from './composite';
import { GEOSET_GROUP_COUNT, GEOSET_GROUP_SIZE } from './geosets';
import type { CharacterRegionName } from './textureLayout';

/**
 * Production-side character appearance contract.
 *
 * The existing mannequin/equipment catalogue is a renderer fixture. This file defines the data boundary that
 * real authored character assets must satisfy before they enter that renderer. It deliberately does not define
 * gameplay item stats: an equipped gameplay item points at an appearance id, and transmog can override only
 * that visual id.
 *
 * Reference model:
 * - master 1.12.1 spec §§51-57, 70-73 (primary);
 * - OpenWow Character / CharacterItem separation (secondary implementation reference).
 */

export const CHARACTER_SOCKET_NAMES = ['head', 'leftShoulder', 'rightShoulder', 'mainHand', 'offHand', 'shield', 'back'] as const;
export type CharacterSocketName = (typeof CHARACTER_SOCKET_NAMES)[number];

export const REQUIRED_CHARACTER_SOCKETS: readonly CharacterSocketName[] = CHARACTER_SOCKET_NAMES;

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

/** Body-specific fit. An importer/runtime adapter resolves `bone` to its actual skeleton index. */
export interface CharacterSocketContract {
  readonly bone: string;
  readonly position: Vec3;
  readonly rotation?: Quat;
  readonly scale?: Vec3;
}

/** IDs are references into authored data; no source art is generated in this contract. */
export interface CharacterCustomizationContract {
  readonly skinIds: readonly string[];
  readonly faceIds: readonly string[];
  readonly hairStyleIds: readonly string[];
  readonly hairColorIds: readonly string[];
  readonly facialHairStyleIds: readonly string[];
}

/**
 * One of the eight base body archetypes.
 * `geosetGroups` maps semantic names (hair, gloves, boots, robe...) to this body's M2-like numeric group.
 * This indirection lets a shared appearance target different bodies without assuming identical mesh numbering.
 */
export interface CharacterBodyContract {
  readonly id: string;
  readonly modelAsset: string;
  readonly rigId: string;
  readonly compositeLayoutId: string;
  readonly geosetGroups: Readonly<Record<string, number>>;
  readonly sockets: Readonly<Record<CharacterSocketName, CharacterSocketContract>>;
  readonly customization: CharacterCustomizationContract;
}

/** One body-composite image source loaded through AssetManager. */
export interface CharacterTextureAppearancePart {
  readonly region: CharacterRegionName;
  readonly asset: string;
  readonly alpha: SectionAlpha;
}

/** A separate silhouette model such as a helmet, pauldron, cape, weapon or shield. */
export interface CharacterAttachedAppearancePart {
  readonly socket: CharacterSocketName;
  readonly modelAsset: string;
  /** Item-local adjustment. Body-wide fitting belongs on CharacterBodyContract.sockets. */
  readonly position?: Vec3;
  readonly rotation?: Quat;
  readonly scale?: Vec3;
}

/** Visibility is data-driven; helmets are not reduced to a single `hideHair` boolean. */
export interface CharacterVisibilityRules {
  readonly hair?: boolean;
  readonly facialHair?: boolean;
  readonly ears?: boolean;
  readonly geosets?: readonly string[];
}

export interface ItemAppearancePayload {
  readonly textures?: readonly CharacterTextureAppearancePart[];
  /** Semantic geoset name -> variant (1 = baseline/bare convention). */
  readonly geosets?: Readonly<Record<string, number>>;
  readonly attached?: readonly CharacterAttachedAppearancePart[];
  readonly hide?: CharacterVisibilityRules;
}

/**
 * Visual-only item definition. Shared fields are the normal path. A body override is only for exceptional fit/UV
 * cases; when present, textures/attached replace those shared arrays, while geosets/hide merge by key.
 */
export interface ItemAppearanceDefinition extends ItemAppearancePayload {
  readonly id: string;
  /** Omit for all bodies. */
  readonly compatibleBodyIds?: readonly string[];
  readonly bodyOverrides?: Readonly<Record<string, ItemAppearancePayload>>;
}

/** The only bridge a future gameplay item needs to expose to this visual system. */
export interface EquippedItemAppearanceRef {
  readonly itemAppearanceId: string;
  readonly appearanceOverrideId?: string | null;
}

export interface ResolvedCharacterGeoset {
  readonly name: string;
  readonly group: number;
  readonly variant: number;
}

export interface ResolvedCharacterAttachment {
  readonly socket: CharacterSocketName;
  readonly bodySocket: CharacterSocketContract;
  readonly modelAsset: string;
  readonly position?: Vec3;
  readonly rotation?: Quat;
  readonly scale?: Vec3;
}

export interface ResolvedItemAppearance {
  readonly id: string;
  readonly bodyId: string;
  readonly textures: readonly CharacterTextureAppearancePart[];
  readonly geosets: readonly ResolvedCharacterGeoset[];
  readonly attached: readonly ResolvedCharacterAttachment[];
  readonly hide: Readonly<CharacterVisibilityRules>;
}

export type ItemAppearanceRegistry = Readonly<Record<string, ItemAppearanceDefinition>>;

const nonEmpty = (value: string, label: string): void => {
  if (value.trim().length === 0) throw new Error(`character contract: ${label} must not be empty`);
};

const finiteTuple = (value: readonly number[] | undefined, length: number, label: string): void => {
  if (value === undefined) return;
  if (value.length !== length || !value.every(Number.isFinite)) throw new Error(`character contract: ${label} must contain ${length} finite numbers`);
};

const validateSocket = (name: CharacterSocketName, socket: CharacterSocketContract): void => {
  nonEmpty(socket.bone, `socket ${name} bone`);
  finiteTuple(socket.position, 3, `socket ${name} position`);
  finiteTuple(socket.rotation, 4, `socket ${name} rotation`);
  finiteTuple(socket.scale, 3, `socket ${name} scale`);
  if (socket.scale?.some((value) => value <= 0)) throw new Error(`character contract: socket ${name} scale must be > 0`);
};

const validateIds = (values: readonly string[], label: string): void => {
  const seen = new Set<string>();
  for (const value of values) {
    nonEmpty(value, label);
    if (seen.has(value)) throw new Error(`character contract: duplicate ${label} "${value}"`);
    seen.add(value);
  }
};

export function validateCharacterBodyContract(body: CharacterBodyContract): void {
  nonEmpty(body.id, 'body id');
  nonEmpty(body.modelAsset, `${body.id} modelAsset`);
  nonEmpty(body.rigId, `${body.id} rigId`);
  nonEmpty(body.compositeLayoutId, `${body.id} compositeLayoutId`);

  const groups = new Set<number>();
  for (const [name, group] of Object.entries(body.geosetGroups)) {
    nonEmpty(name, `${body.id} geoset name`);
    if (!Number.isInteger(group) || group < 0 || group >= GEOSET_GROUP_COUNT) {
      throw new Error(`character contract: ${body.id} geoset "${name}" group must be 0..${GEOSET_GROUP_COUNT - 1}`);
    }
    if (groups.has(group)) throw new Error(`character contract: ${body.id} maps more than one semantic geoset to group ${group}`);
    groups.add(group);
  }

  for (const name of REQUIRED_CHARACTER_SOCKETS) {
    const socket = body.sockets[name];
    if (!socket) throw new Error(`character contract: ${body.id} is missing required socket ${name}`);
    validateSocket(name, socket);
  }

  validateIds(body.customization.skinIds, `${body.id} skin id`);
  validateIds(body.customization.faceIds, `${body.id} face id`);
  validateIds(body.customization.hairStyleIds, `${body.id} hair style id`);
  validateIds(body.customization.hairColorIds, `${body.id} hair color id`);
  validateIds(body.customization.facialHairStyleIds, `${body.id} facial hair style id`);
}

/** V0.1 acceptance helper: production is expected to expose exactly eight base body contracts. */
export function validateCharacterRoster(bodies: readonly CharacterBodyContract[], expectedCount = 8): void {
  if (bodies.length !== expectedCount) throw new Error(`character contract: expected ${expectedCount} base bodies, got ${bodies.length}`);
  const ids = new Set<string>();
  for (const body of bodies) {
    validateCharacterBodyContract(body);
    if (ids.has(body.id)) throw new Error(`character contract: duplicate body id "${body.id}"`);
    ids.add(body.id);
  }
}

const validatePayload = (payload: ItemAppearancePayload, label: string): void => {
  const textureRegions = new Set<CharacterRegionName>();
  for (const texture of payload.textures ?? []) {
    nonEmpty(texture.asset, `${label} texture asset`);
    if (textureRegions.has(texture.region)) throw new Error(`character contract: ${label} paints region ${texture.region} twice`);
    textureRegions.add(texture.region);
  }
  for (const [name, variant] of Object.entries(payload.geosets ?? {})) {
    nonEmpty(name, `${label} geoset name`);
    if (!Number.isInteger(variant) || variant < 1 || variant >= GEOSET_GROUP_SIZE) {
      throw new Error(`character contract: ${label} geoset "${name}" variant must be 1..${GEOSET_GROUP_SIZE - 1}`);
    }
  }
  const attachedSockets = new Set<CharacterSocketName>();
  for (const part of payload.attached ?? []) {
    nonEmpty(part.modelAsset, `${label} attached modelAsset`);
    if (attachedSockets.has(part.socket)) throw new Error(`character contract: ${label} attaches more than one model to ${part.socket}`);
    attachedSockets.add(part.socket);
    finiteTuple(part.position, 3, `${label} ${part.socket} position`);
    finiteTuple(part.rotation, 4, `${label} ${part.socket} rotation`);
    finiteTuple(part.scale, 3, `${label} ${part.socket} scale`);
    if (part.scale?.some((value) => value <= 0)) throw new Error(`character contract: ${label} ${part.socket} scale must be > 0`);
  }
  if (payload.hide?.geosets) validateIds(payload.hide.geosets, `${label} hidden geoset`);
};

export function validateItemAppearanceDefinition(appearance: ItemAppearanceDefinition): void {
  nonEmpty(appearance.id, 'appearance id');
  validatePayload(appearance, appearance.id);
  if (appearance.compatibleBodyIds) validateIds(appearance.compatibleBodyIds, `${appearance.id} compatible body id`);
  for (const [bodyId, override] of Object.entries(appearance.bodyOverrides ?? {})) {
    nonEmpty(bodyId, `${appearance.id} body override id`);
    validatePayload(override, `${appearance.id}/${bodyId}`);
  }
}

/** Transmog affects only the visual lookup, never the gameplay item itself. */
export function effectiveAppearanceId(ref: EquippedItemAppearanceRef): string {
  return ref.appearanceOverrideId ?? ref.itemAppearanceId;
}

/** Resolves shared appearance data against one body, applying only explicitly authored body exceptions. */
export function resolveItemAppearance(appearance: ItemAppearanceDefinition, body: CharacterBodyContract): ResolvedItemAppearance {
  validateCharacterBodyContract(body);
  validateItemAppearanceDefinition(appearance);
  if (appearance.compatibleBodyIds && !appearance.compatibleBodyIds.includes(body.id)) {
    throw new Error(`character appearance: "${appearance.id}" is not compatible with body "${body.id}"`);
  }

  const override = appearance.bodyOverrides?.[body.id];
  const textures = override?.textures ?? appearance.textures ?? [];
  const attached = override?.attached ?? appearance.attached ?? [];
  const geosetSpec = { ...(appearance.geosets ?? {}), ...(override?.geosets ?? {}) };
  const hide = { ...(appearance.hide ?? {}), ...(override?.hide ?? {}) };

  const geosets: ResolvedCharacterGeoset[] = Object.entries(geosetSpec).map(([name, variant]) => {
    const group = body.geosetGroups[name];
    if (group === undefined) throw new Error(`character appearance: body "${body.id}" has no geoset group "${name}" required by "${appearance.id}"`);
    return { name, group, variant };
  });
  const resolvedAttached: ResolvedCharacterAttachment[] = attached.map((part) => ({ ...part, bodySocket: body.sockets[part.socket] }));

  for (const name of hide.geosets ?? []) {
    if (body.geosetGroups[name] === undefined) throw new Error(`character appearance: body "${body.id}" has no hideable geoset group "${name}" required by "${appearance.id}"`);
  }

  return { id: appearance.id, bodyId: body.id, textures, geosets, attached: resolvedAttached, hide };
}

export function resolveEquippedAppearance(ref: EquippedItemAppearanceRef, body: CharacterBodyContract, registry: ItemAppearanceRegistry): ResolvedItemAppearance {
  const id = effectiveAppearanceId(ref);
  const appearance = registry[id];
  if (!appearance) throw new Error(`character appearance: unknown appearance "${id}"`);
  return resolveItemAppearance(appearance, body);
}
