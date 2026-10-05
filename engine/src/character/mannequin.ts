import { addLoft, type LoftRing, loftRing, type LoftShape, MODEL_BLEND, type ModelMesh, ModelMeshBuilder, type ModelTexture, NO_PARENT, type Skeleton } from '../model';
import { BODY_GEOSET, GEOSET_GROUP, geosetId } from './geosets';
import { CHARACTER_REGION_NAMES, CHARACTER_REGIONS, CHARACTER_TEXTURE_SIZE, type CharacterRegionName } from './textureLayout';

/**
 * An ORIGINAL low-poly humanoid mannequin, built in code (P5.1): the base model of the character pipeline —
 * one body, plus optional sections switched by geoset id. Still a fixture to build and test the character
 * systems, NOT a final character (no face, no fingers, 16 bones — the document's target for a real rig is 80–100).
 *
 * Shape: every part is a « loft » — a stack of elliptical rings joined by smooth surfaces (tapered limbs, a torso
 * that narrows at the waist and widens at the shoulders, an egg-shaped head, feet that point forward). Joints
 * (waist, neck, elbows, knees) are rings shared half and half between two bones, so they bend smoothly.
 *
 * Model space: z up, the character FACES +y (the engine's forward), its right hand is at +x. About 1.85 tall,
 * feet on z = 0.
 *
 * Sections:
 *   geoset 0                 body: torso and neck, head, arms, legs
 *   hair        (group 0)    1 = short cap · 2 = cap + long hair behind the neck · 3 = crest
 *   facial hair (group 1)    1 = none (no section) · 2 = beard
 *   gloves      (group 4)    1 = bare hands · 2 = gloves with cuffs
 *   boots       (group 5)    1 = bare feet · 2 = boots with shafts
 *
 * Texture: each part is mapped onto its own rectangle of the 256 × 256 character texture (CHARACTER_REGIONS).
 */
export const MANNEQUIN_BONE = {
  root: 0, pelvis: 1, chest: 2, head: 3,
  leftUpperArm: 4, leftForearm: 5, leftHand: 6, rightUpperArm: 7, rightForearm: 8, rightHand: 9,
  leftThigh: 10, leftShin: 11, leftFoot: 12, rightThigh: 13, rightShin: 14, rightFoot: 15,
} as const;

const LEG_X = 0.09;

export const MANNEQUIN_SKELETON: Skeleton = {
  bones: [
    { name: 'root', parent: NO_PARENT, pivot: [0, 0, 0] },
    { name: 'pelvis', parent: 0, pivot: [0, 0, 1.0] },
    { name: 'chest', parent: 1, pivot: [0, 0, 1.12] },
    { name: 'head', parent: 2, pivot: [0, 0, 1.56] },
    { name: 'leftUpperArm', parent: 2, pivot: [-0.2, 0, 1.43] },
    { name: 'leftForearm', parent: 4, pivot: [-0.23, 0, 1.2] },
    { name: 'leftHand', parent: 5, pivot: [-0.262, 0, 0.93] },
    { name: 'rightUpperArm', parent: 2, pivot: [0.2, 0, 1.43] },
    { name: 'rightForearm', parent: 7, pivot: [0.23, 0, 1.2] },
    { name: 'rightHand', parent: 8, pivot: [0.262, 0, 0.93] },
    { name: 'leftThigh', parent: 1, pivot: [-LEG_X, 0, 0.95] },
    { name: 'leftShin', parent: 10, pivot: [-LEG_X, 0, 0.5] },
    { name: 'leftFoot', parent: 11, pivot: [-LEG_X, 0, 0.1] },
    { name: 'rightThigh', parent: 1, pivot: [LEG_X, 0, 0.95] },
    { name: 'rightShin', parent: 13, pivot: [LEG_X, 0, 0.5] },
    { name: 'rightFoot', parent: 14, pivot: [LEG_X, 0, 0.1] },
  ],
};

/** A loft of the mannequin, unwrapped into one region of the character texture. */
export interface Loft extends LoftShape {
  readonly region: CharacterRegionName;
}

