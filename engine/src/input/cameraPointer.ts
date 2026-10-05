/**
 * Binds the mouse to the gameplay camera in a WEB PAGE (P7.3).
 *
 * A browser is a hostile place for « hold a button and drag »: the right button opens a context menu, a release
 * can happen outside the window or during a switch to full screen, the tab can lose focus mid-drag. A handler
 * that remembers « the button went down » and waits for « it went up » then keeps turning the camera for ever.
 * So this binding never trusts its memory:
 * - the buttons are read from EVERY event's `buttons` bitmask; an event that says « no button » ends the drag,
 *   whatever was missed before;
 * - the pointer is CAPTURED on press, so the release reaches the canvas even outside it or outside the window;
 * - the context menu is suppressed on the canvas (and on the whole window while a button is held on the canvas);
 * - losing the capture, a cancelled pointer, the window losing focus, the page being hidden, entering or leaving
 *   full screen and losing the pointer lock all release every button;
 * - the movement is the difference of positions between two events of the same drag — a jump of the pointer
 *   between two drags (or after a release) is never applied; while the pointer is locked, the browser's
 *   movementX / movementY are used instead;
 * - only a PRESS on the canvas starts a drag: a button held from elsewhere (an item dragged from the interface,
 *   a drag ended by one of the events above) does not turn the camera when it passes over the canvas;
 * - native drag-and-drop and text selection are not started from the canvas.
 */
export interface CameraPointerSink {
  /** `buttons`: bitmask now held (1 = left, 2 = right). dx, dy: movement since the last event of this drag. */
  update(buttons: number, dx: number, dy: number): void;
  /** Every button released. */
  release(): void;
  /** One mouse-wheel event: −1 = forwards, +1 = backwards. */
  wheel?(direction: number): void;
}

/** The parts of the DOM this needs, so that it can be tested without a browser. */
export interface PointerEventLike {
  readonly buttons: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly movementX?: number;
  readonly movementY?: number;
  readonly pointerId?: number;
  preventDefault(): void;
}
type Listener = (event: Event) => void;
export interface EventTargetLike {
  addEventListener(type: string, listener: Listener, options?: { passive?: boolean }): void;
  removeEventListener(type: string, listener: Listener): void;
}
export interface CanvasLike extends EventTargetLike {
  setPointerCapture?(pointerId: number): void;
  releasePointerCapture?(pointerId: number): void;
  hasPointerCapture?(pointerId: number): boolean;
}
export interface DocumentLike extends EventTargetLike {
  readonly hidden?: boolean;
  readonly pointerLockElement?: unknown;
}

const HELD = 3; // left | right

/** @returns a function that removes every listener */
export function bindCameraPointer(canvas: CanvasLike, win: EventTargetLike, doc: DocumentLike, sink: CameraPointerSink): () => void {
  let dragging = false, lastX = 0, lastY = 0;
  const removers: Array<() => void> = [];
  const on = (target: EventTargetLike, type: string, listener: (event: PointerEventLike & { deltaY?: number }) => void, options?: { passive?: boolean }): void => {
    const handler = listener as unknown as Listener;
    target.addEventListener(type, handler, options);
    removers.push(() => target.removeEventListener(type, handler));
  };
  const end = (): void => {
    dragging = false;
    sink.release();
  };
  const capture = (event: PointerEventLike, take: boolean): void => {
    if (event.pointerId === undefined) return;
    try {
      if (take) canvas.setPointerCapture?.(event.pointerId);
      else if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture?.(event.pointerId);
    } catch {
      // The pointer may already be gone: capture is a help, not a requirement.
    }
  };
  /** One event of a drag: the buttons it reports are the truth. */
  const track = (event: PointerEventLike): void => {
    const buttons = event.buttons & HELD;
    if (buttons === 0) {
      if (dragging) {
        capture(event, false);
        end();
      }
      return;
    }
    const locked = doc.pointerLockElement === canvas;
    const dx = !dragging ? 0 : locked ? (event.movementX ?? 0) : event.clientX - lastX, dy = !dragging ? 0 : locked ? (event.movementY ?? 0) : event.clientY - lastY;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    sink.update(buttons, dx, dy);
  };

  on(canvas, 'pointerdown', (event) => {
    if ((event.buttons & HELD) === 0) return;
    event.preventDefault(); // no text selection, no focus change, no native drag
    capture(event, true);
    track(event);
  });
  // With the capture these reach the canvas wherever the pointer is; without it (old browsers) the window's do.
  on(canvas, 'pointermove', (event) => {
    if (dragging) track(event);
  });
  on(canvas, 'pointerup', (event) => {
    if (dragging) track(event);
  });
  on(win, 'pointermove', (event) => {
    if (dragging) track(event);
  });
  on(win, 'pointerup', (event) => {
    if (dragging) track(event);
  });
  on(canvas, 'pointercancel', end);
  on(canvas, 'lostpointercapture', (event) => {
    // Losing the capture while the browser still reports a held button is fine (the window's events take over);
    // losing it with no button held ends the drag.
    if ((event.buttons & HELD) === 0) end();
  });
  // The right button must never open the browser's menu over the game — nor anywhere while a drag is going on.
  on(canvas, 'contextmenu', (event) => event.preventDefault());
  on(win, 'contextmenu', (event) => {
    if (dragging) event.preventDefault();
  });
  on(canvas, 'dragstart', (event) => event.preventDefault());
  on(canvas, 'selectstart', (event) => event.preventDefault());
  on(win, 'blur', end);
  on(doc, 'visibilitychange', () => {
    if (doc.hidden) end();
  });
  on(doc, 'fullscreenchange', end);
  on(doc, 'webkitfullscreenchange', end);
  on(doc, 'pointerlockchange', () => {
    if (doc.pointerLockElement !== canvas) end();
  });
  if (sink.wheel) {
    const wheel = sink.wheel.bind(sink);
    on(canvas, 'wheel', (event) => {
      event.preventDefault(); // the page must not scroll or zoom
      if (event.deltaY) wheel(Math.sign(event.deltaY));
    }, { passive: false });
  }
  return () => {
    for (const remove of removers) remove();
  };
}
