import type { CapsuleResolution } from './capsule';
import { MOVEMENT, MOVEMENT_CHOICES } from './constants';
import type { MovementIntent } from './intent';
import { SWIM_SURFACE_BAND, swimEnterDepth, swimExitDepth, swimVelocity } from './swim';

/**
 * Movement on the ground (P8.1, spec §199–§200).
 *
 * FROM THE SPEC:
 * - a deterministic KINEMATIC controller, not a rigid body;
 * - run forward 7.0, run backward 4.5, walk 2.5 yards per second;
 * - a diagonal intent is NORMALIZED: forward + strafe is not √2 times faster.
 *
 * OUR CHOICES (the document does not settle them):
 * - which speed applies to which direction: walking → 2.5 whatever the direction; else any intent with a
 *   BACKWARD part → 4.5; else (forward, sideways, forward diagonals) → 7.0;
 * - the character turns at 180° per second with the keys;
 * - the heading is a compass heading in degrees (0 = north = +y, 90 = east), like the camera's yaw.
 */
export interface GroundMotion {
  /** World velocity on the ground plane, units per second. */
  readonly velocity: readonly [number, number];
  /** The speed that applies to this intent, units per second (0 when the intent is empty). */
  readonly speed: number;
}

/** The speed of an intent, yards per second. */
export function groundSpeedOf(intent: MovementIntent): number {
  if (intent.forward === 0 && intent.strafe === 0) return 0;
  if (intent.walk) return MOVEMENT.walkSpeed;
  if (intent.forward < 0) return MOVEMENT.runBackwardSpeed;
  return intent.forward > 0 ? MOVEMENT.runForwardSpeed : MOVEMENT_CHOICES.strafeSpeed;
}

/** The velocity an intent gives a character facing `headingDegrees`. */
export function groundMotion(intent: MovementIntent, headingDegrees: number, unitsPerYard = 1): GroundMotion {
  if (![intent.forward, intent.strafe, headingDegrees].every(Number.isFinite)) throw new Error('movement: the intent and the heading must be finite');
  const length = Math.hypot(intent.forward, intent.strafe);
  if (length === 0) return { velocity: [0, 0], speed: 0 };
  // Normalized: a diagonal is exactly as fast as a straight move. A partial intent (a stick half-pushed) is kept.
  const scale = length > 1 ? 1 / length : 1, forward = intent.forward * scale, strafe = intent.strafe * scale;
  const speed = groundSpeedOf(intent) * unitsPerYard;
  const h = (headingDegrees * Math.PI) / 180, sin = Math.sin(h), cos = Math.cos(h);
  // Forward is (sin h, cos h); right is (cos h, −sin h).
  return { velocity: [(forward * sin + strafe * cos) * speed, (forward * cos - strafe * sin) * speed], speed };
}

export interface GroundedState {
  /** World position of the feet. */
  position: [number, number, number];
  /** Compass heading the character faces, degrees 0..360. */
  heading: number;
  /** Horizontal velocity of the last step, units per second. */
  velocity: [number, number];
  /** Vertical velocity, units per second (+ up). 0 on the ground. */
  verticalVelocity: number;
  /** On the ground, in the air, or in a « far » fall (spec §202: it selects the animation / state). */
  mode: MovementMode;
  /** Time spent in the air in the present (or the last) flight, seconds. */
  airSeconds: number;
  /** Height of the feet when they left the ground, and the highest point reached since. */
  launchHeight: number;
  apexHeight: number;
  /** The present (or last) flight started with a jump (not by walking off an edge). */
  jumped: boolean;
  /** Unit normal (pointing up) of the surface under the feet — the last one touched. */
  groundNormal: [number, number, number];
  /** The last step on the ground was refused: the surface ahead is steeper than the walkable limit. */
  blockedBySlope: boolean;
  /** In the air, touching a surface too steep to stand on: the character slides down it. */
  sliding: boolean;
  /** The last step was corrected by the collision capsule: the character is against an obstacle. */
  touching: boolean;
  /** The last step climbed onto an obstacle (automatic step-up, P8.5), and how many times so far. */
  steppedUp: boolean;
  stepUps: number;
  /** Water over the feet (0 when there is none), and — swimming — held at the surface line. */
  waterDepth: number;
  atSurface: boolean;
}

/**
 * The collision (P8.4): given where the feet would be, where they may be — the capsule pushed out of the
 * obstacles — and the directions it was pushed along. `horizontalOnly` on the ground, free in the air.
 * `lift`: the capsule starts this far above the feet instead of its usual 0.2 (the step-up of P8.5).
 */
