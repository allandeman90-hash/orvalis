import type { BuildingDoodad, BuildingDoodadSet } from './doodad';
import type { BuildingFog } from './fog';
import type { BuildingPortal, BuildingPortalRef } from './portal';
import { BUILDING_TRIANGLE_FLAG } from './collision';
import { type Building, BUILDING_BLEND, BUILDING_GROUP_FLAG, BUILDING_MATERIAL_FLAG, type BuildingGroup, BuildingGroupBuilder, type BuildingMaterial, type BuildingTexture } from './building';

/**
 * An ORIGINAL small cottage, built in code (P6.1): the first building of the engine — a fixture for the building
 * pipeline, not a piece of the final world.
 *
 * Three groups, as separate cells:
 *   0 « shell »     exterior: the outside of the four walls (door and window openings in the front wall, which
 *                   faces −y), the reveals of the openings, the gables, the roof (two-sided), the window lattice;
 *   1 « room »      INTERIOR: the inside of the walls, floor and ceiling, with baked vertex colours, and a
 *                   translucent glass screen;
 *   2 « shed »      exterior: a lean-to against the east wall.
 *
 * The house is 8 × 6, its walls 3 high and 0.3 thick, the ridge at 4.5. Units are the engine's.
 */
export const COTTAGE = {
  halfX: 4, halfY: 3, wallHeight: 3, wall: 0.3, ridge: 4.5, overhang: 0.4,
  door: { x0: -0.6, x1: 0.6, top: 2.1 },
  window: { x0: 1.8, x1: 3, z0: 1, z1: 2, y: -2.85 },
  screen: { x: 1, y0: -1, y1: 1, top: 2 },
  glow: { x0: 2.2, x1: 3.2, z0: 1.2, z1: 2 },
  shed: { x1: 6.5, halfY: 1.5, heightAtWall: 2.4, heightOutside: 1.9 },
} as const;

export const COTTAGE_MATERIAL = { stone: 0, roof: 1, plaster: 2, planks: 3, lattice: 4, glass: 5, wood: 6 } as const;
export const COTTAGE_GROUP = { shell: 0, room: 1, shed: 2 } as const;

/** Flat colours of the textures in the « solid » style, and base colours of the painted ones. */
export const COTTAGE_COLOURS = {
  stone: [150, 150, 145, 255], roof: [140, 70, 50, 255], plaster: [220, 210, 190, 255], planks: [130, 95, 60, 255],
  latticeBar: [60, 45, 30, 255], glass: [90, 160, 200, 128], wood: [110, 80, 50, 255], moss: [80, 110, 70, 255],
} as const;

/**
 * Baked light of the room (vertex colours): what each surface is multiplied by. The 4th value is NOT transparency: in an interior batch it is a self-illumination amount, light × (1 + 4 × alpha)
 * (spec §173). 0 everywhere, except the « glow » panel on the back wall: alpha 128 → about three times its light.
 */
export const ROOM_LIGHT = { floor: [150, 130, 110, 0], wallBottom: [120, 110, 100, 0], wallTop: [200, 180, 150, 0], backWall: [180, 160, 130, 0], ceiling: [90, 80, 75, 0], glow: [40, 60, 80, 128] } as const;

