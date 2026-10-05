/**
 * World clock (spec §10, §282–§283). The day is the domain 0 .. 2879: 2880
 * half-minute units of GAME time. The server owns the time; the client advances
 * a smooth local copy and is re-anchored now and then by a time sync — it never
 * asks for the time every frame.
 *
 * Pure logic: every method takes the local monotonic time (`nowMs`, e.g.
 * performance.now()) as an argument, so nothing here reads a real clock.
 *
 * FROM THE SPEC: the 0..2879 domain; « smooth local clock re-anchored by server time ».
 * OUR CHOICES (the document gives no number for them), all configurable:
 * - how long a game day lasts in real time (`daySeconds`);
 * - how a sync is absorbed: small errors are caught up or waited out by running
 *   the clock a little faster or slower (never backwards, never frozen), large
 *   errors jump at once.
 */
export const DAY_UNITS = 2880;
/** Game minutes per unit: a unit is half a minute, a day is 24 h. */
export const UNITS_PER_HOUR = DAY_UNITS / 24;

export interface WorldClockConfig {
  /** Real seconds for one full game day. Must be > 0. */
  readonly daySeconds: number;
  /**
   * While absorbing a sync error the clock runs between (1 − maxSkew) and
   * (1 + maxSkew) times its normal speed. In 0 < maxSkew < 1, so it never stops or goes back.
   */
  readonly maxSkew: number;
  /** Shortest real time over which a sync error is absorbed, in milliseconds (≥ 0). */
  readonly minSmoothingMs: number;
  /** A sync error larger than this (in units, 0 .. 1440) is not smoothed: the clock jumps. */
  readonly snapThresholdUnits: number;
}

/**
 * Default: a game day lasts 24 real MINUTES — the value the current Orvalis game
 * already uses (legacy `DAY_SECONDS = 24 * 60`), so one unit lasts half a real
 * second. A sync error is absorbed at ±50 % speed over at least 2 s, and more
 * than 20 units (10 game minutes = 10 real seconds) of error jumps. Our values.
 */
export const DEFAULT_WORLD_CLOCK_CONFIG: WorldClockConfig = { daySeconds: 24 * 60, maxSkew: 0.5, minSmoothingMs: 2000, snapThresholdUnits: 20 };

/** Wraps any finite number into [0, 2880). */
export function wrapDayUnits(units: number): number {
  if (!Number.isFinite(units)) throw new Error(`world clock: time must be finite (got ${units})`);
  const wrapped = units - Math.floor(units / DAY_UNITS) * DAY_UNITS;
  // A tiny negative input can round up to exactly 2880.
  return wrapped >= DAY_UNITS ? 0 : wrapped + 0;
}

/** Shortest signed way from `from` to `to` around the day, in [−1440, 1440). */
export function dayUnitsDelta(from: number, to: number): number {
  return wrapDayUnits(to - from + DAY_UNITS / 2) - DAY_UNITS / 2;
}

/** Integer unit 0..2879 and the game hour / minute / second it stands for. */
export function dayUnitsToClock(units: number): { readonly unit: number; readonly hours: number; readonly minutes: number; readonly seconds: number } {
  const wrapped = wrapDayUnits(units);
  const totalSeconds = Math.min(86399, Math.floor(wrapped * 30 + 1e-9));
  return { unit: Math.min(DAY_UNITS - 1, Math.floor(wrapped + 1e-9)), hours: Math.floor(totalSeconds / 3600), minutes: Math.floor(totalSeconds / 60) % 60, seconds: totalSeconds % 60 };
}

