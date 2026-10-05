import { type ModelMesh, ModelMeshBuilder } from './modelMesh';
import type { BoneTracks } from './animation';
import type { Attachment } from './attachment';
import { MODEL_BLEND, RENDER_FLAG } from './material';
import type { ParticleEmitter } from './particles';
import type { RibbonEmitter } from './ribbon';
import type { ModelAnimation } from './sequence';
import { type BonePose, NO_PARENT, rotationPose, type Skeleton } from './skeleton';

/**
 * An ORIGINAL low-poly tree, built in code: a tapered trunk and two stacked
 * cones of foliage. First model of the engine (P4.1) — a fixture for the model
 * pipeline, not a piece of the final world. No external asset.
 *
 * Bones (see TREE_SKELETON below):
 *   0 = trunk, 1 = lower foliage, 2 = top.
 * The upper cone's base ring is shared 128 / 127 between bones 1 and 2; its tip is all bone 2.
 *
 * Texture atlas: u 0..0.5 = bark, u 0.5..1 = leaves (see treeTexture()).
 */
export const TREE = {
  trunk: { sides: 6, bottomRadius: 0.45, topRadius: 0.3, height: 3 },
  lower: { sides: 8, baseZ: 2.2, radius: 2, tipZ: 5 },
  upper: { sides: 8, baseZ: 4, radius: 1.4, tipZ: 7 },
  boneCount: 3,
} as const;

export function buildTreeModel(): ModelMesh {
  const b = new ModelMeshBuilder();
  const TAU = 2 * Math.PI;

  // Trunk: two rings, smooth radial normals; the seam column is duplicated for the texture.
  {
    const { sides, bottomRadius, topRadius, height } = TREE.trunk;
    const slope = (bottomRadius - topRadius) / height; // the side leans inwards going up → the normal tilts up
    const ring: Array<[number, number]> = [];
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * TAU, c = Math.cos(a), s = Math.sin(a), u = (k / sides) * 0.5;
      ring.push([
        b.vertex([bottomRadius * c, bottomRadius * s, 0], [c, s, slope], [u, 1], [[0, 255]]),
        b.vertex([topRadius * c, topRadius * s, height], [c, s, slope], [u, 0], [[0, 255]]),
      ]);
    }
    for (let k = 0; k < sides; k++) {
      const [b0, t0] = ring[k]!, [b1, t1] = ring[k + 1]!;
      b.triangle(b0, b1, t1);
      b.triangle(b0, t1, t0);
    }
  }

  // A cone of foliage: a base ring and one tip vertex per side (so each side has its own smooth normal at the tip),
  // closed underneath by a cap facing down.
  const cone = (shape: { sides: number; baseZ: number; radius: number; tipZ: number }, ringInfluences: ReadonlyArray<readonly [number, number]>, tipInfluences: ReadonlyArray<readonly [number, number]>): void => {
    const { sides, baseZ, radius, tipZ } = shape;
    const h = tipZ - baseZ;
    const base: number[] = [];
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * TAU, c = Math.cos(a), s = Math.sin(a);
      base.push(b.vertex([radius * c, radius * s, baseZ], [c * h, s * h, radius], [0.5 + (k / sides) * 0.5, 1], ringInfluences));
    }
    for (let k = 0; k < sides; k++) {
      const a = ((k + 0.5) / sides) * TAU, c = Math.cos(a), s = Math.sin(a);
      const tip = b.vertex([0, 0, tipZ], [c * h, s * h, radius], [0.5 + ((k + 0.5) / sides) * 0.5, 0], tipInfluences);
      b.triangle(base[k]!, base[k + 1]!, tip);
    }
    // Underside: a fan around the centre, seen from below.
    const centre = b.vertex([0, 0, baseZ], [0, 0, -1], [0.75, 0.5], ringInfluences);
    const under: number[] = [];
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * TAU, c = Math.cos(a), s = Math.sin(a);
      under.push(b.vertex([radius * c, radius * s, baseZ], [0, 0, -1], [0.75 + 0.25 * c, 0.5 + 0.5 * s], ringInfluences));
    }
    for (let k = 0; k < sides; k++) b.triangle(centre, under[k + 1]!, under[k]!);
  };
  cone(TREE.lower, [[1, 255]], [[1, 255]]);
  cone(TREE.upper, [[1, 128], [2, 127]], [[2, 255]]);

  return b.build('fixture-tree', TREE.boneCount);
}

