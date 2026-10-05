import { describe, expect, it } from 'vitest';
import {
  type Building, BUILDING_GROUP_FLAG, buildCottage, BuildingCollision, BuildingGroupBuilder, clipPolygonToSides, COTTAGE_GROUP, COTTAGE_PORTAL, findCurrentRoom, floodPortals, FULL_SCREEN, intersectRects, PORTAL_DEPTH_CAP,
  PORTAL_ON_PLANE_YARDS, PORTAL_RECT_EPSILON, PORTAL_W_CLAMP_BAND, PORTAL_W_CLAMP_VALUE, portalScreenRect, visibleGroupSet,
} from '../../src/building';
import { type LookAtCamera, viewProjectionMatrix, WORLD_UP } from '../../src/camera';
import { formatOverlay } from '../../src/debug';
import { DepthRange, mat4, vec3 } from '../../src/math';
import { NullBackend } from '../../src/renderer';
import { createBuildingScene } from '../../src/scenes/buildingScene';
import { parseSceneRequest } from '../../src/scenes/select';

const cottage = buildCottage('solid');
const G = COTTAGE_GROUP, P = COTTAGE_PORTAL;
const collision = new BuildingCollision(cottage);

/** A camera at `eye` looking towards `target`, 60° high, 16:9. */
function view(eye: [number, number, number], target: [number, number, number]) {
  const camera: LookAtCamera = { eye: vec3.create(...eye), target: vec3.create(...target), up: WORLD_UP, fovY: Math.PI / 3, near: 0.05, far: 200 };
  return { viewProjection: viewProjectionMatrix(mat4.create(), camera, 16 / 9, DepthRange.NegOneToOne), eye };
}
const floodFrom = (building: Building, eye: [number, number, number], target: [number, number, number], seeds?: number[]) => {
  const v = view(eye, target);
  return floodPortals(building, { ...v, seeds: seeds ?? findCurrentRoom(building, building === cottage ? collision : new BuildingCollision(building), eye).groups });
};
const seen = (flood: ReturnType<typeof floodPortals>): number[] => [...visibleGroupSet(flood)].sort((a, b) => a - b);

describe('portal flood constants (spec §156–§159)', () => {
  it('are the document’s', () => {
    expect([PORTAL_W_CLAMP_BAND, PORTAL_W_CLAMP_VALUE, PORTAL_ON_PLANE_YARDS, PORTAL_RECT_EPSILON, PORTAL_DEPTH_CAP]).toEqual([0.001, 0.00001, 0.01, 0.001, 64]);
    expect(FULL_SCREEN).toEqual([-1, -1, 1, 1]);
  });
});

describe('clipping against the four side planes (spec §155)', () => {
  it('a polygon wholly inside is unchanged; wholly outside one plane gives nothing', () => {
    const inside: Array<[number, number, number]> = [[-0.5, -0.5, 1], [0.5, -0.5, 1], [0.5, 0.5, 1], [-0.5, 0.5, 1]];
    expect(clipPolygonToSides(inside)).toEqual(inside);
    expect(clipPolygonToSides(inside.map(([x, y, w]) => [x + 3, y, w] as [number, number, number]))).toEqual([]);
  });
  it('cuts what crosses the right edge at x = w', () => {
    const clipped = clipPolygonToSides([[0, -0.5, 1], [2, -0.5, 1], [2, 0.5, 1], [0, 0.5, 1]]);
    expect(Math.max(...clipped.map((p) => p[0] / p[2]))).toBeCloseTo(1, 9);
    expect(Math.min(...clipped.map((p) => p[0] / p[2]))).toBeCloseTo(0, 9);
  });
  it('there is NO near clip, yet nothing behind the eye survives: −w ≤ x ≤ w forces w ≥ 0', () => {
    const clipped = clipPolygonToSides([[-0.2, -0.2, -1], [0.2, -0.2, -1], [0.2, 0.2, 3], [-0.2, 0.2, 3]]);
    expect(clipped.length).toBeGreaterThan(0);
    for (const p of clipped) expect(p[2]).toBeGreaterThanOrEqual(-1e-12);
  });
});

