import { BUILDING_GROUP_FLAG, type Building } from './building';
import type { BuildingCollision } from './collision';

/**
 * Portals of a building and the room the camera is in (spec §140–§151).
 *
 * FROM THE SPEC:
 * - three root tables: a shared pool of portal VERTICES (3 floats each, building space); PORTALS (a span of that
 *   pool — a planar polygon of at least 3 vertices — and a plane [nx, ny, nz, d], signed distance of a point
 *   p = dot(n, p) + d); and REFERENCES (portal, neighbour group, side ±) — the graph edge « this group → portal →
 *   neighbour »; each group owns a small contiguous slice of the references;
 * - side test (§153): d = dot(n, eye) + distance, negated when the reference's side is < 0; d ≥ 0 = the eye is on
 *   that group's side of the portal;
 * - the CURRENT ROOM is not a bounding-box test: a ray goes straight down from the eye (1760 yards) and two tests
 *   race — leg A, the nearest WALKING-collision face of any orientation; leg B, the nearest portal polygon crossed
 *   (z = −(nx·x + ny·y + d) / nz, at or below the eye, inside the polygon). A portal wins when it beats or ties
 *   the collision hit within 1e-4;
 * - a portal whose plane is nearly parallel to the ray (|nz| < 1e-4: a doorway) counts as crossed only while the
 *   eye is within 0.1 yard of its plane;
 * - the terrain under the eye takes part: strictly nearer than the building's hit, it wins and the camera is outside;
 * - the result holds 0 groups (outside), 1 (a room) or 2 (the nearest crossing is a portal: the group on the eye's
 *   side and the group across);
 * - a winning group flagged EXTERIOR (0x08) means outside; exterior-lit (0x40) alone still counts as a room.
 *
 * OUR CHOICES (the document does not settle them):
 * - a doorway within reach is « crossed » at distance 0 (at the eye itself), and only when the eye's projection on
 *   its plane is inside the polygon;
 * - with two groups, the EXTERIOR rule is applied to the group on the eye's side;
 * - a reference's side must be +1 or −1; a portal no group refers to takes no part;
 * - the polygon test drops the plane's dominant axis and counts edge crossings (the polygon may be concave);
 * - yards → engine units by `unitsPerYard` (default 1), as elsewhere.
 */
export interface BuildingPortal {
  /** First vertex in the building's portalVertices, and how many (≥ 3). */
  readonly startVertex: number;
  readonly vertexCount: number;
  /** [nx, ny, nz, d], unit normal. */
  readonly plane: readonly [number, number, number, number];
}

export interface BuildingPortalRef {
  readonly portal: number;
  readonly neighborGroup: number;
  /** +1: the owning group is on the positive side of the portal's plane; −1: on the negative side. */
  readonly side: number;
}

export const ROOM_RAY_YARDS = 1760;
export const ROOM_HIT_TOLERANCE = 1e-4;
export const DOORWAY_PARALLEL_THRESHOLD = 1e-4;
export const DOORWAY_SNAP_YARDS = 0.1;

type Vec = readonly [number, number, number];

export const portalSignedDistance = (portal: BuildingPortal, p: Vec): number => portal.plane[0] * p[0] + portal.plane[1] * p[1] + portal.plane[2] * p[2] + portal.plane[3];

/** The references a group owns: its edges of the portal graph. */
export function groupPortalRefs(building: Building, group: number): readonly BuildingPortalRef[] {
  const g = building.groups[group];
  if (!g) throw new Error(`building "${building.name}": no group ${group}`);
  return (building.portalRefs ?? []).slice(g.portalRefStart ?? 0, (g.portalRefStart ?? 0) + (g.portalRefCount ?? 0));
}

/** The groups one portal away from `group`, each once, ascending. */
export function portalNeighbors(building: Building, group: number): number[] {
  return [...new Set(groupPortalRefs(building, group).map((ref) => ref.neighborGroup))].sort((a, b) => a - b);
}

