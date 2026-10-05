import type { BlendMode, CullMode, VertexLayout } from '../renderer';
import { type BuildingPortal, type BuildingPortalRef, validateBuildingPortals } from './portal';
import { type BuildingFog, validateBuildingFogs } from './fog';
import { type BuildingLiquid, validateBuildingLiquid } from './liquid';
import { type BuildingDoodad, type BuildingDoodadSet, validateBuildingDoodads } from './doodad';

/**
 * Buildings (the document's « WMO », spec §103–§117, §132–§136, §171).
 *
 * FROM THE SPEC:
 * - a building is NOT one mesh: a root (shared materials, group table…) plus GROUPS, each an independently
 *   loadable, cullable, renderable cell with its own geometry. Groups must never be merged into one mesh;
 * - a material is a small record: flags, a blend mode and AT MOST 2 textures;
 * - material flags: 0x01 UNLIT, 0x04 UNCULLED (two-sided), 0x10 SIDN (night glow), 0x20 WINDOW;
 * - material blend modes — NOT the models' numbering: 0 Opaque, 1 Alpha Test, 4 Mod, 5 Mod2x, any other non-zero
 *   value = translucent / blended family;
 * - a group holds positions, normals, one UV set, optional baked vertex colours, 16-bit indices, and render
 *   BATCHES: a start index, an index count and a material each; batches come in three ordered sections —
 *   TRANS, INT, EXT — which select lighting behaviour;
 * - a group is a true INTERIOR when (flags & 0x48) == 0; 0x08 = exterior, 0x40 = exterior-lit. This is authored,
 *   never guessed from the geometry;
 * - each group has an authored bounding box, for visibility only (it may be loose).
 *
 * OUR CHOICES (the document does not settle them):
 * - the runtime structure below (the document recommends keeping the architecture, not the binary format);
 * - a « translucent family » blend mode is drawn with plain alpha blending;
 * - the alpha-test reference: the document gives none for buildings — BUILDING_ALPHA_REFERENCE, 224 / 255 like
 *   the models, is a constant of ours;
 * - the vertex layout (36 bytes) and vertex colours as 4 bytes; a group without colours is given white.
 */
export const BUILDING_MATERIAL_FLAG = { unlit: 0x01, unculled: 0x04, nightGlow: 0x10, window: 0x20 } as const;
export const BUILDING_BLEND = { opaque: 0, alphaTest: 1, mod: 4, mod2x: 5 } as const;
export const BUILDING_GROUP_FLAG = { exterior: 0x08, exteriorLit: 0x40 } as const;
export const BUILDING_ALPHA_REFERENCE = 224 / 255;
export const MAX_BUILDING_MATERIAL_TEXTURES = 2;

export interface BuildingTexture {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** RGBA, 8 bits per channel. */
  readonly data: Uint8Array;
}

export interface BuildingMaterial {
  readonly name: string;
  readonly flags: number;
  readonly blendMode: number;
  /** Indices into the building's textures: one or two. Only the first is drawn so far. */
  readonly textures: readonly number[];
}

export type BuildingBatchClass = 'trans' | 'interior' | 'exterior';
const CLASS_ORDER: readonly BuildingBatchClass[] = ['trans', 'interior', 'exterior'];

export interface BuildingBatch {
  readonly firstIndex: number;
  readonly indexCount: number;
  /** Index into the building's materials. */
  readonly material: number;
  readonly batchClass: BuildingBatchClass;
}

export interface BuildingBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface BuildingGroup {
  readonly name: string;
  readonly flags: number;
  /** Authored box for visibility; must contain the geometry here, but may be larger. */
  readonly bounds: BuildingBounds;
  readonly vertexCount: number;
  /** 3 floats per vertex. */
  readonly positions: Float32Array;
  /** 3 floats per vertex, unit length. */
  readonly normals: Float32Array;
  /** 2 floats per vertex. */
  readonly uvs: Float32Array;
  /** 4 bytes per vertex (r, g, b, a): baked light. Absent = white. */
  readonly colors?: Uint8Array | undefined;
  /** Triangles, counter-clockwise seen from their visible side. */
  readonly indices: Uint16Array;
  /** Ordered: every 'trans' batch, then every 'interior', then every 'exterior'; they cover the indices exactly. */
  readonly batches: readonly BuildingBatch[];
  /** Semantic flags, one byte per triangle (see collision.ts). Absent = all 0. */
  readonly triangleFlags?: Uint8Array | undefined;
  /** The group's slice of the building's portal references (see portal.ts). Absent = none. */
  readonly portalRefStart?: number | undefined;
  readonly portalRefCount?: number | undefined;
  /** Up to 4 of the building's fog records (see fog.ts). */
  readonly fogIndices?: readonly number[] | undefined;
  /** The group's own liquid surface (see liquid.ts). */
  readonly liquid?: BuildingLiquid | undefined;
  /** Props this group shows (indices into the building's doodads). A prop may be listed by several groups. */
  readonly doodadRefs?: readonly number[] | undefined;
}

