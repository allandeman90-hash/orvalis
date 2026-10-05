import { describe, expect, it } from 'vitest';
import {
  type Building, BUILDING_ALPHA_REFERENCE, BUILDING_GROUP_FLAG, BUILDING_MATERIAL_FLAG, BUILDING_VERTEX_BYTES, buildCottage, BuildingGroupBuilder, buildingMaterialState, COTTAGE, COTTAGE_COLOURS, COTTAGE_GROUP,
  COTTAGE_MATERIAL, cottageTextures, groupIsInterior, latticeIsBar, packBuildingGroup, ROOM_LIGHT, validateBuilding,
} from '../../src/building';
import { BuildingRenderer, CLASS_DEBUG_COLOURS, GROUP_DEBUG_COLOURS } from '../../src/buildingRender';
import { formatOverlay } from '../../src/debug';
import { mat4 } from '../../src/math';
import { BUILDING_SHADER, BUILDING_UNIFORM_BYTES, NullBackend } from '../../src/renderer';
import { createBuildingScene } from '../../src/scenes/buildingScene';
import { parseSceneRequest } from '../../src/scenes/select';

const cottage = buildCottage('solid');
const identity = mat4.identity(mat4.create());

describe('building materials (spec §107–§109)', () => {
  const state = (blendMode: number, flags = 0) => buildingMaterialState({ name: 'm', flags, blendMode, textures: [0] });
  it('blend modes use the buildings’ own numbering: 0 opaque, 1 alpha test, 4 mod, 5 mod2x, the rest blended', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((mode) => state(mode).blend)).toEqual(['opaque', 'opaque', 'alpha', 'alpha', 'mod', 'mod2x', 'alpha']);
    expect([0, 1, 2, 4, 5].map((mode) => state(mode).transparent)).toEqual([false, false, true, true, true]);
    expect([0, 1, 2, 4, 5].map((mode) => state(mode).depthWrite)).toEqual([true, true, false, false, false]);
  });
  it('only mode 1 has an alpha test', () => {
    expect([0, 1, 2, 4, 5].map((mode) => state(mode).alphaReference)).toEqual([0, BUILDING_ALPHA_REFERENCE, 0, 0, 0]);
  });
  it('flags: 0x01 unlit, 0x04 unculled; back-face culling is the default', () => {
    expect(BUILDING_MATERIAL_FLAG).toEqual({ unlit: 0x01, unculled: 0x04, nightGlow: 0x10, window: 0x20 });
    expect([state(0).cullMode, state(0).unlit]).toEqual(['back', false]);
    expect(state(0, 0x04).cullMode).toBe('none');
    expect(state(0, 0x01).unlit).toBe(true);
    expect(state(0, 0x10 | 0x20)).toEqual(state(0)); // night glow and window do not change the render state yet
  });
  it('a material has one or two textures, never three', () => {
    const three: Building = { ...cottage, materials: [{ name: 'm', flags: 0, blendMode: 0, textures: [0, 1, 2] }, ...cottage.materials.slice(1)] };
    expect(() => validateBuilding(three)).toThrow(/takes 1 or 2 textures \(got 3\)/);
    expect(cottage.materials[COTTAGE_MATERIAL.stone]!.textures).toHaveLength(2);
  });
});

describe('group classification (spec §116, §171)', () => {
  it('a true interior has neither the exterior nor the exterior-lit flag', () => {
    expect(groupIsInterior(0)).toBe(true);
    expect(groupIsInterior(BUILDING_GROUP_FLAG.exterior)).toBe(false);
    expect(groupIsInterior(BUILDING_GROUP_FLAG.exteriorLit)).toBe(false);
    expect(groupIsInterior(0x48)).toBe(false);
    expect(groupIsInterior(0x01 | 0x02 | 0x04 | 0x10)).toBe(true); // other bits do not make a group exterior
  });
});

