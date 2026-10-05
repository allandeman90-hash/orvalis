import { describe, expect, it } from 'vitest';
import {
  BASIN, BASIN_GROUP, buildBasin, buildBuildingLiquidGeometry, buildCottage, BUILDING_LIQUID_CELL_STEP, BUILDING_LIQUID_HOLE, type BuildingLiquid, buildingLiquidHeightAt, resolveBuildingLiquidType, validateBuilding,
  validateBuildingLiquid,
} from '../../src/building';
import { BuildingRenderer } from '../../src/buildingRender';
import { formatOverlay } from '../../src/debug';
import { mat4 } from '../../src/math';
import { NullBackend } from '../../src/renderer';
import { createBuildingScene } from '../../src/scenes/buildingScene';
import { parseSceneRequest } from '../../src/scenes/select';
import { DEFAULT_TERRAIN_LIGHTING, LIQUID_MATERIALS, terrainLight } from '../../src/terrainRender';

const STEP = BUILDING_LIQUID_CELL_STEP;
const basin = buildBasin('solid');
const pool = basin.groups[BASIN_GROUP.pool]!.liquid!, vat = basin.groups[BASIN_GROUP.vat]!.liquid!;
const grid = (xVerts: number, yVerts: number, tiles: number[], extra: Partial<BuildingLiquid> = {}): BuildingLiquid => ({ xVerts, yVerts, base: [10, 20, 3], heights: new Float32Array(xVerts * yVerts), tiles: new Uint8Array(tiles), ...extra });

describe('building liquid grid (spec §128–§129)', () => {
  it('the step is the byte-verified constant, in yards', () => {
    expect(STEP).toBe(4.166666507720947);
  });
  it('vertex (i, j) = base + (i × STEP, j × STEP, height[i, j])', () => {
    const heights = new Float32Array([0, 0.5, 1, 0.25, 0.75, 1.25]);
    const { vertices } = buildBuildingLiquidGeometry(grid(3, 2, [0, 0], { heights }));
    expect(vertices.length).toBe(6 * 4);
    const at = (i: number, j: number) => Array.from(vertices.subarray((j * 3 + i) * 4, (j * 3 + i) * 4 + 4));
    expect(at(0, 0)).toEqual([10, 20, 3, 0]);
    expect(at(2, 0)).toEqual([Math.fround(10 + 2 * STEP), 20, 4, 0]);
    expect(at(1, 1)).toEqual([Math.fround(10 + STEP), Math.fround(20 + STEP), 3.75, 0]);
  });
  it('xVerts × yVerts vertices make (xVerts − 1) × (yVerts − 1) tiles, two triangles each', () => {
    const geometry = buildBuildingLiquidGeometry(grid(4, 3, [0, 0, 0, 0, 0, 0]));
    expect([geometry.wetTiles, geometry.indices.length]).toEqual([6, 36]);
    expect(Array.from(geometry.indices.subarray(0, 6))).toEqual([0, 1, 5, 0, 5, 4]);
  });
  it('a tile whose low nibble is 0xF is a hole: no geometry (the high nibble does not matter)', () => {
    const geometry = buildBuildingLiquidGeometry(grid(3, 2, [0x0f, 0x40]));
    expect(geometry.wetTiles).toBe(1);
    expect(Array.from(geometry.indices)).toEqual([1, 2, 5, 1, 5, 4]);
    expect(buildBuildingLiquidGeometry(grid(3, 2, [0xff, 0x1f])).wetTiles).toBe(0);
  });
  it('unitsPerYard scales the step, not the heights', () => {
    const { vertices } = buildBuildingLiquidGeometry(grid(2, 2, [0], { heights: new Float32Array([0, 0, 0, 2]) }), 0.5);
    expect(Array.from(vertices.subarray(12, 16))).toEqual([Math.fround(10 + STEP / 2), Math.fround(20 + STEP / 2), 5, 0]);
    expect(() => buildBuildingLiquidGeometry(grid(2, 2, [0]), 0)).toThrow(/unitsPerYard/);
  });
  it('rejects a grid that is too small, or whose arrays do not match it', () => {
    expect(() => validateBuildingLiquid(grid(1, 2, []))).toThrow(/at least 2 × 2/);
    expect(() => validateBuildingLiquid(grid(2, 2, [0, 0]))).toThrow(/1 × 1 tiles need 1 flags/);
    expect(() => validateBuildingLiquid(grid(2, 2, [0], { heights: new Float32Array(3) }))).toThrow(/need 4 heights/);
    expect(() => validateBuildingLiquid(grid(2, 2, [0], { heights: new Float32Array([0, NaN, 0, 0]) }))).toThrow(/finite/);
    expect(() => validateBuildingLiquid(grid(2, 2, [7]))).toThrow(/unknown liquid kind 7/);
    expect(() => validateBuilding({ ...basin, groups: [{ ...basin.groups[0]!, liquid: grid(2, 2, [0, 0]) }] })).toThrow(/group 0 \("pool"\) liquid/);
  });
});

