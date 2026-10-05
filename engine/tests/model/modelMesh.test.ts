import { describe, expect, it } from 'vitest';
import { buildTreeModel, MAX_BONE_INFLUENCES, MODEL_VERTEX_BYTES, MODEL_VERTEX_LAYOUT, MODEL_VERTEX_OFFSETS, modelBounds, type ModelMesh, ModelMeshBuilder, packModelVertices, TREE, TREE_SOLID_COLOURS, treeTexture, validateModelMesh } from '../../src/model';
import { NullBackend, validateVertexLayout, VERTEX_FORMAT_BYTES } from '../../src/renderer';

/** One triangle, every vertex on bone 0. */
function triangle(): ModelMesh {
  const b = new ModelMeshBuilder();
  const a = b.vertex([0, 0, 0], [0, 0, 2], [0, 0], [[0, 255]]);
  const c = b.vertex([1, 0, 0], [0, 0, 1], [1, 0], [[1, 200], [0, 55]]);
  const d = b.vertex([0, 1, 0], [0, 0, 1], [0, 1], [[2, 100], [1, 100], [0, 50], [3, 5]]);
  b.triangle(a, c, d);
  return b.build('triangle', 4);
}

describe('model vertex format (spec §29, §43)', () => {
  it('holds position, normal, uv and at most 4 bone influences, in 40 bytes', () => {
    expect(MAX_BONE_INFLUENCES).toBe(4);
    expect(MODEL_VERTEX_BYTES).toBe(40);
    expect(MODEL_VERTEX_OFFSETS).toEqual({ position: 0, normal: 12, uv: 24, boneWeights: 32, boneIndices: 36 });
    validateVertexLayout(MODEL_VERTEX_LAYOUT);
    expect(MODEL_VERTEX_LAYOUT.attributes.map((a) => a.format)).toEqual(['float32x3', 'float32x3', 'float32x2', 'unorm8x4', 'uint8x4']);
    // The attributes tile the vertex exactly, with no gap and no overlap.
    let next = 0;
    for (const a of MODEL_VERTEX_LAYOUT.attributes) {
      expect(a.offset).toBe(next);
      next += VERTEX_FORMAT_BYTES[a.format];
    }
    expect(next).toBe(MODEL_VERTEX_LAYOUT.stride);
  });

  it('packs a mesh byte for byte', () => {
    const mesh = triangle();
    const bytes = packModelVertices(mesh);
    expect(bytes.length).toBe(3 * 40);
    const view = new DataView(bytes.buffer);
    // Vertex 1: position (1, 0, 0), normal (0, 0, 1), uv (1, 0), weights 200, 55, 0, 0, bones 1, 0, 0, 0.
    expect([view.getFloat32(40, true), view.getFloat32(44, true), view.getFloat32(48, true)]).toEqual([1, 0, 0]);
    expect([view.getFloat32(52, true), view.getFloat32(56, true), view.getFloat32(60, true)]).toEqual([0, 0, 1]);
    expect([view.getFloat32(64, true), view.getFloat32(68, true)]).toEqual([1, 0]);
    expect(Array.from(bytes.subarray(72, 76))).toEqual([200, 55, 0, 0]);
    expect(Array.from(bytes.subarray(76, 80))).toEqual([1, 0, 0, 0]);
    // Vertex 2: four influences.
    expect(Array.from(bytes.subarray(112, 120))).toEqual([100, 100, 50, 5, 2, 1, 0, 3]);
    // Vertex 0: the builder normalised (0, 0, 2).
    expect(view.getFloat32(20, true)).toBe(1);
  });

  it('refuses a mesh that breaks the rules', () => {
    const m = triangle();
    const withWeights = (w: number[]): ModelMesh => ({ ...m, boneWeights: new Uint8Array(w) });
    expect(() => validateModelMesh(withWeights([255, 0, 0, 0, 200, 54, 0, 0, 100, 100, 50, 5]))).toThrow(/vertex 1 must add up to 255 \(got 254\)/);
    expect(() => validateModelMesh({ ...m, boneCount: 3 })).toThrow(/vertex 2 refers to bone 3 but the model has 3 bone/);
    expect(() => validateModelMesh({ ...m, boneIndices: new Uint8Array([0, 2, 0, 0, 1, 0, 0, 0, 2, 1, 0, 3]) })).toThrow(/unused influence/);
    expect(() => validateModelMesh({ ...m, indices: new Uint16Array([0, 1, 3]) })).toThrow(/index 3 is outside/);
    expect(() => validateModelMesh({ ...m, indices: new Uint16Array([0, 1]) })).toThrow(/whole triangles/);
    expect(() => validateModelMesh({ ...m, normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 2]) })).toThrow(/normal of vertex 2 is not unit/);
    expect(() => validateModelMesh({ ...m, positions: new Float32Array(8) })).toThrow(/positions must hold 9/);
    expect(() => validateModelMesh({ ...m, uvs: new Float32Array([0, 0, Number.NaN, 0, 0, 1]) })).toThrow(/uv value is not finite/);
    expect(() => validateModelMesh({ ...m, boneCount: 0 })).toThrow(/boneCount/);
    expect(() => validateModelMesh({ ...m, vertexCount: 2 })).toThrow(/vertexCount/);
    expect(() => packModelVertices({ ...m, boneCount: 3 })).toThrow(/bone 3/);
  });

  it('the builder accepts 1 to 4 influences and nothing else', () => {
    const b = new ModelMeshBuilder();
    expect(() => b.vertex([0, 0, 0], [0, 0, 1], [0, 0], [])).toThrow(/1\.\.4 bone influences/);
    expect(() => b.vertex([0, 0, 0], [0, 0, 1], [0, 0], [[0, 51], [1, 51], [2, 51], [3, 51], [4, 51]])).toThrow(/1\.\.4 bone influences/);
    expect(() => b.vertex([0, 0, 0], [0, 0, 0], [0, 0], [[0, 255]])).toThrow(/zero vector/);
  });

  it('computes bounds', () => {
    const bounds = modelBounds(triangle());
    expect(bounds.min).toEqual([0, 0, 0]);
    expect(bounds.max).toEqual([1, 1, 0]);
    expect(bounds.center).toEqual([0.5, 0.5, 0]);
    expect(bounds.radius).toBeCloseTo(Math.SQRT1_2, 6);
  });
});

