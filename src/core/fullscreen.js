// Bascule de l'affichage en plein écran (bouton dédié en jeu et au menu, équivalent à la touche F11).
// Reste défensif : certains contextes (fenêtre intégrée, navigateur mobile) refusent l'API sans le signaler autrement
// qu'en rejetant la promesse — on l'ignore alors silencieusement plutôt que de casser l'interface.

function fsElement() {
  const d = document;
  return d.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement || d.msFullscreenElement || null;
}

// L'API existe-t-elle et est-elle autorisée dans ce contexte (iframe, politique de fonctionnalités…) ?
export function fsSupported() {
  const d = document;
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled || d.mozFullScreenEnabled || d.msFullscreenEnabled);
}

export function isFullscreen() {
  return !!fsElement();
}

export async function toggleFullscreen() {
  try {
    if (isFullscreen()) {
      const d = document;
      const fn = d.exitFullscreen || d.webkitExitFullscreen || d.mozCancelFullScreen || d.msExitFullscreen;
      if (fn) await fn.call(d);
    } else {
      const e = document.documentElement;
      const fn = e.requestFullscreen || e.webkitRequestFullscreen || e.mozRequestFullScreen || e.msRequestFullscreen;
      if (fn) await fn.call(e);
    }
  } catch (err) {
    // refusé (hors d'un geste utilisateur, iframe sans autorisation…) : on ignore, l'appelant vérifie isFullscreen()
  }
  return isFullscreen();
}

const listeners = [];
let bound = false;
export function onFullscreenChange(cb) {
  listeners.push(cb);
  if (bound) return;
  bound = true;
  for (const ev of ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange']) {
    document.addEventListener(ev, () => {
      const on = isFullscreen();
      for (const f of listeners) { try { f(on); } catch (e) { console.error(e); } }
    });
  }
}
