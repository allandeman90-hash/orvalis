// La voie de l'Ordre : départ au sanctuaire, chapitres verrouillés par le niveau, quêtes secondaires conseillées,
// ennemis personnels (traître, Héraut), récompenses (insigne, arme mythique), rattrapage des anciens personnages.
import { G } from './state.js';
import { QUESTS, QUEST_BY_ID, resolveNpc } from '../data/quests.js';
import { ORDERS, ORDER_LIST, sanctId, mentorId, CHRONICLES, EPILOGUE, cap1, aName, deName } from '../data/lore.js';
import { chapterId, CH_COUNT, CH_LVL } from '../data/story.js';
import { HUB_BY_ID, HUBS, FACTIONS, LANDMARK_BY_ID } from '../data/zones.js';
import { NPC_BY_ID } from '../data/npcs.js';
import { MOB_BY_ID } from '../data/mobs.js';
import { makeGear } from '../data/items.js';
import { CLASSES } from '../data/classbase.js';
import { NpcManager } from './npc.js';
import { Inv } from './inventory.js';
import { Runes } from './runes.js';
import { getHeight, getSlope, waterDepth } from '../world/terrain.js';
import { escapeHtml } from '../core/util.js';
import { LOUPE } from './quests.js';

// arme mythique de chaque Ordre (récompense du chapitre 15)
const MYTHIC_NAMES = {
  guerrier: "Brise-Voile, lame d'Aldric", templier: "Aube-Éternelle, marteau d'Élyane", mage: "Astrelune, bâton d'Ilvane", necro: 'Dernier-Souffle, faux de Morwen',
  archer: 'Cœur-de-Loup, arc de Kaela', assassin: 'Première-Lame, dague de Nyss', druide: 'Racine-Vieille, sceptre de Maëlor', chaman: 'Parle-Tonnerre, masse de Tahuk',
};
const INSIGNIA = {
  guerrier: 'Insigne de la Lame-Grise', templier: "Insigne de l'Aube", mage: "Étoile d'Astrelune", necro: 'Clé du Dernier Souffle',
  archer: 'Insigne de la Traque', assassin: 'Insigne de la Main Silencieuse', druide: 'Feuille des Anciens', chaman: 'Plume des Voix',
};