export type MovementCollider = (feet: readonly [number, number, number], horizontalOnly: boolean, lift?: number) => CapsuleResolution;

export type MovementMode = 'grounded' | 'falling' | 'fallingFar' | 'swimming';

export interface MovementWater {
  /** Height of the water surface over a point, or null where there is no water. */
  readonly surfaceAt: (x: number, y: number) => number | null;
  /** The character's collision height NOW (spec §209: the threshold follows the actual collision height). Default: the fallback 2.0277777. */
  readonly collisionHeight?: (() => number) | undefined;
}

/** Height of the ground under a point, or null where there is none (the character falls). */
export type GroundHeightQuery = (x: number, y: number) => number | null;

export interface GroundHit {
  readonly height: number;
  /** Unit normal of the surface, pointing up (z ≥ 0). */
  readonly normal: readonly [number, number, number];
}

/**
 * The ground PROBE (P8.3, spec §206): the first surface met going straight down from (x, y, fromZ), no farther
 * than `maxDrop`; null when there is none.
 */
export type GroundProbe = (x: number, y: number, fromZ: number, maxDrop: number) => GroundHit | null;

/** A probe over a height function (level surfaces): for tests and simple scenes. */
export function levelGround(heightAt: GroundHeightQuery): GroundProbe {
  return (x, y, fromZ, maxDrop) => {
    const height = heightAt(x, y);
    return height !== null && height <= fromZ && fromZ - height <= maxDrop ? { height, normal: [0, 0, 1] } : null;
  };
}

/** Spec §204: a surface is walkable when its angle to the horizontal is at most 50° (normal.z ≥ cos 50° ≈ 0.642788). */
export function isWalkable(normal: readonly [number, number, number], limitDegrees: number = MOVEMENT.walkableSlopeDegrees): boolean {
  // (A hair of tolerance — under a ten-thousandth of a degree: a surface built at exactly the limit, with
  // 32-bit coordinates, must not fall on the wrong side by rounding.)
  return normal[2] >= Math.cos((limitDegrees * Math.PI) / 180) - 1e-6;
}

/** Angle of a surface to the horizontal, degrees (0 = level, 90 = a wall). */
export function slopeDegrees(normal: readonly [number, number, number]): number {
  return (Math.acos(Math.max(-1, Math.min(1, normal[2]))) * 180) / Math.PI;
}

/**
 * Horizontal velocity in the air (spec §208): the velocity the character had when it left the ground is KEPT;
 * the input only adds a limited correction of `control` (2.5 yards per second).
 * OUR CHOICE for the limit: the result is never faster than the faster of the two (inherited speed, control).
 */
export function airVelocity(inherited: readonly [number, number], intent: MovementIntent, headingDegrees: number, control: number): [number, number] {
  const length = Math.hypot(intent.forward, intent.strafe);
  if (length === 0) return [inherited[0], inherited[1]];
  const h = (headingDegrees * Math.PI) / 180, sin = Math.sin(h), cos = Math.cos(h), scale = control / Math.max(1, length);
  let vx = inherited[0] + (intent.forward * sin + intent.strafe * cos) * scale, vy = inherited[1] + (intent.forward * cos - intent.strafe * sin) * scale;
  const cap = Math.max(Math.hypot(inherited[0], inherited[1]), control), speed = Math.hypot(vx, vy);
  if (speed > cap) {
    vx *= cap / speed;
    vy *= cap / speed;
  }
  return [vx, vy];
}

/**
 * The player's movement on flat ground. Advanced by FIXED steps (the engine's simulation step), so the same
 * intents always give the same path, whatever the frame rate.
 */
export class PlayerMovement {
  readonly state: GroundedState;
  private readonly probe: GroundProbe;
  /** Horizontal velocity when the feet left the ground. */
  private readonly inherited: [number, number] = [0, 0];

