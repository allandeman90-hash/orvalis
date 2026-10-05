// Écran d'accueil façon grand MMO : connexion (survol du monde), cinématique, sélection du personnage
// sur une estrade 3D, création (faction, 8 classes, apparence, nom aléatoire). Tout est original.
import * as THREE from 'three';
import { G } from '../game/state.js';
import { Save } from '../game/save.js';
import { newCharacter } from '../game/player.js';
import { buildCharacterModel, SKIN_TONES, HAIR_COLORS, HAIR_STYLES } from '../game/appearance.js';
import { CLASSES, CLASS_LIST, ROLE_NAMES } from '../data/classbase.js';
import { FACTIONS, HUB_BY_ID } from '../data/zones.js';
import { classSkills } from '../data/skills.js';
import { makeGear } from '../data/items.js';
import { makeHeroName } from '../data/names.js';
import { icon } from './icons.js';
import { getHeight, zoneAt } from '../world/terrain.js';
import { escapeHtml, clamp, lerp } from '../core/util.js';
import { Stage } from './stage.js';
import { toggleFullscreen, isFullscreen, fsSupported, onFullscreenChange } from '../core/fullscreen.js';
import { SPECS, CLASS_SPECS, ROLE_LABEL, ROLE_GLYPH } from '../data/specs.js';
import { ORDERS, sanctId } from '../data/lore.js';
import { WORLD_SCALE } from '../data/world-space.js';

const $ = (id) => document.getElementById(id);
const VERSION = 'v4.0 — Les Routes d’Orvalis';
const ROLE_ICON = { tank: 'tank', heal: 'healer', dps: 'dps' };

// blasons originaux (SVG)
const CREST = {
  0: `<svg viewBox="0 0 64 72" aria-hidden="true"><path d="M32 3 L60 12 L57 42 Q52 60 32 69 Q12 60 7 42 L4 12 Z" fill="#1f3f7a" stroke="#d9c89a" stroke-width="3"/><path d="M32 16 L42 32 L32 48 L22 32 Z" fill="#f4ecd8"/><path d="M32 24 L37 32 L32 40 L27 32 Z" fill="#4f8dff"/><rect x="30.5" y="10" width="3" height="50" fill="#f4ecd8" opacity=".85"/></svg>`,
  1: `<svg viewBox="0 0 64 72" aria-hidden="true"><path d="M32 3 L60 12 L57 42 Q52 60 32 69 Q12 60 7 42 L4 12 Z" fill="#6e1f13" stroke="#c8843a" stroke-width="3"/><path d="M32 12 Q44 26 40 38 Q46 34 45 26 Q54 40 44 52 Q38 58 32 58 Q26 58 20 52 Q10 40 19 26 Q18 34 24 38 Q20 26 32 12 Z" fill="#ffb050"/><path d="M32 30 Q38 38 35 46 Q33 50 32 50 Q31 50 29 46 Q26 38 32 30 Z" fill="#fff0c0"/><rect x="18" y="56" width="28" height="4" fill="#ff5a36"/></svg>`,
};
const SEAL = `<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="56" fill="#15110c" stroke="#d9a441" stroke-width="4"/><circle cx="60" cy="60" r="46" fill="none" stroke="#6b5226" stroke-width="2"/><path d="M60 14 A46 46 0 0 0 60 106 Z" fill="#1f3f7a"/><path d="M60 14 A46 46 0 0 1 60 106 Z" fill="#6e1f13"/><path d="M40 44 L50 60 L40 76 L30 60 Z" fill="#f4ecd8"/><path d="M80 40 Q89 52 86 62 Q91 58 90 52 Q97 64 89 74 Q84 79 80 79 Q76 79 71 74 Q63 64 70 52 Q69 58 74 62 Q71 52 80 40 Z" fill="#ffb050"/><rect x="58" y="16" width="4" height="88" fill="#d9a441"/></svg>`;

