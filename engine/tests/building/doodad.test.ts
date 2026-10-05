import { describe, expect, it } from 'vitest';
import {
  type Building, buildCottage, buildPropModel, COTTAGE, COTTAGE_DOODAD, COTTAGE_DOODAD_SET, COTTAGE_GROUP, doodadIsActive, doodadMatrix, isPropModelName, PROP, PROP_COLOURS, PROP_MODELS, propTexture, validateBuilding,
  visibleDoodads,
} from '../../src/building';
import { BuildingDoodads, BuildingRenderer } from '../../src/buildingRender';
import { formatOverlay } from '../../src/debug';
import { mat4 } from '../../src/math';
import { modelBounds, validateModelMesh } from '../../src/model';
import { ModelRenderer } from '../../src/modelRender';
import { NullBackend } from '../../src/renderer';
import { createBuildingScene } from '../../src/scenes/buildingScene';
import { parseSceneRequest } from '../../src/scenes/select';

const cottage = buildCottage('solid');
const D = COTTAGE_DOODAD, G = COTTAGE_GROUP, S = COTTAGE_DOODAD_SET;
const source = (name: string) => {
  if (!isPropModelName(name)) throw new Error(`no prop ${name}`);
  return { mesh: buildPropModel(name), texture: propTexture() };
};
const withDoodads = (change: (b: { -readonly [K in keyof Building]: Building[K] }) => void): Building => {
  const copy = { ...cottage };
  change(copy);
  return copy;
};

describe('doodad sets (spec §119)', () => {
  it('set 0 is always present; the selected set is added to it', () => {
    const active = (set: number) => cottage.doodads!.map((_, index) => doodadIsActive(cottage, index, set)).flatMap((on, index) => (on ? [index] : []));
    expect(active(S.always)).toEqual([0, 1, 2]);
    expect(active(S.livedIn)).toEqual([0, 1, 2, 3, 4]);
    expect(active(S.storage)).toEqual([0, 1, 2, 5, 6, 7]);
  });
  it('a set is a range of the building’s ONE doodad list', () => {
    expect(cottage.doodadSets).toEqual([{ name: 'always', start: 0, count: 3 }, { name: 'lived-in', start: 3, count: 2 }, { name: 'storage', start: 5, count: 3 }]);
    expect(cottage.doodads).toHaveLength(8);
  });
  it('rejects a set that does not exist', () => {
    expect(() => doodadIsActive(cottage, 0, 3)).toThrow(/no doodad set 3/);
    expect(() => visibleDoodads(cottage, -1)).toThrow(/no doodad set -1/);
  });
});

describe('doodads follow the visibility of the groups that list them (spec §120, §165)', () => {
  it('every group visible: every active doodad, once each, in list order', () => {
    expect(visibleDoodads(cottage, S.always)).toEqual([D.table, D.stool, D.planter]);
    expect(visibleDoodads(cottage, S.livedIn)).toEqual([0, 1, 2, 3, 4]);
  });
  it('a group that is not visible does not submit its doodads', () => {
    expect(visibleDoodads(cottage, S.livedIn, new Set([G.shell, G.shed]))).toEqual([D.planter, D.shedCrate]);
    expect(visibleDoodads(cottage, S.livedIn, new Set([G.shed]))).toEqual([D.shedCrate]);
    expect(visibleDoodads(cottage, S.always, new Set([G.shed]))).toEqual([]);
    expect(visibleDoodads(cottage, S.always, new Set())).toEqual([]);
  });
  it('a doodad listed by two groups is drawn when ANY of them is visible, and only once', () => {
    expect(cottage.groups[G.shell]!.doodadRefs).toContain(D.planter);
    expect(cottage.groups[G.room]!.doodadRefs).toContain(D.planter);
    expect(visibleDoodads(cottage, S.always, new Set([G.shell]))).toEqual([D.planter]);
    expect(visibleDoodads(cottage, S.always, new Set([G.room]))).toEqual([D.table, D.stool, D.planter]);
    expect(visibleDoodads(cottage, S.always, new Set([G.shell, G.room])).filter((index) => index === D.planter)).toHaveLength(1);
  });
});