export function validateBuildingPortals(building: Building): void {
  const fail = (message: string): never => {
    throw new Error(`building "${building.name}": ${message}`);
  };
  const vertices = building.portalVertices ?? new Float32Array(0), portals = building.portals ?? [], refs = building.portalRefs ?? [];
  if (vertices.length % 3 !== 0 || !vertices.every(Number.isFinite)) fail('portal vertices must be finite, 3 floats each');
  portals.forEach((portal, index) => {
    if (!Number.isInteger(portal.startVertex) || !Number.isInteger(portal.vertexCount) || portal.startVertex < 0 || portal.vertexCount < 3 || (portal.startVertex + portal.vertexCount) * 3 > vertices.length) fail(`portal ${index} needs at least 3 vertices inside the pool (got ${portal.startVertex}..${portal.startVertex + portal.vertexCount} of ${vertices.length / 3})`);
    if (Math.abs(Math.hypot(portal.plane[0], portal.plane[1], portal.plane[2]) - 1) > 1e-3 || !Number.isFinite(portal.plane[3])) fail(`portal ${index} needs a unit plane normal and a finite distance`);
    for (let v = portal.startVertex; v < portal.startVertex + portal.vertexCount; v++) {
      if (Math.abs(portalSignedDistance(portal, [vertices[v * 3]!, vertices[v * 3 + 1]!, vertices[v * 3 + 2]!])) > 1e-3) fail(`portal ${index}: vertex ${v} is not on the portal's plane`);
    }
  });
  refs.forEach((ref, index) => {
    if (!Number.isInteger(ref.portal) || ref.portal < 0 || ref.portal >= portals.length) fail(`portal reference ${index} names portal ${ref.portal} but the building has ${portals.length}`);
    if (!Number.isInteger(ref.neighborGroup) || ref.neighborGroup < 0 || ref.neighborGroup >= building.groups.length) fail(`portal reference ${index} names group ${ref.neighborGroup} but the building has ${building.groups.length}`);
    if (ref.side !== 1 && ref.side !== -1) fail(`portal reference ${index} needs a side of +1 or −1 (got ${ref.side})`);
  });
  building.groups.forEach((group, g) => {
    const start = group.portalRefStart ?? 0, count = group.portalRefCount ?? 0;
    if (!Number.isInteger(start) || !Number.isInteger(count) || start < 0 || count < 0 || start + count > refs.length) fail(`group ${g} ("${group.name}") owns portal references ${start}..${start + count}, outside the ${refs.length} references`);
    for (let r = start; r < start + count; r++) if (refs[r]!.neighborGroup === g) fail(`group ${g} ("${group.name}"): portal reference ${r} leads back to the group itself`);
  });
}

/** Is the point (already on the portal's plane, or to be projected along the plane's dominant axis) inside the polygon. */
export function pointInPortal(building: Building, portal: BuildingPortal, p: Vec): boolean {
  const vertices = building.portalVertices!, n = portal.plane;
  // Drop the axis the plane faces most: the polygon keeps its shape in the other two.
  const drop = Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2]) ? 0 : Math.abs(n[1]) >= Math.abs(n[2]) ? 1 : 2;
  const a = (drop + 1) % 3, b = (drop + 2) % 3, pa = p[a]!, pb = p[b]!;
  let inside = false;
  for (let k = 0, last = portal.vertexCount - 1; k < portal.vertexCount; last = k++) {
    const i = (portal.startVertex + k) * 3, j = (portal.startVertex + last) * 3;
    const ia = vertices[i + a]!, ib = vertices[i + b]!, ja = vertices[j + a]!, jb = vertices[j + b]!;
    // On an edge counts as inside.
    const cross = (ja - ia) * (pb - ib) - (jb - ib) * (pa - ia);
    if (Math.abs(cross) < 1e-9 && pa >= Math.min(ia, ja) - 1e-9 && pa <= Math.max(ia, ja) + 1e-9 && pb >= Math.min(ib, jb) - 1e-9 && pb <= Math.max(ib, jb) + 1e-9) return true;
    if (ib > pb !== jb > pb && pa < ((ja - ia) * (pb - ib)) / (jb - ib) + ia) inside = !inside;
  }
  return inside;
}

export type RoomCause = 'nothing' | 'collision' | 'portal' | 'terrain' | 'exterior';

export interface CurrentRoom {
  /** 0 groups = outside; 1 = a room; 2 = in a portal: [the group on the eye's side, the group across]. */
  readonly groups: readonly number[];
  /**
   * What decided: 'nothing' is under the eye · a 'collision' face · a 'portal' · the 'terrain' was nearer ·
   * the winning group is an 'exterior' one.
   */
  readonly cause: RoomCause;
  /** Distance below the eye of what won (0 for a doorway the eye stands in); undefined for 'nothing'. */
  readonly distance?: number | undefined;
  /** The group whose face or portal side won, even when the answer is « outside » because it is exterior. */
  readonly hitGroup?: number | undefined;
  readonly portal?: number | undefined;
}

