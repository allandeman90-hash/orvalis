import type { VertexLayout } from '../renderer';
import { type ModelMaterial, type ModelSubmesh, validateModelSections } from './material';

/**
 * Mesh of a model (spec §29, §43). A vertex has a position, a normal, one
 * texture coordinate, and AT MOST 4 bone influences: 4 bone indices and 4
 * weights, one byte each — the constraint of the original format, kept as is.
 *
 * FROM THE SPEC: the vertex content and the « max 4 bone influences » rule;
 * weights and indices as bytes (§43: `boneWeights: vec4<u8>`, `boneIndices: vec4<u8>`).
 * OUR CHOICES: the byte layout below (40 bytes; the original stores 48 with the
 * fields in another order — a file-format matter); the 4 weights of a vertex
 * must add up to exactly 255; an unused influence has weight 0 and index 0.
 *
 * Model space is the engine's: right-handed, z up.
 */
export interface ModelMesh {
  readonly name: string;
  readonly vertexCount: number;
  /** 3 floats per vertex. */
  readonly positions: Float32Array;
  /** 3 floats per vertex, unit length. */
  readonly normals: Float32Array;
  /** 2 floats per vertex. */
  readonly uvs: Float32Array;
  /** 4 bytes per vertex, summing to 255. */
  readonly boneWeights: Uint8Array;
  /** 4 bytes per vertex, each < boneCount. */
  readonly boneIndices: Uint8Array;
  /** Triangles, counter-clockwise seen from outside. */
  readonly indices: Uint16Array;
  /** Number of bones the indices refer to (at least 1; at most 256). */
  readonly boneCount: number;
  /** Sections of the index list, each with its geoset id and material. Absent: one opaque section (see material.ts). */
  readonly submeshes?: readonly ModelSubmesh[] | undefined;
  /** Materials the submeshes refer to. Given together with `submeshes`. */
  readonly materials?: readonly ModelMaterial[] | undefined;
}

export const MAX_BONE_INFLUENCES = 4;
export const MODEL_VERTEX_BYTES = 40;
export const MODEL_VERTEX_OFFSETS = { position: 0, normal: 12, uv: 24, boneWeights: 32, boneIndices: 36 } as const;

/** GPU layout of packModelVertices(): position, normal, uv as floats; weights as 0..1; indices as integers. */
export const MODEL_VERTEX_LAYOUT: VertexLayout = {
  stride: MODEL_VERTEX_BYTES,
  attributes: [
    { location: 0, format: 'float32x3', offset: MODEL_VERTEX_OFFSETS.position },
    { location: 1, format: 'float32x3', offset: MODEL_VERTEX_OFFSETS.normal },
    { location: 2, format: 'float32x2', offset: MODEL_VERTEX_OFFSETS.uv },
    { location: 3, format: 'unorm8x4', offset: MODEL_VERTEX_OFFSETS.boneWeights },
    { location: 4, format: 'uint8x4', offset: MODEL_VERTEX_OFFSETS.boneIndices },
  ],
};

function fail(mesh: ModelMesh, message: string): never {
  throw new Error(`model "${mesh.name}": ${message}`);
}

/** Checks everything a renderer or a skinning step relies on. */
export function validateModelMesh(mesh: ModelMesh): void {
  const n = mesh.vertexCount;
  if (!Number.isInteger(n) || n < 3 || n > 65536) fail(mesh, `vertexCount must be an integer in 3..65536 (got ${n})`);
  if (!Number.isInteger(mesh.boneCount) || mesh.boneCount < 1 || mesh.boneCount > 256) fail(mesh, `boneCount must be an integer in 1..256 (got ${mesh.boneCount})`);
  for (const [array, per, what] of [[mesh.positions, 3, 'positions'], [mesh.normals, 3, 'normals'], [mesh.uvs, 2, 'uvs'], [mesh.boneWeights, 4, 'boneWeights'], [mesh.boneIndices, 4, 'boneIndices']] as const) {
    if (array.length !== n * per) fail(mesh, `${what} must hold ${n * per} values (got ${array.length})`);
  }
  if (mesh.indices.length === 0 || mesh.indices.length % 3 !== 0) fail(mesh, `indices must hold whole triangles (got ${mesh.indices.length} indices)`);
  for (const index of mesh.indices) if (index >= n) fail(mesh, `index ${index} is outside the ${n} vertices`);
  for (const [array, what] of [[mesh.positions, 'position'], [mesh.normals, 'normal'], [mesh.uvs, 'uv']] as const) {
    for (let k = 0; k < array.length; k++) if (!Number.isFinite(array[k]!)) fail(mesh, `a ${what} value is not finite`);
  }
  for (let v = 0; v < n; v++) {
    const length = Math.hypot(mesh.normals[v * 3]!, mesh.normals[v * 3 + 1]!, mesh.normals[v * 3 + 2]!);
    if (Math.abs(length - 1) > 1e-3) fail(mesh, `normal of vertex ${v} is not unit length (${length})`);
    let sum = 0;
    for (let k = 0; k < MAX_BONE_INFLUENCES; k++) {
      const weight = mesh.boneWeights[v * 4 + k]!, bone = mesh.boneIndices[v * 4 + k]!;
      sum += weight;
      if (bone >= mesh.boneCount) fail(mesh, `vertex ${v} refers to bone ${bone} but the model has ${mesh.boneCount} bone(s)`);
      if (weight === 0 && bone !== 0) fail(mesh, `vertex ${v}: an unused influence (weight 0) must have bone index 0`);
    }
    if (sum !== 255) fail(mesh, `the 4 bone weights of vertex ${v} must add up to 255 (got ${sum})`);
  }
  validateModelSections(mesh);
}

