// Disposition libre de l'interface : mode « Déplacer l'interface » (options), positions gardées dans les réglages.
import { G } from '../game/state.js';

const $ = (id) => document.getElementById(id);
export const MOVABLE = [
  ['leftcol', 'Personnage et groupe'],
  ['targetframe', 'Cible'],
  ['minimapbox', 'Mini-carte'],
  ['tracker', 'Suivi de quêtes'],
  ['eventbox', 'Événements'],
  ['bottom', "Barres d'action"],
  ['chat', 'Discussion'],
  ['menubar', 'Menu'],
  ['lootfeed', 'Butin'],
  ['buffbar', 'Effets actifs'],
];

export const Layout = {
  editing: false,

  init() {
    window.addEventListener('resize', () => this.applyAll());
    this.applyAll();
  },
  saved() { return (G.settings.hudPos ||= {}); },

  place(el, p) {
    const w = el.offsetWidth || 40, h = el.offsetHeight || 20;
    const x = Math.max(0, Math.min(innerWidth - Math.min(w, innerWidth) , p.x * innerWidth));
    const y = Math.max(0, Math.min(innerHeight - Math.min(h, innerHeight), p.y * innerHeight));
    Object.assign(el.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto', transform: 'none' });
  },
  clear(el) { Object.assign(el.style, { left: '', top: '', right: '', bottom: '', transform: '' }); },
  applyAll() {
    const S = this.saved();
    for (const [id] of MOVABLE) {
      const el = $(id);
      if (!el) continue;
      if (S[id]) this.place(el, S[id]); else this.clear(el);
    }
  },
  reset() {
    G.settings.hudPos = {};
    this.applyAll();
    G.saveSettings?.();
  },

  // ---------------------------------------------------------------------------
  toggle(on = !this.editing) {
    this.editing = on;
    const hud = $('hud');
    hud.classList.toggle('hud-edit', on);
    document.querySelectorAll('.lay-h').forEach((n) => n.remove());
    $('lay-bar')?.remove();
    clearInterval(this._iv);
    if (!on) { G.saveSettings?.(); return; }
    // certains cadres se redessinent (suivi de quêtes, événements) : on remet leur poignée
    this._iv = setInterval(() => { for (const [id] of MOVABLE) this.handle(id); }, 300);
    G.win?.close('options');
    const bar = document.createElement('div');
    bar.id = 'lay-bar';
    bar.className = 'panel';
    bar.innerHTML = `<b>Déplacer l'interface</b><span>Glissez les cadres où vous voulez.</span><button class="btn small ghost" id="lay-reset">Réinitialiser</button><button class="btn small" id="lay-done">Terminer</button>`;
    hud.appendChild(bar);
    $('lay-reset').onclick = () => { this.reset(); this.toggle(true); };
    $('lay-done').onclick = () => this.toggle(false);
    for (const [id] of MOVABLE) this.handle(id);
  },
  handle(id) {
    const el = $(id);
    if (!el || el.querySelector(':scope > .lay-h')) return;
    const name = MOVABLE.find((m) => m[0] === id)?.[1] || id;
    const hd = document.createElement('div');
    hd.className = 'lay-h';
    hd.innerHTML = `<span>${name}</span>`;
    el.appendChild(hd);
    hd.addEventListener('mousedown', (e) => this.drag(e, el, id));
  },
  drag(e, el, id) {
    e.preventDefault(); e.stopPropagation();
    const r = el.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top;
    Object.assign(el.style, { left: r.left + 'px', top: r.top + 'px', right: 'auto', bottom: 'auto', transform: 'none' });
    const mv = (ev) => {
      const x = Math.max(0, Math.min(innerWidth - 30, ev.clientX - ox)), y = Math.max(0, Math.min(innerHeight - 20, ev.clientY - oy));
      el.style.left = x + 'px'; el.style.top = y + 'px';
    };
    const up = () => {
      window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
      const rr = el.getBoundingClientRect();
      this.saved()[id] = { x: rr.left / innerWidth, y: rr.top / innerHeight };
      G.saveSettings?.();
    };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  },
};
G.layout = Layout;
