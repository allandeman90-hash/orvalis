import { describe, expect, it } from 'vitest';
import { ALPHA_KEY_REFERENCE, buildSwatchModel, buildTreeModel, materialState, MODEL_BLEND, type ModelMesh, modelMaterials, modelSubmeshes, RENDER_FLAG, SWATCH_TEXELS, swatchCentre, SWATCHES, swatchTexture, validateModelMesh } from '../../src/model';
import { BLEND_FACTORS, resolvePipelineState, POSITION_COLOR_LAYOUT, POSITION_COLOR_MVP_SHADER } from '../../src/renderer';

describe('material → render state (spec §78–§83, §98)', () => {
  const state = (blendMode: number, renderFlags = 0) => materialState({ blendMode, renderFlags });

  it('maps the seven blend modes', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((mode) => state(mode).blend)).toEqual(['opaque', 'opaque', 'alpha', 'addNoAlpha', 'add', 'mod', 'mod2x']);
  });
  it('the alpha key is an opaque surface with an alpha test at 224 / 255, and the only mode with one', () => {
    expect(ALPHA_KEY_REFERENCE).toBe(224 / 255);
    expect([0, 1, 2, 3, 4, 5, 6].map((mode) => state(mode).alphaReference)).toEqual([0, 224 / 255, 0, 0, 0, 0, 0]);
  });
  it('opaque and cutout write depth and are drawn first; the others are transparent', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((mode) => state(mode).depthWrite)).toEqual([true, true, false, false, false, false, false]);
    expect([0, 1, 2, 3, 4, 5, 6].map((mode) => state(mode).transparent)).toEqual([false, false, true, true, true, true, true]);
  });
  it('lighting: lit unless UNLIT — except Mod and Mod2x, always full-bright; additive modes stay lit', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((mode) => state(mode).unlit)).toEqual([false, false, false, false, false, true, true]);
    expect([0, 1, 2, 3, 4].map((mode) => state(mode, RENDER_FLAG.unlit).unlit)).toEqual([true, true, true, true, true]);
  });
  it('fog: scene colour, black for additive, white / grey for the multiplying modes, none when UNFOGGED', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((mode) => state(mode).fog)).toEqual(['scene', 'scene', 'scene', 'black', 'black', 'white', 'grey']);
    expect([0, 4, 6].map((mode) => state(mode, RENDER_FLAG.unfogged).fog)).toEqual(['none', 'none', 'none']);
  });
  it('two-sided turns back-face culling off', () => {
    expect(state(0).cullMode).toBe('back');
    expect(state(0, RENDER_FLAG.twoSided).cullMode).toBe('none');
  });
  it('ignores the depth-related flag bits and rejects modes outside 0..6', () => {
    expect(state(0, 0x08 | 0x10 | 0x20 | 0x40)).toEqual(state(0));
    expect(() => state(7)).toThrow(/blend mode must be 0..6/);
    expect(() => state(-1)).toThrow(/blend mode/);
    expect(() => state(0, 1.5)).toThrow(/render flags/);
  });
});

describe('backend blend modes', () => {
  it('each mode has its colour factors', () => {
    expect(BLEND_FACTORS).toEqual({
      alpha: { src: 'src-alpha', dst: 'one-minus-src-alpha' },
      add: { src: 'src-alpha', dst: 'one' },
      addNoAlpha: { src: 'one', dst: 'one' },
      mod: { src: 'dst', dst: 'zero' },
      mod2x: { src: 'dst', dst: 'src' },
    });
  });
  it('a pipeline accepts every mode and rejects an unknown one', () => {
    const base = { shader: POSITION_COLOR_MVP_SHADER, vertexLayout: POSITION_COLOR_LAYOUT };
    for (const blend of ['opaque', 'alpha', 'add', 'addNoAlpha', 'mod', 'mod2x'] as const) expect(resolvePipelineState({ ...base, blend }).blend).toBe(blend);
    expect(resolvePipelineState(base).blend).toBe('opaque');
    expect(() => resolvePipelineState({ ...base, blend: 'screen' as never })).toThrow(/blend must be/);
  });
});

describe('submeshes', () => {
  it('a mesh without submeshes is one opaque lit section over all its indices', () => {
    const tree = buildTreeModel();
    expect(modelSubmeshes(tree)).toEqual([{ geosetId: 0, indexStart: 0, indexCount: tree.indices.length, material: 0 }]);
    expect(modelMaterials(tree)).toEqual([{ renderFlags: 0, blendMode: MODEL_BLEND.opaque }]);
  });
  it('the test card has a backdrop and nine swatches, each with its own geoset and material', () => {
    const card = buildSwatchModel();
    expect(card.submeshes).toHaveLength(10);
    expect(card.submeshes!.map((s) => s.geosetId)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(card.submeshes!.map((s) => s.indexCount)).toEqual([6, 12, 12, 12, 12, 12, 12, 12, 12, 12]);
    expect(card.materials!.slice(1).map((m) => m.blendMode)).toEqual(SWATCHES.map((s) => s.blendMode));
    expect(card.boneCount).toBe(1);
  });
  it('swatch centres are inside their quads; the texture has one column per texel', () => {
    expect(swatchCentre(1, 'top')).toEqual([-4.05, 0, 1.5]);
    expect(swatchCentre(9, 'bottom')).toEqual([3.95, 0, 0.5]);
    const texture = swatchTexture();
    expect([texture.width, texture.height]).toEqual([8, 8]);
    for (const row of [0, 7]) expect(Array.from(texture.data.subarray((row * 8 + 3) * 4, (row * 8 + 3) * 4 + 4))).toEqual([...SWATCH_TEXELS.half]);
  });
  const card = buildSwatchModel();
  const broken = (change: Partial<ModelMesh>): ModelMesh => ({ ...card, ...change });
  it('rejects submeshes that leave a gap, overlap, do not cover the indices, or point to a missing material', () => {
    const sections = card.submeshes!;
    expect(() => validateModelMesh(broken({ submeshes: [sections[0]!, { ...sections[1]!, indexStart: 9 }, ...sections.slice(2)] }))).toThrow(/must start at index 6/);
    expect(() => validateModelMesh(broken({ submeshes: sections.slice(0, 9) }))).toThrow(/cover 102 indices, the mesh has 114/);
    expect(() => validateModelMesh(broken({ submeshes: [{ ...sections[0]!, material: 99 }, ...sections.slice(1)] }))).toThrow(/refers to material 99/);
    expect(() => validateModelMesh(broken({ submeshes: [{ ...sections[0]!, indexCount: 5 }, ...sections.slice(1)] }))).toThrow(/whole triangles/);
    expect(() => validateModelMesh(broken({ materials: undefined }))).toThrow(/given together/);
  });
});
