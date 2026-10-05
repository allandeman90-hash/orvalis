// Système de quêtes : disponibilité, acceptation, progression, récompenses, suivi et marqueurs.
import { G } from './state.js';
import { QUESTS, QUEST_BY_ID, questXp, questGold, resolveNpc } from '../data/quests.js';
import { MOB_BY_ID, QUEST_ITEMS } from '../data/mobs.js';
import { LANDMARK_BY_ID, ZONE_BY_ID } from '../data/zones.js';
import { NpcManager } from './npc.js';
import { Inv } from './inventory.js';
import { makeGear, makeConsumable, makeQuestItem, rollQuality, SLOTS } from '../data/items.js';
import { zoneAt } from '../world/terrain.js';
import { escapeHtml } from '../core/util.js';
import { R } from '../core/rng.js';
import { aName } from '../data/lore.js';

const MAX_ACTIVE = 20;
// petite loupe (bouton de guidage)
export const LOUPE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.3" fill="rgba(255,236,170,.18)" stroke="currentColor" stroke-width="2.6"/><path d="M14.8 14.8 L21 21" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>';

export const Quests = {
  mobAreas: {},

  init() {
    // zones d'apparition par type de monstre (pour le suivi)
    const groups = {};
    for (const s of G.world.spawns) {
      const k = s.mob + '|' + (s.group || s.id);
      (groups[k] ||= { mob: s.mob, pts: [] }).pts.push(s);
    }
    for (const g of Object.values(groups)) {
      let x = 0, z = 0;
      for (const p of g.pts) { x += p.x; z += p.z; }
      x /= g.pts.length; z /= g.pts.length;
      let r = 8;
      for (const p of g.pts) r = Math.max(r, Math.hypot(p.x - x, p.z - z) + 6);
      (this.mobAreas[g.mob] ||= []).push({ x, z, r, zone: g.pts[0].zone });
    }
    G.world.on('mobKilled', (m, credited) => { if (credited) this.onKill(m.def.id); });
    G.world.on('pvpKill', (victim) => this.onPvp(victim));
    G.world.on('eventTick', (ev, n) => this.onEvent(ev, n));
    G.world.on('levelup', () => this.refreshMarks());
    this.exploreT = 0;
  },

  get st() { return G.player.data.quests; },

  isDone(id) { return !!this.st.done[id]; },
  isActive(id) { return !!this.st.active[id]; },

  canTake(qq) {
    const P = G.player;
    if (qq.faction !== null && qq.faction !== P.faction) return false;
    if (qq.cls && qq.cls !== P.cls) return false;
    if (this.isDone(qq.id) || this.isActive(qq.id)) return false;
    for (const p of qq.prereq) if (!this.isDone(p)) return false;
    return true;
  },

  availableFor(npcId) {
    const P = G.player;
    return QUESTS.filter((qq) => resolveNpc(qq.giver, P.faction) === npcId && this.canTake(qq));
  },
  turninsFor(npcId) {
    const P = G.player;
    return Object.keys(this.st.active).map((id) => QUEST_BY_ID[id]).filter((qq) => qq && resolveNpc(qq.turnin, P.faction) === npcId);
  },

  // état de progression d'un objectif
  objProgress(qq, i) {
    const o = qq.obj[i];
    const a = this.st.active[qq.id];
    if (!a) return 0;
    if (o.t === 'collect') return Math.min(o.n, Inv.count((it) => it.qid === o.item));
    if (o.t === 'talk') return 0;
    return Math.min(o.n || 1, a.p[i] || 0);
  },
  objDone(qq, i) {
    const o = qq.obj[i];
    if (o.t === 'talk') return true;
    return this.objProgress(qq, i) >= (o.n || 1);
  },
  isReady(qq) {
    return this.isActive(qq.id) && qq.obj.every((o, i) => this.objDone(qq, i));
  },
  objLabel(qq, i) {
    const o = qq.obj[i];
    const n = o.n || 1;
    const p = this.objProgress(qq, i);
    if (o.t === 'talk') return o.label;
    if (o.t === 'explore') return `${o.label}${p >= 1 ? ' (fait)' : ''}`;
    let label = o.label;
    if (!label) {
      if (o.t === 'kill') label = n === 1 ? `${MOB_BY_ID[o.mob].name} vaincu` : `${MOB_BY_ID[o.mob].name} tués`;
      else if (o.t === 'collect') label = QUEST_ITEMS[o.item];
      else if (o.t === 'pvp') label = 'Ennemis vaincus';
    }
    return `${label} : ${p}/${n}`;
  },

  // chapitre de la quête principale encore verrouillé par le niveau
  locked(qq) { return !!qq.main && G.player.level < qq.lvl; },

  accept(id) {
    const qq = QUEST_BY_ID[id];
    if (!qq || !this.canTake(qq)) return;
    if (this.locked(qq)) { G.ui.error(`Niveau ${qq.lvl} requis pour ce chapitre. En attendant, faites des quêtes secondaires !`); return; }
    if (Object.keys(this.st.active).length >= MAX_ACTIVE) { G.ui.error('Journal de quêtes plein (20).'); return; }
    this.st.active[id] = { p: qq.obj.map(() => 0), t: Date.now() };
    // le guidage « voie de l'Ordre » suit le chapitre accepté
    if (qq.main && G.player.data.guide === '__story') { G.player.data.guide = id; this._gtF = -1; }
    G.ui.notify(`Quête acceptée : ${qq.name}`);
    G.audio?.play('quest');
    this.refreshMarks();
    G.ui.refresh();
    G.saveSoon?.();
  },

  abandon(id) {
    delete this.st.active[id];
    if (G.player.data.guide === id) G.player.data.guide = null;
    G.ui.notify('Quête abandonnée.');
    this.refreshMarks();
    G.ui.refresh();
  },

  complete(id) {
    const qq = QUEST_BY_ID[id];
    const P = G.player;
    if (!qq || !this.isReady(qq)) return false;
    // retire les objets de quête
    for (const o of qq.obj) if (o.t === 'collect') Inv.removeWhere((it) => it.qid === o.item, o.n);
    delete this.st.active[id];
    this.st.done[id] = Date.now();
    if (P.data.guide === id) { P.data.guide = qq.main ? '__story' : null; this._gtF = -1; }
    // récompenses
    const xp = questXp(qq), gold = questGold(qq);
    P.data.gold += gold;
    if (qq.fame) { P.data.fame += qq.fame; G.pvp?.updateRank?.(); }
    if (qq.gear) {
      const src = qq.gear === 'boss' ? 'boss' : qq.gear === 'elite' ? 'elite' : 'quest';
      const q0 = src === 'boss' ? 80 + Math.floor(R() * 20) : src === 'elite' ? 68 + Math.floor(R() * 24) : rollQuality(R, 'quest');
      const slots = SLOTS.filter((s) => !(P.cls === 'archer' && s === 'offhand' && R() < 0.5));
      const it = makeGear({ cls: P.cls, slot: slots[Math.floor(R() * slots.length)], ilvl: qq.lvl + (src === 'boss' ? 1 : 0), quality: q0 });
      Inv.add(it);
    }
    if (qq.shards) Inv.add(makeConsumable('shard', qq.shards));
    if (qq.reward) G.story?.reward?.(qq);
    G.ui.announce('Quête terminée', 'quest', `${qq.name} — +${gold} po`);
    G.audio?.play('questdone');
    P.gainXp(xp, 'quest');
    this.refreshMarks();
    G.ui.refresh();
    G.world.emit('questDone', qq);
    G.saveSoon?.();
    return true;
  },

  // créatures qui lâchent l'objet d'un objectif « collecter »
  dropMobs(o) {
    if (o.from) return o.from;
    return Object.values(MOB_BY_ID).filter((m) => m.drop === o.item).map((m) => m.id);
  },
  // objets de quête lâchés par les créatures désignées d'un objectif (chapitres de l'Ordre)
  questDrops(m) {
    for (const id in this.st.active) {
      const qq = QUEST_BY_ID[id];
      if (!qq) continue;
      for (const o of qq.obj) {
        if (o.t !== 'collect' || !o.from || !o.from.includes(m.def.id)) continue;
        if (Inv.count((it) => it.qid === o.item) >= o.n) continue;
        if (R() < (o.chance ?? 0.5)) Inv.add(makeQuestItem(o.item, 1));
      }
    }
  },
  needsItem(item) {
    for (const id in this.st.active) {
      const qq = QUEST_BY_ID[id];
      if (!qq) continue;
      for (const o of qq.obj) if (o.t === 'collect' && o.item === item && Inv.count((it) => it.qid === item) < o.n) return true;
    }
    return false;
  },
  refreshCollect() { this.refreshMarks(); G.ui.refresh(); },

  onKill(mobId) {
    let changed = false;
    for (const id in this.st.active) {
      const qq = QUEST_BY_ID[id];
      qq.obj.forEach((o, i) => {
        if (o.t !== 'kill') return;
        const ok = o.mob === mobId || (o.mobs && o.mobs.includes(mobId));
        if (ok && this.st.active[id].p[i] < o.n) {
          this.st.active[id].p[i]++;
          changed = true;
          G.ui.notify(`${this.objLabel(qq, i)}`);
          if (this.isReady(qq)) G.ui.notify(`${qq.name} : objectifs remplis !`);
        }
      });
    }
    if (changed) { this.refreshMarks(); G.ui.refresh(); }
  },

  onPvp(victim) {
    const z = zoneAt(victim.pos.x, victim.pos.z).id;
    for (const id in this.st.active) {
      const qq = QUEST_BY_ID[id];
      qq.obj.forEach((o, i) => {
        if (o.t !== 'pvp') return;
        if (o.zone && o.zone !== z) return;
        if (this.st.active[id].p[i] < o.n) { this.st.active[id].p[i]++; G.ui.notify(this.objLabel(qq, i)); }
      });
    }
    this.refreshMarks(); G.ui.refresh();
  },

  onEvent(ev, n = 1) {
    let changed = false;
    for (const id in this.st.active) {
      const qq = QUEST_BY_ID[id];
      qq.obj.forEach((o, i) => {
        if (o.t !== 'event' || o.ev !== ev) return;
        const a = this.st.active[id];
        if (a.p[i] < o.n) { a.p[i] = Math.min(o.n, a.p[i] + n); changed = true; if (a.p[i] >= o.n) G.ui.notify(`${qq.name} : objectif rempli !`); }
      });
    }
    if (changed) G.ui.refresh();
  },

  tick(dt) {
    this.exploreT -= dt;
    if (this.exploreT > 0) return;
    this.exploreT = 0.5;
    const P = G.player;
    if (!P || P.dead) return;
    let changed = false;
    for (const id in this.st.active) {
      const qq = QUEST_BY_ID[id];
      qq.obj.forEach((o, i) => {
        if (o.t !== 'explore' || this.st.active[id].p[i] >= 1) return;
        const lm = LANDMARK_BY_ID[o.lm];
        if (Math.hypot(P.pos.x - lm.x, P.pos.z - lm.z) < o.r) {
          this.st.active[id].p[i] = 1;
          changed = true;
          G.ui.notify(`Lieu découvert : ${lm.name}`);
          G.audio?.play('discover');
        }
      });
    }
    if (changed) { this.refreshMarks(); G.ui.refresh(); }
  },

  // ---------------------------------------------------------------------------
  markFor(npcId) {
    const P = G.player;
    if (this.turninsFor(npcId).some((qq) => this.isReady(qq))) return 'done';
    const av = this.availableFor(npcId);
    if (av.some((qq) => qq.lvl <= P.level + 2 && !this.locked(qq))) return '!';
    if (av.length) return 'grey';
    return null;
  },
  refreshMarks() {
    this._marks = null;
    for (const r of NpcManager.recs) {
      if (r.role !== 'quest' && r.role !== 'leader' && !QUESTS.some((qq) => resolveNpc(qq.turnin, G.player.faction) === r.id)) { if (r.ent) r.ent.questMark = null; continue; }
      const m = this.markFor(r.id);
      r.mark = m;
      if (r.ent) r.ent.questMark = m;
    }
  },
  npcMarks() {
    const P = G.player;
    const out = [];
    for (const r of NpcManager.recs) {
      if (!r.mark || r.mark === 'grey' || r.faction !== P.faction) continue;
      out.push({ x: r.x, z: r.z, done: r.mark === 'done' });
    }
    return out;
  },

  // ---------------------------------------------------------------------------
  // Guidage (loupe) : direction et distance de l'objectif en cours, ou du PNJ à qui rendre la quête
  toggleGuide(id) { this.setGuide(G.player?.data.guide === id ? null : id); },
  setGuide(id) {
    const P = G.player;
    if (!P) return;
    P.data.guide = id && (this.isActive(id) || id === '__story') ? id : null;
    this._gtF = -1;
    if (P.data.guide) { G.ui.notify(`Guidage : ${id === '__story' ? "la voie de l'Ordre" : QUEST_BY_ID[id].name}`); G.audio?.play('target'); }
    this.renderTracker();
    G.ui.refresh();
  },
  guideTarget() {
    const P = G.player;
    const id = P?.data.guide;
    if (!id) return null;
    if (this._gtF === G.frame && this._gtId === id) return this._gt;
    this._gtF = G.frame; this._gtId = id;
    // guidage vers le prochain chapitre de l'Ordre (ou vers des quêtes secondaires en attendant)
    if (id === '__story') { this._gt = G.story?.guide?.() || null; if (!this._gt) P.data.guide = null; return this._gt; }
    const qq = QUEST_BY_ID[id];
    if (!qq || !this.isActive(id)) { P.data.guide = null; this._gt = null; return null; }
    this._gt = this.computeGuide(qq);
    return this._gt;
  },
  computeGuide(qq) {
    const P = G.player;
    const npc = (nid) => { const r = NpcManager.recs.find((x) => x.id === nid); return r ? { x: r.x, z: r.z, name: r.name } : null; };
    const base = { quest: qq.name };
    if (this.isReady(qq)) {
      const n = npc(resolveNpc(qq.turnin, P.faction));
      return n ? { ...base, x: n.x, z: n.z, r: 5, label: `Rendre la quête ${aName(n.name)}`, turnin: true } : null;
    }
    for (let i = 0; i < qq.obj.length; i++) {
      if (this.objDone(qq, i)) continue;
      const o = qq.obj[i];
      const label = this.objLabel(qq, i);
      if (o.t === 'explore') { const lm = LANDMARK_BY_ID[o.lm]; if (lm) return { ...base, x: lm.x, z: lm.z, r: Math.max(6, o.r * 0.7), label }; continue; }
      if (o.t === 'kill' || o.t === 'collect') {
        const mobs = o.t === 'kill' ? o.mobs || [o.mob] : this.dropMobs(o);
        // ennemi personnel d'un chapitre (traître, Héraut) : son repaire
        const sp = (o.spawnTraitor || o.spawnHerald) && G.story?.spawnPos?.(qq, o);
        if (sp) {
          const live = G.world.entities.find((e) => e.kind === 'mob' && !e.dead && e.def?.id === o.mob);
          const at = live ? live.pos : sp;
          return { ...base, x: at.x, z: at.z, r: 5, label };
        }
        // la créature vivante la plus proche…
        let best = null, bd = 90;
        for (const e of G.world.entities) {
          if (e.kind !== 'mob' || e.dead || !mobs.includes(e.def?.id)) continue;
          const d = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) return { ...base, x: best.pos.x, z: best.pos.z, r: 4, label: `${label} — ${best.name}` };
        // …sinon son terrain de chasse
        let area = null;
        bd = 1e9;
        for (const pass of [true, false]) {
          for (const m of mobs) for (const a of this.mobAreas[m] || []) {
            if (pass && qq.zone && a.zone !== qq.zone) continue;
            const d = Math.hypot(a.x - P.pos.x, a.z - P.pos.z);
            if (d < bd) { bd = d; area = a; }
          }
          if (area) break;
        }
        if (area) return { ...base, x: area.x, z: area.z, r: Math.max(8, area.r * 0.6), label };
        continue;
      }
      if (o.t === 'pvp') { const z = ZONE_BY_ID[o.zone || qq.zone]; if (z) return { ...base, x: (z.col - 1) * 330, z: (z.row - 1) * 330, r: 60, label }; continue; }
      if (o.t === 'event') { const lm = LANDMARK_BY_ID[o.ev] || LANDMARK_BY_ID.bastion; if (lm) return { ...base, x: lm.x, z: lm.z, r: 12, label }; }
    }
    const n = npc(resolveNpc(qq.turnin, P.faction));
    return n ? { ...base, x: n.x, z: n.z, r: 5, label: `Parler ${aName(n.name)}` } : null;
  },

  // cercles d'objectifs pour la mini-carte et la carte
  trackedAreas() {
    const P = G.player;
    const out = [];
    for (const id in this.st.active) {
      const qq = QUEST_BY_ID[id];
      qq.obj.forEach((o, i) => {
        if (this.objDone(qq, i)) return;
        if (o.t === 'explore') { const lm = LANDMARK_BY_ID[o.lm]; out.push({ x: lm.x, z: lm.z, r: o.r * 0.7, q: qq }); return; }
        let mobs = [];
        if (o.t === 'kill') mobs = o.mobs || [o.mob];
        if (o.t === 'collect') mobs = this.dropMobs(o);
        const sp = (o.spawnTraitor || o.spawnHerald) && G.story?.spawnPos?.(qq, o);
        if (sp) { out.push({ x: sp.x, z: sp.z, r: 10, q: qq }); return; }
        for (const m of mobs) {
          const areas = (this.mobAreas[m] || []).filter((a) => a.zone === qq.zone || !qq.zone);
          areas.sort((a, b) => Math.hypot(a.x - P.pos.x, a.z - P.pos.z) - Math.hypot(b.x - P.pos.x, b.z - P.pos.z));
          for (const a of areas.slice(0, 3)) out.push({ ...a, q: qq });
        }
      });
    }
    return out;
  },

  renderTracker() {
    const el = document.getElementById('tracker');
    if (!el || !G.player) return;
    if (G.inst?.active) { G.inst.renderTracker(el); return; }
    el._sig = null;
    el.onclick = null;
    const ids = Object.keys(this.st.active);
    const story = G.story?.trackerHtml?.() || '';
    if (!ids.length) {
      const P = G.player;
      el.innerHTML = story || (P.level < 30 ? `<div class="tq"><div class="h">Aucune quête</div><div class="o">Cherchez les PNJ marqués d'un <b style="color:#ffd24a">!</b></div></div>` : '');
      this.bindTracker(el);
      return;
    }
    const gid = G.player.data.guide;
    // la quête guidée reste toujours visible dans le suivi
    const shown = ids.slice(0, 6);
    if (gid && ids.includes(gid) && !shown.includes(gid)) shown[5] = gid;
    el.innerHTML = shown.map((id) => {
      const qq = QUEST_BY_ID[id];
      const ready = this.isReady(qq);
      const on = id === gid;
      const objs = qq.obj.map((o, i) => `<div class="o ${this.objDone(qq, i) && o.t !== 'talk' ? 'done' : ''}">${escapeHtml(this.objLabel(qq, i))}</div>`).join('');
      const btn = `<button class="qg${on ? ' on' : ''}" data-g="${id}" title="${on ? 'Arrêter le guidage' : 'Me guider vers l’objectif'}" aria-label="${on ? 'Arrêter le guidage' : 'Me guider vers l’objectif'}">${LOUPE}</button>`;
      return `<div class="tq ${ready ? 'ready' : ''}${on ? ' guided' : ''}${qq.main ? ' main' : ''}" data-q="${id}"><div class="h">${btn}<span>${escapeHtml(qq.name)}</span></div>${ready ? '' : objs}</div>`;
    }).join('');
    if (story) el.insertAdjacentHTML('afterbegin', story);
    this.bindTracker(el);
  },
  bindTracker(el) {
    el.querySelectorAll('.tq').forEach((d) => d.addEventListener('click', () => G.win?.open('quests', d.dataset.q ? { select: d.dataset.q } : { tab: 'lore' })));
    el.querySelectorAll('.qg').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.toggleGuide(b.dataset.g); }));
  },
};
