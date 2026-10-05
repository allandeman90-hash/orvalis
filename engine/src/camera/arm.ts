import { CAMERA_DISTANCE_MOVE_SPEED_YARDS } from './zoom';

/**
 * The camera's arm and what blocks it (P7.5, spec §192–§193).
 *
 * FROM THE SPEC:
 * - the wanted third-person position is traced from the pivot towards the requested camera position: a ray /
 *   segment test, not a large sphere;
 * - what can block it: terrain, the buildings' CAMERA collision faces (DETAIL kept, NOCAMCOLLIDE excluded), props,
 *   game objects, optionally a liquid surface;
 * - the asymmetry: an obstruction appears → the camera moves inward IMMEDIATELY; it clears → the camera returns
 *   outward SMOOTHLY (« snap in, ease out »).
 *
 * OUR CHOICES (the document does not settle them):
 * - the camera stops a small SKIN short of the obstacle (0.25 yard), so that its near plane does not cut into it;
 * - it never comes closer to the pivot than 0.2 yard because of an obstacle (the fade of the character at such
 *   distances is P7.6);
 * - the outward return uses the zoom's speed, 8.33 yards per second (the document gives no speed of its own);
 * - the blockers are given as one function, « how far along this ray is the first obstacle »: the scene decides
 *   what it asks (here the buildings' camera faces and the ground slab; terrain, props and liquids later).
 */
export const CAMERA_COLLISION_SKIN_YARDS = 0.25;
export const CAMERA_COLLISION_MIN_DISTANCE_YARDS = 0.2;
export const CAMERA_EASE_OUT_SPEED_YARDS = CAMERA_DISTANCE_MOVE_SPEED_YARDS;

/** Distance from `origin` along the unit `direction` to the first obstacle within `maxDistance`, or null. */
export type CameraObstacleQuery = (origin: readonly [number, number, number], direction: readonly [number, number, number], maxDistance: number) => number | null;

export interface CameraArmState {
  /** Length of the arm now: what the camera is drawn with. */
  readonly distance: number;
  /** The length the zoom asks for. */
  readonly wanted: number;
  /** Something is between the pivot and the wanted position. */
  readonly blocked: boolean;
  /** Distance from the pivot to that obstacle; undefined when not blocked. */
  readonly obstacleDistance?: number | undefined;
}

export class CameraArm {
  private current: number | null = null;
  private last: CameraArmState = { distance: 0, wanted: 0, blocked: false };
  readonly skin: number;
  readonly minDistance: number;
  /** Units per second. */
  readonly easeOutSpeed: number;

  constructor(unitsPerYard = 1) {
    if (!(unitsPerYard > 0) || !Number.isFinite(unitsPerYard)) throw new Error(`camera arm: unitsPerYard must be finite and > 0 (got ${unitsPerYard})`);
    this.skin = CAMERA_COLLISION_SKIN_YARDS * unitsPerYard;
    this.minDistance = CAMERA_COLLISION_MIN_DISTANCE_YARDS * unitsPerYard;
    this.easeOutSpeed = CAMERA_EASE_OUT_SPEED_YARDS * unitsPerYard;
  }

  get state(): CameraArmState {
    return this.last;
  }

  /**
   * One frame.
   * @param wanted the arm's length the zoom asks for
   * @param obstacleDistance distance from the pivot to the first obstacle along the arm, or null when it is free
   * @returns the arm's length to draw with
   */
  update(wanted: number, obstacleDistance: number | null, dtMs: number): number {
    if (!(wanted >= 0) || !Number.isFinite(wanted)) throw new Error(`camera arm: the wanted distance must be finite and ≥ 0 (got ${wanted})`);
    if (!(dtMs >= 0)) throw new Error(`camera arm: the time step must be ≥ 0 (got ${dtMs})`);
    if (obstacleDistance !== null && !(obstacleDistance >= 0)) throw new Error(`camera arm: the obstacle distance must be ≥ 0 (got ${obstacleDistance})`);
    const blocked = obstacleDistance !== null && obstacleDistance - this.skin < wanted;
    // The longest arm allowed now; an obstacle never pushes the camera farther than the zoom wants.
    const allowed = blocked ? Math.min(wanted, Math.max(this.minDistance, obstacleDistance - this.skin)) : wanted;
    if (this.current === null || allowed <= this.current) this.current = allowed; // snap in (and follow the zoom inwards)
    else this.current = Math.min(allowed, this.current + (this.easeOutSpeed * dtMs) / 1000); // ease out
    this.last = { distance: this.current, wanted, blocked, ...(blocked ? { obstacleDistance: obstacleDistance } : {}) };
    return this.current;
  }
}
