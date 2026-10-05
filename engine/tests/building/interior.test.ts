import { describe, expect, it } from 'vitest';
import {
  batchLightingPath, type Building, BUILDING_FOG_FLAG_SKIP, BUILDING_GROUP_FLAG, BUILDING_LIGHTING_PATH, buildCottage, buildPropModel, type BuildingFog, COTTAGE, COTTAGE_DOODAD, COTTAGE_FOGS, COTTAGE_GROUP, FOG_TRANSITION_SECONDS,
  FogTransition, fogWeight, isPropModelName, mixFog, propTexture, resolveFog, ROOM_LIGHT, ROOM_PROP_LIGHT, selectBuildingFog, validateBuilding,
} from '../../src/building';
import { BuildingDoodads } from '../../src/buildingRender';
import { formatOverlay } from '../../src/debug';
import { mat4 } from '../../src/math';
import { ModelRenderer } from '../../src/modelRender';
import { BUILDING_SHADER, NullBackend } from '../../src/renderer';
import { createBuildingScene } from '../../src/scenes/buildingScene';
import { parseSceneRequest } from '../../src/scenes/select';
import { DEFAULT_TERRAIN_LIGHTING, lightingUniforms } from '../../src/terrainRender';

const cottage = buildCottage('solid');
const G = COTTAGE_GROUP, D = COTTAGE_DOODAD;
const source = (name: string) => {
  if (!isPropModelName(name)) throw new Error(`no prop ${name}`);
  return { mesh: buildPropModel(name), texture: propTexture() };
};

describe('lighting path of a batch (spec §171–§173)', () => {
  it('in a TRUE interior group the batch class decides: INT → interior, TRANS → trans, EXT → sun', () => {
    expect(BUILDING_LIGHTING_PATH).toEqual({ sun: 0, interior: 1, trans: 2 });
    expect((['interior', 'trans', 'exterior'] as const).map((c) => batchLightingPath(0, c))).toEqual([1, 2, 0]);
  });
  it('an exterior group (0x08) and an exterior-lit one (0x40) are lit by the sun throughout', () => {
    for (const flags of [BUILDING_GROUP_FLAG.exterior, BUILDING_GROUP_FLAG.exteriorLit, BUILDING_GROUP_FLAG.exterior | BUILDING_GROUP_FLAG.exteriorLit]) {
      expect((['interior', 'trans', 'exterior'] as const).map((c) => batchLightingPath(flags, c))).toEqual([0, 0, 0]);
    }
  });
  it('the shader computes the three paths the same way in WGSL and GLSL', () => {
    expect(BUILDING_SHADER.wgsl).toContain('color.rgb * (1.0 + 4.0 * color.a)');
    expect(BUILDING_SHADER.wgsl).toContain('mix(sun, color.rgb, color.a)');
    expect(BUILDING_SHADER.glslVertex).toContain('a_color.rgb * (1.0 + 4.0 * a_color.a)');
    expect(BUILDING_SHADER.glslVertex).toContain('mix(sun, a_color.rgb, a_color.a)');
  });
  it('the fog distance is computed per pixel, from the interpolated position (a wall is one large quad)', () => {
    expect(BUILDING_SHADER.wgsl).toContain('distance(in.world, globals.eye.xyz)');
    expect(BUILDING_SHADER.glslFragment).toContain('distance(v_world, u_eye.xyz)');
    expect(BUILDING_SHADER.wgsl).not.toContain('out.distance');
    expect(BUILDING_SHADER.glslVertex).not.toContain('v_distance');
  });
  it('the cottage’s baked alpha is light metadata: 0 on the ordinary surfaces, 128 on the glow panel', () => {
    const room = cottage.groups[G.room]!;
    const alphas = new Set<number>();
    // Skip the glass (the first 4 vertices: a TRANS batch drawn unlit).
    for (let v = 4; v < room.vertexCount; v++) alphas.add(room.colors![v * 4 + 3]!);
    expect([...alphas].sort((a, b) => a - b)).toEqual([0, 128]);
    expect([ROOM_LIGHT.backWall[3], ROOM_LIGHT.glow[3]]).toEqual([0, 128]);
    // The panel is on the back wall, a hair in front of it.
    const glow = Array.from({ length: room.vertexCount }, (_, v) => v).filter((v) => room.colors![v * 4 + 3] === 128);
    expect(glow).toHaveLength(4);
    for (const v of glow) expect(room.positions[v * 3 + 1]).toBeCloseTo(COTTAGE.halfY - COTTAGE.wall - 0.01, 5);
  });
});