/** The tree's skeleton: a chain trunk → lower foliage → top, each bone pivoting where its part starts. */
export const TREE_SKELETON: Skeleton = {
  bones: [
    { name: 'trunk', parent: NO_PARENT, pivot: [0, 0, 0] },
    { name: 'lower', parent: 0, pivot: [0, 0, TREE.lower.baseZ] },
    { name: 'top', parent: 1, pivot: [0, 0, TREE.upper.baseZ] },
  ],
};

/**
 * Named test poses of the tree. 'bend': the lower foliage leans 20° around +x at its pivot and the top leans
 * another 20° — the top therefore turns 40° in all and its pivot is carried along by its parent.
 */
export const TREE_POSES: Readonly<Record<'rest' | 'bend', ReadonlyArray<BonePose | undefined>>> = {
  rest: [],
  bend: [undefined, rotationPose([1, 0, 0], 20), rotationPose([1, 0, 0], 20)],
};

/** Key times of the sway, in milliseconds: upright, leaning one way, upright, leaning the other way, upright. */
export const TREE_SWAY_TIMES = [0, 1000, 2000, 3000, 4000] as const;
export const TREE_SWAY_DEGREES = 20;

/**
 * A slow sway for the tree, as animation tracks (P4.3): the two foliage bones lean around +x, and the top also
 * swells a little while leaning. At 1000 ms the rotations are exactly TREE_POSES.bend. The trunk has no track.
 */
export function treeSwayTracks(): Array<BoneTracks | undefined> {
  const timestamps = Uint32Array.from(TREE_SWAY_TIMES);
  const lean = [0, TREE_SWAY_DEGREES, 0, -TREE_SWAY_DEGREES, 0].flatMap((degrees) => [...rotationPose([1, 0, 0], degrees).rotation]);
  const rotation = { interpolation: 'linear' as const, timestamps, values: Float32Array.from(lean) };
  const scale = { interpolation: 'linear' as const, timestamps, values: Float32Array.from([1, 1.1, 1, 1.1, 1].flatMap((s) => [s, s, s])) };
  return [undefined, { rotation }, { rotation, scale }];
}

export const TREE_GUST_DEGREES = 35;
export const TREE_BOB_HEIGHT = 0.3;
export const TREE_BLEND_MS = 300;

/**
 * The tree's animation (P4.4), on ONE timeline as in the original format:
 *   sequence 0 « sway »   0..4000 ms, loops: the sway of treeSwayTracks() (rotations only);
 *   sequence 1 « gust »   5000..6000 ms, loops: both foliage bones lean 35° and come back;
 *   global sequence 0     2000 ms: the top bobs up by 0.3 and back, whatever sequence plays.
 * Nothing is sampled between 4000 and 5000 ms: a sequence never leaves its own window.
 */
export function treeAnimation(): ModelAnimation {
  const timestamps = Uint32Array.from([...TREE_SWAY_TIMES, 5000, 5500, 6000]);
  const degrees = [0, TREE_SWAY_DEGREES, 0, -TREE_SWAY_DEGREES, 0, 0, TREE_GUST_DEGREES, 0];
  const rotation = { interpolation: 'linear' as const, timestamps, values: Float32Array.from(degrees.flatMap((d) => [...rotationPose([1, 0, 0], d).rotation])) };
  const bob = { interpolation: 'linear' as const, timestamps: Uint32Array.from([0, 1000, 2000]), values: Float32Array.from([0, 0, 0, 0, 0, TREE_BOB_HEIGHT, 0, 0, 0]), globalSequence: 0 };
  return {
    sequences: [
      { name: 'sway', start: 0, end: 4000, loop: true, blendTime: TREE_BLEND_MS },
      { name: 'gust', start: 5000, end: 6000, loop: true, blendTime: TREE_BLEND_MS },
    ],
    boneTracks: [undefined, { rotation }, { rotation, translation: bob }],
    globalSequences: [2000],
  };
}

