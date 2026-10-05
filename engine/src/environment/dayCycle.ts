import { DAY_UNITS, dayUnitsDelta, wrapDayUnits } from './worldClock';

/**
 * Day/night cycle (spec §10): authored keyframes, interpolated across the day —
 * artistic values, NOT a simulated atmosphere. The spec names the keyframes
 * (dawn, morning, noon, afternoon, sunset, dusk, night) and says « interpolate
 * colors »; it gives no numbers.
 *
 * The cycle is plain DATA (it can come from a JSON file, see parseDayCycle()).
 * A keyframe holds the values the renderer needs today:
 *   ambient, diffuse   terrain light colours (spec §8)
 *   fogColor           fog colour = horizon colour (spec §12–§13)
 *   skyZenith          colour of the sky straight up (the sky is a gradient horizon → zenith, spec §12)
 *   sunColor           colour of the visible sun's disc
 * The sun DIRECTIONS are not keyframes: see sun.ts.
 *
 * OUR CHOICES: linear interpolation in time between the two surrounding
 * keyframes, wrapping around midnight; every number in ORVALIS_DAY_CYCLE.
 */
export type Rgb = readonly [number, number, number];

export interface DayKeyframe {
  readonly name: string;
  /** Time of day in units, 0 ≤ time < 2880. */
  readonly time: number;
  readonly ambient: Rgb;
  readonly diffuse: Rgb;
  readonly fogColor: Rgb;
  readonly skyZenith: Rgb;
  readonly sunColor: Rgb;
}

export interface DayCycle {
  /** At least one keyframe, times strictly increasing. */
  readonly keyframes: readonly DayKeyframe[];
}

export interface EnvironmentSample {
  readonly ambient: [number, number, number];
  readonly diffuse: [number, number, number];
  readonly fogColor: [number, number, number];
  readonly skyZenith: [number, number, number];
  readonly sunColor: [number, number, number];
  /** Names of the keyframes the time lies between, and how far towards `to` (0..1). */
  readonly from: string;
  readonly to: string;
  readonly blend: number;
}

const COLOUR_FIELDS = ['ambient', 'diffuse', 'fogColor', 'skyZenith', 'sunColor'] as const;
/** Colours that are shown as they are (not multiplied by a texture): components must stay ≤ 1. */
const DISPLAYED = ['fogColor', 'skyZenith', 'sunColor'] as const;

function fail(message: string): never {
  throw new Error(`day cycle: ${message}`);
}

export function validateDayCycle(cycle: DayCycle): void {
  if (!cycle || !Array.isArray(cycle.keyframes) || cycle.keyframes.length === 0) fail('at least one keyframe is needed');
  let previous = -1;
  cycle.keyframes.forEach((k, index) => {
    if (typeof k !== 'object' || k === null) fail(`keyframe ${index} is not an object`);
    if (typeof k.name !== 'string' || k.name.length === 0) fail(`keyframe ${index} needs a name`);
    if (typeof k.time !== 'number' || !(k.time >= 0 && k.time < DAY_UNITS)) fail(`keyframe "${k.name}": time must be in 0..${DAY_UNITS - 1} (got ${String(k.time)})`);
    if (k.time <= previous) fail(`keyframe "${k.name}": times must be strictly increasing (${k.time} after ${previous})`);
    previous = k.time;
    for (const field of COLOUR_FIELDS) {
      const c = k[field] as unknown;
      // Light colours may exceed 1 (a strong sun); negative or non-finite values are mistakes.
      if (!Array.isArray(c) || c.length !== 3 || !(c as unknown[]).every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)) fail(`keyframe "${k.name}": ${field} must be 3 finite numbers ≥ 0`);
    }
    for (const field of DISPLAYED) if ((k[field] as readonly number[]).some((v: number) => v > 1)) fail(`keyframe "${k.name}": ${field} is a displayed colour, components must be ≤ 1`);
  });
}

/** Reads a cycle from JSON text (the data-driven path). Throws on anything invalid. */
export function parseDayCycle(json: string): DayCycle {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    fail('not valid JSON');
  }
  const cycle = data as DayCycle;
  validateDayCycle(cycle);
  return { keyframes: cycle.keyframes.map((k) => ({ name: k.name, time: k.time, ambient: [...k.ambient] as unknown as Rgb, diffuse: [...k.diffuse] as unknown as Rgb, fogColor: [...k.fogColor] as unknown as Rgb, skyZenith: [...k.skyZenith] as unknown as Rgb, sunColor: [...k.sunColor] as unknown as Rgb })) };
}