describe('props inside a building are lit by their authored colour (P6.7, our choice)', () => {
  const models = new ModelRenderer(new NullBackend()), doodads = new BuildingDoodads(models, cottage, source);
  const instances = doodads.instances(mat4.identity(mat4.create()), 1);
  it('a prop listed only by the room gets a flat light = its colour / 255', () => {
    const light = ROOM_PROP_LIGHT.slice(0, 3).map((c) => c / 255);
    expect(instances[D.table]!.light).toEqual(light);
    expect(instances[D.stool]!.light).toEqual(light);
    expect(instances[D.secondStool]!.light).toEqual(light);
  });
  it('a prop that an exterior group lists is lit by the sun: the planter (shell + room), the shed crate', () => {
    expect(instances[D.planter]!.light).toBeUndefined();
    expect(instances[D.shedCrate]!.light).toBeUndefined();
  });
  it('the model renderer sends that light as the ambient, with no diffuse; without it, the sun', () => {
    const backend = new NullBackend(), renderer = new ModelRenderer(backend);
    const model = renderer.addModel(buildPropModel('prop-crate'), propTexture());
    const seen: number[][] = [];
    const original = backend.draw.bind(backend);
    backend.draw = (call) => {
      seen.push(Array.from((call.uniforms as Float32Array).subarray(36, 44)));
      return original(call);
    };
    const identity = mat4.identity(mat4.create());
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    renderer.draw(identity, [{ model, matrix: identity, light: [0.5, 0.25, 0.125] }, { model, matrix: identity }, { model, matrix: identity, light: [1, 1, 1] }], { debugMode: 'lit' });
    backend.endFrame();
    const sun = Array.from(lightingUniforms(DEFAULT_TERRAIN_LIGHTING).subarray(4, 12));
    expect(seen[0]).toEqual([0.5, 0.25, 0.125, 0, 0, 0, 0, 0]);
    expect(seen[1]).toEqual(sun); // the instance after a lit one gets the sun back
    expect(seen[2]).toEqual([1, 1, 1, 0, 0, 0, 0, 0]);
    renderer.dispose();
  });
});