export const Story = {
  get P() { return G.player; },
  sanct(P = G.player) { return HUB_BY_ID[sanctId(P.cls, P.faction)]; },
  chain(P = G.player) { const out = []; for (let ch = 1; ch <= CH_COUNT; ch++) { const q = QUEST_BY_ID[chapterId(P.cls, ch, P.faction)]; if (q) out.push(q); } return out; },
  doneCount(P = G.player) { return this.chain(P).filter((q) => P.data.quests.done[q.id]).length; },

  init() {
    G.world.on('start', (P) => this.onStart(P));
    G.world.on('levelup', (e) => {
      this.refresh();
      // un chapitre vient de se débloquer : on le signale
      const P = G.player;
      if (!P || e !== P) return;
      const q = this.next(P);
      if (q && q.lvl === P.level && !P.data.quests.active[q.id]) {
        const g = this.giverOf(q);
        setTimeout(() => G.ui?.notify(`Voie de l'Ordre : le chapitre ${q.ch} est disponible${g ? ` auprès ${deName(g.name)}${g.hub ? ` (${g.hub.name})` : ''}` : ''}.`), 1200);
      }
    });
    G.world.on('questDone', (q) => { if (q.main) this.refresh(); });
    (G.frameHooks ||= []).push((dt) => this.tick(dt));
  },

  // nouveau personnage : au sanctuaire de son Ordre, face à son mentor
  placeNew(data) {
    const h = HUB_BY_ID[sanctId(data.cls, data.faction)];
    if (!h) return;
    // un peu de biais face au mentor (l'autel du Sceau derrière lui), pour que la caméra les montre tous les deux
    data.pos = { x: h.x + 2.6, z: h.z + 9 };
    data.ry = Math.atan2(-2.6, -(9 - 3.6));
    data.bind = h.id;
    if (!data.discovered.includes(h.id)) data.discovered.push(h.id);
    data.story = { v: 1, intro: 1 };
    data.guide = '__story'; // la loupe montre d'emblée le mentor
  },

  onStart(P) {
    const d = P.data;
    if (!d.story) {
      // ancien personnage : l'histoire reprend au chapitre adapté à son niveau
      d.story = { v: 1, caught: true };
      let n = 0;
      for (const q of this.chain(P)) {
        if (d.quests.done[q.id] || d.quests.active[q.id]) continue;
        if (q.lvl > P.level - 3) break;
        d.quests.done[q.id] = Date.now();
        if (q.reward === 'insignia') this.reward(q, true);
        n++;
      }
      if (!d.discovered.includes(sanctId(P.cls, P.faction))) d.discovered.push(sanctId(P.cls, P.faction));
      if (n) setTimeout(() => G.ui?.log(`Chroniques : votre histoire reprend au chapitre ${n + 1} de la voie de l'Ordre (${this.chain(P).length} chapitres). Les chapitres précédents sont résumés dans le journal (touche L, onglet Chroniques).`, 'sys'), 2500);
    }
    this.refresh();
  },
  refresh() { this._next = undefined; G.quests?.refreshMarks?.(); G.quests?.renderTracker?.(); },

  // prochain chapitre non terminé
  next(P = G.player) {
    if (!P) return null;
    for (const q of this.chain(P)) {
      if (P.data.quests.done[q.id]) continue;
      return q;
    }
    return null;
  },
  giverOf(q) {
    const P = G.player;
    const id = resolveNpc(q.giver, P.faction);
    const rec = NpcManager.recs.find((r) => r.id === id);
    return rec ? { id, name: rec.name, x: rec.x, z: rec.z, hub: HUB_BY_ID[rec.hub] } : null;
  },
  // hubs où des quêtes secondaires de votre niveau attendent
  sideHubs(max = 2) {
    const P = G.player;
    const byHub = new Map();
    for (const q of QUESTS) {
      if (q.main || !G.quests.canTake(q)) continue;
      if (q.lvl > P.level + 1 || q.lvl < P.level - 4) continue;
      const nid = resolveNpc(q.giver, P.faction);
      const rec = NpcManager.recs.find((r) => r.id === nid);
      if (!rec) continue;
      const k = rec.hub;
      const e = byHub.get(k) || { hub: HUB_BY_ID[k], n: 0, x: rec.x, z: rec.z };
      e.n++;
      byHub.set(k, e);
    }
    return [...byHub.values()].sort((a, b) => Math.hypot(a.x - P.pos.x, a.z - P.pos.z) - Math.hypot(b.x - P.pos.x, b.z - P.pos.z)).slice(0, max);
  },
  // cible de la loupe « voie de l'Ordre »
  guide() {
    const P = G.player;
    const q = this.next(P);
    if (!q || P.data.quests.active[q.id]) return null;
    const base = { quest: `Voie de l'Ordre — chapitre ${q.ch}` };
    if (P.level >= q.lvl) {
      const g = this.giverOf(q);
      return g ? { ...base, x: g.x, z: g.z, r: 5, label: `Parler ${aName(g.name)}` } : null;
    }
    const h = this.sideHubs(1)[0];
    return h ? { ...base, x: h.x, z: h.z, r: 8, label: `Quêtes secondaires : ${h.hub.name}` } : null;
  },
  // carte dans le suivi de quêtes
  trackerHtml() {
    const P = G.player;
    if (!P || G.inst?.active) return '';
    const q = this.next(P);
    const total = this.chain(P).length;
    if (!q) return '';
    if (P.data.quests.active[q.id]) return '';
    const on = P.data.guide === '__story';
    const btn = `<button class="qg${on ? ' on' : ''}" data-g="__story" title="Me guider" aria-label="Me guider">${LOUPE}</button>`;
    let body;
    if (P.level >= q.lvl) {
      const g = this.giverOf(q);
      body = `<div class="o">Chapitre disponible : parlez ${escapeHtml(aName(g?.name || '?'))}${g?.hub ? ` (${escapeHtml(g.hub.name)})` : ''}.</div>`;
    } else {
      const hubs = this.sideHubs(2);
      body = `<div class="o locked">Niveau ${q.lvl} requis (vous : ${P.level}).</div><div class="o">${hubs.length ? `En attendant, quêtes secondaires à ${hubs.map((h) => `<b>${escapeHtml(h.hub.name)}</b>`).join(' et ')}.` : 'En attendant, explorez la région et ses quêtes secondaires.'}</div>`;
    }
    return `<div class="tq story${on ? ' guided' : ''}" data-story="1"><div class="h">${btn}<span>Voie de l'Ordre ${q.ch}/${total} : ${escapeHtml(q.name)}</span></div>${body}</div>`;
  },

  // ---------------------------------------------------------------------------
  // Repaires des ennemis personnels
  spawnPos(q, o) {
    const key = q.id + '|' + o.mob;
    (this._sp ||= {});
    if (this._sp[key]) return this._sp[key];
    let p = null;
    if (o.spawnTraitor) {
      const h = HUB_BY_ID[sanctId(q.cls, q.faction)];
      const cap = HUB_BY_ID[FACTIONS[q.faction].capital];
      const a0 = Math.atan2(h.z - cap.z, h.x - cap.x);
      for (let k = 0; k < 18 && !p; k++) {
        const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.35;
        for (const r of [40, 34, 46, 30, 52]) {
          const x = h.x + Math.cos(a) * r, z = h.z + Math.sin(a) * r;
          if (getHeight(x, z) < 0.6 || waterDepth(x, z) > 0 || getSlope(x, z) > 0.55) continue;
          if (HUBS.some((hb) => hb !== h && Math.hypot(hb.x - x, hb.z - z) < hb.r + 12)) continue;
          // loin des créatures sauvages, pour un duel sans renforts
          if (G.world?.spawns?.some((s) => Math.hypot(s.x - x, s.z - z) < 22)) continue;
          p = { x, z }; break;
        }
      }
      if (!p) { this._spFallback = (this._spFallback || 0) + 1; p = { x: h.x + 30, z: h.z }; }
    } else if (o.spawnHerald) {
      const lm = LANDMARK_BY_ID.autel;
      const i = Math.max(0, ORDER_LIST.indexOf(q.cls));
      const a = (i / ORDER_LIST.length) * Math.PI * 2 + 0.2;
      p = { x: lm.x + Math.cos(a) * 24, z: lm.z + Math.sin(a) * 24 };
    }
    this._sp[key] = p;
    return p;
  },
  tick(dt) {
    const P = G.player;
    if (!P || G.mode !== 'game') return;
    this.spT = (this.spT || 0) - dt;
    if (this.spT > 0) return;
    this.spT = 1;
    for (const id in P.data.quests.active) {
      const q = QUEST_BY_ID[id];
      if (!q?.main) continue;
      q.obj.forEach((o, i) => {
        if (!(o.spawnTraitor || o.spawnHerald) || G.quests.objDone(q, i)) return;
        const p = this.spawnPos(q, o);
        if (!p || Math.hypot(P.pos.x - p.x, P.pos.z - p.z) > 90) return;
        const live = G.world.entities.some((e) => e.kind === 'mob' && !e.dead && e.def?.id === o.mob && Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < 80);
        if (live) return;
        const m = G.world.spawnTemp(o.mob, p.x, p.z, null);
        if (m) {
          m.level = MOB_BY_ID[o.mob].lvl[0];
          m.statsDirty = true; m.recalc(); m.hp = m.stats.maxHp;
          m.home = { x: p.x, z: p.z };
          m.leash = 45;
          m.storySpawn = true;
        }
      });
    }
  },

  // ---------------------------------------------------------------------------
  reward(q, silent = false) {
    const P = G.player;
    if (q.reward === 'insignia') {
      const it = makeGear({ slot: 'amulet', cls: P.cls, ilvl: 3, quality: 62 });
      it.name = INSIGNIA[P.cls] || "Insigne de l'Ordre";
      it.sockets = 1; it.runes = [null];
      it.req = 1;
      Inv.add(it, silent);
      Runes.add(CLASSES[P.cls].primary, 1, 1, { silent });
      if (!silent) setTimeout(() => G.ui?.announce('Emplacement de rune', 'quest', "Votre insigne possède un emplacement de rune. Ouvrez la fenêtre des runes (touche R), onglet Sertissage, pour y placer la rune reçue."), 1600);
    } else if (q.reward === 'mythicWeapon') {
      const it = makeGear({ slot: 'weapon', cls: P.cls, ilvl: 32, mythic: true });
      it.name = MYTHIC_NAMES[P.cls] || it.name;
      it.req = 30;
      Inv.add(it);
      G.ui?.announce('Arme mythique !', 'level', `${it.name} — ${it.sockets} emplacements de runes`);
      G.audio?.play('epic');
    }
  },

  // ---------------------------------------------------------------------------
  // Chroniques (journal de quêtes, onglet)
  chroniclesHtml() {
    const P = G.player;
    const O = ORDERS[P.cls];
    const sanct = HUB_BY_ID[sanctId(P.cls, P.faction)];
    const chain = this.chain(P);
    const done = chain.filter((q) => P.data.quests.done[q.id]);
    const nxt = this.next(P);
    let html = `<div class="chr"><div class="chr-order" style="--oc:${O.color}"><div class="chr-t">${escapeHtml(cap1(O.order))}</div><div class="chr-m">${escapeHtml(O.motto)}</div><div class="chr-p">${escapeHtml(O.desc)} ${escapeHtml(cap1(O.order))} ${O.order.startsWith('les ') ? 'gardent' : 'garde'} ${escapeHtml(O.seal)}, forgé par ${escapeHtml(O.founder)}. Votre sanctuaire : <b>${escapeHtml(sanct?.name || '')}</b>.</div>
      <div class="chr-prog"><div class="bar"><div class="f" style="transform:scaleX(${done.length / chain.length})"></div><span class="t num">Voie de l'Ordre : ${done.length} / ${chain.length} chapitres</span></div></div></div>`;
    html += '<h3>Votre histoire</h3><div class="chr-list">';
    if (!done.length) html += '<div class="muted">Votre histoire ne fait que commencer.</div>';
    for (const q of done) html += `<div class="chr-ch"><b>${q.ch}. ${escapeHtml(q.name)}</b> <span class="muted">(niv. ${q.lvl})</span><div>${escapeHtml(q.done)}</div></div>`;
    if (nxt) html += `<div class="chr-ch next"><b>${nxt.ch}. ${escapeHtml(nxt.name)}</b> <span class="muted">(niv. ${nxt.lvl})</span><div>${P.data.quests.active[nxt.id] ? 'En cours.' : P.level >= nxt.lvl ? 'Disponible.' : `Disponible au niveau ${nxt.lvl}. Les quêtes secondaires des régions vous y mèneront.`}</div></div>`;
    html += '</div><h3>Les Chroniques d\'Orvalis</h3>';
    for (const c of CHRONICLES) html += `<div class="chr-c"><b>${escapeHtml(c.t)}</b><p>${escapeHtml(c.p)}</p></div>`;
    if (!nxt) html += `<div class="chr-c"><b>${escapeHtml(EPILOGUE.t)}</b><p>${escapeHtml(EPILOGUE.p)}</p></div>`;
    html += '<h3>Les Huit Ordres</h3><div class="chr-orders">';
    for (const cls of ORDER_LIST) {
      const X = ORDERS[cls];
      html += `<div class="chr-o${cls === P.cls ? ' me' : ''}" style="--oc:${X.color}"><b>${escapeHtml(X.order.charAt(0).toUpperCase() + X.order.slice(1))}</b> <span class="muted">— ${escapeHtml(CLASSES[cls].name)}</span><div>${escapeHtml(X.seal.charAt(0).toUpperCase() + X.seal.slice(1))}, forgé par ${escapeHtml(X.founder)}.</div></div>`;
    }
    return html + '</div></div>';
  },
};
