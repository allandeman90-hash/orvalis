import { legacyPageUrl, parseEngineMode } from './bootstrap/engineMode';

/**
 * Single entry point of Orvalis. Chooses the engine, then gets out of the way:
 * - legacy: hands the document over to the current game page;
 * - new: loads the new engine (a separate chunk, so the legacy path never downloads it).
 */
async function bootstrap(): Promise<void> {
  const request = parseEngineMode(window.location.search);
  if (request.ignoredValue !== undefined) {
    console.warn(`[bootstrap] unknown value engine=${JSON.stringify(request.ignoredValue)} ignored, starting the default engine (${request.mode})`);
  }
  document.documentElement.dataset.engineMode = request.mode;

  if (request.mode === 'legacy') {
    window.location.replace(legacyPageUrl(window.location.search, window.location.hash));
    return;
  }
  const { startEngine } = await import('./main');
  await startEngine();
}

bootstrap().catch((error: unknown) => {
  // Never fail silently: show the problem where the player looks.
  console.error('[bootstrap] failed to start', error);
  const status = document.getElementById('boot-status');
  if (status) {
    status.hidden = false;
    status.textContent = `Orvalis n'a pas pu démarrer\n${error instanceof Error ? error.message : String(error)}`;
    status.dataset.state = 'bootstrap-error';
  }
});