describe('interior fog records (spec §167–§169)', () => {
  const fog = (change: Partial<BuildingFog> = {}): BuildingFog => ({ flags: 0, position: [0, 0, 0], innerRadius: 2, outerRadius: 10, end: 8, startScalar: 0.25, color: [0.3, 0.24, 0.18], ...change });
  const withFogs = (fogs: BuildingFog[], indices: number[], flags = 0): Building => ({ ...cottage, fogs, groups: cottage.groups.map((group, g) => (g === G.room ? { ...group, flags, fogIndices: indices } : group)) });
  it('start = end × start scalar', () => {
    expect(resolveFog(fog())).toEqual({ color: [0.3, 0.24, 0.18], start: 2, end: 8 });
    expect(resolveFog(fog({ end: 100, startScalar: 0.9 })).start).toBeCloseTo(90, 9);
  });
  it('weight = 1 − (distance − inner) / (outer − inner), clamped', () => {
    expect([0, 2, 6, 10, 15].map((d) => fogWeight(fog(), d))).toEqual([1, 1, 0.5, 0, 0]);
    expect([1, 3, 3.01].map((d) => fogWeight(fog({ innerRadius: 3, outerRadius: 3 }), d))).toEqual([1, 1, 0]);
  });
  it('record 0 is the base; the group’s candidates are folded over it, the nearest last', () => {
    const base = fog({ color: [0, 0, 0], end: 100, startScalar: 0.5 });
    const red = fog({ color: [1, 0, 0], position: [6, 0, 0], end: 10, startScalar: 0 }); // 6 away from the eye: weight 0.5
    const green = fog({ color: [0, 1, 0], position: [1, 0, 0], end: 20, startScalar: 0 }); // 1 away: weight 1
    // Only the base is referred to: the base, whole.
    expect(selectBuildingFog(withFogs([base, red], [0]), G.room, [0, 0, 0])).toEqual({ color: [0, 0, 0], start: 50, end: 100 });
    // Base + red at weight 0.5.
    expect(selectBuildingFog(withFogs([base, red], [1]), G.room, [0, 0, 0])).toEqual({ color: [0.5, 0, 0], start: 25, end: 55 });
    // Red is farther than green: green is folded last and, at weight 1, has the final word — in either listing order.
    for (const order of [[1, 2], [2, 1]]) expect(selectBuildingFog(withFogs([base, red, green], order), G.room, [0, 0, 0])).toEqual({ color: [0, 1, 0], start: 0, end: 20 });
  });
  it('a candidate must be referred to by the group, have flags & 1 == 0, and be within its outer radius', () => {
    const base = fog({ color: [0, 0, 0] }), red = fog({ color: [1, 0, 0], position: [1, 0, 0] });
    const plain = resolveFog(base);
    expect(selectBuildingFog(withFogs([base, red], []), G.room, [0, 0, 0])).toEqual(plain); // not referred to
    expect(selectBuildingFog(withFogs([base, { ...red, flags: BUILDING_FOG_FLAG_SKIP }], [1]), G.room, [0, 0, 0])).toEqual(plain);
    expect(selectBuildingFog(withFogs([base, red], [1]), G.room, [12, 0, 0])).toEqual(plain); // 11 away, outer radius 10
  });
  it('the building’s fog is active only in a true interior group, and only if the building has records', () => {
    expect(selectBuildingFog(cottage, G.room, [0, 0, 1.6])).toEqual(resolveFog(COTTAGE_FOGS[0]!));
    expect(selectBuildingFog(cottage, G.shell, [0, 0, 1.6])).toBeNull();
    expect(selectBuildingFog(cottage, undefined, [0, 0, 1.6])).toBeNull();
    expect(selectBuildingFog({ ...cottage, fogs: [], groups: cottage.groups.map((group) => ({ ...group, fogIndices: undefined })) }, G.room, [0, 0, 1.6])).toBeNull();
    expect(selectBuildingFog(withFogs([fog()], [0], BUILDING_GROUP_FLAG.exteriorLit), G.room, [0, 0, 1.6])).toBeNull();
  });
  it('validation', () => {
    expect(() => validateBuilding(withFogs([fog({ outerRadius: 1 })], [0]))).toThrow(/inner radius ≤ outer radius/);
    expect(() => validateBuilding(withFogs([fog({ startScalar: 1 })], [0]))).toThrow(/start scalar in 0..1/);
    expect(() => validateBuilding(withFogs([fog({ end: 0 })], [0]))).toThrow(/end > 0/);
    expect(() => validateBuilding(withFogs([fog({ color: [2, 0, 0] })], [0]))).toThrow(/colour in 0..1/);
    expect(() => validateBuilding(withFogs([fog()], [1]))).toThrow(/group 1 \("room"\) refers to fog 1 but the building has 1/);
    expect(() => validateBuilding(withFogs([fog()], [0, 0, 0, 0, 0]))).toThrow(/refers to 5 fogs, at most 4/);
  });
});

