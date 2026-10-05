import { describe, expect, it } from 'vitest';
import { clockToDayUnits, type DayCycle, ORVALIS_DAY_CYCLE, parseDayCycle, sampleDayCycle, validateDayCycle } from '../../src/environment';
import { DEFAULT_FOG_COLOR, DEFAULT_TERRAIN_LIGHTING } from '../../src/terrainRender';

const close = (a: readonly number[], b: readonly number[]): void => {
  expect(a.length).toBe(b.length);
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));
};

/** Two keyframes, at 06:00 and 18:00. */
const TWO: DayCycle = {
  keyframes: [
    { name: 'a', time: 720, ambient: [0, 0.2, 1], diffuse: [1, 1, 1], fogColor: [0, 0, 0], skyZenith: [0, 0, 1], sunColor: [1, 1, 1] },
    { name: 'b', time: 2160, ambient: [1, 0.4, 0], diffuse: [3, 1, 0], fogColor: [1, 0.5, 0.25], skyZenith: [0.5, 0, 0], sunColor: [1, 0, 0] },
  ],
};

describe('sampleDayCycle', () => {
  it('gives a keyframe exactly at its time', () => {
    const s = sampleDayCycle(TWO, 720);
    expect(s).toMatchObject({ from: 'a', to: 'b', blend: 0 });
    close(s.ambient, [0, 0.2, 1]);
    close(sampleDayCycle(TWO, 2160).diffuse, [3, 1, 0]);
    expect(sampleDayCycle(TWO, 2160)).toMatchObject({ from: 'b', to: 'a', blend: 0 });
  });

  it('interpolates linearly between two keyframes', () => {
    const s = sampleDayCycle(TWO, 720 + 360); // a quarter of the way
    expect(s.blend).toBeCloseTo(0.25, 12);
    close(s.ambient, [0.25, 0.25, 0.75]);
    close(s.diffuse, [1.5, 1, 0.75]);
    close(s.fogColor, [0.25, 0.125, 0.0625]);
    close(s.skyZenith, [0.125, 0, 0.75]);
    close(s.sunColor, [1, 0.75, 0.75]);
  });

  it('wraps around midnight: after the last keyframe and before the first one', () => {
    // From b (18:00) to a (06:00) there are 1440 units.
    const late = sampleDayCycle(TWO, 2160 + 360); // 21:00
    expect(late).toMatchObject({ from: 'b', to: 'a' });
    expect(late.blend).toBeCloseTo(0.25, 12);
    const early = sampleDayCycle(TWO, 360); // 03:00
    expect(early).toMatchObject({ from: 'b', to: 'a' });
    expect(early.blend).toBeCloseTo(0.75, 12);
    close(early.ambient, [0.25, 0.25, 0.75]);
    const midnight = sampleDayCycle(TWO, 0);
    expect(midnight.blend).toBeCloseTo(0.5, 12);
    close(sampleDayCycle(TWO, 2880).ambient, midnight.ambient); // any finite time is wrapped
    close(sampleDayCycle(TWO, -2880 * 2 + 360).ambient, early.ambient);
  });

  it('is continuous everywhere, midnight included', () => {
    for (const cycle of [TWO, ORVALIS_DAY_CYCLE]) {
      let previous = sampleDayCycle(cycle, -0.25);
      for (let t = 0; t <= 2880; t += 0.25) {
        const s = sampleDayCycle(cycle, t);
        for (const field of ['ambient', 'diffuse', 'fogColor', 'skyZenith', 'sunColor'] as const) for (let c = 0; c < 3; c++) {
          if (Math.abs(s[field][c]! - previous[field][c]!) > 0.01) throw new Error(`jump of ${field}[${c}] at t = ${t}`);
        }
        previous = s;
      }
    }
  });

  it('a single keyframe is a constant environment', () => {
    const one: DayCycle = { keyframes: [TWO.keyframes[0]!] };
    for (const t of [0, 719, 720, 2000]) expect(sampleDayCycle(one, t)).toMatchObject({ from: 'a', to: 'a', blend: 0, ambient: [0, 0.2, 1] });
  });

  it('finds the right pair among many keyframes (binary search)', () => {
    const many: DayCycle = { keyframes: Array.from({ length: 96 }, (_, i) => ({ name: `k${i}`, time: i * 30 + 7, ambient: [i, 0, 0] as const, diffuse: [0, 0, 0] as const, fogColor: [0, 0, 0] as const, skyZenith: [0, 0, 0] as const, sunColor: [0, 0, 0] as const })) };
    validateDayCycle(many);
    for (let t = 0; t < 2880; t += 3.5) {
      const s = sampleDayCycle(many, t);
      const i = Math.floor((t - 7) / 30);
      expect(s.from).toBe(`k${i < 0 ? 95 : i}`);
      expect(s.to).toBe(`k${i < 0 ? 0 : (i + 1) % 96}`);
    }
  });
});

