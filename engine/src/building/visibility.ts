import type { Mat4 } from '../math';
import { BUILDING_GROUP_FLAG, type Building } from './building';
import { pointInPortal, portalSignedDistance } from './portal';

/**
 * Which groups of a building can be seen: the portal flood (spec §152–§164).
 *
 * FROM THE SPEC:
 * - seeds (the current room's groups) start with the FULL screen [−1, −1, 1, 1]; a group popped from the stack is
 *   visible; each of its portals is rejected when the eye is on the wrong side (d = dot(n, eye) + distance, negated
 *   for side < 0; d < 0 rejects, exactly 0 passes), else its polygon is projected to a screen rectangle, which is
 *   intersected with the inherited one; when something survives the neighbour is pushed with the smaller rectangle;
 * - the polygon is clipped against the four SIDE planes of the view pyramid (Sutherland–Hodgman), NOT against the
 *   near plane; a vertex with |w| < 0.001 gets w = 0.00001;
 * - an eye inside the portal polygon and within 0.01 yard of its plane gives that portal the full screen;
 * - a branch dies when the intersection is narrower or lower than 0.001 NDC units;
 * - recursion depth is capped at 64;
 * - camera outside (no seed): the EXTERIOR groups (0x08) are the full-screen roots, interiors appear through
 *   their portals;
 * - camera inside: the outside world is visible only when the flood reaches an exterior group; each such opening
 *   is an « exterior window » (a screen rectangle); and then EVERY exterior group may draw, connected or not
 *   (disconnected shell geometry must not vanish).
 *
 * OUR CHOICES (the document does not settle them):
 * - a group reached again is flooded again only when its new rectangle is not inside one it was already flooded
 *   with (a smaller window can only show less);
 * - the per-group result also keeps the bounding rectangle of everything it was reached with;
 * - groups are NOT yet culled against the view frustum by their bounding boxes: only portals decide here;
 * - 0.01 yard → engine units by `unitsPerYard` (default 1).
 */
export type ScreenRect = readonly [minX: number, minY: number, maxX: number, maxY: number];
export const FULL_SCREEN: ScreenRect = [-1, -1, 1, 1];
export const PORTAL_W_CLAMP_BAND = 0.001;
export const PORTAL_W_CLAMP_VALUE = 0.00001;
export const PORTAL_ON_PLANE_YARDS = 0.01;
export const PORTAL_RECT_EPSILON = 0.001;
export const PORTAL_DEPTH_CAP = 64;

type Vec = readonly [number, number, number];
type Clip = [number, number, number]; // x, y, w (z is not needed: there is no near clip)

/** Clips a polygon (clip-space x, y, w) against the four side planes: −w ≤ x ≤ w, −w ≤ y ≤ w. */
export function clipPolygonToSides(polygon: readonly Clip[]): Clip[] {
  let current = [...polygon];
  // Signed « inside » amount for each plane: ≥ 0 is kept.
  const planes: ReadonlyArray<(p: Clip) => number> = [(p) => p[2] + p[0], (p) => p[2] - p[0], (p) => p[2] + p[1], (p) => p[2] - p[1]];
  for (const inside of planes) {
    const next: Clip[] = [];
    for (let k = 0; k < current.length; k++) {
      const a = current[k]!, b = current[(k + 1) % current.length]!, da = inside(a), db = inside(b);
      if (da >= 0) next.push(a);
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        next.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      }
    }
    current = next;
    if (current.length === 0) break;
  }
  return current;
}

/**
 * Screen rectangle of a portal for this view, or null when nothing of it is on screen.
 * @param viewProjection building space → clip space
 */
export function portalScreenRect(building: Building, portal: number, viewProjection: Mat4, eye: Vec, unitsPerYard = 1): ScreenRect | null {
  const p = building.portals![portal]!, pool = building.portalVertices!, m = viewProjection;
  const signed = portalSignedDistance(p, eye);
  if (Math.abs(signed) <= PORTAL_ON_PLANE_YARDS * unitsPerYard && pointInPortal(building, p, [eye[0] - p.plane[0] * signed, eye[1] - p.plane[1] * signed, eye[2] - p.plane[2] * signed])) return FULL_SCREEN;
  const polygon: Clip[] = [];
  for (let v = p.startVertex; v < p.startVertex + p.vertexCount; v++) {
    const x = pool[v * 3]!, y = pool[v * 3 + 1]!, z = pool[v * 3 + 2]!;
    polygon.push([m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[3]! * x + m[7]! * y + m[11]! * z + m[15]!]);
  }
  const clipped = clipPolygonToSides(polygon);
  if (clipped.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const vertex of clipped) {
    const w = Math.abs(vertex[2]) < PORTAL_W_CLAMP_BAND ? PORTAL_W_CLAMP_VALUE : vertex[2];
    const x = vertex[0] / w, y = vertex[1] / w;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  // The w clamp can throw a vertex far off screen: the window can never be larger than the screen.
  return [Math.max(-1, minX), Math.max(-1, minY), Math.min(1, maxX), Math.min(1, maxY)];
}

/** Intersection of two rectangles, or null when it is narrower or lower than PORTAL_RECT_EPSILON. */
export function intersectRects(a: ScreenRect, b: ScreenRect): ScreenRect | null {
  const rect: ScreenRect = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return rect[2] - rect[0] < PORTAL_RECT_EPSILON || rect[3] - rect[1] < PORTAL_RECT_EPSILON ? null : rect;
}

const contains = (outer: ScreenRect, inner: ScreenRect): boolean => inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];

