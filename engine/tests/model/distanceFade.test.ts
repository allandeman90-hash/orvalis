import { describe, expect, it } from 'vitest';
import { MODEL_FADE_BUCKETS, modelDistanceFade, modelFadeBucket } from '../../src/model';

describe('distance fade by size (spec §94)', () => {
  it('has the three recovered size classes: 40 → 50, 100 → 125, 150 → 200', () => {
    expect(MODEL_FADE_BUCKETS.map((b) => [b.maxRadius, b.fadeStart, b.fadeStart + b.fadeRange])).toEqual([[0.5, 40, 50], [2.5, 100, 125], [7, 150, 200]]);
    expect(MODEL_FADE_BUCKETS.map((b) => b.fadeRange)).toEqual([10, 25, 50]);
  });

  it('picks the class by bounding-sphere radius; above 7 there is none', () => {
    expect(modelFadeBucket(0.2)?.fadeStart).toBe(40);
    expect(modelFadeBucket(0.5)?.fadeStart).toBe(40);
    expect(modelFadeBucket(0.51)?.fadeStart).toBe(100);
    expect(modelFadeBucket(2.5)?.fadeStart).toBe(100);
    expect(modelFadeBucket(2.6)?.fadeStart).toBe(150);
    expect(modelFadeBucket(7)?.fadeStart).toBe(150);
    expect(modelFadeBucket(7.01)).toBeNull();
    expect(() => modelFadeBucket(-1)).toThrow(/radius/);
  });

  it.each([
    [0.5, 40, 50],
    [2, 100, 125],
    [5, 150, 200],
  ])('radius %d: 1 up to %d, linear, 0 from %d', (radius, start, end) => {
    const fadeAt = (d: number): number => modelDistanceFade([0, 0, 0], [d + radius, 0, 0], radius);
    expect(fadeAt(0)).toBe(1);
    expect(fadeAt(start)).toBe(1);
    expect(fadeAt((start + end) / 2)).toBeCloseTo(0.5, 9);
    expect(fadeAt(start + (end - start) * 0.9)).toBeCloseTo(0.1, 9);
    expect(fadeAt(end)).toBe(0);
    expect(fadeAt(end + 1000)).toBe(0);
  });

  it('measures to the NEAREST point of the sphere: d = distance to the centre − radius', () => {
    // Radius 5, centre 180 away → d = 175 → half faded.
    expect(modelDistanceFade([0, 0, 0], [0, 180, 0], 5)).toBeCloseTo(0.5, 9);
  });

  it('ignores height: only x and y count', () => {
    const level = modelDistanceFade([10, 20, 0], [10, 200, 0], 5);
    expect(modelDistanceFade([10, 20, 500], [10, 200, -300], 5)).toBe(level);
    expect(level).toBeCloseTo(0.5, 9);
  });

  it('a model bigger than 7 never fades by size', () => {
    expect(modelDistanceFade([0, 0, 0], [100000, 0, 0], 7.5)).toBe(1);
  });

  it('unitsPerYard scales both the radius and the distance', () => {
    // 2 engine units per yard: a radius of 10 units is 5 yd; 350 units to the sphere is 175 yd → half faded.
    expect(modelDistanceFade([0, 0, 0], [360, 0, 0], 10, 2)).toBeCloseTo(0.5, 9);
    // The same model with 1 unit per yard has a radius of 10 yd: too big to fade.
    expect(modelDistanceFade([0, 0, 0], [360, 0, 0], 10, 1)).toBe(1);
    expect(() => modelDistanceFade([0, 0, 0], [1, 0, 0], 1, 0)).toThrow(/unitsPerYard/);
  });
});
