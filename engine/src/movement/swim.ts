import { MOVEMENT, MOVEMENT_CHOICES } from './constants';
import type { MovementIntent } from './intent';

/**
 * Swimming (P8.6, spec §209–§211).
 *
 * FROM THE SPEC:
 * - swimming starts when the water is deeper than 0.75 × the COLLISION HEIGHT over the feet, and stops when it is
 *   shallower than that by 1/36 yard (a hysteresis: no flicker between walking and swimming at the surface);
 * - swim forward 4.722222, swim backward 2.5 yards per second;
 * - forward3D = horizontalForward × cos(pitch) + worldUp × sin(pitch); strafing stays horizontal;
 * - ordinary gravity is suppressed: the vertical motion comes from the pitch and from the surface;
 * - the body is kept at most at surface − 0.75 × collisionHeight: moving up through the surface becomes moving
 *   along it;
 * - the jump out of the water starts at 9.096748 yards per second (7.955547 on land).
 *
 * OUR CHOICES (the document does not settle them):
 * - which speed applies: any intent with a BACKWARD part → 2.5; else 4.722222 (forward, sideways, upward);
 *   « walk » changes nothing in the water;
 * - the jump key held under the surface swims UP; AT the surface (within `surfaceBand`) it is the jump out;
 * - a diagonal is normalized, as on the ground.
 */
export function swimEnterDepth(collisionHeight: number): number {
  return MOVEMENT.swimDepthRatio * collisionHeight;
}

export function swimExitDepth(collisionHeight: number, unitsPerYard = 1): number {
  return MOVEMENT.swimDepthRatio * collisionHeight - MOVEMENT.swimExitHysteresis * unitsPerYard;
}

/** The speed of an intent in the water, yards per second (0 when the intent is empty). */
export function swimSpeedOf(intent: MovementIntent): number {
  if (intent.forward === 0 && intent.strafe === 0 && !intent.jump) return 0;
  return intent.forward < 0 ? MOVEMENT.swimBackwardSpeed : MOVEMENT.swimForwardSpeed;
}

/** The 3D velocity an intent gives a swimmer facing `headingDegrees`, its movement pitched by intent.pitch. */
export function swimVelocity(intent: MovementIntent, headingDegrees: number, unitsPerYard = 1): [number, number, number] {
  if (![intent.forward, intent.strafe, intent.pitch, headingDegrees].every(Number.isFinite)) throw new Error('movement: the intent and the heading must be finite');
  const speed = swimSpeedOf(intent) * unitsPerYard;
  if (speed === 0) return [0, 0, 0];
  const h = (headingDegrees * Math.PI) / 180, sin = Math.sin(h), cos = Math.cos(h);
  const p = (Math.max(-90, Math.min(90, intent.pitch)) * Math.PI) / 180, flat = Math.cos(p), up = Math.sin(p);
  // forward3D = (sin h, cos h, 0) × cos(pitch) + (0, 0, 1) × sin(pitch); right = (cos h, −sin h, 0); up for the jump key.
  let x = intent.forward * sin * flat + intent.strafe * cos, y = intent.forward * cos * flat - intent.strafe * sin, z = intent.forward * up + (intent.jump ? 1 : 0);
  const length = Math.hypot(x, y, z);
  if (length === 0) return [0, 0, 0];
  if (length > 1) {
    x /= length;
    y /= length;
    z /= length;
  }
  return [x * speed, y * speed, z * speed];
}

/** How close under the surface line the swimmer must be for the jump key to be the jump out (our choice), yards. */
export const SWIM_SURFACE_BAND = MOVEMENT_CHOICES.swimSurfaceBand;