export interface ModelTexture {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** RGBA, 8 bits per channel. */
  readonly data: Uint8Array;
}

/** Flat colours of the tree atlas in 'solid' style: bark, leaves. */
export const TREE_SOLID_COLOURS = { bark: [120, 80, 40], leaves: [40, 120, 50] } as const;

/** Deterministic hash → 0..1. */
function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The tree's texture atlas, generated: left half bark (vertical streaks), right half leaves (speckles).
 * 'solid' = the two flat colours, for exact pixel checks.
 */
export function treeTexture(style: 'procedural' | 'solid' = 'procedural', size = 64): ModelTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const bark = x < size / 2;
      const base = bark ? TREE_SOLID_COLOURS.bark : TREE_SOLID_COLOURS.leaves;
      // Bark: the pattern depends mostly on the column; leaves: per-texel speckles in 2 × 2 blocks.
      const n = style === 'solid' ? 0.5 : bark ? 0.7 * hash(x, 7) + 0.3 * hash(x, y >> 2) : hash(x >> 1, y >> 1);
      const factor = style === 'solid' ? 1 : 0.7 + 0.6 * n;
      const at = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) data[at + c] = Math.min(255, Math.round(base[c]! * factor));
      data[at + 3] = 255;
    }
  }
  return { name: `tree-${style}`, width: size, height: size, data };
}

/**
 * Material test card (P4.6): nine flat swatches side by side in front of a backdrop, one per blend mode or flag.
 * Not a piece of the world — a fixture whose pixels can be predicted exactly.
 *
 * Every swatch faces −y, is 0.9 wide and has a top half (z 1..2) and a bottom half (z 0..1), each showing ONE
 * texel of swatchTexture() (all four corners share the same texture coordinate, so no filtering is involved).
 * The backdrop (geoset 0) is 0.5 behind, opaque and unlit.
 */
export const SWATCH_TEXELS = {
  solid: [200, 100, 50, 255],
  aboveKey: [200, 100, 50, 230],
  belowKey: [200, 100, 50, 220],
  half: [200, 100, 50, 128],
  backdrop: [40, 60, 80, 255],
} as const;
export type SwatchTexel = keyof typeof SWATCH_TEXELS;
const SWATCH_TEXEL_ORDER: readonly SwatchTexel[] = ['solid', 'aboveKey', 'belowKey', 'half', 'backdrop'];
const SWATCH_TEXTURE_SIZE = 8;

export interface SwatchSpec {
  readonly geosetId: number;
  readonly name: string;
  readonly blendMode: number;
  readonly renderFlags: number;
  readonly top: SwatchTexel;
  readonly bottom: SwatchTexel;
}

export const SWATCHES: readonly SwatchSpec[] = [
  { geosetId: 1, name: 'opaque', blendMode: MODEL_BLEND.opaque, renderFlags: RENDER_FLAG.unlit, top: 'half', bottom: 'half' },
  { geosetId: 2, name: 'alpha key', blendMode: MODEL_BLEND.alphaKey, renderFlags: RENDER_FLAG.unlit, top: 'aboveKey', bottom: 'belowKey' },
  { geosetId: 3, name: 'alpha', blendMode: MODEL_BLEND.alpha, renderFlags: RENDER_FLAG.unlit, top: 'half', bottom: 'half' },
  { geosetId: 4, name: 'no-alpha add', blendMode: MODEL_BLEND.noAlphaAdd, renderFlags: RENDER_FLAG.unlit, top: 'half', bottom: 'half' },
  { geosetId: 5, name: 'add', blendMode: MODEL_BLEND.add, renderFlags: RENDER_FLAG.unlit, top: 'half', bottom: 'half' },
  { geosetId: 6, name: 'mod', blendMode: MODEL_BLEND.mod, renderFlags: 0, top: 'solid', bottom: 'solid' },
  { geosetId: 7, name: 'mod2x', blendMode: MODEL_BLEND.mod2x, renderFlags: 0, top: 'solid', bottom: 'solid' },
  { geosetId: 8, name: 'opaque, lit', blendMode: MODEL_BLEND.opaque, renderFlags: 0, top: 'solid', bottom: 'solid' },
  { geosetId: 9, name: 'opaque, two-sided', blendMode: MODEL_BLEND.opaque, renderFlags: RENDER_FLAG.unlit | RENDER_FLAG.twoSided, top: 'solid', bottom: 'solid' },
];
export const SWATCH_BACKDROP_GEOSET = 0;