/** "HH:MM" of a time in units. */
export function formatDayUnits(units: number): string {
  const { hours, minutes } = dayUnitsToClock(units);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Units of a game time given as hours and minutes (minutes may be fractional). */
export function clockToDayUnits(hours: number, minutes = 0): number {
  return wrapDayUnits(hours * UNITS_PER_HOUR + minutes * 2);
}

export interface WorldClockSync {
  /** Local − server error at the moment of the sync, in units (signed, shortest way). */
  readonly errorUnits: number;
  /** True when the error was too large to smooth and the clock jumped. */
  readonly snapped: boolean;
  /** Real milliseconds over which the remaining error is absorbed (0 when snapped or exact). */
  readonly smoothingMs: number;
}

export class WorldClock {
  readonly config: WorldClockConfig;
  /** Authoritative time: `anchorUnits` at local time `anchorMs`, advancing at `rate` units per real ms. */
  private anchorUnits: number;
  private anchorMs: number;
  private rate: number;
  /** What is shown = authoritative + offset, the offset going linearly to 0 between offsetStartMs and offsetEndMs. */
  private offsetUnits = 0;
  private offsetStartMs = 0;
  private offsetEndMs = 0;
  private lastNowMs: number;
  private speed = 1;
  private syncs = 0;

  /** `speed`: debug multiplier from the very first instant (setting it afterwards would let a little time pass first). */
  constructor(startUnits: number, nowMs: number, config: WorldClockConfig = DEFAULT_WORLD_CLOCK_CONFIG, speed = 1) {
    if (!(config.daySeconds > 0) || !Number.isFinite(config.daySeconds)) throw new Error(`world clock: daySeconds must be a finite number > 0 (got ${config.daySeconds})`);
    if (!(config.maxSkew > 0 && config.maxSkew < 1)) throw new Error(`world clock: maxSkew must be in 0..1, both excluded (got ${config.maxSkew})`);
    if (!(config.minSmoothingMs >= 0) || !Number.isFinite(config.minSmoothingMs)) throw new Error(`world clock: minSmoothingMs must be a finite number ≥ 0 (got ${config.minSmoothingMs})`);
    if (!(config.snapThresholdUnits >= 0 && config.snapThresholdUnits <= DAY_UNITS / 2)) throw new Error(`world clock: snapThresholdUnits must be in 0..${DAY_UNITS / 2} (got ${config.snapThresholdUnits})`);
    if (!Number.isFinite(nowMs)) throw new Error(`world clock: nowMs must be finite (got ${nowMs})`);
    this.config = config;
    this.anchorUnits = wrapDayUnits(startUnits);
    this.anchorMs = nowMs;
    this.lastNowMs = nowMs;
    this.rate = DAY_UNITS / (config.daySeconds * 1000);
    if (!(speed >= 0) || !Number.isFinite(speed)) throw new Error(`world clock: speed must be a finite number ≥ 0 (got ${speed})`);
    this.speed = speed;
  }

  /** Units per real millisecond right now (normal rate × debug speed), without sync smoothing. */
  get unitsPerMs(): number {
    return this.rate * this.speed;
  }

  /** Debug speed multiplier (1 = normal, 0 = paused). */
  get speedMultiplier(): number {
    return this.speed;
  }

  /** How many syncs were received. */
  get syncCount(): number {
    return this.syncs;
  }

  /** The local clock never runs backwards: an earlier `nowMs` than the latest seen is read as the latest. */
  private clampNow(nowMs: number): number {
    if (!Number.isFinite(nowMs)) throw new Error(`world clock: nowMs must be finite (got ${nowMs})`);
    if (nowMs > this.lastNowMs) this.lastNowMs = nowMs;
    return this.lastNowMs;
  }

  private authoritativeAt(now: number): number {
    return this.anchorUnits + (now - this.anchorMs) * this.rate * this.speed;
  }

  private offsetAt(now: number): number {
    if (now >= this.offsetEndMs || this.offsetUnits === 0) return 0;
    return this.offsetUnits * (1 - (now - this.offsetStartMs) / (this.offsetEndMs - this.offsetStartMs));
  }

  /** The time shown, continuous, in [0, 2880). */
  timeAt(nowMs: number): number {
    const now = this.clampNow(nowMs);
    return wrapDayUnits(this.authoritativeAt(now) + this.offsetAt(now));
  }

  /** The integer unit 0..2879. */
  unitAt(nowMs: number): number {
    return dayUnitsToClock(this.timeAt(nowMs)).unit;
  }

  /** True while a sync error is still being absorbed. */
  isSmoothingAt(nowMs: number): boolean {
    return this.offsetAt(this.clampNow(nowMs)) !== 0;
  }

  /**
   * Time sync: the server says the time is `serverUnits` at local time `nowMs`
   * (the caller removes the network delay if it knows it).
   * `snap: true` forces a jump (first sync after login, teleport between worlds, debug).
   */
  sync(serverUnits: number, nowMs: number, options: { readonly snap?: boolean } = {}): WorldClockSync {
    const now = this.clampNow(nowMs);
    const shown = this.authoritativeAt(now) + this.offsetAt(now);
    const target = wrapDayUnits(serverUnits);
    const errorUnits = dayUnitsDelta(target, wrapDayUnits(shown));
    this.anchorUnits = target;
    this.anchorMs = now;
    this.syncs++;
    const effectiveRate = this.rate * this.speed;
    // A paused clock cannot absorb anything by running faster or slower: it jumps.
    if (options.snap || Math.abs(errorUnits) > this.config.snapThresholdUnits || errorUnits === 0 || effectiveRate === 0) {
      this.offsetUnits = 0;
      return { errorUnits, snapped: errorUnits !== 0, smoothingMs: 0 };
    }
    // Shown speed while smoothing = rate − error / duration; kept within ±maxSkew of the rate.
    const smoothingMs = Math.max(this.config.minSmoothingMs, Math.abs(errorUnits) / (this.config.maxSkew * effectiveRate));
    this.offsetUnits = errorUnits;
    this.offsetStartMs = now;
    this.offsetEndMs = now + smoothingMs;
    return { errorUnits, snapped: false, smoothingMs };
  }

  /** Debug: jumps to a time. */
  setTime(units: number, nowMs: number): void {
    const now = this.clampNow(nowMs);
    this.anchorUnits = wrapDayUnits(units);
    this.anchorMs = now;
    this.offsetUnits = 0;
  }

  /** Debug: runs the clock `multiplier` times faster (0 = paused). The time shown does not jump. */
  setSpeed(multiplier: number, nowMs: number): void {
    if (!(multiplier >= 0) || !Number.isFinite(multiplier)) throw new Error(`world clock: speed must be a finite number ≥ 0 (got ${multiplier})`);
    const now = this.clampNow(nowMs);
    // Re-anchor on what is shown now; a sync being absorbed is dropped (debug only).
    this.anchorUnits = wrapDayUnits(this.authoritativeAt(now) + this.offsetAt(now));
    this.anchorMs = now;
    this.offsetUnits = 0;
    this.speed = multiplier;
  }
}
