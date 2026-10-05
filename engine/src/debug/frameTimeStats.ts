/**
 * Rolling statistics over the most recent frame durations. Pure logic (no
 * browser API) so it can be unit-tested; the overlay only formats its output.
 */
export class FrameTimeStats {
  private readonly samples: Float64Array;
  private next = 0;
  private count = 0;

  /** @param windowSize number of recent frames kept (120 ≈ 2 s at 60 fps) */
  constructor(windowSize = 120) {
    if (!Number.isInteger(windowSize) || windowSize <= 0) throw new Error(`FrameTimeStats: invalid window size ${windowSize}`);
    this.samples = new Float64Array(windowSize);
  }

  /** Records one frame duration in milliseconds. Non-positive or non-finite values are ignored. */
  push(frameMs: number): void {
    if (!(frameMs > 0) || !Number.isFinite(frameMs)) return;
    this.samples[this.next] = frameMs;
    this.next = (this.next + 1) % this.samples.length;
    if (this.count < this.samples.length) this.count++;
  }

  get sampleCount(): number {
    return this.count;
  }

  /** Mean frame duration over the window, in ms; 0 when there is no sample. */
  get averageMs(): number {
    if (this.count === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.count; i++) sum += this.samples[i]!;
    return sum / this.count;
  }

  /** Longest frame of the window, in ms; 0 when there is no sample. */
  get maxMs(): number {
    let max = 0;
    for (let i = 0; i < this.count; i++) if (this.samples[i]! > max) max = this.samples[i]!;
    return max;
  }

  /** Frames per second derived from the mean frame duration; 0 when there is no sample. */
  get fps(): number {
    const avg = this.averageMs;
    return avg > 0 ? 1000 / avg : 0;
  }

  reset(): void {
    this.next = 0;
    this.count = 0;
  }
}