describe('byte vertex formats in the renderer', () => {
  it('validates layouts with their real byte sizes', () => {
    expect(VERTEX_FORMAT_BYTES).toEqual({ float32x2: 8, float32x3: 12, float32x4: 16, unorm8x4: 4, uint8x4: 4 });
    validateVertexLayout({ stride: 8, attributes: [{ location: 0, format: 'unorm8x4', offset: 0 }, { location: 1, format: 'uint8x4', offset: 4 }] });
    expect(() => validateVertexLayout({ stride: 4, attributes: [{ location: 0, format: 'uint8x4', offset: 1 }] })).toThrow(/overflows stride/);
    expect(() => validateVertexLayout({ stride: 16, attributes: [{ location: 0, format: 'half8' as 'uint8x4', offset: 0 }] })).toThrow(/unknown vertex format/);
  });

  it('accepts raw bytes for vertex buffers only', () => {
    const b = new NullBackend();
    const handle = b.createBuffer({ usage: 'vertex', data: new Uint8Array(40) });
    expect((b.bufferData(handle) as Uint8Array).byteLength).toBe(40);
    expect(() => b.createBuffer({ usage: 'uniform', data: new Uint8Array(16) })).toThrow(/vertices only/);
    expect(() => b.createBuffer({ usage: 'index', data: new Uint8Array(6) })).toThrow(/Uint16Array/);
  });
});

