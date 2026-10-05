import { portraitUrl } from './portrait3d.js';
import { WORLD_HALF } from '../data/world-space.js';
import { isInstancePoint } from '../data/world-space.js';
// Interface en jeu : cadres, barre d'action, mini-carte, plaques de nom, textes de combat, discussion, messages.
import * as THREE from 'three';
import { G, xpToNext, LEVEL_CAP, SCHOOL_COLORS } from '../game/state.js';
import { icon, itemIcon } from './icons.js';
import { toggleFullscreen, isFullscreen, fsSupported, onFullscreenChange } from '../core/fullscreen.js';
import { SKILL_BY_ID, classSkills } from '../data/skills.js';
import { CONSUMABLES, RARITY, SLOT_NAMES, SLOTS, gearStats, itemStats, setName, SET_SLOTS } from '../data/items.js';
import { RUNE_TYPES, runeName, runeBonusText } from '../data/runes.js';
import { PET_ROLES, PET_MODES, petGlyph, totemsOf } from '../game/pets.js';
import { MOB_BY_ID } from '../data/mobs.js';
import { CLASSES, STAT_NAMES } from '../data/classbase.js';
import { FACTIONS, HUBS, ZONES } from '../data/zones.js';
import { ORDERS, aName } from '../data/lore.js';
import { canAttack, isFriendly, dist, edgeDist, skillCost, skillCd, isHostile, isPlayerLike } from '../game/combat.js';
import { conColor } from '../game/progress.js';
import { Sky } from '../engine/sky.js';
import { computeStats, weaponAvg, armorReduction } from '../game/stats.js';
import { SPECS, specOf, roleOf, ROLE_LABEL } from '../data/specs.js';
import { basicSkill } from '../game/talents.js';
import { EXT_X, getHeight } from '../world/terrain.js';
import { escapeHtml, fmtInt, clamp, wrapAngle, angleTo } from '../core/util.js';
import { renderWorldMap } from '../world/mapgen.js';

const $ = (id) => document.getElementById(id);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const V = new THREE.Vector3();