describe('portal screen rectangle (spec §154, §156, §157)', () => {
  it('the door seen from the middle of the room, looking at it: a rectangle around the screen’s centre', () => {
    const v = view([0, 0, 1.05], [0, -2.85, 1.05]);
    const rect = portalScreenRect(cottage, P.door, v.viewProjection, v.eye)!;
    // Door: 1.2 wide, 2.1 high, 2.85 away; the eye is at mid-height. tan(30°) = 0.5774 vertically, × 16/9 horizontally.
    expect(rect[2]).toBeCloseTo(0.6 / 2.85 / (Math.tan(Math.PI / 6) * (16 / 9)), 5);
    expect(rect[0]).toBeCloseTo(-rect[2], 5);
    expect(rect[3]).toBeCloseTo(1.05 / 2.85 / Math.tan(Math.PI / 6), 5);
    expect(rect[1]).toBeCloseTo(-rect[3], 5);
  });
  it('looking away from it: nothing', () => {
    const v = view([0, 0, 1.6], [0, 5, 1.6]);
    expect(portalScreenRect(cottage, P.door, v.viewProjection, v.eye)).toBeNull();
  });
  it('partly off screen: the rectangle stops at the screen’s edge', () => {
    const v = view([0, -1.5, 1.6], [3, -2.85, 1.6]);
    const rect = portalScreenRect(cottage, P.door, v.viewProjection, v.eye)!;
    expect(rect[0]).toBeGreaterThanOrEqual(-1);
    expect(rect[2]).toBeLessThanOrEqual(1);
    expect(rect[0] === -1 || rect[2] === 1).toBe(true);
  });
  it('the eye in the opening and within 0.01 of the plane: the FULL screen, whatever the direction', () => {
    const away = view([0, -2.845, 1.6], [0, 5, 1.6]);
    expect(portalScreenRect(cottage, P.door, away.viewProjection, away.eye)).toBe(FULL_SCREEN);
    const beside = view([1, -2.845, 1.6], [0, 5, 1.6]); // same plane distance, but not in the opening
    expect(portalScreenRect(cottage, P.door, beside.viewProjection, beside.eye)).not.toBe(FULL_SCREEN);
    const farther = view([0, -2.83, 1.6], [0, 5, 1.6]); // 0.02 from the plane
    expect(portalScreenRect(cottage, P.door, farther.viewProjection, farther.eye)).toBeNull();
  });
  it('a vertex with |w| < 0.001 is divided by 0.00001: the rectangle grows to the screen’s edge', () => {
    // Close to the plane (0.02: outside the on-plane rule) and looking along the wall: the door's near vertices have w ≈ 0.
    const v = view([0, -2.83, 1.0], [5, -2.83, 1.0]);
    const rect = portalScreenRect(cottage, P.door, v.viewProjection, v.eye);
    expect(rect).not.toBeNull();
    expect(rect![3] - rect![1]).toBeCloseTo(2, 6); // the whole height
  });
});

describe('rectangle intersection (spec §158)', () => {
  it('keeps the overlap', () => {
    expect(intersectRects([-1, -1, 1, 1], [-0.3, -0.7, 0.2, 0.6])).toEqual([-0.3, -0.7, 0.2, 0.6]);
    expect(intersectRects([-0.3, -0.7, 0.2, 0.6], [-0.1, -0.9, 0.5, 0.3])).toEqual([-0.1, -0.7, 0.2, 0.3]);
  });
  it('dies below 0.001 in width or height', () => {
    expect(intersectRects([0, 0, 0.5, 0.5], [0.6, 0, 1, 1])).toBeNull();
    expect(intersectRects([0, 0, 0.5, 0.5], [0.4995, 0, 1, 1])).toBeNull(); // 0.0005 wide
    expect(intersectRects([0, 0, 0.5, 0.5], [0.498, 0, 1, 1])).not.toBeNull(); // 0.002 wide
    expect(intersectRects([0, 0, 0.5, 0.5], [0, 0.4995, 1, 1])).toBeNull();
  });
});