const TEXTURE_SIZE = 32;
/** A lattice texel is a bar when it is in the first 2 texels of an 8-texel cell, in x or in y; the rest is empty. */
export const latticeIsBar = (x: number, y: number): boolean => x % 8 < 2 || y % 8 < 2;

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The cottage's textures. 'solid' = flat colours, for exact pixel checks; 'procedural' = simple painted patterns. */
export function cottageTextures(style: 'procedural' | 'solid' = 'procedural'): BuildingTexture[] {
  const make = (name: string, paint: (x: number, y: number) => readonly number[]): BuildingTexture => {
    const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
    for (let y = 0; y < TEXTURE_SIZE; y++) for (let x = 0; x < TEXTURE_SIZE; x++) data.set(paint(x, y).map((v) => Math.max(0, Math.min(255, Math.round(v)))), (y * TEXTURE_SIZE + x) * 4);
    return { name: `cottage-${name}-${style}`, width: TEXTURE_SIZE, height: TEXTURE_SIZE, data };
  };
  const shaded = (base: readonly number[], shade: number): number[] => [base[0]! * shade, base[1]! * shade, base[2]! * shade, base[3]!];
  const flat = style === 'solid';
  const C = COTTAGE_COLOURS;
  return [
    // Stone blocks: 8 × 4 texels, every other row shifted, darker joints.
    make('stone', (x, y) => {
      if (flat) return C.stone;
      const joint = y % 8 === 0 || (x + (y >> 3) * 4) % 8 === 0;
      return shaded(C.stone, joint ? 0.7 : 0.9 + 0.2 * hash(x >> 3, y >> 3, 3 + ((y >> 3) & 1)));
    }),
    // Shingles: rows 4 texels high, darker at the lower edge of each row.
    make('roof', (x, y) => (flat ? C.roof : shaded(C.roof, (0.75 + 0.1 * (y % 4)) * (0.9 + 0.2 * hash(x >> 2, y >> 2, 7))))),
    make('plaster', (x, y) => (flat ? C.plaster : shaded(C.plaster, 0.94 + 0.1 * hash(x >> 1, y >> 1, 11)))),
    // Planks along x: 8 texels wide, a dark gap between two planks.
    make('planks', (x, y) => (flat ? C.planks : shaded(C.planks, y % 8 === 0 ? 0.6 : 0.88 + 0.2 * hash(x >> 4, y >> 3, 13)))),
    // Lattice: opaque bars, fully transparent openings — the same in both styles (it is the alpha test's subject).
    make('lattice', (x, y) => (latticeIsBar(x, y) ? C.latticeBar : [0, 0, 0, 0])),
    make('glass', () => C.glass),
    make('wood', (x, y) => (flat ? C.wood : shaded(C.wood, 0.85 + 0.25 * hash(x, y >> 3, 17)))),
    make('moss', (x, y) => (flat ? C.moss : shaded(C.moss, 0.8 + 0.4 * hash(x >> 1, y >> 1, 19)))),
  ];
}

export const COTTAGE_MATERIALS: readonly BuildingMaterial[] = [
  // The stone carries a second texture (moss): the material format allows two; only the first is drawn so far.
  { name: 'stone', flags: 0, blendMode: BUILDING_BLEND.opaque, textures: [0, 7] },
  { name: 'roof', flags: BUILDING_MATERIAL_FLAG.unculled, blendMode: BUILDING_BLEND.opaque, textures: [1] },
  { name: 'plaster', flags: 0, blendMode: BUILDING_BLEND.opaque, textures: [2] },
  { name: 'planks', flags: 0, blendMode: BUILDING_BLEND.opaque, textures: [3] },
  { name: 'lattice', flags: BUILDING_MATERIAL_FLAG.unculled | BUILDING_MATERIAL_FLAG.window, blendMode: BUILDING_BLEND.alphaTest, textures: [4] },
  { name: 'glass', flags: BUILDING_MATERIAL_FLAG.unculled | BUILDING_MATERIAL_FLAG.unlit, blendMode: 2, textures: [5] },
  { name: 'wood', flags: 0, blendMode: BUILDING_BLEND.opaque, textures: [6] },
];

type P = readonly [number, number, number];

/** A wall rectangle in the plane y = const, x0..x1 × z0..z1, seen from −y (`facing` −1) or from +y (+1). */
const wallY = (y: number, x0: number, x1: number, z0: number, z1: number, facing: 1 | -1): [P, P, P, P] =>
  facing < 0 ? [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]] : [[x1, y, z0], [x0, y, z0], [x0, y, z1], [x1, y, z1]];
/** A wall rectangle in the plane x = const, y0..y1 × z0..z1, seen from +x (`facing` +1) or from −x (−1). */
const wallX = (x: number, y0: number, y1: number, z0: number, z1: number, facing: 1 | -1): [P, P, P, P] =>
  facing > 0 ? [[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]] : [[x, y1, z0], [x, y0, z0], [x, y0, z1], [x, y1, z1]];

/** The front wall (x0..x1, up to `height`) without its door and window: six rectangles as [x0, x1, z0, z1]. */
function frontWallPieces(x0: number, x1: number, height: number): Array<[number, number, number, number]> {
  const { door, window } = COTTAGE;
  return [
    [x0, door.x0, 0, height],
    [door.x0, door.x1, door.top, height],
    [door.x1, window.x0, 0, height],
    [window.x0, window.x1, 0, window.z0],
    [window.x0, window.x1, window.z1, height],
    [window.x1, x1, 0, height],
  ];
}

