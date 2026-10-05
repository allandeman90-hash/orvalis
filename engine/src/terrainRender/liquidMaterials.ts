import type { LiquidType } from '../terrain';

/**
 * One MATERIAL BEHAVIOUR per liquid class (spec §26: « different liquid classes
 * use different render behavior, not merely different colors », « separate
 * queues/passes »).
 *
 * FROM THE SPEC:
 * - river, ocean: alpha blending, take part in lighting and fog;
 * - magma: effectively full-bright, opaque;
 * - slime: « handled differently » — the document gives no detail.
 * OUR CHOICES: every colour and alpha; fog applies to all four (the document
 * only states it for the river); slime is treated as a thick, lit, nearly
 * opaque blended liquid.
 * The colour is the base of the class's animated texture (liquidAnimation.ts).
 *
 * DEPTH RESPONSE (spec §24, §25, §42). The client builds static tables:
 *     ocean[i] = min(i / 255, 1)        river[i] = min(i / 42, 1)        alpha(i) = clamp(1.6 · (i / 63)⁸, 0, 1)
 * and the recommended shader combines them as
 *     f = min(depth / scale, 1)         alpha ·= clamp(1.6 · f⁸, 0, 1)
 * so shallow liquid stays transparent for a while, then turns opaque quickly; a river saturates about six
 * times faster than an ocean (255 / 42). Magma has « no standard depth LUT ».
 * OUR CHOICES: the document does not say what depth one table step stands for, so the two SCALES are ours, in
 * world units — the ocean is fully opaque from 8 units of depth, the river keeps the spec's ratio (8 × 42 / 255);
 * slime responds like a river; a material with depthScale 0 has no depth response.
 */
export interface LiquidMaterial {
  /** Colour before lighting, 0..1. */
  readonly color: readonly [number, number, number];
  /** Opacity of a blended liquid, 0..1. Ignored (1) when `blend` is 'opaque'. */
  readonly alpha: number;
  /** 'alpha': blended over what is behind, depth not written. 'opaque': replaces it and writes depth. */
  readonly blend: 'alpha' | 'opaque';
  /** false = full-bright: the day/night light does not touch it. */
  readonly lit: boolean;
  readonly fogged: boolean;
  /** Depth of liquid (world units) at which the depth factor reaches 1. 0 = no depth response. */
  readonly depthScale: number;
}

/** The spec's tables, as given (§24, §25). `i` is a table index. */
export const oceanDepthTable = (i: number): number => Math.min(i / 255, 1);
export const riverDepthTable = (i: number): number => Math.min(i / 42, 1);
export const liquidAlphaTable = (i: number): number => Math.min(1, Math.max(0, 1.6 * (i / 63) ** 8));

/** Depth of full ocean response, in world units (ours), and the river's, in the spec's ratio. */
export const OCEAN_DEPTH_SCALE = 8;
export const RIVER_DEPTH_SCALE = (OCEAN_DEPTH_SCALE * 42) / 255;

/**
 * The shader's depth response on the CPU: what multiplies the class alpha for a given depth of liquid.
 * Computed with squarings, exactly as the shader does.
 */
export function liquidDepthAlpha(depth: number, depthScale: number): number {
  if (!(depthScale > 0)) return 1;
  const f = Math.min(Math.max(0, depth) / depthScale, 1), f2 = f * f, f4 = f2 * f2;
  return Math.min(1, Math.max(0, 1.6 * f4 * f4));
}

export const LIQUID_MATERIALS: Readonly<Record<LiquidType, LiquidMaterial>> = {
  river: { color: [0.2, 0.46, 0.56], alpha: 0.6, blend: 'alpha', lit: true, fogged: true, depthScale: RIVER_DEPTH_SCALE },
  ocean: { color: [0.1, 0.3, 0.55], alpha: 0.75, blend: 'alpha', lit: true, fogged: true, depthScale: OCEAN_DEPTH_SCALE },
  magma: { color: [1, 0.38, 0.05], alpha: 1, blend: 'opaque', lit: false, fogged: true, depthScale: 0 },
  slime: { color: [0.35, 0.55, 0.12], alpha: 0.85, blend: 'alpha', lit: true, fogged: true, depthScale: RIVER_DEPTH_SCALE },
};

/**
 * Order of the liquid passes: opaque classes first (they write depth), then the blended ones.
 * Within each group, the class order of the spec (river, ocean, magma, slime).
 */
export const LIQUID_PASS_ORDER: readonly LiquidType[] = ['magma', 'river', 'ocean', 'slime'];

export function validateLiquidMaterials(materials: Readonly<Record<LiquidType, LiquidMaterial>>): void {
  for (const type of LIQUID_PASS_ORDER) {
    const m = materials[type];
    if (!m) throw new Error(`liquid materials: class "${type}" has no material`);
    if (m.color.length !== 3 || !m.color.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) throw new Error(`liquid materials: ${type}.color must be 3 numbers in 0..1`);
    if (!(m.alpha >= 0 && m.alpha <= 1)) throw new Error(`liquid materials: ${type}.alpha must be in 0..1 (got ${m.alpha})`);
    if (m.blend !== 'alpha' && m.blend !== 'opaque') throw new Error(`liquid materials: ${type}.blend must be 'alpha' or 'opaque'`);
    if (!(m.depthScale >= 0) || !Number.isFinite(m.depthScale)) throw new Error(`liquid materials: ${type}.depthScale must be a finite number ≥ 0 (got ${m.depthScale})`);
    if (m.blend === 'opaque' && m.depthScale !== 0) throw new Error(`liquid materials: ${type} is opaque, it cannot have a depth response (depthScale must be 0)`);
  }
  const firstBlended = LIQUID_PASS_ORDER.findIndex((t) => materials[t].blend === 'alpha');
  if (firstBlended >= 0 && LIQUID_PASS_ORDER.slice(firstBlended).some((t) => materials[t].blend === 'opaque')) throw new Error('liquid materials: opaque classes must come before blended ones in LIQUID_PASS_ORDER');
}

/**
 * What multiplies the liquid's texture: the light on a horizontal surface when the class is lit (1 when it is
 * full-bright), and the alpha of the class.
 */
export function liquidTint(material: LiquidMaterial, light: readonly [number, number, number]): [number, number, number, number] {
  const l = material.lit ? light : [1, 1, 1];
  return [l[0], l[1], l[2], material.blend === 'opaque' ? 1 : material.alpha];
}