describe('the cottage: one building, three separate groups', () => {
  it('is valid: 3 groups, 7 materials, 8 textures', () => {
    expect(() => validateBuilding(cottage)).not.toThrow();
    expect(cottage.groups.map((g) => g.name)).toEqual(['shell', 'room', 'shed']);
    expect([cottage.materials.length, cottage.textures.length]).toEqual([7, 8]);
  });
  it('the room is the only interior group', () => {
    expect(cottage.groups.map((g) => groupIsInterior(g.flags))).toEqual([false, true, false]);
  });
  it('each group has its own vertices and indices: nothing is shared or merged', () => {
    const [shell, room, shed] = cottage.groups;
    expect(new Set([shell!.positions, room!.positions, shed!.positions]).size).toBe(3);
    for (const group of cottage.groups) expect(Math.max(...group.indices)).toBe(group.vertexCount - 1);
  });
  it('batches: one per material used, in the order trans → interior → exterior, covering the indices', () => {
    const M = COTTAGE_MATERIAL;
    expect(cottage.groups[COTTAGE_GROUP.shell]!.batches.map((b) => [b.material, b.batchClass])).toEqual([[M.stone, 'exterior'], [M.wood, 'exterior'], [M.roof, 'exterior'], [M.lattice, 'exterior']]);
    expect(cottage.groups[COTTAGE_GROUP.room]!.batches.map((b) => [b.material, b.batchClass])).toEqual([[M.glass, 'trans'], [M.plaster, 'interior'], [M.planks, 'interior']]);
    expect(cottage.groups[COTTAGE_GROUP.shed]!.batches.map((b) => [b.material, b.batchClass])).toEqual([[M.wood, 'exterior'], [M.roof, 'exterior']]);
    for (const group of cottage.groups) expect(group.batches.reduce((sum, b) => sum + b.indexCount, 0)).toBe(group.indices.length);
  });
  it('group boxes contain their geometry; the room lies inside the shell', () => {
    const [shell, room, shed] = cottage.groups;
    expect(shell!.bounds.min).toEqual([-4.4, -3.4, 0]);
    expect(shell!.bounds.max[2]).toBeCloseTo(COTTAGE.ridge, 6);
    for (let k = 0; k < 3; k++) {
      expect(room!.bounds.min[k]).toBeGreaterThanOrEqual(shell!.bounds.min[k]!);
      expect(room!.bounds.max[k]).toBeLessThanOrEqual(shell!.bounds.max[k]!);
    }
    expect(shed!.bounds.min[0]).toBe(COTTAGE.halfX); // against the east wall
  });
  it('every face looks towards its visible side: walls of the shell outwards, walls of the room inwards', () => {
    const outward = (group: (typeof cottage.groups)[number], sign: number): void => {
      for (let v = 0; v < group.vertexCount; v++) {
        const n = [group.normals[v * 3]!, group.normals[v * 3 + 1]!], p = [group.positions[v * 3]!, group.positions[v * 3 + 1]!];
        // Only the four main walls: vertical faces lying on the outline of the group.
        if (group.normals[v * 3 + 2] !== 0) continue;
        const onX = Math.abs(Math.abs(p[0]!) - Math.abs(group === cottage.groups[1] ? 3.7 : 4)) < 1e-6 && n[0] !== 0;
        const onY = Math.abs(Math.abs(p[1]!) - Math.abs(group === cottage.groups[1] ? 2.7 : 3)) < 1e-6 && n[1] !== 0;
        if (onX) expect(Math.sign(n[0]!)).toBe(sign * Math.sign(p[0]!));
        if (onY) expect(Math.sign(n[1]!)).toBe(sign * Math.sign(p[1]!));
      }
    };
    outward(cottage.groups[0]!, 1);
    outward(cottage.groups[1]!, -1);
  });
  it('the room has baked colours; the shell is white', () => {
    const room = cottage.groups[1]!, shell = cottage.groups[0]!;
    expect(new Set(Array.from(shell.colors!)).size).toBe(1);
    const colours = new Set<string>();
    for (let v = 0; v < room.vertexCount; v++) colours.add(Array.from(room.colors!.subarray(v * 4, v * 4 + 3)).join(','));
    for (const want of [ROOM_LIGHT.floor, ROOM_LIGHT.backWall, ROOM_LIGHT.ceiling, ROOM_LIGHT.wallBottom, ROOM_LIGHT.wallTop]) expect(colours.has(want.slice(0, 3).join(','))).toBe(true);
  });
  it('the front wall has a door and a window: no triangle of a wall crosses the openings', () => {
    const { door, window } = COTTAGE;
    for (const group of [cottage.groups[0]!, cottage.groups[1]!]) {
      const frontY = group === cottage.groups[0] ? -3 : -2.7;
      for (let t = 0; t < group.indices.length; t += 3) {
        const corners = [0, 1, 2].map((k) => { const v = group.indices[t + k]!; return [group.positions[v * 3]!, group.positions[v * 3 + 1]!, group.positions[v * 3 + 2]!]; });
        if (!corners.every((c) => Math.abs(c[1]! - frontY) < 1e-6)) continue;
        const cx = (corners[0]![0]! + corners[1]![0]! + corners[2]![0]!) / 3, cz = (corners[0]![2]! + corners[1]![2]! + corners[2]![2]!) / 3;
        expect(cx > door.x0 && cx < door.x1 && cz < door.top).toBe(false);
        expect(cx > window.x0 && cx < window.x1 && cz > window.z0 && cz < window.z1).toBe(false);
      }
    }
  });
  it('textures: flat colours in the solid style; the lattice has opaque bars and empty openings in both styles', () => {
    const solid = cottageTextures('solid'), painted = cottageTextures('procedural');
    expect(Array.from(solid[0]!.data.subarray(0, 4))).toEqual([...COTTAGE_COLOURS.stone]);
    expect(Array.from(solid[5]!.data.subarray(0, 4))).toEqual([...COTTAGE_COLOURS.glass]);
    for (const set of [solid, painted]) {
      const lattice = set[4]!;
      expect(Array.from(lattice.data.subarray((5 * 32 + 1) * 4, (5 * 32 + 1) * 4 + 4))).toEqual([...COTTAGE_COLOURS.latticeBar]);
      expect(lattice.data[(5 * 32 + 5) * 4 + 3]).toBe(0);
    }
    expect([latticeIsBar(1, 5), latticeIsBar(5, 5), latticeIsBar(5, 9)]).toEqual([true, false, true]);
    expect(new Set(Array.from(painted[0]!.data)).size).toBeGreaterThan(8);
  });
});