describe('the fixture tree (an original model built in code)', () => {
  const tree = buildTreeModel();

  it('is a valid mesh of the expected size', () => {
    validateModelMesh(tree);
    // Trunk: 7 × 2 vertices, 12 triangles. Each cone: 9 ring + 8 tips + 1 centre + 9 underside = 27 vertices, 16 triangles.
    expect(tree.vertexCount).toBe(14 + 27 + 27);
    expect(tree.indices.length / 3).toBe(12 + 16 + 16);
    expect(tree.boneCount).toBe(TREE.boneCount);
    const bounds = modelBounds(tree);
    expect(bounds.min[2]).toBe(0);
    expect(bounds.max[2]).toBe(7);
    expect(bounds.max[0]).toBeCloseTo(2, 6);
  });

  it('has every triangle counter-clockwise seen from outside: face normals agree with the vertex normals', () => {
    for (let t = 0; t < tree.indices.length; t += 3) {
      const [a, b, c] = [tree.indices[t]!, tree.indices[t + 1]!, tree.indices[t + 2]!];
      const p = (v: number, k: number): number => tree.positions[v * 3 + k]!;
      const e1 = [p(b, 0) - p(a, 0), p(b, 1) - p(a, 1), p(b, 2) - p(a, 2)], e2 = [p(c, 0) - p(a, 0), p(c, 1) - p(a, 1), p(c, 2) - p(a, 2)];
      const face = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
      expect(Math.hypot(...face)).toBeGreaterThan(1e-6); // not degenerate
      for (const v of [a, b, c]) {
        const dot = face[0]! * tree.normals[v * 3]! + face[1]! * tree.normals[v * 3 + 1]! + face[2]! * tree.normals[v * 3 + 2]!;
        expect(dot).toBeGreaterThan(0);
      }
    }
  });

  it('carries the planned bone influences: trunk on bone 0, lower foliage on 1, top shared between 1 and 2', () => {
    const influencesAt = (v: number): string => `${Array.from(tree.boneIndices.subarray(v * 4, v * 4 + 4))}/${Array.from(tree.boneWeights.subarray(v * 4, v * 4 + 4))}`;
    const kinds = new Map<string, number>();
    for (let v = 0; v < tree.vertexCount; v++) kinds.set(influencesAt(v), (kinds.get(influencesAt(v)) ?? 0) + 1);
    expect(Object.fromEntries(kinds)).toEqual({ '0,0,0,0/255,0,0,0': 14, '1,0,0,0/255,0,0,0': 27, '1,2,0,0/128,127,0,0': 19, '2,0,0,0/255,0,0,0': 8 });
    // The trunk is the 14 first vertices, below z = 3.
    for (let v = 0; v < 14; v++) expect(tree.positions[v * 3 + 2]).toBeLessThanOrEqual(3);
  });

  it('maps the trunk to the bark half of the atlas and the foliage to the leaf half', () => {
    for (let v = 0; v < tree.vertexCount; v++) {
      const u = tree.uvs[v * 2]!;
      if (v < 14) expect(u).toBeLessThanOrEqual(0.5);
      else expect(u).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('has a generated texture: bark on the left, leaves on the right; flat colours in solid style', () => {
    const solid = treeTexture('solid', 8);
    expect(Array.from(solid.data.subarray(0, 4))).toEqual([...TREE_SOLID_COLOURS.bark, 255]);
    expect(Array.from(solid.data.subarray(7 * 4, 8 * 4))).toEqual([...TREE_SOLID_COLOURS.leaves, 255]);
    const generated = treeTexture('procedural');
    expect(generated).toMatchObject({ width: 64, height: 64 });
    expect(new Set(generated.data.filter((_, i) => i % 4 === 1)).size).toBeGreaterThan(20); // varied
    expect(treeTexture('procedural').data).toEqual(generated.data); // deterministic
    const mean = (x0: number): number[] => {
      const sum = [0, 0, 0];
      for (let y = 0; y < 64; y++) for (let x = x0; x < x0 + 32; x++) for (let c = 0; c < 3; c++) sum[c]! += generated.data[(y * 64 + x) * 4 + c]!;
      return sum.map((s) => s / (64 * 32));
    };
    expect(mean(0)[0]!).toBeGreaterThan(mean(0)[1]!); // bark: red above green
    expect(mean(32)[1]!).toBeGreaterThan(mean(32)[0]!); // leaves: green above red
  });
});