  /** @param probe the ground probe (default: flat and endless, at the starting height) */
  constructor(position: readonly [number, number, number], headingDegrees = 0, private readonly unitsPerYard = 1, probe?: GroundProbe, private readonly collider?: MovementCollider, private readonly water?: MovementWater) {
    if (![...position, headingDegrees].every(Number.isFinite)) throw new Error('movement: the position and the heading must be finite');
    if (!(unitsPerYard > 0) || !Number.isFinite(unitsPerYard)) throw new Error(`movement: unitsPerYard must be finite and > 0 (got ${unitsPerYard})`);
    this.state = { position: [position[0], position[1], position[2]], heading: ((headingDegrees % 360) + 360) % 360, velocity: [0, 0], verticalVelocity: 0, mode: 'grounded', airSeconds: 0, launchHeight: position[2], apexHeight: position[2], jumped: false, groundNormal: [0, 0, 1], blockedBySlope: false, sliding: false, touching: false, steppedUp: false, stepUps: 0, waterDepth: 0, atSurface: false };
    const flat = position[2];
    this.probe = probe ?? levelGround(() => flat);
  }

  get grounded(): boolean {
    return this.state.mode === 'grounded';
  }

  get swimming(): boolean {
    return this.state.mode === 'swimming';
  }

  private collisionHeight(): number {
    return this.water?.collisionHeight?.() ?? MOVEMENT.collisionHeight * this.unitsPerYard;
  }

  /** Water over the feet at their present place (0 when there is none or it is under them). */
  private measureWater(): number {
    const s = this.state, surface = this.water?.surfaceAt(s.position[0], s.position[1]) ?? null;
    s.waterDepth = surface === null ? 0 : Math.max(0, surface - s.position[2]);
    return s.waterDepth;
  }

  /** Spec §209: deeper than 0.75 × the collision height, the character swims — whatever it was doing. */
  private enterWaterIfDeep(): boolean {
    const s = this.state;
    if (!this.water || s.mode === 'swimming' || !(this.measureWater() > swimEnterDepth(this.collisionHeight()))) return false;
    s.mode = 'swimming';
    s.verticalVelocity = 0;
    s.sliding = s.blockedBySlope = s.steppedUp = false;
    return true;
  }

  /** One piece of swimming (spec §210–§211): no gravity; the intent, pitched, moves the body in 3D. */
  private swim(dt: number, intent: MovementIntent): void {
    const s = this.state, u = this.unitsPerYard, snap = MOVEMENT.groundSnap * u, water = this.water!, enter = swimEnterDepth(this.collisionHeight());
    // The jump out of the water (§211), from the surface line only.
    if (intent.jump && this.measureWater() <= enter + SWIM_SURFACE_BAND * u) {
      const v = swimVelocity({ ...intent, jump: false, pitch: 0 }, s.heading, u);
      s.velocity[0] = v[0];
      s.velocity[1] = v[1];
      this.leaveGround(true);
      s.verticalVelocity = MOVEMENT.swimJumpSpeed * u;
      s.atSurface = false;
      this.fly(dt, intent);
      return;
    }
    const [vx, vy, vz] = swimVelocity(intent, s.heading, u), [px, py, pz] = s.position;
    let x = px + vx * dt, y = py + vy * dt, z = pz + vz * dt;
    s.touching = false;
    if (this.collider) {
      const resolved = this.collider([x, y, z], false);
      if (resolved.touched) {
        s.touching = true;
        [x, y, z] = resolved.position;
      }
    }
    // The surface (§211): never higher than surface − 0.75 × height; going up through it becomes going along it.
    const surface = water.surfaceAt(x, y);
    s.atSurface = false;
    if (surface !== null && z >= surface - enter) {
      z = surface - enter;
      s.atSurface = true;
    }
    // The bottom: the feet do not go under a ground they can stand on; a bottom too steep stops the move.
    const bottom = this.probe(x, y, z + snap, snap);
    let standing = false;
    if (bottom) {
      if (!isWalkable(bottom.normal) && bottom.height > pz) {
        x = px;
        y = py;
        z = pz;
      } else {
        z = bottom.height;
        standing = isWalkable(bottom.normal);
        if (standing) s.groundNormal = [bottom.normal[0], bottom.normal[1], bottom.normal[2]];
      }
    }
    s.velocity[0] = (x - px) / dt;
    s.velocity[1] = (y - py) / dt;
    if (Math.hypot(x - px, y - py) < 1e-9) s.velocity[0] = s.velocity[1] = 0;
    s.verticalVelocity = (z - pz) / dt;
    s.position[0] = x;
    s.position[1] = y;
    s.position[2] = z;
    // Out of the water (§209): shallower than the threshold by the hysteresis — or no water here at all.
    if (this.measureWater() < swimExitDepth(this.collisionHeight(), u)) {
      s.atSurface = false;
      s.verticalVelocity = 0;
      if (standing) s.mode = 'grounded';
      else this.leaveGround(false);
    }
  }

