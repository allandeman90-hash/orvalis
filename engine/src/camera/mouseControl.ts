/**
 * What the mouse buttons do to the camera and the character (P7.3, spec §189).
 *
 * FROM THE SPEC:
 * - left drag: orbits the camera ONLY;
 * - right drag: turns the camera AND the character together;
 * - left + right held: move forward.
 *
 * OUR CHOICES (the document does not settle them):
 * - the buttons are read as a bitmask (1 = left, 2 = right), the browser's `buttons` value: the state is taken
 *   afresh from every event, never remembered from a « down » that might lack its « up »;
 * - pressing the right button turns the character to the camera's heading at once, then keeps it there;
 * - with both buttons held a drag still turns camera and character (the character runs where the camera looks);
 * - « move forward » is only an INTENT here: the movement itself is Phase 8.
 */
export const MOUSE_BUTTON_LEFT = 1;
export const MOUSE_BUTTON_RIGHT = 2;

export type CameraMouseMode = 'none' | 'orbit' | 'steer';

export interface CameraMouseTarget {
  /** Compass heading of the camera, degrees. */
  readonly yaw: number;
  rotateByMouse(dx: number, dy: number): void;
}

export function cameraMouseMode(buttons: number): CameraMouseMode {
  if (buttons & MOUSE_BUTTON_RIGHT) return 'steer';
  return buttons & MOUSE_BUTTON_LEFT ? 'orbit' : 'none';
}

export class CameraMouseControl {
  private buttons = 0;
  /** Compass heading the character faces, degrees 0..360. */
  characterYaw: number;

  constructor(private readonly camera: CameraMouseTarget, characterYaw = 0) {
    this.characterYaw = ((characterYaw % 360) + 360) % 360;
  }

  get mode(): CameraMouseMode {
    return cameraMouseMode(this.buttons);
  }

  /** Both buttons held: the character should move forward. */
  get moveForward(): boolean {
    return (this.buttons & (MOUSE_BUTTON_LEFT | MOUSE_BUTTON_RIGHT)) === (MOUSE_BUTTON_LEFT | MOUSE_BUTTON_RIGHT);
  }

  /**
   * The buttons now held (the event's `buttons` bitmask) and the mouse movement since the last event, in pixels.
   * Call it for every pointer event; with buttons = 0 nothing turns.
   */
  update(buttons: number, dx = 0, dy = 0): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error('camera mouse: the movement must be finite');
    this.buttons = buttons & (MOUSE_BUTTON_LEFT | MOUSE_BUTTON_RIGHT);
    const mode = this.mode;
    if (mode !== 'none' && (dx !== 0 || dy !== 0)) this.camera.rotateByMouse(dx, dy);
    if (mode === 'steer') this.characterYaw = this.camera.yaw;
  }

  /** Every button is considered released (focus lost, pointer cancelled, …). */
  release(): void {
    this.buttons = 0;
  }
}