describe('validateDayCycle / parseDayCycle (data-driven)', () => {
  it('accepts the Orvalis cycle and round-trips it through JSON', () => {
    validateDayCycle(ORVALIS_DAY_CYCLE);
    expect(parseDayCycle(JSON.stringify(ORVALIS_DAY_CYCLE))).toEqual(ORVALIS_DAY_CYCLE);
  });

  it('refuses broken data with a message naming the keyframe', () => {
    const k = TWO.keyframes[0]!;
    expect(() => validateDayCycle({ keyframes: [] })).toThrow(/at least one keyframe/);
    expect(() => validateDayCycle({ keyframes: [k, { ...k, name: 'again' }] })).toThrow(/"again": times must be strictly increasing/);
    expect(() => validateDayCycle({ keyframes: [TWO.keyframes[1]!, k] })).toThrow(/strictly increasing/);
    expect(() => validateDayCycle({ keyframes: [{ ...k, time: 2880 }] })).toThrow(/time must be in 0..2879/);
    expect(() => validateDayCycle({ keyframes: [{ ...k, time: -1 }] })).toThrow(/time must be/);
    expect(() => validateDayCycle({ keyframes: [{ ...k, name: '' }] })).toThrow(/needs a name/);
    expect(() => validateDayCycle({ keyframes: [{ ...k, ambient: [0, -0.1, 0] }] })).toThrow(/"a": ambient must be 3 finite numbers/);
    expect(() => validateDayCycle({ keyframes: [{ ...k, diffuse: [0, Number.NaN, 0] }] })).toThrow(/diffuse/);
    expect(() => validateDayCycle({ keyframes: [{ ...k, fogColor: [0, 0, 1.5] }] })).toThrow(/fogColor is a displayed colour/);
    expect(() => validateDayCycle({ keyframes: [{ ...k, skyZenith: [0, 0, 2] }] })).toThrow(/skyZenith is a displayed colour/);
    expect(() => validateDayCycle({ keyframes: [{ ...k, sunColor: [0, 0] as unknown as [number, number, number] }] })).toThrow(/sunColor must be 3 finite numbers/);
    expect(() => parseDayCycle('{')).toThrow(/not valid JSON/);
    expect(() => parseDayCycle('{"keyframes":[{"name":"x","time":5,"ambient":[1,1],"diffuse":[1,1,1],"fogColor":[0,0,0],"skyZenith":[0,0,0],"sunColor":[1,1,1]}]}')).toThrow(/"x": ambient/);
    expect(() => parseDayCycle('{"keyframes":[{"name":"x","time":"5","ambient":[1,1,1],"diffuse":[1,1,1],"fogColor":[0,0,0],"skyZenith":[0,0,0],"sunColor":[1,1,1]}]}')).toThrow(/time must be/);
    expect(() => parseDayCycle('null')).toThrow(/at least one keyframe/);
  });
});

describe('the Orvalis day', () => {
  it('has the keyframes named by the spec, in day order', () => {
    expect(ORVALIS_DAY_CYCLE.keyframes.map((k) => k.name)).toEqual(['night', 'dawn', 'morning', 'noon', 'afternoon', 'sunset', 'dusk', 'night']);
  });

  it('at noon is exactly the light and horizon the terrain had before the cycle', () => {
    const noon = sampleDayCycle(ORVALIS_DAY_CYCLE, clockToDayUnits(12));
    expect(noon).toMatchObject({ from: 'noon', blend: 0 });
    expect(noon.ambient).toEqual([...DEFAULT_TERRAIN_LIGHTING.ambient]);
    expect(noon.diffuse).toEqual([...DEFAULT_TERRAIN_LIGHTING.diffuse]);
    expect(noon.fogColor).toEqual([...DEFAULT_FOG_COLOR]);
  });

  it('has a constant night from 22:00 to 04:00, darker than the day but never black', () => {
    const night = sampleDayCycle(ORVALIS_DAY_CYCLE, 0);
    for (const hour of [22, 23, 1, 3, 4]) expect(sampleDayCycle(ORVALIS_DAY_CYCLE, clockToDayUnits(hour)).ambient).toEqual(night.ambient);
    const noon = sampleDayCycle(ORVALIS_DAY_CYCLE, clockToDayUnits(12));
    const brightness = (s: typeof noon): number => s.ambient[1] + s.diffuse[1];
    expect(brightness(night)).toBeLessThan(brightness(noon) / 3);
    expect(Math.min(...night.ambient)).toBeGreaterThan(0.05);
  });

  it('has a sky that is bluer at the zenith than at the horizon by day, and nearly black at night', () => {
    const noon = sampleDayCycle(ORVALIS_DAY_CYCLE, clockToDayUnits(12)), night = sampleDayCycle(ORVALIS_DAY_CYCLE, 0);
    expect(noon.skyZenith[2] - noon.skyZenith[0]).toBeGreaterThan(noon.fogColor[2] - noon.fogColor[0]);
    expect(Math.max(...night.skyZenith)).toBeLessThan(0.1);
    expect(Math.max(...night.skyZenith)).toBeLessThan(Math.max(...night.fogColor)); // the night horizon stays a little lighter
  });

  it('is half-way between afternoon and sunset at 17:30', () => {
    const s = sampleDayCycle(ORVALIS_DAY_CYCLE, clockToDayUnits(17, 30));
    expect(s).toMatchObject({ from: 'afternoon', to: 'sunset' });
    expect(s.blend).toBeCloseTo(0.5, 12);
    close(s.diffuse, [0.83, 0.615, 0.445]);
    close(s.fogColor, [0.67, 0.59, 0.57]);
  });
});
