import { WORLD_HALF, WORLD_SCALE } from '../data/world-space.js';
import { isInstancePoint } from '../data/world-space.js';
// Fenêtres de l'interface : personnage, sac, compétences, quêtes, carte, groupe, classement, options, PNJ, commerces.
import { G, xpToNext, LEVEL_CAP } from '../game/state.js';
import { UI } from './hud.js';
import { icon, itemIcon } from './icons.js';
import { SKILL_BY_ID, classSkills, COMMON_SKILLS } from '../data/skills.js';
import { CLASSES, STAT_NAMES } from '../data/classbase.js';
import { SLOTS, SLOT_NAMES, RARITY, CONSUMABLES, makeConsumable, makeGear, gearStats, potionFor, BAG_SIZE } from '../data/items.js';
import { FACTIONS, HUBS, HUB_BY_ID, ZONES, LANDMARKS } from '../data/zones.js';
import { QUEST_BY_ID, QUESTS, questXp, questGold, resolveNpc } from '../data/quests.js';
import { NPC_BY_ID } from '../data/npcs.js';
import { Inv } from '../game/inventory.js';
import { Quests } from '../game/quests.js';
import { NpcManager } from '../game/npc.js';
import { armorReduction } from '../game/stats.js';
import { renderWorldMap } from '../world/mapgen.js';
import { escapeHtml, fmtInt, clamp } from '../core/util.js';
import { dist } from '../game/combat.js';
import { pillar } from '../game/fx.js';
import { renderTalents } from './talents.js';
import { SPECS, specOf, ROLE_LABEL } from '../data/specs.js';
import { LOUPE } from '../game/quests.js';
import { isTextField } from '../engine/input.js';
import { renderRunes } from './runes.js';
import { renderProfs } from './profs.js';
import { RUNE_TYPES } from '../data/runes.js';
import { ORDERS } from '../data/lore.js';

const $ = (id) => document.getElementById(id);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const gold = (n) => `<span class="goldline num"><span class="coin"></span>${fmtInt(n)}</span>`;

const TITLES = {
  char: 'Personnage', bag: 'Sac', skills: 'Talents et compétences', quests: 'Journal de quêtes', map: "Carte d'Orvalis", group: 'Groupe',
  ladder: 'Classement', options: 'Options', npc: '', vendor: 'Marchand', forge: 'Forge', stable: 'Écurie', market: 'Hôtel des ventes',
  stash: 'Coffre', travel: 'Pierre de voyage', trainer: "Maître d'armes", qdlg: 'Quête', help: 'Aide', pets: 'Ménagerie', lfg: 'Donjons et raids',
  runes: 'Runes', profs: 'Métiers',
};
const DEFAULT_POS = {
  char: [60, 90], bag: ['r', 90], skills: ['c', 50], quests: ['c', 80], map: ['c', 50], group: [60, 120], ladder: ['c', 90], options: ['c', 70],
  npc: ['c', 120], qdlg: ['c', 110], vendor: [60, 90], forge: [60, 90], stable: ['c', 140], market: ['c', 70], stash: [60, 90], travel: ['c', 120], trainer: ['c', 140], help: ['c', 70],
  pets: ['c', 80], lfg: ['c', 60], runes: ['c', 70], profs: ['c', 50],
};

