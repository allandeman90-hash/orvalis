import { describe, expect, it } from 'vitest';
import { azimuthElevationOf, clockToDayUnits, DEFAULT_LIGHTING_SUN, DEFAULT_VISIBLE_SUN, directionFromAzimuthElevation, lightingSunDirection, lightingSunElevation, validateLightingSun, validateVisibleSun, visibleSunDirection } from '../../src/environment';
import { DEFAULT_TERRAIN_LIGHTING } from '../../src/terrainRender';

const close = (a: readonly number[], b: readonly number[], digits = 9): void => {
  expect(a.length).toBe(b.length);
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));
};
const h = (hours: number, minutes = 0): number => clockToDayUnits(hours, minutes);

describe('azimuth / elevation convention', () => {
  it('is a compass: 0° north (+y), 90° east (+x), clockwise; elevation towards +z', () => {
    close(directionFromAzimuthElevation(0, 0), [0, 1, 0]);
    close(directionFromAzimuthElevation(90, 0), [1, 0, 0]);
    close(directionFromAzimuthElevation(180, 0), [0, -1, 0]);
    close(directionFromAzimuthElevation(270, 0), [-1, 0, 0]);
    close(directionFromAzimuthElevation(123, 90), [0, 0, 1]);
    close(directionFromAzimuthElevation(225, 60), [-Math.SQRT1_2 / 2, -Math.SQRT1_2 / 2, Math.sqrt(3) / 2]);
    expect(() => directionFromAzimuthElevation(Number.NaN, 0)).toThrow(/finite/);
  });

  it('round-trips and always gives unit vectors', () => {
    for (const [az, el] of [[0, 10], [45, 35], [225, 60], [359, 1], [180, -30]] as const) {
      const d = directionFromAzimuthElevation(az, el);
      expect(Math.hypot(...d)).toBeCloseTo(1, 12);
      const back = azimuthElevationOf(d);
      expect(back.azimuth).toBeCloseTo(az, 9);
      expect(back.elevation).toBeCloseTo(el, 9);
    }
    expect(azimuthElevationOf([0, 0, 5]).elevation).toBeCloseTo(90, 9);
    expect(azimuthElevationOf([-3, 0, 0]).azimuth).toBeCloseTo(270, 9);
    expect(() => azimuthElevationOf([0, 0, 0])).toThrow(/non-zero/);
  });
});

describe('lighting sun (spec §11: fixed azimuth, limited elevation range)', () => {
  it('keeps the azimuth of the spec, 225°, at every time of day', () => {
    expect(DEFAULT_LIGHTING_SUN.azimuthDegrees).toBe(225);
    for (let t = 0; t < 2880; t += 37) expect(azimuthElevationOf(lightingSunDirection(t)).azimuth).toBeCloseTo(225, 9);
  });

  it('moves its elevation only between the two bounds: highest at noon, lowest at midnight', () => {
    expect(lightingSunElevation(h(12))).toBeCloseTo(60, 9);
    expect(lightingSunElevation(h(0))).toBeCloseTo(35, 9);
    expect(lightingSunElevation(h(6))).toBeCloseTo(47.5, 9);
    expect(lightingSunElevation(h(18))).toBeCloseTo(47.5, 9);
    let low = Infinity, high = -Infinity;
    for (let t = 0; t < 2880; t += 0.5) {
      const e = lightingSunElevation(t);
      low = Math.min(low, e);
      high = Math.max(high, e);
      const d = lightingSunDirection(t);
      if (d[2] <= 0 || Math.abs(Math.hypot(...d) - 1) > 1e-12) throw new Error(`bad lighting direction at ${t}`);
    }
    expect(low).toBeCloseTo(35, 9);
    expect(high).toBeCloseTo(60, 9);
    expect(lightingSunElevation(2880 + 100)).toBe(lightingSunElevation(100)); // wrapped
  });

  it('is continuous across midnight', () => {
    expect(Math.abs(lightingSunElevation(2879.999) - lightingSunElevation(0))).toBeLessThan(1e-4);
  });

  it('at noon is the default terrain light direction', () => {
    close(lightingSunDirection(h(12)), [...DEFAULT_TERRAIN_LIGHTING.toLight], 6);
  });

  it('refuses a light from below the ground or inverted bounds', () => {
    expect(() => validateLightingSun({ ...DEFAULT_LIGHTING_SUN, minElevationDegrees: 0 })).toThrow(/minElevation/);
    expect(() => validateLightingSun({ ...DEFAULT_LIGHTING_SUN, minElevationDegrees: 70 })).toThrow(/minElevation/);
    expect(() => validateLightingSun({ ...DEFAULT_LIGHTING_SUN, maxElevationDegrees: 91 })).toThrow(/maxElevation/);
    expect(() => validateLightingSun({ ...DEFAULT_LIGHTING_SUN, azimuthDegrees: Number.NaN })).toThrow(/azimuth/);
    validateLightingSun(DEFAULT_LIGHTING_SUN);
    // A constant elevation is allowed.
    expect(lightingSunElevation(500, { ...DEFAULT_LIGHTING_SUN, minElevationDegrees: 50, maxElevationDegrees: 50 })).toBe(50);
  });
});