describe('doodad placement (spec §118)', () => {
  it('the matrix scales, then rotates, then translates', () => {
    const m = doodadMatrix({ model: 0, position: [1, 2, 3], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2], scale: 2, color: [255, 255, 255, 255] });
    // +x of the model, 1 unit → turned 90° about z to +y, doubled, then moved.
    const p = [m[0]! + m[12]!, m[1]! + m[13]!, m[2]! + m[14]!];
    expect(p[0]).toBeCloseTo(1, 6);
    expect(p[1]).toBeCloseTo(4, 6);
    expect(p[2]).toBeCloseTo(3, 6);
    expect(Math.hypot(m[0]!, m[1]!, m[2]!)).toBeCloseTo(2, 6);
    expect(Math.hypot(m[8]!, m[9]!, m[10]!)).toBeCloseTo(2, 6);
    expect([m[3], m[7], m[11], m[15]]).toEqual([0, 0, 0, 1]);
  });
  it('a quaternion that is not unit length gives the same rotation, without extra scale', () => {
    const a = doodadMatrix({ model: 0, position: [0, 0, 0], rotation: [0, 0, 1, 1], scale: 1, color: [255, 255, 255, 255] });
    const b = doodadMatrix({ model: 0, position: [0, 0, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2], scale: 1, color: [255, 255, 255, 255] });
    Array.from(a).forEach((value, k) => expect(value).toBeCloseTo(b[k]!, 6));
  });
  it('the planter stands in the window opening, inside the thickness of the wall', () => {
    const planter = cottage.doodads![D.planter]!, half = PROP.crate.half * planter.scale;
    expect(planter.position[2]).toBe(COTTAGE.window.z0);
    expect(planter.position[1] - half).toBeGreaterThanOrEqual(-COTTAGE.halfY);
    expect(planter.position[1] + half).toBeLessThanOrEqual(-COTTAGE.halfY + COTTAGE.wall + 1e-9);
    expect(planter.position[0] - half).toBeGreaterThan(COTTAGE.window.x0);
    expect(planter.position[0] + half).toBeLessThan(COTTAGE.window.x1);
  });
});

describe('doodad validation', () => {
  it('the cottage is valid', () => {
    expect(() => validateBuilding(cottage)).not.toThrow();
  });
  it('rejects a model, a set or a group reference outside the lists', () => {
    expect(() => validateBuilding(withDoodads((b) => (b.doodadModels = ['prop-table'])))).toThrow(/doodad 1 refers to model 1 but the building names 1/);
    expect(() => validateBuilding(withDoodads((b) => (b.doodadSets = [{ name: 'all', start: 0, count: 9 }])))).toThrow(/doodad set 0 \("all"\) covers 0..9, outside the 8 doodads/);
    expect(() => validateBuilding(withDoodads((b) => (b.groups = b.groups.map((group, g) => (g === 2 ? { ...group, doodadRefs: [8] } : group)))))).toThrow(/group 2 \("shed"\) lists doodad 8/);
  });
  it('rejects doodads without a set, a doodad no group lists, a zero quaternion and a scale ≤ 0', () => {
    expect(() => validateBuilding(withDoodads((b) => (b.doodadSets = [])))).toThrow(/no doodad set/);
    expect(() => validateBuilding(withDoodads((b) => (b.groups = b.groups.map((group, g) => (g === 2 ? { ...group, doodadRefs: [] } : group)))))).toThrow(/doodad 4 is listed by no group/);
    const edit = (change: object) => withDoodads((b) => (b.doodads = b.doodads!.map((doodad, k) => (k === 0 ? { ...doodad, ...change } : doodad))));
    expect(() => validateBuilding(edit({ rotation: [0, 0, 0, 0] }))).toThrow(/doodad 0 has a zero quaternion/);
    expect(() => validateBuilding(edit({ scale: 0 }))).toThrow(/doodad 0 needs a scale > 0/);
    expect(() => validateBuilding(edit({ position: [0, NaN, 0] }))).toThrow(/not finite/);
    expect(() => validateBuilding(edit({ color: [0, 0, 256, 0] }))).toThrow(/colour of 4 bytes/);
  });
  it('a building without doodads is still valid', () => {
    expect(() => validateBuilding(withDoodads((b) => {
      b.doodads = undefined; b.doodadSets = undefined; b.doodadModels = undefined;
      b.groups = b.groups.map((group) => ({ ...group, doodadRefs: undefined }));
    }))).not.toThrow();
  });
});

