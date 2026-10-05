import { describe, expect, it } from 'vitest';
import {
  type Building, BUILDING_GROUP_FLAG, buildCottage, BuildingCollision, BuildingGroupBuilder, COTTAGE, COTTAGE_GROUP, COTTAGE_PORTAL, DOORWAY_PARALLEL_THRESHOLD, DOORWAY_SNAP_YARDS, findCurrentRoom, groupPortalRefs, pointInPortal,
  portalNeighbors, portalSignedDistance, ROOM_HIT_TOLERANCE, ROOM_RAY_YARDS, validateBuilding,
} from '../../src/building';
import { BuildingRenderer, PORTAL_DEBUG_COLOUR } from '../../src/buildingRender';
import { formatOverlay } from '../../src/debug';
import { mat4 } from '../../src/math';
import { NullBackend } from '../../src/renderer';
import { createBuildingScene } from '../../src/scenes/buildingScene';
import { parseSceneRequest } from '../../src/scenes/select';

const cottage = buildCottage('solid');
const G = COTTAGE_GROUP, P = COTTAGE_PORTAL;
const collision = new BuildingCollision(cottage);
const room = (x: number, y: number, z: number, terrainHeight?: number | null) => findCurrentRoom(cottage, collision, [x, y, z], { terrainHeight });
const PLANE_Y = -COTTAGE.halfY + COTTAGE.wall / 2; // −2.85

/**
 * A test building with a HORIZONTAL portal: two rooms on top of each other, 4 × 4, joined by a 1 × 1 hole in the
 * upper floor (x, y in 1.5..2.5 at z = 3). Group 0 « cellar » (floor at 0), group 1 « loft » (floor at 3 around
 * the hole), group 2 « yard »: an exterior slab at z = 0 east of them (x in 4..8).
 */
function tower(options: { loftFlags?: number; holeFloor?: boolean } = {}): Building {
  const slab = (b: BuildingGroupBuilder, x0: number, x1: number, y0: number, y1: number, z: number): void => b.quad([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]);
  const cellar = new BuildingGroupBuilder('cellar', 0);
  cellar.batch(0, 'interior');
  slab(cellar, 0, 4, 0, 4, 0);
  const loft = new BuildingGroupBuilder('loft', options.loftFlags ?? 0);
  loft.batch(0, 'interior');
  slab(loft, 0, 1.5, 0, 4, 3);
  slab(loft, 2.5, 4, 0, 4, 3);
  slab(loft, 1.5, 2.5, 0, 1.5, 3);
  slab(loft, 1.5, 2.5, 2.5, 4, 3);
  if (options.holeFloor) slab(loft, 1.5, 2.5, 1.5, 2.5, 3); // a floor face exactly in the portal's plane
  const yard = new BuildingGroupBuilder('yard', BUILDING_GROUP_FLAG.exterior);
  yard.batch(0, 'exterior');
  slab(yard, 4, 8, 0, 4, 0);
  return {
    name: 'test-tower',
    textures: [{ name: 't', width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) }],
    materials: [{ name: 'm', flags: 0, blendMode: 0, textures: [0] }],
    groups: [{ ...cellar.build(), portalRefStart: 0, portalRefCount: 1 }, { ...loft.build(), portalRefStart: 1, portalRefCount: 1 }, yard.build()],
    // The plane looks UP: the loft is on its positive side, the cellar on the negative.
    portalVertices: new Float32Array([1.5, 1.5, 3, 2.5, 1.5, 3, 2.5, 2.5, 3, 1.5, 2.5, 3]),
    portals: [{ startVertex: 0, vertexCount: 4, plane: [0, 0, 1, -3] }],
    portalRefs: [{ portal: 0, neighborGroup: 1, side: -1 }, { portal: 0, neighborGroup: 0, side: 1 }],
  };
}
const towerRoom = (building: Building, x: number, y: number, z: number, terrainHeight?: number | null) => findCurrentRoom(building, new BuildingCollision(building), [x, y, z], { terrainHeight });

