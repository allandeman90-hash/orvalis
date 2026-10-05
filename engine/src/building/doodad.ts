import { mat4, type Mat4, quat } from '../math';
import type { Building } from './building';

/**
 * Props placed in a building (the document's « WMO doodads », spec §118–§120, §165).
 *
 * FROM THE SPEC:
 * - chairs, lamps, banners… are NOT baked into the walls: the root lists placed MODELS, each with a model, a
 *   position, an orientation quaternion, a UNIFORM scale and an authored colour, positioned in the building's space;
 * - a doodad SET is a range (start, count) of the building's one doodad list; set 0 is the global, always-present
 *   set, and ONE additional set is chosen by the placement of the building;
 * - each group lists the doodads it shows; a doodad may be listed by several groups;
 * - doodads are submitted from the VISIBLE groups' lists: a doodad is drawn when ANY group listing it is visible.
 *
 * OUR CHOICES (the document does not settle them):
 * - the selected set is an index into the sets: 0 = the global set alone, n > 0 = the global set plus set n;
 * - a doodad that no group lists could never be drawn: validateBuilding() rejects it, as an authoring mistake;
 *   a doodad may be outside every set (it is then never active) and sets may overlap — the document says only
 *   that sets are ranges;
 * - identical doodads share one uploaded model (see BuildingDoodads in buildingRender);
 * - the authored colour is the prop's LIGHT when it stands in a true interior (see BuildingDoodads): the document
 *   does not say how the colour enters the lighting; under the sun it is not used.
 */
export interface BuildingDoodad {
  /** Index into the building's doodadModels. */
  readonly model: number;
  /** In the building's space. */
  readonly position: readonly [number, number, number];
  /** Quaternion (x, y, z, w); normalized when the matrix is built. */
  readonly rotation: readonly [number, number, number, number];
  /** Uniform scale, > 0. */
  readonly scale: number;
  /** Authored colour (r, g, b, a), 0..255: the prop's light inside a true interior. */
  readonly color: readonly [number, number, number, number];
}

export interface BuildingDoodadSet {
  readonly name: string;
  /** First doodad of the set in the building's list. */
  readonly start: number;
  readonly count: number;
}

export function validateBuildingDoodads(building: Building): void {
  const fail = (message: string): never => {
    throw new Error(`building "${building.name}": ${message}`);
  };
  const models = building.doodadModels ?? [], doodads = building.doodads ?? [], sets = building.doodadSets ?? [];
  if (doodads.length > 0 && sets.length === 0) fail('has doodads but no doodad set (set 0 is the global set)');
  doodads.forEach((doodad, index) => {
    if (!Number.isInteger(doodad.model) || doodad.model < 0 || doodad.model >= models.length) fail(`doodad ${index} refers to model ${doodad.model} but the building names ${models.length}`);
    if (![...doodad.position, ...doodad.rotation, doodad.scale].every(Number.isFinite)) fail(`doodad ${index} has a value that is not finite`);
    if (!(Math.hypot(...doodad.rotation) > 0)) fail(`doodad ${index} has a zero quaternion`);
    if (!(doodad.scale > 0)) fail(`doodad ${index} needs a scale > 0 (got ${doodad.scale})`);
    if (doodad.color.length !== 4 || !doodad.color.every((c) => Number.isInteger(c) && c >= 0 && c <= 255)) fail(`doodad ${index} needs a colour of 4 bytes`);
  });
  sets.forEach((set, index) => {
    if (!Number.isInteger(set.start) || !Number.isInteger(set.count) || set.start < 0 || set.count < 0 || set.start + set.count > doodads.length) fail(`doodad set ${index} ("${set.name}") covers ${set.start}..${set.start + set.count}, outside the ${doodads.length} doodads`);
  });
  const listed = new Set<number>();
  building.groups.forEach((group, g) => {
    for (const ref of group.doodadRefs ?? []) {
      if (!Number.isInteger(ref) || ref < 0 || ref >= doodads.length) fail(`group ${g} ("${group.name}") lists doodad ${ref} but the building has ${doodads.length}`);
      listed.add(ref);
    }
  });
  doodads.forEach((_, index) => {
    if (!listed.has(index)) fail(`doodad ${index} is listed by no group: it could never be drawn`);
  });
}

/** Is doodad `index` part of what set `selectedSet` shows: the global set 0, plus the selected set. */
export function doodadIsActive(building: Building, index: number, selectedSet: number): boolean {
  const sets = building.doodadSets ?? [];
  if (!Number.isInteger(selectedSet) || selectedSet < 0 || selectedSet >= Math.max(1, sets.length)) throw new Error(`building "${building.name}": no doodad set ${selectedSet} (it has ${sets.length})`);
  const inSet = (set: BuildingDoodadSet | undefined): boolean => set !== undefined && index >= set.start && index < set.start + set.count;
  return inSet(sets[0]) || (selectedSet > 0 && inSet(sets[selectedSet]));
}

/**
 * The doodads to draw, each once, in list order: active for the selected set AND listed by at least one visible
 * group (spec §165). `visibleGroups` absent = every group is visible.
 */
export function visibleDoodads(building: Building, selectedSet: number, visibleGroups?: ReadonlySet<number>): number[] {
  const seen = new Set<number>();
  doodadIsActive(building, 0, selectedSet); // validates the set
  building.groups.forEach((group, g) => {
    if (visibleGroups && !visibleGroups.has(g)) return;
    for (const ref of group.doodadRefs ?? []) if (doodadIsActive(building, ref, selectedSet)) seen.add(ref);
  });
  return [...seen].sort((a, b) => a - b);
}

const rotation = quat.create(), scratch = mat4.create();

/** Doodad → building space: scale, then rotation, then translation. */
export function doodadMatrix(doodad: BuildingDoodad, out: Mat4 = mat4.create()): Mat4 {
  quat.normalize(rotation, quat.set(rotation, doodad.rotation[0], doodad.rotation[1], doodad.rotation[2], doodad.rotation[3]));
  quat.toMat4(scratch, rotation);
  for (let k = 0; k < 12; k++) out[k] = scratch[k]! * doodad.scale;
  out[12] = doodad.position[0]; out[13] = doodad.position[1]; out[14] = doodad.position[2]; out[15] = 1;
  return out;
}
