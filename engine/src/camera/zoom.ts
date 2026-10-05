/**
 * The gameplay camera's zoom (P7.2, spec §187).
 *
 * FROM THE SPEC:
 * - cameraDistanceMax = 15 yards, cameraDistanceMaxFactor = 1.0, and an absolute cap of 50 yards;
 * - the mouse wheel works in 1-yard increments;
 * - the ACTUAL distance moves towards the REQUESTED one instead of jumping, at about 8.33 yards per second.
 *
 * OUR CHOICES (the document does not settle them):
 * - the largest distance is min(cameraDistanceMax × factor, 50);
 * - the smallest is 0: the camera goes all the way to the pivot — first person (the character fades out, P7.6);
 * - one wheel event is one step, whatever its delta; wheel forwards (negative deltaY) zooms in;
 * - yards → engine units by `unitsPerYard` (default 1).
 */
export const CAMERA_DISTANCE_MAX_YARDS = 15;
export const CAMERA_DISTANCE_MAX_FACTOR = 1;
export const CAMERA_DISTANCE_HARD_CAP_YARDS = 50;
export const CAMERA_ZOOM_STEP_YARDS = 1;
export const CAMERA_DISTANCE_MOVE_SPEED_YARDS = 8.33;
export const CAMERA_DISTANCE_MIN_YARDS = 0;

export interface CameraZoomOptions {
  /** Starting distance, requested and actual (clamped to the limits). Default: the largest. */
  readonly distance?: number | undefined;
  readonly distanceMaxYards?: number | undefined;
  readonly distanceMaxFactor?: number | undefined;
  readonly moveSpeedYards?: number | undefined;
  readonly unitsPerYard?: number | undefined;
}

export class CameraZoom {
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly step: number;
  /** Units per second. */
  readonly moveSpeed: number;
  private requested: number;
  private actual: number;

  constructor(options: CameraZoomOptions = {}) {
    const unitsPerYard = options.unitsPerYard ?? 1, maxYards = options.distanceMaxYards ?? CAMERA_DISTANCE_MAX_YARDS, factor = options.distanceMaxFactor ?? CAMERA_DISTANCE_MAX_FACTOR, speed = options.moveSpeedYards ?? CAMERA_DISTANCE_MOVE_SPEED_YARDS;
    if (![unitsPerYard, maxYards, factor, speed].every((v) => v > 0 && Number.isFinite(v))) throw new Error('camera zoom: unitsPerYard, the maximum distance, its factor and the move speed must be finite and > 0');
    this.minDistance = CAMERA_DISTANCE_MIN_YARDS * unitsPerYard;
    this.maxDistance = Math.max(this.minDistance, Math.min(maxYards * factor, CAMERA_DISTANCE_HARD_CAP_YARDS) * unitsPerYard);
    this.step = CAMERA_ZOOM_STEP_YARDS * unitsPerYard;
    this.moveSpeed = speed * unitsPerYard;
    if (options.distance !== undefined && !Number.isFinite(options.distance)) throw new Error(`camera zoom: the distance must be finite (got ${options.distance})`);
    this.requested = this.actual = this.clamp(options.distance ?? this.maxDistance);
  }

  private clamp(distance: number): number {
    return Math.min(this.maxDistance, Math.max(this.minDistance, distance));
  }

  get requestedDistance(): number {
    return this.requested;
  }

  get actualDistance(): number {
    return this.actual;
  }

  /** Moves the REQUESTED distance by whole steps: positive = farther. The actual distance follows in update(). */
  zoomBy(steps: number): void {
    if (!Number.isFinite(steps)) throw new Error(`camera zoom: steps must be finite (got ${steps})`);
    this.requested = this.clamp(this.requested + steps * this.step);
  }

  /** One mouse-wheel event: forwards (deltaY < 0) = one step closer, backwards = one step farther. */
  wheel(deltaY: number): void {
    if (deltaY !== 0) this.zoomBy(Math.sign(deltaY));
  }

  /** Moves the actual distance towards the requested one, at the move speed. Returns the actual distance. */
  update(dtMs: number): number {
    if (!(dtMs >= 0)) throw new Error(`camera zoom: the time step must be ≥ 0 (got ${dtMs})`);
    const reach = (this.moveSpeed * dtMs) / 1000, gap = this.requested - this.actual;
    this.actual = Math.abs(gap) <= reach ? this.requested : this.actual + Math.sign(gap) * reach;
    return this.actual;
  }
}
