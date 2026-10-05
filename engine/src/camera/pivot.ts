/**
 * The camera's pivot height follows the model being played (P7.4, spec §191).
 *
 * FROM THE SPEC:
 * - the camera's target height is tied to the active model, not one universal constant;
 * - it is clamped to about 5/6 yard at the least and 15 yards at the most;
 * - when it changes (another race, a mount, a shape change) it moves smoothly, at about 1.2 yards per second.
 *
 * OUR CHOICES (the document does not settle them):
 * - HOW the height is derived from a model: a fixed share (0.9) of the model's height above its feet, scale
 *   included — about eye level for an upright figure. The document gives the clamp and the speed, not the rule;
 * - the very first target is taken at once; the movement is linear;
 * - yards → engine units by `unitsPerYard` (default 1).
 */
export const CAMERA_PIVOT_MIN_YARDS = 5 / 6;
export const CAMERA_PIVOT_MAX_YARDS = 15;
export const CAMERA_PIVOT_MOVE_SPEED_YARDS = 1.2;
export const CAMERA_PIVOT_HEIGHT_RATIO = 0.9;

/** The pivot height for a model of that height (feet to top, in engine units, scale included), clamped. */
export function pivotHeightForModel(modelHeight: number, unitsPerYard = 1, ratio = CAMERA_PIVOT_HEIGHT_RATIO): number {
  if (!(modelHeight >= 0) || !Number.isFinite(modelHeight)) throw new Error(`camera pivot: the model height must be finite and ≥ 0 (got ${modelHeight})`);
  if (!(unitsPerYard > 0) || !Number.isFinite(unitsPerYard) || !(ratio > 0) || !Number.isFinite(ratio)) throw new Error('camera pivot: unitsPerYard and the ratio must be finite and > 0');
  return Math.min(CAMERA_PIVOT_MAX_YARDS * unitsPerYard, Math.max(CAMERA_PIVOT_MIN_YARDS * unitsPerYard, modelHeight * ratio));
}

export class CameraPivot {
  private target: number | null = null;
  private actual = 0;
  /** Units per second. */
  readonly moveSpeed: number;

  constructor(private readonly unitsPerYard = 1) {
    if (!(unitsPerYard > 0) || !Number.isFinite(unitsPerYard)) throw new Error(`camera pivot: unitsPerYard must be finite and > 0 (got ${unitsPerYard})`);
    this.moveSpeed = CAMERA_PIVOT_MOVE_SPEED_YARDS * unitsPerYard;
  }

  /** The height the pivot is at now. */
  get height(): number {
    return this.actual;
  }

  /** The height it is heading for. */
  get targetHeight(): number {
    return this.target ?? this.actual;
  }

  /** The model changed: its height (feet to top, scale included). The first call places the pivot at once. */
  setModelHeight(modelHeight: number): void {
    const height = pivotHeightForModel(modelHeight, this.unitsPerYard);
    if (this.target === null) this.actual = height;
    this.target = height;
  }

  /** Moves the pivot towards its target at the move speed. Returns the height now. */
  update(dtMs: number): number {
    if (!(dtMs >= 0)) throw new Error(`camera pivot: the time step must be ≥ 0 (got ${dtMs})`);
    if (this.target === null) return this.actual;
    const reach = (this.moveSpeed * dtMs) / 1000, gap = this.target - this.actual;
    this.actual = Math.abs(gap) <= reach ? this.target : this.actual + Math.sign(gap) * reach;
    return this.actual;
  }
}