describe('liquid kind (spec §130)', () => {
  it('the group value wins when its low nibble is not 0xF', () => {
    expect(resolveBuildingLiquidType(grid(2, 2, [0], { groupLiquid: 2 }))).toBe('magma');
    expect(resolveBuildingLiquidType(grid(2, 2, [0], { groupLiquid: 0x13 }))).toBe('slime');
  });
  it('otherwise the first tile that is not a hole decides, for the WHOLE surface', () => {
    expect(resolveBuildingLiquidType(grid(4, 2, [0x0f, 1, 3]))).toBe('ocean');
    expect(resolveBuildingLiquidType(grid(4, 2, [0x0f, 1, 3], { groupLiquid: 0x0f }))).toBe('ocean');
    const geometry = buildBuildingLiquidGeometry(grid(4, 2, [0x0f, 1, 3]));
    expect([geometry.type, geometry.wetTiles]).toEqual(['ocean', 2]); // the slime tile is drawn as ocean too
  });
  it('with no group value and only holes there is no kind', () => {
    expect(resolveBuildingLiquidType(grid(3, 2, [0x0f, 0x0f]))).toBeNull();
  });
});

describe('liquid height query', () => {
  const sloped = grid(2, 2, [0], { heights: new Float32Array([0, 1, 0, 3]) }); // (1,0) = 1, (1,1) = 3
  it('follows the two triangles of the tile exactly', () => {
    expect(buildingLiquidHeightAt(sloped, 10, 20)).toBe(3);
    expect(buildingLiquidHeightAt(sloped, 10 + STEP, 20)).toBeCloseTo(4, 5);
    expect(buildingLiquidHeightAt(sloped, 10 + STEP, 20 + STEP)).toBeCloseTo(6, 5);
    // On the diagonal, half-way: the mean of corners (0,0) and (1,1).
    expect(buildingLiquidHeightAt(sloped, 10 + STEP / 2, 20 + STEP / 2)).toBeCloseTo(4.5, 5);
    // Lower triangle (a, b, c) at (0.75, 0.25): 0 + 1 × 0.75 + 2 × 0.25.
    expect(buildingLiquidHeightAt(sloped, 10 + STEP * 0.75, 20 + STEP * 0.25)).toBeCloseTo(3 + 1.25, 5);
    // Upper triangle (a, c, d) at (0.25, 0.75): 0 + 3 × 0.25 + 0 × 0.75.
    expect(buildingLiquidHeightAt(sloped, 10 + STEP * 0.25, 20 + STEP * 0.75)).toBeCloseTo(3 + 0.75, 5);
  });
  it('is null outside the grid and over a hole', () => {
    expect(buildingLiquidHeightAt(sloped, 9.99, 20)).toBeNull();
    expect(buildingLiquidHeightAt(sloped, 10, 20 + STEP + 0.01)).toBeNull();
    expect(buildingLiquidHeightAt(pool, STEP / 2, STEP / 2)).toBeNull(); // the platform's tile
    expect(buildingLiquidHeightAt(pool, -STEP / 2, STEP / 2)).toBeCloseTo(BASIN.pool.water, 6);
  });
});

