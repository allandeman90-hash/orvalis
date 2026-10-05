import { describe, expect, it } from 'vitest';
import { CameraMouseControl, OrbitCamera } from '../../src/camera';
import { bindCameraPointer } from '../../src/input/cameraPointer';

/** A minimal event target: what the binding needs from a canvas, a window and a document. */
class FakeTarget {
  readonly listeners = new Map<string, Array<(event: Event) => void>>();
  captured: number | null = null;
  hidden = false;
  pointerLockElement: unknown = null;
  addEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((l) => l !== listener));
  }
  setPointerCapture(id: number): void {
    this.captured = id;
  }
  releasePointerCapture(): void {
    this.captured = null;
  }
  hasPointerCapture(id: number): boolean {
    return this.captured === id;
  }
  /** Sends an event; returns true when a listener called preventDefault(). */
  fire(type: string, init: { buttons?: number; x?: number; y?: number; movementX?: number; movementY?: number; deltaY?: number } = {}): boolean {
    let prevented = false;
    const event = { buttons: init.buttons ?? 0, clientX: init.x ?? 0, clientY: init.y ?? 0, movementX: init.movementX ?? 0, movementY: init.movementY ?? 0, deltaY: init.deltaY ?? 0, pointerId: 1, preventDefault: () => (prevented = true) };
    for (const listener of this.listeners.get(type) ?? []) listener(event as unknown as Event);
    return prevented;
  }
}

function setup() {
  const canvas = new FakeTarget(), win = new FakeTarget(), doc = new FakeTarget();
  const camera = new OrbitCamera(), mouse = new CameraMouseControl(camera, 0);
  const wheels: number[] = [];
  const unbind = bindCameraPointer(canvas, win, doc, { update: (b, dx, dy) => mouse.update(b, dx, dy), release: () => mouse.release(), wheel: (d) => wheels.push(d) });
  return { canvas, win, doc, camera, mouse, wheels, unbind };
}
const LEFT = 1, RIGHT = 2;

describe('camera pointer binding: an ordinary drag', () => {
  it('press, move, release: the movement between events turns the camera; the press itself does not', () => {
    const { canvas, camera, mouse } = setup();
    canvas.fire('pointerdown', { buttons: LEFT, x: 500, y: 300 });
    expect([camera.yaw, mouse.mode, canvas.captured]).toEqual([0, 'orbit', 1]);
    canvas.fire('pointermove', { buttons: LEFT, x: 600, y: 300 });
    canvas.fire('pointermove', { buttons: LEFT, x: 700, y: 360 });
    expect([camera.yaw, camera.pitch]).toEqual([45, 9]);
    canvas.fire('pointerup', { buttons: 0, x: 700, y: 360 });
    expect([mouse.mode, canvas.captured]).toEqual(['none', null]);
  });
  it('a move with no button held does nothing', () => {
    const { canvas, camera } = setup();
    canvas.fire('pointermove', { buttons: 0, x: 100, y: 100 });
    canvas.fire('pointermove', { buttons: 0, x: 900, y: 500 });
    expect([camera.yaw, camera.pitch]).toEqual([0, 0]);
  });
  it('a second drag starts from its own press: the pointer’s jump between two drags is not applied', () => {
    const { canvas, camera } = setup();
    canvas.fire('pointerdown', { buttons: LEFT, x: 100, y: 100 });
    canvas.fire('pointermove', { buttons: LEFT, x: 180, y: 100 });
    canvas.fire('pointerup', { buttons: 0, x: 180, y: 100 });
    canvas.fire('pointerdown', { buttons: LEFT, x: 900, y: 600 });
    expect(camera.yaw).toBe(18);
    canvas.fire('pointermove', { buttons: LEFT, x: 980, y: 600 });
    expect(camera.yaw).toBe(36);
  });
  it('adding the right button during a left drag switches to steering, without a jump', () => {
    const { canvas, camera, mouse } = setup();
    canvas.fire('pointerdown', { buttons: LEFT, x: 100, y: 100 });
    canvas.fire('pointermove', { buttons: LEFT, x: 500, y: 100 });
    canvas.fire('pointerdown', { buttons: LEFT | RIGHT, x: 500, y: 100 });
    expect([camera.yaw, mouse.characterYaw, mouse.moveForward]).toEqual([90, 90, true]);
    canvas.fire('pointerup', { buttons: RIGHT, x: 500, y: 100 }); // the left one is let go
    expect([mouse.mode, mouse.moveForward]).toEqual(['steer', false]);
  });
  it('the wheel gives −1 forwards, +1 backwards, and the page does not scroll', () => {
    const { canvas, wheels } = setup();
    expect(canvas.fire('wheel', { deltaY: -120 })).toBe(true);
    canvas.fire('wheel', { deltaY: 3 });
    canvas.fire('wheel', { deltaY: 0 });
    expect(wheels).toEqual([-1, 1]);
  });
});