describe('building validation', () => {
  const withGroup = (change: Partial<(typeof cottage.groups)[number]>): Building => ({ ...cottage, groups: [{ ...cottage.groups[0]!, ...change }, ...cottage.groups.slice(1)] });
  it('rejects batches out of class order, with gaps, or pointing to a missing material', () => {
    const shell = cottage.groups[0]!;
    expect(() => validateBuilding(withGroup({ batches: [{ ...shell.batches[0]!, batchClass: 'exterior' }, { ...shell.batches[1]!, batchClass: 'trans' }, ...shell.batches.slice(2)] }))).toThrow(/out of order: trans, then interior, then exterior/);
    expect(() => validateBuilding(withGroup({ batches: [{ ...shell.batches[0]!, firstIndex: 3 }, ...shell.batches.slice(1)] }))).toThrow(/must start at index 0/);
    expect(() => validateBuilding(withGroup({ batches: [{ ...shell.batches[0]!, material: 42 }, ...shell.batches.slice(1)] }))).toThrow(/refers to material 42/);
    expect(() => validateBuilding(withGroup({ batches: shell.batches.slice(0, 2) }))).toThrow(/batches cover/);
  });
  it('rejects a vertex outside the authored box, and a building without groups', () => {
    expect(() => validateBuilding(withGroup({ bounds: { min: [-1, -1, 0], max: [1, 1, 1] } }))).toThrow(/outside the group's bounding box/);
    expect(() => validateBuilding({ ...cottage, groups: [] })).toThrow(/at least one group/);
  });
  it('the builder refuses triangles before a batch is opened', () => {
    const b = new BuildingGroupBuilder('g', 0);
    const v = b.vertex([0, 0, 0], [0, 0, 1], [0, 0]);
    expect(() => b.triangle(v, v, v)).toThrow(/open a batch/);
  });
  it('packs 36 bytes per vertex: position, normal, uv, colour', () => {
    const room = cottage.groups[1]!, packed = packBuildingGroup(room), view = new DataView(packed.buffer);
    expect(packed.length).toBe(room.vertexCount * BUILDING_VERTEX_BYTES);
    expect(view.getFloat32(BUILDING_VERTEX_BYTES * 2 + 8, true)).toBe(room.positions[2 * 3 + 2]);
    expect(Array.from(packed.subarray(32, 36))).toEqual(Array.from(room.colors!.subarray(0, 4)));
  });
});

describe('BuildingRenderer', () => {
  interface Seen { vertexBuffer: number; firstIndex: number; indexCount: number; blend: string; cullMode: string; params: number[]; debug: number[]; texture: number }
  function draw(options: { visible?: number[]; debugMode?: 'lit' | 'groups' | 'classes' | 'colors' } = {}) {
    const backend = new NullBackend();
    const renderer = new BuildingRenderer(backend);
    const id = renderer.addBuilding(cottage);
    const seen: Seen[] = [];
    const original = backend.draw.bind(backend);
    backend.draw = (call) => {
      const u = call.uniforms as Float32Array, state = backend.pipelineState(call.pipeline)!;
      seen.push({ vertexBuffer: call.vertexBuffer, firstIndex: call.firstIndex ?? 0, indexCount: call.indexCount ?? 0, blend: state.blend, cullMode: state.cullMode, params: Array.from(u.subarray(56, 60)), debug: Array.from(u.subarray(60, 63)), texture: call.textures![0] as number });
      return original(call);
    };
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    const result = renderer.draw(identity, [{ building: id, matrix: identity, ...(options.visible ? { visibleGroups: new Set(options.visible) } : {}) }], { debugMode: options.debugMode ?? 'lit' });
    backend.endFrame();
    return { backend, renderer, seen, result };
  }

  it('uploads PER GROUP one vertex buffer, one index buffer and one index buffer per collision set; the textures once for the building', () => {
    const { backend, renderer } = draw();
    // The collision sets add index buffers only: the vertices are not uploaded again (spec §124).
    // … plus the building's portal polygons (one vertex and one index buffer, for the debug view).
    expect(backend.liveBufferCount).toBe(3 * (1 + 1 + 2) + 2);
    expect(backend.liveTextureCount).toBe(8);
    renderer.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });
  it('draws one call per batch, each with its index range and its group’s own buffers', () => {
    const { seen, result, renderer } = draw();
    expect(result).toEqual({ groups: 3, draws: 9, triangles: cottage.groups.reduce((sum, g) => sum + g.indices.length / 3, 0) });
    expect(new Set(seen.map((s) => s.vertexBuffer)).size).toBe(3);
    // The blended batch (the glass screen) comes last, after every opaque batch of every group.
    expect(seen.map((s) => s.blend)).toEqual(['opaque', 'opaque', 'opaque', 'opaque', 'opaque', 'opaque', 'opaque', 'opaque', 'alpha']);
    renderer.dispose();
  });
  it('draws only the groups listed as visible', () => {
    const { result, renderer } = draw({ visible: [1] });
    expect(result).toMatchObject({ groups: 1, draws: 3 });
    renderer.dispose();
    const none = draw({ visible: [] });
    expect(none.result).toEqual({ groups: 0, draws: 0, triangles: 0 });
    none.renderer.dispose();
  });
  it('tells the shader the lighting path of each batch, which batches are unlit and which are alpha-tested', () => {
    const { seen, renderer } = draw();
    // shell: 4 batches (stone, wood, roof, lattice); room: plaster, planks; shed: wood, roof; then glass.
    expect(seen.map((s) => s.params[1])).toEqual([0, 0, 0, 0, 1, 1, 0, 0, 2]); // 0 sun · 1 interior · 2 trans (the glass)
    expect(seen.map((s) => s.params[2])).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1]); // unlit: the glass
    expect(seen[3]!.params[3]).toBeCloseTo(BUILDING_ALPHA_REFERENCE, 6); // lattice
    expect(seen.filter((_, k) => k !== 3).every((s) => s.params[3] === 0)).toBe(true);
    expect(seen.map((s) => s.cullMode)).toEqual(['back', 'back', 'none', 'none', 'back', 'back', 'back', 'none', 'none']);
    renderer.dispose();
  });
  it('each batch binds the first texture of its material', () => {
    const { seen, renderer } = draw();
    // The roof of the shell and the roof of the shed share one texture; stone and wood do not.
    expect(seen[2]!.texture).toBe(seen[7]!.texture);
    expect(seen[1]!.texture).toBe(seen[6]!.texture);
    expect(seen[0]!.texture).not.toBe(seen[1]!.texture);
    renderer.dispose();
  });
  it('debug views: a flat colour per group, or per batch class', () => {
    const groups = draw({ debugMode: 'groups' });
    expect(groups.seen.map((s) => s.debug)).toEqual([0, 0, 0, 0, 1, 1, 2, 2, 1].map((g) => [...GROUP_DEBUG_COLOURS[g]!]));
    groups.renderer.dispose();
    const classes = draw({ debugMode: 'classes' });
    expect(classes.seen[4]!.debug).toEqual([...CLASS_DEBUG_COLOURS.interior]);
    expect(classes.seen[0]!.debug).toEqual([...CLASS_DEBUG_COLOURS.exterior]);
    expect(classes.seen[8]!.debug).toEqual([...CLASS_DEBUG_COLOURS.trans]);
    classes.renderer.dispose();
  });
  it('the shader declares the same uniform block in WGSL and GLSL', () => {
    expect(BUILDING_UNIFORM_BYTES).toBe(256);
    for (const field of ['mvp', 'model', 'light', 'ambient', 'diffuse', 'eye', 'fogColor', 'fogRange', 'params', 'debugColor']) {
      expect(BUILDING_SHADER.wgsl).toContain(`${field}:`);
      expect(BUILDING_SHADER.glslVertex).toContain(`u_${field};`);
      expect(BUILDING_SHADER.glslFragment).toContain(`u_${field};`);
    }
  });
  it('rejects an unknown building', () => {
    const backend = new NullBackend(), renderer = new BuildingRenderer(backend);
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    expect(() => renderer.draw(identity, [{ building: 99 as never, matrix: identity }], { debugMode: 'lit' })).toThrow(/unknown building 99/);
    backend.endFrame();
    renderer.dispose();
  });
});

