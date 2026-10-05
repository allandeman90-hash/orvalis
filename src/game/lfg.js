// Recherche de groupe : donjons, raids, Abîme sans fin et Intendance (boutique d'emblèmes).
// « Remplir avec l'IA » complète les places libres (tank, soigneur, dégâts) par des compagnons bots.
import { G } from './state.js';
import { DUNGEONS, DUNGEON_BY_ID, INFINITE, AFFIXES, encounterName } from '../data/dungeons.js';
import { MOB_BY_ID } from '../data/mobs.js';
import { CLASSES, ROLE_NAMES } from '../data/classbase.js';
import { SPECS, roleOf, specsForRole, specForRole } from '../data/specs.js';
import { makeGear, makeConsumable, potionFor } from '../data/items.js';
import { makePetStone } from './pets.js';
import { Inv } from './inventory.js';
import { icon } from '../ui/icons.js';
import { fmtTime } from './instance.js';
import { hashStr, R } from '../core/rng.js';
import { clamp, escapeHtml, pick } from '../core/util.js';
import { LINES } from '../data/names.js';

const ROLE_ICON = { tank: 'tank', heal: 'healer', dps: 'dps' };
const THEME_COL = { mine: '#c8872e', swamp: '#6aa05a', crypt: '#8f7bff', ice: '#7fd1ff', fire: '#ff7a2a', sky: '#7fb8ff', abyss: '#ff5a2a', void: '#b58cff' };
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

const SHOP_NAMES = { weapon: 'Arme', offhand: 'Main gauche', head: 'Couvre-chef', chest: 'Plastron', legs: 'Jambières', hands: 'Gants', feet: 'Bottes', ring: 'Anneau', amulet: 'Amulette' };
const SHOP = [
  { id: 'weapon', slot: 'weapon', cost: 28 }, { id: 'offhand', slot: 'offhand', cost: 18 }, { id: 'head', slot: 'head', cost: 16 },
  { id: 'chest', slot: 'chest', cost: 22 }, { id: 'legs', slot: 'legs', cost: 20 }, { id: 'hands', slot: 'hands', cost: 14 },
  { id: 'feet', slot: 'feet', cost: 14 }, { id: 'ring', slot: 'ring', cost: 18 }, { id: 'amulet', slot: 'amulet', cost: 20 },
  { id: 'pet', name: "Pierre d'âme des profondeurs", desc: "Un familier épique au hasard parmi les boss de donjon.", icon: 'i_petstone', cost: 60 },
  { id: 'heart', name: 'Cœur runique', desc: 'Matériau rare pour les améliorations +7 et au-delà.', icon: 'i_gem', cost: 6 },
  { id: 'shards', name: 'Éclats runiques ×10', desc: "Matériau d'amélioration du forgeron.", icon: 'i_shard', cost: 4 },
  { id: 'bag', name: 'Sacoche renforcée', desc: '8 emplacements de sac supplémentaires (max. 3).', icon: 'i_bag', cost: 25 },
  { id: 'potions', name: 'Potions de soin ×5', desc: 'Adaptées à votre niveau.', icon: 'i_potion_red', cost: 2 },
];