/** The root: what the groups share. */
export interface Building {
  readonly name: string;
  readonly textures: readonly BuildingTexture[];
  readonly materials: readonly BuildingMaterial[];
  readonly groups: readonly BuildingGroup[];
  /** Names of the prop models the doodads use (see doodad.ts). */
  readonly doodadModels?: readonly string[] | undefined;
  /** Every placed prop of the building, in one list; the sets are ranges of it. */
  readonly doodads?: readonly BuildingDoodad[] | undefined;
  readonly doodadSets?: readonly BuildingDoodadSet[] | undefined;
  /** Shared pool of portal vertices (3 floats each), the portals, and the group → portal → neighbour references. */
  readonly portalVertices?: Float32Array | undefined;
  readonly portals?: readonly BuildingPortal[] | undefined;
  readonly portalRefs?: readonly BuildingPortalRef[] | undefined;
  /** Interior fog records; record 0 is the base. */
  readonly fogs?: readonly BuildingFog[] | undefined;
}

/** A true interior: neither exterior nor exterior-lit (spec §116). */
export function groupIsInterior(flags: number): boolean {
  return (flags & (BUILDING_GROUP_FLAG.exterior | BUILDING_GROUP_FLAG.exteriorLit)) === 0;
}

export interface BuildingMaterialState {
  readonly blend: BlendMode;
  readonly cullMode: CullMode;
  readonly depthWrite: boolean;
  readonly transparent: boolean;
  readonly unlit: boolean;
  /** 0 = no alpha test. */
  readonly alphaReference: number;
}

export function buildingMaterialState(material: BuildingMaterial): BuildingMaterialState {
  const mode = material.blendMode;
  if (!Number.isInteger(mode) || mode < 0 || mode > 0xffff) throw new Error(`building material "${material.name}": blend mode must be a 16-bit value (got ${mode})`);
  if (!Number.isInteger(material.flags) || material.flags < 0 || material.flags > 0xffff) throw new Error(`building material "${material.name}": flags must be a 16-bit value (got ${material.flags})`);
  const solid = mode === BUILDING_BLEND.opaque || mode === BUILDING_BLEND.alphaTest;
  return {
    blend: solid ? 'opaque' : mode === BUILDING_BLEND.mod ? 'mod' : mode === BUILDING_BLEND.mod2x ? 'mod2x' : 'alpha',
    cullMode: material.flags & BUILDING_MATERIAL_FLAG.unculled ? 'none' : 'back',
    depthWrite: solid,
    transparent: !solid,
    unlit: (material.flags & BUILDING_MATERIAL_FLAG.unlit) !== 0,
    alphaReference: mode === BUILDING_BLEND.alphaTest ? BUILDING_ALPHA_REFERENCE : 0,
  };
}

