// Sac, équipement, coffre, vente et recyclage.
import { G } from './state.js';
import { CONSUMABLES, gearStats, SLOT_NAMES, RARITY } from '../data/items.js';
import { CLASSES } from '../data/classbase.js';

export const Inv = {
  get d() { return G.player.data; },

  freeSlots() {
    return this.d.bag.filter((x) => !x).length;
  },

  // ajoute un objet (empilement automatique). Retourne vrai si tout a été rangé.
  add(item, silent = false) {
    const bag = this.d.bag;
    if (item.stack && item.stack > 1) {
      for (const it of bag) {
        if (!it || it.stack <= 1) continue;
        const same = (it.cid && it.cid === item.cid) || (it.qid && it.qid === item.qid);
        if (same && it.count < it.stack) {
          const n = Math.min(item.count, it.stack - it.count);
          it.count += n; item.count -= n;
          if (item.count <= 0) break;
        }
      }
      if (item.count <= 0) { if (!silent) this.notifyLoot(item, true); G.ui?.refresh?.(); return true; }
    }
    const i = bag.findIndex((x) => !x);
    if (i < 0) { G.ui?.error('Votre sac est plein !'); return false; }
    bag[i] = item;
    if (!silent) this.notifyLoot(item);
    G.ui?.refresh?.();
    return true;
  },

  notifyLoot(item) {
    G.ui?.lootMsg?.(item);
  },

  count(pred) {
    let n = 0;
    for (const it of this.d.bag) if (it && pred(it)) n += it.count || 1;
    return n;
  },

  removeWhere(pred, n) {
    for (let i = 0; i < this.d.bag.length && n > 0; i++) {
      const it = this.d.bag[i];
      if (!it || !pred(it)) continue;
      const take = Math.min(n, it.count || 1);
      it.count = (it.count || 1) - take;
      n -= take;
      if (it.count <= 0) this.d.bag[i] = null;
    }
    G.ui?.refresh?.();
    return n <= 0;
  },

  canEquip(it) {
    const P = G.player;
    if (it.type !== 'gear') return 'Cet objet ne peut pas être équipé.';
    if (it.cls && it.cls !== P.cls) return `Réservé : ${CLASSES[it.cls].name}.`;
    if ((it.req || 1) > P.level) return `Niveau ${it.req} requis.`;
    return null;
  },

  equip(idx) {
    const it = this.d.bag[idx];
    if (!it) return;
    const err = this.canEquip(it);
    if (err) { G.ui?.error(err); return; }
    const old = this.d.equip[it.slot] || null;
    this.d.equip[it.slot] = it;
    this.d.bag[idx] = old;
    G.player.refreshGear(true);
    G.audio?.play('equip');
    G.ui?.refresh?.();
    G.saveSoon?.();
  },

  unequip(slot) {
    const it = this.d.equip[slot];
    if (!it) return;
    const i = this.d.bag.findIndex((x) => !x);
    if (i < 0) { G.ui?.error('Votre sac est plein !'); return; }
    this.d.bag[i] = it;
    delete this.d.equip[slot];
    G.player.refreshGear(true);
    G.audio?.play('equip');
    G.ui?.refresh?.();
  },

  swap(a, b) {
    const bag = this.d.bag;
    [bag[a], bag[b]] = [bag[b], bag[a]];
    G.ui?.refresh?.();
  },

  sellPrice(it) {
    if (!it || it.type === 'quest') return 0;
    return Math.max(1, Math.round((it.value || 1) * (it.upg ? 1 + it.upg * 0.25 : 1))) * (it.count || 1);
  },

  // les runes serties retournent dans la sacoche avant de se séparer d'un objet
  freeRunes(it) {
    if (!it?.runes) return 0;
    let n = 0;
    it.runes.forEach((r, i) => { if (r) { G.runes?.add(r.t, r.l, 1, { silent: true }); it.runes[i] = null; n++; } });
    if (n) G.ui?.notify(`${n} rune${n > 1 ? 's' : ''} récupérée${n > 1 ? 's' : ''} dans la sacoche.`);
    return n;
  },

  sell(idx) {
    const it = this.d.bag[idx];
    if (!it) return;
    if (it.type === 'quest') { G.ui?.error('Les objets de quête ne se vendent pas.'); return; }
    this.freeRunes(it);
    const p = this.sellPrice(it);
    this.d.gold += p;
    this.d.bag[idx] = null;
    this.d.buyback = [it, ...(this.d.buyback || [])].slice(0, 8);
    G.audio?.play('coin');
    G.ui?.notify(`Vendu : ${it.name} pour ${p} po`);
    G.ui?.refresh?.();
  },

  // recyclage d'équipement en éclats runiques
  salvageYield(it) {
    if (!it || it.type !== 'gear') return 0;
    return Math.max(1, Math.round((1 + it.rarity * 1.5) * (0.6 + it.ilvl / 12)));
  },

  junkAll() {
    let total = 0, n = 0;
    for (let i = 0; i < this.d.bag.length; i++) {
      const it = this.d.bag[i];
      if (it && it.type === 'gear' && it.rarity === 0 && !it.locked) { this.freeRunes(it); total += this.sellPrice(it); this.d.bag[i] = null; n++; }
    }
    if (n) { this.d.gold += total; G.audio?.play('coin'); G.ui?.notify(`${n} objet(s) commun(s) vendu(s) pour ${total} po`); }
    G.ui?.refresh?.();
    return n;
  },

  sort() {
    const order = { gear: 0, potion: 1, food: 2, mat: 3, bagup: 4, quest: 5 };
    const items = this.d.bag.filter(Boolean);
    items.sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9) || (b.rarity || 0) - (a.rarity || 0) || (b.ilvl || 0) - (a.ilvl || 0) || a.name.localeCompare(b.name));
    for (let i = 0; i < this.d.bag.length; i++) this.d.bag[i] = items[i] || null;
    G.ui?.refresh?.();
  },

  toStash(idx) {
    const it = this.d.bag[idx];
    if (!it) return;
    const j = this.d.stash.findIndex((x) => !x);
    if (j < 0) { G.ui?.error('Le coffre est plein.'); return; }
    this.d.stash[j] = it; this.d.bag[idx] = null;
    G.ui?.refresh?.();
  },
  fromStash(j) {
    const it = this.d.stash[j];
    if (!it) return;
    const i = this.d.bag.findIndex((x) => !x);
    if (i < 0) { G.ui?.error('Votre sac est plein !'); return; }
    this.d.bag[i] = it; this.d.stash[j] = null;
    G.ui?.refresh?.();
  },
};
