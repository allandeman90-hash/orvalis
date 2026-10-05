import { type ModelMesh, modelSubmeshes } from '../model';

/**
 * Character geosets (spec §51, §55).
 *
 * FROM THE SPEC:
 * - a character is ONE base model whose optional sections (geosets) are shown or hidden — not one mesh per outfit;
 * - geoset ids come in groups 100 apart (the recovered group bases are 1, 101, 201 … 1501: 16 groups), so an id
 *   is a group and a variant: the model format must keep both;
 * - selection: 1. disable everything optional, 2. enable the baseline of each region, 3. apply hair and facial
 *   hair, 4. apply what the equipment changes (gloves, boots, robe…), 5. commit the visible set.
 *
 * OUR CHOICES (the document does not settle them):
 * - id = group × 100 + variant, variant 1..99; id 0 is the always-visible body;
 * - the baseline of a group is its variant 1;
 * - a variant that a model does not have simply shows nothing for that group (« no beard »);
 * - which group is which region: the document lists the 16 bases but NOT their meaning — the table below is
 *   our own and only names the groups this engine uses so far.
 */
export const GEOSET_GROUP_SIZE = 100;
export const GEOSET_GROUP_COUNT = 16;
export const BODY_GEOSET = 0;
export const BASELINE_VARIANT = 1;

/** OUR OWN group numbers. */
export const GEOSET_GROUP = { hair: 0, facialHair: 1, gloves: 4, boots: 5 } as const;
export type GeosetGroupName = keyof typeof GEOSET_GROUP;

export function geosetId(group: number, variant: number): number {
  if (!Number.isInteger(group) || group < 0 || group >= GEOSET_GROUP_COUNT) throw new Error(`geoset: group must be 0..${GEOSET_GROUP_COUNT - 1} (got ${group})`);
  if (!Number.isInteger(variant) || variant < 1 || variant >= GEOSET_GROUP_SIZE) throw new Error(`geoset: variant must be 1..${GEOSET_GROUP_SIZE - 1} (got ${variant})`);
  return group * GEOSET_GROUP_SIZE + variant;
}

export function geosetGroup(id: number): number {
  return Math.floor(id / GEOSET_GROUP_SIZE);
}

export function geosetVariant(id: number): number {
  return id % GEOSET_GROUP_SIZE;
}

/** The variant chosen for some groups; a group that is not mentioned shows its baseline. */
export type GeosetSelection = Readonly<Partial<Record<number, number>>>;

/**
 * Steps 1, 2 and 5 of the document's selection for a set of choices: the ids that are VISIBLE — the body, and for
 * every group its chosen variant (baseline when none is chosen).
 */
export function visibleGeosets(selection: GeosetSelection = {}): Set<number> {
  const visible = new Set<number>([BODY_GEOSET]);
  for (let group = 0; group < GEOSET_GROUP_COUNT; group++) visible.add(geosetId(group, selection[group] ?? BASELINE_VARIANT));
  for (const key of Object.keys(selection)) if (!(Number(key) >= 0 && Number(key) < GEOSET_GROUP_COUNT)) throw new Error(`geoset: unknown group ${key}`);
  return visible;
}

/** The geoset ids of a mesh that must NOT be drawn for a selection — what ModelInstance.hiddenGeosets takes. */
export function hiddenGeosetsOf(mesh: ModelMesh, selection: GeosetSelection = {}): Set<number> {
  const visible = visibleGeosets(selection), hidden = new Set<number>();
  for (const submesh of modelSubmeshes(mesh)) if (!visible.has(submesh.geosetId)) hidden.add(submesh.geosetId);
  return hidden;
}

/** The variants a mesh offers for a group, sorted. */
export function geosetVariantsOf(mesh: ModelMesh, group: number): number[] {
  const variants = new Set<number>();
  for (const submesh of modelSubmeshes(mesh)) if (submesh.geosetId !== BODY_GEOSET && geosetGroup(submesh.geosetId) === group) variants.add(geosetVariant(submesh.geosetId));
  return [...variants].sort((a, b) => a - b);
}

/** What a player chooses for the look of a character, as far as geosets go (spec §51: hairStyle, facialHair). */
export interface CharacterAppearance {
  /** 1 = the baseline style. */
  readonly hairStyle: number;
  /** 1 = none. */
  readonly facialHair: number;
}

/** What equipment changes in the geometry (spec §55 step 4); 1 = bare. Filled by the equipment system later (P5.3). */
export interface CharacterGeometryEquipment {
  readonly gloves: number;
  readonly boots: number;
}

export const DEFAULT_APPEARANCE: CharacterAppearance = { hairStyle: 1, facialHair: 1 };
export const NO_GEOMETRY_EQUIPMENT: CharacterGeometryEquipment = { gloves: 1, boots: 1 };

/** Steps 3 and 4 of the document's selection. */
export function characterGeosetSelection(appearance: CharacterAppearance = DEFAULT_APPEARANCE, equipment: CharacterGeometryEquipment = NO_GEOMETRY_EQUIPMENT): GeosetSelection {
  return { [GEOSET_GROUP.hair]: appearance.hairStyle, [GEOSET_GROUP.facialHair]: appearance.facialHair, [GEOSET_GROUP.gloves]: equipment.gloves, [GEOSET_GROUP.boots]: equipment.boots };
}