function validateGroup(building: Building, group: BuildingGroup, index: number): void {
  const fail = (message: string): never => {
    throw new Error(`building "${building.name}", group ${index} ("${group.name}"): ${message}`);
  };
  const n = group.vertexCount;
  if (!Number.isInteger(n) || n < 3 || n > 65536) fail(`vertexCount must be an integer in 3..65536 (got ${n})`);
  if (!Number.isInteger(group.flags) || group.flags < 0) fail(`invalid flags ${group.flags}`);
  for (const [array, per, what] of [[group.positions, 3, 'positions'], [group.normals, 3, 'normals'], [group.uvs, 2, 'uvs']] as const) {
    if (array.length !== n * per) fail(`${what} must hold ${n * per} values (got ${array.length})`);
    for (let k = 0; k < array.length; k++) if (!Number.isFinite(array[k]!)) fail(`a value of ${what} is not finite`);
  }
  if (group.colors && group.colors.length !== n * 4) fail(`colors must hold ${n * 4} bytes (got ${group.colors.length})`);
  for (let v = 0; v < n; v++) {
    const length = Math.hypot(group.normals[v * 3]!, group.normals[v * 3 + 1]!, group.normals[v * 3 + 2]!);
    if (Math.abs(length - 1) > 1e-3) fail(`normal of vertex ${v} is not unit length (${length})`);
    for (let k = 0; k < 3; k++) {
      const p = group.positions[v * 3 + k]!;
      if (p < group.bounds.min[k]! - 1e-4 || p > group.bounds.max[k]! + 1e-4) fail(`vertex ${v} is outside the group's bounding box`);
    }
  }
  if (group.indices.length === 0 || group.indices.length % 3 !== 0) fail(`indices must hold whole triangles (got ${group.indices.length})`);
  for (const i of group.indices) if (i >= n) fail(`index ${i} is outside the ${n} vertices`);
  if (group.triangleFlags && group.triangleFlags.length !== group.indices.length / 3) fail(`triangleFlags must hold one byte per triangle: ${group.indices.length / 3} (got ${group.triangleFlags.length})`);
  if (group.liquid) validateBuildingLiquid(group.liquid, `building "${building.name}", group ${index} ("${group.name}") liquid`);
  if (group.batches.length === 0) fail('needs at least one batch');
  let next = 0, lastClass = 0;
  group.batches.forEach((batch, b) => {
    const order = CLASS_ORDER.indexOf(batch.batchClass);
    if (order < 0) fail(`batch ${b} has an unknown class "${String(batch.batchClass)}"`);
    if (order < lastClass) fail(`batch ${b} (${batch.batchClass}) is out of order: trans, then interior, then exterior`);
    lastClass = order;
    if (!Number.isInteger(batch.material) || batch.material < 0 || batch.material >= building.materials.length) fail(`batch ${b} refers to material ${batch.material} but the building has ${building.materials.length}`);
    if (!Number.isInteger(batch.indexCount) || batch.indexCount <= 0 || batch.indexCount % 3 !== 0) fail(`batch ${b} must hold whole triangles (got ${batch.indexCount} indices)`);
    if (batch.firstIndex !== next) fail(`batch ${b} must start at index ${next} (got ${batch.firstIndex})`);
    next += batch.indexCount;
  });
  if (next !== group.indices.length) fail(`batches cover ${next} indices, the group has ${group.indices.length}`);
}

/** The shader's lighting paths (see shaders/building.ts). */
export const BUILDING_LIGHTING_PATH = { sun: 0, interior: 1, trans: 2 } as const;

/**
 * The lighting path of a batch (spec §171–§173): the class-specific interior rules apply in TRUE interior groups
 * only; an exterior or exterior-lit group is lit by the sun throughout.
 */
export function batchLightingPath(groupFlags: number, batchClass: BuildingBatchClass): number {
  if (!groupIsInterior(groupFlags)) return BUILDING_LIGHTING_PATH.sun;
  return batchClass === 'interior' ? BUILDING_LIGHTING_PATH.interior : batchClass === 'trans' ? BUILDING_LIGHTING_PATH.trans : BUILDING_LIGHTING_PATH.sun;
}

export function validateBuilding(building: Building): void {
  if (building.groups.length === 0) throw new Error(`building "${building.name}": needs at least one group`);
  building.textures.forEach((texture) => {
    if (texture.data.length !== texture.width * texture.height * 4) throw new Error(`building "${building.name}": texture "${texture.name}" must hold ${texture.width} × ${texture.height} texels`);
  });
  building.materials.forEach((material) => {
    buildingMaterialState(material);
    if (material.textures.length < 1 || material.textures.length > MAX_BUILDING_MATERIAL_TEXTURES) throw new Error(`building "${building.name}": material "${material.name}" takes 1 or ${MAX_BUILDING_MATERIAL_TEXTURES} textures (got ${material.textures.length})`);
    for (const t of material.textures) if (!Number.isInteger(t) || t < 0 || t >= building.textures.length) throw new Error(`building "${building.name}": material "${material.name}" refers to texture ${t} but the building has ${building.textures.length}`);
  });
  building.groups.forEach((group, index) => validateGroup(building, group, index));
  validateBuildingDoodads(building);
  validateBuildingPortals(building);
  validateBuildingFogs(building);
}

export const BUILDING_VERTEX_BYTES = 36;
/** position, normal, uv as floats; colour as 4 bytes read as 0..1. */
export const BUILDING_VERTEX_LAYOUT: VertexLayout = {
  stride: BUILDING_VERTEX_BYTES,
  attributes: [
    { location: 0, format: 'float32x3', offset: 0 },
    { location: 1, format: 'float32x3', offset: 12 },
    { location: 2, format: 'float32x2', offset: 24 },
    { location: 3, format: 'unorm8x4', offset: 32 },
  ],
};

