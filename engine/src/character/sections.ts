import { type CharacterComposite, type CharacterSection } from './composite';
import { CHARACTER_REGIONS, type CharacterRegionName } from './textureLayout';

/**
 * ORIGINAL source sections for the mannequin, painted in code (P5.2): skin in three tones, two faces, hair in
 * three colours, underwear, leather. Low-frequency, flat-shaded on purpose (spec §52: « intentionally
 * low-frequency and hand-painted » source art) — placeholders that exercise the composite, not final art.
 *
 * Where things are on the head: the head's texture wraps around it, starting at the character's right side;
 * a quarter of the way along is the FRONT of the face, three quarters is the back. Up is up.
 */
export const SKIN_TONES = [[224, 172, 140], [190, 135, 100], [120, 82, 60]] as const;
export const HAIR_COLOURS = [[90, 60, 30], [200, 170, 90], [40, 35, 35]] as const;
export const UNDERWEAR_COLOUR = [60, 70, 95] as const;
export const LEATHER_COLOUR = [110, 80, 50] as const;
export const FACE_COUNT = 2;
/** Pupil colour of each face. */
export const EYE_COLOURS = [[30, 25, 25], [40, 90, 150]] as const;
export const EYE_WHITE = [235, 235, 230] as const;
export const MOUTH_COLOUR = [150, 70, 70] as const;

/** Where the face features are in the head region, in texels from its top left corner. */
export const FACE_LAYOUT = { eyeY: 30, eyeHeight: 4, leftEyeX: 21, rightEyeX: 37, eyeWidth: 6, pupilWidth: 2, browY: 26, mouthY: 47, mouthX: 27, mouthWidth: 10 } as const;

/** Deterministic value in 0..1 for an integer lattice point. */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth noise in 0..1 with features `cell` texels wide. */
function noise(x: number, y: number, cell: number, seed: number): number {
  const fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const top = hash(x0, y0, seed) * (1 - tx) + hash(x0 + 1, y0, seed) * tx, bottom = hash(x0, y0 + 1, seed) * (1 - tx) + hash(x0 + 1, y0 + 1, seed) * tx;
  return top * (1 - ty) + bottom * ty;
}

const cache = new Map<string, CharacterSection>();
/** Sections are built once per key: asking twice for the same one gives the very same object. */
function cached(key: string, region: CharacterRegionName, alpha: CharacterSection['alpha'], paint: (x: number, y: number, width: number, height: number) => readonly [number, number, number, number]): CharacterSection {
  let section = cache.get(key);
  if (!section) {
    const { width, height } = CHARACTER_REGIONS[region], data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(paint(x, y, width, height).map((v) => Math.max(0, Math.min(255, Math.round(v)))), (y * width + x) * 4);
    section = { name: key, region, data, alpha };
    cache.set(key, section);
  }
  return section;
}

/** A soft painted surface: the base colour, a little darker towards the bottom, with broad uneven patches. */
function painted(base: readonly number[], seed: number, strength = 14) {
  return (x: number, y: number, _width: number, height: number): [number, number, number, number] => {
    const shade = 1 - 0.1 * (y / height) + ((noise(x, y, 9, seed) - 0.5) * strength) / 128;
    return [base[0]! * shade, base[1]! * shade, base[2]! * shade, 255];
  };
}

export function skinSection(region: CharacterRegionName, tone: number): CharacterSection {
  const base = SKIN_TONES[tone];
  if (!base) throw new Error(`character sections: no skin tone ${tone}`);
  return cached(`skin-${tone}-${region}`, region, 'opaque', painted(base, 11));
}

export function hairSection(region: 'hair' | 'facialHair', colour: number): CharacterSection {
  const base = HAIR_COLOURS[colour];
  if (!base) throw new Error(`character sections: no hair colour ${colour}`);
  // Strands: the variation follows the columns much more than the rows.
  return cached(`hair-${colour}-${region}`, region, 'opaque', (x, y) => {
    const shade = 0.85 + 0.3 * noise(x, y * 0.15, 3, 23);
    return [base[0] * shade, base[1] * shade, base[2] * shade, 255];
  });
}

