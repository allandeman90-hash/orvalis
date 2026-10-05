import { clockToDayUnits, DAY_UNITS, DEFAULT_WORLD_CLOCK_CONFIG } from './worldClock';

/**
 * World-clock options from the URL (development only, until a server gives the time):
 *   &time=<HH:MM> | <0..2879>     start time (default 12:00)
 *   &timeSpeed=<0..10000>         debug multiplier, 0 = paused (default 1)
 *   &daySeconds=<1..604800>       real seconds per game day (default 1440 = 24 minutes)
 *   &dayCycle=on (default) | off  off = the light and fog colours do not follow the clock
 *   &liquidTime=<0..1000000>      freezes the liquid animation at that time in ms (test control; default: real time)
 * Anything malformed or out of range falls back to the default: a typo must not break the page.
 */
export interface WorldClockRequest {
  readonly startUnits: number;
  readonly speed: number;
  readonly daySeconds: number;
  readonly dayCycle: boolean;
  /** Fixed time of the liquid animation in ms, or undefined for real time. */
  readonly liquidTimeMs: number | undefined;
}

/** Until a server sync exists, the day starts at noon. Our choice. */
export const DEFAULT_START_UNITS = clockToDayUnits(12);

function numberIn(value: string | null, min: number, max: number, fallback: number): number {
  if (value === null || !/^\s*\d{1,7}(\.\d{1,6})?\s*$/.test(value)) return fallback;
  const n = Number(value);
  return n >= min && n <= max ? n : fallback;
}

export function parseWorldClockRequest(search: string): WorldClockRequest {
  const params = new URLSearchParams(search);
  const time = params.get('time');
  let startUnits = DEFAULT_START_UNITS;
  const hm = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(time ?? '');
  if (hm) {
    const hours = Number(hm[1]), minutes = Number(hm[2]);
    if (hours <= 23 && minutes <= 59) startUnits = clockToDayUnits(hours, minutes);
  } else if (time !== null && /^\s*\d{1,4}\s*$/.test(time)) {
    const units = Number(time);
    if (units < DAY_UNITS) startUnits = units;
  }
  return {
    startUnits,
    speed: numberIn(params.get('timeSpeed'), 0, 10000, 1),
    daySeconds: numberIn(params.get('daySeconds'), 1, 604800, DEFAULT_WORLD_CLOCK_CONFIG.daySeconds),
    dayCycle: (params.get('dayCycle') ?? '').toLowerCase() !== 'off',
    liquidTimeMs: params.get('liquidTime') === null ? undefined : numberIn(params.get('liquidTime'), 0, 1000000, 0),
  };
}