describe('the basin fixture', () => {
  it('is a valid building of two groups, each with its own liquid', () => {
    expect(() => validateBuilding(basin)).not.toThrow();
    expect(basin.groups.map((group) => group.name)).toEqual(['pool', 'vat']);
    expect(buildCottage('solid').groups.every((group) => group.liquid === undefined)).toBe(true);
  });
  it('the pool is an L of river water: 3 wet tiles, the north-east one a hole', () => {
    const geometry = buildBuildingLiquidGeometry(pool);
    expect([geometry.type, geometry.wetTiles, pool.tiles[3]]).toEqual(['river', 3, BUILDING_LIQUID_HOLE]);
  });
  it('the vat’s tile says river but its group says magma: magma', () => {
    expect([vat.tiles[0], vat.groupLiquid, resolveBuildingLiquidType(vat)]).toEqual([0, 2, 'magma']);
  });
});

describe('BuildingRenderer.drawLiquids', () => {
  const identity = mat4.identity(mat4.create());
  function draw(options: { visible?: number[]; timeMs?: number; building?: typeof basin } = {}) {
    const backend = new NullBackend(), renderer = new BuildingRenderer(backend, 'building', { liquidFrames: 'solid' });
    const id = renderer.addBuilding(options.building ?? basin);
    const seen: Array<{ blend: string; depthWrite: boolean; cullMode: string; indexCount: number; tint: number[]; params: number[]; texture: number }> = [];
    const original = backend.draw.bind(backend);
    backend.draw = (call) => {
      const u = call.uniforms as Float32Array, state = backend.pipelineState(call.pipeline)!;
      seen.push({ blend: state.blend, depthWrite: state.depthWrite, cullMode: state.cullMode, indexCount: call.indexCount ?? 0, tint: Array.from(u.subarray(16, 20)), params: Array.from(u.subarray(32, 36)), texture: call.textures![0] as number });
      return original(call);
    };
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    const result = renderer.drawLiquids(identity, [{ building: id, matrix: identity, ...(options.visible ? { visibleGroups: new Set(options.visible) } : {}) }], { timeMs: options.timeMs ?? 0 });
    backend.endFrame();
    return { backend, renderer, seen, result };
  }
  it('one draw per surface: the opaque magma first (it writes depth), then the blended river; both two-sided', () => {
    const { seen, result, renderer } = draw();
    expect(result).toEqual({ surfaces: 2, draws: 2, triangles: 2 + 6, frame: 0 });
    expect(seen.map((s) => [s.blend, s.depthWrite, s.cullMode, s.indexCount])).toEqual([['opaque', true, 'none', 6], ['alpha', false, 'none', 18]]);
    renderer.dispose();
  });
  it('tint: the river is lit like flat ground with its class alpha; the magma is full-bright; no depth response', () => {
    const { seen, renderer } = draw();
    const sun = terrainLight(DEFAULT_TERRAIN_LIGHTING, [0, 0, 1]);
    expect(seen[0]!.tint).toEqual([1, 1, 1, 1]);
    seen[1]!.tint.forEach((value, k) => expect(value).toBeCloseTo(k < 3 ? sun[k]! : LIQUID_MATERIALS.river.alpha, 6));
    for (const s of seen) expect(s.params).toEqual([1 / 16, 0, 0, 0]);
    renderer.dispose();
  });
  it('an INTERIOR group’s liquid is full-bright (our choice until the interior lighting step)', () => {
    const interior = { ...basin, groups: basin.groups.map((group, g) => (g === 0 ? { ...group, flags: 0 } : group)) };
    const { seen, renderer } = draw({ building: interior });
    expect(seen[1]!.tint.slice(0, 3)).toEqual([1, 1, 1]);
    renderer.dispose();
  });
  it('a group that is not visible does not draw its liquid (spec §166)', () => {
    const only = draw({ visible: [BASIN_GROUP.vat] });
    expect([only.result.surfaces, only.seen.map((s) => s.blend)]).toEqual([1, ['opaque']]);
    only.renderer.dispose();
    const none = draw({ visible: [] });
    expect(none.result.draws).toBe(0);
    none.renderer.dispose();
  });
  it('the animation frame follows the time: another texture of the same class', () => {
    const a = draw({ timeMs: 0 }), b = draw({ timeMs: 625 });
    expect([a.result.frame, b.result.frame]).toEqual([0, 15]);
    expect(a.seen[1]!.texture).not.toBe(b.seen[1]!.texture);
    a.renderer.dispose();
    b.renderer.dispose();
  });
  it('uploads frames only for the classes in use, and frees everything', () => {
    const { backend, renderer } = draw();
    // 8 building textures + 30 frames × 2 classes; per group: vertex, index, 2 collision sets, liquid vertex, liquid index.
    expect([backend.liveTextureCount, backend.liveBufferCount]).toEqual([8 + 60, 2 * 6]);
    renderer.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
    const cottage = new NullBackend(), other = new BuildingRenderer(cottage);
    other.addBuilding(buildCottage('solid'));
    expect(cottage.liveTextureCount).toBe(8);
    other.dispose();
  });
  it('a surface with only holes and no group value is not uploaded', () => {
    const dry = { ...basin, groups: basin.groups.map((group, g) => (g === 1 ? { ...group, liquid: { ...group.liquid!, tiles: new Uint8Array([0x0f]), groupLiquid: undefined } } : group)) };
    const { result, renderer } = draw({ building: dry });
    expect(result.surfaces).toBe(1);
    renderer.dispose();
  });
});

