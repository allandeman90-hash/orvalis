import { describe, expect, it } from 'vitest';
import { FixedStepper } from '../../src/core/fixedStepper';

const cfg = { stepMs: 10, maxFrameDeltaMs: 250 };

describe('FixedStepper', () => {
  it('runs one step per step-length frame', () => {
    const s = new FixedStepper(cfg);
    expect(s.advance(10)).toEqual({ steps: 1, alpha: 0, frameDeltaMs: 10 });
  });
  it('accumulates short frames until a step is due', () => {
    const s = new FixedStepper(cfg);
    expect(s.advance(4).steps).toBe(0);
    expect(s.advance(4).steps).toBe(0);
    const r = s.advance(4);
    expect(r.steps).toBe(1);
    expect(r.alpha).toBeCloseTo(0.2, 10);
  });
  it('runs several steps for a long frame and keeps the remainder', () => {
    const r = new FixedStepper(cfg).advance(35);
    expect(r.steps).toBe(3);
    expect(r.alpha).toBeCloseTo(0.5, 10);
  });
  it('clamps a hitch to maxFrameDeltaMs', () => {
    const r = new FixedStepper(cfg).advance(60_000);
    expect(r.frameDeltaMs).toBe(250);
    expect(r.steps).toBe(25);
  });
  it('treats negative, zero and NaN deltas as no time', () => {
    const s = new FixedStepper(cfg);
    for (const d of [-5, 0, Number.NaN]) expect(s.advance(d)).toEqual({ steps: 0, alpha: 0, frameDeltaMs: 0 });
  });
  it('alpha stays in [0, 1)', () => {
    const s = new FixedStepper(cfg);
    for (let i = 0; i < 1000; i++) {
      const { alpha } = s.advance(1 + ((i * 7.3) % 40));
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });
  it('60 frames at 60 Hz give exactly 60 steps of 1/60 s (no float drift)', () => {
    const s = new FixedStepper({ stepMs: 1000 / 60, maxFrameDeltaMs: 250 });
    let steps = 0;
    for (let i = 0; i < 60; i++) steps += s.advance(1000 / 60).steps;
    expect(steps).toBe(60);
  });
  it('simulated time is independent of the render rate', () => {
    const run = (frameMs: number): number => {
      const s = new FixedStepper(cfg);
      let steps = 0;
      for (let t = 0; t < 10_000; t += frameMs) steps += s.advance(frameMs).steps;
      return steps;
    };
    expect(run(5)).toBe(1000); // 200 fps
    expect(run(20)).toBe(1000); // 50 fps
    expect(run(40)).toBe(1000); // 25 fps
  });
  it('reset drops the accumulated remainder', () => {
    const s = new FixedStepper(cfg);
    s.advance(9);
    s.reset();
    expect(s.advance(9).steps).toBe(0);
  });
  it('rejects invalid configuration', () => {
    expect(() => new FixedStepper({ stepMs: 0, maxFrameDeltaMs: 250 })).toThrow();
    expect(() => new FixedStepper({ stepMs: Number.NaN, maxFrameDeltaMs: 250 })).toThrow();
    expect(() => new FixedStepper({ stepMs: 10, maxFrameDeltaMs: 5 })).toThrow();
  });
});