function buildShell(): BuildingGroup {
  const { halfX: X, halfY: Y, wallHeight: H, wall: T, ridge, overhang: O, door, window } = COTTAGE;
  const b = new BuildingGroupBuilder('shell', BUILDING_GROUP_FLAG.exterior);
  const M = COTTAGE_MATERIAL;
  b.batch(M.stone, 'exterior');
  for (const [x0, x1, z0, z1] of frontWallPieces(-X, X, H)) b.quad(wallY(-Y, x0, x1, z0, z1, -1));
  b.quad(wallY(Y, -X, X, 0, H, 1));
  b.quad(wallX(X, -Y, Y, 0, H, 1));
  b.quad(wallX(-X, -Y, Y, 0, H, -1));
  // Gables: the triangle of wall under the roof at each end.
  for (const side of [1, -1] as const) {
    const corners: P[] = side > 0 ? [[X, -Y, H], [X, Y, H], [X, 0, ridge]] : [[-X, Y, H], [-X, -Y, H], [-X, 0, ridge]];
    const v = corners.map((p) => b.vertex(p, [side, 0, 0], [(p[1] + Y) / 2, 1 - (p[2] - H) / 2]));
    b.triangle(v[0]!, v[1]!, v[2]!);
  }
  // Reveals of the openings: the thickness of the wall, seen from inside the opening.
  b.batch(M.wood, 'exterior');
  b.quad(wallX(door.x0, -Y, -Y + T, 0, door.top, 1));
  b.quad(wallX(door.x1, -Y, -Y + T, 0, door.top, -1));
  b.quad([[door.x0, -Y, door.top], [door.x1, -Y, door.top], [door.x1, -Y + T, door.top], [door.x0, -Y + T, door.top]]); // lintel, facing down
  b.quad(wallX(window.x0, -Y, -Y + T, window.z0, window.z1, 1));
  b.quad(wallX(window.x1, -Y, -Y + T, window.z0, window.z1, -1));
  b.quad([[window.x0, -Y, window.z1], [window.x1, -Y, window.z1], [window.x1, -Y + T, window.z1], [window.x0, -Y + T, window.z1]]);
  b.quad([[window.x1, -Y, window.z0], [window.x0, -Y, window.z0], [window.x0, -Y + T, window.z0], [window.x1, -Y + T, window.z0]]); // sill, facing up
  // Roof: two slopes with an overhang, drawn from both sides (the underside shows under the eaves).
  b.batch(M.roof, 'exterior');
  const eaveZ = ridge - ((ridge - H) / Y) * (Y + O);
  b.quad([[-X - O, -Y - O, eaveZ], [X + O, -Y - O, eaveZ], [X + O, 0, ridge], [-X - O, 0, ridge]]);
  b.quad([[X + O, Y + O, eaveZ], [-X - O, Y + O, eaveZ], [-X - O, 0, ridge], [X + O, 0, ridge]]);
  // The lattice in the window opening: its texture is laid exactly once across the opening's width.
  b.batch(M.lattice, 'exterior');
  // DETAIL: thin decoration — it stops the camera, not the player's body (spec §123).
  b.faceFlags(BUILDING_TRIANGLE_FLAG.detail);
  b.quad(wallY(window.y, window.x0, window.x1, window.z0, window.z1, -1), window.x1 - window.x0);
  return b.build(undefined, [COTTAGE_DOODAD.planter]);
}

