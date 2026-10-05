/**
 * Where each part of a character lies in its 256 × 256 texture (spec §52: one small composite per character).
 * The document gives the size, not the layout: the rectangles below are OUR CHOICE. Texel units, origin top left.
 */
export const CHARACTER_TEXTURE_SIZE = 256;

export interface TextureRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const CHARACTER_REGIONS = {
  torso: { x: 0, y: 0, width: 128, height: 96 },
  head: { x: 128, y: 0, width: 128, height: 64 },
  leftArm: { x: 0, y: 96, width: 64, height: 96 },
  rightArm: { x: 64, y: 96, width: 64, height: 96 },
  leftLeg: { x: 128, y: 64, width: 64, height: 128 },
  rightLeg: { x: 192, y: 64, width: 64, height: 128 },
  leftHand: { x: 0, y: 192, width: 32, height: 32 },
  rightHand: { x: 32, y: 192, width: 32, height: 32 },
  leftFoot: { x: 64, y: 192, width: 32, height: 32 },
  rightFoot: { x: 96, y: 192, width: 32, height: 32 },
  hair: { x: 0, y: 224, width: 64, height: 32 },
  facialHair: { x: 64, y: 224, width: 32, height: 32 },
  gloves: { x: 96, y: 224, width: 32, height: 32 },
  boots: { x: 128, y: 192, width: 64, height: 64 },
} as const satisfies Record<string, TextureRegion>;
export type CharacterRegionName = keyof typeof CHARACTER_REGIONS;
export const CHARACTER_REGION_NAMES = Object.keys(CHARACTER_REGIONS) as CharacterRegionName[];
