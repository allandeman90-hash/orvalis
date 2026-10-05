import { describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE_MODE, legacyPageUrl, modeUrl, parseEngineMode } from '../../src/bootstrap/engineMode';

describe('parseEngineMode', () => {
  it('defaults to the legacy game', () => {
    expect(DEFAULT_ENGINE_MODE).toBe('legacy');
    for (const q of ['', '?', '?foo=bar', '?engine=', '?renderer=webgpu']) expect(parseEngineMode(q)).toEqual({ mode: 'legacy' });
  });
  it('reads an explicit choice, case-insensitively, among other parameters', () => {
    expect(parseEngineMode('?engine=new')).toEqual({ mode: 'new' });
    expect(parseEngineMode('?engine=legacy')).toEqual({ mode: 'legacy' });
    expect(parseEngineMode('?engine=NEW')).toEqual({ mode: 'new' });
    expect(parseEngineMode('?renderer=webgl2&engine=new&x=1')).toEqual({ mode: 'new' });
  });
  it('an unknown value falls back to legacy and is reported', () => {
    expect(parseEngineMode('?engine=three')).toEqual({ mode: 'legacy', ignoredValue: 'three' });
  });
});

describe('legacyPageUrl', () => {
  it('points at the legacy page', () => {
    expect(legacyPageUrl('', '')).toBe('legacy/orvalis.html');
    expect(legacyPageUrl('?engine=legacy', '')).toBe('legacy/orvalis.html');
  });
  it('drops only the engine parameter and keeps the rest', () => {
    expect(legacyPageUrl('?engine=legacy&debug=1&lang=fr', '')).toBe('legacy/orvalis.html?debug=1&lang=fr');
    expect(legacyPageUrl('?a=1&engine=bogus', '')).toBe('legacy/orvalis.html?a=1');
  });
  it('keeps the hash, which the legacy game reads (#mockroom)', () => {
    expect(legacyPageUrl('', '#mockroom')).toBe('legacy/orvalis.html#mockroom');
    expect(legacyPageUrl('?engine=legacy&x=1', '#mockroom')).toBe('legacy/orvalis.html?x=1#mockroom');
  });
});

describe('modeUrl', () => {
  it('switches mode and keeps the other parameters and the hash', () => {
    expect(modeUrl('new', '', '')).toBe('?engine=new');
    expect(modeUrl('legacy', '?engine=new&renderer=webgl2', '#h')).toBe('?engine=legacy&renderer=webgl2#h');
    expect(modeUrl('new', '?renderer=webgl2', '')).toBe('?renderer=webgl2&engine=new');
  });
  it('round-trips with parseEngineMode', () => {
    for (const mode of ['legacy', 'new'] as const) expect(parseEngineMode(modeUrl(mode, '?x=1', '')).mode).toBe(mode);
  });
});
