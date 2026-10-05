import { isInstancePoint } from '../data/world-space.js';
// Gestionnaire du monde : entités actives, grille spatiale, activation des monstres, morts et réapparitions.
import { G } from './state.js';
import { Mob } from './mob.js';
import { buildSpawns } from '../data/spawns.js';
import { canAttack, isFriendly, isPlayerLike, dist, hasFlag, removeBuff } from './combat.js';
import { HUB_BY_ID, HUBS, FACTIONS } from '../data/zones.js';
import { zoneAt, getHeight, EXT_X } from '../world/terrain.js';
import { angleTo, wrapAngle } from '../core/util.js';
import { MOB_BY_ID } from '../data/mobs.js';

const CELL = 16;
const ACTIVATE_R = 150;
const DEACTIVATE_R = 185;

const LOD_HIDE = { npc: 95, mob: 115, pet: 95, bot: 160, remote: 180 };

export class World {
  constructor(scene) {
    this.scene = scene;
    this.entities = []; // entités actives (monstres actifs, bots proches, PNJ, joueurs)
    this.grid = new Map();
    this.spawns = buildSpawns();
    this.tickers = [];
    this.listeners = {};
    this.actT = 0;
    this.temps = [];
  }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, ...a) { const l = this.listeners[ev]; if (l) for (const f of l) { try { f(...a); } catch (e) { console.error(ev, e); } } }

  add(e) {
    if (!this.entities.includes(e)) this.entities.push(e);
    return e;
  }
  remove(e) {
    const i = this.entities.indexOf(e);
    if (i >= 0) this.entities.splice(i, 1);
    e.removeModel?.();
    if (G.player && G.player.target === e) G.player.target = null;
    this.emit('removed', e);
  }

  addTicker(fn) { this.tickers.push(fn); }

  // ---------------------------------------------------------------------------
  rebuildGrid() {
    this.grid.clear();
    for (const e of this.entities) {
      const k = Math.floor(e.pos.x / CELL) * 4096 + Math.floor(e.pos.z / CELL);
      let l = this.grid.get(k);
      if (!l) this.grid.set(k, (l = []));
      l.push(e);
    }
  }
  query(x, z, r) {
    const out = [];
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const l = this.grid.get(gx * 4096 + gz);
      if (!l) continue;
      for (const e of l) {
        const dx = e.pos.x - x, dz = e.pos.z - z;
        if (dx * dx + dz * dz <= r * r) out.push(e);
      }
    }
    return out;
  }

  nearestEnemy(c, range, inFront = false) {
    let best = null, bs = 1e9;
    for (const e of this.query(c.pos.x, c.pos.z, range)) {
      if (!canAttack(c, e)) continue;
      if (e.passive && c.kind !== 'player') continue;
      const d = dist(c, e);
      let s = d;
      if (inFront) {
        const a = Math.abs(wrapAngle(angleTo(c.pos.x, c.pos.z, e.pos.x, e.pos.z) - c.ry));
        s += a * 6;
        if (e.passive) s += 12;
      }
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }

  mobsEngagedWith(e) {
    const out = [];
    for (const m of this.query(e.pos.x, e.pos.z, 50)) if (m.kind === 'mob' && !m.dead && m.threat.has(e)) out.push(m);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Activation des monstres autour des joueurs
  updateActivation() {
    const P = G.player;
    if (!P) return;
    const focus = [P.pos];
    if (G.net) for (const r of G.net.remotes.values()) if (Math.hypot(r.pos.x - P.pos.x, r.pos.z - P.pos.z) < 260) focus.push(r.pos);
    const now = G.time;
    for (const s of this.spawns) {
      let d = 1e9;
      for (const f of focus) d = Math.min(d, Math.hypot(s.x - f.x, s.z - f.z));
      if (s.ent) {
        const e = s.ent;
        if (e.dead && e.deathT > 14) {
          this.remove(e); s.ent = null; s.deadUntil = now + s.respawn * (s.respawnMul || 1);
          continue;
        }
        // les monstres d'instance restent actifs (salles de boss, rencontres en cours)
        if (s.inst) continue;
        const dd = Math.min(d, ...focus.map((f) => Math.hypot(e.pos.x - f.x, e.pos.z - f.z)));
        if (dd > DEACTIVATE_R && !e.inCombat()) { this.remove(e); s.ent = null; }
        continue;
      }
      if (s.eventOnly && !s.active) continue;
      if (s.deadUntil && now < s.deadUntil) continue;
      if (d > ACTIVATE_R) continue;
      const m = new Mob(s);
      m.pos.set(s.x, getHeight(s.x, s.z), s.z);
      m.createModel(this.scene);
      if (s.deadUntil && now - s.deadUntil < 1) this.spawnPoof(m);
      s.deadUntil = 0;
      s.ent = m;
      this.add(m);
      if (s.inst) this.emit('instSpawn', m);
    }
    // monstres temporaires (invocations) : nettoyage
    for (let i = this.temps.length - 1; i >= 0; i--) {
      const t = this.temps[i];
      if ((t.dead && t.deathT > 8) || (t.owner && t.owner.dead && !t.inCombat()) || (Math.hypot(t.pos.x - P.pos.x, t.pos.z - P.pos.z) > DEACTIVATE_R)) {
        this.remove(t); this.temps.splice(i, 1);
      }
    }
  }

  spawnPoof(m) {
    import('./fx.js').then((fx) => fx.burst(m.pos.x, m.pos.y + 0.5, m.pos.z, { count: 10, color: '#ffffff', speed: 2, life: 0.5 }));
  }

  spawnTemp(mobId, x, z, owner) {
    if (!MOB_BY_ID[mobId]) return null;
    const lvl = owner ? Math.max(MOB_BY_ID[mobId].lvl[0], owner.level - 2) : MOB_BY_ID[mobId].lvl[0];
    const m = new Mob({ mob: mobId, x, z, level: lvl, wander: 3, respawn: 0 }, mobId);
    m.temp = true;
    m.owner = owner;
    m.pos.set(x, getHeight(x, z), z);
    m.createModel(this.scene);
    this.add(m);
    this.temps.push(m);
    if (isInstancePoint(x, z) && G.inst?.active) G.inst.onTempSpawn(m);
    return m;
  }

  // ---------------------------------------------------------------------------
  update(dt) {
    this.actT -= dt;
    if (this.actT <= 0) { this.actT = 0.5; this.updateActivation(); }
    this.rebuildGrid();
    for (let i = this.tickers.length - 1; i >= 0; i--) {
      let keep = true;
      try { keep = this.tickers[i](dt); } catch (e) { console.error(e); keep = false; }
      if (!keep) this.tickers.splice(i, 1);
    }
    const P = G.player;
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (e === P) continue;
      // les entités lointaines se mettent à jour moins souvent
      const d = P ? Math.abs(e.pos.x - P.pos.x) + Math.abs(e.pos.z - P.pos.z) : 0;
      if (d > 120 && !e.inCombat?.()) {
        e._skip = (e._skip || 0) + dt;
        if ((G.frame + i) % 3 !== 0) continue;
        e.update(e._skip); e._skip = 0;
      } else {
        if (e._skip) { e.update(e._skip + dt); e._skip = 0; } else e.update(dt);
      }
      if (e.model) {
        // les créatures et PNJ lointains ne sont plus dessinés (le brouillard les cache déjà) : gros gain d'images/s
        const lim = e === P?.target || e.inMyParty ? G.settings.viewDist + 40 : Math.min(G.settings.viewDist + 40, (LOD_HIDE[e.kind] ?? 140) * 1.25);
        const vis = e.visible !== false && d < lim;
        e.model.root.visible = vis && !e.polyModel && !e.formModel;
        if (e.formModel) e.formModel.root.visible = vis && !e.polyModel;
      }
    }
  }

  // ---------------------------------------------------------------------------
  onKill(tgt, src) {
    this.emit('kill', tgt, src);
  }

  // Téléportation à la capitale de sa faction
  recall(e) {
    const cap = HUB_BY_ID[e.bindHub || FACTIONS[e.faction].capital];
    e.teleport(cap.x, cap.z + 8);
    import('./fx.js').then((fx) => fx.pillar(e.pos.x, e.pos.y, e.pos.z, '#7fb8ff', 40, 3));
    G.audio?.play('teleport', e.pos);
  }

  // Point de réapparition : hub ami le plus proche
  graveyardFor(e) {
    let best = null, bd = 1e9;
    for (const h of HUBS) {
      if (h.faction !== e.faction) continue;
      const d = Math.hypot(h.x - e.pos.x, h.z - e.pos.z);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }
}