  private leaveGround(jumped: boolean): void {
    const s = this.state;
    s.mode = 'falling';
    s.jumped = jumped;
    s.airSeconds = 0;
    s.launchHeight = s.apexHeight = s.position[2];
    s.verticalVelocity = jumped ? MOVEMENT.jumpSpeed * this.unitsPerYard : 0;
    this.inherited[0] = s.velocity[0];
    this.inherited[1] = s.velocity[1];
    s.blockedBySlope = false;
  }

  /** One piece of flight (spec §201: the ideal ballistic formulas, exact at every step whatever its length). */
  private fly(dt: number, intent: MovementIntent): void {
    const s = this.state, u = this.unitsPerYard, g = MOVEMENT.gravity * u, terminal = MOVEMENT.terminalSpeed * u;
    const [vx, vy] = airVelocity(this.inherited, intent, s.heading, MOVEMENT.airControlSpeed * u);
    s.velocity[0] = vx;
    s.velocity[1] = vy;
    s.position[0] += vx * dt;
    s.position[1] += vy * dt;
    const before = s.position[2];
    // At terminal speed the fall is uniform; before it, z = z0 + v·t − g·t² / 2.
    const next = s.verticalVelocity - g * dt;
    s.position[2] += next < -terminal ? -terminal * dt : s.verticalVelocity * dt - 0.5 * g * dt * dt;
    s.verticalVelocity = Math.max(next, -terminal);
    s.airSeconds += dt;
    // §202: a jump becomes a far fall 1/9 yard below where it started; a fall off an edge after 0.5 s.
    if (s.jumped ? s.position[2] < s.launchHeight - MOVEMENT.fallingFarDropAfterJump * u : s.airSeconds >= MOVEMENT.fallingFarSecondsOffEdge - 1e-9) s.mode = 'fallingFar';
    s.sliding = false;
    s.touching = false;
    let airVx = vx, airVy = vy;
    if (this.collider) {
      // Obstacles: the capsule is pushed out, and the velocity loses its part into each surface (§207).
      const resolved = this.collider(s.position, false);
      if (resolved.touched) {
        s.touching = true;
        s.position[0] = resolved.position[0];
        s.position[1] = resolved.position[1];
        s.position[2] = resolved.position[2];
        let vz = s.verticalVelocity;
        for (const n of resolved.normals) {
          const into = airVx * n[0] + airVy * n[1] + vz * n[2];
          if (into < 0) {
            airVx -= n[0] * into;
            airVy -= n[1] * into;
            vz -= n[2] * into;
          }
          // Resting on something that faces up but is too steep to stand on: the character slides down it.
          if (n[2] > 0.05 && !isWalkable(n)) s.sliding = true;
        }
        s.verticalVelocity = vz;
        s.velocity[0] = this.inherited[0] = airVx;
        s.velocity[1] = this.inherited[1] = airVy;
      }
    }
    s.apexHeight = Math.max(s.apexHeight, s.position[2]);
    if (s.verticalVelocity > 0) return;
    // Coming down: the probe starts a ground-snap above where the feet were (a surface the move ran into is
    // found; one well above is not: beside a ledge the fall goes on) and ends a LANDING probe (§206: 0.05)
    // under where they are now.
    const from = before + MOVEMENT.groundSnap * u, reach = MOVEMENT.landingProbe * u;
    const hit = this.probe(s.position[0], s.position[1], from, from - (s.position[2] - reach));
    if (!hit) return;
    if (isWalkable(hit.normal)) {
      s.position[2] = hit.height;
      s.verticalVelocity = 0;
      s.mode = 'grounded';
      s.groundNormal = [hit.normal[0], hit.normal[1], hit.normal[2]];
      return;
    }
    // Too steep to stand on (§204 « steep-wall / slide handling »): once the feet reach it, the velocity loses
    // its part INTO the surface (§207: v' = v − N·(v·N)) and the character slides down it, still falling.
    if (hit.height < s.position[2]) return;
    const n = hit.normal, into = airVx * n[0] + airVy * n[1] + s.verticalVelocity * n[2];
    s.position[2] = hit.height;
    s.sliding = true;
    s.groundNormal = [n[0], n[1], n[2]];
    if (into < 0) {
      this.inherited[0] = airVx - n[0] * into;
      this.inherited[1] = airVy - n[1] * into;
      s.verticalVelocity -= n[2] * into;
      s.velocity[0] = this.inherited[0];
      s.velocity[1] = this.inherited[1];
    }
  }