describe('scene=building', () => {
  it('is selected by the URL with its options', () => {
    expect(parseSceneRequest('?scene=building')).toEqual({ scene: 'building', fixture: 'cottage', visibility: 'portals', interiorFog: true, eye: undefined, portals: false, liquids: true, view: 'outside', debugMode: 'lit', hiddenGroups: [], palette: 'procedural', pitchDegrees: undefined, headingDegrees: 30, zoom: 1, doodads: true, doodadSet: 0, doodadDebug: 'lit', collisionView: 'off' });
    expect(parseSceneRequest('?scene=building&view=inside&buildingDebug=groups&hideGroups=0,2,0&textures=solid&pitch=-10&heading=90&zoom=2')).toEqual({ scene: 'building', fixture: 'cottage', visibility: 'portals', interiorFog: true, eye: undefined, portals: false, liquids: true, view: 'inside', debugMode: 'groups', hiddenGroups: [0, 2], palette: 'solid', pitchDegrees: -10, headingDegrees: 90, zoom: 2, doodads: true, doodadSet: 0, doodadDebug: 'lit', collisionView: 'off' });
    expect(parseSceneRequest('?scene=building&hideGroups=7')).toMatchObject({ hiddenGroups: [] });
  });
  it('draws the three groups; keys hide and show them; M cycles the debug views', () => {
    const backend = new NullBackend();
    const scene = createBuildingScene(backend, { doodads: false });
    expect(scene.render(16 / 9).drawCalls).toBe(9);
    expect(scene.building).toMatchObject({ name: 'fixture-cottage', groups: 3, groupsDrawn: 3, batchesDrawn: 9, materials: 7, textures: 8, debugMode: 'lit', hiddenGroups: [] });
    expect(scene.toggleGroup(0)).toBe(false);
    expect(scene.render(16 / 9).drawCalls).toBe(5);
    expect(scene.building.hiddenGroups).toEqual([0]);
    expect(scene.toggleGroup(0)).toBe(true);
    expect(scene.toggleGroup(9)).toBe(false);
    expect([scene.cycleDebugMode(), scene.cycleDebugMode(), scene.cycleDebugMode(), scene.cycleDebugMode()]).toEqual(['groups', 'classes', 'colors', 'lit']);
    const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 9, triangles: 1, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
    scene.render(16 / 9);
    expect(formatOverlay({ ...base, building: scene.building }).join('\n')).toContain('Building: fixture-cottage · 3 of 3 groups drawn (1–3 show / hide) · 9 batches');
    scene.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });
  it('outside the camera looks at the middle of the building; inside it stands in the room', () => {
    const outside = createBuildingScene(new NullBackend(), { pitchDegrees: 20, headingDegrees: 30 });
    outside.render(16 / 9);
    const [x, y] = outside.projectWorldToScreen([1.15, 0, 2.25]); // centre of the bounds: x from −4.4 (eave) to 6.7 (shed roof)
    expect(x).toBeCloseTo(0.5, 4);
    expect(y).toBeCloseTo(0.5, 4);
    outside.dispose();
    const inside = createBuildingScene(new NullBackend(), { view: 'inside', headingDegrees: 0 });
    inside.render(16 / 9);
    expect(Array.from(inside.camera.eye)).toEqual([0, 0, expect.closeTo(1.6, 5)]);
    const [bx, by] = inside.projectWorldToScreen([0, 2.7, 1.6]); // straight ahead on the back wall
    expect(bx).toBeCloseTo(0.5, 4);
    expect(by).toBeCloseTo(0.5, 4);
    inside.dispose();
  });
  it('rejects a hidden group that does not exist', () => {
    expect(() => createBuildingScene(new NullBackend(), { hiddenGroups: [5] })).toThrow(/no group 5/);
  });
});