export function leatherSection(region: 'gloves' | 'boots'): CharacterSection {
  return cached(`leather-${region}`, region, 'opaque', painted(LEATHER_COLOUR, 31, 22));
}

/** Eyes, brows, nose shadow and mouth over the head's skin; transparent everywhere else. 4-level alpha. */
export function faceSection(face: number): CharacterSection {
  const pupil = EYE_COLOURS[face];
  if (!pupil) throw new Error(`character sections: no face ${face}`);
  const L = FACE_LAYOUT;
  return cached(`face-${face}`, 'head', 'blend4', (x, y) => {
    for (const eyeX of [L.leftEyeX, L.rightEyeX]) {
      if (x >= eyeX && x < eyeX + L.eyeWidth && y >= L.eyeY && y < L.eyeY + L.eyeHeight) {
        const inPupil = x >= eyeX + 2 && x < eyeX + 2 + L.pupilWidth;
        return inPupil ? [pupil[0], pupil[1], pupil[2], 255] : [EYE_WHITE[0], EYE_WHITE[1], EYE_WHITE[2], 255];
      }
      // Brows: the second face has thicker ones.
      if (x >= eyeX - 1 && x < eyeX + L.eyeWidth + 1 && y >= L.browY - (face === 1 ? 1 : 0) && y <= L.browY) return [45, 32, 22, 170];
    }
    if (x >= 31 && x <= 32 && y >= 36 && y <= 42) return [70, 40, 30, 85]; // nose shadow, a third
    if (x >= L.mouthX && x < L.mouthX + L.mouthWidth && y >= L.mouthY && y <= L.mouthY + 1) return [MOUTH_COLOUR[0], MOUTH_COLOUR[1], MOUTH_COLOUR[2], 255];
    return [0, 0, 0, 0];
  });
}

/** Shorts: a band around the hips (torso) and the top of each leg. 1-bit alpha. */
export function underwearSection(region: 'torso' | 'leftLeg' | 'rightLeg'): CharacterSection {
  return cached(`underwear-${region}`, region, 'key', (x, y, _width, height) => {
    const inBand = region === 'torso' ? y >= height * 0.76 : y < height * 0.16;
    const shade = 0.9 + 0.2 * noise(x, y, 7, 47);
    return inBand ? [UNDERWEAR_COLOUR[0] * shade, UNDERWEAR_COLOUR[1] * shade, UNDERWEAR_COLOUR[2] * shade, 255] : [0, 0, 0, 0];
  });
}

/** The texture choices of a character (spec §51: skinColor, faceType, hairColor). */
export interface CharacterSkin {
  /** 0..2 */
  readonly skinColor: number;
  /** 0..1 */
  readonly faceType: number;
  /** 0..2 */
  readonly hairColor: number;
  readonly underwear: boolean;
}
export const DEFAULT_SKIN: CharacterSkin = { skinColor: 0, faceType: 0, hairColor: 0, underwear: true };

const SKIN_REGIONS: readonly CharacterRegionName[] = ['torso', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'leftHand', 'rightHand', 'leftFoot', 'rightFoot'];

/**
 * Puts the sections of a look into a composite. Only what differs from what is already there becomes dirty:
 * changing the face alone marks the head group and nothing else.
 */
export function applyCharacterSkin(composite: CharacterComposite, skin: CharacterSkin): void {
  for (const region of SKIN_REGIONS) composite.setSection('skin', region, skinSection(region, skin.skinColor));
  composite.setSection('face', 'head', faceSection(skin.faceType));
  for (const region of ['torso', 'leftLeg', 'rightLeg'] as const) composite.setSection('underwear', region, skin.underwear ? underwearSection(region) : null);
  composite.setSection('hair', 'hair', hairSection('hair', skin.hairColor));
  composite.setSection('facialHair', 'facialHair', hairSection('facialHair', skin.hairColor));
  // The glove and boot sections of the model have their own regions: leather is their base colour.
  composite.setSection('skin', 'gloves', leatherSection('gloves'));
  composite.setSection('skin', 'boots', leatherSection('boots'));
}