  /**
   * Automatic step-up (P8.5, spec §205: 1.0 yard for a player), the document's probes in order:
   *   1. forward obstruction — the caller found it: the capsule (which starts 0.2 above the feet) was stopped,
   *      pushed back along `away`;
   *   2. upward clearance — the capsule fits where the character stands, raised to the height of the step;
   *   3. forward at the raised level — it also fits just past the obstruction, at that height;
   *   4. downward support — there, under the raised level and no higher than the step height, is a surface to
   *      STAND on (walkable).
   * Only then may the character go on: its capsule then ignores what is lower than the step height, and its feet
   * rise onto the step when they reach it — at the same horizontal speed as on flat ground.
   * (Never « up by the obstacle's height »: an obstacle with no room on it or above it stays a wall.)
   */
  private stepAhead(stopped: CapsuleResolution): GroundHit | null {
    const collider = this.collider, away = stopped.normals[0];
    if (!collider || !away) return null;
    const s = this.state, u = this.unitsPerYard, rise = MOVEMENT.playerStepHeight * u, snap = MOVEMENT.groundSnap * u, [px, py, pz] = s.position;
    const flat = Math.hypot(away[0], away[1]);
    if (!(flat > 0)) return null;
    // 2. Upward clearance is tested per candidate height below; first, 4. downward support: where the feet
    // would stand, past the surface that stopped the capsule. That surface is at most `reach` + one step ahead
    // of the character, in the direction the capsule was pushed back from: a few places along it are tried,
    // nearest first. (A hair above the step height, so that a step of exactly that height is taken.)
    const top = rise + 1e-4 * u, nx = -away[0] / flat, ny = -away[1] / flat;
    for (const part of [0.35, 0.7, 1.05, 1.4]) {
      const ahead = part * stopped.reach + 2 * MOVEMENT.collisionSkin * u, ax = px + nx * ahead, ay = py + ny * ahead;
      const support = this.probe(ax, ay, pz + top, top);
      if (!support || support.height <= pz + snap) continue;
      if (!isWalkable(support.normal)) return null;
      // 2. Upward clearance, then 3. forward at the raised level.
      if (collider([px, py, support.height], false).touched || collider([ax, ay, support.height], false).touched) return null;
      return support;
    }
    return null;
  }

  /** True when the last step moved the character. */
  get moving(): boolean {
    return this.state.velocity[0] !== 0 || this.state.velocity[1] !== 0;
  }

  /** The speed of the last step, units per second. */
  get speed(): number {
    return Math.hypot(this.state.velocity[0], this.state.velocity[1]);
  }

  /** The heading is set from outside (the mouse steers: the character faces where the camera looks). */
  setHeading(headingDegrees: number): void {
    if (!Number.isFinite(headingDegrees)) throw new Error(`movement: the heading must be finite (got ${headingDegrees})`);
    this.state.heading = ((headingDegrees % 360) + 360) % 360;
  }

  /** Puts the character somewhere else at once, standing still (a teleport, a spawn, a test). */
  teleport(position: readonly [number, number, number]): void {
    if (!position.every(Number.isFinite)) throw new Error('movement: the position must be finite');
    this.state.position[0] = position[0];
    this.state.position[1] = position[1];
    this.state.position[2] = position[2];
    this.state.velocity[0] = 0;
    this.state.velocity[1] = 0;
    this.state.verticalVelocity = 0;
    this.state.mode = 'grounded';
    this.state.blockedBySlope = this.state.sliding = this.state.touching = this.state.steppedUp = this.state.atSurface = false;
  }

