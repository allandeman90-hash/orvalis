import { vec3 } from '../math';
import { type LookAtCamera, WORLD_UP } from './lookAtCamera';

/**
 * The gameplay camera's orbit (P7.1, spec §186, §188): the camera turns around a pivot at a distance, by a yaw
 * and a pitch.
 *
 * FROM THE SPEC:
 * - pitch is clamped to −89° .. +89°; there is no roll;
 * - mouse movement maps to angles with screen-normalized denominators:
 *     Δyaw° = cameraYawMoveSpeed × mouseDX / 800,   Δpitch° = cameraPitchMoveSpeed × mouseDY / 600,
 *   with cameraYawMoveSpeed = 180 and cameraPitchMoveSpeed = 90 (degrees per second, as speed settings);
 * - the historical field of view is about 1.5708 rad (90°) for the 4:3-era camera; a browser game should use an
 *   aspect-correct projection that keeps the same character.
 *
 * OUR CHOICES (the document does not settle them):
 * - yaw is a compass heading in degrees (0 = looking north, +y; 90 = east), kept in 0..360; pitch is positive when
 *   the camera is ABOVE the pivot, looking down;
 * - mouse to the right turns the view to the right (yaw grows); mouse downwards raises the camera (pitch grows);
 *   both can be inverted;
 * - the 800 and 600 are applied to CSS pixels whatever the canvas size;
 * - the 90° is read as the HORIZONTAL angle of a 4:3 view: the vertical angle is 2·atan(3/4) ≈ 73.74°, and that
 *   vertical angle is kept at every aspect ratio (a wider window shows more to the sides);
 * - near and far planes.
 */
export const CAMERA_PITCH_LIMIT_DEGREES = 89;
export const CAMERA_YAW_MOVE_SPEED = 180;
export const CAMERA_PITCH_MOVE_SPEED = 90;
export const MOUSE_YAW_DENOMINATOR = 800;
export const MOUSE_PITCH_DENOMINATOR = 600;
export const HISTORICAL_FOV = 1.5708;
/** Vertical field of view: 90° horizontal at 4:3. */
export const GAMEPLAY_FOV_Y = 2 * Math.atan(Math.tan(HISTORICAL_FOV / 2) * (3 / 4));

/** The eye is never nearer to its target than this: a look-at view needs two different points. */
export const ORBIT_MIN_DISTANCE = 1e-3;

export interface OrbitCameraOptions {
  readonly yawDegrees?: number | undefined;
  readonly pitchDegrees?: number | undefined;
  readonly distance?: number | undefined;
  readonly pivot?: readonly [number, number, number] | undefined;
  readonly yawMoveSpeed?: number | undefined;
  readonly pitchMoveSpeed?: number | undefined;
  readonly invertYaw?: boolean | undefined;
  readonly invertPitch?: boolean | undefined;
  readonly fovY?: number | undefined;
  readonly near?: number | undefined;
  readonly far?: number | undefined;
}

const wrap360 = (degrees: number): number => ((degrees % 360) + 360) % 360;
const clampPitch = (degrees: number): number => Math.min(CAMERA_PITCH_LIMIT_DEGREES, Math.max(-CAMERA_PITCH_LIMIT_DEGREES, degrees));

export class OrbitCamera {
  private yawDegrees: number;
  private pitchDegrees: number;
  private distanceValue: number;
  readonly pivot: [number, number, number];
  readonly yawMoveSpeed: number;
  readonly pitchMoveSpeed: number;
  readonly invertYaw: boolean;
  readonly invertPitch: boolean;
  /** The camera for the renderers; its eye and target are rewritten by update(). */
  readonly lookAt: LookAtCamera;

