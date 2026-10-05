/**
 * What the player WANTS (P8.1, spec §213 « InputIntent »): axes in −1 .. 1, independent of the devices. The
 * controller turns an intent into movement; the network (later) will send intents, not key codes.
 */
export interface MovementIntent {
  /** +1 forward, −1 backward. */
  readonly forward: number;
  /** +1 to the right, −1 to the left. */
  readonly strafe: number;
  /** +1 turn right (clockwise seen from above), −1 turn left. */
  readonly turn: number;
  /** Walking instead of running. */
  readonly walk: boolean;
  /** Wants to jump (held: jumps again as soon as the feet are back on the ground — our choice). */
  readonly jump: boolean;
  /**
   * Pitch of the movement, degrees: + up, − down (spec §210). Only swimming uses it: forward goes where the
   * camera looks while the mouse steers.
   */
  readonly pitch: number;
}

export const NO_INTENT: MovementIntent = { forward: 0, strafe: 0, turn: 0, walk: false, jump: false, pitch: 0 };

export interface IntentDevices {
  /** Key codes held (KeyboardEvent.code: positions on the keyboard, the same on QWERTY and AZERTY). */
  readonly keys: ReadonlySet<string>;
  /** The right mouse button is held: the mouse steers, so the turn keys strafe instead. */
  readonly steering: boolean;
  /** Both mouse buttons are held: run forward (spec §189). */
  readonly bothButtons: boolean;
  /** Pitch of the movement while the mouse steers, degrees (+ up). Default 0. */
  readonly pitchDegrees?: number | undefined;
}

const axis = (plus: boolean, minus: boolean): number => (plus ? 1 : 0) - (minus ? 1 : 0);
const clamp1 = (v: number): number => Math.max(-1, Math.min(1, v));

/**
 * The intent from the keyboard and the mouse buttons.
 * OUR CHOICES (the document names the mouse behaviour only): the key positions W / S = forward / backward,
 * A / D = turn left / right — or strafe while the right button steers —, Q / E = strafe, the arrows like WASD,
 * Shift held = walk, Space = jump. Opposite keys cancel each other.
 */
export function intentFromDevices(devices: IntentDevices): MovementIntent {
  const k = devices.keys;
  const side = axis(k.has('KeyD') || k.has('ArrowRight'), k.has('KeyA') || k.has('ArrowLeft'));
  const strafeKeys = axis(k.has('KeyE'), k.has('KeyQ'));
  return {
    forward: clamp1(axis(k.has('KeyW') || k.has('ArrowUp'), k.has('KeyS') || k.has('ArrowDown')) + (devices.bothButtons ? 1 : 0)),
    strafe: clamp1(strafeKeys + (devices.steering ? side : 0)),
    turn: devices.steering ? 0 : side,
    walk: k.has('ShiftLeft') || k.has('ShiftRight'),
    jump: k.has('Space'),
    // OUR CHOICE: the movement is pitched only while the right button steers (it then follows the camera).
    pitch: devices.steering ? (devices.pitchDegrees ?? 0) : 0,
  };
}
