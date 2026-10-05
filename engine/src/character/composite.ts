import type { ModelTexture } from '../model';
import { CHARACTER_REGIONS, CHARACTER_TEXTURE_SIZE, type CharacterRegionName } from './textureLayout';

/**
 * The character's composite texture (spec §52–§54, §57).
 *
 * FROM THE SPEC:
 * - ONE 256 × 256 texture per character, assembled from source sections: base skin, face overlays, facial hair,
 *   hair, underwear, then equipment regions;
 * - source section types: 0 skin, 1 face, 2 facial hair, 3 hair, 4 underwear;
 * - the target is created lazily and only DIRTY regions are rebuilt — never the whole texture every frame;
 *   there are 10 dirty / rebuild groups;
 * - overlays are opaque, 1-bit alpha, or 4-level alpha (weights 0, 1/3, 2/3, 1);
 * - the destination is RGB565, with Floyd–Steinberg-style dithering; the practical variant the document
 *   allows — « store RGBA8 but deliberately quantize / dither during the bake » — is the one used here.
 *
 * OUR CHOICES (the document does not settle them):
 * - a source section covers exactly one region of CHARACTER_REGIONS and has that region's size;
 * - layer order inside a region: skin, face, underwear, facial hair, hair, then equipment layers 0..7;
 * - which regions make each of the 10 rebuild groups (CHARACTER_DIRTY_GROUPS);
 * - 1-bit alpha: a source texel replaces the destination when its alpha is ≥ 128;
 * - the dithering runs inside each region, left to right and top to bottom, and never spreads an error into a
 *   neighbouring region (so rebuilding one region gives the same texels as rebuilding everything);
 * - 5-6-5 values are expanded back to 8 bits by repeating their high bits.
 */
export const CHARACTER_SECTION_TYPE = { skin: 0, face: 1, facialHair: 2, hair: 3, underwear: 4 } as const;
export type CharacterSectionType = keyof typeof CHARACTER_SECTION_TYPE;
export const EQUIPMENT_TEXTURE_LAYERS = 8;

/** Layer slots of a region, in the order they are painted. */
export const CHARACTER_LAYER_ORDER = ['skin', 'face', 'underwear', 'facialHair', 'hair', 'equipment0', 'equipment1', 'equipment2', 'equipment3', 'equipment4', 'equipment5', 'equipment6', 'equipment7'] as const;
export type CharacterLayer = (typeof CHARACTER_LAYER_ORDER)[number];

export type SectionAlpha = 'opaque' | 'key' | 'blend4';

/** One source image, painted over one region. */
export interface CharacterSection {
  readonly name: string;
  readonly region: CharacterRegionName;
  /** RGBA, 8 bits per channel, region.width × region.height texels, row by row from the top. */
  readonly data: Uint8Array;
  readonly alpha: SectionAlpha;
}

/** The 10 rebuild groups and the regions each one covers. */
export const CHARACTER_DIRTY_GROUPS = {
  torso: ['torso'],
  head: ['head'],
  arms: ['leftArm', 'rightArm'],
  legs: ['leftLeg', 'rightLeg'],
  hands: ['leftHand', 'rightHand'],
  feet: ['leftFoot', 'rightFoot'],
  hair: ['hair'],
  facialHair: ['facialHair'],
  gloves: ['gloves'],
  boots: ['boots'],
} as const satisfies Record<string, readonly CharacterRegionName[]>;
export type CharacterDirtyGroup = keyof typeof CHARACTER_DIRTY_GROUPS;
export const CHARACTER_DIRTY_GROUP_NAMES = Object.keys(CHARACTER_DIRTY_GROUPS) as CharacterDirtyGroup[];

const GROUP_OF_REGION = new Map<CharacterRegionName, CharacterDirtyGroup>();
for (const group of CHARACTER_DIRTY_GROUP_NAMES) for (const region of CHARACTER_DIRTY_GROUPS[group]) GROUP_OF_REGION.set(region, group);

/** 0, 1/3, 2/3 or 1 — the 4 alpha levels of an overlay. */
export function quantizeAlpha4(alpha: number): number {
  return Math.round((alpha / 255) * 3) / 3;
}

/** 8-bit value → n-bit → back to 8 bits (high bits repeated). */
const to5 = (v: number): number => { const q = Math.max(0, Math.min(31, Math.round((v * 31) / 255))); return (q << 3) | (q >> 2); };
const to6 = (v: number): number => { const q = Math.max(0, Math.min(63, Math.round((v * 63) / 255))); return (q << 2) | (q >> 4); };

/**
 * Reduces an RGB image to 5-6-5 precision with Floyd–Steinberg error diffusion, in place (alpha is untouched).
 * @param rgba width × height texels, 4 bytes each
 */