  constructor(options: OrbitCameraOptions = {}) {
    const numbers = [options.yawDegrees ?? 0, options.pitchDegrees ?? 0, options.distance ?? 10, ...(options.pivot ?? [0, 0, 0])];
    if (!numbers.every(Number.isFinite)) throw new Error('orbit camera: yaw, pitch, distance and pivot must be finite');
    if (!((options.distance ?? 10) > 0)) throw new Error(`orbit camera: the distance must be > 0 (got ${options.distance})`);
    this.yawDegrees = wrap360(options.yawDegrees ?? 0);
    this.pitchDegrees = clampPitch(options.pitchDegrees ?? 0);
    this.distanceValue = options.distance ?? 10;
    this.pivot = [...(options.pivot ?? [0, 0, 0])] as [number, number, number];
    this.yawMoveSpeed = options.yawMoveSpeed ?? CAMERA_YAW_MOVE_SPEED;
    this.pitchMoveSpeed = options.pitchMoveSpeed ?? CAMERA_PITCH_MOVE_SPEED;
    this.invertYaw = options.invertYaw ?? false;
    this.invertPitch = options.invertPitch ?? false;
    this.lookAt = { eye: vec3.create(0, 0, 0), target: vec3.create(0, 0, 0), up: WORLD_UP, fovY: options.fovY ?? GAMEPLAY_FOV_Y, near: options.near ?? 0.1, far: options.far ?? 1000 };
    this.update();
  }

  get yaw(): number {
    return this.yawDegrees;
  }

  get pitch(): number {
    return this.pitchDegrees;
  }

  get distance(): number {
    return this.distanceValue;
  }

  /** Unit vector from the camera towards the pivot. */
  get forward(): [number, number, number] {
    const h = (this.yawDegrees * Math.PI) / 180, p = (this.pitchDegrees * Math.PI) / 180;
    return [Math.cos(p) * Math.sin(h), Math.cos(p) * Math.cos(h), -Math.sin(p)];
  }

  /** Turns by angles in degrees: the yaw wraps, the pitch stops at ±89°. */
  rotate(deltaYawDegrees: number, deltaPitchDegrees: number): void {
    if (!Number.isFinite(deltaYawDegrees) || !Number.isFinite(deltaPitchDegrees)) throw new Error('orbit camera: rotation angles must be finite');
    this.yawDegrees = wrap360(this.yawDegrees + deltaYawDegrees);
    this.pitchDegrees = clampPitch(this.pitchDegrees + deltaPitchDegrees);
    this.update();
  }

  /** Sets the heading (it wraps into 0..360); the pitch is unchanged. */
  setYaw(yawDegrees: number): void {
    if (!Number.isFinite(yawDegrees)) throw new Error(`orbit camera: the yaw must be finite (got ${yawDegrees})`);
    this.yawDegrees = wrap360(yawDegrees);
    this.update();
  }

  /** A mouse movement in pixels (x to the right, y downwards), by the spec's mapping. */
  rotateByMouse(dx: number, dy: number): void {
    this.rotate(((this.invertYaw ? -1 : 1) * this.yawMoveSpeed * dx) / MOUSE_YAW_DENOMINATOR, ((this.invertPitch ? -1 : 1) * this.pitchMoveSpeed * dy) / MOUSE_PITCH_DENOMINATOR);
  }

  setPivot(x: number, y: number, z: number): void {
    if (![x, y, z].every(Number.isFinite)) throw new Error('orbit camera: the pivot must be finite');
    this.pivot[0] = x; this.pivot[1] = y; this.pivot[2] = z;
    this.update();
  }

  /** 0 = first person: the eye is at the pivot (it is kept ORBIT_MIN_DISTANCE behind it, so that the view keeps a direction). */
  setDistance(distance: number): void {
    if (!(distance >= 0) || !Number.isFinite(distance)) throw new Error(`orbit camera: the distance must be finite and ≥ 0 (got ${distance})`);
    this.distanceValue = distance;
    this.update();
  }

  /** Rewrites the look-at camera: eye = pivot − forward × distance, looking at the pivot. */
  update(): void {
    const f = this.forward, eye = this.lookAt.eye, target = this.lookAt.target;
    for (let k = 0; k < 3; k++) {
      target[k] = this.pivot[k]!;
      eye[k] = this.pivot[k]! - f[k]! * Math.max(this.distanceValue, ORBIT_MIN_DISTANCE);
    }
  }
}
