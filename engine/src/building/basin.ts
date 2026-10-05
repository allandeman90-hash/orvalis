import { type Building, BUILDING_GROUP_FLAG, type BuildingGroup, BuildingGroupBuilder } from './building';
import { COTTAGE_MATERIAL, COTTAGE_MATERIALS, cottageTextures } from './cottage';
import { BUILDING_LIQUID_CELL_STEP, BUILDING_LIQUID_HOLE, type BuildingLiquid } from './liquid';
import { LIQUID_TYPE_CODE } from '../terrain';

/**
 * An ORIGINAL second fixture (P6.4): two open basins, each a GROUP with its own liquid surface.
 *   0 « pool »  a sunken stone pool, 2 × 2 liquid tiles of river water; the north-east tile is a HOLE, filled by a
 *               stone platform — the water is an L;
 *   1 « vat »   a raised wooden vat east of it, one liquid tile. Its tile says « river » but the GROUP's liquid
 *               value says magma: the group value wins (spec §130).
 * It shares the cottage's textures and materials. Sizes follow the liquid grid step (4.1666665).
 */
const S = BUILDING_LIQUID_CELL_STEP;
export const BASIN = {
  step: S,
  pool: { half: S, floor: -1.2, rim: 0.3, rimWidth: 0.3, water: -0.2 },
  vat: { x0: S + 1.5, x1: 2 * S + 1.5, halfY: S / 2, floor: 0.1, top: 1, liquid: 0.8 },
} as const;
export const BASIN_GROUP = { pool: 0, vat: 1 } as const;

type P = readonly [number, number, number];
/** Four upright rectangles around a box x0..x1 × y0..y1, z0..z1, looking outwards (+1) or inwards (−1). */
function ring(b: BuildingGroupBuilder, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, facing: 1 | -1): void {
  const side = (a: P, c: P): void => {
    // a → c runs counter-clockwise around the box seen from above: that face looks outwards.
    const [from, to] = facing > 0 ? [a, c] : [c, a];
    b.quad([[from[0], from[1], z0], [to[0], to[1], z0], [to[0], to[1], z1], [from[0], from[1], z1]]);
  };
  side([x0, y0, 0], [x1, y0, 0]);
  side([x1, y0, 0], [x1, y1, 0]);
  side([x1, y1, 0], [x0, y1, 0]);
  side([x0, y1, 0], [x0, y0, 0]);
}
const up = (b: BuildingGroupBuilder, x0: number, x1: number, y0: number, y1: number, z: number): void => b.quad([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]);

function buildPool(): BuildingGroup {
  const { half: H, floor, rim, rimWidth: W, water } = BASIN.pool;
  const b = new BuildingGroupBuilder('pool', BUILDING_GROUP_FLAG.exterior);
  b.batch(COTTAGE_MATERIAL.stone, 'exterior');
  up(b, -H, H, -H, H, floor);
  ring(b, -H, H, -H, H, floor, rim, -1); // the pool's sides, seen from inside
  ring(b, -H - W, H + W, -H - W, H + W, 0, rim, 1); // the rim, seen from outside
  up(b, -H - W, H + W, -H - W, -H, rim);
  up(b, -H - W, H + W, H, H + W, rim);
  up(b, -H - W, -H, -H, H, rim);
  up(b, H, H + W, -H, H, rim);
  // The platform fills the north-east tile: its top, and the two sides the water touches.
  up(b, 0, H, 0, H, rim);
  b.quad([[0, H, floor], [0, 0, floor], [0, 0, rim], [0, H, rim]]); // looks west
  b.quad([[0, 0, floor], [H, 0, floor], [H, 0, rim], [0, 0, rim]]); // looks south
  const river = LIQUID_TYPE_CODE.river;
  const liquid: BuildingLiquid = { xVerts: 3, yVerts: 3, base: [-H, -H, water], heights: new Float32Array(9), tiles: new Uint8Array([river, river, river, BUILDING_LIQUID_HOLE]) };
  return b.build(undefined, undefined, liquid);
}

function buildVat(): BuildingGroup {
  const { x0, x1, halfY: Y, floor, top, liquid: level } = BASIN.vat;
  const b = new BuildingGroupBuilder('vat', BUILDING_GROUP_FLAG.exterior);
  b.batch(COTTAGE_MATERIAL.wood, 'exterior');
  up(b, x0, x1, -Y, Y, floor);
  ring(b, x0, x1, -Y, Y, floor, top, -1);
  ring(b, x0, x1, -Y, Y, 0, top, 1);
  const liquid: BuildingLiquid = { xVerts: 2, yVerts: 2, base: [x0, -Y, level], heights: new Float32Array(4), tiles: new Uint8Array([LIQUID_TYPE_CODE.river]), groupLiquid: LIQUID_TYPE_CODE.magma };
  return b.build(undefined, undefined, liquid);
}

export function buildBasin(style: 'procedural' | 'solid' = 'procedural'): Building {
  return { name: 'fixture-basin', textures: cottageTextures(style), materials: COTTAGE_MATERIALS, groups: [buildPool(), buildVat()] };
}
