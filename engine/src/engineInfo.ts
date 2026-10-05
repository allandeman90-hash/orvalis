/** Identity of the engine build. Kept free of DOM access so it is unit-testable. */
export const ENGINE_NAME = 'orvalis-engine';
export const ENGINE_VERSION = '0.0.1';

/** Roadmap phase currently being implemented (see PROJECT_STATUS.md). */
export const CURRENT_PHASE = 0;

export function bootBanner(): string {
  return `${ENGINE_NAME} ${ENGINE_VERSION} — phase ${CURRENT_PHASE} — boot ok`;
}
