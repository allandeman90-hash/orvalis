/**
 * The camera coming back behind the character (P7.7, spec §190).
 *
 * FROM THE SPEC:
 * - three modes: 0 Never, 1 Smart (the default that matters), 2 Always;
 * - the recentring is smoothed, not snapped, with the easing e(t) = (1 − cos(π·t)) / 2;
 * - its timing is bounded: roughly 0.1 s to 2.0 s.
 *
 * OUR CHOICES (the document does not settle them):
 * - « recentring » turns the camera's YAW to the heading the character faces, by the shortest way; the pitch is
 *   left alone;
 * - WHEN: never while a mouse button is turning the camera. Always = whenever the two headings differ. Smart =
 *   only while the character is MOVING (standing still, the player may look around freely);
 * - HOW LONG: in proportion to the angle — half a turn takes the longest, 2.0 s — and never less than 0.1 s;
 * - a recentring that is interrupted (a button pressed, the character stops in Smart mode) is dropped; the next
 *   one starts afresh from where the camera is; if the character turns meanwhile, the target follows it.
 */
export const CAMERA_FOLLOW_MODES = ['never', 'smart', 'always'] as const;
export type CameraFollowMode = (typeof CAMERA_FOLLOW_MODES)[number];
/** The document's numbers for the modes. */
export const CAMERA_FOLLOW_MODE_CODE: Readonly<Record<CameraFollowMode, number>> = { never: 0, smart: 1, always: 2 };
export const RECENTER_MIN_SECONDS = 0.1;
export const RECENTER_MAX_SECONDS = 2;

/** e(t) = (1 − cos(π·t)) / 2: 0 at 0, 1 at 1, slow at both ends. */
export const recenterEase = (t: number): number => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, t)))) / 2;

/** Signed smallest turn from one heading to another, degrees in −180 .. 180. */
export function shortestTurn(fromDegrees: number, toDegrees: number): number {
  return ((((toDegrees - fromDegrees) % 360) + 540) % 360) - 180;
}

/** Seconds a recentring over that angle lasts: 2.0 for half a turn, in proportion below, at least 0.1. */
export function recenterDuration(angleDegrees: number): number {
  return Math.min(RECENTER_MAX_SECONDS, Math.max(RECENTER_MIN_SECONDS, (Math.abs(angleDegrees) / 180) * RECENTER_MAX_SECONDS));
}

export interface CameraFollowInput {
  /** The camera's heading now, degrees. */
  readonly cameraYaw: number;
  /** The heading the character faces, degrees. */
  readonly characterYaw: number;
  /** The character is moving. */
  readonly moving: boolean;
  /** A mouse button is turning the camera. */
  readonly userTurning: boolean;
}

/** Below this the headings are « the same »: nothing to recentre. */
const SETTLED_DEGREES = 1e-6;

export class CameraFollow {
  mode: CameraFollowMode;
  private startYaw = 0;
  private duration = 0;
  private elapsed = 0;
  private active = false;

  constructor(mode: CameraFollowMode = 'smart') {
    this.mode = mode;
  }

  /** A recentring is under way. */
  get recentering(): boolean {
    return this.active;
  }

  /** 0..1 through the current recentring (0 when there is none). */
  get progress(): number {
    return this.active ? Math.min(1, this.elapsed / this.duration) : 0;
  }

  /**
   * One frame. Returns the heading the camera should take, or null when the follow leaves it alone.
   */
  update(dtMs: number, input: CameraFollowInput): number | null {
    if (!(dtMs >= 0)) throw new Error(`camera follow: the time step must be ≥ 0 (got ${dtMs})`);
    const wanted = !input.userTurning && (this.mode === 'always' || (this.mode === 'smart' && input.moving));
    if (!wanted) {
      this.active = false;
      return null;
    }
    if (!this.active) {
      const turn = shortestTurn(input.cameraYaw, input.characterYaw);
      if (Math.abs(turn) <= SETTLED_DEGREES) return null;
      this.active = true;
      this.startYaw = input.cameraYaw;
      this.duration = recenterDuration(turn) * 1000;
      this.elapsed = 0;
    }
    this.elapsed += dtMs;
    const t = Math.min(1, this.elapsed / this.duration);
    // The target is the character's heading NOW: if it turned meanwhile, the camera ends on the new one.
    const yaw = this.startYaw + shortestTurn(this.startYaw, input.characterYaw) * recenterEase(t);
    if (t >= 1) this.active = false;
    return ((yaw % 360) + 360) % 360;
  }
}