export const Win = {
  wins: new Map(),
  z: 10,
  npc: null, // PNJ en cours d'interaction
  sel: {},

  init() {
    G.input.handlers.push((e) => this.onKey(e));
  },

  onKey(e) {
    if (isTextField(e)) return false;
    if (G.mode !== 'game') return false;
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') {
      if (!$('prompt').hidden) { $('prompt').hidden = true; return true; }
      const open = [...this.wins.keys()];
      if (open.length) { this.closeTop(); return true; }
      if (G.player?.target) { G.player.setTarget(null); return true; }
      this.toggle('options');
      return true;
    }
    if (e.key === 'Enter') { UI.focusChat(); return true; }
    if (e.key === '/') { UI.focusChat('/'); return true; }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const map = { c: 'char', b: 'bag', i: 'bag', k: 'skills', l: 'quests', j: 'quests', m: 'map', p: 'group', o: 'ladder', h: 'help', y: 'pets', u: 'lfg', r: 'runes', n: 'profs' };
    if (map[k]) { this.toggle(map[k]); return true; }
    if (k === 't' && G.player) { G.player.useSkillById('x_monture'); return true; }
    return false;
  },

  isOpen(id) { return this.wins.has(id); },
  toggle(id, opts) { if (this.isOpen(id)) this.close(id); else this.open(id, opts); },

  open(id, opts = {}) {
    let w = this.wins.get(id);
    if (!w) {
      const el = h('div', 'win panel');
      el.innerHTML = `<div class="wt"><h2></h2><button class="x" aria-label="Fermer">×</button></div><div class="wb"></div>`;
      el.querySelector('.x').onclick = () => this.close(id);
      $('windows').appendChild(el);
      w = { id, el, opts };
      this.wins.set(id, w);
      this.makeDraggable(el);
      el.addEventListener('mousedown', () => this.front(el));
      const p = this.savedPos?.[id] || DEFAULT_POS[id] || ['c', 100];
      requestAnimationFrame(() => this.place(el, p));
    }
    w.opts = opts;
    this.front(w.el);
    this.render(w);
    G.audio?.play('open');
    if (id === 'bag') UI.setMenuDot('bag', false);
    return w;
  },

  // met une fenêtre au premier plan ; l'empilement reste toujours sous les infobulles et les boîtes de dialogue
  front(el) {
    if (this.z > 4000) {
      const list = [...this.wins.values()].sort((a, b) => (+a.el.style.zIndex || 0) - (+b.el.style.zIndex || 0));
      this.z = 10;
      for (const w of list) w.el.style.zIndex = ++this.z;
    }
    el.style.zIndex = ++this.z;
  },

  place(el, p) {
    const W = innerWidth, H = innerHeight;
    const w = el.offsetWidth, hh = el.offsetHeight;
    let x = p[0] === 'c' ? (W - w) / 2 : p[0] === 'r' ? W - w - 230 : p[0];
    let y = p[1];
    x = clamp(x, 8, Math.max(8, W - w - 8));
    y = clamp(y, 8, Math.max(8, H - hh - 60));
    el.style.left = x + 'px'; el.style.top = y + 'px';
  },

  close(id) {
    const w = this.wins.get(id);
    if (!w) return;
    (this.savedPos ||= {})[id] = [parseInt(w.el.style.left), parseInt(w.el.style.top)];
    w.el.remove();
    this.wins.delete(id);
    UI.hideTip();
    if (['npc', 'vendor', 'forge', 'stable', 'market', 'stash', 'travel', 'trainer', 'qdlg'].includes(id) && ![...this.wins.keys()].some((k) => ['npc', 'vendor', 'forge', 'stable', 'market', 'stash', 'travel', 'trainer', 'qdlg'].includes(k))) this.npc = null;
    G.audio?.play('close');
  },
  closeTop() {
    let top = null, zz = -1;
    for (const w of this.wins.values()) { const z = +w.el.style.zIndex || 0; if (z > zz) { zz = z; top = w; } }
    if (top) this.close(top.id);
  },

  makeDraggable(el) {
    const bar = el.querySelector('.wt');
    bar.addEventListener('mousedown', (e) => {
      if (e.target.closest('.x')) return;
      const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop;
      const mv = (ev) => { el.style.left = clamp(ox + ev.clientX - sx, 0, innerWidth - 60) + 'px'; el.style.top = clamp(oy + ev.clientY - sy, 0, innerHeight - 40) + 'px'; };
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', mv);
      window.addEventListener('mouseup', up);
    });
  },

  refresh() {
    for (const w of this.wins.values()) if (w.id !== 'map' && w.id !== 'options' && w.id !== 'help') this.render(w);
  },

  render(w) {
    const R = this['r_' + w.id];
    if (!R) return;
    const body = w.el.querySelector('.wb');
    const title = w.el.querySelector('h2');
    title.textContent = w.opts.title || TITLES[w.id] || '';
    const st = body.scrollTop;
    R.call(this, body, w.opts, w);
    body.scrollTop = st;
  },

  // ---------------------------------------------------------------------------
  // Emplacements d'objets
  itemSlot(it, opts = {}) {
    const d = h('div', 'islot' + (it ? ' r' + (it.rarity || 0) : ''));
    if (it) {
      d.style.backgroundImage = `url(${itemIcon(it)})`;
      if (it.count > 1) d.appendChild(h('span', 'n num', it.count));
      if (it.upg) d.appendChild(h('span', 'u', '+' + it.upg));
      if (it.type === 'gear' && it.sockets) {
        const sk = h('span', 'sk');
        for (let i = 0; i < it.sockets; i++) { const r = it.runes?.[i]; const bb = h('b', r ? 'on' : ''); if (r && RUNE_TYPES[r.t]) bb.style.setProperty('--rc', RUNE_TYPES[r.t].color); sk.appendChild(bb); }
        d.appendChild(sk);
      }
      if (it.type === 'gear' && Inv.canEquip(it) && opts.checkEquip) d.classList.add('cant');
      if (it.type === 'gear' && opts.checkEquip && !(it.cls && it.cls !== G.player.cls)) {
        const g = UI.gearDelta(it);
        if (g && (g.empty || g.delta > 0.004)) { d.classList.add('up'); d.appendChild(h('span', 'upa', '▲')); }
      }
      d.addEventListener('mousemove', (e) => UI.showTip(UI.itemTip(it, opts.tip || {}), e));
      d.addEventListener('mouseleave', () => UI.hideTip());
    } else if (opts.ph) {
      d.appendChild(h('span', 'ph', opts.ph));
    }
    return d;
  },

  r_pets(b) { G.pets?.renderWindow(b); },
  r_runes(b) { renderRunes(b, this); },
  r_profs(b) { renderProfs(b, this); },
  r_lfg(b, opts) { G.lfg?.renderWindow(b, opts); },

  // ---------------------------------------------------------------------------
  r_char(b) {
    const P = G.player, S = P.stats, C = CLASSES[P.cls], fac = FACTIONS[P.faction];
    b.innerHTML = '';
    b.style.width = '470px';
    const top = h('div', 'spread');
    const sp = specOf(P);
    top.innerHTML = `<div><div style="font-size:20px;font-weight:700">${escapeHtml(P.name)}</div><div class="muted">Niveau ${P.level} ${C.name}${sp ? ` <span style="color:#f2cb6e">${escapeHtml(sp.name)}</span> (${ROLE_LABEL[sp.role]})` : ''} — <span style="color:${fac.color}">${fac.name}</span></div></div><div style="text-align:right"><div class="muted" style="font-size:12px">Gloire</div><div style="font-weight:700;color:${fac.color}">${fmtInt(P.data.fame)} — ${escapeHtml(G.pvp?.rankName?.(P.data.fame) || '')}</div></div>`;
    b.appendChild(top);
    const wrap = h('div', '');
    wrap.style.cssText = 'display:grid;grid-template-columns:auto 1fr;gap:16px;margin-top:10px';
    const eq = h('div', '');
    eq.style.cssText = 'display:grid;grid-template-columns:repeat(3,44px);gap:4px;align-content:start';
    const order = ['head', 'amulet', 'ring', 'chest', 'hands', 'legs', 'feet', 'weapon', 'offhand'];
    for (const slot of order) {
      const it = P.data.equip[slot];
      const d = this.itemSlot(it, { ph: SLOT_NAMES[slot], tip: { equipped: true, hint: 'Clic : retirer' } });
      d.onclick = () => { if (it) Inv.unequip(slot); };
      d.addEventListener('dragover', (e) => e.preventDefault());
      d.addEventListener('drop', (e) => { const x = e.dataTransfer.getData('text/plain'); if (x.startsWith('bag:')) Inv.equip(+x.slice(4)); });
      eq.appendChild(d);
    }
    wrap.appendChild(eq);
    const red = Math.round(armorReduction(S.armor, P.level) * 100);
    const kv = h('div', 'kv');
    const rows = [
      ['Vie', `${fmtInt(S.maxHp)}`], ['Mana', `${fmtInt(S.maxMp)}`],
      [STAT_NAMES.str, Math.round(S.str)], [STAT_NAMES.sta, Math.round(S.sta)], [STAT_NAMES.agi, Math.round(S.agi)], [STAT_NAMES.int, Math.round(S.int)], [STAT_NAMES.wis, Math.round(S.wis)],
      ['Puissance', Math.round(S.power)], ...(['druide', 'chaman', 'templier'].includes(P.cls) ? [['Puissance de soin', Math.round(S.healPower)]] : []), ...(S.threatMul > 1.01 ? [['Menace', '×' + S.threatMul.toFixed(1).replace('.', ',')]] : []),
      ['Dégâts de l\'arme', `${Math.round(S.weaponAvg * 0.8)}–${Math.round(S.weaponAvg * 1.2)}`],
      ['Armure', `${Math.round(S.armor)} (−${red} %)`], ['Critique', S.crit.toFixed(1).replace('.', ',') + ' %'], ['Hâte', S.haste.toFixed(1).replace('.', ',') + ' %'],
      ['Esquive', S.dodge.toFixed(1).replace('.', ',') + ' %'], ...(S.block ? [['Blocage', S.block.toFixed(0) + ' %']] : []), ['Vitesse', (S.moveSpeed).toFixed(1).replace('.', ',') + ' m/s'],
    ];
    kv.innerHTML = rows.map(([k, v]) => `<span>${k}</span><span class="v">${v}</span>`).join('');
    wrap.appendChild(kv);
    b.appendChild(wrap);
    const foot = h('div', 'kv');
    foot.style.marginTop = '12px';
    const played = Math.floor(P.data.played / 60);
    foot.innerHTML = `<span>Or</span><span class="v">${gold(P.data.gold)}</span><span>Monstres vaincus</span><span class="v">${fmtInt(P.data.kills)}</span><span>Ennemis vaincus (JcJ)</span><span class="v">${fmtInt(P.data.pvpKills)}</span><span>Morts</span><span class="v">${fmtInt(P.data.deaths)}</span><span>Quêtes terminées</span><span class="v">${Object.keys(P.data.quests.done).length}</span><span>Temps de jeu</span><span class="v">${Math.floor(played / 60)} h ${played % 60} min</span>`;
    b.appendChild(foot);
  },

  // ---------------------------------------------------------------------------
  r_bag(b) {
    const P = G.player, bag = P.data.bag;
    b.innerHTML = '';
    const g = h('div', 'grid-slots');
    bag.forEach((it, i) => {
      const hint = !it ? '' : this.isOpen('vendor') ? 'Clic droit : vendre' : this.isOpen('stash') ? 'Clic droit : déposer au coffre' : this.isOpen('forge') ? 'Clic droit : placer sur l\'enclume' : this.isOpen('market') ? 'Clic droit : mettre en vente' : it.type === 'gear' ? 'Clic droit : équiper' : it.type === 'quest' || it.type === 'mat' ? '' : 'Clic droit : utiliser';
      const d = this.itemSlot(it, { checkEquip: true, tip: { hint } });
      d.draggable = !!it;
      d.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', it.type === 'potion' || it.type === 'food' ? 'cons:' + it.cid : 'bag:' + i);
        if (it.type === 'potion' || it.type === 'food') e.dataTransfer.setData('text/x-bag', String(i));
        d.classList.add('dragging');
      });
      d.addEventListener('dragend', () => d.classList.remove('dragging'));
      d.addEventListener('dragover', (e) => { e.preventDefault(); d.classList.add('drop'); });
      d.addEventListener('dragleave', () => d.classList.remove('drop'));
      d.addEventListener('drop', (e) => {
        e.preventDefault(); d.classList.remove('drop');
        let x = e.dataTransfer.getData('text/plain');
        const xb = e.dataTransfer.getData('text/x-bag');
        if (xb) x = 'bag:' + xb;
        if (x.startsWith('bag:')) Inv.swap(+x.slice(4), i);
      });
      d.addEventListener('contextmenu', (e) => { e.preventDefault(); this.bagRightClick(i); });
      d.addEventListener('dblclick', () => this.bagRightClick(i));
      g.appendChild(d);
    });
    b.appendChild(g);
    const foot = h('div', 'spread');
    foot.style.marginTop = '8px';
    foot.innerHTML = `<div>${gold(P.data.gold)}</div><div class="muted num" style="font-size:12px">${Inv.freeSlots()} emplacement(s) libre(s)</div>`;
    b.appendChild(foot);
    const row = h('div', 'row');
    row.style.marginTop = '8px';
    const sort = h('button', 'btn ghost small', 'Trier');
    sort.onclick = () => Inv.sort();
    row.appendChild(sort);
    if (this.isOpen('vendor')) {
      const junk = h('button', 'btn small', 'Vendre les objets communs');
      junk.onclick = () => Inv.junkAll();
      row.appendChild(junk);
    }
    b.appendChild(row);
  },

  bagRightClick(i) {
    const P = G.player, it = P.data.bag[i];
    if (!it) return;
    if (this.isOpen('vendor')) { Inv.sell(i); return; }
    if (this.isOpen('stash')) { Inv.toStash(i); return; }
    if (this.isOpen('forge') && it.type === 'gear') { this.sel.forge = { where: 'bag', idx: i, uid: it.uid }; this.render(this.wins.get('forge')); return; }
    if (this.isOpen('market') && it.type !== 'quest') { this.sel.sell = it.uid; this.open('market', { tab: 'sell' }); return; }
    P.useBagItem(i);
  },

  // ---------------------------------------------------------------------------
  r_skills(b) { renderTalents(b, this); },
  placeOnBar(id, auto = false) {
    const P = G.player;
    if (P.data.bar.some((x) => x && x.k === 's' && x.id === id)) return;
    if (P.placeOnBar(id)) { if (!auto) UI.notify('Compétence placée sur la barre.'); }
    else if (!auto) UI.error("Barres d'action pleines : glissez la compétence sur un emplacement.");
  },

  // ---------------------------------------------------------------------------
  r_quests(b, opts) {
    const P = G.player;
    b.innerHTML = '';
    b.style.width = 'min(760px, 88vw)';
    if (opts.tab) { this.sel.qtab = opts.tab; opts.tab = null; }
    if (opts.select) { this.sel.qtab = 'log'; this.sel.quest = opts.select; opts.select = null; }
    const tab = G.story ? this.sel.qtab || 'log' : 'log';
    if (G.story) {
      const tabs = h('div', 'tabs2');
      for (const [id, name] of [['log', 'Journal'], ['lore', 'Chroniques']]) {
        const t = h('button', id === tab ? 'on' : '', name);
        t.onclick = () => { this.sel.qtab = id; this.render(this.wins.get('quests')); };
        tabs.appendChild(t);
      }
      b.appendChild(tabs);
    }
    if (tab === 'lore') {
      const box = h('div', 'chr-wrap', G.story.chroniclesHtml());
      b.appendChild(box);
      return;
    }
    const ids = Object.keys(P.data.quests.active);
    const wrap = h('div', 'ql');
    const list = h('div', 'list');
    let sel = opts.select && ids.includes(opts.select) ? opts.select : this.sel.quest && ids.includes(this.sel.quest) ? this.sel.quest : ids[0];
    this.sel.quest = sel;
    if (!ids.length) list.innerHTML = '<div class="muted">Aucune quête en cours.</div>';
    const gid = P.data.guide;
    for (const id of ids) {
      const qq = QUEST_BY_ID[id];
      const it = h('div', 'it' + (id === sel ? ' on' : '') + (qq.main ? ' main' : ''), `<button class="qg${id === gid ? ' on' : ''}" title="${id === gid ? 'Arrêter le guidage' : 'Me guider vers l’objectif'}" aria-label="Guidage">${LOUPE}</button><span class="lv num">[${qq.lvl}]</span>${qq.main ? '<span class="mqd" title="Voie de l\'Ordre">◆</span>' : ''}${escapeHtml(qq.name)}${Quests.isReady(qq) ? ' <span class="good">✓</span>' : ''}`);
      it.onclick = () => { this.sel.quest = id; this.render(this.wins.get('quests')); };
      it.querySelector('.qg').onclick = (e) => { e.stopPropagation(); Quests.toggleGuide(id); this.render(this.wins.get('quests')); };
      list.appendChild(it);
    }
    const doneN = Object.keys(P.data.quests.done).length;
    list.appendChild(h('div', 'muted', `<br>${ids.length}/20 quêtes — ${doneN} terminée${doneN > 1 ? 's' : ''}`));
    wrap.appendChild(list);
    const det = h('div', '');
    if (sel) {
      const qq = QUEST_BY_ID[sel];
      const turn = resolveNpc(qq.turnin, P.faction);
      det.innerHTML = `${qq.main ? `<div class="mq big">Voie de l'Ordre — chapitre ${qq.ch}</div>` : ''}<div style="font-size:20px;font-weight:700;color:#f2cb6e">${escapeHtml(qq.name)}</div>
        <div class="muted" style="margin-bottom:6px">Niveau ${qq.lvl} — ${escapeHtml(ZONES.find((z) => z.id === qq.zone)?.name || '')}</div>
        <div class="qtext">${escapeHtml(qq.text)}</div>
        <h3>Objectifs</h3><div class="qobj">${qq.obj.map((o, i) => `<div class="${Quests.objDone(qq, i) && o.t !== 'talk' ? 'done' : ''}">${escapeHtml(Quests.objLabel(qq, i))}</div>`).join('')}</div>
        <div class="muted">À rendre à : ${escapeHtml(NPC_BY_ID[turn]?.name || '?')}, ${escapeHtml(HUB_BY_ID[NPC_BY_ID[turn]?.hub]?.name || '')}</div>
        <h3>Récompenses</h3><div class="rew">${this.rewardsHtml(qq)}</div>`;
      const row = h('div', 'row');
      row.style.marginTop = '12px';
      const on = P.data.guide === sel;
      const gb = h('button', 'btn small qgb' + (on ? '' : ' ghost'), `${LOUPE}<span>${on ? 'Arrêter le guidage' : 'Me guider (flèche et distance)'}</span>`);
      gb.onclick = () => { Quests.toggleGuide(sel); this.render(this.wins.get('quests')); };
      const ab = h('button', 'btn danger small', 'Abandonner');
      ab.onclick = () => UI.ask(`Abandonner la quête « ${escapeHtml(qq.name)} » ?`, () => Quests.abandon(sel), null, 'Abandonner', 'Annuler');
      row.append(gb, ab);
      det.appendChild(row);
    }
    wrap.appendChild(det);
    b.appendChild(wrap);
  },

  rewardsHtml(qq) {
    const parts = [`<span class="num" style="color:#c8a8ff;font-weight:700">${fmtInt(questXp(qq))} XP</span>`, gold(questGold(qq))];
    if (qq.gear) parts.push(`<span style="color:${qq.gear === 'boss' ? '#b86bff' : qq.gear === 'elite' ? '#3fa0ff' : '#5fd35a'};font-weight:600">Équipement ${qq.gear === 'boss' ? 'épique ou rare' : qq.gear === 'elite' ? 'de qualité' : 'adapté à votre classe'}</span>`);
    if (qq.shards) parts.push(`<span>${qq.shards} éclats runiques</span>`);
    if (qq.fame) parts.push(`<span style="color:#ff9a7a;font-weight:600">+${qq.fame} Gloire</span>`);
    return parts.join('');
  },

  // ---------------------------------------------------------------------------
  r_map(b) {
    const P = G.player;
    if (G.inst?.active && isInstancePoint(P.pos.x, P.pos.z)) { G.inst.renderMap(b, this); return; }
    b.innerHTML = '';
    const wrap = h('div', 'wmap');
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1024;
    wrap.appendChild(cv);
    b.appendChild(wrap);
    if (!this.mapBase) this.mapBase = renderWorldMap(1024);
    const draw = () => {
      if (!this.isOpen('map')) return;
      const c = cv.getContext('2d');
      c.drawImage(this.mapBase, 0, 0);
      const tx = (x) => (x + WORLD_HALF) * cv.width / (WORLD_HALF * 2), tz = (z) => (z + WORLD_HALF) * cv.height / (WORLD_HALF * 2);
      // quêtes
      for (const a of Quests.trackedAreas()) {
        c.beginPath(); c.arc(tx(a.x), tz(a.z), Math.max(8, a.r / WORLD_SCALE), 0, Math.PI * 2);
        c.fillStyle = 'rgba(255,210,74,.2)'; c.fill(); c.strokeStyle = 'rgba(255,210,74,.8)'; c.lineWidth = 2; c.stroke();
      }
      // hubs
      c.font = 'bold 15px "Barlow Semi Condensed", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
      for (const hb of HUBS) {
        const known = P.data.discovered.includes(hb.id);
        const x = tx(hb.x), y = tz(hb.z);
        if (hb.type === 'sanctuary') {
          // sanctuaires des Huit Ordres : losange ; nom affiché une fois découvert
          c.fillStyle = ORDERS[hb.cls]?.color || '#c8b0ff'; c.strokeStyle = '#000'; c.lineWidth = 3;
          c.beginPath(); c.moveTo(x, y - 8); c.lineTo(x + 8, y); c.lineTo(x, y + 8); c.lineTo(x - 8, y); c.closePath(); c.stroke(); c.fill();
          if (known) {
            c.font = 'bold 13px "Barlow Semi Condensed", sans-serif';
            c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.85)'; c.strokeText(hb.name, x + 11, y);
            c.fillStyle = hb.cls === P.cls ? '#f2cb6e' : '#e8e0f4'; c.fillText(hb.name, x + 11, y);
            c.font = 'bold 15px "Barlow Semi Condensed", sans-serif';
          }
          continue;
        }
        c.fillStyle = FACTIONS[hb.faction].color; c.strokeStyle = '#000'; c.lineWidth = 3;
        const s = hb.type === 'capital' ? 9 : 6;
        c.fillRect(x - s, y - s, s * 2, s * 2); c.strokeRect(x - s, y - s, s * 2, s * 2);
        if (known) { c.fillStyle = '#fff'; c.fillRect(x - 2, y - 2, 4, 4); }
        c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.85)'; c.strokeText(hb.name, x + s + 4, y);
        c.fillStyle = hb.faction === P.faction ? '#e8f0ff' : '#ffd0c8'; c.fillText(hb.name, x + s + 4, y);
      }
      // lieux
      c.font = 'italic 13px "Barlow Semi Condensed", sans-serif';
      for (const lm of LANDMARKS) {
        if (!lm.r && lm.kind === 'none') continue;
        const x = tx(lm.x), y = tz(lm.z);
        c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fillStyle = '#ffd24a'; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 2; c.stroke();
        c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.8)'; c.strokeText(lm.name, x + 7, y); c.fillStyle = '#ffe9a8'; c.fillText(lm.name, x + 7, y);
      }
      // événements
      for (const m of G.events?.mapMarks?.() || []) {
        c.beginPath(); c.arc(tx(m.x), tz(m.z), 12, 0, Math.PI * 2); c.fillStyle = m.color; c.globalAlpha = 0.5 + 0.5 * Math.sin(performance.now() / 200); c.fill(); c.globalAlpha = 1;
      }
      // joueurs réels et groupe
      for (const e of G.world.entities) {
        if (!(e.kind === 'remote' || e.inMyParty) || e === P) continue;
        c.beginPath(); c.arc(tx(e.pos.x), tz(e.pos.z), 6, 0, Math.PI * 2); c.fillStyle = e.faction === P.faction ? '#5fd3ff' : '#ff3a8a'; c.fill(); c.strokeStyle = '#000'; c.stroke();
      }
      // PNJ de quête
      c.font = 'bold 22px Georgia'; c.textAlign = 'center';
      for (const m of Quests.npcMarks()) { c.lineWidth = 4; c.strokeStyle = '#000'; c.strokeText(m.done ? '?' : '!', tx(m.x), tz(m.z) - 10); c.fillStyle = m.done ? '#5fd35a' : '#ffd24a'; c.fillText(m.done ? '?' : '!', tx(m.x), tz(m.z) - 10); }
      // joueur
      c.save(); c.translate(tx(P.pos.x), tz(P.pos.z)); c.rotate(-P.ry + Math.PI);
      c.beginPath(); c.moveTo(0, -13); c.lineTo(9, 9); c.lineTo(0, 4); c.lineTo(-9, 9); c.closePath();
      c.fillStyle = '#ffe68a'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#000'; c.stroke(); c.restore();
      requestAnimationFrame(() => setTimeout(draw, 250));
    };
    draw();
    // noms de régions
    for (const z of ZONES) {
      const cx = z.col === 0 ? -330 : z.col === 1 ? 0 : 330, cz = z.row === 0 ? -330 : z.row === 1 ? 0 : 330;
      const lab = h('div', 'lab', `${z.name}<small>Niv. ${z.lvl[0]}${z.lvl[1] !== z.lvl[0] ? '–' + z.lvl[1] : '+'}</small>`);
      lab.style.left = ((cx + 512) / 1024) * 100 + '%';
      lab.style.top = ((cz + 512 + 60) / 1024) * 100 + '%';
      wrap.appendChild(lab);
    }
    const leg = h('div', 'legend');
    leg.innerHTML = `<span><i style="background:${FACTIONS[0].color}"></i>Pacte d'Azur</span><span><i style="background:${FACTIONS[1].color}"></i>Clans de Braise</span><span><i style="background:#c8b0ff;transform:rotate(45deg) scale(.8)"></i>Sanctuaire d'un Ordre</span><span><i style="background:#ffd24a;border-radius:50%"></i>Lieu remarquable</span><span><i style="background:rgba(255,210,74,.5)"></i>Objectif de quête</span><span><i style="background:#fff"></i>Pierre de voyage découverte</span>`;
    b.appendChild(leg);
  },

  // ---------------------------------------------------------------------------
  r_group(b) {
    b.innerHTML = '';
    b.style.width = '380px';
    G.party?.renderWindow?.(b);
  },
  r_ladder(b, opts) {
    b.innerHTML = '';
    b.style.width = '480px';
    G.pvp?.renderLadder?.(b, opts);
  },

  // ---------------------------------------------------------------------------
  r_options(b) {
    const S = G.settings;
    b.innerHTML = '';
    b.style.width = '460px';
    const sel = (id, label, val, opts) => `<div class="spread" style="margin:6px 0"><label for="${id}">${label}</label><select id="${id}" style="background:#0d1016;color:#ece3cf;border:1px solid #3b4354;padding:3px 6px;font-size:14px">${opts.map(([v, t]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;
    const rng = (id, label, val, min, max, step) => `<div class="spread" style="margin:6px 0"><label for="${id}">${label}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}" style="pointer-events:auto;width:180px"></div>`;
    const chk = (id, label, val) => `<div class="spread" style="margin:6px 0"><label for="${id}">${label}</label><input type="checkbox" id="${id}" ${val ? 'checked' : ''} style="pointer-events:auto;width:18px;height:18px"></div>`;
    b.innerHTML = `<h3>Graphismes</h3>${sel('o-q', 'Qualité', S.quality, [[0, 'Basse (rapide)'], [1, 'Moyenne'], [2, 'Haute']])}${chk('o-sh', 'Ombres', S.shadows)}${chk('o-tex', 'Textures du décor (sol, murs, toits, arbres)', S.textures !== false)}${chk('o-auto', 'Fluidité automatique (baisse la résolution si le jeu passe sous 60 images/s)', S.autoPerf !== false)}${chk('o-fps', 'Afficher les images par seconde', !!S.showFps)}${rng('o-vd', 'Distance de vue', S.viewDist, 200, 520, 20)}
      <h3>Son</h3>${rng('o-vol', 'Volume des effets', S.volume, 0, 1, 0.05)}${rng('o-mus', 'Volume de la musique', S.music, 0, 1, 0.05)}
      <h3>Interface</h3><div class="spread" style="margin:6px 0"><span>Disposition des cadres (gardée après avoir quitté)</span><button class="btn small" id="o-lay">Déplacer l'interface</button></div>${chk('o-evt', 'Bandeau des événements (boss du monde, Bastion, caravanes)', !S.hideEvents)}${chk('o-self', 'Afficher ma vie et mon niveau au-dessus de mon personnage', S.selfPlate)}
      ${chk('o-b2', "Barre d'action 2 (au-dessus de la principale · Maj + 1…0)", S.bar2)}${chk('o-b3', "Barre d'action 3 (au-dessus · à la souris)", S.bar3)}${chk('o-b4', "Barre d'action latérale (à droite · à la souris)", S.bar4)}
      <div class="muted" style="font-size:12.5px;margin:-2px 0 6px">Glissez compétences et potions sur les nouvelles barres depuis le grimoire (K) ou le sac (B). Clic droit sur une case pour la vider.</div>
      <h3>Jeu</h3>${chk('o-aa', 'Attaque automatique de la cible', S.autoAttack)}${chk('o-kt', 'Q / D tournent la caméra (clic droit maintenu : pas de côté ; A / E : pas de côté)', S.keyTurn !== false)}${rng('o-sens', 'Sensibilité de la caméra', S.sensitivity, 0.3, 2.5, 0.1)}${chk('o-inv', 'Inverser l\'axe vertical', S.invertY)}
      ${sel('o-xp', "Vitesse d'expérience", S.xpRate, [[1, 'Normale (×1)'], [1.5, 'Rapide (×1,5)'], [2, 'Très rapide (×2)'], [3, 'Express (×3)']])}
      <h3>Sauvegarde</h3><div class="muted" style="font-size:13px;margin-bottom:6px">Votre personnage est sauvegardé automatiquement dans ce navigateur. Copiez le code de sauvegarde pour le garder ailleurs ou le transférer.</div>
      <div class="row wrap"><button class="btn small" id="o-exp">Copier le code de sauvegarde</button><button class="btn ghost small" id="o-imp">Importer un code</button><button class="btn ghost small" id="o-help">Aide et contrôles</button></div>
      <textarea id="o-code" style="display:none;width:100%;box-sizing:border-box;height:70px;margin-top:6px;background:#0d1016;color:#ece3cf;border:1px solid #3b4354;font-size:11px;pointer-events:auto" aria-label="Code de sauvegarde"></textarea>
      <div class="row" style="margin-top:14px;justify-content:space-between"><button class="btn ghost" id="o-title">Changer de personnage</button><button class="btn" id="o-close">Reprendre</button></div>`;
    const apply = () => { G.applyGraphics?.(); G.saveSettings?.(); };
    $('o-q').onchange = (e) => { S.quality = +e.target.value; apply(); };
    $('o-sh').onchange = (e) => { S.shadows = e.target.checked; apply(); };
    $('o-tex').onchange = (e) => { S.textures = e.target.checked; apply(); };
    $('o-auto').onchange = (e) => { S.autoPerf = e.target.checked; apply(); };
    $('o-fps').onchange = (e) => { S.showFps = e.target.checked; G.perf?.showFps(); G.saveSettings?.(); };
    $('o-vd').onchange = (e) => { S.viewDist = +e.target.value; apply(); };
    $('o-vol').oninput = (e) => { S.volume = +e.target.value; G.audio?.setVolume?.(); G.saveSettings?.(); };
    $('o-mus').oninput = (e) => { S.music = +e.target.value; G.audio?.setVolume?.(); G.saveSettings?.(); };
    $('o-aa').onchange = (e) => { S.autoAttack = e.target.checked; G.saveSettings?.(); };
    $('o-lay').onclick = () => G.layout?.toggle(true);
    $('o-evt').onchange = (e) => { S.hideEvents = !e.target.checked; G.saveSettings?.(); G.events?.renderBox?.(); };
    $('o-kt').onchange = (e) => { S.keyTurn = e.target.checked; G.saveSettings?.(); };
    $('o-self').onchange = (e) => { S.selfPlate = e.target.checked; G.saveSettings?.(); };
    for (const k of ['bar2', 'bar3', 'bar4']) $('o-' + k.replace('bar', 'b')).onchange = (e) => { S[k] = e.target.checked; G.saveSettings?.(); UI.applyBars(); UI.refresh(); };
    $('o-sens').onchange = (e) => { S.sensitivity = +e.target.value; G.saveSettings?.(); };
    $('o-inv').onchange = (e) => { S.invertY = e.target.checked; G.saveSettings?.(); };
    $('o-xp').onchange = (e) => { S.xpRate = +e.target.value; G.saveSettings?.(); };
    $('o-exp').onclick = () => {
      const code = G.exportSave?.() || '';
      const ta = $('o-code'); ta.style.display = 'block'; ta.value = code; ta.select();
      navigator.clipboard?.writeText(code).then(() => UI.notify('Code copié dans le presse-papiers.')).catch(() => UI.notify('Sélectionnez le code et copiez-le (Ctrl+C).'));
    };
    $('o-imp').onclick = () => {
      const ta = $('o-code'); ta.style.display = 'block'; ta.value = ''; ta.placeholder = 'Collez ici votre code puis cliquez à nouveau sur « Importer un code »';
      ta.focus();
      $('o-imp').onclick = () => { const ok = G.importSave?.(ta.value.trim()); if (ok) UI.notify('Personnage importé ! Il apparaît dans la liste des personnages.'); else UI.error('Code invalide.'); };
    };
    $('o-help').onclick = () => { this.close('options'); this.open('help'); };
    $('o-title').onclick = () => { this.close('options'); G.toTitle?.(); };
    $('o-close').onclick = () => this.close('options');
  },

  r_help(b) {
    b.style.width = 'min(620px, 88vw)';
    b.innerHTML = `<div class="kv" style="grid-template-columns:auto 1fr;gap:4px 18px">
      <span class="gold">Z / S</span><span>Avancer / reculer (les flèches marchent aussi)</span>
      <span class="gold">Q / D</span><span>Tourner (caméra et personnage) — avec le clic droit maintenu : pas de côté</span>
      <span class="gold">A / E</span><span>Pas de côté à gauche / à droite</span>
      <span class="gold">Souris (clic maintenu)</span><span>Tourner la caméra — clic droit : le personnage suit la caméra</span>
      <span class="gold">Molette</span><span>Zoomer / dézoomer</span>
      <span class="gold">Espace</span><span>Sauter</span>
      <span class="gold">Tab</span><span>Cibler l'ennemi suivant (Maj+Tab : précédent)</span>
      <span class="gold">Clic gauche</span><span>Sélectionner — clic droit sur un ennemi : attaquer</span>
      <span class="gold">1 à 0</span><span>Compétences et objets de la barre d'action — Maj + 1 à 0 : barre 2 (à activer dans les options)</span>
      <span class="gold">F</span><span>Parler au PNJ ou utiliser la pierre de voyage la plus proche</span>
      <span class="gold">T</span><span>Monter / descendre de monture (niveau 10)</span>
      <span class="gold">C / B / K / L</span><span>Personnage / Sac / Talents et spécialisations / Quêtes</span>
      <span class="gold">Loupe</span><span>À côté de chaque quête : une flèche indique la direction et la distance de l'objectif (ou du PNJ où la rendre)</span>
      <span class="gold">M / P / O</span><span>Carte / Groupe / Classement</span>
      <span class="gold">U</span><span>Donjons, raids, Abîme sans fin et Intendance (emblèmes)</span>
      <span class="gold">Y</span><span>Ménagerie : vos familiers (rôle Tank, Dégâts ou Soins pour chacun)</span>
      <span class="gold">R</span><span>Runes : fusion (3 runes identiques → 1 rune du niveau suivant, +40 %) et sertissage dans l'équipement</span>
      <span class="gold">N</span><span>Métiers : 2 primaires et 2 secondaires, chacun avec un atout et un défaut</span>
      <span class="gold">F (récolte)</span><span>Près d'un filon, d'une plante, d'une bête à dépecer ou face à l'eau : récolter ou pêcher</span>
      <span class="gold">Entrée</span><span>Discuter — commandes : /g (groupe), /f (faction), /inviter, /quitter, /danse, /salut</span>
      <span class="gold">Échap</span><span>Fermer les fenêtres, options</span>
      <span class="gold">Verr. Num ou ²</span><span>Course automatique</span>
      <span class="gold">Plein écran</span><span>Bouton dédié dans la barre de menus (en bas à droite) et sur l'écran de connexion</span></div>
      <h3>La voie de l'Ordre</h3><div class="qtext" style="font-size:14px">Chaque classe commence dans le sanctuaire de son Ordre, auprès de son mentor. Sa quête principale (16 chapitres, du niveau 1 au niveau 30) vous emmène de région en région jusqu'à l'Autel des Tempêtes. Quand un chapitre demande un niveau que vous n'avez pas encore, le suivi de quêtes vous indique les quêtes secondaires les plus proches. Toute l'histoire est résumée dans le journal (touche L, onglet Chroniques).</div>
      <h3>Conseils</h3><div class="qtext" style="font-size:14px">Les PNJ avec un <b style="color:#ffd24a">!</b> ont une quête pour vous, ceux avec un <b style="color:#5fd35a">?</b> attendent votre retour. Les monstres dont le nom est orange ou rouge sont plus forts que vous. Les régions du centre et du nord sont disputées : les joueurs de la faction adverse peuvent vous attaquer, et chaque victoire vous rapporte de la Gloire. Cherchez un groupe (touche P) pour les élites et les boss. Le forgeron améliore votre équipement grâce aux éclats runiques. Toutes les demi-heures, le Dévoreur d'Orages descend sur l'Autel des Tempêtes.</div>
      <h3>Donjons et raids</h3><div class="qtext" style="font-size:14px">Touche <b>U</b> : choisissez un donjon (5 joueurs), un raid (10 joueurs) ou l'Abîme sans fin. Cochez <b>« Remplir avec l'IA »</b> pour compléter le groupe avec des compagnons (tank, soigneur, dégâts) quand aucun vrai joueur n'est là. Écartez-vous des zones rouges annoncées au sol, interrompez les soins des boss (étourdissement, Heurt de bouclier, Défi solennel…) et abattez les gardiens qui les protègent. Chaque boss rapporte des Emblèmes de bravoure, à échanger contre de l'équipement épique à l'Intendance. Chaque monstre vaincu peut laisser sa pierre d'âme : il devient alors votre familier (touche Y).</div>`;
  },

  // ---------------------------------------------------------------------------
  // Interaction avec un PNJ
  openNpc(e) {
    const P = G.player;
    if (!e || e.dead) return;
    if (e.faction !== P.faction && !e.neutral) { UI.error('Ce PNJ ne vous parle pas.'); return; }
    if (e.faction !== P.faction) { UI.error("Ce PNJ sert l'autre faction."); return; }
    this.npc = e;
    if (e.npcRole === 'travel') { this.discover(e.rec.hub); this.open('travel'); return; }
    this.open('npc', { title: e.name });
  },

  r_npc(b) {
    const e = this.npc;
    if (!e) { this.close('npc'); return; }
    const P = G.player;
    const def = NPC_BY_ID[e.npcId];
    b.innerHTML = '';
    const d = h('div', 'dlg');
    d.innerHTML = `<div class="who"><div><div style="font-weight:700;font-size:16px">${escapeHtml(e.name)}</div><div class="role">${escapeHtml(e.roleName)}</div></div></div><div class="say">« ${escapeHtml(def?.hello || 'Bonjour, voyageur.')} »</div>`;
    const opts = h('div', 'opts');
    const add = (mark, label, fn, cls = '') => {
      const o = h('button', 'opt', `<span class="m ${cls}">${mark}</span><span>${label}</span>`);
      o.onclick = fn;
      opts.appendChild(o);
    };
    for (const qq of Quests.turninsFor(e.npcId)) {
      const ready = Quests.isReady(qq);
      add(ready ? '?' : '?', escapeHtml(qq.name) + (ready ? '' : ' <span class="muted">(en cours)</span>'), () => this.open('qdlg', { q: qq.id, mode: 'turnin' }), ready ? 'done' : '');
    }
    for (const qq of Quests.availableFor(e.npcId)) {
      const lock = Quests.locked(qq);
      const tag = qq.main ? `<span class="mq">Voie de l'Ordre ${qq.ch}</span> ` : '';
      add('!', `${tag}${escapeHtml(qq.name)} <span class="muted">(${lock ? `niveau ${qq.lvl} requis` : `niv. ${qq.lvl}`})</span>`, () => this.open('qdlg', { q: qq.id, mode: 'offer' }), lock ? 'lock' : qq.main ? 'main' : '');
    }
    const role = e.npcRole;
    if (role === 'profs') add('◆', 'Apprendre ou gérer mes métiers', () => { this.close('npc'); this.open('profs'); });
    if (role === 'vendor') add('◆', 'Voir la marchandise', () => { this.open('vendor'); this.open('bag'); });
    if (role === 'smith') add('◆', 'Améliorer ou recycler un équipement', () => { this.open('forge'); this.open('bag'); });
    if (role === 'stable') add('◆', 'Acheter une monture', () => this.open('stable'));
    if (role === 'auction') add('◆', "Consulter l'hôtel des ventes", () => { this.open('market'); this.open('bag'); });
    if (role === 'stash') add('◆', 'Ouvrir mon coffre', () => { this.open('stash'); this.open('bag'); });
    if (role === 'trainer') add('◆', 'Parler de mes talents et spécialisations', () => this.open('trainer'));
    if (role === 'leader') add('◆', 'Définir mon point de rappel ici', () => { P.data.bind = e.rec.hub; P.bindHub = e.rec.hub; UI.notify(`Point de rappel : ${HUB_BY_ID[e.rec.hub].name}`); });
    if (role === 'leader' || role === 'quest' && e.rec?.hub === FACTIONS[P.faction].capital) add('◆', 'Donjons, raids et Abîme sans fin', () => { this.close('npc'); this.open('lfg'); });
    add('×', 'Au revoir', () => this.close('npc'));
    d.appendChild(opts);
    b.appendChild(d);
  },

  r_qdlg(b, opts) {
    const qq = QUEST_BY_ID[opts.q];
    const P = G.player;
    b.innerHTML = '';
    const d = h('div', 'dlg');
    const ready = Quests.isReady(qq);
    const txt = opts.mode === 'turnin' ? (ready ? qq.done : 'Alors, tu as terminé ?') : qq.text;
    d.innerHTML = `<div style="font-size:21px;font-weight:700;color:#f2cb6e;margin-bottom:6px">${escapeHtml(qq.name)}</div><div class="qtext" style="margin-bottom:8px">${escapeHtml(txt)}</div>
      ${opts.mode === 'offer' || !ready ? `<h3>Objectifs</h3><div class="qobj">${qq.obj.map((o, i) => `<div class="${opts.mode !== 'offer' && Quests.objDone(qq, i) && o.t !== 'talk' ? 'done' : ''}">${escapeHtml(opts.mode === 'offer' ? Quests.objLabel({ ...qq }, i).replace(/ : 0\/(\d+)$/, ' : $1') : Quests.objLabel(qq, i))}</div>`).join('')}</div>` : ''}
      <h3>Récompenses</h3><div class="rew">${this.rewardsHtml(qq)}</div>`;
    const row = h('div', 'row');
    row.style.marginTop = '12px';
    if (opts.mode === 'offer') {
      const lock = Quests.locked(qq);
      const a = h('button', 'btn', 'Accepter');
      a.disabled = lock;
      a.onclick = () => { Quests.accept(qq.id); this.close('qdlg'); if (this.isOpen('npc')) this.render(this.wins.get('npc')); };
      const n = h('button', 'btn ghost', lock ? 'Plus tard' : 'Refuser');
      n.onclick = () => this.close('qdlg');
      row.append(a, n);
      if (lock) {
        const hubs = G.story?.sideHubs?.(2) || [];
        row.appendChild(h('span', 'bad', `Niveau ${qq.lvl} requis (vous : ${P.level}).`));
        d.appendChild(row);
        d.appendChild(h('div', 'muted qlock', `En attendant, gagnez de l'expérience avec les quêtes secondaires${hubs.length ? ` : ${hubs.map((x) => `<b>${escapeHtml(x.hub.name)}</b>`).join(' et ')}` : ' des régions voisines'}. Votre suivi de quêtes vous y guidera.`));
        b.appendChild(d);
        return;
      }
      if (qq.lvl > P.level + 2) row.appendChild(h('span', 'bad', 'Quête difficile pour votre niveau'));
    } else {
      const c = h('button', 'btn', 'Terminer la quête');
      c.disabled = !ready;
      c.onclick = () => { if (Quests.complete(qq.id)) { this.close('qdlg'); if (this.isOpen('npc')) this.render(this.wins.get('npc')); } };
      row.appendChild(c);
    }
    d.appendChild(row);
    b.appendChild(d);
  },

  // ---------------------------------------------------------------------------
  vendorStock() {
    const P = G.player;
    const L = P.level;
    const list = [
      makeConsumable(potionFor(L, 'hp')), makeConsumable(potionFor(L, 'mp')), makeConsumable(L >= 15 ? 'food2' : 'food1'),
      makeConsumable('pot_hp1'), makeConsumable('pot_mp1'),
    ];
    if ((P.data.bagExtra || 0) < 3) list.push(makeConsumable('bag_scroll'));
    // équipement de base au niveau du joueur (qualité modeste), renouvelé à chaque niveau
    if (!this._stock || this._stockLvl !== L) {
      this._stockLvl = L;
      this._stock = ['weapon', 'chest', 'legs', 'head', 'feet', 'hands'].map((slot) => makeGear({ slot, cls: P.cls, ilvl: Math.max(1, L - 1), quality: 42 + Math.floor(Math.random() * 12) }));
    }
    return [...list, ...this._stock];
  },
  buyPrice(it) {
    const k = 1 + (G.player?.pmods?.vendorPricePct || 0); // Joaillier : goût du luxe
    if (it.type === 'gear') return Math.round(it.value * 4 * k);
    if (it.cid === 'bag_scroll') return Math.round((400 + (G.player.data.bagExtra || 0) * 400) * k);
    return Math.round(it.value * 4 * k);
  },

  r_vendor(b) {
    const P = G.player;
    b.innerHTML = '';
    b.style.width = '470px';
    b.appendChild(h('div', 'muted', 'Clic sur un article pour l\'acheter (Maj+clic : ×5). Clic droit sur un objet du sac pour le vendre.'));
    const g = h('div', 'shop');
    g.style.marginTop = '8px';
    for (const it of this.vendorStock()) {
      const pr = this.buyPrice(it);
      const row = h('div', 'si');
      row.appendChild(this.itemSlot(it, { tip: { price: pr } }));
      row.appendChild(h('div', 'nm', `<span style="color:${RARITY[it.rarity || 0].color}">${escapeHtml(it.name)}</span>`));
      row.appendChild(h('div', 'pr num', fmtInt(pr) + ' po'));
      row.onclick = (e) => {
        const n = e.shiftKey && it.stack > 1 ? 5 : 1;
        const cost = pr * n;
        if (P.data.gold < cost) { UI.error("Vous n'avez pas assez d'or."); return; }
        const copy = it.type === 'gear' ? { ...it, stats: { ...it.stats }, uid: it.uid + 'b' + Math.random().toString(36).slice(2, 6) } : makeConsumable(it.cid, n);
        if (Inv.add(copy, true)) {
          P.data.gold -= cost;
          G.audio?.play('coin');
          UI.notify(`Acheté : ${it.name}${n > 1 ? ' ×' + n : ''}`);
          if (it.type === 'gear') this._stock = this._stock.filter((x) => x !== it);
          UI.refresh();
        }
      };
      g.appendChild(row);
    }
    b.appendChild(g);
    const bb = P.data.buyback || [];
    if (bb.length) {
      b.appendChild(h('h3', '', 'Rachat'));
      const r = h('div', 'row wrap');
      bb.forEach((it, i) => {
        const pr = Inv.sellPrice(it);
        const s = this.itemSlot(it, { tip: { price: pr, hint: 'Clic : racheter' } });
        s.onclick = () => {
          if (P.data.gold < pr) { UI.error("Vous n'avez pas assez d'or."); return; }
          if (Inv.add(it, true)) { P.data.gold -= pr; bb.splice(i, 1); G.audio?.play('coin'); UI.refresh(); }
        };
        r.appendChild(s);
      });
      b.appendChild(r);
    }
  },

  // ---------------------------------------------------------------------------
  upgradeInfo(it) {
    const n = it.upg || 0;
    const chance = [100, 100, 95, 85, 75, 62, 50, 40, 30, 22][n] ?? 0;
    const goldCost = Math.round((20 + it.ilvl * 9) * Math.pow(1.45, n));
    const shards = 2 + n * 2 + Math.floor(it.ilvl / 8);
    const hearts = n >= 6 ? n - 5 : 0;
    return { n, chance, goldCost, shards, hearts, max: n >= 10 };
  },
  forgeItem() {
    const P = G.player;
    const s = this.sel.forge;
    if (!s) return null;
    if (s.where === 'bag') { const it = P.data.bag[s.idx]; if (it && it.uid === s.uid) return it; }
    if (s.where === 'equip') { const it = P.data.equip[s.slot]; if (it && it.uid === s.uid) return it; }
    this.sel.forge = null;
    return null;
  },
  r_forge(b) {
    const P = G.player;
    b.innerHTML = '';
    b.style.width = '470px';
    const it = this.forgeItem();
    b.appendChild(h('div', 'muted', "Clic droit sur un équipement du sac, ou clic sur une pièce équipée ci-dessous, pour la placer sur l'enclume."));
    const eqRow = h('div', 'row wrap');
    eqRow.style.margin = '8px 0';
    for (const slot of SLOTS) {
      const e = P.data.equip[slot];
      if (!e) continue;
      const s = this.itemSlot(e, { tip: { equipped: true } });
      s.onclick = () => { this.sel.forge = { where: 'equip', slot, uid: e.uid }; this.render(this.wins.get('forge')); };
      eqRow.appendChild(s);
    }
    b.appendChild(eqRow);
    const shards = Inv.count((x) => x.cid === 'shard'), hearts = Inv.count((x) => x.cid === 'shard_big');
    const f = h('div', 'forge');
    if (!it) {
      f.innerHTML = `<div class="muted">Aucun objet sur l'enclume.</div><div class="kv"><span>Éclats runiques</span><span class="v">${shards}</span><span>Cœurs runiques</span><span class="v">${hearts}</span><span>Or</span><span class="v">${gold(P.data.gold)}</span></div>`;
      b.appendChild(f);
      return;
    }
    const inf = this.upgradeInfo(it);
    const left = h('div', '');
    const big = this.itemSlot(it);
    big.classList.add('big');
    left.appendChild(big);
    left.appendChild(h('div', '', `<div style="font-weight:700;color:${RARITY[it.rarity].color};margin-top:6px">${escapeHtml(it.name)} ${it.upg ? '+' + it.upg : ''}</div>`));
    const cur = gearStats(it), nxt = gearStats({ ...it, upg: (it.upg || 0) + 1 });
    const diff = Object.keys(cur).filter((k) => k !== 'dmgMin').map((k) => `<div class="muted">${k === 'dmgMax' ? 'Dégâts' : STAT_NAMES[k] || k} : ${k === 'dmgMax' ? cur.dmgMin + '–' + cur.dmgMax : cur[k]} → <span class="good">${k === 'dmgMax' ? nxt.dmgMin + '–' + nxt.dmgMax : nxt[k]}</span></div>`).join('');
    left.appendChild(h('div', '', inf.max ? '<div class="gold">Amélioration maximale atteinte.</div>' : diff));
    f.appendChild(left);
    const right = h('div', '');
    if (!inf.max) {
      const okG = P.data.gold >= inf.goldCost, okS = shards >= inf.shards, okH = hearts >= inf.hearts;
      right.innerHTML = `<div class="muted">Amélioration +${inf.n + 1}</div><div class="chance" style="color:${inf.chance >= 75 ? '#5fd35a' : inf.chance >= 45 ? '#f2cb6e' : '#ff8a6a'}">${inf.chance} %</div><div class="muted" style="font-size:12px;margin-bottom:6px">de réussite. En cas d'échec, les matériaux sont perdus mais l'objet est conservé.</div>
        <div class="kv"><span>Or</span><span class="v ${okG ? '' : 'bad'}">${fmtInt(inf.goldCost)} / ${fmtInt(P.data.gold)}</span><span>Éclats runiques</span><span class="v ${okS ? '' : 'bad'}">${inf.shards} / ${shards}</span>${inf.hearts ? `<span>Cœurs runiques</span><span class="v ${okH ? '' : 'bad'}">${inf.hearts} / ${hearts}</span>` : ''}</div>`;
      const up = h('button', 'btn', 'Améliorer');
      up.style.marginTop = '10px';
      up.disabled = !(okG && okS && okH);
      up.onclick = () => this.doUpgrade(it, inf);
      right.appendChild(up);
    }
    if (this.sel.forge.where === 'bag') {
      const y = Inv.salvageYield(it);
      const sv = h('button', 'btn ghost small', `Recycler (${y} éclat${y > 1 ? 's' : ''})`);
      sv.style.marginTop = '10px'; sv.style.display = 'block';
      sv.onclick = () => UI.ask(`Recycler ${escapeHtml(it.name)} en ${y} éclat(s) runique(s) ? L'objet sera détruit.`, () => {
        const idx = P.data.bag.indexOf(it);
        if (idx >= 0) { Inv.freeRunes(it); P.data.bag[idx] = null; Inv.add(makeConsumable('shard', y)); this.sel.forge = null; G.audio?.play('anvil'); UI.refresh(); }
      }, null, 'Recycler', 'Annuler');
      right.appendChild(sv);
    }
    f.appendChild(right);
    b.appendChild(f);
  },
  doUpgrade(it, inf) {
    const P = G.player;
    P.data.gold -= inf.goldCost;
    Inv.removeWhere((x) => x.cid === 'shard', inf.shards);
    if (inf.hearts) Inv.removeWhere((x) => x.cid === 'shard_big', inf.hearts);
    G.audio?.play('anvil');
    if (Math.random() * 100 < inf.chance) {
      it.upg = (it.upg || 0) + 1;
      UI.announce(`Réussite : +${it.upg} !`, 'quest', it.name);
      pillar(P.pos.x, P.pos.y, P.pos.z, '#ffe68a', 20, 2);
      if (Object.values(P.data.equip).includes(it)) P.refreshGear(false);
    } else {
      UI.announce("L'amélioration a échoué", 'boss', 'Les matériaux sont perdus, votre objet est intact.');
    }
    UI.refresh();
    G.saveSoon?.();
  },

  // ---------------------------------------------------------------------------
  r_stable(b) {
    const P = G.player;
    b.innerHTML = '';
    b.style.width = '400px';
    const name = P.faction ? 'Loup de guerre' : 'Destrier du Pacte';
    const rows = [
      { tier: 1, name, lvl: 10, price: 500, desc: 'Monture : +65 % de vitesse de déplacement.' },
      { tier: 2, name: name + ' cuirassé', lvl: 20, price: 2500, desc: 'Monture rapide : +100 % de vitesse de déplacement.' },
      { tier: 3, name: P.faction ? 'Wyrm de braise' : 'Drake céleste', lvl: 30, price: 6000, desc: 'Monture volante : Espace pour décoller et monter, X pour descendre. Encore plus rapide dans les airs.' },
    ];
    for (const r of rows) {
      const owned = (P.data.mountTier || 0) >= r.tier;
      const d = h('div', 'sk');
      d.innerHTML = `<div class="ic" style="background-image:url(${icon('mount', r.tier === 3 ? '#7fb8ff' : r.tier === 2 ? '#d9a441' : '#8a6a40')})"></div><div><div class="t">${r.name}<small>niveau ${r.lvl}</small></div><div class="d">${r.desc}</div></div>`;
      const btn = h('button', 'btn small', owned ? 'Possédé' : fmtInt(r.price) + ' po');
      btn.disabled = owned || P.level < r.lvl || P.data.gold < r.price || (P.data.mountTier || 0) < r.tier - 1;
      btn.onclick = () => {
        P.data.gold -= r.price;
        P.data.hasMount = true;
        P.data.mountTier = r.tier;
        P.skills.x_monture = 1;
        this.placeOnBar('x_monture', true);
        if (P.mounted) { P.dismount(); }
        UI.announce('Nouvelle monture !', 'quest', r.tier === 3 ? `${r.name} — T pour monter, Espace pour s'envoler, X pour descendre` : `${r.name} — touche T pour monter`);
        G.audio?.play('questdone');
        UI.refresh();
        G.saveSoon?.();
      };
      d.appendChild(btn);
      b.appendChild(d);
    }
  },

  // ---------------------------------------------------------------------------
  r_stash(b) {
    const P = G.player;
    b.innerHTML = '';
    b.appendChild(h('div', 'muted', 'Clic droit sur un objet du sac pour le déposer ; clic droit ici pour le reprendre.'));
    const g = h('div', 'grid-slots');
    g.style.marginTop = '8px';
    P.data.stash.forEach((it, j) => {
      const d = this.itemSlot(it, { tip: { hint: 'Clic droit : reprendre' } });
      d.addEventListener('contextmenu', (e) => { e.preventDefault(); Inv.fromStash(j); });
      d.addEventListener('dblclick', () => Inv.fromStash(j));
      g.appendChild(d);
    });
    b.appendChild(g);
  },

  // ---------------------------------------------------------------------------
  discover(hubId) {
    const P = G.player;
    if (!P.data.discovered.includes(hubId)) {
      P.data.discovered.push(hubId);
      UI.notify(`Pierre de voyage découverte : ${HUB_BY_ID[hubId].name}`);
      G.audio?.play('discover');
    }
  },
  travelCost(hub) {
    const P = G.player;
    return Math.max(2, Math.round(Math.hypot(hub.x - P.pos.x, hub.z - P.pos.z) / 18 + P.level));
  },
  r_travel(b) {
    const P = G.player;
    b.innerHTML = '';
    b.style.width = '380px';
    b.appendChild(h('div', 'muted', 'Voyagez instantanément vers une pierre déjà découverte de votre faction.'));
    const here = this.npc?.rec?.hub;
    for (const hub of HUBS) {
      if (hub.faction !== P.faction || !P.data.discovered.includes(hub.id) || hub.id === here) continue;
      const cost = this.travelCost(hub);
      const z = ZONES.find((zz) => zz.id === hub.zone);
      const row = h('div', 'si');
      row.style.cssText = 'display:grid;grid-template-columns:1fr auto;gap:6px;padding:6px 8px;border:1px solid #242b38;margin-top:4px;cursor:pointer;pointer-events:auto';
      row.innerHTML = `<div><div style="font-weight:700">${hub.name}</div><div class="muted" style="font-size:12px">${z.name} — niv. ${z.lvl[0]}${z.lvl[1] !== z.lvl[0] ? '–' + z.lvl[1] : '+'}</div></div><div class="gold num" style="font-weight:700">${cost} po</div>`;
      row.onclick = () => {
        if (P.inCombat()) { UI.error('Impossible en combat.'); return; }
        if (P.data.gold < cost) { UI.error("Vous n'avez pas assez d'or."); return; }
        P.data.gold -= cost;
        this.close('travel'); this.close('npc');
        pillar(P.pos.x, P.pos.y, P.pos.z, '#7fb8ff', 30, 3);
        const S = G.towns.spots[hub.id];
        const t = S.travel || { x: hub.x, z: hub.z };
        P.teleport(t.x, t.z + 1.5);
        pillar(P.pos.x, P.pos.y, P.pos.z, '#7fb8ff', 40, 3);
        G.audio?.play('teleport');
      };
      b.appendChild(row);
    }
    if (b.children.length === 1) b.appendChild(h('div', 'muted', '<br>Aucune autre pierre découverte pour le moment. Explorez le monde !'));
  },

  // ---------------------------------------------------------------------------
  r_trainer(b) {
    const P = G.player;
    b.innerHTML = '';
    b.style.width = '380px';
    const sp = specOf(P);
    b.innerHTML = `<div class="qtext">« Chaque voie a ses secrets. Tu suis celle de <b>${escapeHtml(sp.name)}</b>. Tu peux changer de spécialisation et redistribuer tes talents quand tu veux, hors combat : ouvre ton livre de talents (touche K). »</div>`;
    const btn = h('button', 'btn', 'Ouvrir mes talents');
    btn.style.marginTop = '10px';
    btn.onclick = () => { this.close('trainer'); this.close('npc'); this.open('skills'); };
    b.appendChild(btn);
  },

  r_market(b, opts) { b.innerHTML = ''; b.style.width = 'min(760px, 90vw)'; G.market?.render?.(b, opts); },
};

// Interaction touche F : PNJ ou pierre de voyage la plus proche
UI.interact = () => {
  const P = G.player;
  let best = null, bd = 6.5;
  for (const e of G.world.query(P.pos.x, P.pos.z, 7)) {
    if (e.kind !== 'npc' || e.guard || e.rec?.citizen) continue;
    const d = dist(P, e);
    if (d < bd) { bd = d; best = e; }
  }
  if (best) Win.openNpc(best);
  else if (G.profs?.interact()) { /* récolte, dépeçage ou pêche */ }
  else UI.error("Personne à qui parler ici.");
};
UI.openNpc = (e) => Win.openNpc(e);
