import { describe, expect, it } from 'vitest';
import { clockToDayUnits, DAY_UNITS, dayUnitsDelta, dayUnitsToClock, DEFAULT_WORLD_CLOCK_CONFIG, formatDayUnits, UNITS_PER_HOUR, WorldClock, type WorldClockConfig, wrapDayUnits } from '../../src/environment';

/** A day of 2880 real seconds: exactly 1 unit per second, 0.001 unit per ms. */
const SIMPLE: WorldClockConfig = { daySeconds: 2880, maxSkew: 0.5, minSmoothingMs: 2000, snapThresholdUnits: 20 };

describe('day units', () => {
  it('has the domain of the spec: 2880 half-minute units, 0..2879', () => {
    expect(DAY_UNITS).toBe(2880);
    expect(UNITS_PER_HOUR).toBe(120);
    expect(DAY_UNITS * 30).toBe(24 * 3600); // 30 game seconds per unit
  });

  it('wraps any time into [0, 2880)', () => {
    expect(wrapDayUnits(0)).toBe(0);
    expect(wrapDayUnits(2879.5)).toBe(2879.5);
    expect(wrapDayUnits(2880)).toBe(0);
    expect(wrapDayUnits(2881)).toBe(1);
    expect(wrapDayUnits(-1)).toBe(2879);
    expect(wrapDayUnits(-2880 * 3 + 7)).toBe(7);
    expect(wrapDayUnits(-1e-13)).toBe(0); // would round up to 2880
    expect(Object.is(wrapDayUnits(-0), 0)).toBe(true);
    expect(() => wrapDayUnits(Number.NaN)).toThrow(/finite/);
    expect(() => wrapDayUnits(Number.POSITIVE_INFINITY)).toThrow(/finite/);
  });

  it('measures the shortest signed way around the day', () => {
    expect(dayUnitsDelta(10, 15)).toBe(5);
    expect(dayUnitsDelta(15, 10)).toBe(-5);
    expect(dayUnitsDelta(2875, 5)).toBe(10); // across midnight
    expect(dayUnitsDelta(5, 2875)).toBe(-10);
    expect(dayUnitsDelta(0, 1440)).toBe(-1440); // half a day: the range is [−1440, 1440)
    expect(dayUnitsDelta(0, 1439)).toBe(1439);
  });

  it('converts to and from hours and minutes', () => {
    expect(dayUnitsToClock(0)).toEqual({ unit: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(dayUnitsToClock(1)).toEqual({ unit: 1, hours: 0, minutes: 0, seconds: 30 });
    expect(dayUnitsToClock(1740)).toEqual({ unit: 1740, hours: 14, minutes: 30, seconds: 0 });
    expect(dayUnitsToClock(2879.99)).toEqual({ unit: 2879, hours: 23, minutes: 59, seconds: 59 });
    expect(dayUnitsToClock(2880 + 121.5)).toEqual({ unit: 121, hours: 1, minutes: 0, seconds: 45 });
    expect(formatDayUnits(1740)).toBe('14:30');
    expect(formatDayUnits(0)).toBe('00:00');
    expect(formatDayUnits(2879)).toBe('23:59');
    expect(formatDayUnits(-1)).toBe('23:59');
    expect(clockToDayUnits(14, 30)).toBe(1740);
    expect(clockToDayUnits(24)).toBe(0);
    expect(clockToDayUnits(0, 0.5)).toBe(1);
    for (let unit = 0; unit < DAY_UNITS; unit++) {
      const c = dayUnitsToClock(unit);
      if (c.unit !== unit || clockToDayUnits(c.hours, c.minutes + c.seconds / 60) !== unit) throw new Error(`round trip failed at unit ${unit}`);
    }
  });
});

describe('WorldClock: local advance', () => {
  it('advances continuously at the configured day length and wraps at midnight', () => {
    const clock = new WorldClock(100, 5000, SIMPLE);
    expect(clock.timeAt(5000)).toBe(100);
    expect(clock.timeAt(5500)).toBeCloseTo(100.5, 9);
    expect(clock.unitAt(5999)).toBe(100);
    expect(clock.unitAt(6000)).toBe(101);
    expect(clock.timeAt(5000 + 2780_000)).toBeCloseTo(0, 6); // midnight
    expect(clock.timeAt(5000 + 2880_000)).toBeCloseTo(100, 6); // one full day later
    expect(clock.timeAt(5000 + 10 * 2880_000 + 250)).toBeCloseTo(100.25, 6);
    expect(clock.unitsPerMs).toBeCloseTo(0.001, 15);
  });

  it('uses the Orvalis day by default: 24 real minutes, one unit per half second', () => {
    expect(DEFAULT_WORLD_CLOCK_CONFIG.daySeconds).toBe(1440);
    const clock = new WorldClock(clockToDayUnits(12), 0);
    expect(clock.timeAt(500)).toBeCloseTo(1441, 9);
    expect(formatDayUnits(clock.timeAt(60_000))).toBe('13:00'); // one real minute = one game hour
    expect(clock.timeAt(1440_000)).toBeCloseTo(1440, 6);
  });

  it('does not depend on how often it is read', () => {
    const a = new WorldClock(7, 0, SIMPLE), b = new WorldClock(7, 0, SIMPLE);
    for (let t = 0; t <= 100_000; t += 16.6667) a.timeAt(t);
    expect(a.timeAt(100_000)).toBe(b.timeAt(100_000));
  });

  it('never goes back when the local clock does', () => {
    const clock = new WorldClock(50, 1000, SIMPLE);
    expect(clock.timeAt(3000)).toBeCloseTo(52, 9);
    expect(clock.timeAt(2000)).toBeCloseTo(52, 9); // earlier nowMs: read as the latest seen
    expect(clock.timeAt(4000)).toBeCloseTo(53, 9);
    expect(() => clock.timeAt(Number.NaN)).toThrow(/finite/);
  });

  it('refuses a nonsensical configuration', () => {
    expect(() => new WorldClock(0, 0, { ...SIMPLE, daySeconds: 0 })).toThrow(/daySeconds/);
    expect(() => new WorldClock(0, 0, { ...SIMPLE, daySeconds: Number.POSITIVE_INFINITY })).toThrow(/daySeconds/);
    expect(() => new WorldClock(0, 0, { ...SIMPLE, maxSkew: 1 })).toThrow(/maxSkew/);
    expect(() => new WorldClock(0, 0, { ...SIMPLE, maxSkew: 0 })).toThrow(/maxSkew/);
    expect(() => new WorldClock(0, 0, { ...SIMPLE, minSmoothingMs: -1 })).toThrow(/minSmoothingMs/);
    expect(() => new WorldClock(0, 0, { ...SIMPLE, snapThresholdUnits: 2000 })).toThrow(/snapThresholdUnits/);
    expect(() => new WorldClock(Number.NaN, 0, SIMPLE)).toThrow(/finite/);
    expect(() => new WorldClock(0, Number.NaN, SIMPLE)).toThrow(/nowMs/);
    expect(new WorldClock(2880 + 5, 0, SIMPLE).timeAt(0)).toBe(5); // start time is wrapped
  });
});

describe('WorldClock: sync with the server', () => {
  it('reports the error and changes nothing visible when the client is already right', () => {
    const clock = new WorldClock(100, 0, SIMPLE);
    expect(clock.sync(110, 10_000)).toEqual({ errorUnits: 0, snapped: false, smoothingMs: 0 });
    expect(clock.timeAt(10_000)).toBeCloseTo(110, 9);
    expect(clock.isSmoothingAt(10_000)).toBe(false);
    expect(clock.syncCount).toBe(1);
  });

  it('absorbs a small error without a jump: client behind catches up faster, then runs at normal speed', () => {
    const clock = new WorldClock(100, 0, SIMPLE);
    // At 10 s the client shows 110; the server says 112: the client is 2 units behind.
    const r = clock.sync(112, 10_000);
    expect(r.errorUnits).toBeCloseTo(-2, 9);
    expect(r.snapped).toBe(false);
    expect(r.smoothingMs).toBeCloseTo(4000, 6); // 2 units at 50 % of 1 unit/s
    expect(clock.timeAt(10_000)).toBeCloseTo(110, 9); // no jump at the sync
    expect(clock.isSmoothingAt(10_001)).toBe(true);
    expect(clock.timeAt(12_000)).toBeCloseTo(113, 9); // 1.5 × speed: +3 units in 2 s
    expect(clock.timeAt(14_000)).toBeCloseTo(116, 9); // caught up: server time 112 + 4
    expect(clock.isSmoothingAt(14_000)).toBe(false);
    expect(clock.timeAt(20_000)).toBeCloseTo(122, 9);
  });

  it('absorbs a small error without a jump: client ahead slows down, never stops, never goes back', () => {
    const clock = new WorldClock(100, 0, SIMPLE);
    const r = clock.sync(108.5, 10_000); // client shows 110: 1.5 units ahead
    expect(r.errorUnits).toBeCloseTo(1.5, 9);
    expect(r.smoothingMs).toBeCloseTo(3000, 6);
    let previous = clock.timeAt(10_000);
    expect(previous).toBeCloseTo(110, 9);
    for (let t = 10_100; t <= 14_000; t += 100) {
      const now = clock.timeAt(t);
      const speed = (now - previous) / 0.1; // units per second
      expect(speed).toBeGreaterThan(0.499);
      expect(speed).toBeLessThan(1.001);
      previous = now;
    }
    expect(previous).toBeCloseTo(112.5, 9); // at 14 s: server 108.5 + 4, error fully absorbed (since 13 s)
  });

  it('spreads a tiny error over the minimum smoothing time', () => {
    const clock = new WorldClock(100, 0, SIMPLE);
    const r = clock.sync(110.1, 10_000); // 0.1 unit behind; at 50 % it would take 200 ms
    expect(r.smoothingMs).toBe(2000);
    expect(clock.timeAt(11_000)).toBeCloseTo(111.05, 9); // half of the error absorbed
    expect(clock.timeAt(12_000)).toBeCloseTo(112.1, 9);
  });

  it('jumps when the error is larger than the threshold, or when asked to', () => {
    const clock = new WorldClock(100, 0, SIMPLE);
    const r = clock.sync(500, 10_000);
    expect(r).toEqual({ errorUnits: -390, snapped: true, smoothingMs: 0 });
    expect(clock.timeAt(10_000)).toBe(500);
    expect(clock.timeAt(11_000)).toBeCloseTo(501, 9);
    // Exactly at the threshold: still smoothed. Just over: jump.
    expect(clock.sync(521, 11_000).snapped).toBe(false); // error −20
    const c2 = new WorldClock(100, 0, SIMPLE);
    expect(c2.sync(120.001, 0).snapped).toBe(true);
    const c3 = new WorldClock(100, 0, SIMPLE);
    expect(c3.sync(101, 0, { snap: true })).toEqual({ errorUnits: -1, snapped: true, smoothingMs: 0 });
    expect(c3.timeAt(0)).toBe(101);
  });

  it('measures the error the short way across midnight', () => {
    const clock = new WorldClock(2878, 0, SIMPLE);
    const r = clock.sync(3, 0); // server is 5 units later, past midnight
    expect(r.errorUnits).toBeCloseTo(-5, 9);
    expect(r.snapped).toBe(false);
    expect(clock.timeAt(0)).toBe(2878);
    const times: number[] = [];
    for (let t = 0; t <= 10_000; t += 500) times.push(dayUnitsDelta(2878, clock.timeAt(t)));
    for (let k = 1; k < times.length; k++) expect(times[k]!).toBeGreaterThan(times[k - 1]!);
    expect(clock.timeAt(10_000)).toBeCloseTo(13, 9); // 3 + 10, smoothing (10 s) just finished
  });

  it('takes a new sync during smoothing from what is shown at that moment', () => {
    const clock = new WorldClock(100, 0, SIMPLE);
    clock.sync(102, 0); // shows 100, 2 behind, 4 s of smoothing
    expect(clock.timeAt(2000)).toBeCloseTo(103, 9);
    const r = clock.sync(104.5, 2000); // server now says 104.5: shown 103 → 1.5 behind
    expect(r.errorUnits).toBeCloseTo(-1.5, 9);
    expect(clock.timeAt(2000)).toBeCloseTo(103, 9);
    expect(clock.timeAt(2000 + r.smoothingMs)).toBeCloseTo(104.5 + r.smoothingMs / 1000, 9);
    expect(clock.syncCount).toBe(2);
  });
});

describe('WorldClock: debug controls', () => {
  it('setTime jumps and cancels any smoothing', () => {
    const clock = new WorldClock(100, 0, SIMPLE);
    clock.sync(102, 0);
    clock.setTime(clockToDayUnits(6), 1000);
    expect(clock.timeAt(1000)).toBe(720);
    expect(clock.isSmoothingAt(1000)).toBe(false);
    expect(clock.timeAt(2000)).toBeCloseTo(721, 9);
  });

  it('setSpeed changes the pace without a jump; 0 pauses', () => {
    const clock = new WorldClock(100, 0, SIMPLE);
    clock.setSpeed(60, 10_000);
    expect(clock.speedMultiplier).toBe(60);
    expect(clock.timeAt(10_000)).toBeCloseTo(110, 9);
    expect(clock.timeAt(11_000)).toBeCloseTo(170, 9);
    clock.setSpeed(0, 11_000);
    expect(clock.timeAt(500_000)).toBeCloseTo(170, 9);
    // A paused clock cannot smooth: a sync jumps.
    expect(clock.sync(175, 500_000)).toEqual({ errorUnits: -5, snapped: true, smoothingMs: 0 });
    expect(clock.timeAt(900_000)).toBe(175);
    clock.setSpeed(1, 900_000);
    expect(clock.timeAt(901_000)).toBeCloseTo(176, 9);
    expect(() => clock.setSpeed(-1, 901_000)).toThrow(/speed/);
  });

  it('can start paused or fast: the start speed applies from the first instant', () => {
    // Regression (found by the smoke test): pausing right AFTER construction let 0.0002 unit slip by.
    const paused = new WorldClock(1740, 1000, SIMPLE, 0);
    expect(paused.timeAt(1000.1)).toBe(1740);
    expect(paused.timeAt(1e9)).toBe(1740);
    expect(new WorldClock(0, 0, SIMPLE, 60).timeAt(1000)).toBeCloseTo(60, 9);
    expect(() => new WorldClock(0, 0, SIMPLE, -1)).toThrow(/speed/);
  });

  it('smooths in proportion to the debug speed', () => {
    const clock = new WorldClock(100, 0, { ...SIMPLE, minSmoothingMs: 0 });
    clock.setSpeed(10, 0);
    const r = clock.sync(105, 0); // 5 behind at 10 units/s → 50 % skew = 5 units/s → 1 s
    expect(r.smoothingMs).toBeCloseTo(1000, 6);
    expect(clock.timeAt(1000)).toBeCloseTo(115, 9);
  });
});