export interface PortalFloodOptions {
  /** Building space → clip space (the view-projection times the building's placement). */
  readonly viewProjection: Mat4;
  /** The eye, in the building's space. */
  readonly eye: Vec;
  /** The current room's groups (findCurrentRoom().groups): none = the camera is outside. */
  readonly seeds: readonly number[];
  readonly unitsPerYard?: number | undefined;
}

export interface PortalFlood {
  /** One entry per group: 1 = may be seen this frame. Geometry, liquids and props follow it. */
  readonly visible: Uint8Array;
  /** Per group: the bounding rectangle of the windows it was reached through; null when it was not flooded. */
  readonly rects: ReadonlyArray<ScreenRect | null>;
  /** The groups the flood started from. */
  readonly roots: readonly number[];
  /** Is the world outside the building visible: always from outside, and from inside once an exterior group is reached. */
  readonly outsideVisible: boolean;
  /** From inside: the screen rectangles through which the outside is seen. Empty from outside (the whole screen is). */
  readonly exteriorWindows: readonly ScreenRect[];
  /** Portals whose window survived and was followed. */
  readonly portalsFollowed: number;
  /** Deepest chain of portals followed. */
  readonly depth: number;
}

export function floodPortals(building: Building, options: PortalFloodOptions): PortalFlood {
  const groups = building.groups, refs = building.portalRefs ?? [], unitsPerYard = options.unitsPerYard ?? 1;
  const isExterior = (g: number): boolean => (groups[g]!.flags & BUILDING_GROUP_FLAG.exterior) !== 0;
  for (const seed of options.seeds) if (!Number.isInteger(seed) || seed < 0 || seed >= groups.length) throw new Error(`portal flood: building "${building.name}" has no group ${seed}`);
  const inside = options.seeds.length > 0;
  const roots = inside ? [...new Set(options.seeds)] : groups.flatMap((_, g) => (isExterior(g) ? [g] : []));
  const visible = new Uint8Array(groups.length), rects: Array<ScreenRect | null> = groups.map(() => null);
  const flooded: ScreenRect[][] = groups.map(() => []);
  const exteriorWindows: ScreenRect[] = [];
  let portalsFollowed = 0, deepest = 0, reachedExterior = false;
  const stack: Array<{ group: number; rect: ScreenRect; depth: number }> = roots.map((group) => ({ group, rect: FULL_SCREEN, depth: 0 }));
  while (stack.length > 0) {
    const { group, rect, depth } = stack.pop()!;
    if (flooded[group]!.some((done) => contains(done, rect))) continue;
    flooded[group]!.push(rect);
    visible[group] = 1;
    const union = rects[group];
    rects[group] = union ? [Math.min(union[0], rect[0]), Math.min(union[1], rect[1]), Math.max(union[2], rect[2]), Math.max(union[3], rect[3])] : rect;
    if (inside && isExterior(group)) {
      reachedExterior = true;
      if (depth > 0) exteriorWindows.push(rect);
    }
    deepest = Math.max(deepest, depth);
    if (depth >= PORTAL_DEPTH_CAP) continue;
    const g = groups[group]!, start = g.portalRefStart ?? 0;
    for (let r = start; r < start + (g.portalRefCount ?? 0); r++) {
      const ref = refs[r]!;
      // Front-side test (§153): the eye must be on this group's side of the portal. Exactly 0 passes.
      const signed = portalSignedDistance(building.portals![ref.portal]!, options.eye);
      if ((ref.side < 0 ? -signed : signed) < 0) continue;
      const window = portalScreenRect(building, ref.portal, options.viewProjection, options.eye, unitsPerYard);
      const next = window && intersectRects(rect, window);
      if (!next) continue;
      portalsFollowed++;
      stack.push({ group: ref.neighborGroup, rect: next, depth: depth + 1 });
    }
  }
  // Exterior shell rule (§163): once the outside is reached from inside, every exterior group may draw.
  if (reachedExterior) groups.forEach((_, g) => {
    if (isExterior(g)) visible[g] = 1;
  });
  return { visible, rects, roots, outsideVisible: !inside || reachedExterior, exteriorWindows, portalsFollowed, depth: deepest };
}

/** The visible groups as a set of indices (what BuildingInstance.visibleGroups takes). */
export const visibleGroupSet = (flood: PortalFlood): Set<number> => new Set(Array.from(flood.visible).flatMap((on, g) => (on ? [g] : [])));
