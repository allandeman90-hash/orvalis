/**
 * Distance fade of world models by size (spec §94, §95).
 *
 * FROM THE SPEC (exact constants recovered from the original client):
 *   d = horizontalDistance(camera.xy, boundingSphereCenter.xy) − boundingRadius      (height is ignored)
 *   radius ≤ 0.5        fade from 40 to 50
 *   radius ≤ 2.5        fade from 100 to 125
 *   radius ≤ 7.0        fade from 150 to 200
 *   radius > 7.0        no size fade (the far clip alone hides it)
 *   fade = clamp(1 − (d − fadeStart) / fadeRange, 0, 1)
 * The fade flows into the model's alpha; for cutout surfaces the alpha test becomes
 * textureAlpha × fade ≥ 224 / 255, so their low-alpha edges go first.
 *
 * OUR CHOICE: the document's lengths are yards. How many engine units make a yard is NOT decided here: it is a
 * parameter (`unitsPerYard`), 1 by default, applied to both the radius and the distance.
 */
export interface ModelFadeBucket {
  /** Largest bounding-sphere radius of the bucket, in yards. */
  readonly maxRadius: number;
  readonly fadeStart: number;
  readonly fadeRange: number;
}

export const MODEL_FADE_BUCKETS: readonly ModelFadeBucket[] = [
  { maxRadius: 0.5, fadeStart: 40, fadeRange: 10 },
  { maxRadius: 2.5, fadeStart: 100, fadeRange: 25 },
  { maxRadius: 7.0, fadeStart: 150, fadeRange: 50 },
];

export const DEFAULT_UNITS_PER_YARD = 1;

/** The bucket of a model of that radius (yards), or null when it is too big to fade by size. */
export function modelFadeBucket(radiusYards: number): ModelFadeBucket | null {
  if (!(radiusYards >= 0) || !Number.isFinite(radiusYards)) throw new Error(`distance fade: radius must be finite and ≥ 0 (got ${radiusYards})`);
  return MODEL_FADE_BUCKETS.find((bucket) => radiusYards <= bucket.maxRadius) ?? null;
}

/**
 * 1 = fully visible, 0 = gone.
 * @param camera, center world positions (only x and y are used)
 * @param radius world-space radius of the model's bounding sphere, in engine units
 */
export function modelDistanceFade(camera: ArrayLike<number>, center: ArrayLike<number>, radius: number, unitsPerYard = DEFAULT_UNITS_PER_YARD): number {
  if (!(unitsPerYard > 0) || !Number.isFinite(unitsPerYard)) throw new Error(`distance fade: unitsPerYard must be finite and > 0 (got ${unitsPerYard})`);
  const bucket = modelFadeBucket(radius / unitsPerYard);
  if (!bucket) return 1;
  const d = (Math.hypot(camera[0]! - center[0]!, camera[1]! - center[1]!) - radius) / unitsPerYard;
  return Math.min(1, Math.max(0, 1 - (d - bucket.fadeStart) / bucket.fadeRange));
}