/** Index of the last keyframe with time ≤ t, or −1 when t is before the first one. Binary search. */
function lastAtOrBefore(keyframes: readonly DayKeyframe[], t: number): number {
  let low = 0, high = keyframes.length - 1, found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (keyframes[mid]!.time <= t) {
      found = mid;
      low = mid + 1;
    } else high = mid - 1;
  }
  return found;
}

/**
 * The environment at a time of day (any finite number of units; wrapped).
 * The cycle must be valid (validateDayCycle); it is not re-checked here, this runs every frame.
 */
export function sampleDayCycle(cycle: DayCycle, units: number): EnvironmentSample {
  const keyframes = cycle.keyframes, n = keyframes.length;
  const t = wrapDayUnits(units);
  const index = lastAtOrBefore(keyframes, t);
  // Before the first keyframe (or after the last): between the last one and the first one, across midnight.
  const a = keyframes[index < 0 ? n - 1 : index]!, b = keyframes[index < 0 ? 0 : (index + 1) % n]!;
  const span = a === b ? 0 : wrapDayUnits(b.time - a.time);
  const blend = span === 0 ? 0 : Math.min(1, Math.max(0, wrapDayUnits(dayUnitsDelta(a.time, t)) / span));
  const mix = (x: Rgb, y: Rgb): [number, number, number] => [x[0] + (y[0] - x[0]) * blend, x[1] + (y[1] - x[1]) * blend, x[2] + (y[2] - x[2]) * blend];
  return { ambient: mix(a.ambient, b.ambient), diffuse: mix(a.diffuse, b.diffuse), fogColor: mix(a.fogColor, b.fogColor), skyZenith: mix(a.skyZenith, b.skyZenith), sunColor: mix(a.sunColor, b.sunColor), from: a.name, to: b.name, blend };
}

const at = (hours: number, minutes = 0): number => hours * 120 + minutes * 2;

/**
 * The Orvalis day. OUR VALUES, placeholders to be tuned by eye:
 * - « noon » is exactly the light and horizon the terrain had before the cycle existed;
 * - the night is a plateau (two identical keyframes, 22:00 and 04:00) and stays readable: dim blue, never black.
 * The sun DIRECTION does not move yet (P2.3): only colours change here.
 */
export const ORVALIS_DAY_CYCLE: DayCycle = {
  keyframes: [
    { name: 'night', time: at(4), ambient: [0.1, 0.12, 0.2], diffuse: [0.1, 0.12, 0.2], fogColor: [0.05, 0.07, 0.13], skyZenith: [0.01, 0.02, 0.06], sunColor: [1, 0.55, 0.3] },
    { name: 'dawn', time: at(5, 30), ambient: [0.22, 0.22, 0.3], diffuse: [0.45, 0.3, 0.25], fogColor: [0.45, 0.38, 0.42], skyZenith: [0.2, 0.25, 0.42], sunColor: [1, 0.62, 0.35] },
    { name: 'morning', time: at(8), ambient: [0.33, 0.36, 0.42], diffuse: [0.8, 0.74, 0.62], fogColor: [0.6, 0.69, 0.78], skyZenith: [0.22, 0.42, 0.75], sunColor: [1, 0.95, 0.8] },
    { name: 'noon', time: at(12), ambient: [0.36, 0.39, 0.46], diffuse: [0.84, 0.8, 0.7], fogColor: [0.62, 0.72, 0.82], skyZenith: [0.2, 0.4, 0.78], sunColor: [1, 0.98, 0.9] },
    { name: 'afternoon', time: at(16), ambient: [0.36, 0.38, 0.44], diffuse: [0.86, 0.78, 0.64], fogColor: [0.62, 0.7, 0.78], skyZenith: [0.21, 0.4, 0.74], sunColor: [1, 0.95, 0.82] },
    { name: 'sunset', time: at(19), ambient: [0.3, 0.26, 0.3], diffuse: [0.8, 0.45, 0.25], fogColor: [0.72, 0.48, 0.36], skyZenith: [0.25, 0.25, 0.45], sunColor: [1, 0.55, 0.25] },
    { name: 'dusk', time: at(20, 30), ambient: [0.16, 0.16, 0.26], diffuse: [0.25, 0.2, 0.3], fogColor: [0.2, 0.18, 0.3], skyZenith: [0.06, 0.07, 0.18], sunColor: [1, 0.5, 0.3] },
    { name: 'night', time: at(22), ambient: [0.1, 0.12, 0.2], diffuse: [0.1, 0.12, 0.2], fogColor: [0.05, 0.07, 0.13], skyZenith: [0.01, 0.02, 0.06], sunColor: [1, 0.55, 0.3] },
  ],
};
