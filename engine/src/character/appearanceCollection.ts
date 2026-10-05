import { EQUIPMENT_SLOTS, type EquipmentSlot } from './equipment';
import {
  resolveItemAppearance,
  type CharacterBodyContract,
  type EquippedItemAppearanceRef,
  type ItemAppearanceRegistry,
  type ResolvedItemAppearance,
} from './productionContract';

/**
 * Serializable visual collection boundary for transmog.
 *
 * This is an Orvalis product rule, not a Vanilla 1.12.1 rule: Vanilla did not have a transmog collection.
 * Persistence owns storing this snapshot later; the renderer only receives resolved appearances.
 */
export interface AppearanceCollectionSnapshot {
  readonly unlockedAppearanceIds: readonly string[];
}

/** Visual-only equipment state. No gameplay item id, stats, durability, requirements or inventory data live here. */
export type EquippedAppearanceState = Readonly<Partial<Record<EquipmentSlot, EquippedItemAppearanceRef>>>;

/** Runtime-ready visual state after collection/body/registry policy has been resolved. */
export type ResolvedAppearanceState = Readonly<Partial<Record<EquipmentSlot, ResolvedItemAppearance>>>;

const nonEmpty = (value: string, label: string): void => {
  if (value.trim().length === 0) throw new Error(`appearance collection: ${label} must not be empty`);
};

/**
 * Validates only the persisted shape. Unknown ids are intentionally tolerated here so old/deprecated content does
 * not make an entire saved collection unreadable. Whether the id can be USED is checked against the live registry.
 */
export function validateAppearanceCollection(collection: AppearanceCollectionSnapshot): void {
  const seen = new Set<string>();
  for (const id of collection.unlockedAppearanceIds) {
    nonEmpty(id, 'appearance id');
    if (seen.has(id)) throw new Error(`appearance collection: duplicate appearance id "${id}"`);
    seen.add(id);
  }
}

export function isAppearanceUnlocked(collection: AppearanceCollectionSnapshot, appearanceId: string): boolean {
  validateAppearanceCollection(collection);
  return collection.unlockedAppearanceIds.includes(appearanceId);
}

/**
 * Pure persistence-friendly unlock operation. Unknown appearances cannot be newly unlocked, while an already
 * persisted unknown id may remain in an old snapshot until a later migration chooses what to do with it.
 */
export function unlockAppearance(collection: AppearanceCollectionSnapshot, appearanceId: string, registry: ItemAppearanceRegistry): AppearanceCollectionSnapshot {
  validateAppearanceCollection(collection);
  nonEmpty(appearanceId, 'appearance id');
  if (!registry[appearanceId]) throw new Error(`appearance collection: cannot unlock unknown appearance "${appearanceId}"`);
  if (collection.unlockedAppearanceIds.includes(appearanceId)) return collection;
  return { unlockedAppearanceIds: [...collection.unlockedAppearanceIds, appearanceId] };
}

/**
 * Resolves one equipped item's visual under the Orvalis transmog policy.
 *
 * - The item's native appearance is allowed without a collection unlock: owning/equipping the item is enough to
 *   render what the item actually looks like.
 * - A transmog override is optional, but when present it must be both known by the current content registry and
 *   unlocked in the collection.
 * - Body compatibility and body-specific overrides remain the responsibility of resolveItemAppearance().
 */
export function resolveCollectedEquippedAppearance(
  ref: EquippedItemAppearanceRef,
  body: CharacterBodyContract,
  registry: ItemAppearanceRegistry,
  collection: AppearanceCollectionSnapshot,
): ResolvedItemAppearance {
  validateAppearanceCollection(collection);

  const native = registry[ref.itemAppearanceId];
  if (!native) throw new Error(`appearance collection: unknown item appearance "${ref.itemAppearanceId}"`);

  const overrideId = ref.appearanceOverrideId;
  if (overrideId === undefined || overrideId === null) return resolveItemAppearance(native, body);

  const override = registry[overrideId];
  if (!override) throw new Error(`appearance collection: unknown transmog appearance "${overrideId}"`);
  if (!collection.unlockedAppearanceIds.includes(overrideId)) {
    throw new Error(`appearance collection: transmog appearance "${overrideId}" is locked`);
  }
  return resolveItemAppearance(override, body);
}

/**
 * Resolves the whole visual equipment map without importing gameplay equipment state into the renderer boundary.
 * Unknown runtime keys are rejected even though normal TypeScript callers cannot construct them accidentally.
 */
export function resolveAppearanceState(
  state: EquippedAppearanceState,
  body: CharacterBodyContract,
  registry: ItemAppearanceRegistry,
  collection: AppearanceCollectionSnapshot,
): ResolvedAppearanceState {
  validateAppearanceCollection(collection);

  for (const key of Object.keys(state)) {
    if (!EQUIPMENT_SLOTS.includes(key as EquipmentSlot)) throw new Error(`appearance collection: unknown equipment slot "${key}"`);
  }

  const resolved: Partial<Record<EquipmentSlot, ResolvedItemAppearance>> = {};
  for (const slot of EQUIPMENT_SLOTS) {
    const ref = state[slot];
    if (ref) resolved[slot] = resolveCollectedEquippedAppearance(ref, body, registry, collection);
  }
  return resolved;
}
