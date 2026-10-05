import type { BlendMode, CullMode } from '../renderer';
import type { ModelMesh } from './modelMesh';

/**
 * Model materials and submeshes (spec §31, §77–§83, §98).
 *
 * FROM THE SPEC:
 * - a material is two small numbers: render flags and a blend mode;
 * - flags: 0x01 UNLIT, 0x02 UNFOGGED, 0x04 NO_BACKFACE_CULLING (two-sided);
 * - blend modes: 0 Opaque, 1 Alpha Key (cutout), 2 Alpha Blend, 3 No-Alpha Add, 4 Add, 5 Mod, 6 Mod2x;
 * - alpha key discards a fragment when textureAlpha × materialAlpha < 224 / 255;
 * - Mod and Mod2x are full-bright even without the UNLIT flag; additive modes are lit unless UNLIT;
 * - additive effects fog towards black, unfogged materials ignore the fog;
 * - a submesh has a geoset id, an index range and a material; geoset ids switch sections on and off.
 *
 * OUR CHOICES (the document does not settle them):
 * - the depth-related flag bits (0x08, 0x10, 0x20, 0x40) are IGNORED: the document itself says their meaning must
 *   be treated with caution. Depth follows the mode: Opaque and Alpha Key test and write; the other modes test
 *   and do not write;
 * - Mod fogs towards white and Mod2x towards mid grey — the colours that leave the frame unchanged when
 *   multiplied — so that, like the additive modes, they fade out with distance instead of veiling the scene;
 * - the exact blend factors (see BLEND_FACTORS in the renderer).
 */
export const RENDER_FLAG = { unlit: 0x01, unfogged: 0x02, twoSided: 0x04 } as const;
export const MODEL_BLEND = { opaque: 0, alphaKey: 1, alpha: 2, noAlphaAdd: 3, add: 4, mod: 5, mod2x: 6 } as const;
export const MODEL_BLEND_NAMES = ['opaque', 'alphaKey', 'alpha', 'noAlphaAdd', 'add', 'mod', 'mod2x'] as const;
/** Alpha Key threshold (spec §80). */
export const ALPHA_KEY_REFERENCE = 224 / 255;

export interface ModelMaterial {
  readonly renderFlags: number;
  /** 0..6, see MODEL_BLEND. */
  readonly blendMode: number;
}

export interface ModelSubmesh {
  /** Sections sharing an id are shown and hidden together. */
  readonly geosetId: number;
  /** Range in the mesh's index list; whole triangles. */
  readonly indexStart: number;
  readonly indexCount: number;
  /** Index into the mesh's materials. */
  readonly material: number;
}

export const DEFAULT_MATERIAL: ModelMaterial = { renderFlags: 0, blendMode: MODEL_BLEND.opaque };

export type ModelFogPolicy = 'scene' | 'black' | 'white' | 'grey' | 'none';

/** Everything the renderer needs to draw with a material. */
export interface MaterialState {
  readonly blend: BlendMode;
  readonly cullMode: CullMode;
  readonly depthWrite: boolean;
  /** Drawn after every opaque and cutout surface. */
  readonly transparent: boolean;
  readonly unlit: boolean;
  /** 0 = no alpha test. */
  readonly alphaReference: number;
  readonly fog: ModelFogPolicy;
}

const BLEND_OF: readonly BlendMode[] = ['opaque', 'opaque', 'alpha', 'addNoAlpha', 'add', 'mod', 'mod2x'];
const FOG_OF: readonly ModelFogPolicy[] = ['scene', 'scene', 'scene', 'black', 'black', 'white', 'grey'];
export const FOG_POLICY_COLOUR: Readonly<Record<Exclude<ModelFogPolicy, 'scene' | 'none'>, readonly [number, number, number]>> = { black: [0, 0, 0], white: [1, 1, 1], grey: [0.5, 0.5, 0.5] };

export function materialState(material: ModelMaterial): MaterialState {
  const mode = material.blendMode;
  if (!Number.isInteger(mode) || mode < 0 || mode > 6) throw new Error(`material: blend mode must be 0..6 (got ${mode})`);
  if (!Number.isInteger(material.renderFlags) || material.renderFlags < 0 || material.renderFlags > 0xffff) throw new Error(`material: render flags must be a 16-bit value (got ${material.renderFlags})`);
  const flags = material.renderFlags;
  return {
    blend: BLEND_OF[mode]!,
    cullMode: flags & RENDER_FLAG.twoSided ? 'none' : 'back',
    depthWrite: mode <= MODEL_BLEND.alphaKey,
    transparent: mode >= MODEL_BLEND.alpha,
    unlit: (flags & RENDER_FLAG.unlit) !== 0 || mode === MODEL_BLEND.mod || mode === MODEL_BLEND.mod2x,
    alphaReference: mode === MODEL_BLEND.alphaKey ? ALPHA_KEY_REFERENCE : 0,
    fog: flags & RENDER_FLAG.unfogged ? 'none' : FOG_OF[mode]!,
  };
}

/** The submeshes of a mesh; a mesh that declares none is one opaque, lit submesh with geoset id 0. */
export function modelSubmeshes(mesh: ModelMesh): readonly ModelSubmesh[] {
  return mesh.submeshes ?? [{ geosetId: 0, indexStart: 0, indexCount: mesh.indices.length, material: 0 }];
}

export function modelMaterials(mesh: ModelMesh): readonly ModelMaterial[] {
  return mesh.materials ?? [DEFAULT_MATERIAL];
}

/** Checks the submeshes and materials of a mesh (called by validateModelMesh). */
export function validateModelSections(mesh: ModelMesh): void {
  const fail = (message: string): never => {
    throw new Error(`model "${mesh.name}": ${message}`);
  };
  if ((mesh.submeshes === undefined) !== (mesh.materials === undefined)) fail('submeshes and materials must be given together');
  const materials = modelMaterials(mesh), submeshes = modelSubmeshes(mesh);
  if (materials.length === 0 || submeshes.length === 0) fail('needs at least one material and one submesh');
  materials.forEach((material) => materialState(material));
  let next = 0;
  submeshes.forEach((submesh, index) => {
    if (!Number.isInteger(submesh.geosetId) || submesh.geosetId < 0 || submesh.geosetId > 0xffff) fail(`submesh ${index} has an invalid geoset id ${submesh.geosetId}`);
    if (!Number.isInteger(submesh.material) || submesh.material < 0 || submesh.material >= materials.length) fail(`submesh ${index} refers to material ${submesh.material} but the model has ${materials.length}`);
    if (!Number.isInteger(submesh.indexCount) || submesh.indexCount <= 0 || submesh.indexCount % 3 !== 0) fail(`submesh ${index} must hold whole triangles (got ${submesh.indexCount} indices)`);
    // OUR CHOICE: submeshes follow each other and cover the index list exactly — no triangle is drawn twice or never.
    if (submesh.indexStart !== next) fail(`submesh ${index} must start at index ${next} (got ${submesh.indexStart})`);
    next += submesh.indexCount;
  });
  if (next !== mesh.indices.length) fail(`submeshes cover ${next} indices, the mesh has ${mesh.indices.length}`);
}