// cinématique : survol commenté du monde
const CINE = [
  { from: [-60, 120, 160], to: [60, 90, 120], look: [0, 10, 0], text: "Jadis, Orvalis n'était qu'un seul royaume, et son cœur battait sous le Bastion." },
  { from: [-300, 60, 120], to: [-380, 40, 70], look: [-408, 12, 18], text: "Puis vint la Fracture. Sur la côte ouest, le Pacte d'Azur dressa ses cités blanches…" },
  { from: [300, 60, 100], to: [370, 40, 40], look: [400, 12, -18], text: "…tandis qu'à l'est, les Clans de Braise forgeaient leur colère dans les terres brûlées." },
  { from: [-120, 110, -200], to: [120, 130, -260], look: [0, 40, -330], text: "Sous la roche, des donjons oubliés s'éveillent. Au-dessus des nuages, une tempête éternelle gronde." },
  { from: [0, 160, 260], to: [0, 240, 420], look: [0, 0, 0], text: 'Choisissez votre camp. Écrivez votre légende.' },
];
for(const shot of CINE) for(const key of ['from','to','look']) {shot[key][0]*=WORLD_SCALE;shot[key][2]*=WORLD_SCALE;}

export const Title = {
  mode: 'login',
  sel: null,
  draft: null,
  t: 0,
  logged: false,
  cine: null,

  init() {
    (G.titleHooks ||= []).push((dt) => this.update(dt));
    G.titleHooks.push((dt) => { if (G.mode === 'title') G.audio?.update?.(dt); });
    G.toTitle = () => this.back();
    Stage.init();
    G.stage = Stage;
    const el = $('title');
    el.addEventListener('pointerdown', (e) => {
      if (!e.target.classList.contains('t-drag')) return;
      this.drag = { x: e.clientX, r: Stage.rot };
    });
    addEventListener('pointermove', (e) => { if (this.drag) Stage.rot = this.drag.r + (e.clientX - this.drag.x) * 0.012; });
    addEventListener('pointerup', () => (this.drag = null));
    addEventListener('keydown', (e) => this.onKey(e));
    onFullscreenChange(() => this.syncFsLabels());
  },

  syncFsLabels() {
    const label = isFullscreen() ? 'Quitter le plein écran' : 'Plein écran';
    const a = $('tl-fs'); if (a) a.textContent = label;
    const b = $('ts-fs'); if (b) b.textContent = label;
  },

  onKey(e) {
    if (G.mode !== 'title' || $('title').hidden) return;
    const typing = e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA';
    if (this.mode === 'cine') { if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.endCine(); } return; }
    if (e.key === 'Enter' && !typing) {
      if (this.mode === 'login') this.connect();
      else if (this.mode === 'select' && !$('t-modal')) this.play();
    }
    if (e.key === 'Escape') {
      if ($('t-modal')) { $('t-modal').remove(); return; }
      if (this.mode === 'create' && Save.chars().length) this.select();
      else if (this.mode === 'select') this.login();
    }
    if (this.mode === 'select' && !typing && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const chars = Save.chars();
      const i = chars.findIndex((c) => c.id === this.sel);
      const n = clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, chars.length - 1);
      if (chars[n] && chars[n].id !== this.sel) { this.sel = chars[n].id; this.select(); }
      e.preventDefault();
    }
  },

  show() {
    G.mode = 'title';
    G.flags.fixedTime = 0.8; // crépuscule sur la capitale
    G.ui.show(false);
    $('title').hidden = false;
    if (G.audio) G.audio.mood = 'title';
    const chars = Save.chars();
    this.sel = Save.lastId() && chars.find((c) => c.id === Save.lastId()) ? Save.lastId() : chars[0]?.id;
    if (!this.logged) this.login();
    else if (chars.length) this.select();
    else this.create();
  },

  back() {
    G.saveNow?.();
    const P = G.player;
    if (P) {
      if (G.inst?.active) G.inst.teardown();
      for (const r of (G.bots?.recs || []).filter((x) => x.temp)) { r.party = false; G.bots.dropTemp(r); }
      G.party?.leave?.();
      G.world.remove(P);
      G.pets?.reset?.();
      G.profs?.reset?.();
      for (const e of G.world.entities.slice()) G.world.remove(e);
      for (const s of G.world.spawns) s.ent = null;
      for (const r of G.npcs.recs) r.ent = null;
      for (const r of G.bots?.recs || []) r.ent = null;
      G.player = null;
    }
    for (const id of [...G.win.wins.keys()]) G.win.close(id);
    this.show();
  },

  // ---------------------------------------------------------------------------
  update(dt) {
    this.t += dt;
    this.statT = (this.statT || 0) - dt;
    if (this.statT <= 0) { this.statT = 1; this.realmStatus(); }
    if (this.mode === 'select' || this.mode === 'create') { Stage.update(dt); return; }
    const cam = G.camera;
    if (this.mode === 'cine' && this.cine) {
      const c = this.cine;
      c.t += dt;
      const seg = CINE[c.i];
      const k = Math.min(1, c.t / 7.5), e = k * k * (3 - 2 * k);
      cam.position.set(lerp(seg.from[0], seg.to[0], e), lerp(seg.from[1], seg.to[1], e), lerp(seg.from[2], seg.to[2], e));
      const gy = getHeight(cam.position.x, cam.position.z) + 12;
      if (cam.position.y < gy) cam.position.y = gy;
      cam.lookAt(seg.look[0], seg.look[1], seg.look[2]);
      G.titleFocus = new THREE.Vector3(seg.look[0], seg.look[1], seg.look[2]);
      const cap = $('t-cap');
      if (cap) cap.style.opacity = String(Math.min(1, c.t / 0.8, (7.5 - c.t) / 0.8));
      if (c.t >= 7.5) { c.i++; c.t = 0; if (c.i >= CINE.length) this.endCine(); else if (cap) cap.textContent = CINE[c.i].text; }
      return;
    }
    // survol lent de Havrebleu
    const {x:cx,z:cz} = HUB_BY_ID.havrebleu;
    const a = this.t * 0.035;
    const r = 110;
    const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
    cam.position.set(x, Math.max(getHeight(x, z) + 34, 40), z);
    cam.lookAt(cx + 10, 14, cz);
    G.titleFocus = new THREE.Vector3(cx, 10, cz);
  },

  setStage(on) { G.stageOn = on; },

  // ---------------------------------------------------------------------------
  // Connexion
  login() {
    this.mode = 'login';
    this.setStage(false);
    Stage.setHero(null);
    const data = Save.load();
    const acct = data.account || '';
    const nChars = Save.chars().length;
    const el = $('title');
    el.className = 't-login';
    el.innerHTML = `<div class="t-vignette"></div>
      <div class="t-logo">${SEAL}<div class="w">Orvalis</div><div class="s">Royaumes en guerre</div></div>
      <div class="t-box panel">
        <label for="tl-acct">Nom d'aventurier</label>
        <input type="text" id="tl-acct" maxlength="20" autocomplete="off" value="${escapeHtml(acct)}" placeholder="Votre nom de compte">
        <button class="btn" id="tl-go">Se connecter</button>
        <div class="note">Aucun mot de passe : vos personnages sont sauvegardés sur cet appareil${nChars ? ` (${nChars} personnage${nChars > 1 ? 's' : ''})` : ''}.</div>
      </div>
      <div class="t-bl"><div>Orvalis ${VERSION}</div><div id="tl-realm" class="muted"></div></div>
      <div class="t-br"><button class="btn ghost" id="tl-cine">Cinématique</button><button class="btn ghost" id="tl-opt">Options</button>${fsSupported() ? `<button class="btn ghost" id="tl-fs">${isFullscreen() ? 'Quitter le plein écran' : 'Plein écran'}</button>` : ''}<button class="btn ghost" id="tl-cred">Crédits</button><button class="btn ghost" id="tl-imp">Importer</button></div>`;
    this.realmStatus();
    $('tl-go').onclick = () => this.connect();
    $('tl-acct').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); this.connect(); } e.stopPropagation(); };
    $('tl-cine').onclick = () => this.startCine();
    $('tl-opt').onclick = () => this.options();
    if ($('tl-fs')) $('tl-fs').onclick = async () => { await toggleFullscreen(); this.syncFsLabels(); };
    $('tl-cred').onclick = () => this.modal('Crédits', `<p>Orvalis est un jeu de rôle en ligne original, créé de toutes pièces : monde, créatures, personnages, quêtes, donjons, musique et sons générés par le code.</p><p>Moteur 3D : three.js. Polices : Grenze Gotisch et Barlow Semi Condensed (Google Fonts).</p><p>Merci de jouer, aventurier.</p>`);
    $('tl-imp').onclick = () => this.importBox();
    setTimeout(() => $('tl-acct')?.focus(), 50);
  },

  realmStatus() {
    const el = $('tl-realm') || $('ts-realm');
    if (!el) return;
    const real = G.net?.remotes?.size || 0;
    const bots = G.bots?.recs?.filter((r) => r.online).length || 0;
    const live = !!G.net?.room;
    const html = `Royaume : <b>Orvalis</b> (JcJ) · <span style="color:${live ? '#5fd35a' : '#9ba4b3'}">●</span> ${live ? 'multijoueur en direct' : 'solo (multijoueur indisponible)'} · ${bots + real} aventuriers${real ? ` dont ${real} vrai${real > 1 ? 's' : ''} joueur${real > 1 ? 's' : ''}` : ''}`;
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
  },

  connect() {
    const v = ($('tl-acct')?.value || '').trim().slice(0, 20);
    const data = Save.load();
    data.account = v || 'Aventurier';
    try { localStorage.setItem('orvalis.save.v1', JSON.stringify(data)); } catch (e) { /* ignore */ }
    G.audio?.unlock?.();
    G.audio?.play('open');
    this.logged = true;
    if (Save.chars().length) this.select(); else this.create();
  },

  modal(title, html) {
    $('t-modal')?.remove();
    const m = document.createElement('div');
    m.id = 't-modal';
    m.className = 'panel';
    m.innerHTML = `<h3>${escapeHtml(title)}</h3><div class="tmb">${html}</div><button class="btn ghost small" id="tm-x">Fermer</button>`;
    $('title').appendChild(m);
    $('tm-x').onclick = () => m.remove();
    return m;
  },

  options() {
    const S = G.settings;
    const m = this.modal('Options', `
      <div class="opt"><label for="to-mus">Musique</label><input type="range" id="to-mus" min="0" max="1" step="0.05" value="${S.music ?? 0.4}"></div>
      <div class="opt"><label for="to-vol">Effets sonores</label><input type="range" id="to-vol" min="0" max="1" step="0.05" value="${S.volume ?? 0.7}"></div>
      <div class="opt"><label>Qualité graphique</label><span>${['Basse', 'Moyenne', 'Haute'].map((n, i) => `<button class="btn small ${S.quality === i ? '' : 'ghost'}" data-q="${i}">${n}</button>`).join('')}</span></div>
      <div class="opt"><label for="to-sh">Ombres</label><input type="checkbox" id="to-sh" ${S.shadows ? 'checked' : ''}></div>`);
    const save = () => { G.audio?.setVolume?.(); G.saveSettings?.(); };
    m.querySelector('#to-mus').oninput = (e) => { S.music = +e.target.value; save(); };
    m.querySelector('#to-vol').oninput = (e) => { S.volume = +e.target.value; save(); };
    m.querySelector('#to-sh').onchange = (e) => { S.shadows = e.target.checked; G.applyGraphics?.(); save(); };
    m.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => { S.quality = +b.dataset.q; G.applyGraphics?.(); save(); this.options(); }));
  },

  importBox() {
    const m = this.modal('Importer un personnage', `<textarea id="tt-code" placeholder="Collez votre code ORV1.…" aria-label="Code de sauvegarde"></textarea><button class="btn small" id="tt-imp2">Importer</button><div id="tt-err" class="bad"></div>`);
    m.querySelector('#tt-imp2').onclick = () => {
      if (Save.importCode($('tt-code').value.trim())) { this.sel = Save.chars()[Save.chars().length - 1].id; m.remove(); this.logged = true; this.select(); }
      else $('tt-err').textContent = 'Code invalide.';
    };
  },

  // ---------------------------------------------------------------------------
  startCine() {
    this.mode = 'cine';
    this.cine = { i: 0, t: 0 };
    G.flags.fixedTime = 0.3;
    const el = $('title');
    el.className = 't-cine';
    el.innerHTML = `<div class="t-bars"></div><div id="t-cap">${escapeHtml(CINE[0].text)}</div><div class="t-skip">Échap : passer</div>`;
    el.onclick = null;
    setTimeout(() => { if (this.mode === 'cine') el.onclick = () => this.endCine(); }, 300);
    G.audio?.unlock?.();
  },
  endCine() {
    if (this.mode !== 'cine') return;
    this.cine = null;
    $('title').onclick = null;
    G.flags.fixedTime = 0.8;
    this.login();
  },

  // ---------------------------------------------------------------------------
  // Sélection du personnage
  select() {
    const chars = Save.chars();
    if (!chars.length) { this.create(); return; }
    if (!chars.find((c) => c.id === this.sel)) this.sel = chars[0].id;
    this.mode = 'select';
    Stage.mode = 'select';
    this.setStage(true);
    const d = chars.find((c) => c.id === this.sel);
    Stage.setFaction(d.faction);
    this.heroFor(d);
    const data = Save.load();
    const el = $('title');
    el.className = 't-select';
    const list = chars.map((c) => {
      const C = CLASSES[c.cls];
      const ic = icon(classSkills(c.cls).find((s) => s.basic).icon[0], C.color);
      return `<div class="ch ${c.id === this.sel ? 'on' : ''}" data-id="${c.id}" tabindex="0"><div class="ic" style="background-image:url(${ic})"></div><div class="tx"><div class="n">${escapeHtml(c.name)}</div><div class="s">Niveau ${c.level} <span style="color:${C.color}">${C.name}</span></div><div class="l">${escapeHtml(this.placeOf(c))}</div></div><span class="fc" style="background:${FACTIONS[c.faction].color}"></span></div>`;
    }).join('');
    const C = CLASSES[d.cls];
    el.innerHTML = `<div class="t-drag"></div>
      <div class="t-top"><span id="ts-realm"></span><button class="btn ghost small" id="ts-out">Changer de compte</button><button class="btn ghost small" id="ts-opt">Options</button>${fsSupported() ? `<button class="btn ghost small" id="ts-fs">${isFullscreen() ? 'Quitter le plein écran' : 'Plein écran'}</button>` : ''}<button class="btn ghost small" id="ts-imp">Importer</button></div>
      <div class="t-list panel"><h3>Personnages <span class="muted">${escapeHtml(data.account || '')}</span></h3><div class="chars">${list}</div>
        <div class="t-lbtn"><button class="btn" id="tt-new">Créer un nouveau personnage</button><button class="btn ghost small" id="tt-del">Supprimer le personnage</button></div></div>
      <div class="t-hero"><div class="hn">${escapeHtml(d.name)}</div><div class="hs">Niveau ${d.level} <span style="color:${C.color}">${C.name}</span> · <span style="color:${FACTIONS[d.faction].color}">${escapeHtml(FACTIONS[d.faction].name)}</span></div>
        ${d.fame ? `<div class="hf">${escapeHtml(G.pvp?.rankName?.(d.fame, d.faction) || '')} · ${d.fame} Gloire</div>` : ''}
        <button class="btn big" id="tt-play">Entrer dans le monde</button><div class="hint">Glissez pour faire pivoter · ↑↓ pour changer · Entrée pour jouer</div></div>
      <div class="t-bl"><button class="btn ghost" id="ts-back">Retour</button></div>`;
    this.realmStatus();
    el.querySelectorAll('.ch').forEach((c) => {
      c.onclick = () => { if (this.sel !== c.dataset.id) { this.sel = c.dataset.id; G.audio?.play('target'); this.select(); } };
      c.ondblclick = () => this.play();
    });
    $('tt-play').onclick = () => this.play();
    $('tt-new').onclick = () => { this.draft = null; this.create(); };
    $('tt-del').onclick = () => this.confirmDelete(d);
    $('ts-back').onclick = () => this.login();
    $('ts-out').onclick = () => this.login();
    $('ts-imp').onclick = () => this.importBox();
    $('ts-opt').onclick = () => this.options();
    if ($('ts-fs')) $('ts-fs').onclick = async () => { await toggleFullscreen(); this.syncFsLabels(); };
  },

  placeOf(c) {
    if (c.pos && Math.abs(c.pos.x) < 600 && Math.abs(c.pos.z) < 600) return zoneAt(c.pos.x, c.pos.z).name;
    return HUB_BY_ID[c.bind || FACTIONS[c.faction].capital]?.name || '';
  },

  heroFor(d) {
    const key = d.id + ':' + JSON.stringify(d.equip ? Object.values(d.equip).map((it) => it?.uid) : []) + JSON.stringify(d.app);
    if (Stage.hero && this.heroKey === key) return;
    this.heroKey = key;
    Stage.setHero(buildCharacterModel({ cls: d.cls, faction: d.faction, app: d.app, equip: d.equip || {} }));
    Stage.rot = 0.35;
    const m = Stage.hero;
    if (m) setTimeout(() => { if (Stage.hero === m) m.play(Math.random() < 0.5 ? 'wave' : 'roar', 1.4); }, 350);
  },

  confirmDelete(d) {
    const m = this.modal('Supprimer un personnage', `<p>Supprimer définitivement <b>${escapeHtml(d.name)}</b>, niveau ${d.level} ${CLASSES[d.cls].name} ? Cette action est irréversible.</p>
      <p>Tapez <b>SUPPRIMER</b> pour confirmer :</p><input type="text" id="td-in" autocomplete="off" aria-label="Confirmation"><div class="row" style="gap:6px;margin-top:8px"><button class="btn danger small" id="td-y" disabled>Supprimer</button></div>`);
    const inp = m.querySelector('#td-in');
    const y = m.querySelector('#td-y');
    inp.oninput = () => (y.disabled = inp.value.trim().toUpperCase() !== 'SUPPRIMER');
    inp.onkeydown = (e) => e.stopPropagation();
    y.onclick = () => { Save.remove(d.id); m.remove(); this.heroKey = null; this.sel = Save.chars()[0]?.id; if (Save.chars().length) this.select(); else this.create(); };
    setTimeout(() => inp.focus(), 30);
  },

  play() {
    const d = Save.chars().find((c) => c.id === this.sel);
    if (!d) return;
    $('t-modal')?.remove();
    this.setStage(false);
    Stage.setHero(null);
    this.heroKey = null;
    G.flags.fixedTime = undefined;
    G.audio?.unlock?.();
    G.startGame(d);
    Save.load().lastId = d.id;
    G.saveNow?.();
  },

  // ---------------------------------------------------------------------------
  // Création
  create() {
    this.mode = 'create';
    Stage.mode = 'create';
    this.setStage(true);
    if (!this.draft) this.draft = { name: '', faction: 0, cls: 'guerrier', app: { skin: 1, hair: 1, hairStyle: 0, beard: false } };
    const D = this.draft;
    Stage.setFaction(D.faction);
    const C = CLASSES[D.cls];
    const el = $('title');
    el.className = 't-create';
    const facs = FACTIONS.map((f) => `<button class="fac ${D.faction === f.id ? 'on' : ''}" data-f="${f.id}" style="--fc:${f.color}">${CREST[f.id]}<b>${escapeHtml(f.name)}</b></button>`).join('');
    const clss = CLASS_LIST.map((c) => {
      const K = CLASSES[c];
      return `<button class="cls ${D.cls === c ? 'on' : ''}" data-c="${c}" title="${escapeHtml(K.name)}" style="--cc:${K.color}"><img alt="" src="${icon(classSkills(c).find((s) => s.basic).icon[0], K.color)}"><span>${escapeHtml(K.name)}</span></button>`;
    }).join('');
    const sk = SKIN_TONES.map((c, i) => `<button class="sw ${D.app.skin === i ? 'on' : ''}" data-skin="${i}" style="background:${c}" aria-label="Teint ${i + 1}"></button>`).join('');
    const hc = HAIR_COLORS.map((c, i) => `<button class="sw ${D.app.hair === i ? 'on' : ''}" data-hair="${i}" style="background:${c}" aria-label="Cheveux ${i + 1}"></button>`).join('');
    const cap = HUB_BY_ID[sanctId(D.cls, D.faction)] || HUB_BY_ID[FACTIONS[D.faction].capital];
    const ord = ORDERS[D.cls];
    const nOthers = Save.chars().length;
    el.innerHTML = `<div class="t-drag"></div>
      <div class="t-left panel">
        <h3>Faction</h3><div class="facs">${facs}</div>
        <div class="fdesc">${escapeHtml(FACTIONS[D.faction].desc)}</div>
        <h3>Classe</h3><div class="clss">${clss}</div>
        <div class="cdesc"><div class="ct" style="color:${C.color}">${escapeHtml(C.name)}</div>
          <div class="cr"><img alt="" src="${icon(ROLE_ICON[C.roleKey], '#333')}"> ${escapeHtml(C.role)} · armure ${escapeHtml(C.armorType.toLowerCase())}</div>
          <div class="cd">${escapeHtml(C.desc)}</div>
          <div class="csp"><b style="color:#d9a441">Spécialisations :</b>${CLASS_SPECS[D.cls].map((id) => `<span title="${escapeHtml(SPECS[id].desc)}"><img alt="" src="${icon(ROLE_GLYPH[SPECS[id].role], '#333')}">${escapeHtml(SPECS[id].name)} <i class="muted">(${ROLE_LABEL[SPECS[id].role].toLowerCase()})</i></span>`).join('')}</div></div>
      </div>
      <div class="t-right panel">
        <h3>Apparence</h3>
        <div class="ap"><span class="lb">Teint</span><button class="ar" data-a="skin:-1" aria-label="Précédent">◀</button><span class="v">${D.app.skin + 1} / ${SKIN_TONES.length}</span><button class="ar" data-a="skin:1" aria-label="Suivant">▶</button></div>
        <div class="swatches">${sk}</div>
        <div class="ap"><span class="lb">Cheveux</span><button class="ar" data-a="hair:-1" aria-label="Précédent">◀</button><span class="v">${D.app.hair + 1} / ${HAIR_COLORS.length}</span><button class="ar" data-a="hair:1" aria-label="Suivant">▶</button></div>
        <div class="swatches">${hc}</div>
        <div class="ap"><span class="lb">Coiffure</span><button class="ar" data-a="hairStyle:-1" aria-label="Précédent">◀</button><span class="v">${HAIR_STYLES[D.app.hairStyle]}</span><button class="ar" data-a="hairStyle:1" aria-label="Suivant">▶</button></div>
        <div class="ap"><span class="lb">Barbe</span><button class="btn small ${D.app.beard ? '' : 'ghost'}" id="cc-beard">${D.app.beard ? 'Oui' : 'Non'}</button></div>
        <button class="btn ghost" id="cc-rand">Apparence aléatoire</button>
        <div class="start muted">Point de départ : <b>${escapeHtml(cap.name)}</b>${ord ? `<div class="ord" style="--oc:${ord.color}">${escapeHtml(ord.order.charAt(0).toUpperCase() + ord.order.slice(1))} — ${escapeHtml(ord.motto)}</div>` : ''}</div>
      </div>
      <div class="t-name"><div class="row"><input type="text" id="cc-name" maxlength="16" value="${escapeHtml(D.name)}" placeholder="Nom du personnage" autocomplete="off" aria-label="Nom du personnage"><button class="btn ghost" id="cc-dice" title="Nom aléatoire" aria-label="Nom aléatoire">⚄</button></div>
        <button class="btn big" id="cc-go">Créer le personnage</button><div id="cc-err" class="bad"></div></div>
      <div class="t-bl">${nOthers ? '<button class="btn ghost" id="cc-back">Retour</button>' : '<button class="btn ghost" id="cc-login">Retour</button>'}</div>`;
    const nm = $('cc-name');
    nm.oninput = () => (D.name = nm.value);
    nm.onkeydown = (e) => { if (e.key === 'Enter') this.finish(); e.stopPropagation(); };
    el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { D.faction = +b.dataset.f; G.audio?.play('target'); this.create(); }));
    el.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { D.cls = b.dataset.c; G.audio?.play('target'); this.create(); }));
    el.querySelectorAll('[data-skin]').forEach((b) => (b.onclick = () => { D.app.skin = +b.dataset.skin; this.create(); }));
    el.querySelectorAll('[data-hair]').forEach((b) => (b.onclick = () => { D.app.hair = +b.dataset.hair; this.create(); }));
    el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
      const [k, dd] = b.dataset.a.split(':');
      const n = k === 'skin' ? SKIN_TONES.length : k === 'hair' ? HAIR_COLORS.length : HAIR_STYLES.length;
      D.app[k] = (D.app[k] + +dd + n) % n;
      this.create();
    }));
    $('cc-beard').onclick = () => { D.app.beard = !D.app.beard; this.create(); };
    $('cc-rand').onclick = () => {
      D.app = { skin: Math.floor(Math.random() * SKIN_TONES.length), hair: Math.floor(Math.random() * HAIR_COLORS.length), hairStyle: Math.floor(Math.random() * HAIR_STYLES.length), beard: Math.random() < 0.3 };
      this.create();
    };
    $('cc-dice').onclick = () => {
      const used = new Set([...Save.chars().map((c) => c.name), ...(G.bots?.recs || []).map((r) => r.name)]);
      let s = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
      const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      let n = makeHeroName(rnd, used);
      n = n.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'-]/g, '').slice(0, 16);
      D.name = n;
      this.create();
    };
    if ($('cc-back')) $('cc-back').onclick = () => this.select();
    if ($('cc-login')) $('cc-login').onclick = () => this.login();
    $('cc-go').onclick = () => this.finish();
    this.updatePreview();
  },

  finish() {
    const D = this.draft;
    const name = (D.name || '').trim();
    const err = $('cc-err');
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'-]{1,15}$/.test(name)) { err.textContent = 'Nom invalide : 2 à 16 lettres (tirets et apostrophes autorisés).'; return; }
    if (Save.chars().some((c) => c.name.toLowerCase() === name.toLowerCase())) { err.textContent = 'Vous avez déjà un personnage de ce nom.'; return; }
    const d = newCharacter({ name, cls: D.cls, faction: D.faction, app: { ...D.app } });
    G.story?.placeNew?.(d); // départ au sanctuaire de l'Ordre de sa classe
    Save.addChar(d);
    this.sel = d.id;
    this.draft = null;
    this.heroKey = null;
    G.audio?.play('levelup');
    this.play();
  },

  updatePreview() {
    const D = this.draft;
    const key = 'draft:' + D.cls + D.faction + JSON.stringify(D.app);
    if (this.heroKey === key) return;
    const prevCls = this.heroKey?.startsWith('draft:') ? this.heroKey.slice(6).match(/^[a-z]+/)[0] : null;
    this.heroKey = key;
    // tenue de démonstration de la classe (aperçu du style, pas l'équipement de départ)
    const equip = {
      weapon: makeGear({ slot: 'weapon', cls: D.cls, ilvl: 12, quality: 82 }, seeded(D.cls)),
      chest: makeGear({ slot: 'chest', cls: D.cls, ilvl: 12, quality: 82 }, seeded(D.cls + 'c')),
      legs: makeGear({ slot: 'legs', cls: D.cls, ilvl: 12, quality: 65 }, seeded(D.cls + 'l')),
      hands: makeGear({ slot: 'hands', cls: D.cls, ilvl: 12, quality: 65 }, seeded(D.cls + 'h')),
      feet: makeGear({ slot: 'feet', cls: D.cls, ilvl: 12, quality: 65 }, seeded(D.cls + 'f')),
    };
    if (D.cls !== 'archer') equip.offhand = makeGear({ slot: 'offhand', cls: D.cls, ilvl: 12, quality: 72 }, seeded(D.cls + 'o'));
    const rot = Stage.hero ? Stage.rot : 0.35;
    Stage.setHero(buildCharacterModel({ cls: D.cls, faction: D.faction, app: D.app, equip }));
    Stage.rot = rot;
    if (prevCls !== D.cls && Stage.hero) { const m = Stage.hero; setTimeout(() => { if (Stage.hero === m) m.play(D.cls === 'mage' || D.cls === 'necro' || D.cls === 'druide' || D.cls === 'chaman' ? 'cast' : 'attack2', 0.9); }, 250); }
  },
};

function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