export interface CurrentRoomOptions {
  /** Height of the terrain under the eye (same space as the eye); absent or null = no terrain there (a hole). */
  readonly terrainHeight?: number | null | undefined;
  readonly unitsPerYard?: number | undefined;
}

/** The room(s) the eye is in. `eye` is in the building's space; `collision` must be this building's. */
export function findCurrentRoom(building: Building, collision: BuildingCollision, eye: Vec, options: CurrentRoomOptions = {}): CurrentRoom {
  if (collision.building !== building) throw new Error('current room: the collision sets belong to another building');
  const unitsPerYard = options.unitsPerYard ?? 1;
  if (!(unitsPerYard > 0) || !Number.isFinite(unitsPerYard)) throw new Error(`current room: unitsPerYard must be finite and > 0 (got ${unitsPerYard})`);
  const reach = ROOM_RAY_YARDS * unitsPerYard, snap = DOORWAY_SNAP_YARDS * unitsPerYard;
  // Leg A: the nearest walking-collision face below the eye, whatever its slope.
  const face = collision.raycast(eye, [0, 0, -1], reach, 'player');
  // Leg B: the nearest portal crossed by the same ray.
  let portalDistance = Infinity, portalIndex = -1;
  (building.portals ?? []).forEach((portal, index) => {
    const [nx, ny, nz, d] = portal.plane;
    let distance: number;
    if (Math.abs(nz) < DOORWAY_PARALLEL_THRESHOLD) {
      // A doorway: the ray cannot cross it. It counts only while the eye stands in it.
      const signed = portalSignedDistance(portal, eye);
      if (Math.abs(signed) > snap || !pointInPortal(building, portal, [eye[0] - nx * signed, eye[1] - ny * signed, eye[2] - nz * signed])) return;
      distance = 0;
    } else {
      const z = -(nx * eye[0] + ny * eye[1] + d) / nz;
      distance = eye[2] - z;
      if (!(distance >= 0 && distance <= reach) || !pointInPortal(building, portal, [eye[0], eye[1], z])) return;
    }
    if (distance < portalDistance && portalSeeds(building, index, eye)) {
      portalDistance = distance;
      portalIndex = index;
    }
  });
  const portalWins = portalIndex >= 0 && (!face || portalDistance <= face.distance + ROOM_HIT_TOLERANCE);
  if (!portalWins && !face) return { groups: [], cause: 'nothing' };
  const distance = portalWins ? portalDistance : face!.distance;
  // The terrain races too: strictly nearer to the eye, it wins.
  const terrain = options.terrainHeight;
  if (terrain !== undefined && terrain !== null && eye[2] - terrain >= 0 && eye[2] - terrain < distance) return { groups: [], cause: 'terrain', distance: eye[2] - terrain };
  const exterior = (group: number): boolean => (building.groups[group]!.flags & BUILDING_GROUP_FLAG.exterior) !== 0;
  if (portalWins) {
    const [near, across] = portalSeeds(building, portalIndex, eye)!;
    if (exterior(near)) return { groups: [], cause: 'exterior', distance, hitGroup: near, portal: portalIndex };
    return { groups: [near, across], cause: 'portal', distance, hitGroup: near, portal: portalIndex };
  }
  if (exterior(face!.group)) return { groups: [], cause: 'exterior', distance, hitGroup: face!.group };
  return { groups: [face!.group], cause: 'collision', distance, hitGroup: face!.group };
}

/** For a portal: [the group on the eye's side, the group across], from the first reference whose side test passes. */
function portalSeeds(building: Building, portal: number, eye: Vec): [number, number] | null {
  const signed = portalSignedDistance(building.portals![portal]!, eye), refs = building.portalRefs ?? [];
  for (let g = 0; g < building.groups.length; g++) {
    const group = building.groups[g]!, start = group.portalRefStart ?? 0;
    for (let r = start; r < start + (group.portalRefCount ?? 0); r++) {
      const ref = refs[r]!;
      if (ref.portal === portal && (ref.side < 0 ? -signed : signed) >= 0) return [g, ref.neighborGroup];
    }
  }
  return null;
}