const ring = loftRing;
const B = MANNEQUIN_BONE;
const one = (bone: number): [number, number] => [bone, 255];
const half = (a: number, b: number): Array<[number, number]> => [[a, 128], [b, 127]];

/** A limb on both sides: `make(sign, bones)` with sign −1 for the left (−x) and +1 for the right. */
const bothSides = (name: string, regions: readonly [CharacterRegionName, CharacterRegionName], sides: number, make: (x: number, left: boolean) => LoftRing[], extra: Partial<Loft> = {}): Loft[] => [
  { name: `left ${name}`, region: regions[0], sides, rings: make(-1, true), ...extra },
  { name: `right ${name}`, region: regions[1], sides, rings: make(1, false), ...extra },
];

/** The arm hangs slightly away from the body: x of its centre line at height z (shoulder 0.2 → wrist 0.262). */
export const armX = (z: number): number => 0.262 - Math.max(0, Math.min(1, (z - 0.93) / (1.45 - 0.93))) * 0.062;

const arm = (s: number, left: boolean): LoftRing[] => {
  const upper = left ? B.leftUpperArm : B.rightUpperArm, fore = left ? B.leftForearm : B.rightForearm;
  const at = (z: number, ru: number, rv: number, ...influences: Array<readonly [number, number]>): LoftRing => ring(s * armX(z), 0, z, ru, rv, ...influences);
  return [
    at(0.93, 0.03, 0.034, one(fore)),
    at(1.02, 0.04, 0.043, one(fore)),
    at(1.12, 0.047, 0.05, one(fore)),
    at(1.2, 0.043, 0.046, ...half(upper, fore)),
    at(1.31, 0.054, 0.058, one(upper)),
    at(1.4, 0.062, 0.066, one(upper)), // shoulder muscle
    at(1.44, 0.034, 0.04, one(upper)), // tucked into the shoulder of the torso
  ];
};
const leg = (s: number, left: boolean): LoftRing[] => {
  const thigh = left ? B.leftThigh : B.rightThigh, shin = left ? B.leftShin : B.rightShin, x = s * LEG_X;
  return [
    ring(x, 0, 0.08, 0.04, 0.043, one(shin)),
    ring(x, -0.004, 0.2, 0.047, 0.052, one(shin)),
    ring(x, -0.012, 0.36, 0.062, 0.07, one(shin)), // calf
    ring(x, 0, 0.5, 0.056, 0.06, ...half(thigh, shin)), // knee
    ring(x, 0, 0.66, 0.076, 0.084, one(thigh)),
    ring(x, 0, 0.84, 0.09, 0.098, one(thigh)),
    ring(s * 0.085, 0, 0.97, 0.075, 0.085, one(thigh)), // inside the hips
  ];
};
const hand = (grow: number) => (s: number, left: boolean): LoftRing[] => {
  const bone = left ? B.leftHand : B.rightHand, x = s * armX(0.93);
  return [ring(x, 0.005, 0.76, 0.012 + grow, 0.028 + grow, one(bone)), ring(x, 0.005, 0.82, 0.022 + grow, 0.046 + grow, one(bone)), ring(x, 0, 0.88, 0.026 + grow, 0.048 + grow, one(bone)), ring(x, 0, 0.935, 0.03 + grow, 0.035 + grow, one(bone))];
};
/** A foot is a loft along +y (heel to toes): its rings stand in the z–x plane. */
const foot = (grow: number) => (s: number, left: boolean): LoftRing[] => {
  const bone = left ? B.leftFoot : B.rightFoot, x = s * LEG_X;
  // Each ring's centre is one vertical radius above the ground: the sole is flat on z = 0.
  const sole = (y: number, rz: number, rx: number): LoftRing => ring(x, y, rz + grow, rz + grow, rx + grow, one(bone));
  return [sole(-0.07, 0.035, 0.036), sole(-0.03, 0.05, 0.044), sole(0.05, 0.05, 0.048), sole(0.13, 0.034, 0.05), sole(0.185, 0.02, 0.036)];
};
const ALONG_Y = { u: [0, 0, 1], v: [1, 0, 0] } as const;
const cuff = (s: number, left: boolean): LoftRing[] => {
  const bone = left ? B.leftForearm : B.rightForearm;
  return [ring(s * armX(0.93), 0, 0.93, 0.055, 0.057, one(bone)), ring(s * armX(1.06), 0, 1.06, 0.07, 0.072, one(bone))];
};
const shaft = (s: number, left: boolean): LoftRing[] => {
  const bone = left ? B.leftShin : B.rightShin, x = s * LEG_X;
  return [ring(x, 0, 0.1, 0.07, 0.074, one(bone)), ring(x, -0.008, 0.4, 0.085, 0.092, one(bone))];
};
const HEAD_Y = 0.012;
const HAIR_CAP: Loft = {
  // Closed underneath: seen from below, the rim between the hair and the head must not be see-through.
  name: 'hair cap', region: 'hair', sides: 12,
  rings: [ring(0, HEAD_Y, 1.71, 0.125, 0.135, one(B.head)), ring(0, HEAD_Y, 1.78, 0.118, 0.128, one(B.head)), ring(0, HEAD_Y, 1.84, 0.082, 0.092, one(B.head)), ring(0, HEAD_Y, 1.87, 0.025, 0.03, one(B.head))],
};

