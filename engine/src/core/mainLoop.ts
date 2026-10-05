import { DEFAULT_FIXED_STEPPER_CONFIG, FixedStepper, type FixedStepperConfig } from './fixedStepper';

/** Abstraction over requestAnimationFrame so the loop can be driven by tests. */
export interface FrameScheduler {
  request(callback: (timeMs: number) => void): number;
  cancel(handle: number): void;
}

export interface FrameInfo {
  /** Clamped real time elapsed since the previous frame, in milliseconds. */
  readonly frameDeltaMs: number;
  /** Interpolation factor between the two latest simulation states, in [0, 1). */
  readonly alpha: number;
  /** Fixed steps executed during this frame. */
  readonly steps: number;
  /** Frames rendered since start(). */
  readonly frameIndex: number;
}

export interface MainLoopCallbacks {
  /** Fixed-rate simulation step. `stepMs` is constant. */
  fixedUpdate(stepMs: number): void;
  /** Once per displayed frame, after the simulation steps. */
  render(frame: FrameInfo): void;
}

export class MainLoop {
  private readonly stepper: FixedStepper;
  private handle: number | null = null;
  private lastTimeMs: number | null = null;
  private frameIndex = 0;
  private totalSteps = 0;

  constructor(
    private readonly scheduler: FrameScheduler,
    private readonly callbacks: MainLoopCallbacks,
    config: FixedStepperConfig = DEFAULT_FIXED_STEPPER_CONFIG,
  ) {
    this.stepper = new FixedStepper(config);
  }

  get running(): boolean {
    return this.handle !== null;
  }

  get framesRendered(): number {
    return this.frameIndex;
  }

  get stepsSimulated(): number {
    return this.totalSteps;
  }

  start(): void {
    if (this.running) return;
    this.lastTimeMs = null;
    this.stepper.reset();
    this.handle = this.scheduler.request(this.tick);
  }

  stop(): void {
    if (this.handle === null) return;
    this.scheduler.cancel(this.handle);
    this.handle = null;
  }

  private readonly tick = (timeMs: number): void => {
    // Re-arm first: if a callback throws, the error surfaces but the loop survives.
    this.handle = this.scheduler.request(this.tick);
    const delta = this.lastTimeMs === null ? 0 : timeMs - this.lastTimeMs;
    this.lastTimeMs = timeMs;
    const { steps, alpha, frameDeltaMs } = this.stepper.advance(delta);
    for (let i = 0; i < steps; i++) {
      this.callbacks.fixedUpdate(this.stepper.config.stepMs);
      // stop() called from inside the simulation: abandon the frame.
      if (!this.running) return;
    }
    this.totalSteps += steps;
    this.callbacks.render({ frameDeltaMs, alpha, steps, frameIndex: this.frameIndex });
    this.frameIndex++;
  };
}

/** Scheduler backed by the browser's requestAnimationFrame. */
export function browserScheduler(): FrameScheduler {
  return {
    request: (cb) => requestAnimationFrame(cb),
    cancel: (h) => cancelAnimationFrame(h),
  };
}