  /**
   * One simulation step of `dtMs` (never more than the document's 250 ms: longer intervals are cut up).
   * The turn is applied first, then the move along the new heading.
   */
  step(dtMs: number, intent: MovementIntent): void {
    if (!(dtMs >= 0) || !Number.isFinite(dtMs)) throw new Error(`movement: the time step must be finite and ≥ 0 (got ${dtMs})`);
    const maxStep = MOVEMENT.maxIntegrationStep * 1000;
    for (let left = dtMs; left > 0; left -= maxStep) {
      const dt = Math.min(left, maxStep) / 1000, s = this.state;
      if (intent.turn !== 0) s.heading = (((s.heading + Math.max(-1, Math.min(1, intent.turn)) * MOVEMENT_CHOICES.keyboardTurnDegreesPerSecond * dt) % 360) + 360) % 360;
      this.enterWaterIfDeep();
      if (s.mode === 'swimming') {
        this.swim(dt, intent);
        continue;
      }
      if (s.mode !== 'grounded') {
        this.fly(dt, intent);
        this.enterWaterIfDeep();
        continue;
      }
      const { velocity } = groundMotion(intent, s.heading, this.unitsPerYard);
      s.velocity[0] = velocity[0];
      s.velocity[1] = velocity[1];
      if (intent.jump) {
        // The jump inherits the velocity the character has on the ground (spec §208), and starts at once.
        this.leaveGround(true);
        this.fly(dt, intent);
        continue;
      }
      const u = this.unitsPerYard, snap = MOVEMENT.groundSnap * u, rise = MOVEMENT.playerStepHeight * u;
      const wantX = s.position[0] + velocity[0] * dt, wantY = s.position[1] + velocity[1] * dt;
      let x = wantX, y = wantY, climbing = false;
      s.touching = false;
      s.steppedUp = false;
      if (this.collider) {
        // Obstacles (§207): the capsule is pushed out of them, on the horizontal plane. Driven into a wall at an
        // angle, what is left of the step is its part along the wall: the character slides.
        let resolved = this.collider([wantX, wantY, s.position[2]], true);
        // A step to climb (§205)? Either the feet ARRIVE on one — a walkable surface above the ground snap and
        // no higher than the step height, where they are going — or the capsule is stopped by one just AHEAD.
        const top = rise + 1e-4 * u, arriving = this.probe(wantX, wantY, s.position[2] + top, top - snap);
        if ((arriving !== null && arriving.height > s.position[2] + snap && isWalkable(arriving.normal)) || (resolved.touched && this.stepAhead(resolved))) {
          // Something low enough to climb (§205): for this step only what is HIGHER than the step height stops
          // the capsule; the feet will rise onto the step when they get there.
          climbing = true;
          resolved = this.collider([wantX, wantY, s.position[2]], true, rise);
        }
        if (resolved.touched) {
          s.touching = true;
          x = resolved.position[0];
          y = resolved.position[1];
          // Never farther than the step asked for (rounding a corner, the way out can point forwards).
          const asked = Math.hypot(velocity[0], velocity[1]) * dt, reached = Math.hypot(x - s.position[0], y - s.position[1]);
          if (reached > asked && reached > 0) {
            x = s.position[0] + ((x - s.position[0]) * asked) / reached;
            y = s.position[1] + ((y - s.position[1]) * asked) / reached;
          }
          // The velocity reported is the one really achieved.
          const gone = Math.hypot(x - s.position[0], y - s.position[1]);
          s.velocity[0] = gone < 1e-9 ? 0 : (x - s.position[0]) / dt;
          s.velocity[1] = gone < 1e-9 ? 0 : (y - s.position[1]) / dt;
          if (gone < 1e-9) {
            x = s.position[0];
            y = s.position[1];
          }
        }
      }
      // The ground probe (§206): from a snap (0.2) above the feet to a snap below them, at the new place — or,
      // while climbing, from the step height above them.
      const above = climbing ? rise + 1e-4 * u : snap;
      const hit = this.probe(x, y, s.position[2] + above, above + snap);
      s.blockedBySlope = false;
      const stepping = climbing && hit !== null && hit.height > s.position[2] + snap;
      if (hit && hit.height > s.position[2] && (!isWalkable(hit.normal) || (stepping && this.collider!([x, y, hit.height], false).touched))) {
        // A surface too steep to walk UP (§204), or a step with no room for the capsule on it: the move is refused.
        s.blockedBySlope = true;
        s.velocity[0] = s.velocity[1] = 0;
        continue;
      }
      s.position[0] = x;
      s.position[1] = y;
      if (hit && isWalkable(hit.normal)) {
        // The feet follow the ground, up or down.
        s.position[2] = hit.height;
        s.groundNormal = [hit.normal[0], hit.normal[1], hit.normal[2]];
        if (stepping) {
          s.steppedUp = true;
          s.stepUps++;
        }
      } else this.leaveGround(false); // nothing within reach (an edge), or a drop onto something too steep: the fall starts, with no vertical speed
    }
    if (dtMs === 0 && this.state.mode === 'grounded') {
      const { velocity } = groundMotion(intent, this.state.heading, this.unitsPerYard);
      this.state.velocity[0] = velocity[0];
      this.state.velocity[1] = velocity[1];
    }
  }
}