/** Interleaves the mesh into MODEL_VERTEX_LAYOUT (little-endian floats, as every GPU the engine targets reads them). */
export function packModelVertices(mesh: ModelMesh): Uint8Array {
  validateModelMesh(mesh);
  const out = new Uint8Array(mesh.vertexCount * MODEL_VERTEX_BYTES);
  const view = new DataView(out.buffer);
  for (let v = 0; v < mesh.vertexCount; v++) {
    const at = v * MODEL_VERTEX_BYTES;
    for (let k = 0; k < 3; k++) {
      view.setFloat32(at + MODEL_VERTEX_OFFSETS.position + k * 4, mesh.positions[v * 3 + k]!, true);
      view.setFloat32(at + MODEL_VERTEX_OFFSETS.normal + k * 4, mesh.normals[v * 3 + k]!, true);
    }
    for (let k = 0; k < 2; k++) view.setFloat32(at + MODEL_VERTEX_OFFSETS.uv + k * 4, mesh.uvs[v * 2 + k]!, true);
    for (let k = 0; k < 4; k++) {
      out[at + MODEL_VERTEX_OFFSETS.boneWeights + k] = mesh.boneWeights[v * 4 + k]!;
      out[at + MODEL_VERTEX_OFFSETS.boneIndices + k] = mesh.boneIndices[v * 4 + k]!;
    }
  }
  return out;
}

export interface ModelBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  readonly center: readonly [number, number, number];
  /** Radius of the sphere around `center` containing every vertex. */
  readonly radius: number;
}

export function modelBounds(mesh: ModelMesh): ModelBounds {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < mesh.vertexCount; v++) for (let k = 0; k < 3; k++) {
    const value = mesh.positions[v * 3 + k]!;
    if (value < min[k]!) min[k] = value;
    if (value > max[k]!) max[k] = value;
  }
  const center = [(min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, (min[2]! + max[2]!) / 2] as const;
  let radius = 0;
  for (let v = 0; v < mesh.vertexCount; v++) radius = Math.max(radius, Math.hypot(mesh.positions[v * 3]! - center[0], mesh.positions[v * 3 + 1]! - center[1], mesh.positions[v * 3 + 2]! - center[2]));
  return { min: [min[0]!, min[1]!, min[2]!], max: [max[0]!, max[1]!, max[2]!], center, radius };
}

/** Collects vertices and triangles, then gives a ModelMesh. For building original models in code. */
export class ModelMeshBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly weights: number[] = [];
  private readonly bones: number[] = [];
  private readonly indices: number[] = [];
  private readonly materials: ModelMaterial[] = [];
  private readonly sections: Array<{ geosetId: number; material: number; indexStart: number }> = [];

  /** Declares a material and returns its index. */
  material(renderFlags: number, blendMode: number): number {
    this.materials.push({ renderFlags, blendMode });
    return this.materials.length - 1;
  }

  /** The triangles added from now on belong to this submesh. Once used, every triangle must be in a submesh. */
  submesh(geosetId: number, material: number): void {
    if (this.sections.length === 0 && this.indices.length > 0) throw new Error('model builder: submesh() must be called before the first triangle');
    this.sections.push({ geosetId, material, indexStart: this.indices.length });
  }

  /**
   * @param influences up to 4 [bone, weight 0..255] pairs; weights must add up to 255
   * @returns the vertex index
   */
  vertex(position: readonly [number, number, number], normal: readonly [number, number, number], uv: readonly [number, number], influences: ReadonlyArray<readonly [number, number]>): number {
    if (influences.length === 0 || influences.length > MAX_BONE_INFLUENCES) throw new Error(`model builder: a vertex takes 1..${MAX_BONE_INFLUENCES} bone influences (got ${influences.length})`);
    const length = Math.hypot(normal[0], normal[1], normal[2]);
    if (!(length > 0)) throw new Error('model builder: a normal must not be the zero vector');
    this.positions.push(position[0], position[1], position[2]);
    this.normals.push(normal[0] / length, normal[1] / length, normal[2] / length);
    this.uvs.push(uv[0], uv[1]);
    for (let k = 0; k < MAX_BONE_INFLUENCES; k++) {
      this.bones.push(influences[k]?.[0] ?? 0);
      this.weights.push(influences[k]?.[1] ?? 0);
    }
    return this.positions.length / 3 - 1;
  }

  /** Counter-clockwise seen from outside. */
  triangle(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }

  build(name: string, boneCount: number): ModelMesh {
    const mesh: ModelMesh = {
      name,
      vertexCount: this.positions.length / 3,
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      uvs: new Float32Array(this.uvs),
      boneWeights: new Uint8Array(this.weights),
      boneIndices: new Uint8Array(this.bones),
      indices: new Uint16Array(this.indices),
      boneCount,
      ...(this.sections.length > 0
        ? {
            materials: [...this.materials],
            submeshes: this.sections.map((section, k) => ({ geosetId: section.geosetId, material: section.material, indexStart: section.indexStart, indexCount: (this.sections[k + 1]?.indexStart ?? this.indices.length) - section.indexStart })),
          }
        : {}),
    };
    if (this.weights.some((w) => !Number.isInteger(w) || w < 0 || w > 255) || this.bones.some((b) => !Number.isInteger(b) || b < 0 || b > 255)) throw new Error(`model "${name}": bone weights and indices must be integers in 0..255`);
    validateModelMesh(mesh);
    return mesh;
  }
}
