/**
 * Orvalis bootstrap boundary (migration step M0.4).
 *
 *   Orvalis bootstrap
 *         ├── legacy mode → current Three.js game, untouched
 *         └── new mode    → new engine
 *
 * The two engines never run in the same document: the bootstrap only decides
 * which one starts. Systems will move from legacy to new one at a time, behind
 * this boundary.
 */
export type EngineMode = 'legacy' | 'new';

/** The playable game stays the default until the new engine can replace it. */
export const DEFAULT_ENGINE_MODE: EngineMode = 'legacy';

/** URL parameter choosing the mode: ?engine=legacy | ?engine=new */
export const ENGINE_PARAM = 'engine';

/** Where the legacy game page is served, relative to the bootstrap page. */
export const LEGACY_PAGE_PATH = 'legacy/orvalis.html';

export interface EngineModeRequest {
  readonly mode: EngineMode;
  /** Set when the URL carried an `engine` value we do not know. */
  readonly ignoredValue?: string;
}

export function parseEngineMode(search: string): EngineModeRequest {
  const raw = new URLSearchParams(search).get(ENGINE_PARAM);
  if (raw === null || raw === '') return { mode: DEFAULT_ENGINE_MODE };
  const value = raw.toLowerCase();
  if (value === 'legacy' || value === 'new') return { mode: value };
  return { mode: DEFAULT_ENGINE_MODE, ignoredValue: raw };
}

/**
 * URL of the legacy page for the current location. The `engine` parameter is
 * consumed by the bootstrap; every other parameter and the hash are passed on
 * unchanged (the legacy game reads some of them, e.g. `#mockroom`).
 */
export function legacyPageUrl(search: string, hash: string): string {
  const params = new URLSearchParams(search);
  params.delete(ENGINE_PARAM);
  const query = params.toString();
  return LEGACY_PAGE_PATH + (query ? `?${query}` : '') + hash;
}

/** URL that reopens the bootstrap in the other mode, keeping the other parameters. */
export function modeUrl(mode: EngineMode, search: string, hash: string): string {
  const params = new URLSearchParams(search);
  params.set(ENGINE_PARAM, mode);
  return `?${params.toString()}${hash}`;
}