describe('camera pointer binding: what a web page does to a drag', () => {
  it('the right button never opens the browser’s menu on the canvas', () => {
    const { canvas } = setup();
    expect(canvas.fire('contextmenu')).toBe(true);
    expect(canvas.fire('pointerdown', { buttons: RIGHT, x: 10, y: 10 })).toBe(true);
  });
  it('nor anywhere on the page while a button is held on the canvas (released over a menu, a panel…)', () => {
    const { canvas, win } = setup();
    expect(win.fire('contextmenu')).toBe(false); // no drag: the page behaves normally
    canvas.fire('pointerdown', { buttons: RIGHT, x: 10, y: 10 });
    expect(win.fire('contextmenu')).toBe(true);
  });
  it('a LOST release (the « up » never arrives): the next event reporting no button ends the drag — nothing turns for ever', () => {
    const { canvas, camera, mouse } = setup();
    canvas.fire('pointerdown', { buttons: RIGHT, x: 500, y: 300 });
    canvas.fire('pointermove', { buttons: RIGHT, x: 600, y: 300 });
    expect(camera.yaw).toBe(22.5);
    // The button is released somewhere the page never hears about. Then the mouse simply moves, no button held.
    canvas.fire('pointermove', { buttons: 0, x: 900, y: 500 });
    canvas.fire('pointermove', { buttons: 0, x: 100, y: 100 });
    canvas.fire('pointermove', { buttons: 0, x: 1200, y: 700 });
    expect([camera.yaw, camera.pitch, mouse.mode]).toEqual([22.5, 0, 'none']);
  });
  it('the release outside the canvas is still heard: through the capture, or else through the window', () => {
    const { canvas, win, camera, mouse } = setup();
    canvas.fire('pointerdown', { buttons: LEFT, x: 500, y: 300 });
    win.fire('pointermove', { buttons: LEFT, x: 2000, y: 300 }); // far outside
    expect(camera.yaw).toBeCloseTo(337.5, 9);
    win.fire('pointerup', { buttons: 0, x: 2000, y: 300 });
    expect(mouse.mode).toBe('none');
    // The window's events are ignored when no drag is on.
    win.fire('pointermove', { buttons: LEFT, x: 0, y: 0 });
    expect(camera.yaw).toBeCloseTo(337.5, 9);
  });
  it.each([
    ['the window loses focus', (t: ReturnType<typeof setup>) => t.win.fire('blur')],
    ['the pointer is cancelled', (t: ReturnType<typeof setup>) => t.canvas.fire('pointercancel')],
    ['the page enters or leaves full screen', (t: ReturnType<typeof setup>) => t.doc.fire('fullscreenchange')],
    ['the page is hidden', (t: ReturnType<typeof setup>) => { t.doc.hidden = true; t.doc.fire('visibilitychange'); }],
    ['the pointer lock is lost', (t: ReturnType<typeof setup>) => t.doc.fire('pointerlockchange')],
    ['the capture is lost with no button held', (t: ReturnType<typeof setup>) => t.canvas.fire('lostpointercapture', { buttons: 0 })],
  ])('%s: every button is released, and only a NEW press starts turning again', (_, happen) => {
    const t = setup();
    t.canvas.fire('pointerdown', { buttons: RIGHT, x: 500, y: 300 });
    t.canvas.fire('pointermove', { buttons: RIGHT, x: 580, y: 300 });
    happen(t);
    expect([t.mouse.mode, t.mouse.moveForward]).toEqual(['none', false]);
    // The browser may still report the button as held (it was never released for it): moving turns nothing.
    t.canvas.fire('pointermove', { buttons: RIGHT, x: 1500, y: 900 });
    t.win.fire('pointermove', { buttons: RIGHT, x: 100, y: 100 });
    expect([t.camera.yaw, t.mouse.mode]).toEqual([18, 'none']);
    // A new press starts a new drag, from its own position.
    t.canvas.fire('pointerdown', { buttons: RIGHT, x: 300, y: 300 });
    t.canvas.fire('pointermove', { buttons: RIGHT, x: 380, y: 300 });
    expect(t.camera.yaw).toBe(36);
  });
  it('a button held from elsewhere (an item dragged from the interface) does not turn the camera over the canvas', () => {
    const { canvas, camera, mouse } = setup();
    canvas.fire('pointermove', { buttons: LEFT, x: 100, y: 100 });
    canvas.fire('pointermove', { buttons: LEFT, x: 600, y: 400 });
    expect([camera.yaw, camera.pitch, mouse.mode]).toEqual([0, 0, 'none']);
  });
  it('with the pointer locked the browser’s movementX / movementY are used (positions no longer change)', () => {
    const t = setup();
    t.doc.pointerLockElement = t.canvas;
    t.canvas.fire('pointerdown', { buttons: LEFT, x: 500, y: 300 });
    t.canvas.fire('pointermove', { buttons: LEFT, x: 500, y: 300, movementX: 80, movementY: 60 });
    expect([t.camera.yaw, t.camera.pitch]).toEqual([18, 9]);
  });
  it('native drag-and-drop and text selection do not start from the canvas', () => {
    const { canvas } = setup();
    expect([canvas.fire('dragstart'), canvas.fire('selectstart')]).toEqual([true, true]);
  });
  it('unbinding removes every listener', () => {
    const t = setup();
    t.unbind();
    t.canvas.fire('pointerdown', { buttons: LEFT, x: 0, y: 0 });
    t.canvas.fire('pointermove', { buttons: LEFT, x: 400, y: 0 });
    expect(t.camera.yaw).toBe(0);
    expect([...t.canvas.listeners.values(), ...t.win.listeners.values(), ...t.doc.listeners.values()].every((list) => list.length === 0)).toBe(true);
  });
});