describe('flood in the cottage', () => {
  it('in the room, back to the door and window: the room alone; the outside is not visible', () => {
    const flood = floodFrom(cottage, [0, 0, 1.6], [0, 5, 1.6]);
    expect(seen(flood)).toEqual([G.room]);
    expect([flood.roots, flood.outsideVisible, flood.portalsFollowed, flood.exteriorWindows]).toEqual([[G.room], false, 0, []]);
    expect(flood.rects[G.room]).toEqual(FULL_SCREEN);
    expect(flood.rects[G.shell]).toBeNull();
  });
  it('in the room, facing the door: the shell through it — and then EVERY exterior group, the unconnected shed too', () => {
    const flood = floodFrom(cottage, [0, 0, 1.6], [0, -5, 1.6]);
    expect(seen(flood)).toEqual([G.shell, G.room, G.shed]);
    expect(flood.outsideVisible).toBe(true);
    // Door and window are both on screen: two windows to the outside, each smaller than the screen.
    expect([flood.portalsFollowed, flood.exteriorWindows.length]).toEqual([2, 2]);
    for (const rect of flood.exteriorWindows) expect((rect[2] - rect[0]) * (rect[3] - rect[1])).toBeLessThan(4);
    expect(flood.rects[G.shed]).toBeNull(); // drawn by the shell rule, not reached through a portal
  });
  it('outside, in front of the house: the exterior groups are full-screen roots; the room shows through the openings', () => {
    const flood = floodFrom(cottage, [0, -12, 2], [0, 0, 1.5]);
    expect(flood.roots).toEqual([G.shell, G.shed]);
    expect(seen(flood)).toEqual([G.shell, G.room, G.shed]);
    expect([flood.outsideVisible, flood.exteriorWindows]).toEqual([true, []]);
    const room = flood.rects[G.room]!;
    expect(room[2] - room[0]).toBeLessThan(1); // only a part of the screen
  });
  it('outside, behind the house: the portals face away — the room is not drawn', () => {
    const flood = floodFrom(cottage, [0, 12, 2], [0, 0, 1.5]);
    expect(seen(flood)).toEqual([G.shell, G.shed]);
    expect(flood.portalsFollowed).toBe(0);
  });
  it('outside, in front but looking away: the openings are off screen — the room is not drawn', () => {
    expect(seen(floodFrom(cottage, [0, -12, 2], [0, -30, 2]))).toEqual([G.shell, G.shed]);
  });
  it('standing in the doorway (two seeds): both are full-screen roots, the room does not vanish', () => {
    const eye: [number, number, number] = [0, -2.8, 1.6];
    expect(findCurrentRoom(cottage, collision, eye).groups).toEqual([G.room, G.shell]);
    const flood = floodFrom(cottage, eye, [0, -10, 1.6]); // looking out
    expect(flood.roots).toEqual([G.room, G.shell]);
    expect(seen(flood)).toEqual([G.shell, G.room, G.shed]);
    expect([flood.rects[G.room], flood.rects[G.shell]]).toEqual([FULL_SCREEN, FULL_SCREEN]);
  });
  it('rejects a seed that is not a group', () => {
    expect(() => floodFrom(cottage, [0, 0, 1], [0, 1, 1], [7])).toThrow(/no group 7/);
  });
});

/**
 * A row of `count` rooms along +x, 4 wide each, joined by doorways (1 wide, 2 high, in the middle of each shared
 * wall at x = 4, 8, …). Portal k joins room k (negative side) and room k + 1 (positive side); its plane looks +x.
 * With `offset`, doorway k is shifted sideways by k × offset: the chain of openings stops lining up.
 */
function corridor(count: number, offset = 0, lastExterior = false, half = 0.5, bottom = 0, top = 2): Building {
  const vertices: number[] = [], portals = [], refs = [], slices: Array<[number, number]> = [];
  for (let k = 0; k < count - 1; k++) {
    const x = 4 * (k + 1), y = k * offset;
    vertices.push(x, y - half, bottom, x, y + half, bottom, x, y + half, top, x, y - half, top);
    portals.push({ startVertex: k * 4, vertexCount: 4, plane: [1, 0, 0, -x] as const });
  }
  for (let g = 0; g < count; g++) {
    const start = refs.length;
    if (g > 0) refs.push({ portal: g - 1, neighborGroup: g - 1, side: 1 });
    if (g < count - 1) refs.push({ portal: g, neighborGroup: g + 1, side: -1 });
    slices.push([start, refs.length - start]);
  }
  const groups = slices.map(([start, n], g) => {
    const b = new BuildingGroupBuilder(`room${g}`, lastExterior && g === count - 1 ? BUILDING_GROUP_FLAG.exterior : 0);
    b.batch(0, 'interior');
    b.quad([[4 * g, -20, 0], [4 * g + 4, -20, 0], [4 * g + 4, 20, 0], [4 * g, 20, 0]]);
    return { ...b.build(), portalRefStart: start, portalRefCount: n };
  });
  return { name: `test-corridor-${count}`, textures: [{ name: 't', width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) }], materials: [{ name: 'm', flags: 0, blendMode: 0, textures: [0] }], groups, portalVertices: new Float32Array(vertices), portals, portalRefs: refs };
}