describe('prop models', () => {
  it.each(PROP_MODELS)('%s is a valid one-bone model standing on z = 0, centred in x and y', (name) => {
    const mesh = buildPropModel(name);
    expect(() => validateModelMesh(mesh)).not.toThrow();
    expect(mesh.boneCount).toBe(1);
    let minZ = Infinity;
    for (let v = 0; v < mesh.vertexCount; v++) minZ = Math.min(minZ, mesh.positions[v * 3 + 2]!);
    expect(minZ).toBe(0);
    const { center } = modelBounds(mesh);
    expect(center[0]).toBeCloseTo(0, 6);
    expect(center[1]).toBeCloseTo(0, 6);
  });
  it('every face of a box looks outwards: its winding agrees with its normal', () => {
    for (const name of PROP_MODELS) {
      const mesh = buildPropModel(name);
      for (let t = 0; t < mesh.indices.length; t += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => mesh.indices[t + k]! * 3) as [number, number, number];
        const e1 = [0, 1, 2].map((k) => mesh.positions[b + k]! - mesh.positions[a + k]!), e2 = [0, 1, 2].map((k) => mesh.positions[c + k]! - mesh.positions[a + k]!);
        const cross = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
        expect(cross[0]! * mesh.normals[a]! + cross[1]! * mesh.normals[a + 1]! + cross[2]! * mesh.normals[a + 2]!).toBeGreaterThan(0);
      }
    }
  });
  it('the table is 12 triangles per box: four legs and a top', () => {
    expect(buildPropModel('prop-table').indices.length / 3).toBe(5 * 12);
    expect(buildPropModel('prop-crate').indices.length / 3).toBe(3 * 12);
  });
  it('the texture has four flat columns', () => {
    const texture = propTexture();
    expect([texture.width, texture.height]).toEqual([8, 8]);
    expect(Array.from(texture.data.subarray(0, 4))).toEqual([...PROP_COLOURS.board, 255]);
    expect(Array.from(texture.data.subarray(6 * 4, 6 * 4 + 4))).toEqual([...PROP_COLOURS.band, 255]);
  });
});

describe('BuildingDoodads', () => {
  it('uploads each model once, however many doodads use it', () => {
    const backend = new NullBackend(), models = new ModelRenderer(backend);
    const doodads = new BuildingDoodads(models, cottage, source);
    expect([doodads.doodadCount, doodads.modelCount, models.modelCount]).toEqual([8, 3, 3]);
    const instances = doodads.instances(mat4.identity(mat4.create()), S.storage);
    expect(instances).toHaveLength(6);
    // The planter and the three crates of the « storage » set are the same model.
    expect(new Set([instances[2]!.model, instances[3]!.model, instances[4]!.model, instances[5]!.model]).size).toBe(1);
    expect(instances[0]!.model).not.toBe(instances[1]!.model);
    doodads.dispose();
    models.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });
  it('only uploads the models that a doodad uses', () => {
    const models = new ModelRenderer(new NullBackend());
    const asked: string[] = [];
    const building = withDoodads((b) => (b.doodadModels = [...b.doodadModels!, 'prop-unused']));
    const doodads = new BuildingDoodads(models, building, (name) => {
      asked.push(name);
      return source(name);
    });
    expect(asked).toEqual(['prop-table', 'prop-stool', 'prop-crate']);
    doodads.dispose();
  });
  it('places the doodads with the building: building matrix × doodad matrix', () => {
    const models = new ModelRenderer(new NullBackend()), doodads = new BuildingDoodads(models, cottage, source);
    const moved = mat4.fromTranslation(mat4.create(), new Float32Array([10, 20, 30]));
    const table = doodads.instances(moved, S.always)[0]!;
    expect([table.matrix[12], table.matrix[13]]).toEqual([10, expect.closeTo(21.8, 5)]);
    expect(table.matrix[14]).toBeCloseTo(30.02, 5);
    doodads.dispose();
  });
});