describe('portal data (spec §141–§144)', () => {
  it('the constants are the document’s', () => {
    expect([ROOM_RAY_YARDS, ROOM_HIT_TOLERANCE, DOORWAY_PARALLEL_THRESHOLD, DOORWAY_SNAP_YARDS]).toEqual([1760, 1e-4, 1e-4, 0.1]);
  });
  it('a portal is a span of the shared vertex pool and a plane; signed distance = dot(n, p) + d', () => {
    const door = cottage.portals![P.door]!;
    expect([door.startVertex, door.vertexCount, cottage.portals![P.window]!.startVertex]).toEqual([0, 4, 4]);
    expect(cottage.portalVertices!.length).toBe(8 * 3);
    expect(portalSignedDistance(door, [0, 0, 1])).toBeCloseTo(-PLANE_Y, 6); // the middle of the room is on the positive side
    expect(portalSignedDistance(door, [0, -5, 1])).toBeCloseTo(-5 - PLANE_Y, 6);
    expect(portalSignedDistance(door, [0, PLANE_Y, 1])).toBeCloseTo(0, 6);
  });
  it('each group owns a contiguous slice of the references: its edges of the graph', () => {
    expect(groupPortalRefs(cottage, G.shell)).toEqual([{ portal: 0, neighborGroup: G.room, side: -1 }, { portal: 1, neighborGroup: G.room, side: -1 }]);
    expect(groupPortalRefs(cottage, G.room)).toEqual([{ portal: 0, neighborGroup: G.shell, side: 1 }, { portal: 1, neighborGroup: G.shell, side: 1 }]);
    expect(groupPortalRefs(cottage, G.shed)).toEqual([]);
    expect([portalNeighbors(cottage, G.shell), portalNeighbors(cottage, G.room), portalNeighbors(cottage, G.shed)]).toEqual([[G.room], [G.shell], []]);
    expect(() => groupPortalRefs(cottage, 9)).toThrow(/no group 9/);
  });
  it('validation: spans, planes, references and slices', () => {
    const edit = (change: Partial<Building>) => ({ ...cottage, ...change });
    expect(() => validateBuilding(edit({ portals: [{ startVertex: 6, vertexCount: 4, plane: [0, 1, 0, -PLANE_Y] }, cottage.portals![1]!] }))).toThrow(/portal 0 needs at least 3 vertices inside the pool/);
    expect(() => validateBuilding(edit({ portals: [{ startVertex: 0, vertexCount: 2, plane: [0, 1, 0, -PLANE_Y] }, cottage.portals![1]!] }))).toThrow(/at least 3 vertices/);
    expect(() => validateBuilding(edit({ portals: [{ startVertex: 0, vertexCount: 4, plane: [0, 2, 0, -PLANE_Y] }, cottage.portals![1]!] }))).toThrow(/unit plane normal/);
    expect(() => validateBuilding(edit({ portals: [{ startVertex: 0, vertexCount: 4, plane: [0, 1, 0, 0] }, cottage.portals![1]!] }))).toThrow(/vertex 0 is not on the portal's plane/);
    expect(() => validateBuilding(edit({ portalRefs: cottage.portalRefs!.map((ref, k) => (k === 0 ? { ...ref, portal: 5 } : ref)) }))).toThrow(/reference 0 names portal 5/);
    expect(() => validateBuilding(edit({ portalRefs: cottage.portalRefs!.map((ref, k) => (k === 0 ? { ...ref, neighborGroup: 7 } : ref)) }))).toThrow(/reference 0 names group 7/);
    expect(() => validateBuilding(edit({ portalRefs: cottage.portalRefs!.map((ref, k) => (k === 0 ? { ...ref, side: 0 } : ref)) }))).toThrow(/side of \+1 or −1/);
    expect(() => validateBuilding(edit({ portalRefs: cottage.portalRefs!.map((ref, k) => (k === 0 ? { ...ref, neighborGroup: 0 } : ref)) }))).toThrow(/leads back to the group itself/);
    expect(() => validateBuilding(edit({ groups: cottage.groups.map((group, g) => (g === 2 ? { ...group, portalRefStart: 3, portalRefCount: 2 } : group)) }))).toThrow(/group 2 \("shed"\) owns portal references 3..5/);
    expect(() => validateBuilding(tower())).not.toThrow();
  });
  it('pointInPortal: inside, on an edge, outside — for a wall portal and a floor portal', () => {
    const door = cottage.portals![P.door]!;
    expect(pointInPortal(cottage, door, [0, PLANE_Y, 1])).toBe(true);
    expect(pointInPortal(cottage, door, [0.6, PLANE_Y, 1])).toBe(true); // on the jamb
    expect(pointInPortal(cottage, door, [0.61, PLANE_Y, 1])).toBe(false);
    expect(pointInPortal(cottage, door, [0, PLANE_Y, 2.2])).toBe(false); // above the lintel
    const t = tower();
    expect(pointInPortal(t, t.portals![0]!, [2, 2, 3])).toBe(true);
    expect(pointInPortal(t, t.portals![0]!, [1.4, 2, 3])).toBe(false);
  });
});

describe('current room in the cottage (spec §145–§151)', () => {
  it('in the room: the floor under the eye decides — one group', () => {
    expect(room(0, 0, 1.6)).toEqual({ groups: [G.room], cause: 'collision', distance: expect.closeTo(1.58, 5), hitGroup: G.room });
    expect(room(-3, 2, 0.5).groups).toEqual([G.room]);
  });
  it('it is NOT a bounding-box test: under the roof but outside the walls, in front of the door, nothing claims the eye', () => {
    // Inside the shell's box (the roof overhangs to y = −3.4), yet no face and no portal is below.
    expect(room(0, -3.2, 1.6)).toEqual({ groups: [], cause: 'nothing' });
  });
  it('above the roof, or in the shed: the face below belongs to an EXTERIOR group — outside', () => {
    expect(room(0, 1, 8)).toMatchObject({ groups: [], cause: 'exterior', hitGroup: G.shell });
    expect(room(5, 0, 5)).toMatchObject({ groups: [], cause: 'exterior', hitGroup: G.shed });
  });
  it('a doorway is nearly parallel to the down-ray: it counts only within 0.1 of its plane, and then gives TWO groups', () => {
    expect(room(0, PLANE_Y + 0.05, 1.6)).toEqual({ groups: [G.room, G.shell], cause: 'portal', distance: 0, hitGroup: G.room, portal: P.door });
    expect(room(0, PLANE_Y + 0.09, 1.6).cause).toBe('portal');
    // Beyond 0.1 the doorway no longer counts; there, still inside the wall's thickness, nothing is below.
    expect(room(0, PLANE_Y + 0.12, 1.6)).toEqual({ groups: [], cause: 'nothing' });
    // Farther in: the room alone, although the eye is still in front of the door.
    expect(room(0, PLANE_Y + 0.16, 1.6)).toMatchObject({ groups: [G.room], cause: 'collision' });
  });
  it('in the doorway but on the shell’s side: the group on the eye’s side is exterior — outside', () => {
    expect(room(0, PLANE_Y - 0.05, 1.6)).toEqual({ groups: [], cause: 'exterior', distance: 0, hitGroup: G.shell, portal: P.door });
  });
  it('near the doorway’s plane but beside the opening: the portal does not count', () => {
    // In the wall's thickness next to the door: nothing below, no portal.
    expect(room(1, PLANE_Y + 0.01, 1.6)).toEqual({ groups: [], cause: 'nothing' });
    // Above the lintel.
    expect(room(0, PLANE_Y + 0.05, 2.5).cause).not.toBe('portal');
  });
  it('the window is a portal too: an eye in it is in two groups', () => {
    expect(room(2.4, PLANE_Y + 0.04, 1.5)).toMatchObject({ groups: [G.room, G.shell], portal: P.window });
  });
  it('terrain strictly nearer than the building’s hit wins: outside. No terrain (a hole): the building wins', () => {
    expect(room(0, 0, 1.6, 1)).toEqual({ groups: [], cause: 'terrain', distance: expect.closeTo(0.6, 6) });
    expect(room(0, 0, 1.6, -5).groups).toEqual([G.room]); // the terrain is farther than the floor
    expect(room(0, 0, 1.6, null).groups).toEqual([G.room]);
    expect(room(0, 0, 1.6, 3).groups).toEqual([G.room]); // terrain above the eye is not under it
  });
  it('rejects collision sets of another building, and a bad unitsPerYard', () => {
    expect(() => findCurrentRoom(buildCottage('solid'), collision, [0, 0, 1])).toThrow(/another building/);
    expect(() => findCurrentRoom(cottage, collision, [0, 0, 1], { unitsPerYard: 0 })).toThrow(/unitsPerYard/);
  });
});

describe('current room with a floor-hole portal', () => {
  const t = tower();
  it('over the hole, above the upper floor: the portal is the nearest crossing — loft first, cellar across', () => {
    expect(towerRoom(t, 2, 2, 4)).toEqual({ groups: [1, 0], cause: 'portal', distance: expect.closeTo(1, 6), hitGroup: 1, portal: 0 });
  });
  it('beside the hole: the loft’s floor', () => {
    expect(towerRoom(t, 0.5, 2, 4)).toMatchObject({ groups: [1], cause: 'collision', distance: expect.closeTo(1, 6) });
  });
  it('below the upper floor the portal is ABOVE the eye: the cellar’s floor decides, even under the hole', () => {
    expect(towerRoom(t, 2, 2, 2)).toMatchObject({ groups: [0], cause: 'collision', distance: expect.closeTo(2, 6) });
    expect(towerRoom(t, 0.5, 2, 2).groups).toEqual([0]);
  });
  it('exactly in the portal’s plane the crossing is at distance 0 and both groups are seeds', () => {
    // At exactly 0 the side test passes for both groups (« exact-zero passes »): the first group in order is taken.
    expect(towerRoom(t, 2, 2, 3)).toMatchObject({ groups: [0, 1], cause: 'portal', distance: 0 });
  });
  it('a portal TIES a floor face in its own plane and wins (tolerance 1e-4)', () => {
    const covered = tower({ holeFloor: true });
    expect(towerRoom(covered, 2, 2, 4)).toMatchObject({ groups: [1, 0], cause: 'portal' });
    // The same face 2e-4 above the portal is strictly nearer: the face wins.
    const raised = { ...covered, portalVertices: covered.portalVertices!.map((v, k) => (k % 3 === 2 ? v - 2e-4 : v)), portals: [{ ...covered.portals![0]!, plane: [0, 0, 1, -3 + 2e-4] as const }] };
    expect(towerRoom(raised, 2, 2, 4)).toMatchObject({ groups: [1], cause: 'collision' });
  });
  it('an exterior-lit group (0x40 alone) is still a room; an exterior one (0x08) is outside', () => {
    expect(towerRoom(tower({ loftFlags: BUILDING_GROUP_FLAG.exteriorLit }), 0.5, 2, 4).groups).toEqual([1]);
    expect(towerRoom(tower({ loftFlags: BUILDING_GROUP_FLAG.exterior }), 0.5, 2, 4)).toMatchObject({ groups: [], cause: 'exterior', hitGroup: 1 });
    expect(towerRoom(t, 6, 2, 1)).toMatchObject({ groups: [], cause: 'exterior', hitGroup: 2 });
  });
  it('terrain between the eye and the portal wins over it', () => {
    expect(towerRoom(t, 2, 2, 4, 3.5)).toMatchObject({ groups: [], cause: 'terrain' });
    // A tie is not « strictly nearer »: terrain exactly at the floor's height leaves the room.
    expect(towerRoom(t, 0.5, 2, 4, 3).groups).toEqual([1]);
    expect(towerRoom(t, 0.5, 2, 4, 3.001).cause).toBe('terrain');
  });
  it('the ray reaches 1760 yards and no farther; unitsPerYard scales it', () => {
    expect(towerRoom(t, 0.5, 2, 1700).groups).toEqual([1]);
    expect(towerRoom(t, 0.5, 2, 1764)).toEqual({ groups: [], cause: 'nothing' });
    expect(findCurrentRoom(t, new BuildingCollision(t), [0.5, 2, 1000], { unitsPerYard: 0.5 })).toEqual({ groups: [], cause: 'nothing' });
  });
});

describe('scene: current room and portal view', () => {
  const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 1, triangles: 1, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
  const roomLine = (scene: ReturnType<typeof createBuildingScene>) => formatOverlay({ ...base, building: scene.building }).find((line) => line.startsWith('Room:'));
  it('reads &eye= and &portals= from the URL', () => {
    expect(parseSceneRequest('?scene=building&view=inside&eye=0,-2.8,1.6&portals=on')).toMatchObject({ eye: [0, -2.8, 1.6], portals: true });
    expect(parseSceneRequest('?scene=building&eye=1,2')).toMatchObject({ eye: undefined, portals: false });
  });
  it('inside: the overlay names the room; in the doorway: two groups; outside: outside', () => {
    const inside = createBuildingScene(new NullBackend(), { view: 'inside' });
    inside.render(16 / 9);
    expect(roomLine(inside)).toBe('Room: group 1 "room" (collision 1.58 below) · 2 portals, shown off (O)');
    inside.dispose();
    const doorway = createBuildingScene(new NullBackend(), { view: 'inside', eye: [0, -2.8, 1.6] });
    doorway.render(16 / 9);
    expect(doorway.building).toMatchObject({ room: { groups: [1, 0], cause: 'portal' }, roomNames: ['room', 'shell'] });
    expect(roomLine(doorway)).toBe('Room: groups 1 "room" + 0 "shell" (portal 0) · 2 portals, shown off (O)');
    doorway.dispose();
    const outside = createBuildingScene(new NullBackend(), {});
    outside.render(16 / 9);
    expect(roomLine(outside)).toMatch(/^Room: outside \((nothing|exterior)\)/);
    expect(outside.roomAt([0, 0, 1.6]).groups).toEqual([1]);
    expect(outside.roomAt([0, 0, 1.6], 1).cause).toBe('terrain');
    outside.dispose();
  });
  it('O draws the portal polygons: one more draw, 2 triangles per rectangle, flat magenta, two-sided', () => {
    const backend = new NullBackend(), scene = createBuildingScene(backend, { doodads: false });
    expect(scene.render(16 / 9).drawCalls).toBe(9);
    expect(scene.togglePortals()).toBe(true);
    expect(scene.render(16 / 9).drawCalls).toBe(10);
    expect(scene.building.portalsShown).toBe(true);
    scene.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
    const other = new NullBackend(), renderer = new BuildingRenderer(other), identity = mat4.identity(mat4.create());
    const id = renderer.addBuilding(cottage);
    let seen: { indexCount: number; colour: number[]; cullMode: string } | undefined;
    const original = other.draw.bind(other);
    other.draw = (call) => {
      const u = call.uniforms as Float32Array;
      seen = { indexCount: call.indexCount ?? 0, colour: Array.from(u.subarray(60, 63)), cullMode: other.pipelineState(call.pipeline)!.cullMode };
      return original(call);
    };
    other.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    expect(renderer.drawPortals(identity, [{ building: id, matrix: identity }])).toBe(4);
    other.endFrame();
    expect(seen).toEqual({ indexCount: 12, colour: [...PORTAL_DEBUG_COLOUR], cullMode: 'none' });
    renderer.dispose();
  });
});
