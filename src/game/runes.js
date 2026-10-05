// Runes : sacoche à runes (illimitée), fusion 3 → 1, sertissage et retrait, butin sur les monstres.
import { G } from './state.js';
import { RUNE_TYPES, RUNE_LIST, runeKey, parseRuneKey, runeName, runeBonusText, runeValue } from '../data/runes.js';
import { ensureSockets } from '../data/items.js';
import { CLASSES } from '../data/classbase.js';
import { R } from '../core/rng.js';

// Données du personnage : d.runes = { 'str:1': 4, 'crit:3': 1, ... } ; migration des objets existants
export function ensureRuneData(d) {
  if (!d.runes || typeof d.runes !== 'object' || Array.isArray(d.runes)) d.runes = {};
  for (const k in d.equip || {}) ensureSockets(d.equip[k]);
  for (const it of d.bag || []) ensureSockets(it);
  for (const it of d.stash || []) ensureSockets(it);
  for (const it of d.buyback || []) ensureSockets(it);
  d.runeStats ||= { fused: 0, best: 0, found: 0 };
}

export const Runes = {
  get d() { return G.player?.data; },

  count(t, l) { return this.d?.runes[runeKey(t, l)] || 0; },
  total() { let n = 0; const r = this.d?.runes || {}; for (const k in r) n += r[k]; return n; },
  // liste triée : type (ordre fixe), puis niveau décroissant
  list() {
    const out = [];
    const r = this.d?.runes || {};
    for (const k in r) { if (r[k] > 0) { const { t, l } = parseRuneKey(k); if (RUNE_TYPES[t]) out.push({ t, l, n: r[k] }); } }
    out.sort((a, b) => RUNE_LIST.indexOf(a.t) - RUNE_LIST.indexOf(b.t) || b.l - a.l);
    return out;
  },
  maxLevel() { let m = 0; for (const x of this.list()) m = Math.max(m, x.l); return m; },

  add(t, l, n = 1, o = {}) {
    const d = this.d;
    if (!d || !RUNE_TYPES[t] || n <= 0) return;
    const k = runeKey(t, l);
    d.runes[k] = (d.runes[k] || 0) + n;
    d.runeStats.best = Math.max(d.runeStats.best || 0, l);
    if (o.found) d.runeStats.found = (d.runeStats.found || 0) + n;
    if (!o.silent) {
      G.ui?.runeMsg?.(t, l, n);
      G.ui?.setMenuDot?.('runes', true);
    }
    G.ui?.refresh?.();
  },
  take(t, l, n = 1) {
    const d = this.d;
    const k = runeKey(t, l);
    if (!d || (d.runes[k] || 0) < n) return false;
    d.runes[k] -= n;
    if (d.runes[k] <= 0) delete d.runes[k];
    return true;
  },

  // chance de conserver une rune pendant une fusion (atout du Runiste)
  keepChance() { return G.profs?.mod?.('runeKeep') || 0; },

  // une fusion : 3 runes identiques -> 1 rune du niveau suivant
  fuse(t, l, silent = false) {
    if (this.count(t, l) < 3) return false;
    this.take(t, l, 3);
    let kept = 0;
    if (R() < this.keepChance()) { this.add(t, l, 1, { silent: true }); kept = 1; }
    this.add(t, l + 1, 1, { silent: true });
    const d = this.d;
    d.runeStats.fused = (d.runeStats.fused || 0) + 1;
    if (!silent) {
      G.ui?.notify(`Fusion : ${runeName(t, l + 1)} (${runeBonusText(t, l + 1)})${kept ? ' — une rune conservée !' : ''}`);
      G.audio?.play('learn');
    }
    G.saveSoon?.();
    return { kept };
  },
  // fusionne en cascade tout ce qui peut l'être (un type, ou tous)
  fuseAll(type = null) {
    let n = 0, kept = 0, top = null;
    for (let guard = 0; guard < 100000; guard++) {
      const c = this.list().filter((x) => (!type || x.t === type) && x.n >= 3).sort((a, b) => a.l - b.l)[0];
      if (!c) break;
      const times = Math.floor(c.n / 3);
      for (let i = 0; i < times; i++) {
        const r = this.fuse(c.t, c.l, true);
        if (!r) break;
        n++; kept += r.kept;
        if (!top || c.l + 1 > top.l) top = { t: c.t, l: c.l + 1 };
      }
    }
    if (n) {
      G.ui?.notify(`${n} fusion${n > 1 ? 's' : ''}${top ? ` — meilleure rune : ${runeName(top.t, top.l)}` : ''}${kept ? ` — ${kept} rune${kept > 1 ? 's' : ''} conservée${kept > 1 ? 's' : ''}` : ''}`);
      G.audio?.play('learn');
      G.saveSoon?.();
    }
    return n;
  },

  // --- sertissage
  // ref : { eq: 'weapon' } (objet porté) ou { bag: 3 } (objet du sac)
  itemAt(ref) {
    const d = this.d;
    if (!d || !ref) return null;
    if (ref.eq) return d.equip[ref.eq] || null;
    if (ref.bag !== undefined) return d.bag[ref.bag] || null;
    return null;
  },
  socket(ref, idx, t, l) {
    const it = ensureSockets(this.itemAt(ref));
    if (!it || it.type !== 'gear') return false;
    if (idx < 0 || idx >= it.sockets) return false;
    if (!this.take(t, l, 1)) { G.ui?.error("Vous n'avez pas cette rune."); return false; }
    const old = it.runes[idx];
    if (old) this.add(old.t, old.l, 1, { silent: true });
    it.runes[idx] = { t, l };
    this.afterChange(ref);
    G.audio?.play('equip');
    G.ui?.notify(`${runeName(t, l)} sertie : ${runeBonusText(t, l)}`);
    return true;
  },
  unsocket(ref, idx) {
    const it = this.itemAt(ref);
    if (!it || !it.runes?.[idx]) return false;
    const r = it.runes[idx];
    it.runes[idx] = null;
    this.add(r.t, r.l, 1, { silent: true });
    this.afterChange(ref);
    G.audio?.play('equip');
    G.ui?.notify(`${runeName(r.t, r.l)} retirée et rangée dans la sacoche.`);
    return true;
  },
  // retire toutes les runes d'un objet (avant de le vendre, par exemple)
  unsocketAll(ref) {
    const it = this.itemAt(ref);
    if (!it?.runes) return 0;
    let n = 0;
    it.runes.forEach((r, i) => { if (r) { this.add(r.t, r.l, 1, { silent: true }); it.runes[i] = null; n++; } });
    if (n) this.afterChange(ref);
    return n;
  },
  afterChange(ref) {
    if (ref.eq) G.player?.refreshGear(false);
    G.ui?.refresh?.();
    G.saveSoon?.();
  },

  // --- butin
  // type tiré au sort : la statistique principale de la classe est un peu plus fréquente
  rollType() {
    const P = G.player;
    const main = P ? CLASSES[P.cls]?.primary : null;
    const pool = RUNE_LIST.map((t) => [t, t === main ? 2 : t === 'fortune' ? 0.7 : 1]);
    let tot = 0; for (const [, w] of pool) tot += w;
    let r = R() * tot;
    for (const [t, w] of pool) { r -= w; if (r <= 0) return t; }
    return pool[0][0];
  },
  // niveau selon le niveau du monstre (1 au début, jusqu'à 4-6 sur les boss de raid)
  rollLevel(mobLevel, bonus = 0) {
    const top = 1 + Math.floor((mobLevel || 1) / 10) + bonus;
    let l = 1;
    while (l < top && R() < 0.34) l++;
    return l;
  },
  dropFromMob(m, mult = 1) {
    if (!m || m.passive || m.kind !== 'mob') return;
    const d = m.def || {};
    const fortune = (G.player?.stats?.fortune || 0) / 100;
    const findK = 1 + (G.profs?.mod?.('runeFind') || 0) + fortune * 0.5;
    let n = 0, bonus = 0;
    if (d.raidBoss) { n = 3 + Math.floor(R() * 3); bonus = 2; }
    else if (d.dungeonBoss || m.boss) { n = 1 + Math.floor(R() * 2); bonus = 1; }
    else if (m.elite || m.named) { n = R() < 0.4 * findK * mult ? 1 : 0; bonus = 1; }
    else n = R() < 0.06 * findK * mult ? 1 : 0;
    if (m.worldBoss) { n = 4; bonus = 2; }
    for (let i = 0; i < n; i++) this.add(this.rollType(), this.rollLevel(m.level, bonus), 1, { found: true });
  },

  // valeur d'une rune (pour l'interface)
  value(t, l) { return runeValue(t, l); },
};