describe('fog transition (spec §170)', () => {
  const a = { color: [0, 0, 0] as const, start: 400, end: 800 }, b = { color: [1, 0.5, 0.25] as const, start: 2, end: 8 };
  it('lasts 4 seconds', () => {
    expect(FOG_TRANSITION_SECONDS).toBe(4);
  });
  it('the first target is taken at once; a new one is reached linearly in 4 s', () => {
    const t = new FogTransition();
    expect(t.value).toBeNull();
    t.setTarget(a);
    expect([t.value, t.blend]).toEqual([a, 1]);
    t.setTarget(b);
    expect([t.value, t.blend]).toEqual([a, 0]);
    t.advance(1000);
    expect(t.blend).toBe(0.25);
    expect(t.value).toEqual(mixFog(a, b, 0.25));
    expect(t.value!.start).toBeCloseTo(300.5, 9);
    t.advance(3000);
    expect([t.value, t.blend]).toEqual([b, 1]);
    t.advance(5000);
    expect(t.blend).toBe(1);
  });
  it('giving the same target again does not restart it; turning back starts from where the fog is', () => {
    const t = new FogTransition();
    t.setTarget(a);
    t.setTarget(b);
    t.advance(2000);
    t.setTarget({ ...b });
    expect(t.blend).toBe(0.5);
    const middle = t.value!;
    t.setTarget(a);
    expect([t.value, t.blend]).toEqual([middle, 0]);
    t.advance(4000);
    expect(t.value).toEqual(a);
  });
  it('rejects a bad duration or a negative step', () => {
    expect(() => new FogTransition(0)).toThrow(/duration/);
    expect(() => new FogTransition().advance(-1)).toThrow(/time step/);
  });
});

describe('scene: interior fog follows the camera’s room', () => {
  const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 1, triangles: 1, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
  const line = (scene: ReturnType<typeof createBuildingScene>) => formatOverlay({ ...base, building: scene.building }).find((l) => l.startsWith('Fog:'));
  it('reads &interiorFog= from the URL', () => {
    expect(parseSceneRequest('?scene=building&interiorFog=off')).toMatchObject({ interiorFog: false });
    expect(parseSceneRequest('?scene=building')).toMatchObject({ interiorFog: true });
  });
  it('starting in the room: the room’s fog at once; walking out: back to the outdoor fog in 4 s', () => {
    const scene = createBuildingScene(new NullBackend(), { view: 'inside' });
    scene.render(16 / 9);
    expect(scene.building.fog).toEqual({ source: 'interior', blend: 1, start: 2, end: 8, color: [0.3, 0.24, 0.18] });
    expect(line(scene)).toBe('Fog: interior · start 2.0 end 8.0 · transition 100 %');
    scene.setEye([0, -8, 1.6]);
    scene.render(16 / 9);
    expect(scene.building).toMatchObject({ room: { groups: [] }, fog: { source: 'outdoor', blend: 0, start: 2, end: 8 } });
    scene.advance(1000);
    scene.render(16 / 9);
    expect(scene.building.fog.blend).toBe(0.25);
    expect(scene.building.fog.start).toBeCloseTo(2 + (400 - 2) * 0.25, 6);
    expect(line(scene)).toBe('Fog: outdoor · start 101.5 end 206.0 · transition 25 %');
    scene.advance(3000);
    scene.render(16 / 9);
    expect(scene.building.fog).toMatchObject({ source: 'outdoor', blend: 1, start: 400, end: 800 });
    scene.dispose();
  });
  it('from outside the fog is the outdoor one; interiorFog off leaves the renderers without fog', () => {
    const outside = createBuildingScene(new NullBackend(), {});
    outside.render(16 / 9);
    expect(outside.building.fog).toMatchObject({ source: 'outdoor', blend: 1, start: 400 });
    expect(() => outside.setEye([0, 0, 1])).toThrow(/inside view only/);
    outside.dispose();
    const off = createBuildingScene(new NullBackend(), { view: 'inside', interiorFog: false });
    off.render(16 / 9);
    expect(off.building.fog.source).toBe('off');
    expect(line(off)).toBe('Fog: off');
    off.dispose();
  });
});