export function ditherTo565(rgba: Uint8Array, width: number, height: number): void {
  // Running errors for the current and the next row, per channel.
  let current = new Float32Array((width + 2) * 3), next = new Float32Array((width + 2) * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const wanted = rgba[at + c]! + current[(x + 1) * 3 + c]!;
        const got = c === 1 ? to6(wanted) : to5(wanted), error = wanted - got;
        rgba[at + c] = got;
        current[(x + 2) * 3 + c] = current[(x + 2) * 3 + c]! + (error * 7) / 16;
        next[x * 3 + c] = next[x * 3 + c]! + (error * 3) / 16;
        next[(x + 1) * 3 + c] = next[(x + 1) * 3 + c]! + (error * 5) / 16;
        next[(x + 2) * 3 + c] = next[(x + 2) * 3 + c]! + error / 16;
      }
    }
    [current, next] = [next, current];
    next.fill(0);
  }
}

export interface CompositeOptions {
  /** Reduce to 5-6-5 with dithering (the period look). Default true. */
  readonly dither?: boolean;
}

export class CharacterComposite {
  readonly size = CHARACTER_TEXTURE_SIZE;
  private target: Uint8Array | null = null;
  private readonly layers = new Map<CharacterRegionName, Map<CharacterLayer, CharacterSection>>();
  private readonly dirty = new Set<CharacterDirtyGroup>();
  private readonly dither: boolean;
  /** Regions rebuilt since the composite was created — for tests and the overlay. */
  regionsRebuilt = 0;

  constructor(options: CompositeOptions = {}) {
    this.dither = options.dither ?? true;
  }

  /** Puts a section in a layer slot of its region (or removes it with null) and marks that region's group dirty. */
  setSection(layer: CharacterLayer, region: CharacterRegionName, section: CharacterSection | null): void {
    if (!CHARACTER_LAYER_ORDER.includes(layer)) throw new Error(`character texture: unknown layer "${String(layer)}"`);
    const rect = CHARACTER_REGIONS[region];
    if (!rect) throw new Error(`character texture: unknown region "${String(region)}"`);
    let slots = this.layers.get(region);
    if (section === null) {
      if (!slots?.delete(layer)) return; // nothing there: nothing changes
    } else {
      if (section.region !== region) throw new Error(`character texture: section "${section.name}" is made for region ${section.region}, not ${region}`);
      if (section.data.length !== rect.width * rect.height * 4) throw new Error(`character texture: section "${section.name}" must hold ${rect.width} × ${rect.height} texels (got ${section.data.length / 4})`);
      if (!slots) this.layers.set(region, (slots = new Map()));
      if (slots.get(layer) === section) return; // the very same section: nothing changes
      slots.set(layer, section);
    }
    this.dirty.add(GROUP_OF_REGION.get(region)!);
  }

  get dirtyGroups(): CharacterDirtyGroup[] {
    return CHARACTER_DIRTY_GROUP_NAMES.filter((group) => this.dirty.has(group));
  }

  /** The texels as last rebuilt (RGBA, row by row from the top), or null before the first rebuild. */
  get texels(): Uint8Array | null {
    return this.target;
  }

  /**
   * Rebuilds the dirty groups only (spec §53) and clears the dirty state.
   * @returns the groups that were rebuilt — empty when nothing was dirty (and then nothing was touched)
   */
  rebuild(): CharacterDirtyGroup[] {
    const groups = this.dirtyGroups;
    if (groups.length === 0 && this.target !== null) return [];
    if (this.target === null) {
      // Created lazily; everything has to be painted once.
      this.target = new Uint8Array(this.size * this.size * 4);
      for (const group of CHARACTER_DIRTY_GROUP_NAMES) this.dirty.add(group);
    }
    const rebuilt = this.dirtyGroups;
    for (const group of rebuilt) for (const region of CHARACTER_DIRTY_GROUPS[group]) this.paintRegion(region);
    this.dirty.clear();
    return rebuilt;
  }

  private paintRegion(region: CharacterRegionName): void {
    const rect = CHARACTER_REGIONS[region], pixels = new Uint8Array(rect.width * rect.height * 4);
    // A region nobody paints is opaque black.
    for (let k = 3; k < pixels.length; k += 4) pixels[k] = 255;
    const slots = this.layers.get(region);
    for (const layer of CHARACTER_LAYER_ORDER) {
      const section = slots?.get(layer);
      if (!section) continue;
      const src = section.data;
      for (let k = 0; k < pixels.length; k += 4) {
        const weight = section.alpha === 'opaque' ? 1 : section.alpha === 'key' ? (src[k + 3]! >= 128 ? 1 : 0) : quantizeAlpha4(src[k + 3]!);
        if (weight === 0) continue;
        for (let c = 0; c < 3; c++) pixels[k + c] = Math.round(pixels[k + c]! + (src[k + c]! - pixels[k + c]!) * weight);
      }
    }
    if (this.dither) ditherTo565(pixels, rect.width, rect.height);
    for (let y = 0; y < rect.height; y++) this.target!.set(pixels.subarray(y * rect.width * 4, (y + 1) * rect.width * 4), ((rect.y + y) * this.size + rect.x) * 4);
    this.regionsRebuilt++;
  }

  /** The composite as a model texture (the texels are shared, not copied). Rebuilds first if needed. */
  texture(name = 'character-composite'): ModelTexture {
    this.rebuild();
    return { name, width: this.size, height: this.size, data: this.target! };
  }
}