/** Interleaves a group into BUILDING_VERTEX_LAYOUT (little-endian floats). */
export function packBuildingGroup(group: BuildingGroup): Uint8Array {
  const out = new Uint8Array(group.vertexCount * BUILDING_VERTEX_BYTES), view = new DataView(out.buffer);
  for (let v = 0; v < group.vertexCount; v++) {
    const at = v * BUILDING_VERTEX_BYTES;
    for (let k = 0; k < 3; k++) {
      view.setFloat32(at + k * 4, group.positions[v * 3 + k]!, true);
      view.setFloat32(at + 12 + k * 4, group.normals[v * 3 + k]!, true);
    }
    for (let k = 0; k < 2; k++) view.setFloat32(at + 24 + k * 4, group.uvs[v * 2 + k]!, true);
    for (let k = 0; k < 4; k++) out[at + 32 + k] = group.colors ? group.colors[v * 4 + k]! : 255;
  }
  return out;
}

/**
 * Collects the geometry of one group, batch by batch. Batches must be opened in class order
 * (trans, interior, exterior); the bounding box is computed from the vertices unless one is given.
 */
export class BuildingGroupBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];
  private readonly triangleFlags: number[] = [];
  private currentFlags = 0;
  private readonly batches: Array<{ firstIndex: number; material: number; batchClass: BuildingBatchClass }> = [];

  constructor(readonly name: string, readonly flags: number) {}

  /** The triangles added from now on belong to this batch. */
  batch(material: number, batchClass: BuildingBatchClass): void {
    this.batches.push({ firstIndex: this.indices.length, material, batchClass });
  }

  /** The triangles added from now on carry these semantic flags (BUILDING_TRIANGLE_FLAG). Default 0. */
  faceFlags(flags: number): void {
    if (!Number.isInteger(flags) || flags < 0 || flags > 255) throw new Error(`building builder: triangle flags must be one byte (got ${flags})`);
    this.currentFlags = flags;
  }

  vertex(position: readonly [number, number, number], normal: readonly [number, number, number], uv: readonly [number, number], color: readonly [number, number, number, number] = [255, 255, 255, 255]): number {
    const length = Math.hypot(normal[0], normal[1], normal[2]);
    if (!(length > 0)) throw new Error('building builder: a normal must not be the zero vector');
    this.positions.push(position[0], position[1], position[2]);
    this.normals.push(normal[0] / length, normal[1] / length, normal[2] / length);
    this.uvs.push(uv[0], uv[1]);
    this.colors.push(color[0], color[1], color[2], color[3]);
    return this.positions.length / 3 - 1;
  }

  triangle(a: number, b: number, c: number): void {
    if (this.batches.length === 0) throw new Error('building builder: open a batch before adding triangles');
    this.indices.push(a, b, c);
    this.triangleFlags.push(this.currentFlags);
  }

  /**
   * A flat four-sided face: corners counter-clockwise seen from its visible side. The texture repeats every
   * `texelSize` units along the face (u along the first edge, v along the last).
   */
  quad(corners: readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]], texelSize = 2, colors?: readonly [readonly number[], readonly number[], readonly number[], readonly number[]]): void {
    const [a, b, , d] = corners;
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const, e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]] as const;
    const normal = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]] as const;
    const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const uvOf = (p: readonly [number, number, number]): [number, number] => {
      const r = [p[0] - a[0], p[1] - a[1], p[2] - a[2]] as const;
      return [(r[0] * e1[0] + r[1] * e1[1] + r[2] * e1[2]) / l1 / texelSize, 1 - (r[0] * e2[0] + r[1] * e2[1] + r[2] * e2[2]) / l2 / texelSize];
    };
    const v = corners.map((p, k) => this.vertex(p, normal, uvOf(p), (colors?.[k] as [number, number, number, number] | undefined) ?? [255, 255, 255, 255]));
    this.triangle(v[0]!, v[1]!, v[2]!);
    this.triangle(v[0]!, v[2]!, v[3]!);
  }

  build(bounds?: BuildingBounds, doodadRefs?: readonly number[], liquid?: BuildingLiquid): BuildingGroup {
    const n = this.positions.length / 3;
    const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < n; v++) for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, this.positions[v * 3 + k]!);
      max[k] = Math.max(max[k]!, this.positions[v * 3 + k]!);
    }
    return {
      name: this.name,
      flags: this.flags,
      bounds: bounds ?? { min, max },
      vertexCount: n,
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      uvs: new Float32Array(this.uvs),
      colors: new Uint8Array(this.colors),
      indices: new Uint16Array(this.indices),
      triangleFlags: new Uint8Array(this.triangleFlags),
      batches: this.batches.map((batch, k) => ({ ...batch, indexCount: (this.batches[k + 1]?.firstIndex ?? this.indices.length) - batch.firstIndex })),
      ...(doodadRefs ? { doodadRefs } : {}),
      ...(liquid ? { liquid } : {}),
    };
  }
}