describe('scene=building&building=basin', () => {
  it('reads the fixture and the liquid switch from the URL; the inside view stays the cottage’s', () => {
    expect(parseSceneRequest('?scene=building&building=basin&liquids=off&view=inside')).toMatchObject({ fixture: 'basin', liquids: false, view: 'outside' });
    expect(parseSceneRequest('?scene=building&building=x')).toMatchObject({ fixture: 'cottage', liquids: true });
    expect(() => createBuildingScene(new NullBackend(), { fixture: 'basin', view: 'inside' })).toThrow(/inside view/);
  });
  it('draws the two surfaces after the opaque geometry; L turns them off; hiding a group hides its liquid', () => {
    const backend = new NullBackend(), scene = createBuildingScene(backend, { fixture: 'basin', palette: 'solid' });
    scene.setAnimationTime(625);
    expect(scene.render(16 / 9).drawCalls).toBe(2 + 2);
    expect(scene.building).toMatchObject({ name: 'fixture-basin', groups: 2, batchesDrawn: 2, liquidSurfaces: 2, liquidsDrawn: 2, liquidTriangles: 8, liquidFrame: 15, liquidsShown: true, doodads: 0 });
    const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 4, triangles: 1, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
    expect(formatOverlay({ ...base, building: scene.building }).join('\n')).toContain('Building liquid: 2 of 2 surfaces drawn (L) · 8 triangles · frame 15/30');
    scene.toggleGroup(BASIN_GROUP.pool);
    scene.render(16 / 9);
    expect(scene.building).toMatchObject({ liquidsDrawn: 1, liquidTriangles: 2 });
    scene.toggleGroup(BASIN_GROUP.pool);
    expect(scene.toggleLiquids()).toBe(false);
    expect(scene.render(16 / 9).drawCalls).toBe(2);
    expect(formatOverlay({ ...base, building: scene.building }).join('\n')).toContain('Building liquid: off (L)');
    scene.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });
  it('the cottage has no liquid line in the overlay; the flat debug views and the collision view draw no liquid', () => {
    const cottage = createBuildingScene(new NullBackend(), {});
    cottage.render(16 / 9);
    const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 4, triangles: 1, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
    expect(formatOverlay({ ...base, building: cottage.building }).join('\n')).not.toContain('Building liquid');
    cottage.dispose();
    const scene = createBuildingScene(new NullBackend(), { fixture: 'basin', debugMode: 'groups' });
    scene.render(16 / 9);
    expect(scene.building.liquidsDrawn).toBe(0);
    scene.dispose();
    const collision = createBuildingScene(new NullBackend(), { fixture: 'basin', collisionView: 'player' });
    collision.render(16 / 9);
    expect(collision.building.liquidsDrawn).toBe(0);
    collision.dispose();
  });
});