/** Every part of the mannequin, by section. The geometry is entirely described here. */
export const MANNEQUIN_SECTIONS: ReadonlyArray<{ readonly geosetId: number; readonly name: string; readonly lofts: readonly Loft[] }> = [
  {
    geosetId: BODY_GEOSET,
    name: 'body',
    lofts: [
      {
        name: 'torso', region: 'torso', sides: 12,
        rings: [
          ring(0, 0, 0.86, 0.06, 0.07, one(B.pelvis)), // crotch
          ring(0, -0.008, 0.93, 0.165, 0.115, one(B.pelvis)),
          ring(0, -0.01, 1.0, 0.18, 0.122, one(B.pelvis)), // hips
          ring(0, 0, 1.12, 0.145, 0.1, ...half(B.pelvis, B.chest)), // waist
          ring(0, 0.005, 1.24, 0.165, 0.115, one(B.chest)),
          ring(0, 0.008, 1.34, 0.185, 0.128, one(B.chest)), // chest
          ring(0, 0, 1.43, 0.2, 0.105, one(B.chest)), // shoulders
          ring(0, 0, 1.475, 0.12, 0.08, one(B.chest)),
          ring(0, 0, 1.51, 0.062, 0.062, one(B.chest)), // neck
          ring(0, 0.004, 1.56, 0.055, 0.058, ...half(B.chest, B.head)),
        ],
      },
      {
        name: 'head', region: 'head', sides: 12,
        rings: [
          ring(0, 0.006, 1.545, 0.05, 0.055, one(B.head)),
          ring(0, 0.018, 1.585, 0.076, 0.09, one(B.head)), // jaw
          ring(0, HEAD_Y, 1.635, 0.098, 0.108, one(B.head)),
          ring(0, HEAD_Y, 1.7, 0.105, 0.115, one(B.head)),
          ring(0, HEAD_Y, 1.77, 0.098, 0.108, one(B.head)),
          ring(0, HEAD_Y, 1.82, 0.066, 0.076, one(B.head)),
          ring(0, HEAD_Y, 1.845, 0.02, 0.025, one(B.head)),
        ],
      },
      ...bothSides('arm', ['leftArm', 'rightArm'], 8, arm),
      ...bothSides('leg', ['leftLeg', 'rightLeg'], 8, leg),
    ],
  },
  { geosetId: geosetId(GEOSET_GROUP.hair, 1), name: 'hair: short', lofts: [HAIR_CAP] },
  {
    geosetId: geosetId(GEOSET_GROUP.hair, 2),
    name: 'hair: long',
    lofts: [HAIR_CAP, { name: 'long hair', region: 'hair', sides: 8, rings: [ring(0, -0.1, 1.42, 0.085, 0.03, one(B.head)), ring(0, -0.105, 1.58, 0.11, 0.042, one(B.head)), ring(0, -0.095, 1.74, 0.105, 0.045, one(B.head))] }],
  },
  {
    geosetId: geosetId(GEOSET_GROUP.hair, 3),
    name: 'hair: crest',
    lofts: [{ name: 'crest', region: 'hair', sides: 6, rings: [ring(0, HEAD_Y, 1.82, 0.018, 0.1, one(B.head)), ring(0, HEAD_Y, 1.92, 0.015, 0.085, one(B.head)), ring(0, 0, 1.965, 0.006, 0.04, one(B.head))] }],
  },
  {
    geosetId: geosetId(GEOSET_GROUP.facialHair, 2),
    name: 'facial hair: beard',
    lofts: [{ name: 'beard', region: 'facialHair', sides: 8, rings: [ring(0, 0.085, 1.53, 0.035, 0.03, one(B.head)), ring(0, 0.1, 1.585, 0.062, 0.045, one(B.head)), ring(0, 0.1, 1.64, 0.07, 0.036, one(B.head))] }],
  },
  { geosetId: geosetId(GEOSET_GROUP.gloves, 1), name: 'hands: bare', lofts: bothSides('hand', ['leftHand', 'rightHand'], 6, hand(0)) },
  { geosetId: geosetId(GEOSET_GROUP.gloves, 2), name: 'hands: gloves', lofts: [...bothSides('glove', ['gloves', 'gloves'], 6, hand(0.008)), ...bothSides('cuff', ['gloves', 'gloves'], 8, cuff)] },
  { geosetId: geosetId(GEOSET_GROUP.boots, 1), name: 'feet: bare', lofts: bothSides('foot', ['leftFoot', 'rightFoot'], 6, foot(0), ALONG_Y) },
  { geosetId: geosetId(GEOSET_GROUP.boots, 2), name: 'feet: boots', lofts: [...bothSides('boot', ['boots', 'boots'], 6, foot(0.014), ALONG_Y), ...bothSides('boot shaft', ['boots', 'boots'], 8, shaft)] },
];