export const UI = {
  dirty: true,
  floaters: [],
  plates: new Map(),
  chatLines: [],
  chatTab: 'all',
  mapZoom: 1,

  init() {
    this.hud = $('hud');
    this.tip = $('tooltip');
    this.buildUnitFrame();
    this.buildTargetFrame();
    this.buildActionBar();
    this.buildMinimap();
    this.buildChat();
    this.buildMenu();
    this.buildGuide();
    for (let i = 0; i < 70; i++) {
      const d = h('div', 'ft');
      d.style.display = 'none';
      $('floaters').appendChild(d);
      this.floaters.push({ el: d, t: 0, on: false });
    }
    window.addEventListener('mousemove', (e) => this.moveTip(e));
    this.mapImg = renderWorldMap(512);
  },

  show(on) { this.hud.hidden = !on; $('nameplates').hidden = !on; $('floaters').hidden = !on; if (!on) this.beacon(null); },
  iconUrl(glyph, color) { return icon(glyph, color); },

  // ---------------------------------------------------------------------------
  buildUnitFrame() {
    const P = () => G.player;
    const el = $('unitframe');
    el.className = 'panel';
    el.innerHTML = `<div class="uf"><div class="portrait" id="pf-por"><div class="lvl num" id="pf-lvl">1</div></div>
      <div><div class="top"><span class="nm" id="pf-nm"></span><span class="sub" id="pf-sub"></span></div>
      <div class="bars"><div class="bar hp friendly" id="pf-hp"><div class="f2"></div><div class="f"></div><div class="t num"></div></div>
      <div class="bar mp" id="pf-mp"><div class="f"></div><div class="t num"></div></div></div></div></div>
      <div class="buffs" id="pf-buffs" style="padding:0 8px 6px"></div>`;
    el.addEventListener('click', () => { if (P()) P().setTarget(P()); });
  },
  buildTargetFrame() {
    const el = $('targetframe');
    el.className = 'panel';
    el.innerHTML = `<div class="uf"><div class="portrait" id="tf-por"><div class="lvl num" id="tf-lvl">1</div></div>
      <div><div class="top"><span class="nm" id="tf-nm"></span><span class="elite" id="tf-el"></span></div>
      <div class="bars"><div class="bar hp" id="tf-hp"><div class="f2"></div><div class="f"></div><div class="t num"></div></div>
      <div class="bar mp" id="tf-mp"><div class="f"></div><div class="t num"></div></div></div>
      <div class="tcast" id="tf-cast" hidden><div class="bar"><div class="f"></div><div class="t"></div></div></div>
      <div class="tot" id="tf-tot"></div></div></div>
      <div class="buffs" id="tf-buffs" style="padding:0 8px 6px"></div>`;
  },

  setBar(elId, cur, max, text = true) {
    const el = typeof elId === 'string' ? $(elId) : elId;
    if (!el) return;
    const k = max > 0 ? clamp(cur / max, 0, 1) : 0;
    const f = el.querySelector('.f');
    if (f._k !== k) { f.style.transform = `scaleX(${k})`; f._k = k; }
    const f2 = el.querySelector('.f2');
    if (f2 && f2._k !== k) { f2.style.transform = `scaleX(${k})`; f2._k = k; }
    const t = el.querySelector('.t');
    if (t && text) {
      const s = `${fmtInt(cur)} / ${fmtInt(max)}`;
      if (t._s !== s) { t.textContent = s; t._s = s; }
    }
  },

  // effets du joueur en haut à droite (bénéfiques puis néfastes), comme dans les grands MMO
  renderPlayerAuras(P) {
    let el = $('buffbar');
    if (!el) {
      el = h('div', '');
      el.id = 'buffbar';
      el.innerHTML = '<div class="bb-row" id="bb-buffs"></div><div class="bb-row debuffs" id="bb-debuffs"></div>';
      $('hud').appendChild(el);
      G.layout?.applyAll?.();
    }
    const mk = (row, list) => {
      const key = list.map((b) => b.def.id + (b.stacks || 1) + Math.ceil((b.dur - b.t) * (b.dur - b.t < 10 ? 10 : 1))).join(',');
      if (row._key === key) return;
      row._key = key;
      row.innerHTML = '';
      for (const b of list) {
        const left = b.dur - b.t;
        const d = h('div', 'aura' + (b.def.debuff ? ' debuff' : ''));
        const ic = h('div', 'ic');
        ic.style.backgroundImage = `url(${icon(b.def.icon[0], b.def.icon[1])})`;
        if (b.stacks > 1) ic.appendChild(h('span', 's', b.stacks));
        d.appendChild(ic);
        d.appendChild(h('span', 't num' + (left < 5 ? ' soon' : ''), left < 1e6 ? this.fmtLeft(left) : ''));
        d.dataset.tip = `<div class="tn">${b.def.name}</div><div class="tl">${b.def.debuff ? 'Effet néfaste' : 'Effet bénéfique'}${left < 1e6 ? ` — ${Math.ceil(left)} s restantes` : ''}</div>${b.src && b.src !== P ? `<div class="td">Source : ${escapeHtml(b.src.name || '')}</div>` : ''}`;
        this.bindTip(d);
        row.appendChild(d);
      }
    };
    const vis = P.buffs.filter((b) => !(b.def.id === 'mounted' && b.dur > 1e8));
    mk($('bb-buffs'), vis.filter((b) => !b.def.debuff));
    mk($('bb-debuffs'), vis.filter((b) => b.def.debuff));
  },
  // invocations (squelettes, loups, esprits…) et totems : nombre et temps restant
  renderMinions(P) {
    let el = $('minions');
    if (!el) {
      el = h('div', 'panel');
      el.id = 'minions';
      $('leftcol').insertBefore(el, $('petframe'));
    }
    const groups = new Map();
    for (const m of G.pets?.minionsOf?.(P) || []) {
      const k = m.def.id;
      const g = groups.get(k) || { name: m.def.name, glyph: petGlyph(m.def), color: '#a8a4d8', n: 0, left: 1e9, max: m.lifeMax || 0 };
      g.n++;
      if (m.lifeMax > 0) g.left = Math.min(g.left, m.lifeT);
      groups.set(k, g);
    }
    for (const T of totemsOf(P)) groups.set('t_' + T.kind, { name: T.name, glyph: 'totemheal', color: T.color || '#2ab5ff', n: 1, left: T.left, max: T.max });
    if (!groups.size) { if (!el.hidden) { el.hidden = true; el._key = ''; } return; }
    el.hidden = false;
    const key = [...groups.entries()].map(([k, g]) => k + g.n + Math.ceil(g.left)).join(',');
    if (el._key !== key) {
      el._key = key;
      el.innerHTML = [...groups.values()].map((g) => {
        const timed = g.max > 0 && g.left < 1e8;
        const k = timed ? Math.max(0, Math.min(1, g.left / g.max)) : 1;
        return `<div class="mn"><div class="ic" style="background-image:url(${icon(g.glyph, g.color)})">${g.n > 1 ? `<span class="s num">${g.n}</span>` : ''}</div><div class="tx"><div class="nm">${escapeHtml(g.name)}${g.n > 1 ? ` <b>×${g.n}</b>` : ''}</div><div class="bar"><div class="f" style="transform:scaleX(${k})"></div><span class="t num">${timed ? this.fmtLeft(g.left) + (g.left >= 60 ? '' : ' s') : 'permanent'}</span></div></div></div>`;
      }).join('');
    }
  },
  // temps restant façon MMO : « 2 m », « 14 », « 4,2 »
  fmtLeft(left) { return left >= 60 ? Math.ceil(left / 60) + ' m' : left >= 10 ? String(Math.ceil(left)) : left.toFixed(1).replace('.', ','); },
  renderBuffs(el, e) {
    const P = G.player;
    // sur la cible : vos propres effets d'abord (bordure dorée)
    const list = e === P ? e.buffs : [...e.buffs].sort((a, b) => (b.src === P) - (a.src === P));
    const key = list.map((b) => b.def.id + (b.stacks || 1) + Math.ceil((b.dur - b.t) * (b.dur - b.t < 10 ? 10 : 1))).join(',');
    if (el._key === key) return;
    el._key = key;
    el.innerHTML = '';
    for (const b of list) {
      if (b.def.id === 'mounted' && b.dur > 1e8) { /* monture */ }
      const d = h('div', 'buff' + (b.def.debuff ? ' debuff' : '') + (e !== P && b.src === P ? ' mine' : ''));
      d.style.backgroundImage = `url(${icon(b.def.icon[0], b.def.icon[1])})`;
      const left = b.dur - b.t;
      if (left < 1e6) d.appendChild(h('span', 'd num' + (left < 5 ? ' soon' : ''), this.fmtLeft(left)));
      if (b.stacks > 1) d.appendChild(h('span', 's', b.stacks));
      d.dataset.tip = `<div class="tn">${b.def.name}</div><div class="tl">${b.def.debuff ? 'Effet néfaste' : 'Effet bénéfique'}${left < 1e6 ? ` — ${Math.ceil(left)} s` : ''}</div>`;
      this.bindTip(d);
      el.appendChild(d);
    }
  },

  // ---------------------------------------------------------------------------
  // barres d'action : principale (1…0), barre 2 (Maj + 1…0), barre 3 et barre latérale (souris) — 40 emplacements
  buildActionBar() {
    this.slots = [];
    const mk = (id, start, cls, key) => {
      let el = $(id);
      if (!el) { el = h('div'); el.id = id; }
      el.className = 'panel abar ' + cls;
      for (let j = 0; j < 10; j++) this.buildSlot(el, start + j, key(j));
      return el;
    };
    mk('actionbar', 0, 'main', (j) => String(j === 9 ? 0 : j + 1));
    const b2 = mk('actionbar2', 10, 'extra', (j) => '⇧' + (j === 9 ? 0 : j + 1));
    const b3 = mk('actionbar3', 20, 'extra', () => '');
    const b4 = mk('actionbar4', 30, 'side', () => '');
    const bottom = $('bottom');
    bottom.insertBefore(b3, $('xpbar'));
    bottom.insertBefore(b2, $('xpbar'));
    $('hud').appendChild(b4);
    this.buildPetBar();
    this.applyBars();
  },
  // ---------------------------------------------------------------------------
  // Barre du familier (façon grand MMO) : ordres, comportement et rôle
  buildPetBar() {
    const bar = h('div', 'panel');
    bar.id = 'petbar';
    bar.hidden = true;
    const B = [
      ['cmd', 'attack', 'pet_attack', '#8a3a2a', 'Attaquer', 'Votre familier attaque votre cible, même en mode passif.'],
      ['cmd', 'follow', 'pet_follow', '#3a5a3a', 'Suivre', 'Votre familier vous suit (et oublie l\'ordre « Rester »).'],
      ['cmd', 'stay', 'pet_stay', '#5a4a2a', 'Rester', 'Votre familier garde sa position actuelle.'],
      ['sep'],
      ...Object.entries(PET_MODES).map(([k, m]) => ['mode', k, k === 'aggressive' ? 'pet_aggr' : k === 'assist' ? 'pet_assist' : 'pet_passive', k === 'aggressive' ? '#7a2a2a' : k === 'assist' ? '#2a4a6a' : '#3a3a5a', m.name, m.desc]),
      ['sep'],
      ...Object.entries(PET_ROLES).map(([k, r]) => ['role', k, r.glyph, r.color, `Rôle : ${r.name}`, r.desc]),
    ];
    bar.innerHTML = `<div class="pb-pet"><div class="pb-ic"></div><div class="pb-tx"><b class="pb-nm"></b><div class="bar hp friendly pb-hp"><div class="f"></div></div></div></div>`;
    for (const [kind, id, gl, col, name, desc] of B) {
      if (kind === 'sep') { bar.appendChild(h('span', 'pb-sep')); continue; }
      const b = h('button', 'pb-btn');
      b.dataset.kind = kind; b.dataset.id = id;
      b.style.backgroundImage = `url(${icon(gl, col)})`;
      b.setAttribute('aria-label', name);
      b.dataset.tip = `<div class="tn">${escapeHtml(name)}</div><div class="td">${escapeHtml(desc)}</div>`;
      this.bindTip(b);
      b.onclick = () => {
        const Pt = G.pets;
        if (!Pt) return;
        if (kind === 'cmd') Pt.command(id);
        else if (kind === 'mode') Pt.setMode(id);
        else Pt.setRole(id);
        this.updatePetBar(true);
      };
      bar.appendChild(b);
    }
    bar.querySelector('.pb-pet').onclick = () => G.win?.toggle('pets');
    $('bottom').insertBefore(bar, $('xpbar'));
    this.petBar = bar;
  },
  // indication « F : … » quand une interaction est possible (PNJ, filon, plante, corps à dépecer, eau)
  updateHint(dt) {
    this._ihT = (this._ihT || 0) - dt;
    if (this._ihT > 0) return;
    this._ihT = 0.25;
    let el = this.hintEl;
    if (!el) {
      el = h('div', 'ihint');
      el.hidden = true;
      $('bottom').insertBefore(el, $('bottom').firstChild);
      this.hintEl = el;
    }
    const P = G.player;
    let txt = null;
    if (P && !P.dead && !P.cast && !isInstancePoint(P.pos.x, P.pos.z)) {
      let npc = null, bd = 6.5;
      for (const e of G.world.query(P.pos.x, P.pos.z, 7)) {
        if (e.kind !== 'npc' || e.guard || e.rec?.citizen) continue;
        const d = dist(P, e);
        if (d < bd) { bd = d; npc = e; }
      }
      const Pr = G.profs;
      if (npc) txt = `Parler ${escapeHtml(aName(npc.name))}`;
      else if (Pr) {
        const n = Pr.nearestNode(4.8);
        if (n) {
          const prof = Pr.nodeProf(n);
          txt = Pr.has(prof) ? `${n.kind === 'ore' ? 'Extraire' : 'Cueillir'} : ${escapeHtml(Pr.nodeName(n))}` : `${escapeHtml(Pr.nodeName(n))} <span class="bad">(métier ${prof === 'mineur' ? 'Mineur' : 'Herboriste'} requis)</span>`;
        } else if (Pr.has('depeceur')) {
          for (const e of G.world.query(P.pos.x, P.pos.z, 6)) if (Pr.skinnable(e)) { txt = `Dépecer : ${escapeHtml(e.name)}`; break; }
        }
        if (!txt && Pr.has('pecheur') && !P.inCombat() && Pr.waterAhead()) txt = 'Pêcher';
      }
    }
    if (!txt) { if (!el.hidden) el.hidden = true; return; }
    const html = `<span class="k">F</span>${txt}`;
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
    el.hidden = false;
  },
  updatePetBar(force = false) {
    const bar = this.petBar;
    if (!bar) return;
    this._pbT = (this._pbT || 0) - (G.dt || 0.016);
    if (!force && this._pbT > 0) return;
    this._pbT = 0.2;
    const Pt = G.pets, P = G.player;
    const rec = Pt?.activeRec?.();
    const a = Pt?.active;
    const show = !!(P && rec && G.settings.petBar !== false && !(isInstancePoint(P.pos.x, P.pos.z) && !a));
    if (bar.hidden === show) bar.hidden = !show;
    if (!show) return;
    const def = MOB_BY_ID[rec.mob];
    const sig = rec.uid + '|' + rec.level;
    if (bar._sig !== sig) {
      bar._sig = sig;
      bar.querySelector('.pb-ic').style.backgroundImage = `url(${icon(petGlyph(def), '#4a5a2a')})`;
      bar.querySelector('.pb-nm').textContent = `${rec.name} (${rec.level})`;
    }
    const k = a ? (a.dead ? 0 : a.hp / (a.stats.maxHp || 1)) : rec.hpK ?? 1;
    bar.querySelector('.pb-hp .f').style.transform = `scaleX(${clamp(k, 0, 1)})`;
    bar.classList.toggle('dead', !a || a.dead);
    const mode = P.data.petMode || 'assist', role = rec.role || 'dps';
    for (const b of bar.querySelectorAll('.pb-btn')) {
      const on = (b.dataset.kind === 'mode' && b.dataset.id === mode) || (b.dataset.kind === 'role' && b.dataset.id === role)
        || (b.dataset.kind === 'cmd' && ((b.dataset.id === 'stay' && a?.stayAt) || (b.dataset.id === 'attack' && a?.forceT > 0 && a?.forceTarget && !a.forceTarget.dead)));
      if (b.classList.contains('on') !== !!on) b.classList.toggle('on', !!on);
    }
  },
  applyBars() {
    const S = G.settings;
    $('actionbar2').hidden = !S.bar2;
    $('actionbar3').hidden = !S.bar3;
    $('actionbar4').hidden = !S.bar4;
    this.hud.classList.toggle('sidebar', !!S.bar4);
    this.dirty = true;
  },
  buildSlot(bar, i, key) {
    {
      const s = h('div', 'slot');
      s.innerHTML = `<div class="cd"></div><div class="cdt num"></div><span class="k">${key}</span><span class="n num"></span>`;
      s.addEventListener('click', () => G.player?.useBarSlot(i));
      s.addEventListener('contextmenu', (e) => { e.preventDefault(); if (G.player) { G.player.data.bar[i] = null; this.dirty = true; } });
      s.addEventListener('dragover', (e) => { e.preventDefault(); s.classList.add('drop'); });
      s.addEventListener('dragleave', () => s.classList.remove('drop'));
      s.addEventListener('drop', (e) => {
        e.preventDefault(); s.classList.remove('drop');
        const d = e.dataTransfer.getData('text/plain');
        if (!d || !G.player) return;
        const bar = G.player.data.bar;
        if (d.startsWith('skill:')) bar[i] = { k: 's', id: d.slice(6) };
        else if (d.startsWith('cons:')) bar[i] = { k: 'i', cid: d.slice(5) };
        else if (d.startsWith('bar:')) { const j = +d.slice(4); [bar[i], bar[j]] = [bar[j], bar[i]]; }
        this.dirty = true;
      });
      s.draggable = true;
      s.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', 'bar:' + i));
      s.addEventListener('mouseenter', () => { s._hover = true; });
      s.addEventListener('mouseleave', () => { s._hover = false; this.hideTip(); });
      s.addEventListener('mousemove', (e) => { const t = this.slotTip(i); if (t) this.showTip(t, e); });
      bar.appendChild(s);
      this.slots[i] = s;
    }
  },

  slotTip(i) {
    const P = G.player;
    const sl = P?.data.bar[i];
    if (!sl) return null;
    if (sl.k === 's') return this.skillTip(SKILL_BY_ID[sl.id]);
    const c = CONSUMABLES[sl.cid];
    return c ? `<div class="tn">${c.name}</div><div class="td">${c.desc}</div><div class="tl">Vous en avez ${P.countItem(sl.cid)}.</div>` : null;
  },

  skillTip(s, rankOverride) {
    const P = G.player;
    if (!s) return '';
    const r = rankOverride ?? Math.max(1, P.skillRank(s.id));
    const cost = s.cost ? `${skillCost(P, s)} mana` : 'Sans coût';
    const cast = s.channel ? `Canalisé ${s.channel} s` : s.cast ? `Incantation ${String(s.cast).replace('.', ',')} s` : 'Instantané';
    const range = s.target === 'self' ? '' : ` — Portée ${Math.round(s.range || 3.6)} m`;
    const ecd = s.cd ? skillCd(P, s, r) : 0;
    const cd = ecd ? ` — Recharge ${ecd >= 60 && ecd % 60 === 0 ? ecd / 60 + ' min' : String(Math.round(ecd * 10) / 10).replace('.', ',') + ' s'}` : '';
    const sp = s.spec && SPECS[s.spec];
    return `<div class="tn">${s.name}${s.noRank ? '' : ` <span class="muted" style="font-size:13px">rang ${r}/${s.max}</span>`}</div>
      <div class="tl">${cost} — ${cast}${range}${cd}</div><div class="td">${s.desc(r, P)}</div>${sp ? `<div class="tl" style="color:#c8b8ff">Technique ${s.talent ? 'de talent' : 'de spécialisation'} — ${escapeHtml(sp.name)}</div>` : ''}${s.lvl > P.level ? `<div class="tr">Niveau ${s.lvl} requis</div>` : ''}${sp && !P.skillRank(s.id) ? `<div class="tr">${s.spec !== P.spec ? `Spécialisation ${escapeHtml(sp.name)} requise` : 'Talent non appris'}</div>` : ''}`;
  },

  updateActionBar() {
    const P = G.player;
    const bar = P.data.bar;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i], sl = bar[i];
      if (i >= 10 && s.parentElement?.hidden) continue;
      let img = '', count = '', cdK = 0, cdT = '', nomana = false, oor = false, locked = false, active = false;
      if (sl && sl.k === 's') {
        const sk = SKILL_BY_ID[sl.id];
        if (sk) {
          img = icon(sk.icon[0], sk.icon[1]);
          const cd = P.cds[sk.id] || 0;
          const total = sk.cd ? skillCd(P, sk, 1) : 0;
          if (cd > 0 && total) { cdK = cd / total; cdT = cd > 60 ? Math.ceil(cd / 60) + 'm' : cd >= 10 ? Math.ceil(cd) : cd.toFixed(1).replace('.', ','); }
          else if (P.gcd > 0 && sk.gcd !== false) cdK = P.gcd / 1.15;
          nomana = P.mp < skillCost(P, sk);
          locked = !P.skillRank(sk.id) || sk.lvl > P.level;
          if (sk.target === 'enemy' && P.target && canAttack(P, P.target)) oor = edgeDist(P, P.target) > (sk.range || 3.6) + 0.5;
          active = P.cast && P.cast.s === sk;
        }
      } else if (sl && sl.k === 'i') {
        const c = CONSUMABLES[sl.cid];
        if (c) {
          img = icon(c.icon, '#3a4150');
          count = P.countItem(sl.cid);
          if ((c.type === 'potion') && P.potionCd > 0) { cdK = P.potionCd / 20; cdT = Math.ceil(P.potionCd); }
          locked = count === 0;
        }
      }
      if (s._img !== img) { s.style.backgroundImage = img ? `url(${img})` : ''; s._img = img; s.classList.toggle('empty', !img); }
      const n = s.querySelector('.n');
      const cs = count === '' ? '' : String(count);
      if (n._t !== cs) { n.textContent = cs; n._t = cs; }
      const cdEl = s.querySelector('.cd');
      const kk = Math.round(cdK * 100) / 100;
      if (cdEl._k !== kk) { cdEl.style.setProperty('--p', kk); cdEl._k = kk; }
      const ct = s.querySelector('.cdt');
      if (ct._t !== cdT) { ct.textContent = cdT; ct._t = cdT; }
      s.classList.toggle('nomana', nomana && !locked);
      s.classList.toggle('oor', oor && !nomana && !locked);
      s.classList.toggle('locked', locked);
      s.classList.toggle('active', !!active);
    }
  },

  // ---------------------------------------------------------------------------
  buildMinimap() {
    const box = $('minimapbox');
    box.innerHTML = `<div class="zn" id="mm-zone">—</div><div class="zl" id="mm-lvl"></div>
      <div class="mm"><canvas id="mm-cv" width="360" height="360"></canvas><span class="n">N</span></div>
      <div class="mmrow"><button class="mmbtn" id="mm-out" title="Dézoomer">−</button><span class="num" id="mm-pos"></span><span class="clock num" id="mm-clock"></span><button class="mmbtn" id="mm-in" title="Zoomer">+</button></div>
      <div class="online" id="mm-online"></div>`;
    $('mm-in').onclick = () => (this.mapZoom = Math.min(2.5, this.mapZoom * 1.35));
    $('mm-out').onclick = () => (this.mapZoom = Math.max(0.45, this.mapZoom / 1.35));
    this.mmCtx = $('mm-cv').getContext('2d');
  },

  drawMinimap() {
    const P = G.player;
    const c = this.mmCtx;
    const W = 360;
    const R = 95 / this.mapZoom; // rayon affiché (m)
    const k = W / (R * 2); // px par mètre
    c.save();
    c.clearRect(0, 0, W, W);
    c.beginPath(); c.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#0b0e14'; c.fillRect(0, 0, W, W);
    const inst = isInstancePoint(P.pos.x, P.pos.z) ? G.inst?.active : null;
    c.imageSmoothingEnabled = true;
    if (inst) {
      const D = inst.D, s2 = D.map.width / D.size;
      c.drawImage(D.map, (P.pos.x - R - D.x0) * s2, (P.pos.z - R - D.z0) * s2, R * 2 * s2, R * 2 * s2, 0, 0, W, W);
    } else {
      const img = this.mapImg, s = img.width / (WORLD_HALF * 2);
      c.drawImage(img, (P.pos.x - R + WORLD_HALF) * s, (P.pos.z - R + WORLD_HALF) * s, R * 2 * s, R * 2 * s, 0, 0, W, W);
    }
    const toX = (x) => W / 2 + (x - P.pos.x) * k, toY = (z) => W / 2 + (z - P.pos.z) * k;
    if (inst) G.inst.drawMinimapMarks(c, toX, toY, W);
    // zones de quête
    const areas = G.quests?.trackedAreas?.() || [];
    for (const a of areas) {
      c.beginPath(); c.arc(toX(a.x), toY(a.z), Math.max(8, a.r * k), 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,210,74,.16)'; c.fill(); c.strokeStyle = 'rgba(255,210,74,.6)'; c.lineWidth = 2; c.stroke();
    }
    // hubs
    for (const hb of inst ? [] : HUBS) {
      const x = toX(hb.x), y = toY(hb.z);
      if (x < -20 || y < -20 || x > W + 20 || y > W + 20) continue;
      c.strokeStyle = '#000'; c.lineWidth = 2;
      if (hb.type === 'sanctuary') {
        // sanctuaire d'un Ordre : losange à sa couleur
        c.fillStyle = ORDERS[hb.cls]?.color || '#c8b0ff';
        c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x + 7, y); c.lineTo(x, y + 7); c.lineTo(x - 7, y); c.closePath(); c.fill(); c.stroke();
        continue;
      }
      c.fillStyle = FACTIONS[hb.faction].color;
      c.fillRect(x - 6, y - 6, 12, 12); c.strokeRect(x - 6, y - 6, 12, 12);
    }
    // nœuds de récolte (métiers)
    if (!inst) G.profs?.drawMinimap?.(c, toX, toY, W);
    // entités
    for (const e of G.world.entities) {
      if (e === P || e.dead && e.kind !== 'mob') continue;
      const x = toX(e.pos.x), y = toY(e.pos.z);
      if (x < 0 || y < 0 || x > W || y > W) continue;
      let col = null, r = 4;
      if (e.kind === 'mob') { if (e.dead) continue; col = e.passive ? '#c8c8c8' : e.boss || e.elite ? '#ff9a2a' : '#ff4a3a'; if (e.boss) r = 7; }
      else if (e.kind === 'npc') { col = e.questMark ? '#ffd24a' : e.guard ? (FACTIONS[e.faction]?.color || '#fff') : '#e8e0c8'; r = e.questMark ? 5 : 3.5; }
      else if (e.kind === 'bot' || e.kind === 'remote') { col = e.faction === P.faction ? (e.inMyParty ? '#5fd3ff' : '#6ade5e') : '#ff3a8a'; r = 4.5; }
      if (!col) continue;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = col; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1.5; c.stroke();
    }
    // marqueurs de quête (PNJ lointains)
    const marks = inst ? [] : G.quests?.npcMarks?.() || [];
    c.font = 'bold 26px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const m of marks) {
      let x = toX(m.x), y = toY(m.z);
      const dx = x - W / 2, dy = y - W / 2, d = Math.hypot(dx, dy);
      if (d > W / 2 - 14) { x = W / 2 + dx / d * (W / 2 - 14); y = W / 2 + dy / d * (W / 2 - 14); }
      c.fillStyle = m.done ? '#5fd35a' : '#ffd24a'; c.strokeStyle = '#000'; c.lineWidth = 4;
      c.strokeText(m.done ? '?' : '!', x, y); c.fillText(m.done ? '?' : '!', x, y);
    }
    // objectif guidé (loupe)
    const GT = !inst && G.quests?.guideTarget?.();
    if (GT) {
      let x = toX(GT.x), y = toY(GT.z);
      const dx = x - W / 2, dy = y - W / 2, dd = Math.hypot(dx, dy);
      if (dd > W / 2 - 16) { x = W / 2 + (dx / dd) * (W / 2 - 16); y = W / 2 + (dy / dd) * (W / 2 - 16); }
      const k = 1 + 0.18 * Math.sin(G.time * 5);
      c.beginPath(); c.arc(x, y, 17 * k, 0, Math.PI * 2); c.strokeStyle = 'rgba(255,210,74,.75)'; c.lineWidth = 2.5; c.stroke();
      c.save(); c.translate(x, y); c.rotate(Math.PI / 4);
      c.fillStyle = '#ffd24a'; c.strokeStyle = '#000'; c.lineWidth = 3; c.fillRect(-8, -8, 16, 16); c.strokeRect(-8, -8, 16, 16);
      c.restore();
    }
    // joueur (flèche)
    c.translate(W / 2, W / 2);
    c.rotate(-P.ry + Math.PI);
    c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath();
    c.fillStyle = '#ffe68a'; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 2.5; c.stroke();
    c.restore();
    // cône de caméra
  },

  // ---------------------------------------------------------------------------
  buildChat() {
    const el = $('chat');
    el.innerHTML = `<div class="tabs"><span class="tab on" data-t="all">Tout</span><span class="tab" data-t="social">Social</span><span class="tab" data-t="combat">Combat</span></div>
      <div class="log" id="chat-log"></div>
      <div class="row"><select id="chat-ch" aria-label="Canal"><option value="gen">Général</option><option value="fac">Faction</option><option value="grp">Groupe</option></select><input id="chat-in" maxlength="140" placeholder="Entrée pour discuter…" aria-label="Message" autocomplete="off"></div>`;
    el.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
      el.querySelectorAll('.tab').forEach((x) => x.classList.remove('on'));
      t.classList.add('on');
      this.chatTab = t.dataset.t;
      this.renderChat();
    }));
    const input = $('chat-in');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = input.value.trim();
        input.value = '';
        input.blur();
        if (v) this.sendChat(v, $('chat-ch').value);
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === 'Escape') { input.value = ''; input.blur(); e.stopPropagation(); }
      e.stopPropagation();
    });
  },

  sendChat(text, ch) {
    const P = G.player;
    if (text.startsWith('/')) { G.commands?.(text); return; }
    this.chat(ch, P.name, text, true);
    G.net?.sendChat(ch, text);
    G.bots?.onPlayerChat?.(text, ch);
  },

  // canal : gen, fac, grp, sys, loot, cbt, wh, evt, err
  chat(ch, who, text, me = false, faction = null) {
    const cls = { gen: 'ch-gen', fac: 'ch-fac', grp: 'ch-grp', sys: 'ch-sys', loot: 'ch-loot', cbt: 'ch-cbt', wh: 'ch-wh', evt: 'ch-evt', err: 'ch-err' }[ch] || 'ch-gen';
    const tag = { gen: '[Général] ', fac: '[Faction] ', grp: '[Groupe] ', wh: '' }[ch] ?? '';
    const facCol = faction === null ? '' : ` style="color:${FACTIONS[faction]?.color || '#fff'}"`;
    const html = who ? `${tag}<span class="who"${facCol} data-who="${escapeHtml(who)}">${escapeHtml(who)}</span> : ${escapeHtml(text)}` : escapeHtml(text);
    this.chatLines.push({ ch, html: `<div class="${cls}">${html}</div>` });
    if (this.chatLines.length > 160) this.chatLines.splice(0, 40);
    this.chatDirty = true;
  },
  log(text, ch = 'sys') { this.chat(ch, null, text); },

  renderChat() {
    const log = $('chat-log');
    if (!log) return;
    const f = this.chatTab;
    const lines = this.chatLines.filter((l) => f === 'all' ? l.ch !== 'cbt' : f === 'social' ? ['gen', 'fac', 'grp', 'wh', 'evt'].includes(l.ch) : ['cbt', 'loot', 'sys', 'err'].includes(l.ch));
    const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 30;
    log.innerHTML = lines.slice(-90).map((l) => l.html).join('');
    if (atBottom) log.scrollTop = log.scrollHeight;
    this.chatDirty = false;
  },

  focusChat(prefix = '') {
    const i = $('chat-in');
    i.value = prefix;
    i.focus();
  },

  // ---------------------------------------------------------------------------
  buildMenu() {
    const el = $('menubar');
    el.className = 'panel';
    const items = [
      ['char', 'Personnage', 'C', 'm_char', '#3a4150'],
      ['bag', 'Sac', 'B', 'm_bag', '#3a4150'],
      ['runes', 'Runes : fusion et sertissage', 'R', 'm_runes', '#5a3a8a'],
      ['profs', 'Métiers', 'N', 'm_profs', '#6a5a3a'],
      ['skills', 'Talents et compétences', 'K', 'm_skills', '#8a5a2a'],
      ['quests', 'Journal de quêtes', 'L', 'm_quests', '#3a4150'],
      ['map', 'Carte du monde', 'M', 'm_map', '#2a4a6a'],
      ['group', 'Groupe et joueurs', 'P', 'm_group', '#2a6a5a'],
      ['pets', 'Ménagerie (familiers)', 'Y', 'm_pets', '#4a5a2a'],
      ['lfg', 'Donjons, raids et Abîme', 'U', 'm_lfg', '#5a2a2a'],
      ['ladder', 'Classement', 'O', 'm_ladder', '#3a4150'],
      ['options', 'Options et aide', 'Échap', 'm_options', '#4a4a5a'],
    ];
    for (const [id, name, key, gl, col] of items) {
      const b = h('div', 'mb');
      b.style.backgroundImage = `url(${icon(gl, col)})`;
      b.innerHTML = `<span class="k">${key.length > 1 ? '' : key}</span>`;
      b.dataset.tip = `<div class="tn">${name}</div><div class="tl">Raccourci : ${key}</div>`;
      this.bindTip(b);
      b.addEventListener('click', () => G.win?.toggle(id));
      b.id = 'mb-' + id;
      el.appendChild(b);
    }
    // bouton plein écran : bascule directe (pas une fenêtre), équivalent à F11
    if (fsSupported()) {
      const fb = h('div', 'mb');
      fb.id = 'mb-fullscreen';
      this.bindTip(fb);
      fb.addEventListener('click', async () => {
        const was = isFullscreen();
        await toggleFullscreen();
        if (!was && !isFullscreen()) this.error('Plein écran indisponible ici.');
      });
      el.appendChild(fb);
      this.syncFullscreenBtn();
      onFullscreenChange(() => this.syncFullscreenBtn());
    }
  },
  syncFullscreenBtn() {
    const b = $('mb-fullscreen');
    if (!b) return;
    const on = isFullscreen();
    b.style.backgroundImage = `url(${icon(on ? 'fullscreen_exit' : 'fullscreen', on ? '#2a5a3a' : '#2a2a30')})`;
    b.dataset.tip = on
      ? `<div class="tn">Quitter le plein écran</div><div class="tl">Revenir à l'affichage fenêtré</div>`
      : `<div class="tn">Plein écran</div><div class="tl">Équivaut à la touche F11</div>`;
  },
  setMenuDot(id, on) {
    const b = $('mb-' + id);
    if (!b) return;
    let d = b.querySelector('.dot');
    if (on && !d) b.appendChild(h('span', 'dot'));
    if (!on && d) d.remove();
  },

  // ---------------------------------------------------------------------------
  // Guidage de quête (loupe) : flèche d'orientation, distance, balise lumineuse, repère sur la mini-carte
  buildGuide() {
    const g = h('div', 'guide panel');
    g.id = 'guide';
    g.hidden = true;
    g.innerHTML = `<div class="ga"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 3 L55 46 L32 35 L9 46 Z" fill="#ffd24a" stroke="#1a1408" stroke-width="3.5" stroke-linejoin="round"/><path d="M32 12 L46 40 L32 33 Z" fill="#fff4c8" opacity=".55"/></svg></div>
      <div class="gt"><div class="gq"></div><div class="gn"></div><div class="gd num"></div></div><button class="gx" title="Arrêter le guidage" aria-label="Arrêter le guidage">×</button>`;
    g.querySelector('.gx').onclick = (e) => { e.stopPropagation(); G.quests?.setGuide?.(null); };
    // au-dessus des barres d'action : ne recouvre ni les messages ni les bannières du haut de l'écran
    const bottom = $('bottom');
    bottom.insertBefore(g, bottom.firstChild);
    this.guideEl = g;
  },
  updateGuide() {
    const g = this.guideEl;
    const P = G.player;
    if (!g || !P) return;
    const T = G.quests?.guideTarget?.();
    if (!T || isInstancePoint(P.pos.x, P.pos.z)) { if (!g.hidden) g.hidden = true; this.beacon(null); return; }
    g.hidden = false;
    const d = Math.hypot(T.x - P.pos.x, T.z - P.pos.z);
    const arrived = d <= (T.r || 6);
    g.classList.toggle('arrived', arrived);
    const a = wrapAngle(G.cam.yaw - angleTo(P.pos.x, P.pos.z, T.x, T.z));
    g.querySelector('.ga').style.transform = arrived ? 'scale(.8)' : `rotate(${a.toFixed(3)}rad)`;
    const set = (sel, t) => { const el = g.querySelector(sel); if (el._t !== t) { el.textContent = t; el._t = t; } };
    set('.gq', T.quest);
    set('.gn', T.label);
    set('.gd', arrived ? 'Vous y êtes' : `${fmtInt(d)} m`);
    this.beacon(T, d);
  },
  // balise lumineuse sur l'objectif, visible de loin
  // (elle s'efface quand on arrive tout près, pour ne pas masquer le PNJ ou la créature visés)
  beacon(T, d = 99) {
    if (!T || d < 9) { if (this._bc) this._bc.visible = false; return; }
    if (!this._bc) {
      const grp = new THREE.Group();
      const mk = (r0, r1, col, op) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, 80, 12, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      const outer = mk(0.7, 1.6, 0xffd24a, 0.25), core = mk(0.2, 0.25, 0xfff4c8, 0.55);
      outer.position.y = 40; core.position.y = 40;
      grp.add(outer, core);
      G.scene.add(grp);
      this._bc = grp;
    }
    const b = this._bc;
    b.visible = true;
    b.position.set(T.x, getHeight(T.x, T.z), T.z);
    const k = Math.min(1, (d - 9) / 25);
    b.children[0].material.opacity = (0.18 + 0.1 * Math.sin(G.time * 3)) * k;
    b.children[1].material.opacity = 0.55 * k;
  },

  // ---------------------------------------------------------------------------
  // Infobulles
  bindTip(el) {
    el.addEventListener('mouseenter', (e) => this.showTip(el.dataset.tip, e));
    el.addEventListener('mouseleave', () => this.hideTip());
  },
  showTip(html, e) {
    if (!html) return;
    const t = this.tip;
    if (t._h !== html) { t.innerHTML = html; t._h = html; }
    t.className = 'panel';
    t.hidden = false;
    if (e) this.moveTip(e);
  },
  hideTip() { this.tip.hidden = true; },
  moveTip(e) {
    const t = this.tip;
    if (t.hidden) return;
    const w = t.offsetWidth, hh = t.offsetHeight;
    let x = e.clientX + 16, y = e.clientY + 16;
    if (x + w > innerWidth - 8) x = e.clientX - w - 12;
    if (y + hh > innerHeight - 8) y = innerHeight - hh - 8;
    t.style.left = Math.max(8, x) + 'px';
    t.style.top = Math.max(8, y) + 'px';
  },

  itemTip(it, opts = {}) {
    if (!it) return '';
    const P = G.player;
    const col = RARITY[it.rarity || 0].color;
    let html = `<div class="tn" style="color:${col}">${escapeHtml(it.name)}${it.upg ? ` +${it.upg}` : ''}</div>`;
    if (it.type === 'gear') {
      const cls = it.cls ? CLASSES[it.cls].name : 'Toutes classes';
      const clsOk = !it.cls || it.cls === P.cls;
      html += `<div class="tl">${RARITY[it.rarity].name} — ${SLOT_NAMES[it.slot]} — Qualité ${it.quality} %</div>`;
      html += `<div class="tl">Niveau d'objet ${it.ilvl}${it.unique ? ' — Unique' : ''}</div>`;
      if (it.set && it.cls) {
        const worn = Object.values(P.data.equip || {}).filter((e) => e && e.set === it.set && e.cls === it.cls).length;
        html += `<div class="tl" style="color:#ffd27a">${escapeHtml(setName(it.set, it.cls))} (${worn}/${SET_SLOTS.length})</div>`;
      }
      const s = gearStats(it);
      html += '<div class="ts">';
      if (s.dmgMin) html += `<div>${s.dmgMin} – ${s.dmgMax} dégâts</div>`;
      if (s.armor) html += `<div>${s.armor} armure</div>`;
      for (const k in s) {
        if (k === 'dmgMin' || k === 'dmgMax' || k === 'armor') continue;
        const pct = k === 'crit' || k === 'haste' || k === 'block' || k === 'speed';
        html += `<div class="tg">+${String(s[k]).replace('.', ',')}${pct ? ' %' : ''} ${STAT_NAMES[k] || k}</div>`;
      }
      html += '</div>';
      html += this.socketsHtml(it);
      html += `<div class="${clsOk ? 'tl' : 'tr'}">Classe : ${cls}</div>`;
      html += `<div class="${(it.req || 1) <= P.level ? 'tl' : 'tr'}">Niveau requis : ${it.req || 1}</div>`;
      if (!opts.equipped) html += this.compareHtml(it);
    } else if (it.type === 'quest') {
      html += `<div class="tl">Objet de quête</div>`;
    } else if (it.type === 'petstone') {
      const RN = ['Commun', 'Rare', 'Épique', 'Légendaire'];
      html += `<div class="tl">Pierre d'âme — familier ${RN[it.prar || 0]} — qualité ${it.pq ?? 50} %</div><div class="td">Clic droit : apprivoiser cette créature. Elle vous suivra, combattra à vos côtés et gagnera des niveaux avec vous.</div>`;
    } else {
      const c = CONSUMABLES[it.cid];
      if (c) html += `<div class="td">${c.desc}</div>`;
      if (c && c.req > 1) html += `<div class="${c.req <= P.level ? 'tl' : 'tr'}">Niveau requis : ${c.req}</div>`;
    }
    if (opts.price !== undefined) html += `<div class="tp">Prix : ${fmtInt(opts.price)} po</div>`;
    else if (it.value && it.type !== 'quest') html += `<div class="tl" style="margin-top:4px">Valeur : ${fmtInt((it.value || 0) * (it.count || 1))} po</div>`;
    if (opts.hint) html += `<div class="tl" style="margin-top:4px;font-style:italic">${opts.hint}</div>`;
    return html;
  },

  // ---------------------------------------------------------------------------
  // Comparaison d'équipement : caractéristiques du personnage si l'objet occupait son emplacement
  // emplacements de runes d'un objet (infobulle)
  socketsHtml(it) {
    const n = it.sockets || 0;
    if (!n) return it.rarity === 0 ? '' : '<div class="tl sock0">Aucun emplacement de rune</div>';
    let html = `<div class="socks"><div class="tl">Runes (${(it.runes || []).filter(Boolean).length}/${n}) :</div>`;
    for (let i = 0; i < n; i++) {
      const r = it.runes?.[i];
      if (r && RUNE_TYPES[r.t]) html += `<div class="sock on" style="--rc:${RUNE_TYPES[r.t].color}"><i></i>${escapeHtml(runeName(r.t, r.l))} : ${escapeHtml(runeBonusText(r.t, r.l))}</div>`;
      else html += `<div class="sock"><i></i>Emplacement de rune vide</div>`;
    }
    return html + '</div>';
  },
  gearProfile(slot, it) {
    const P = G.player;
    const tot = {};
    let wavg = null;
    for (const sl of SLOTS) {
      const x = sl === slot ? it : P.data.equip[sl];
      if (!x) continue;
      const s = itemStats(x);
      for (const k in s) if (k !== 'dmgMin' && k !== 'dmgMax') tot[k] = (tot[k] || 0) + s[k];
      if (sl === 'weapon') wavg = (s.dmgMin + s.dmgMax) / 2;
    }
    const off = slot === 'offhand' ? it : P.data.equip.offhand;
    const e = { kind: 'player', cls: P.cls, spec: P.spec, level: P.level, gearStats: tot, weaponAvg: wavg ?? weaponAvg(1) * 0.5, hasShield: !!off && (P.cls === 'guerrier' || P.cls === 'templier'), buffs: [], stats: {}, tal: P.tal };
    computeStats(e);
    return e.stats;
  },
  // indice global selon le rôle de la spécialisation (dégâts, soins ou survie)
  roleScore(S, role) {
    const hasteK = 1 + (S.haste || 0) / 100;
    const off = (S.power || 0) * (S.dmgMul || 1) * (1 + (S.crit / 100) * ((S.critMult || 1.6) - 1)) * hasteK;
    if (role === 'heal') return (S.healPower || 0) * (S.healMul || 1) * (1 + S.crit / 200) * hasteK + S.maxMp * 0.02 + S.maxHp * 0.01;
    if (role === 'tank') {
      const red = armorReduction(S.armor || 0, (G.player?.level || 1) + 2);
      const avoid = Math.max(0.3, 1 - (S.dodge || 0) / 100 - (S.block || 0) / 200);
      return (S.maxHp / Math.max(0.2, (1 - red) * avoid * (S.dmgTaken || 1))) * 0.7 + off * 3;
    }
    return off + S.maxHp * 0.01;
  },
  // variation (fraction) de l'indice global si l'on équipe cet objet ; null si inutilisable
  gearDelta(it) {
    const P = G.player;
    if (!P || !it || it.type !== 'gear' || (it.cls && it.cls !== P.cls)) return null;
    const cur = P.data.equip[it.slot] || null;
    if (cur === it) return null;
    const rs = (x) => (x?.runes || []).map((r) => (r ? r.t + r.l : '-')).join(',');
    const key = it.uid + '|' + (cur?.uid || '-') + '|' + (cur?.upg || 0) + '|' + (it.upg || 0) + '|' + P.level + '|' + P.spec + '|' + rs(it) + '|' + rs(cur);
    const c = (this._gd ||= new Map());
    if (c.has(key)) return c.get(key);
    const role = roleOf(P);
    const a = this.gearProfile(it.slot, cur), b = this.gearProfile(it.slot, it);
    const sa = this.roleScore(a, role), sb = this.roleScore(b, role);
    const r = { empty: !cur, delta: sa > 0 ? sb / sa - 1 : 0, a, b, role };
    if (c.size > 400) c.clear();
    c.set(key, r);
    return r;
  },
  compareHtml(it) {
    const P = G.player;
    if (it.cls && it.cls !== P.cls) return `<div class="cmp2"><div class="tr">Réservé à la classe ${escapeHtml(CLASSES[it.cls].name)} : vous ne pouvez pas l'équiper.</div></div>`;
    const g = this.gearDelta(it);
    if (!g) return '';
    const pct = (v) => (Math.round(v * 1000) / 10).toFixed(1).replace('.', ',');
    const heal = g.role === 'heal' || !!CLASSES[P.cls].healStat;
    const rows = [
      ['maxHp', 'Vie', 'rel'], ['maxMp', 'Mana', 'rel'], ['power', 'Puissance', 'rel'], ...(heal ? [['healPower', 'Puissance de soin', 'rel']] : []),
      ['armor', 'Armure', 'rel'], ['crit', 'Critique', 'abs'], ['haste', 'Hâte', 'abs'], ['dodge', 'Esquive', 'abs'], ['block', 'Blocage', 'abs'], ['moveSpeed', 'Vitesse', 'rel'],
    ];
    const parts = [];
    for (const [k, name, mode] of rows) {
      const va = g.a[k] || 0, vb = g.b[k] || 0;
      const d = mode === 'rel' ? (va > 0 ? vb / va - 1 : vb > 0 ? 1 : 0) : (vb - va) / 100;
      if (Math.abs(d) < 0.0005) continue;
      parts.push(`<span class="${d > 0 ? 'tg' : 'tr'}">${d > 0 ? '+' : '−'}${pct(Math.abs(d))} %${mode === 'abs' ? ' de' : ''} ${name}</span>`);
    }
    const lvl = (it.req || 1) > P.level ? `<div class="tl">Équipable au niveau ${it.req}.</div>` : '';
    const RL = ROLE_LABEL[g.role];
    let head;
    if (g.empty) head = `<div class="cmp-best">✔ Emplacement vide : c'est le meilleur équipement disponible</div>`;
    else if (Math.abs(g.delta) < 0.0005) head = `<div class="cmp-eq">= Équivalent à votre objet équipé (${RL})</div>`;
    else head = `<div class="cmp-tot ${g.delta > 0 ? 'up' : 'down'}">${g.delta > 0 ? '▲ +' : '▼ −'}${pct(Math.abs(g.delta))} % de puissance pour votre rôle (${RL})</div>`;
    return `<div class="cmp2"><div class="cmph">${g.empty ? 'Si vous l\'équipez' : 'Par rapport à l\'objet équipé'} :</div>${head}${parts.length ? `<div class="cmpl">${parts.join('')}</div>` : ''}${lvl}</div>`;
  },

  // ---------------------------------------------------------------------------
  // Textes flottants
  floatText(e, text, cls = 'dmg', school) {
    if (!e || !e.pos) return;
    const f = this.floaters.find((x) => !x.on) || this.floaters[0];
    f.on = true; f.t = 0;
    f.life = cls === 'crit' || cls === 'xp' ? 1.5 : 1.15;
    f.x = e.pos.x; f.z = e.pos.z; f.y = e.pos.y + (e.model ? e.model.height : 1.8) + 0.3;
    f.dx = (Math.random() - 0.5) * 60; f.cls = cls;
    if (e === G.player && (cls === 'hurt')) f.dx = -40 - Math.random() * 30;
    f.el.className = 'ft ' + cls;
    f.el.textContent = typeof text === 'number' ? fmtInt(text) : text;
    f.el.style.color = (cls === 'dmg' || cls === 'dot') && school && school !== 'phys' ? SCHOOL_COLORS[school] : '';
    f.el.style.display = '';
  },

  updateFloaters(dt) {
    const cam = G.camera;
    for (const f of this.floaters) {
      if (!f.on) continue;
      f.t += dt;
      if (f.t >= f.life) { f.on = false; f.el.style.display = 'none'; continue; }
      V.set(f.x, f.y, f.z).project(cam);
      if (V.z > 1) { f.el.style.display = 'none'; continue; }
      f.el.style.display = '';
      const k = f.t / f.life;
      const sx = (V.x * 0.5 + 0.5) * innerWidth + f.dx * k;
      const sy = (-V.y * 0.5 + 0.5) * innerHeight - 70 * k - (f.cls === 'crit' ? 10 : 0);
      const sc = f.cls === 'crit' ? (k < 0.12 ? 1.5 - k * 3 : 1) : 1;
      f.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%,-50%) scale(${sc})`;
      f.el.style.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
    }
  },

  // ---------------------------------------------------------------------------
  // Plaques de nom
  updatePlates() {
    const P = G.player, cam = G.camera;
    // la caméra vient de bouger ce frame : ses matrices doivent être à jour avant de projeter,
    // sinon les noms ont une image de retard et tremblent quand on tourne la caméra
    cam.updateMatrixWorld();
    const seen = new Set();
    const list = G.world.entities;
    const W = innerWidth, H = innerHeight;
    for (const e of list) {
      const self = e === P;
      if (self && !G.settings.selfPlate) continue;
      if (!e.model || !e.model.root.visible && !e.polyModel && !e.formModel) continue;
      const d = dist(P, e);
      const isT = e === P.target;
      if (d > (isT ? 90 : e.kind === 'npc' ? 45 : 55)) continue;
      if (e.kind === 'mob' && e.dead && !isT) continue;
      const hgt = (e.polyModel ? 1.2 : (e.formModel || e.model).height) + (e.mounted ? (e.mountSaddle || 1) : 0) + 0.35;
      V.set(e.pos.x, e.pos.y + hgt, e.pos.z).project(cam);
      if (V.z > 1 || V.x < -1.2 || V.x > 1.2 || V.y < -1.2 || V.y > 1.2) continue;
      seen.add(e);
      let p = this.plates.get(e);
      if (!p) {
        const kc = isPlayerLike(e) ? ' pl' + (self ? ' self' : '') : e.kind === 'npc' ? ' npc' : e.kind === 'pet' ? ' pet' : ' mob';
        const el = h('div', 'np' + kc);
        el.innerHTML = `<div class="qm" hidden></div><div class="bubble" hidden></div><div class="nm"><span class="cr" hidden></span><span class="tx"></span></div><div class="sub"></div><div class="bar hp"><div class="f"></div>${self ? '<span class="hpt num"></span>' : ''}</div>`;
        $('nameplates').appendChild(el);
        p = { el, nm: el.querySelector('.nm'), tx: el.querySelector('.tx'), cr: el.querySelector('.cr'), sub: el.querySelector('.sub'), bar: el.querySelector('.bar'), hpt: el.querySelector('.hpt'), qm: el.querySelector('.qm'), bubble: el.querySelector('.bubble') };
        this.plates.set(e, p);
      }
      const sx = (V.x * 0.5 + 0.5) * W, sy = (-V.y * 0.5 + 0.5) * H;
      p.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
      p.el.style.opacity = d > 40 && !isT ? 0.75 : 1;
      p.el.classList.toggle('tgt', isT);
      // nom et couleur : joueurs (couleur de classe + blason de faction), PNJ (or, fonction entre chevrons), monstres (difficulté)
      let name = e.name, col = '#f0e8d8', sub = '', crest = null;
      if (e.kind === 'mob') {
        col = e.passive ? '#e8e0c8' : conColor(P.level, e.level);
        name = `${e.name}`;
        sub = `Niv. ${e.boss ? '??' : e.level}${e.elite ? ' • Élite' : ''}${e.boss ? ' • Boss' : ''}`;
      } else if (e.kind === 'pet') {
        col = '#d8e8c0';
        sub = e.owner ? `Familier de ${e.owner.name} • niv. ${e.level}` : `Familier • niv. ${e.level}`;
      } else if (e.kind === 'npc') {
        col = e.guard ? '#9fc8ff' : '#f3d36a';
        sub = e.roleName ? `‹${e.roleName}›` : '';
        if (e.faction !== P.faction && !e.neutral) col = '#ff5a4a';
      } else if (isPlayerLike(e)) {
        const ally = e.faction === P.faction;
        col = ally ? (CLASSES[e.cls]?.color || '#8fe070') : '#ff5a4a';
        crest = FACTIONS[e.faction]?.color || '#fff';
        const sp = e.spec && SPECS[e.spec];
        sub = `${e.inMyParty ? 'Groupe • ' : ''}Niv. ${e.level} ${CLASSES[e.cls]?.name || ''}${sp ? ` (${sp.name})` : ''}${e.fameRank ? ' • ' + e.fameRank : ''}`;
        if (self) { col = '#8fe070'; sub = `Niv. ${e.level} ${CLASSES[e.cls]?.name || ''}${sp ? ` (${sp.name})` : ''}`; }
        if (e.kind === 'remote') name = '◆ ' + name;
      }
      if (p._n !== name) { p.tx.textContent = name; p._n = name; }
      if (p._c !== col) { p.nm.style.color = col; p._c = col; }
      if (p._cr !== crest) { p._cr = crest; p.cr.hidden = !crest; if (crest) p.cr.style.background = crest; }
      if (p._s !== sub) { p.sub.textContent = sub; p._s = sub; p.sub.hidden = !sub; }
      // barre de vie : si cible, blessé, ou ennemi en combat
      const showBar = self ? !e.dead : !e.dead && e.kind !== 'npc' && (isT || e.hp < e.stats.maxHp - 0.5 || e.inCombat?.()) || (e.kind === 'npc' && e.guard && e.hp < e.stats.maxHp);
      p.bar.hidden = !showBar;
      if (showBar) {
        const k = clamp(e.hp / (e.stats.maxHp || 1), 0, 1);
        const f = p.bar.querySelector('.f');
        if (f._k !== k) { f.style.transform = `scaleX(${k})`; f._k = k; }
        p.bar.classList.toggle('friendly', self || isFriendly(P, e));
        if (p.hpt) { const t = `${fmtInt(Math.ceil(e.hp))} / ${fmtInt(e.stats.maxHp)}`; if (p._h !== t) { p.hpt.textContent = t; p._h = t; } }
      }
      // vos effets néfastes sur l'ennemi, au-dessus de sa barre (avec le temps restant)
      if (!self) {
        const mine = e.kind === 'mob' || e.kind === 'bot' || e.kind === 'remote' ? e.buffs.filter((b) => b.src === P && b.def.debuff).slice(0, 5) : [];
        const ak = mine.map((b) => b.def.id + Math.ceil(b.dur - b.t)).join(',');
        if (p._a !== ak) {
          p._a = ak;
          if (!p.auras) { p.auras = h('div', 'np-auras'); p.el.insertBefore(p.auras, p.nm); }
          p.auras.innerHTML = mine.map((b) => { const l = b.dur - b.t; return `<span style="background-image:url(${icon(b.def.icon[0], b.def.icon[1])})"><i class="num">${l < 1e6 ? Math.ceil(l) : ''}</i></span>`; }).join('');
        }
      }
      // marqueur de quête
      const qm = e.questMark || null;
      if (p._q !== qm) {
        p._q = qm;
        p.qm.hidden = !qm;
        if (qm) { p.qm.textContent = qm === 'done' ? '?' : qm === 'grey' ? '!' : '!'; p.qm.className = 'qm' + (qm === 'done' ? ' done' : qm === 'grey' ? ' grey' : ''); }
      }
      // bulle de discussion
      const bt = e.bubble && e.bubbleUntil > G.time ? e.bubble : '';
      if (p._b !== bt) { p._b = bt; p.bubble.hidden = !bt; p.bubble.textContent = bt; }
    }
    for (const [e, p] of this.plates) {
      if (!seen.has(e)) { p.el.remove(); this.plates.delete(e); }
    }
  },

  // ---------------------------------------------------------------------------
  update(dt) {
    const P = G.player;
    if (!P) return;
    // cadre joueur
    $('pf-nm').textContent = P.name;
    $('pf-lvl').textContent = P.level;
    const spc = specOf(P);
    const cn = CLASSES[P.cls].name;
    // « Nécromancien · Ossuaire » est trop long pour le cadre : nom de classe abrégé si besoin
    const subT = spc ? `${cn.length + spc.name.length > 18 ? cn.slice(0, 5) + '.' : cn} · ${spc.name}` : cn;
    const sub = $('pf-sub');
    if (sub._t !== subT) { sub.textContent = subT; sub._t = subT; sub.title = spc ? `${cn} · ${spc.name}` : cn; }
    const por = $('pf-por');
    const pm = P.formModel || P.model, purl = por._m === pm ? por._u : portraitUrl(pm);
    if (por._m !== pm) { por._m = pm; por._u = purl; por._set = null; if (purl) { por.style.backgroundImage = `url(${purl})`; por.classList.add('p3d'); por.style.setProperty('--pc', CLASSES[P.cls].color); } else por.classList.remove('p3d'); }
    const pk = spc?.id || P.cls;
    if (!purl && por._set !== pk) { por.style.backgroundImage = `url(${icon(spc ? spc.icon[0] : classSkills(P.cls).find((s) => s.basic).icon[0], CLASSES[P.cls].color)})`; por._set = pk; }
    this.setBar('pf-hp', Math.ceil(P.hp), P.stats.maxHp);
    this.setBar('pf-mp', Math.floor(P.mp), P.stats.maxMp);
    this.renderPlayerAuras(P);
    this.renderMinions(P);
    // familier
    const pet = G.pets?.active;
    const pfr = $('petframe');
    if (pet) {
      if (pfr.hidden) { pfr.hidden = false; pfr.className = 'panel'; pfr.innerHTML = `<div class="pet-top"><span class="nm" id="pt-nm"></span><span class="lv muted num" id="pt-lv"></span></div><div class="bar hp friendly" id="pt-hp"><div class="f"></div><div class="t num"></div></div>`; pfr.onclick = () => G.player?.setTarget(G.pets.active); }
      const nm = $('pt-nm'); if (nm._t !== pet.name) { nm.textContent = pet.name; nm._t = pet.name; nm.style.color = ['#cfd3da', '#3fa0ff', '#b86bff', '#ff9f2a'][pet.rarity || 0]; }
      $('pt-lv').textContent = pet.dead ? 'mort' : 'niv. ' + pet.level;
      this.setBar('pt-hp', Math.ceil(pet.hp), pet.stats.maxHp || 1);
    } else if (!pfr.hidden) pfr.hidden = true;
    // cible
    const T = P.target;
    const tf = $('targetframe');
    if (T && (!T.dead || T.kind === 'mob') && (T.model || T.kind === 'remote')) {
      tf.hidden = false;
      $('tf-nm').textContent = T.name;
      $('tf-nm').style.color = T.kind === 'mob' ? (T.passive ? '#e8e0c8' : conColor(P.level, T.level)) : isHostile(P, T) ? '#ff6a5a' : '#8fe070';
      $('tf-lvl').textContent = T.boss ? '??' : T.level;
      $('tf-el').textContent = T.worldBoss ? 'Boss du monde' : T.boss ? 'Boss' : T.elite ? 'Élite' : T.kind === 'npc' ? (T.roleName || '') : isPlayerLike(T) ? (CLASSES[T.cls]?.name || '') : (T.def?.family || '');
      const tp = $('tf-por');
      const tm = T.formModel || T.model;
      const pk = T.kind + (T.def?.id || T.cls || T.npcRole || '');
      if (tp._m !== tm || tp._k !== pk) {
        tp._m = tm; tp._k = pk;
        const turl = portraitUrl(tm);
        tp.classList.toggle('p3d', !!turl);
        tp.style.setProperty('--pc', T.kind === 'mob' ? (T.passive ? '#8a7a3a' : '#8a2a2a') : T.kind === 'npc' ? '#3a6a4a' : CLASSES[T.cls]?.color || '#445');
        const gl = T.kind === 'mob' ? (T.def.family === 'humanoïde' ? 'sword' : T.def.family === 'mort-vivant' ? 'drain' : T.def.family === 'élémentaire' ? 'nova' : T.def.family === 'dragon' ? 'fire' : T.def.family === 'démon' ? 'fire' : T.def.family === 'esprit' ? 'blink' : 'bleed') : T.kind === 'npc' ? 'shout' : classSkills(T.cls || 'guerrier').find((s) => s.basic).icon[0];
        tp.style.backgroundImage = turl ? `url(${turl})` : `url(${icon(gl, T.kind === 'mob' ? '#6a2a2a' : T.kind === 'npc' ? '#6a5a2a' : CLASSES[T.cls]?.color || '#444')})`;
      }
      const hpEl = $('tf-hp');
      hpEl.classList.toggle('friendly', isFriendly(P, T));
      this.setBar(hpEl, Math.ceil(T.hp), T.stats.maxHp || 1, T.kind !== 'mob' || true);
      if (T.kind === 'mob' && T.stats.maxHp > 0) {
        const t = hpEl.querySelector('.t');
        const pct = Math.ceil((T.hp / T.stats.maxHp) * 100);
        const s = T.worldBoss || T.boss ? `${pct} %` : `${fmtInt(Math.ceil(T.hp))} / ${fmtInt(T.stats.maxHp)} (${pct} %)`;
        if (t._s !== s) { t.textContent = s; t._s = s; }
      }
      const mpEl = $('tf-mp');
      mpEl.hidden = T.kind === 'mob' || T.kind === 'npc';
      if (!mpEl.hidden) this.setBar(mpEl, Math.floor(T.mp || 0), T.stats.maxMp || 1);
      // incantation de la cible
      const tc = $('tf-cast');
      const cast = T.cast ? { name: T.cast.s.name, k: T.cast.time / T.cast.dur } : T.windup && T.castBar ? { name: T.castBar.name, k: 1 - T.windup.t / T.castBar.dur } : null;
      tc.hidden = !cast;
      tc.classList.toggle('kick', !!(cast && T.windup?.interruptible));
      if (cast) { tc.querySelector('.f').style.transform = `scaleX(${clamp(cast.k, 0, 1)})`; tc.querySelector('.t').textContent = cast.name + (T.windup?.interruptible ? ' — à interrompre !' : ''); }
      const tot = T.target && T.target !== T ? `Cible : ${T.target === P ? 'Vous' : T.target.name}` : '';
      $('tf-tot').textContent = tot;
      this.renderBuffs($('tf-buffs'), T);
    } else tf.hidden = true;

    // barre d'incantation
    const cb = $('castbar');
    if (P.cast) {
      cb.hidden = false;
      cb.classList.toggle('channel', P.cast.channel);
      const k = P.cast.time / P.cast.dur;
      cb.querySelector('.fill').style.width = (P.cast.channel ? (1 - k) : k) * 100 + '%';
      cb.querySelector('.lbl').textContent = P.cast.s.name;
      cb.querySelector('.tm').textContent = Math.max(0, P.cast.dur - P.cast.time).toFixed(1).replace('.', ',') + ' s';
    } else cb.hidden = true;

    // XP
    const need = xpToNext(P.level);
    const xpk = P.level >= LEVEL_CAP ? 1 : P.data.xp / need;
    $('xpbar').querySelector('.fill').style.width = xpk * 100 + '%';
    const xl = P.level >= LEVEL_CAP ? `Niveau ${P.level} — niveau maximum atteint` : `Niveau ${P.level} — ${fmtInt(P.data.xp)} / ${fmtInt(need)} XP (${Math.floor(xpk * 100)} %)`;
    const xle = $('xpbar').querySelector('.lbl');
    if (xle._t !== xl) { xle.textContent = xl; xle._t = xl; }

    this.updateActionBar();
    // mini-carte (10 fois par seconde)
    this.mmT = (this.mmT || 0) - dt;
    if (this.mmT <= 0) {
      this.mmT = 0.1;
      this.drawMinimap();
      $('mm-pos').textContent = `${Math.round(P.pos.x)}, ${Math.round(P.pos.z)}`;
      const t = G.sky ? G.sky.t : 0.5;
      const hh = Math.floor(t * 24), mm = Math.floor((t * 24 - hh) * 60);
      $('mm-clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      const on = G.net?.remotes?.size || 0;
      $('mm-online').textContent = on ? `${on} vrai${on > 1 ? 's' : ''} joueur${on > 1 ? 's' : ''} en ligne` : '';
      const free = P.talentsFree?.() > 0;
      if (this._tdot !== free) { this._tdot = free; this.setMenuDot('skills', free); }
    }
    this.updateGuide(dt);
    this.updatePetBar();
    this.updateHint(dt);
    this.updateFloaters(dt);
    this.updatePlates();
    if (this.chatDirty) this.renderChat();
    if (this.dirty) { this.dirty = false; G.win?.refresh(); G.quests?.renderTracker?.(); }
  },

  refresh() { this.dirty = true; },

  // ---------------------------------------------------------------------------
  // Messages
  error(msg) {
    if (!msg) return;
    const now = performance.now();
    if (this._lastErr === msg && now - this._lastErrT < 900) return;
    this._lastErr = msg; this._lastErrT = now;
    const el = $('errors');
    const d = h('div', 'err', escapeHtml(msg));
    el.appendChild(d);
    setTimeout(() => d.remove(), 1600);
    while (el.children.length > 3) el.firstChild.remove();
    G.audio?.play('error');
  },
  notify(msg) {
    const el = $('errors');
    const d = h('div', 'info', escapeHtml(msg));
    el.appendChild(d);
    setTimeout(() => d.remove(), 3000);
    while (el.children.length > 4) el.firstChild.remove();
    this.log(msg, 'sys');
  },
  announce(title, cls = '', sub = '') {
    const el = $('announce');
    const d = h('div', '');
    d.innerHTML = `<div class="ann ${cls}">${escapeHtml(title)}</div>${sub ? `<div class="ann-sub">${escapeHtml(sub)}</div>` : ''}`;
    el.appendChild(d);
    setTimeout(() => d.remove(), cls === 'level' ? 4500 : 3800);
    while (el.children.length > 3) el.firstChild.remove();
    this.log(title + (sub ? ' — ' + sub : ''), cls === 'boss' || cls === 'pvp' ? 'evt' : 'sys');
  },
  zoneEnter(z) {
    const el = $('zonebanner');
    const fac = z.owner >= 0 ? FACTIONS[z.owner] : null;
    const status = z.instance ? `<span style="color:#c8b8ff">${escapeHtml(z.kindName || 'Instance')}</span>` : fac ? (fac.id === G.player.faction ? `<span class="good">Territoire allié</span>` : `<span class="bad">Territoire ennemi</span>`) : '<span style="color:#ffb070">Territoire disputé — JcJ</span>';
    el.innerHTML = `<div class="zb"><div class="a">${z.name}</div><div class="b">Niveaux ${z.lvl[0]}${z.lvl[1] !== z.lvl[0] ? '–' + z.lvl[1] : '+'}</div><div class="c">${status}</div></div>`;
    $('mm-zone').textContent = z.name;
    $('mm-lvl').textContent = `Niveaux ${z.lvl[0]}${z.lvl[1] !== z.lvl[0] ? '–' + z.lvl[1] : '+'}`;
    this.log(`Vous entrez dans : ${z.name}`, 'sys');
  },
  lootMsg(it) {
    const el = $('lootfeed');
    const d = h('div', 'lf');
    const col = RARITY[it.rarity || 0].color;
    d.innerHTML = `<img alt="" src="${itemIcon(it)}"><span style="color:${col}">${escapeHtml(it.name)}${it.count > 1 ? ' ×' + it.count : ''}</span>`;
    el.appendChild(d);
    setTimeout(() => d.remove(), 5000);
    while (el.children.length > 6) el.firstChild.remove();
    this.log(`Butin : ${it.name}${it.count > 1 ? ' ×' + it.count : ''}`, 'loot');
    G.audio?.play(it.rarity >= 3 ? 'epic' : 'loot');
    if (it.type === 'gear') this.setMenuDot('bag', true);
  },
  runeMsg(t, l, n = 1) {
    const T = RUNE_TYPES[t];
    if (!T) return;
    const el = $('lootfeed');
    const d = h('div', 'lf rune');
    d.innerHTML = `<img alt="" src="${icon('rune_' + T.id, T.color, { gem: T.color, sym: T.sym })}"><span style="color:${T.color}">${escapeHtml(runeName(t, l))}${n > 1 ? ' ×' + n : ''}</span>`;
    el.appendChild(d);
    setTimeout(() => d.remove(), 5000);
    while (el.children.length > 6) el.firstChild.remove();
    this.log(`Rune : ${runeName(t, l)}${n > 1 ? ' ×' + n : ''} (${runeBonusText(t, l)}) — touche R`, 'loot');
    G.audio?.play(l >= 3 ? 'epic' : 'loot');
  },
  goldMsg(n) {
    this.floatText(G.player, `+${n} po`, 'gold');
    this.log(`Vous recevez ${n} po.`, 'loot');
    G.audio?.play('coin');
  },
  onPlayerHit() {},

  showDeath(killer) {
    const el = $('death');
    el.hidden = false;
    const by = killer ? (killer.kind === 'mob' ? `Tué par : ${killer.name}` : `Vaincu par ${killer.name} (${FACTIONS[killer.faction]?.short || ''})`) : '';
    const inst = G.inst?.active;
    const label = inst ? 'Revenir au point de contrôle' : 'Réapparaître au camp le plus proche';
    const tip = inst ? '<div class="muted" style="font-size:12.5px;max-width:340px">Si un soigneur de votre groupe survit au combat, il vous relèvera sur place.</div>' : '';
    el.innerHTML = `<div class="box panel"><h2>Vous êtes mort</h2><div class="muted">${escapeHtml(by)}</div><div class="muted" id="death-t">Réapparition possible dans 3 s…</div><button class="btn" id="death-btn" disabled>${label}</button>${tip}</div>`;
    let t = 3;
    const iv = setInterval(() => {
      t--;
      const dt = $('death-t');
      if (!dt) { clearInterval(iv); return; }
      if (t <= 0) { clearInterval(iv); dt.textContent = 'Votre esprit est prêt à revenir.'; $('death-btn').disabled = false; }
      else dt.textContent = `Réapparition possible dans ${t} s…`;
    }, 1000);
    $('death-btn').onclick = () => G.player.respawn();
  },
  hideDeath() { $('death').hidden = true; },

  // boîte de confirmation intégrée (confirm() est bloqué dans l'artifact)
  ask(text, yes, no, yesLabel = 'Accepter', noLabel = 'Refuser', timeout = 0) {
    const el = $('prompt');
    el.className = 'panel';
    el.hidden = false;
    el.innerHTML = `<div class="t">${text}</div><div class="row"><button class="btn" id="pr-y">${yesLabel}</button><button class="btn ghost" id="pr-n">${noLabel}</button></div>`;
    const close = () => { el.hidden = true; clearTimeout(this._askT); };
    $('pr-y').onclick = () => { close(); yes?.(); };
    $('pr-n').onclick = () => { close(); no?.(); };
    clearTimeout(this._askT);
    if (timeout) this._askT = setTimeout(() => { if (!el.hidden) { close(); no?.(); } }, timeout * 1000);
  },
};
