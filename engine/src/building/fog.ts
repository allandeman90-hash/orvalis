import { type Building, groupIsInterior } from './building';

/**
 * Interior fog of a building (the document's « MFOG », spec §167–§170).
 *
 * FROM THE SPEC:
 * - the root holds fog records: flags, a position, an inner and an outer radius, and for land fog an end distance,
 *   a start SCALAR and a colour (an underwater fog too); a group refers to up to 4 of them;
 * - record 0 is the base when the building's fog is active; the candidates are the records the CURRENT group
 *   refers to, whose flags & 1 == 0, and whose position is within their outer radius of the camera;
 * - a candidate's weight is w = 1 − (distance − inner) / (outer − inner), clamped to 0..1; candidates are folded
 *   so that nearer records have the stronger, final influence;
 * - fogStart = fogEnd × startScalar (not end − scalar);
 * - the scene's fog moves towards the interior target in about 4 seconds, not in one frame.
 *
 * OUR CHOICES (the document does not settle them):
 * - the building's fog is « active » while the camera's current group is a TRUE interior and the building has
 *   fog records; otherwise the scene keeps its own (outdoor) fog;
 * - folding = start from record 0, then blend towards each candidate by its weight, farthest candidate first;
 * - a record whose inner radius equals its outer one weighs 1 inside it;
 * - the underwater fog is not stored (no underwater rendering yet);
 * - the 4-second transition is linear, on colour, start and end; the very first target is taken at once.
 */
export interface BuildingFog {
  readonly flags: number;
  readonly position: readonly [number, number, number];
  readonly innerRadius: number;
  readonly outerRadius: number;
  /** Distance from which everything has the fog's colour. */
  readonly end: number;
  /** start = end × startScalar. 0..1 (1 excluded). */
  readonly startScalar: number;
  /** 0..1 each. */
  readonly color: readonly [number, number, number];
}

/** Bit 0 of a fog record's flags: the record is not a candidate (the document gives the test, not a name). */
export const BUILDING_FOG_FLAG_SKIP = 0x01;
export const MAX_GROUP_FOGS = 4;
export const FOG_TRANSITION_SECONDS = 4;

/** A fog ready for the renderers. */
export interface ResolvedFog {
  readonly color: readonly [number, number, number];
  readonly start: number;
  readonly end: number;
}

export const resolveFog = (fog: BuildingFog): ResolvedFog => ({ color: fog.color, start: fog.end * fog.startScalar, end: fog.end });

export function mixFog(a: ResolvedFog, b: ResolvedFog, t: number): ResolvedFog {
  const m = (x: number, y: number): number => x + (y - x) * t;
  return { color: [m(a.color[0], b.color[0]), m(a.color[1], b.color[1]), m(a.color[2], b.color[2])], start: m(a.start, b.start), end: m(a.end, b.end) };
}

export function validateBuildingFogs(building: Building): void {
  const fail = (message: string): never => {
    throw new Error(`building "${building.name}": ${message}`);
  };
  const fogs = building.fogs ?? [];
  fogs.forEach((fog, index) => {
    if (![fog.flags, ...fog.position, fog.innerRadius, fog.outerRadius, fog.end, fog.startScalar, ...fog.color].every(Number.isFinite)) fail(`fog ${index} has a value that is not finite`);
    if (fog.innerRadius < 0 || fog.outerRadius < fog.innerRadius) fail(`fog ${index} needs 0 ≤ inner radius ≤ outer radius (got ${fog.innerRadius}, ${fog.outerRadius})`);
    if (!(fog.end > 0) || !(fog.startScalar >= 0 && fog.startScalar < 1)) fail(`fog ${index} needs an end > 0 and a start scalar in 0..1, 1 excluded (got ${fog.end}, ${fog.startScalar})`);
    if (!fog.color.every((c) => c >= 0 && c <= 1)) fail(`fog ${index} needs a colour in 0..1`);
  });
  building.groups.forEach((group, g) => {
    const indices = group.fogIndices ?? [];
    if (indices.length > MAX_GROUP_FOGS) fail(`group ${g} ("${group.name}") refers to ${indices.length} fogs, at most ${MAX_GROUP_FOGS}`);
    for (const index of indices) if (!Number.isInteger(index) || index < 0 || index >= fogs.length) fail(`group ${g} ("${group.name}") refers to fog ${index} but the building has ${fogs.length}`);
  });
}

/** Weight of a fog record for a camera at `distance` from its position (§168). */
export function fogWeight(fog: BuildingFog, distance: number): number {
  if (fog.outerRadius === fog.innerRadius) return distance <= fog.innerRadius ? 1 : 0;
  return Math.min(1, Math.max(0, 1 - (distance - fog.innerRadius) / (fog.outerRadius - fog.innerRadius)));
}

/**
 * The building's fog for a camera in `group`, or null when the building's fog is not active there (no group, a
 * group that is not a true interior, or a building without fog records).
 */
export function selectBuildingFog(building: Building, group: number | undefined, eye: readonly [number, number, number]): ResolvedFog | null {
  const fogs = building.fogs ?? [];
  if (group === undefined || fogs.length === 0) return null;
  const g = building.groups[group];
  if (!g) throw new Error(`building "${building.name}": no group ${group}`);
  if (!groupIsInterior(g.flags)) return null;
  const candidates = [...new Set(g.fogIndices ?? [])]
    .map((index) => ({ fog: fogs[index]!, distance: Math.hypot(eye[0] - fogs[index]!.position[0], eye[1] - fogs[index]!.position[1], eye[2] - fogs[index]!.position[2]) }))
    .filter(({ fog, distance }) => (fog.flags & BUILDING_FOG_FLAG_SKIP) === 0 && distance <= fog.outerRadius)
    .sort((a, b) => b.distance - a.distance); // farthest first: the nearest is folded last
  let result = resolveFog(fogs[0]!);
  for (const { fog, distance } of candidates) result = mixFog(result, resolveFog(fog), fogWeight(fog, distance));
  return result;
}

/** Moves the scene's fog towards its target in FOG_TRANSITION_SECONDS (spec §170). */
export class FogTransition {
  private from: ResolvedFog | null = null;
  private target: ResolvedFog | null = null;
  private progress = 1;

  constructor(readonly seconds = FOG_TRANSITION_SECONDS) {
    if (!(seconds > 0) || !Number.isFinite(seconds)) throw new Error(`fog transition: the duration must be finite and > 0 (got ${seconds})`);
  }

  /** 0 = just started, 1 = arrived. */
  get blend(): number {
    return this.progress;
  }

  /** The fog now; null before any target was given. */
  get value(): ResolvedFog | null {
    if (!this.target) return null;
    return this.from && this.progress < 1 ? mixFog(this.from, this.target, this.progress) : this.target;
  }

  /** A new target starts a new transition from the current fog; the same target changes nothing. */
  setTarget(target: ResolvedFog): void {
    const now = this.target;
    if (now && now.start === target.start && now.end === target.end && now.color.every((c, k) => c === target.color[k])) return;
    this.from = this.value;
    this.target = target;
    this.progress = this.from ? 0 : 1;
  }

  advance(dtMs: number): void {
    if (!(dtMs >= 0)) throw new Error(`fog transition: the time step must be ≥ 0 (got ${dtMs})`);
    this.progress = Math.min(1, this.progress + dtMs / (this.seconds * 1000));
  }
}