export function buildMannequinModel(): ModelMesh {
  const b = new ModelMeshBuilder();
  const material = b.material(0, MODEL_BLEND.opaque);
  for (const section of MANNEQUIN_SECTIONS) {
    b.submesh(section.geosetId, material);
    for (const loft of section.lofts) addLoft(b, loft, { ...CHARACTER_REGIONS[loft.region], textureSize: CHARACTER_TEXTURE_SIZE });
  }
  return b.build('fixture-mannequin', MANNEQUIN_SKELETON.bones.length);
}

export const MANNEQUIN_COLOURS = { skin: [224, 172, 140], hair: [90, 60, 30], leather: [110, 80, 50] } as const;
const REGION_COLOUR: Readonly<Record<CharacterRegionName, keyof typeof MANNEQUIN_COLOURS>> = {
  torso: 'skin', head: 'skin', leftArm: 'skin', rightArm: 'skin', leftLeg: 'skin', rightLeg: 'skin', leftHand: 'skin', rightHand: 'skin', leftFoot: 'skin', rightFoot: 'skin',
  hair: 'hair', facialHair: 'hair', gloves: 'leather', boots: 'leather',
};

/** The plain 256 × 256 texture of the mannequin: every region filled with one flat colour (skin, hair or leather). */
export function mannequinTexture(): ModelTexture {
  const size = CHARACTER_TEXTURE_SIZE, data = new Uint8Array(size * size * 4);
  for (let k = 0; k < size * size; k++) data.set([...MANNEQUIN_COLOURS.skin, 255], k * 4);
  for (const name of CHARACTER_REGION_NAMES) {
    const r = CHARACTER_REGIONS[name], colour = MANNEQUIN_COLOURS[REGION_COLOUR[name]];
    for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) data.set([...colour, 255], (y * size + x) * 4);
  }
  return { name: 'mannequin', width: size, height: size, data };
}