/** Centre of one half of a swatch, in model space. */
export function swatchCentre(geosetId: number, half: 'top' | 'bottom'): [number, number, number] {
  const index = SWATCHES.findIndex((swatch) => swatch.geosetId === geosetId);
  if (index < 0) throw new Error(`fixture: no swatch with geoset ${geosetId}`);
  return [-4.5 + index + 0.45, 0, half === 'top' ? 1.5 : 0.5];
}

export function buildSwatchModel(): ModelMesh {
  const b = new ModelMeshBuilder();
  const uvOf = (texel: SwatchTexel): [number, number] => [(SWATCH_TEXEL_ORDER.indexOf(texel) + 0.5) / SWATCH_TEXTURE_SIZE, 0.5];
  const quad = (x0: number, x1: number, y: number, z0: number, z1: number, texel: SwatchTexel): void => {
    const uv = uvOf(texel), n = [0, -1, 0] as const, bone = [[0, 255]] as const;
    const a = b.vertex([x0, y, z0], n, uv, bone), c = b.vertex([x1, y, z0], n, uv, bone), d = b.vertex([x1, y, z1], n, uv, bone), e = b.vertex([x0, y, z1], n, uv, bone);
    b.triangle(a, c, d);
    b.triangle(a, d, e);
  };
  b.submesh(SWATCH_BACKDROP_GEOSET, b.material(RENDER_FLAG.unlit, MODEL_BLEND.opaque));
  quad(-5, 5, 0.5, -0.5, 2.5, 'backdrop');
  SWATCHES.forEach((swatch, index) => {
    b.submesh(swatch.geosetId, b.material(swatch.renderFlags, swatch.blendMode));
    const x0 = -4.5 + index;
    quad(x0, x0 + 0.9, 0, 1, 2, swatch.top);
    quad(x0, x0 + 0.9, 0, 0, 1, swatch.bottom);
  });
  return b.build('fixture-swatches', 1);
}

/** 8 × 8 texture whose column k is the k-th texel of SWATCH_TEXELS (the other columns are transparent black). */
export function swatchTexture(): ModelTexture {
  const size = SWATCH_TEXTURE_SIZE, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) SWATCH_TEXEL_ORDER.forEach((name, x) => data.set(SWATCH_TEXELS[name], (y * size + x) * 4));
  return { name: 'swatches', width: size, height: size, data };
}

/** Our own attachment ids (spec §70: the original numbers must not be given meanings). */
export const ATTACHMENT_ID = { top: 1 } as const;

/** The tree has one socket, just above its tip, carried by the top bone. */
export const TREE_ATTACHMENTS: readonly Attachment[] = [{ id: ATTACHMENT_ID.top, name: 'top', bone: 2, position: [0, 0, TREE.upper.tipZ + 0.3] }];

/**
 * A small ornament to hang on a socket (P4.7): one square card, 1.2 wide, on a SPHERICAL BILLBOARD bone — it
 * always faces the camera. Unlit, opaque, one flat colour. A fixture, not a piece of the world.
 */
export const ORNAMENT = { halfSize: 0.6, colour: [255, 220, 80] } as const;
export const ORNAMENT_SKELETON: Skeleton = {
  bones: [
    { name: 'root', parent: NO_PARENT, pivot: [0, 0, 0] },
    { name: 'card', parent: 0, pivot: [0, 0, 0], billboard: 'spherical' },
  ],
};

