import { describe, expect, it } from 'vitest';
import { bootBanner, CURRENT_PHASE, ENGINE_NAME, ENGINE_VERSION } from '../src/engineInfo';

describe('engineInfo', () => {
  it('builds a banner carrying name, version and phase', () => {
    const banner = bootBanner();
    expect(banner).toContain(ENGINE_NAME);
    expect(banner).toContain(ENGINE_VERSION);
    expect(banner).toContain(`phase ${CURRENT_PHASE}`);
    expect(banner.endsWith('boot ok')).toBe(true);
  });
});