function buildRoom(): BuildingGroup {
  const { halfX: X, halfY: Y, wallHeight: H, wall: T, screen, glow } = COTTAGE;
  const b = new BuildingGroupBuilder('room', 0);
  const M = COTTAGE_MATERIAL, L = ROOM_LIGHT;
  const x = X - T, y = Y - T;
  const wallColours = [L.wallBottom, L.wallBottom, L.wallTop, L.wallTop] as const;
  // TRANS first: a translucent glass screen standing in the room.
  b.batch(M.glass, 'trans');
  // NOCAMCOLLIDE: the player walks into the glass, the camera looks through it.
  b.faceFlags(BUILDING_TRIANGLE_FLAG.noCamCollide);
  b.quad(wallX(screen.x, screen.y0, screen.y1, 0, screen.top, -1));
  b.faceFlags(0);
  b.batch(M.plaster, 'interior');
  // The inside of the front wall keeps the openings; it is darker at the bottom than at the top.
  for (const [x0, x1, z0, z1] of frontWallPieces(-x, x, H)) {
    const shadeAt = (z: number): number[] => L.wallBottom.map((c, k) => c + ((L.wallTop[k]! - c) * z) / H);
    b.quad(wallY(-y, x0, x1, z0, z1, 1), 2, [shadeAt(z0), shadeAt(z0), shadeAt(z1), shadeAt(z1)]);
  }
  // The back wall has ONE colour (a surface whose result can be predicted exactly).
  b.quad(wallY(y, -x, x, 0, H, -1), 2, [L.backWall, L.backWall, L.backWall, L.backWall]);
  // A self-lit panel on the back wall, a hair in front of it. Pure decoration: in neither collision set.
  b.faceFlags(BUILDING_TRIANGLE_FLAG.detail | BUILDING_TRIANGLE_FLAG.noCamCollide);
  b.quad(wallY(y - 0.01, glow.x0, glow.x1, glow.z0, glow.z1, -1), 2, [L.glow, L.glow, L.glow, L.glow]);
  b.faceFlags(0);
  b.quad(wallX(x, -y, y, 0, H, -1), 2, wallColours);
  b.quad(wallX(-x, -y, y, 0, H, 1), 2, wallColours);
  b.quad([[x, -y, H], [-x, -y, H], [-x, y, H], [x, y, H]], 2, [L.ceiling, L.ceiling, L.ceiling, L.ceiling]); // ceiling, facing down
  b.batch(M.planks, 'interior');
  b.quad([[-x, -y, 0.02], [x, -y, 0.02], [x, y, 0.02], [-x, y, 0.02]], 2, [L.floor, L.floor, L.floor, L.floor]);
  const D = COTTAGE_DOODAD;
  return b.build(undefined, [D.table, D.stool, D.planter, D.secondStool, D.crateLow, D.crateHigh, D.crateSide]);
}

function buildShed(): BuildingGroup {
  const { halfX: X, shed } = COTTAGE;
  const b = new BuildingGroupBuilder('shed', BUILDING_GROUP_FLAG.exterior);
  const M = COTTAGE_MATERIAL, x1 = shed.x1, y = shed.halfY, h0 = shed.heightAtWall, h1 = shed.heightOutside;
  b.batch(M.wood, 'exterior');
  b.quad(wallX(x1, -y, y, 0, h1, 1));
  // Side walls: four-sided, higher against the house.
  b.quad([[X, -y, 0], [x1, -y, 0], [x1, -y, h1], [X, -y, h0]]);
  b.quad([[x1, y, 0], [X, y, 0], [X, y, h0], [x1, y, h1]]);
  b.batch(M.roof, 'exterior');
  b.quad([[X, -y - 0.2, h0], [x1 + 0.2, -y - 0.2, h1 - 0.04], [x1 + 0.2, y + 0.2, h1 - 0.04], [X, y + 0.2, h0]]);
  return b.build(undefined, [COTTAGE_DOODAD.shedCrate]);
}

/**
 * The cottage's props (P6.2). ONE list; the sets are ranges of it:
 *   set 0 « always »    table and stool in the room, a planter on the window sill;
 *   set 1 « lived-in »  a second stool behind the glass screen, a crate outside against the shed (listed by the shed group);
 *   set 2 « storage »   three crates stacked in the room's north-west corner.
 * The planter stands IN the window opening: it is listed by the shell and by the room, and shows while either does.
 */
export const COTTAGE_DOODAD = { table: 0, stool: 1, planter: 2, secondStool: 3, shedCrate: 4, crateLow: 5, crateHigh: 6, crateSide: 7 } as const;
export const COTTAGE_DOODAD_MODELS = ['prop-table', 'prop-stool', 'prop-crate'] as const;
export const COTTAGE_DOODAD_SET = { always: 0, livedIn: 1, storage: 2 } as const;
export const COTTAGE_DOODAD_SETS: readonly BuildingDoodadSet[] = [{ name: 'always', start: 0, count: 3 }, { name: 'lived-in', start: 3, count: 2 }, { name: 'storage', start: 5, count: 3 }];

