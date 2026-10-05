import { describe, expect, it } from 'vitest';
import { DEFAULT_START_UNITS, parseWorldClockRequest } from '../../src/environment';

describe('world clock URL options', () => {
  it('defaults to noon, normal speed, the Orvalis day of 24 minutes', () => {
    expect(DEFAULT_START_UNITS).toBe(1440);
    expect(parseWorldClockRequest('')).toEqual({ startUnits: 1440, speed: 1, daySeconds: 1440, dayCycle: true, liquidTimeMs: undefined });
    expect(parseWorldClockRequest('?engine=new&scene=zone')).toEqual({ startUnits: 1440, speed: 1, daySeconds: 1440, dayCycle: true, liquidTimeMs: undefined });
    expect(parseWorldClockRequest('?liquidTime=625').liquidTimeMs).toBe(625);
    expect(parseWorldClockRequest('?liquidTime=0').liquidTimeMs).toBe(0);
    expect(parseWorldClockRequest('?liquidTime=soon').liquidTimeMs).toBe(0); // asked for a fixed time, value unreadable → 0, still fixed
    expect(parseWorldClockRequest('?dayCycle=off').dayCycle).toBe(false);
    expect(parseWorldClockRequest('?dayCycle=OFF').dayCycle).toBe(false);
    expect(parseWorldClockRequest('?dayCycle=bogus').dayCycle).toBe(true);
  });

  it('reads a start time as HH:MM or as a unit', () => {
    expect(parseWorldClockRequest('?time=14:30').startUnits).toBe(1740);
    expect(parseWorldClockRequest('?time=6:05').startUnits).toBe(730);
    expect(parseWorldClockRequest('?time=00:00').startUnits).toBe(0);
    expect(parseWorldClockRequest('?time=23:59').startUnits).toBe(2878);
    expect(parseWorldClockRequest('?time=0').startUnits).toBe(0);
    expect(parseWorldClockRequest('?time=2879').startUnits).toBe(2879);
  });

  it('reads the debug speed and the day length', () => {
    expect(parseWorldClockRequest('?timeSpeed=0')).toMatchObject({ speed: 0 });
    expect(parseWorldClockRequest('?timeSpeed=60&daySeconds=86400')).toMatchObject({ speed: 60, daySeconds: 86400 });
    expect(parseWorldClockRequest('?timeSpeed=0.5')).toMatchObject({ speed: 0.5 });
  });

  it('ignores malformed or out-of-range values', () => {
    for (const bad of ['?time=24:00', '?time=12:60', '?time=2880', '?time=-5', '?time=noon', '?time=12:5', '?time=1e3', '?time=']) {
      expect(parseWorldClockRequest(bad).startUnits, bad).toBe(1440);
    }
    for (const bad of ['?timeSpeed=-1', '?timeSpeed=1e9', '?timeSpeed=fast', '?timeSpeed=10001', '?timeSpeed=']) expect(parseWorldClockRequest(bad).speed, bad).toBe(1);
    for (const bad of ['?daySeconds=0', '?daySeconds=0.5', '?daySeconds=604801', '?daySeconds=x', '?daySeconds=Infinity']) expect(parseWorldClockRequest(bad).daySeconds, bad).toBe(1440);
  });
});
