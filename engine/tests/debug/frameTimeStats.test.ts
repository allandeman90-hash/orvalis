import { describe, expect, it } from 'vitest';
import { FrameTimeStats } from '../../src/debug';

describe('FrameTimeStats', () => {
  it('is empty and safe before any sample', () => {
    const s = new FrameTimeStats();
    expect([s.sampleCount, s.averageMs, s.maxMs, s.fps]).toEqual([0, 0, 0, 0]);
  });
  it('60 fps frames give 60 fps', () => {
    const s = new FrameTimeStats();
    for (let i = 0; i < 60; i++) s.push(1000 / 60);
    expect(s.fps).toBeCloseTo(60, 6);
    expect(s.averageMs).toBeCloseTo(16.6667, 3);
    expect(s.maxMs).toBeCloseTo(16.6667, 3);
  });
  it('fps comes from the mean frame time, not the mean of rates', () => {
    const s = new FrameTimeStats();
    s.push(10);
    s.push(30); // 2 frames in 40 ms → 50 fps (mean of 100 and 33.3 fps would be 66.7)
    expect(s.averageMs).toBe(20);
    expect(s.fps).toBe(50);
    expect(s.maxMs).toBe(30);
  });
  it('keeps only the most recent window', () => {
    const s = new FrameTimeStats(4);
    for (const v of [100, 100, 100, 100, 10, 10, 10, 10]) s.push(v);
    expect(s.sampleCount).toBe(4);
    expect(s.averageMs).toBe(10);
    expect(s.maxMs).toBe(10); // the old 100 ms spikes have left the window
  });
  it('a spike stays visible in max while it is in the window', () => {
    const s = new FrameTimeStats(4);
    for (const v of [16, 16, 200, 16]) s.push(v);
    expect(s.maxMs).toBe(200);
    s.push(16);
    s.push(16);
    s.push(16);
    expect(s.maxMs).toBe(16);
  });
  it('ignores zero, negative, NaN and infinite samples', () => {
    const s = new FrameTimeStats();
    for (const v of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) s.push(v);
    expect(s.sampleCount).toBe(0);
    s.push(20);
    expect([s.sampleCount, s.fps]).toEqual([1, 50]);
  });
  it('reset clears the window', () => {
    const s = new FrameTimeStats();
    s.push(20);
    s.reset();
    expect([s.sampleCount, s.fps, s.maxMs]).toEqual([0, 0, 0]);
  });
  it('rejects an invalid window size', () => {
    for (const n of [0, -1, 2.5, Number.NaN]) expect(() => new FrameTimeStats(n)).toThrow(/window size/);
  });
});