export function buildOrnamentModel(): ModelMesh {
  const b = new ModelMeshBuilder(), h = ORNAMENT.halfSize, n = [0, -1, 0] as const, bone = [[1, 255]] as const;
  b.submesh(0, b.material(RENDER_FLAG.unlit, MODEL_BLEND.opaque));
  const v = [b.vertex([-h, 0, -h], n, [0, 1], bone), b.vertex([h, 0, -h], n, [1, 1], bone), b.vertex([h, 0, h], n, [1, 0], bone), b.vertex([-h, 0, h], n, [0, 0], bone)];
  b.triangle(v[0]!, v[1]!, v[2]!);
  b.triangle(v[0]!, v[2]!, v[3]!);
  return b.build('fixture-ornament', 2);
}

export function ornamentTexture(): ModelTexture {
  const data = new Uint8Array(4 * 4 * 4);
  for (let k = 0; k < 16; k++) data.set([...ORNAMENT.colour, 255], k * 4);
  return { name: 'ornament', width: 4, height: 4, data };
}

/**
 * Particle emitters of the tree (P4.8), both on the top bone, at the tip.
 * - 'sparkles': what one would look at — small golden sparks thrown upwards in a cone, falling back, additive.
 * - 'jet': a test pattern with NO randomness — one particle every 0.1 s straight along the bone's +z at
 *   2 units per second, living 1 s, no gravity, flat opaque-looking red squares of side 0.12. Its particles are
 *   therefore exactly 0.2 apart on a line, which a test can predict.
 */
export const TREE_PARTICLE_EMITTERS: Readonly<Record<'sparkles' | 'jet', ParticleEmitter>> = {
  sparkles: {
    name: 'sparkles', bone: 2, position: [0, 0, TREE.upper.tipZ], emissionRate: 40, lifespan: 1.6, emissionSpeed: 2.6, speedVariation: 0.35,
    verticalSpread: 0.5, horizontalSpread: Math.PI, areaLength: 0.3, areaWidth: 0.3, gravity: 3.2, size: [0.34, 0.08], colorStart: [1, 0.85, 0.35, 1], colorEnd: [1, 0.35, 0.05, 0], blend: 'add',
  },
  jet: {
    name: 'jet', bone: 2, position: [0, 0, TREE.upper.tipZ], emissionRate: 10, lifespan: 1, emissionSpeed: 2, speedVariation: 0,
    verticalSpread: 0, horizontalSpread: 0, areaLength: 0, areaWidth: 0, gravity: 0, size: [0.12, 0.12], colorStart: [1, 0.25, 0.125, 1], colorEnd: [1, 0.25, 0.125, 1], blend: 'alpha',
  },
};

/** Particle texture: 'soft' = a round white spot fading to transparent at its edge; 'solid' = plain opaque white. */
export function particleTexture(style: 'soft' | 'solid', size = 32): ModelTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
    const alpha = style === 'solid' ? 1 : Math.max(0, 1 - d) ** 2;
    data.set([255, 255, 255, Math.round(alpha * 255)], (y * size + x) * 4);
  }
  return { name: `particle-${style}`, width: size, height: size, data };
}

/**
 * Ribbon of the tree (P4.8b): a pale blue trail, 0.5 high, left by the tip of the tree as it sways — carried by
 * the top bone, 20 edges per second, each living 1.5 s. A fixture to see and test trails.
 */
export const TREE_RIBBON: RibbonEmitter = { name: 'tip-trail', bone: 2, position: [0, 0, TREE.upper.tipZ], heightAbove: 0.25, heightBelow: 0.25, edgesPerSecond: 20, edgeLifetime: 1.5, gravity: 0, color: [0.25, 0.625, 1, 1], blend: 'alpha' };

/** Ribbon texture, U along the trail: 'fade' = opaque white at the emitter fading to nothing at the tail; 'solid' = opaque white. */
export function ribbonTexture(style: 'fade' | 'solid', width = 32, height = 4): ModelTexture {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set([255, 255, 255, style === 'solid' ? 255 : Math.round(255 * (1 - x / (width - 1)))], (y * width + x) * 4);
  return { name: `ribbon-${style}`, width, height, data };
}