export const LFG = {
  tab: 'dungeon',
  sel: { dungeon: 'meche', raid: 'tempetes' },
  diff: 'normal',
  fill: true,
  startFloor: 1,
  busy: false,

  init() {
    G.lfg = this;
    const P = G.player;
    if (P) { const d = DUNGEONS.filter((x) => x.kind === 'dungeon').find((x) => P.level >= x.lvl[0] - 1 && P.level <= x.lvl[1] + 1); if (d) this.sel.dungeon = d.id; }
  },

  // ---------------------------------------------------------------------------
  renderWindow(b, opts = {}) {
    const P = G.player;
    if (!P) return;
    if (opts.tab) this.tab = opts.tab;
    b.innerHTML = '';
    b.style.width = 'min(760px, 94vw)';
    const A = G.inst?.active;
    if (A) { this.renderCurrent(b, A); return; }
    const tabs = h('div', 'tabs2');
    for (const [id, name] of [['dungeon', 'Donjons'], ['raid', 'Raids'], ['abyss', 'Abîme sans fin'], ['shop', 'Intendance']]) {
      const t = h('button', id === this.tab ? 'on' : '', name);
      t.onclick = () => { this.tab = id; G.win.open('lfg'); };
      tabs.appendChild(t);
    }
    b.appendChild(tabs);
    if (this.tab === 'shop') this.renderShop(b);
    else if (this.tab === 'abyss') this.renderAbyss(b);
    else this.renderList(b, this.tab);
  },

  renderCurrent(b, A) {
    const d = h('div', 'lfg-cur');
    d.innerHTML = `<h3>${escapeHtml(A.zone.name)}</h3><div class="muted">${escapeHtml(A.kindName)} · niveau ${A.base} · ${fmtTime(G.time - A.startT)}</div>
      <div class="qtext" style="margin-top:8px">Boss vaincus : ${A.encounters.filter((e) => e.state === 'done').length} / ${A.encounters.length} · Monstres : ${A.kills} / ${A.total}</div>`;
    const btn = h('button', 'btn', A.kind === 'infinite' ? 'Remonter à la surface' : 'Quitter l\'instance');
    btn.onclick = () => { G.win.close('lfg'); if (A.kind === 'infinite') G.inst.endRun(); else G.inst.leave(); };
    d.appendChild(btn);
    b.appendChild(d);
  },

  // ---------------------------------------------------------------------------
  // Donjons et raids
  renderList(b, kind) {
    const P = G.player;
    const list = DUNGEONS.filter((x) => x.kind === kind);
    if (!list.find((x) => x.id === this.sel[kind])) this.sel[kind] = list[0].id;
    const def = DUNGEON_BY_ID[this.sel[kind]];
    const wrap = h('div', 'lfg');
    const col = h('div', 'lfg-list');
    for (const x of list) {
      const low = P.level < this.minLevel(x);
      const st = G.player.data.inst?.[x.id];
      const card = h('div', 'lfg-card' + (x.id === def.id ? ' on' : '') + (low ? ' low' : ''));
      card.style.setProperty('--th', THEME_COL[x.theme] || '#d9a441');
      card.innerHTML = `<img alt="" src="${icon(kind === 'raid' ? 'raid' : 'dungeon', THEME_COL[x.theme] || '#556')}"><div><div class="nm">${escapeHtml(x.short)}</div><div class="lv">Niv. ${x.lvl[0]}${x.lvl[1] !== x.lvl[0] ? '–' + x.lvl[1] : ''}${st?.n ? ` · ✔ ${st.n}` : ''}</div></div>`;
      card.onclick = () => { this.sel[kind] = x.id; G.win.open('lfg'); };
      col.appendChild(card);
    }
    wrap.appendChild(col);
    wrap.appendChild(this.detail(def));
    b.appendChild(wrap);
  },

  minLevel(def) { return def.kind === 'raid' ? 28 : Math.max(1, def.lvl[0] - 1); },

  detail(def) {
    const P = G.player;
    const raid = def.kind === 'raid';
    const size = raid ? 10 : 5;
    const d = h('div', 'lfg-det');
    d.style.setProperty('--th', THEME_COL[def.theme] || '#d9a441');
    const low = P.level < this.minLevel(def);
    // héroïque : niveau max du donjon ; pour un raid, l'avoir terminé une fois en normal
    const heroOk = raid ? !!P.data.inst?.[def.id]?.n : P.level >= def.lvl[1];
    if (!heroOk && this.diff === 'heroic') this.diff = 'normal';
    const st = P.data.inst?.[def.id + (this.diff === 'heroic' ? '_h' : '')];
    const bosses = def.bosses.map((grp) => grp.length > 1 ? `${encounterName(grp, MOB_BY_ID)} (${grp.length})` : MOB_BY_ID[grp[0]].name);
    d.innerHTML = `<div class="ttl">${escapeHtml(def.name)}</div>
      <div class="meta">${raid ? 'Raid — 10 joueurs' : 'Donjon — 5 joueurs'} · niveaux ${def.lvl[0]}${def.lvl[1] !== def.lvl[0] ? '–' + def.lvl[1] : '+'}${st?.best ? ` · meilleur temps ${fmtTime(st.best)}` : ''}</div>
      <div class="desc">${escapeHtml(def.desc)}</div>
      <div class="bosses">${bosses.map((n) => `<span><img alt="" src="${icon('skull', '#5a2a2a')}">${escapeHtml(n)}</span>`).join('')}</div>`;
    {
      const dr = h('div', 'diff');
      for (const [id, name, ok] of [['normal', 'Normal', true], ['heroic', 'Héroïque', heroOk]]) {
        const bt = h('button', 'btn small' + (this.diff === id ? '' : ' ghost'), name);
        if (!ok) { bt.disabled = true; bt.title = raid ? 'Terminez ce raid en normal pour débloquer' : `Niveau ${def.lvl[1]} requis`; }
        bt.onclick = () => { this.diff = id; G.win.open('lfg'); };
        dr.appendChild(bt);
      }
      const note = h('span', 'muted', this.diff === 'heroic' ? (raid ? 'Boss plus robustes et enragés plus tôt. Ensemble héroïque exclusif.' : 'Monstres de votre niveau +2, plus robustes. Meilleur butin, plus d\'emblèmes.') : '');
      dr.appendChild(note);
      d.appendChild(dr);
    }
    d.appendChild(this.slots(size));
    d.appendChild(this.fillRow(size));
    const go = h('button', 'btn go', low ? `Niveau ${this.minLevel(def)} requis` : raid ? 'Entrer dans le raid' : 'Entrer dans le donjon');
    go.disabled = low || this.busy;
    go.onclick = () => this.start(def.id, { diff: this.diff, size });
    d.appendChild(go);
    return d;
  },

  // aperçu des places du groupe (rôles)
  slots(size) {
    const P = G.player;
    const members = G.party?.members?.length ? G.party.members : [P];
    const need = this.composition(size);
    const box = h('div', 'rslots' + (size > 5 ? ' raid' : ''));
    const byRole = { tank: [], heal: [], dps: [] };
    for (const m of members) byRole[roleOf(m)].push(m);
    for (const role of ['tank', 'heal', 'dps']) {
      const want = need.base[role];
      const have = byRole[role];
      const n = Math.max(want, have.length);
      for (let i = 0; i < n; i++) {
        const m = have[i];
        const s = h('div', 'rslot' + (m ? ' full' : ''));
        const sp = m && SPECS[m.spec];
        s.innerHTML = `<img alt="" src="${icon(ROLE_ICON[role], role === 'tank' ? '#2a4a8a' : role === 'heal' ? '#2a6a3a' : '#7a2a2a')}"><span>${m ? `<b style="color:${CLASSES[m.cls]?.color}">${escapeHtml(m.name)}</b>${m === P ? ' (vous)' : m.kind === 'remote' ? ' ◆' : ''}${sp ? ` <span class="muted">${escapeHtml(sp.name)}</span>` : ''}` : `<i>${ROLE_NAMES[role]} — place libre</i>`}</span>`;
        box.appendChild(s);
      }
    }
    return box;
  },

  fillRow(size) {
    const row = h('label', 'fill');
    const members = G.party?.members?.length || 1;
    const remotes = G.net ? [...G.net.remotes.values()].filter((r) => r.faction === G.player.faction).length : 0;
    row.innerHTML = `<input type="checkbox" ${this.fill ? 'checked' : ''}><span><b>Remplir avec l'IA</b> — les ${Math.max(0, size - members)} place(s) libre(s) sont prises par des compagnons bots (tank, soigneur, dégâts).
      <span class="muted">${remotes ? `${remotes} vrai(s) joueur(s) de votre faction en ligne : invitez-les d'abord depuis le panneau Groupe (P).` : 'Aucun autre vrai joueur de votre faction en ligne pour le moment.'}</span></span>`;
    row.querySelector('input').onchange = (e) => { this.fill = e.target.checked; };
    return row;
  },

  // rôles à pourvoir
  composition(size) {
    const P = G.player;
    const base = size > 5 ? { tank: 2, heal: 3, dps: 5 } : { tank: 1, heal: 1, dps: 3 };
    const left = { ...base };
    const members = G.party?.members?.length ? G.party.members : [P];
    for (const m of members) left[roleOf(m)]--;
    const list = [];
    for (const role of ['tank', 'heal', 'dps']) for (let i = 0; i < left[role]; i++) list.push(role);
    while (list.length + members.length > size) list.pop();
    while (list.length + members.length < size) list.push('dps');
    return { base, list };
  },

  // ---------------------------------------------------------------------------
  // Lancement : recherche, remplissage, confirmation
  start(id, o) {
    const P = G.player;
    if (this.busy) return;
    if (P.dead) { G.ui.error('Vous êtes mort.'); return; }
    if (P.inCombat()) { G.ui.error('Impossible en combat.'); return; }
    const def = id === INFINITE.id ? INFINITE : DUNGEON_BY_ID[id];
    const size = o.size || (def.kind === 'raid' ? 10 : 5);
    G.party?.ensure();
    if (size > 5) G.party.raid = true;
    const add = this.fill ? this.composition(size).list : [];
    const lvl = def.kind === 'raid' ? Math.max(30, P.level) : def.kind === 'infinite' ? clamp(P.level, 10, 30) : o.diff === 'heroic' ? P.level : clamp(P.level, def.lvl[0], Math.max(def.lvl[1], def.lvl[0]));
    const gearQ = def.kind === 'raid' ? (o.diff === 'heroic' ? 90 : 82) : o.diff === 'heroic' ? 74 : def.kind === 'infinite' ? 64 : 58;
    const recs = this.pickCompanions(add, lvl, gearQ);
    this.busy = true;
    G.win.close('lfg');
    const label = def.kind === 'infinite' ? `${def.name} (étage ${o.floor || 1})` : def.name + (o.diff === 'heroic' ? ' (héroïque)' : '');
    if (!recs.length) { this.busy = false; this.confirm(def, label, o); return; }
    G.ui.notify(`Recherche de groupe : ${label}…`);
    G.audio?.play('open');
    let k = 0;
    const step = () => {
      if (!G.player || G.player !== P) { this.busy = false; return; }
      const r = recs[k++];
      if (r) {
        if (!r.party) {
          if (Math.hypot(r.x - P.pos.x, r.z - P.pos.z) > 40) { r.x = P.pos.x + (R() - 0.5) * 8; r.z = P.pos.z + (R() - 0.5) * 8; }
          r.lfg = true;
          if (G.party.addBot(r)) { if (R() < 0.5) setTimeout(() => r.ent && G.chat?.say(r.ent, 'grp', pick(R, LINES.group || ['Salut !'])), 300); pillarAt(r); }
        }
        setTimeout(step, 350 + R() * 450);
      } else {
        this.busy = false;
        this.confirm(def, label, o);
      }
    };
    setTimeout(step, 700);
  },

  confirm(def, label, o) {
    const n = G.party?.members?.length || 1;
    const roles = { tank: 0, heal: 0, dps: 0 };
    for (const m of G.party?.members?.length ? G.party.members : [G.player]) roles[roleOf(m)]++;
    G.audio?.play('quest');
    G.ui.ask(`<b>Votre groupe est prêt !</b><br>${escapeHtml(label)}<br><span class="muted">${n} joueur${n > 1 ? 's' : ''} : ${roles.tank} tank${roles.tank > 1 ? 's' : ''}, ${roles.heal} soigneur${roles.heal > 1 ? 's' : ''}, ${roles.dps} dégâts</span>`, () => {
      if (G.player.inCombat()) { G.ui.error('Impossible en combat.'); return; }
      G.inst.go(def.id, { diff: o.diff, floor: o.floor });
    }, () => { G.ui.notify('Entrée annulée. Votre groupe reste formé.'); }, 'Entrer', 'Plus tard', 60);
  },

  pickCompanions(roles, lvl, gearQ) {
    const P = G.player;
    const out = [];
    const usedCls = new Set((G.party?.members || []).map((m) => m.cls));
    for (const role of roles) {
      // classes capables de tenir ce rôle (via l'une de leurs spécialisations)
      const pairs = specsForRole(role);
      const classes = [...new Set(pairs.map((p) => p[0]))];
      // d'abord de vrais habitants du royaume (bots en ligne de votre niveau), sinon un compagnon de passage
      let r = G.bots.recs.find((x) => x.online && !x.party && !x.temp && !out.includes(x) && x.faction === P.faction && classes.includes(x.cls) && Math.abs(x.level - lvl) <= 2 && !usedCls.has(x.cls));
      if (!r) r = G.bots.recs.find((x) => x.online && !x.party && !x.temp && !out.includes(x) && x.faction === P.faction && classes.includes(x.cls) && Math.abs(x.level - lvl) <= 2);
      if (!r) {
        const free = pairs.filter((p) => !usedCls.has(p[0]));
        const [cls, spec] = (free.length ? free : pairs)[Math.floor(R() * (free.length || pairs.length))];
        r = G.bots.makeTemp({ cls, spec, level: lvl, faction: P.faction, gearQ: gearQ + Math.round((R() - 0.5) * 10) });
      } else {
        // le compagnon adopte la spécialisation du rôle demandé
        const want = specForRole(r.cls, role);
        if (want && SPECS[r.spec]?.role !== role) { r.spec = want; if (r.ent) { r.ent.buildSkills(); r.ent.recalc(); } }
      }
      usedCls.add(r.cls);
      out.push(r);
    }
    return out;
  },

  // ---------------------------------------------------------------------------
  // Abîme sans fin
  renderAbyss(b) {
    const P = G.player;
    const ab = P.data.abyss || { best: 0, runs: 0 };
    const wrap = h('div', 'lfg abyss');
    const d = h('div', 'lfg-det');
    d.style.setProperty('--th', '#b58cff');
    const low = P.level < 10;
    d.innerHTML = `<div class="ttl">${escapeHtml(INFINITE.name)}</div>
      <div class="meta">Groupe de 5 · à partir du niveau 10 · record : étage ${ab.best || 0}${ab.runs ? ` · ${ab.runs} descente${ab.runs > 1 ? 's' : ''}` : ''}</div>
      <div class="desc">${escapeHtml(INFINITE.desc)} Si tout le groupe tombe en même temps, la descente s'arrête.</div>`;
    const fr = h('div', 'diff');
    const starts = [1];
    for (let f = 6; f <= (ab.best || 0) + 1; f += 5) starts.push(f);
    if (!starts.includes(this.startFloor)) this.startFloor = 1;
    fr.appendChild(h('span', '', 'Départ :'));
    for (const f of starts) {
      const bt = h('button', 'btn small' + (this.startFloor === f ? '' : ' ghost'), `Étage ${f}`);
      bt.onclick = () => { this.startFloor = f; G.win.open('lfg'); };
      fr.appendChild(bt);
    }
    d.appendChild(fr);
    d.appendChild(this.slots(5));
    d.appendChild(this.fillRow(5));
    const go = h('button', 'btn go', low ? 'Niveau 10 requis' : 'Descendre dans l\'Abîme');
    go.disabled = low || this.busy;
    go.onclick = () => this.start(INFINITE.id, { floor: this.startFloor, size: 5 });
    d.appendChild(go);
    const aff = h('details', 'affs');
    aff.innerHTML = `<summary>Affixes et progression</summary>${Object.values(AFFIXES).map((a) => `<div><b>${escapeHtml(a.name)}</b> <span class="muted">${escapeHtml(a.desc)}</span></div>`).join('')}
      <div class="muted" style="font-size:12.5px">1 affixe dès l'étage 3, 2 dès l'étage 8, 3 dès l'étage 15. Chaque étage : +8 % de vie et +4,5 % de dégâts pour les monstres. Un gardien tous les 5 étages.</div>`;
    d.appendChild(aff);
    wrap.appendChild(d);
    // classement
    const lb = h('div', 'lfg-lb');
    lb.innerHTML = '<h3>Classement de l\'Abîme</h3>';
    const list = G.bots.recs.filter((r) => r.level >= 10 && !r.temp).map((r) => ({ name: r.name, cls: r.cls, best: Math.max(1, Math.floor((r.level - 8) / 2.2 + (hashStr(r.name) % 9) - 1)) }));
    list.push({ name: P.name, cls: P.cls, best: ab.best || 0, me: true });
    list.sort((a, c) => c.best - a.best);
    const me = list.findIndex((e) => e.me);
    const rows = list.slice(0, 12);
    if (me >= 12) rows.push(list[me]);
    for (const e of rows) {
      const i = list.indexOf(e);
      const r = h('div', 'lb-row' + (e.me ? ' me' : ''));
      r.innerHTML = `<span class="rk num">${i + 1}</span><span style="color:${CLASSES[e.cls].color}">${escapeHtml(e.name)}</span><span class="num">étage ${e.best}</span>`;
      lb.appendChild(r);
    }
    wrap.appendChild(lb);
    b.appendChild(wrap);
  },

  // ---------------------------------------------------------------------------
  // Intendance : échange d'emblèmes
  renderShop(b) {
    const P = G.player;
    const have = P.countItem('emblem');
    const ilvl = Math.min(34, Math.max(10, P.level) + 2);
    const top = h('div', 'shop-top');
    top.innerHTML = `<img alt="" src="${icon('i_emblem', '#b86bff')}"><div><b>${have}</b> Emblème${have > 1 ? 's' : ''} de bravoure<div class="muted" style="font-size:12.5px">Gagnés sur chaque boss de donjon, de raid et de l'Abîme. Équipement épique de niveau d'objet ${ilvl} (adapté à votre classe).</div></div>`;
    b.appendChild(top);
    const grid = h('div', 'shop');
    for (const o of SHOP) {
      if (o.slot === 'offhand' && P.cls === 'archer') continue;
      const gear = !!o.slot;
      const name = gear ? `${SHOP_NAMES[o.slot]} ${['legs', 'hands', 'feet'].includes(o.slot) ? 'épiques' : 'épique'}` : o.name;
      const desc = gear ? `Épique · niveau d'objet ${ilvl}` : o.desc;
      const row = h('div', 'offer');
      row.innerHTML = `<img alt="" src="${icon(gear ? ({ weapon: 'i_sword', offhand: 'i_shield', head: 'i_helm', chest: 'i_chest', legs: 'i_legs', hands: 'i_gloves', feet: 'i_boots', ring: 'i_ring', amulet: 'i_amulet' })[o.slot] || 'i_chest' : o.icon, '#b86bff')}"><div class="t"><b>${escapeHtml(name)}</b><div class="muted">${escapeHtml(desc)}</div></div>`;
      const bt = h('button', 'btn small', `${o.cost} ◆`);
      bt.disabled = have < o.cost;
      bt.onclick = () => this.buy(o, ilvl);
      row.appendChild(bt);
      grid.appendChild(row);
    }
    b.appendChild(grid);
  },

  buy(o, ilvl) {
    const P = G.player;
    if (P.countItem('emblem') < o.cost) { G.ui.error("Pas assez d'emblèmes."); return; }
    if (Inv.freeSlots() < 1) { G.ui.error('Votre sac est plein !'); return; }
    let item;
    if (o.slot) item = makeGear({ slot: o.slot, cls: P.cls, ilvl, quality: 86 + Math.floor(R() * 11) });
    else if (o.id === 'pet') {
      const ids = DUNGEONS.filter((d) => d.kind === 'dungeon').flatMap((d) => d.bosses.flat());
      item = makePetStone(ids[Math.floor(R() * ids.length)], 2, 55 + Math.floor(R() * 46));
    } else if (o.id === 'heart') item = makeConsumable('shard_big', 1);
    else if (o.id === 'shards') item = makeConsumable('shard', 10);
    else if (o.id === 'bag') item = makeConsumable('bag_scroll', 1);
    else if (o.id === 'potions') item = makeConsumable(potionFor(P.level, 'hp'), 5);
    if (!item) return;
    Inv.removeWhere((it) => it.cid === 'emblem', o.cost);
    Inv.add(item);
    G.audio?.play('coin');
    G.win.open('lfg');
  },
};

function pillarAt(r) {
  const e = r.ent;
  if (!e) return;
  import('./fx.js').then((fx) => fx.pillar(e.pos.x, e.pos.y, e.pos.z, '#9fe8ff', 18, 2.2));
}