/** A quaternion turning `degrees` about +z (counter-clockwise seen from above). */
const aboutZ = (degrees: number): [number, number, number, number] => [0, 0, Math.sin((degrees * Math.PI) / 360), Math.cos((degrees * Math.PI) / 360)];
const WHITE = [255, 255, 255, 255] as const;
/** Light of the props standing in the room: close to the room's baked walls. */
export const ROOM_PROP_LIGHT = [170, 150, 125, 255] as const;
const TABLE = 0, STOOL = 1, CRATE = 2;
export const COTTAGE_DOODADS: readonly BuildingDoodad[] = [
  { model: TABLE, position: [0, 1.8, 0.02], rotation: aboutZ(0), scale: 1, color: ROOM_PROP_LIGHT },
  { model: STOOL, position: [-1, 1.8, 0.02], rotation: aboutZ(0), scale: 1, color: ROOM_PROP_LIGHT },
  // Half-size crate on the sill (the sill is 0.3 deep, from y = −3 to −2.7, at z = 1).
  { model: CRATE, position: [2.4, -2.85, 1], rotation: aboutZ(0), scale: 0.45, color: WHITE },
  // Behind the glass screen, seen from the middle of the room: props are drawn before the blended batches.
  { model: STOOL, position: [2.2, 0, 0.02], rotation: aboutZ(45), scale: 1, color: ROOM_PROP_LIGHT },
  { model: CRATE, position: [5.2, -2.1, 0], rotation: aboutZ(20), scale: 1, color: WHITE },
  { model: CRATE, position: [-3.2, 2.2, 0.02], rotation: aboutZ(0), scale: 1, color: ROOM_PROP_LIGHT },
  { model: CRATE, position: [-3.2, 2.2, 0.62], rotation: aboutZ(30), scale: 0.8, color: ROOM_PROP_LIGHT },
  { model: CRATE, position: [-2.5, 2.25, 0.02], rotation: aboutZ(-10), scale: 1, color: ROOM_PROP_LIGHT },
];

/**
 * The cottage's portals (P6.5), both in the middle of the front wall's thickness (y = −2.85), their plane looking
 * INTO the room (+y): 0 = the door, 1 = the window. The room is on their positive side, the shell on the negative.
 * The shed is not connected: it is an exterior group, like the shell.
 */
export const COTTAGE_PORTAL = { door: 0, window: 1 } as const;
const PORTAL_Y = -COTTAGE.halfY + COTTAGE.wall / 2;
const portalRect = (x0: number, x1: number, z0: number, z1: number): number[] => [x0, PORTAL_Y, z0, x1, PORTAL_Y, z0, x1, PORTAL_Y, z1, x0, PORTAL_Y, z1];
export const COTTAGE_PORTAL_VERTICES = new Float32Array([...portalRect(COTTAGE.door.x0, COTTAGE.door.x1, 0, COTTAGE.door.top), ...portalRect(COTTAGE.window.x0, COTTAGE.window.x1, COTTAGE.window.z0, COTTAGE.window.z1)]);
export const COTTAGE_PORTALS: readonly BuildingPortal[] = [{ startVertex: 0, vertexCount: 4, plane: [0, 1, 0, -PORTAL_Y] }, { startVertex: 4, vertexCount: 4, plane: [0, 1, 0, -PORTAL_Y] }];
/** References 0–1 belong to the shell (it is on the negative side), 2–3 to the room. */
export const COTTAGE_PORTAL_REFS: readonly BuildingPortalRef[] = [
  { portal: 0, neighborGroup: COTTAGE_GROUP.room, side: -1 }, { portal: 1, neighborGroup: COTTAGE_GROUP.room, side: -1 },
  { portal: 0, neighborGroup: COTTAGE_GROUP.shell, side: 1 }, { portal: 1, neighborGroup: COTTAGE_GROUP.shell, side: 1 },
];

/** The room's fog (P6.7): a warm dimness that starts 2 from the eye (8 × 0.25) and is complete at 8. */
export const COTTAGE_FOGS: readonly BuildingFog[] = [{ flags: 0, position: [0, 0, 1.5], innerRadius: 2, outerRadius: 10, end: 8, startScalar: 0.25, color: [0.3, 0.24, 0.18] }];

export function buildCottage(style: 'procedural' | 'solid' = 'procedural'): Building {
  const groups = [{ ...buildShell(), portalRefStart: 0, portalRefCount: 2 }, { ...buildRoom(), portalRefStart: 2, portalRefCount: 2, fogIndices: [0] }, buildShed()];
  return { name: 'fixture-cottage', textures: cottageTextures(style), materials: COTTAGE_MATERIALS, groups, portalVertices: COTTAGE_PORTAL_VERTICES, portals: COTTAGE_PORTALS, portalRefs: COTTAGE_PORTAL_REFS, fogs: COTTAGE_FOGS, doodadModels: COTTAGE_DOODAD_MODELS, doodads: COTTAGE_DOODADS, doodadSets: COTTAGE_DOODAD_SETS };
}