describe('visible sun (spec §11: a much larger arc, really rises and sets)', () => {
  it('rises due east at 06:00, culminates in the south at noon, sets due west at 18:00', () => {
    close(visibleSunDirection(h(6)), [1, 0, 0]);
    const noon = azimuthElevationOf(visibleSunDirection(h(12)));
    expect(noon.azimuth).toBeCloseTo(180, 9);
    expect(noon.elevation).toBeCloseTo(60, 9);
    close(visibleSunDirection(h(18)), [-1, 0, 0]);
    const midnight = azimuthElevationOf(visibleSunDirection(h(0)));
    expect(midnight.elevation).toBeCloseTo(-60, 9);
    expect(midnight.azimuth).toBeCloseTo(0, 9); // under the northern horizon
  });

  it('is above the horizon exactly during the day, and always a unit vector', () => {
    for (let t = 0; t < 2880; t += 1) {
      const d = visibleSunDirection(t);
      if (Math.abs(Math.hypot(...d) - 1) > 1e-12) throw new Error(`not unit at ${t}`);
      const day = t > h(6) && t < h(18);
      if (t !== h(6) && t !== h(18) && d[2] > 0 !== day) throw new Error(`wrong side of the horizon at ${t}`);
    }
  });

  it('covers a far larger range than the lighting sun, and differs from it', () => {
    let lowV = Infinity, highV = -Infinity;
    for (let t = 0; t < 2880; t += 1) {
      const e = azimuthElevationOf(visibleSunDirection(t)).elevation;
      lowV = Math.min(lowV, e);
      highV = Math.max(highV, e);
    }
    expect(highV - lowV).toBeCloseTo(120, 6); // −60..60, against 35..60 for the lighting sun
    // Morning: the disc is in the east, the light still comes from the south-west.
    const visible = azimuthElevationOf(visibleSunDirection(h(8))), lighting = azimuthElevationOf(lightingSunDirection(h(8)));
    expect(visible.azimuth).toBeLessThan(120);
    expect(lighting.azimuth).toBeCloseTo(225, 9);
  });

  it('follows its configuration', () => {
    const overhead = { sunriseUnits: h(5), culminationElevationDegrees: 90 };
    close(visibleSunDirection(h(11), overhead), [0, 0, 1]);
    close(visibleSunDirection(h(5), overhead), [1, 0, 0]);
    expect(() => validateVisibleSun({ ...DEFAULT_VISIBLE_SUN, culminationElevationDegrees: 0 })).toThrow(/culmination/);
    expect(() => validateVisibleSun({ ...DEFAULT_VISIBLE_SUN, sunriseUnits: Number.NaN })).toThrow(/sunriseUnits/);
    validateVisibleSun(DEFAULT_VISIBLE_SUN);
  });
});
