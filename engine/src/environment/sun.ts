import { DAY_UNITS, wrapDayUnits } from './worldClock';

/**
 * The two « suns » (spec §11). They are deliberately SEPARATE systems:
 *
 * - the LIGHTING sun gives the direction used to light the world. Its azimuth
 *   is fixed and its elevation only moves through a limited range, so the
 *   lighting stays coherent with baked terrain shadows all day (and night);
 * - the VISIBLE sun is the disc in the sky. It follows a large arc and really
 *   rises and sets. It lights nothing.
 *
 * FROM THE SPEC: the separation; the lighting sun's « fixed azimuth around
 * 225° » and « limited elevation range »; the visible sun's « much larger arc ».
 * OUR CHOICES (configurable): every number below, the shape of both paths, and
 * the reading of « 225° » — the document says « in its travel-direction
 * convention » without giving the axes, so we take a COMPASS azimuth of the
 * direction TOWARDS the sun: 0° = north (+y), 90° = east (+x), clockwise.
 * 225° is then a sun in the south-west, which is where the terrain light
 * already was before this module (233°).
 *
 * Engine axes: x = east, y = north, z = up. Directions point FROM the ground TOWARDS the sun.
 */
export type Direction = [number, number, number];

const RAD = Math.PI / 180;

/** Unit vector for a compass azimuth (0° north, 90° east) and an elevation above the horizon, in degrees. */
export function directionFromAzimuthElevation(azimuthDegrees: number, elevationDegrees: number): Direction {
  if (!Number.isFinite(azimuthDegrees) || !Number.isFinite(elevationDegrees)) throw new Error(`sun: azimuth and elevation must be finite (got ${azimuthDegrees}, ${elevationDegrees})`);
  const horizontal = Math.cos(elevationDegrees * RAD);
  return [horizontal * Math.sin(azimuthDegrees * RAD), horizontal * Math.cos(azimuthDegrees * RAD), Math.sin(elevationDegrees * RAD)];
}

/** Compass azimuth (0..360) and elevation (−90..90), in degrees, of a direction. */
export function azimuthElevationOf(direction: readonly [number, number, number]): { readonly azimuth: number; readonly elevation: number } {
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  if (!(length > 0) || !Number.isFinite(length)) throw new Error('sun: direction must be a finite non-zero vector');
  const azimuth = Math.atan2(direction[0], direction[1]) / RAD;
  return { azimuth: (azimuth < 0 ? azimuth + 360 : azimuth) + 0, elevation: Math.asin(Math.max(-1, Math.min(1, direction[2] / length))) / RAD };
}

export interface LightingSunConfig {
  /** Compass azimuth of the direction towards the lighting sun; never changes during the day. */
  readonly azimuthDegrees: number;
  /** Elevation at `highestAtUnits`, and half a day later. Both must be in 0 < e ≤ 90, min ≤ max. */
  readonly minElevationDegrees: number;
  readonly maxElevationDegrees: number;
  /** Time of day at which the elevation is highest, in units. */
  readonly highestAtUnits: number;
}

/** 225° (spec), between 35° and 60° above the horizon, highest at noon. The range is ours. */
export const DEFAULT_LIGHTING_SUN: LightingSunConfig = { azimuthDegrees: 225, minElevationDegrees: 35, maxElevationDegrees: 60, highestAtUnits: DAY_UNITS / 2 };

export function validateLightingSun(config: LightingSunConfig): void {
  if (!Number.isFinite(config.azimuthDegrees)) throw new Error('lighting sun: azimuth must be finite');
  const { minElevationDegrees: min, maxElevationDegrees: max } = config;
  // Always above the horizon: the light must never come from below the ground.
  if (!(min > 0 && max <= 90 && min <= max)) throw new Error(`lighting sun: need 0 < minElevation ≤ maxElevation ≤ 90 (got ${min}, ${max})`);
  if (!Number.isFinite(config.highestAtUnits)) throw new Error('lighting sun: highestAtUnits must be finite');
}

/** Elevation of the lighting sun: a smooth cosine between the two bounds, period one day. */
export function lightingSunElevation(units: number, config: LightingSunConfig = DEFAULT_LIGHTING_SUN): number {
  const phase = (2 * Math.PI * (wrapDayUnits(units) - config.highestAtUnits)) / DAY_UNITS;
  return config.minElevationDegrees + (config.maxElevationDegrees - config.minElevationDegrees) * (0.5 + 0.5 * Math.cos(phase));
}

/** Unit direction towards the lighting sun at a time of day. Always above the horizon. */
export function lightingSunDirection(units: number, config: LightingSunConfig = DEFAULT_LIGHTING_SUN): Direction {
  return directionFromAzimuthElevation(config.azimuthDegrees, lightingSunElevation(units, config));
}

export interface VisibleSunConfig {
  /** Time at which the disc crosses the eastern horizon, in units. It sets half a day later in the west. */
  readonly sunriseUnits: number;
  /** Elevation at its highest (a quarter of a day after sunrise), 0 < e ≤ 90. Below 90 the arc leans towards the south. */
  readonly culminationElevationDegrees: number;
}

/** Rises due east at 06:00, culminates at 60° in the south at noon, sets due west at 18:00. Ours. */
export const DEFAULT_VISIBLE_SUN: VisibleSunConfig = { sunriseUnits: DAY_UNITS / 4, culminationElevationDegrees: 60 };

export function validateVisibleSun(config: VisibleSunConfig): void {
  if (!Number.isFinite(config.sunriseUnits)) throw new Error('visible sun: sunriseUnits must be finite');
  if (!(config.culminationElevationDegrees > 0 && config.culminationElevationDegrees <= 90)) throw new Error(`visible sun: culmination elevation must be in 0..90, 0 excluded (got ${config.culminationElevationDegrees})`);
}

/**
 * Unit direction towards the visible sun: one turn per day on a great circle
 * through east and west, tilted towards the south. Its z is negative at night
 * (the disc is below the horizon).
 */
export function visibleSunDirection(units: number, config: VisibleSunConfig = DEFAULT_VISIBLE_SUN): Direction {
  const angle = (2 * Math.PI * (wrapDayUnits(units) - config.sunriseUnits)) / DAY_UNITS;
  const top = config.culminationElevationDegrees * RAD; // direction of the highest point: south, at that elevation
  const c = Math.cos(angle), s = Math.sin(angle);
  return [c + 0, -s * Math.cos(top) + 0, s * Math.sin(top) + 0];
}
