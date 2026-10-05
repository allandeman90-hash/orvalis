import { legacyPageUrl, parseEngineMode } from './bootstrap/engineMode';

/** Keeps the developer statistics accessible without covering the game view. */
function bindDebugToggle(): { close: () => void } {
  const overlay = document.getElementById('debug-overlay');
  const button = document.getElementById('debug-toggle');
  if (!overlay || !(button instanceof HTMLButtonElement)) return { close: () => undefined };

  const sync = (): void => {
    const open = !overlay.hidden;
    button.textContent = open ? 'Hide stats' : 'Show stats';
    button.setAttribute('aria-expanded', String(open));
    button.title = `${open ? 'Hide' : 'Show'} statistics (F3)`;
  };

  button.addEventListener('click', () => {
    overlay.hidden = !overlay.hidden;
    sync();
  });

  // F3 is handled by the engine. Observing the hidden attribute keeps the button label in sync with it.
  const observer = new MutationObserver(sync);
  observer.observe(overlay, { attributes: true, attributeFilter: ['hidden'] });
  sync();

  return {
    close: () => {
      overlay.hidden = true;
      sync();
    },
  };
}

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

  const debugToggle = bindDebugToggle();
  const { startEngine } = await import('./main');
  await startEngine();
  // startEngine historically opens the overlay once booted; the player-facing preview now starts clean instead.
  debugToggle.close();
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