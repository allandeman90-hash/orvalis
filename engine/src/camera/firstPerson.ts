/**
 * Fading the played character out as the camera closes in (P7.6, spec §194).
 *
 * FROM THE SPEC:
 * - the model does not pop out when zooming inward: it fades over a window of about 1.8315 yards;
 * - with D = cameraDistance − nearClip:  alpha = (1 − cos(π × D / 1.8315)) / 2, clamped;
 * - about 0.00278 yard and below, the character is completely hidden: first person.
 *
 * OUR CHOICES (the document does not settle them):
 * - beyond the window (D ≥ 1.8315) the character is fully opaque; at or below the threshold alpha is exactly 0
 *   and the character is not drawn at all;
 * - the distance used is the arm actually drawn (shortened by an obstacle or not);
 * - yards → engine units by `unitsPerYard` (default 1).
 */
export const FIRST_PERSON_FADE_YARDS = 1.8315;
export const FIRST_PERSON_HIDDEN_YARDS = 0.00278;

/** Opacity of the played character, 0..1, for a camera `cameraDistance` from its pivot. */
export function firstPersonAlpha(cameraDistance: number, nearClip: number, unitsPerYard = 1): number {
  if (!(cameraDistance >= 0) || !(nearClip >= 0) || !Number.isFinite(cameraDistance) || !Number.isFinite(nearClip)) throw new Error(`first person: the camera distance and the near clip must be finite and ≥ 0 (got ${cameraDistance}, ${nearClip})`);
  if (!(unitsPerYard > 0) || !Number.isFinite(unitsPerYard)) throw new Error(`first person: unitsPerYard must be finite and > 0 (got ${unitsPerYard})`);
  const d = (cameraDistance - nearClip) / unitsPerYard;
  if (d <= FIRST_PERSON_HIDDEN_YARDS) return 0;
  if (d >= FIRST_PERSON_FADE_YARDS) return 1;
  return (1 - Math.cos((Math.PI * d) / FIRST_PERSON_FADE_YARDS)) / 2;
}
