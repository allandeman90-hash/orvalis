/**
 * Every movement constant of the document, in ONE place (Phase 8, spec §199–§212). Lengths are YARDS, times
 * seconds, angles degrees unless said otherwise; how many engine units make a yard is a parameter of the code
 * that uses them (`unitsPerYard`, default 1), as everywhere else in the engine.
 *
 * Constants not used yet are listed too, so that later steps do not scatter them.
 */
export const MOVEMENT = {
  /** §199: the original subdivides long intervals into steps of at most this, seconds. */
  maxIntegrationStep: 0.25,
  // §200 — baseline speeds, yards per second.
  runForwardSpeed: 7.0,
  runBackwardSpeed: 4.5,
  walkSpeed: 2.5,
  swimForwardSpeed: 4.722222,
  swimBackwardSpeed: 2.5,
  // §201 — jump and gravity.
  jumpSpeed: 7.955547,
  gravity: 19.291105,
  terminalSpeed: 60.148003,
  slowFallTerminalSpeed: 7.0,
  // §202 — when a fall becomes a « far » fall.
  fallingFarDropAfterJump: 1 / 9,
  fallingFarSecondsOffEdge: 0.5,
  // §203 — collision dimensions (fallbacks; the active model overrides them).
  collisionRadius: 1 / 3,
  collisionHeight: 2.0277777,
  // §204 — walkable slopes.
  walkableSlopeDegrees: 50,
  // §205 — automatic step-up.
  playerStepHeight: 1.0,
  creatureStepHeight: 2.0,
  // §206 — probes and skin.
  groundSnap: 0.2,
  landingProbe: 0.05,
  collisionSkin: 0.02,
  // §208 — air control.
  airControlSpeed: 2.5,
  // §209 — swimming threshold, as a share of the collision height, and its exit hysteresis.
  swimDepthRatio: 0.75,
  swimExitHysteresis: 1 / 36,
  // §211 — the stronger jump out of the water.
  swimJumpSpeed: 9.096748,
  // §212 — water walking and hover.
  waterWalkPitchDegrees: -37,
  hoverHeight: 1,
  hoverCorrectionSpeed: 7,
} as const;

/**
 * NOT in the movement sections — OUR CHOICES, kept beside the others:
 * - turning with the keyboard: the document gives no rate for the character; the camera's yaw speed of §188
 *   (180° per second) is used;
 * - sideways (strafe) speed: the document lists forward, backward and walk only; strafing uses the run speed.
 */
export const MOVEMENT_CHOICES = {
  keyboardTurnDegreesPerSecond: 180,
  strafeSpeed: MOVEMENT.runForwardSpeed,
  /** In the water, within this distance under the surface line the jump key is the jump out, yards. */
  swimSurfaceBand: 0.05,
} as const;
