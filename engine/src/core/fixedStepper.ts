/**
 * Semi-fixed timestep accumulator (spec §281–§282: gameplay simulation rate must
 * not be coupled to render FPS). Pure logic, no browser API, fully unit-testable.
 */
export interface FixedStepperConfig {
  /** Duration of one simulation step, in milliseconds. */
  readonly stepMs: number;
  /**
   * Largest real frame delta accepted, in milliseconds. Longer hitches (tab in
   * background, debugger pause) are clamped so the simulation never tries to
   * catch up an unbounded amount of time.
   */
  readonly maxFrameDeltaMs: number;
}

export const DEFAULT_FIXED_STEPPER_CONFIG: FixedStepperConfig = {
  stepMs: 1000 / 60,
  // Spec §199: the original movement path subdivides large intervals with a
  // maximum integration step of ~250 ms; we use the same bound as hitch clamp.
  maxFrameDeltaMs: 250,
};

export interface StepResult {
  /** Number of fixed simulation steps to run this frame. */
  readonly steps: number;
  /** Interpolation factor in [0, 1) between the last two simulation states. */
  readonly alpha: number;
  /** Frame delta actually consumed after clamping, in milliseconds. */
  readonly frameDeltaMs: number;
}

export class FixedStepper {
  private accumulatorMs = 0;
  readonly config: FixedStepperConfig;

  constructor(config: FixedStepperConfig = DEFAULT_FIXED_STEPPER_CONFIG) {
    if (!(config.stepMs > 0)) throw new Error(`FixedStepper: stepMs must be > 0 (got ${config.stepMs})`);
    if (!(config.maxFrameDeltaMs >= config.stepMs)) {
      throw new Error('FixedStepper: maxFrameDeltaMs must be >= stepMs');
    }
    this.config = config;
  }

  /** Feeds one real frame delta and returns how many fixed steps are due. */
  advance(realDeltaMs: number): StepResult {
    const { stepMs, maxFrameDeltaMs } = this.config;
    // Negative or NaN deltas (clock going backwards, first frame) count as zero.
    const safe = realDeltaMs > 0 ? realDeltaMs : 0;
    const frameDeltaMs = Math.min(safe, maxFrameDeltaMs);
    this.accumulatorMs += frameDeltaMs;
    // Small epsilon so 60 frames of 16.666… ms yield exactly 60 steps despite float error.
    const steps = Math.floor(this.accumulatorMs / stepMs + 1e-9);
    this.accumulatorMs = Math.max(0, this.accumulatorMs - steps * stepMs);
    return { steps, alpha: this.accumulatorMs / stepMs, frameDeltaMs };
  }

  reset(): void {
    this.accumulatorMs = 0;
  }
}