describe('flood through a chain of rooms', () => {
  it('looking down a straight corridor: every room, each through a smaller window than the one before', () => {
    const flood = floodFrom(corridor(5), [1, 0, 1], [20, 0, 1], [0]);
    expect(seen(flood)).toEqual([0, 1, 2, 3, 4]);
    expect([flood.portalsFollowed, flood.depth]).toEqual([4, 4]);
    const widths = flood.rects.map((rect) => rect![2] - rect![0]);
    for (let g = 1; g < 5; g++) expect(widths[g]!).toBeLessThan(widths[g - 1]!);
  });
  it('a room is NOT visible merely because the graph reaches it: doorways that do not line up stop the flood', () => {
    // Each doorway is 3 to the side of the one before: from room 0 the second one is hidden by the first wall.
    const flood = floodFrom(corridor(5, 3), [1, 0, 1], [20, 0, 1], [0]);
    expect(seen(flood)).toEqual([0, 1]);
    expect(flood.portalsFollowed).toBe(1);
  });
  it('portals behind the eye’s side are not followed: from room 2 looking on, rooms 0 and 1 stay hidden', () => {
    const flood = floodFrom(corridor(5), [9, 0, 1], [20, 0, 1], [2]);
    expect(seen(flood)).toEqual([2, 3, 4]);
  });
  it('looking back from room 2: rooms 1 and 0', () => {
    expect(seen(floodFrom(corridor(5), [11, 0, 1], [-20, 0, 1], [2]))).toEqual([0, 1, 2]);
  });
  it('the outside is visible only when the chain reaches an exterior group, through a window as small as the chain left it', () => {
    const sealed = floodFrom(corridor(4), [1, 0, 1], [20, 0, 1], [0]);
    expect(sealed.outsideVisible).toBe(false);
    const open = floodFrom(corridor(4, 0, true), [1, 0, 1], [20, 0, 1], [0]);
    expect([open.outsideVisible, open.exteriorWindows.length]).toEqual([true, 1]);
    expect(open.exteriorWindows[0]).toEqual(open.rects[3]);
    const blocked = floodFrom(corridor(4, 3, true), [1, 0, 1], [20, 0, 1], [0]);
    expect(blocked.outsideVisible).toBe(false);
  });
  it('the depth is capped at 64 portals', () => {
    // Openings as large as the walls: every window stays the full screen, so only the cap can stop the flood.
    const flood = floodFrom(corridor(70, 0, false, 400, -400, 400), [1, 0, 1], [400, 0, 1], [0]);
    expect(flood.depth).toBe(PORTAL_DEPTH_CAP);
    expect(seen(flood)).toEqual(Array.from({ length: PORTAL_DEPTH_CAP + 1 }, (_, g) => g));
  });
});

describe('scene: groups drawn follow the flood', () => {
  const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 1, triangles: 1, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
  const line = (scene: ReturnType<typeof createBuildingScene>) => formatOverlay({ ...base, building: scene.building }).find((l) => l.startsWith('Visibility:'));
  it('reads &visibility= from the URL', () => {
    expect(parseSceneRequest('?scene=building&visibility=all')).toMatchObject({ visibility: 'all' });
    expect(parseSceneRequest('?scene=building&visibility=x')).toMatchObject({ visibility: 'portals' });
  });
  it('inside, back to the door: only the room and ITS props are drawn; I switches to all groups', () => {
    const scene = createBuildingScene(new NullBackend(), { view: 'inside', headingDegrees: 0 });
    scene.render(16 / 9);
    expect(scene.building).toMatchObject({ visibility: 'portals', visibleGroups: [1], groupsDrawn: 1, batchesDrawn: 3, outsideVisible: false, portalsFollowed: 0, doodadsDrawn: 3 });
    expect(line(scene)).toBe('Visibility: portals (I) · groups 1 · 0 portal(s) followed · outside hidden');
    expect(scene.toggleVisibility()).toBe('all');
    scene.render(16 / 9);
    expect(scene.building).toMatchObject({ visibleGroups: [0, 1, 2], groupsDrawn: 3, batchesDrawn: 9 });
    expect(line(scene)).toBe('Visibility: all groups (I)');
    scene.dispose();
  });
  it('inside, facing the door: the three groups, the outside through two windows', () => {
    const scene = createBuildingScene(new NullBackend(), { view: 'inside', headingDegrees: 180 });
    scene.render(16 / 9);
    expect(scene.building).toMatchObject({ visibleGroups: [0, 1, 2], outsideVisible: true, exteriorWindows: 2, portalsFollowed: 2 });
    expect(line(scene)).toBe('Visibility: portals (I) · groups 0, 1, 2 · 2 portal(s) followed · outside visible through 2 window(s)');
    scene.dispose();
  });
  it('outside behind the house: the room and its table are not drawn; a group hidden by hand stays hidden', () => {
    const scene = createBuildingScene(new NullBackend(), { headingDegrees: 180 });
    scene.render(16 / 9);
    expect(scene.building).toMatchObject({ visibleGroups: [0, 2], batchesDrawn: 6, doodadsDrawn: 1 }); // the planter: the shell lists it
    scene.toggleGroup(2);
    scene.render(16 / 9);
    expect(scene.building.visibleGroups).toEqual([0]);
    scene.dispose();
  });
  it('the collision view shows the sets whole, whatever the portals say', () => {
    const scene = createBuildingScene(new NullBackend(), { view: 'inside', headingDegrees: 0, collisionView: 'player' });
    scene.render(16 / 9);
    expect(scene.building.groupsDrawn).toBe(3);
    scene.dispose();
  });
});