describe('BuildingRenderer passes', () => {
  it('opaque + blended = everything; the glass is the only blended batch', () => {
    const backend = new NullBackend(), renderer = new BuildingRenderer(backend), identity = mat4.identity(mat4.create());
    const instance = { building: renderer.addBuilding(cottage), matrix: identity };
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    const all = renderer.draw(identity, [instance], { debugMode: 'lit' });
    const opaque = renderer.draw(identity, [instance], { debugMode: 'lit', pass: 'opaque' });
    const blended = renderer.draw(identity, [instance], { debugMode: 'lit', pass: 'blended' });
    backend.endFrame();
    expect([all.draws, opaque.draws, blended.draws]).toEqual([9, 8, 1]);
    expect(opaque.triangles + blended.triangles).toBe(all.triangles);
    expect([opaque.groups, blended.groups]).toEqual([3, 0]);
    renderer.dispose();
  });
});

describe('scene=building with props', () => {
  it('reads the prop options from the URL', () => {
    expect(parseSceneRequest('?scene=building&doodads=off&doodadSet=2&doodadDebug=normals')).toMatchObject({ doodads: false, doodadSet: 2, doodadDebug: 'normals' });
    expect(parseSceneRequest('?scene=building&doodadSet=3&doodadDebug=x')).toMatchObject({ doodads: true, doodadSet: 0, doodadDebug: 'lit' });
  });
  it('draws the props of the visible groups; N changes the set; V turns them off', () => {
    const backend = new NullBackend(), scene = createBuildingScene(backend, {});
    expect(scene.render(16 / 9).drawCalls).toBe(9 + 3);
    expect(scene.building).toMatchObject({ doodads: 8, doodadsDrawn: 3, doodadModels: 3, doodadSet: 0, doodadSetName: 'always', doodadSets: 3, doodadsShown: true, batchesDrawn: 9 });
    // Room hidden: its table and stool go; the planter stays, the shell lists it too.
    scene.toggleGroup(G.room);
    scene.render(16 / 9);
    expect(scene.building.doodadsDrawn).toBe(1);
    scene.toggleGroup(G.shell);
    scene.render(16 / 9);
    expect(scene.building.doodadsDrawn).toBe(0);
    scene.toggleGroup(G.room);
    scene.toggleGroup(G.shell);
    expect([scene.cycleDoodadSet(), scene.render(16 / 9) && scene.building.doodadsDrawn, scene.building.doodadSetName]).toEqual([1, 5, 'lived-in']);
    expect([scene.cycleDoodadSet(), scene.render(16 / 9) && scene.building.doodadsDrawn]).toEqual([2, 6]);
    expect(scene.cycleDoodadSet()).toBe(0);
    scene.render(16 / 9);
    const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 12, triangles: 1, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
    expect(formatOverlay({ ...base, building: scene.building }).join('\n')).toContain('Props: 3 of 8 drawn (V) · 3 models · set 0 « always » of 3 (N)');
    expect(scene.toggleDoodads()).toBe(false);
    expect(scene.render(16 / 9).drawCalls).toBe(9);
    expect(formatOverlay({ ...base, building: scene.building }).join('\n')).toContain('Props: off (V)');
    scene.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });
  it('rejects a doodad set that does not exist', () => {
    expect(() => createBuildingScene(new NullBackend(), { doodadSet: 3 })).toThrow(/no doodad set 3/);
  });
});
