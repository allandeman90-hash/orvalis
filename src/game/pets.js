// Familiers et invocations : créatures alliées qui suivent leur maître et combattent à ses côtés.
// - Familiers : chaque monstre vaincu peut laisser sa « pierre d'âme » (plus le monstre est rare et coriace,
//   plus la chance est faible). Le familier gagne de l'expérience avec son maître.
// - Invocations : squelettes et golem du Nécromancien (durée limitée).
// - Totems du Chaman (objets fixes à effet périodique).
import * as THREE from 'three';
import { G, xpToNext, LEVEL_CAP } from './state.js';
import { Mob } from './mob.js';
import { MOB_BY_ID } from '../data/mobs.js';
import { canAttack, dist, isPlayerLike, dangerAt, addBuff, alliesAround, heal as healUnit, addThreat } from './combat.js';
import { burst, pillar } from './fx.js';
import { GeoBuilder, vcGlowMaterial } from '../engine/geom.js';
import { getHeight } from '../world/terrain.js';
import { R } from '../core/rng.js';
import { clamp, escapeHtml, fmtInt, turnTowards } from '../core/util.js';
import { itemUid } from '../data/items.js';

export const PET_RARITY = [
  { name: 'Commun', color: '#cfd3da' },
  { name: 'Rare', color: '#3fa0ff' },
  { name: 'Épique', color: '#b86bff' },
  { name: 'Légendaire', color: '#ff9f2a' },
];
export const PET_MAX = 40;
// Rôles de familier : chacun peut être tank, dégâts ou soigneur
export const PET_ROLES = {
  tank: { name: 'Tank', glyph: 'tank', color: '#2a4a8a', desc: 'Encaisse et provoque les ennemis qui s\'en prennent à vous : +50 % de vie, +60 % d\'armure, menace très élevée, −25 % de dégâts.' },
  dps: { name: 'Dégâts', glyph: 'dps', color: '#7a2a2a', desc: 'Frappe fort : +30 % de dégâts, −10 % de vie.' },
  heal: { name: 'Soigneur', glyph: 'healer', color: '#2a6a3a', desc: 'Soigne son maître et le groupe toutes les quelques secondes, −45 % de dégâts.' },
};
export const PET_MODES = {
  aggressive: { name: 'Agressif', desc: "Attaque tout ennemi qui s'approche de vous." },
  assist: { name: 'Défensif', desc: 'Attaque votre cible quand vous combattez, et ce qui vous attaque.' },
  passive: { name: 'Passif', desc: "N'attaque jamais de lui-même : seulement sur l'ordre « Attaquer »." },
};
// familier de départ du Chasseur, selon sa faction
export const HUNTER_STARTER = ['loup_pres', 'hyene'];
const petXpToNext = (L) => Math.round(xpToNext(Math.min(L, LEVEL_CAP - 1)) * 0.55);
const mobXpBase = (level) => 20 + level * 8;

// glyphe d'icône par famille de créature
export function petGlyph(def) {
  const f = def?.family;
  const rig = def?.model?.rig;
  if (rig === 'drake') return 'fire';
  if (rig === 'insect') return 'web';
  if (rig === 'blob') return 'swarm';
  if (rig === 'flyer') return 'hawk';
  if (rig === 'floater') return 'blink';
  if (rig === 'worm') return 'drain';
  return f === 'humanoïde' ? 'sword' : f === 'mort-vivant' ? 'skeleton' : f === 'élémentaire' ? 'nova' : f === 'démon' ? 'fire' : f === 'plante' ? 'regrowth' : f === 'esprit' ? 'blink' : 'pack';
}

// ---------------------------------------------------------------------------
export class Pet extends Mob {
  constructor(owner, defId, o = {}) {
    super({ mob: defId, x: owner.pos.x, z: owner.pos.z, level: o.level ?? owner.level, wander: 0, respawn: 0 }, defId);
    this.kind = 'pet';
    this.owner = owner;
    this.faction = owner.faction;
    this.neutral = false;
    this.passive = false;
    this.elite = false; this.boss = false; this.worldBoss = false; this.named = false;
    this.minion = !!o.minion;
    this.minionHp = o.hp; this.minionDmg = o.dmg;
    this.lifeT = o.dur || 0;
    this.lifeMax = o.dur || 0;
    this.rec = o.rec || null;
    this.rarity = o.rarity ?? (this.rec ? this.rec.rarity : 0);
    this.quality = o.quality ?? (this.rec ? this.rec.q : 50);
    this.name = o.name || this.rec?.name || this.def.name;
    this.leash = 1e9;
    this.slot = o.slot ?? 0;
    this.abilityList = this.def.abilities.filter((id) => !id.startsWith('summon_') && id !== 'heal' && id !== 'howl' && id !== 'enrage');
    this.abCd = {};
    for (const id of this.abilityList) this.abCd[id] = 3 + R() * 4;
    this.state = 'follow';
    this.tappers = new Set();
  }
  get isLocalParty() { return !!this.owner?.isLocalParty; }
  get inMyParty() { return !!this.owner?.isLocalParty; }
  get role() { return this.minion ? 'dps' : this.rec?.role || this.roleOverride || 'dps'; }

  createModel(scene) {
    super.createModel(scene);
    // taille de compagnon : un dragon devient un dragonnet
    const k = clamp((this.minion ? 2.4 : 1.8) / (this.model.height || 1), 0.28, 1);
    if (k < 1) {
      this.model.root.scale.multiplyScalar(k);
      this.model.height *= k;
      this.model.radius *= k;
      this.radius = this.model.radius;
    }
  }

  evade() { this.target = null; this.stuckT = 0; }

  pickTarget() {
    const o = this.owner;
    if (!o) return null;
    if (this.forceT > 0 && this.forceTarget && !this.forceTarget.dead) return this.forceTarget;
    const valid = (e) => e && !e.dead && e.kind !== 'npc' && e.kind !== 'remote' && canAttack(this, e) && dist(o, e) < 45;
    if (this.mode === 'passive') return null;
    const ot = o.target;
    if (valid(ot) && (o.inCombat() || o.engaged === ot || o.kind === 'bot') && (!isPlayerLike(ot) || o.inCombat())) return ot;
    if (valid(this.target) && (this.target.kind !== 'mob' || this.target.state === 'combat')) return this.target;
    let best = null, bd = 1e9;
    for (const m of G.world.query(o.pos.x, o.pos.z, 26)) {
      if (m.kind !== 'mob' || m.dead || !canAttack(this, m)) continue;
      if (m.target === o || m.target === this || m.threat?.has(o) || m.threat?.has(this)) {
        const d = dist(this, m);
        if (d < bd) { bd = d; best = m; }
      }
    }
    // mode agressif : n'importe quel ennemi proche du maître
    if (!best && this.mode === 'aggressive' && !o.mounted) {
      for (const m of G.world.query(o.pos.x, o.pos.z, 20)) {
        if (m.kind !== 'mob' || m.dead || m.passive || m.state === 'evade' || !canAttack(this, m)) continue;
        const d = dist(this, m);
        if (d < bd) { bd = d; best = m; }
      }
    }
    return best;
  }

  follow(dt) {
    const o = this.owner;
    // ordre « Rester » : garde sa position
    if (this.stayAt && !this.minion) {
      const dd = Math.hypot(this.stayAt.x - this.pos.x, this.stayAt.z - this.pos.z);
      if (dd < 1) return false;
      this.moveTowards(this.stayAt.x, this.stayAt.z, dt, 0.5);
      return this.speedNow > 0.1;
    }
    const d = dist(this, o);
    if (d > 38) {
      this.teleport(o.pos.x - Math.sin(o.ry) * 2, o.pos.z - Math.cos(o.ry) * 2);
      burst(this.pos.x, this.pos.y + 0.6, this.pos.z, { count: 8, color: '#e0f0ff', speed: 2, life: 0.4 });
      return false;
    }
    const side = this.slot % 2 ? 1 : -1, back = 1.9 + Math.floor(this.slot / 2) * 1.3;
    const tx = o.pos.x - Math.sin(o.ry) * back + Math.cos(o.ry) * side * 1.5;
    const tz = o.pos.z - Math.cos(o.ry) * back - Math.sin(o.ry) * side * 1.5;
    const dd = Math.hypot(tx - this.pos.x, tz - this.pos.z);
    if (dd < 1.1) { this.ry = turnTowards(this.ry, o.ry, dt * 4); return false; }
    const sp = Math.max(this.stats.moveSpeed, (o.speedNow || 0) * 1.1, dd > 8 ? (o.stats.moveSpeed || 7) * 1.3 : 0);
    this.moveTowards(tx, tz, dt, 0.6, sp);
    return this.speedNow > 0.1;
  }

  update(dt) {
    let moved = false;
    this.speedNow = 0;
    if (this.forceT > 0) this.forceT -= dt;
    if (this.dead) { this.deathT += dt; this.updateBase(dt); this.syncModel(dt); return; }
    if (this.minion && this.lifeT > 0) {
      this.lifeT -= dt;
      if (this.lifeT <= 0) { Pets.expire(this); return; }
    }
    const o = this.owner;
    if (!o || (o.dead && this.minion)) { Pets.expire(this); return; }
    if (this.lockT > 0) this.lockT -= dt;
    for (const k in this.abCd) this.abCd[k] -= dt;
    const dz = !this.windup && !this.cast ? dangerAt(this.pos.x, this.pos.z, 0.2) : null;
    if (dz) {
      const a = Math.atan2(this.pos.x - dz.x, this.pos.z - dz.z) + (dz.angle ? 1.2 : 0);
      this.moveTowards(this.pos.x + Math.sin(a) * 4, this.pos.z + Math.cos(a) * 4, dt, 0.1, this.stats.moveSpeed * 1.1);
      moved = this.speedNow > 0.1;
    } else if (!this.stunned) {
      // rôle soigneur : les soins passent avant l'attaque
      if (this.role === 'heal' && this.healTick(dt)) { /* soin lancé */ }
      const t = o.dead ? null : this.pickTarget();
      if (t && this.stayAt && dist(this, t) > 30 && this.forceTarget !== t) { this.target = null; moved = this.follow(dt); }
      else if (t) { this.target = t; if (this.role === 'tank') this.tankTick(dt); moved = this.combat(dt, t); }
      else { this.target = null; this.windup = null; moved = this.follow(dt); }
    }
    this.updateBase(dt, moved);
    this.syncModel(dt);
  }

  // Tank : provoque les ennemis qui frappent le maître ou le groupe
  tankTick(dt) {
    this.tauntT = (this.tauntT || 0) - dt;
    if (this.tauntT > 0) return;
    const o = this.owner;
    for (const m of G.world.query(this.pos.x, this.pos.z, 14)) {
      if (m.kind !== 'mob' || m.dead || !m.target || m.target === this || m.boss) continue;
      const t = m.target;
      if (t !== o && !(t.isLocalParty || t.inMyParty)) continue;
      this.tauntT = 6;
      m.forceTarget = this; m.forceT = 4;
      addThreat(m, this, (m.stats.maxHp || 100) * 0.5);
      if (this.model) this.model.play('roar', 0.6);
      G.ui?.floatText(m, 'Provoqué', 'miss');
      return;
    }
    this.tauntT = 1;
  }
  // Soigneur : soigne l'allié le plus blessé (maître, groupe, lui-même)
  healTick(dt) {
    this.healT = (this.healT || 0) - dt;
    if (this.healT > 0) return false;
    this.healT = 0.6;
    const o = this.owner;
    const cands = [o, this];
    if (o === G.player && G.party?.members) for (const m of G.party.members) if (m !== o && !m.dead) cands.push(m);
    let best = null, bk = 0.85;
    for (const e of cands) {
      if (!e || e.dead || !e.stats?.maxHp || dist(this, e) > 26) continue;
      const k = e.hp / e.stats.maxHp;
      if (k < bk) { bk = k; best = e; }
    }
    if (!best) return false;
    this.healT = 3.4;
    const amt = (this.stats.power || 20) * 1.35 + (best.stats.maxHp || 100) * 0.07;
    if (this.model) this.model.play('roar', 0.5);
    healUnit(this, best, amt, { skill: 'Lien vital' });
    burst(best.pos.x, best.pos.y + 1, best.pos.z, { count: 10, color: '#8fe86a', speed: 2, life: 0.6 });
    return true;
  }
}

// ---------------------------------------------------------------------------
// Pierres d'âme (objet de butin qui apprend un familier)
export function makePetStone(mobId, rarity, q) {
  const def = MOB_BY_ID[mobId];
  return {
    uid: itemUid(), type: 'petstone', mob: mobId, prar: rarity, pq: q, name: `Pierre d'âme : ${def?.name || mobId}`, icon: 'i_petstone',
    count: 1, stack: 1, value: [12, 60, 240, 900][rarity] + q, rarity: rarity + 1, req: 1,
  };
}

// ---------------------------------------------------------------------------
// Totems (Chaman) : poteau sculpté fixe, effet périodique
const totems = [];
export function spawnTotem(owner, o) {
  const b = new GeoBuilder(), g = new GeoBuilder();
  b.box(0.22, 1.5, 0.22, '#6b4a2e', 0, 0.75, 0);
  b.box(0.42, 0.36, 0.42, '#9a7448', 0, 1.62, 0);
  b.box(0.5, 0.06, 0.12, o.color || '#2ab5ff', 0, 1.82, 0.16);
  for (const sx of [-1, 1]) b.box(0.28, 0.08, 0.06, '#c9b28a', sx * 0.3, 1.5, 0, 0, 0, sx * 0.4);
  g.box(0.08, 0.08, 0.04, o.color || '#2ab5ff', 0.09, 1.66, 0.215);
  g.box(0.08, 0.08, 0.04, o.color || '#2ab5ff', -0.09, 1.66, 0.215);
  g.octa(0.14, o.color || '#2ab5ff', 0, 2.04, 0, 1, 1.4, 1);
  const grp = new THREE.Group();
  const m1 = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m1.castShadow = true;
  grp.add(m1, new THREE.Mesh(g.build(), vcGlowMaterial()));
  const x = o.x ?? owner.pos.x + Math.sin(owner.ry) * 1.5, z = o.z ?? owner.pos.z + Math.cos(owner.ry) * 1.5;
  grp.position.set(x, getHeight(x, z), z);
  G.scene.add(grp);
  pillar(x, getHeight(x, z), z, o.color || '#2ab5ff', 18, 2);
  const T = { owner, x, z, grp, max: o.dur || 20, left: o.dur || 20, tickT: 0, tick: o.tick || 1, fn: o.fn, r: o.r || 12, color: o.color, kind: o.kind };
  totems.push(T);
  // un seul totem de chaque type par chaman
  for (const t2 of totems) if (t2 !== T && t2.owner === owner && t2.kind === T.kind) t2.left = 0;
  return T;
}
const TOTEM_NAMES = { source: 'Totem de source', braise: 'Totem de braise', vents: 'Totem des vents', maree: 'Totem de marée' };
export function totemsOf(owner) { return totems.filter((T) => T.owner === owner && T.left > 0).map((T) => ({ ...T, name: TOTEM_NAMES[T.kind] || 'Totem' })); }
function updateTotems(dt) {
  for (let i = totems.length - 1; i >= 0; i--) {
    const T = totems[i];
    T.left -= dt;
    T.grp.rotation.y += dt * 0.4;
    if (T.left <= 0 || !T.owner || T.owner.dead || Math.hypot(T.owner.pos.x - T.x, T.owner.pos.z - T.z) > 80) {
      burst(T.x, T.grp.position.y + 1.2, T.z, { count: 14, color: T.color || '#2ab5ff', speed: 3, life: 0.5 });
      G.scene.remove(T.grp);
      T.grp.traverse((m) => { if (m.isMesh) m.geometry.dispose(); });
      totems.splice(i, 1);
      continue;
    }
    T.tickT += dt;
    while (T.tickT >= T.tick) {
      T.tickT -= T.tick;
      try { T.fn?.(T); } catch (e) { console.error('totem', e); }
    }
  }
}
export function clearTotems() { for (const T of totems) T.left = 0; updateTotems(0); }

// ---------------------------------------------------------------------------
export const Pets = {
  list: [],
  active: null,
  respawnAt: 0,

  init() {
    G.world.on('mobKilled', (m, credited) => this.onMobKilled(m, credited));
    // le compagnon de départ du Chasseur gagne ses niveaux avec lui
    G.world.on('levelup', (P) => {
      if (P !== G.player) return;
      for (const r of this.recs()) if (r.starter && r.level < P.level) {
        r.level = P.level; r.xp = 0;
        if (this.active?.rec === r) { const a = this.active; a.level = r.level; a.statsDirty = true; a.recalc(); a.hp = a.stats.maxHp; }
      }
    });
    G.world.on('removed', (e) => {
      const i = this.list.indexOf(e);
      if (i >= 0) this.list.splice(i, 1);
      if (e === this.active) this.active = null;
      // les invocations disparaissent avec leur maître
      if (e.kind === 'bot' || e.kind === 'player') for (const p of this.list.slice()) if (p.owner === e) this.expire(p, true);
    });
    (G.frameHooks ||= []).push((dt) => this.update(dt));
  },

  // --- invocations
  summonMinion(owner, defId, o = {}) {
    const n = this.list.filter((p) => p.owner === owner && p.minion && !p.dead).length;
    const a = R() * Math.PI * 2;
    const x = owner.pos.x + Math.sin(a) * 2, z = owner.pos.z + Math.cos(a) * 2;
    const p = new Pet(owner, defId, { ...o, minion: true, level: owner.level, slot: n + 1 });
    p.pos.set(x, getHeight(x, z), z);
    p.createModel(G.scene);
    G.world.add(p);
    this.list.push(p);
    pillar(x, getHeight(x, z), z, '#a8a4d8', 20, 2);
    burst(x, getHeight(x, z) + 0.3, z, { count: 14, color: '#6a5a7a', color2: '#e6dfcd', speed: 3, life: 0.6 });
    return p;
  },
  minionsOf(owner, defId) { return this.list.filter((p) => p.owner === owner && p.minion && !p.dead && (!defId || p.def.id === defId)); },
  expire(p, silent) {
    if (!silent && p.model) burst(p.pos.x, p.pos.y + 0.8, p.pos.z, { count: 12, color: '#a8a4d8', speed: 2.5, life: 0.5 });
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
    if (G.world.entities.includes(p)) G.world.remove(p);
    else p.removeModel?.();
  },

  // --- familier du joueur
  data() { return G.player?.data; },
  recs() { const d = this.data(); return d ? (d.pets ||= []) : []; },
  activeRec() { const d = this.data(); return d ? this.recs().find((r) => r.uid === d.petActive) || null : null; },

  summonActive(silent = false) {
    const P = G.player;
    const rec = this.activeRec();
    if (!P || !rec || P.dead || this.active) return;
    if (!MOB_BY_ID[rec.mob]) return;
    const x = P.pos.x - Math.sin(P.ry) * 2, z = P.pos.z - Math.cos(P.ry) * 2;
    const p = new Pet(P, rec.mob, { rec, level: Math.min(rec.level, P.level) });
    p.pos.set(x, getHeight(x, z), z);
    p.createModel(G.scene);
    if (rec.hpK !== undefined) p.hp = Math.max(1, p.stats.maxHp * rec.hpK);
    p.mode = P.data.petMode || 'assist';
    if (P.data.petStay) P.data.petStay = false;
    G.world.add(p);
    this.list.push(p);
    this.active = p;
    if (!silent) { pillar(x, getHeight(x, z), z, PET_RARITY[rec.rarity].color, 24, 2.5); G.audio?.play('learn'); }
    G.ui?.refresh?.();
  },
  dismiss() {
    const P = G.player;
    if (this.active) { this.expire(this.active); this.active = null; }
    if (P) { P.data.petActive = null; P.data.petDismissed = true; }
    G.ui?.refresh?.();
  },
  setActive(uid) {
    const P = G.player;
    if (!P) return;
    if (this.active) { this.expire(this.active, true); this.active = null; }
    P.data.petActive = uid;
    P.data.petDismissed = false;
    this.respawnAt = 0;
    this.summonActive();
  },
  setMode(mode) {
    const P = G.player;
    if (!P || !PET_MODES[mode]) return;
    P.data.petMode = mode;
    if (this.active) { this.active.mode = mode; if (mode === 'passive') { this.active.target = null; this.active.windup = null; this.active.forceTarget = null; this.active.forceT = 0; } }
    G.ui?.notify(`Familier : mode ${PET_MODES[mode].name.toLowerCase()}.`);
    G.ui?.refresh?.();
  },
  // rôle du familier actif (tank, dégâts, soigneur), mémorisé pour chaque familier
  setRole(role, uid = null) {
    const rec = uid ? this.recs().find((r) => r.uid === uid) : this.activeRec();
    if (!rec || !PET_ROLES[role]) return;
    rec.role = role;
    const a = this.active;
    if (a && !a.dead && a.rec === rec) {
      const k = a.hp / (a.stats.maxHp || 1);
      a.statsDirty = true; a.recalc();
      a.hp = Math.max(1, a.stats.maxHp * k);
      pillar(a.pos.x, a.pos.y, a.pos.z, role === 'dps' ? '#ff7a5a' : role === 'tank' ? '#7fb8ff' : '#8fe86a', 16, 1.6);
    }
    G.ui?.notify(`${rec.name} devient ${role === 'heal' ? 'soigneur' : role === 'tank' ? 'tank' : 'combattant (dégâts)'}.`);
    G.ui?.refresh?.();
    G.saveSoon?.();
  },
  // ordres façon grand MMO : attaquer la cible, suivre, rester sur place
  command(cmd) {
    const P = G.player;
    const a = this.active;
    if (!P) return;
    if (!a || a.dead) { G.ui?.error(a ? 'Votre familier est mort.' : "Vous n'avez pas de familier actif (touche Y)."); return; }
    if (cmd === 'attack') {
      const t = P.target;
      if (!t || t.dead || !canAttack(a, t)) { G.ui?.error('Choisissez une cible hostile.'); return; }
      a.forceTarget = t; a.forceT = 30; a.target = t;
      if (a.stayAt) a.stayAt = null;
      P.data.petStay = false;
      if (a.model) a.model.play('roar', 0.5);
      G.ui?.notify(`${a.name} attaque ${t.name}.`);
    } else if (cmd === 'follow') {
      a.stayAt = null; a.forceTarget = null; a.forceT = 0;
      P.data.petStay = false;
      G.ui?.notify(`${a.name} vous suit.`);
    } else if (cmd === 'stay') {
      a.stayAt = { x: a.pos.x, z: a.pos.z };
      P.data.petStay = true;
      G.ui?.notify(`${a.name} reste ici.`);
    }
    G.ui?.refresh?.();
  },
  // Chasseur : un familier permanent dès le départ
  ensureHunterPet() {
    const P = G.player;
    if (!P || P.cls !== 'archer') return;
    const recs = this.recs();
    if (!recs.length) {
      const mob = HUNTER_STARTER[P.faction] || 'loup_pres';
      const def = MOB_BY_ID[mob];
      const rec = { uid: 'p' + Date.now().toString(36) + Math.floor(R() * 1296).toString(36), mob, name: def ? def.name : 'Compagnon', level: P.level, xp: 0, rarity: 1, q: 60, role: 'dps', starter: true };
      recs.push(rec);
      P.data.petActive = rec.uid;
      G.ui?.log(`Votre compagnon de chasse, ${rec.name}, vous accompagne. Donnez-lui des ordres et un rôle (tank, dégâts ou soigneur) avec la barre du familier.`, 'sys');
    } else if (!P.data.petActive && !P.data.petDismissed) P.data.petActive = recs[0].uid;
    // le compagnon du chasseur suit toujours le niveau de son maître
    for (const r of recs) if (r.starter && r.level < P.level) { r.level = P.level; r.xp = 0; }
  },
  // Chasseur : apprivoiser une bête (elle quitte le monde et rejoint la ménagerie)
  tame(t) {
    const P = G.player;
    if (!P || !t || t.dead || t.kind !== 'mob') return false;
    const recs = this.recs();
    if (recs.length >= PET_MAX) { G.ui?.error(`Ménagerie pleine (${PET_MAX} familiers).`); return false; }
    const rarity = t.elite || t.named ? 1 : 0;
    const rec = { uid: 'p' + Date.now().toString(36) + Math.floor(R() * 1296).toString(36), mob: t.def.id, name: t.def.name, level: Math.min(P.level, t.level), xp: 0, rarity, q: 35 + Math.floor(R() * 50), role: 'dps' };
    recs.push(rec);
    // la bête disparaît du monde (elle réapparaîtra plus tard à son point d'origine)
    pillar(t.pos.x, t.pos.y, t.pos.z, '#8fe86a', 24, 2);
    if (t.spawn) { t.spawn.ent = null; t.spawn.deadUntil = G.time + (t.spawn.respawn || 60); }
    G.world.remove(t);
    G.ui?.announce('Bête apprivoisée !', 'quest', `${rec.name} (${PET_RARITY[rarity].name}, qualité ${rec.q} %) rejoint votre ménagerie.`);
    G.audio?.play('questdone');
    this.setActive(rec.uid);
    G.saveSoon?.();
    return true;
  },
  // Chasseur : ressusciter ou soigner son familier
  revive() {
    const P = G.player;
    const rec = this.activeRec();
    if (!rec) { G.ui?.error("Vous n'avez pas de familier."); return false; }
    if (this.active && !this.active.dead) { G.ui?.error('Votre familier est en vie.'); return false; }
    if (this.active) { this.expire(this.active, true); this.active = null; }
    rec.hpK = 0.6;
    this.respawnAt = 0;
    this.summonActive();
    return true;
  },
  // avant de quitter une partie : oublier les entités (le monde est vidé)
  reset() { this.list = []; this.active = null; this.respawnAt = 0; clearTotems(); },

  update(dt) {
    const P = G.player;
    updateTotems(dt);
    if (!P) return;
    const a = this.active;
    if (a) {
      if (a.rec) a.rec.hpK = a.dead ? 0.5 : a.hp / a.stats.maxHp;
      if (a.dead) {
        if (!this.respawnAt) { const t = P.cls === 'archer' ? 15 : 30; this.respawnAt = G.time + t; G.ui?.log(`${a.name} est tombé. Il reviendra dans ${t} s${P.cls === 'archer' ? ' (ou tout de suite avec Ressusciter le familier)' : ''}.`, 'sys'); }
        if (a.deathT > 5) { this.expire(a, true); this.active = null; }
      }
    } else if (P.data.petActive && !P.dead && G.time >= this.respawnAt) {
      this.respawnAt = 0;
      const rec = this.activeRec();
      if (rec && (rec.hpK ?? 1) <= 0.01) rec.hpK = 0.5;
      this.summonActive(true);
    }
    // nettoyage des invocations mortes
    for (const p of this.list.slice()) if (p !== this.active && p.dead && p.deathT > 6) this.expire(p, true);
  },

  // --- expérience et butin
  onMobKilled(m, credited) {
    const P = G.player;
    if (!credited || !P) return;
    const a = this.active, rec = this.activeRec();
    if (rec) {
      const d = m.level - rec.level;
      const lf = d >= 0 ? 1 + Math.min(d, 5) * 0.06 : d <= -6 ? 0.1 : 1 + d * 0.12;
      const xp = mobXpBase(m.level) * lf * (m.elite ? 3 : m.boss ? 10 : 1) * (m.def.xp ?? 1) * 0.9;
      this.gainXp(rec, xp);
      if (a && a.level !== rec.level) { a.level = rec.level; a.statsDirty = true; }
    }
    this.rollDrop(m);
  },
  gainXp(rec, xp) {
    const P = G.player;
    if (rec.level >= Math.min(LEVEL_CAP, P.level)) { rec.xp = Math.min(petXpToNext(rec.level), (rec.xp || 0) + xp); return; }
    rec.xp = (rec.xp || 0) + xp;
    while (rec.level < Math.min(LEVEL_CAP, P.level) && rec.xp >= petXpToNext(rec.level)) {
      rec.xp -= petXpToNext(rec.level);
      rec.level++;
      if (this.active?.rec === rec) { const p = this.active; p.level = rec.level; p.statsDirty = true; p.recalc(); p.hp = p.stats.maxHp; pillar(p.pos.x, p.pos.y, p.pos.z, '#ffe68a', 30, 2.5); }
      G.ui?.notify(`${rec.name} atteint le niveau ${rec.level} !`);
    }
  },
  dropChance(m) {
    if (m.temp || m.kind !== 'mob') return 0;
    const d = m.def;
    if (m.worldBoss) return 0.0005;
    if (d.raidBoss) return 0.0008;
    if (d.dungeonBoss) return 0.0018;
    if (m.boss) return 0.0025;
    if (m.named) return 0.003;
    if (m.elite) return 0.004;
    return 0.009;
  },
  rarityFor(m) {
    if (m.worldBoss || m.def.raidBoss) return 3;
    if (m.boss || m.def.dungeonBoss) return 2;
    if (m.elite || m.named) return 1;
    return 0;
  },
  rollDrop(m, mult = 1) {
    const ch = this.dropChance(m) * mult * (G.flags.petLuck || 1);
    if (!(R() < ch)) return null;
    const rar = this.rarityFor(m);
    const q = clamp(Math.round([0, 30, 50, 70][rar] + Math.pow(R(), 1.6) * (100 - [0, 30, 50, 70][rar])), 0, 100);
    const it = makePetStone(m.def.id, rar, q);
    G.inv?.add(it);
    G.ui?.announce('Pierre d\'âme !', 'quest', `${m.def.name} (${PET_RARITY[rar].name}) peut devenir votre familier. Clic droit sur la pierre dans votre sac.`);
    G.audio?.play('epic');
    return it;
  },
  learn(it) {
    const P = G.player;
    if (!P || !MOB_BY_ID[it.mob]) return false;
    const recs = this.recs();
    if (recs.length >= PET_MAX) { G.ui?.error(`Ménagerie pleine (${PET_MAX} familiers).`); return false; }
    const def = MOB_BY_ID[it.mob];
    const rec = { uid: 'p' + Date.now().toString(36) + Math.floor(R() * 1296).toString(36), mob: it.mob, name: def.name, level: Math.max(1, Math.min(P.level, def.lvl[0])), xp: 0, rarity: it.prar ?? 0, q: it.pq ?? 50 };
    recs.push(rec);
    G.ui?.announce('Nouveau familier !', 'level', `${rec.name} rejoint votre ménagerie (touche Y).`);
    G.audio?.play('questdone');
    if (!P.data.petActive) this.setActive(rec.uid);
    G.saveSoon?.();
    return true;
  },
  release(uid) {
    const P = G.player;
    const recs = this.recs();
    const i = recs.findIndex((r) => r.uid === uid);
    if (i < 0) return;
    if (P.data.petActive === uid) this.dismiss();
    const [r] = recs.splice(i, 1);
    G.ui?.notify(`${r.name} retourne à la nature.`);
    G.saveSoon?.();
  },

  // aperçu des caractéristiques (sans entité)
  preview(rec) {
    const def = MOB_BY_ID[rec.mob];
    const L = rec.level;
    const rar = [1, 1.25, 1.6, 2.0][rec.rarity || 0];
    const q = 1 + (rec.q ?? 50) * 0.003;
    const hp = Math.round((30 + L * 26 + L * L * 0.72) * Math.min(1.6, def.hp) * rar * q * 0.95);
    const dmg = (3 + L * 2.6 + L * L * 0.02) * Math.min(1.4, def.dmg) * rar * q * 0.72;
    return { hp, dps: Math.round(dmg / (def.atkSpeed || 2)) };
  },

  renderWindow(b) {
    const P = G.player;
    const recs = this.recs();
    b.innerHTML = '';
    b.style.width = 'min(560px, 92vw)';
    const head = document.createElement('div');
    head.className = 'spread';
    const mode = P.data.petMode || 'assist';
    head.innerHTML = `<div><b>Ménagerie</b> <span class="muted">${recs.length} / ${PET_MAX} familiers</span></div>
      <div class="row">${Object.entries(PET_MODES).map(([k, m]) => `<button class="btn small ${mode === k ? '' : 'ghost'}" data-m="${k}" title="${escapeHtml(m.desc)}">${m.name}</button>`).join('')}</div>`;
    head.querySelectorAll('[data-m]').forEach((x) => (x.onclick = () => { this.setMode(x.dataset.m); G.win.refresh(); }));
    b.appendChild(head);
    const tip = document.createElement('div');
    tip.className = 'muted';
    tip.style.cssText = 'font-size:12.5px;margin:6px 0 10px';
    tip.textContent = '';
    if (!recs.length) {
      const e = document.createElement('div');
      e.className = 'descbox';
      e.textContent = 'Aucun familier.';
      b.appendChild(e);
      return;
    }
    const sorted = recs.slice().sort((a, c) => (c.rarity - a.rarity) || (c.level - a.level));
    for (const r of sorted) {
      const def = MOB_BY_ID[r.mob];
      if (!def) continue;
      const st = this.preview(r);
      const row = document.createElement('div');
      row.className = 'pet-row' + (P.data.petActive === r.uid ? ' on' : '');
      const need = petXpToNext(r.level);
      const xpk = Math.min(1, (r.xp || 0) / need);
      row.innerHTML = `<div class="ic" style="background-image:url(${G.ui.iconUrl(petGlyph(def), PET_RARITY[r.rarity].color)})"></div>
        <div class="bd"><div><b style="color:${PET_RARITY[r.rarity].color}">${escapeHtml(r.name)}</b> <span class="muted">niv. ${r.level} — ${PET_RARITY[r.rarity].name}, qualité ${r.q} %</span></div>
        <div class="muted" style="font-size:12.5px">${escapeHtml(def.family || 'bête')} — ${fmtInt(st.hp)} PV — ~${fmtInt(st.dps)} dégâts/s</div>
        <div class="bar xpb"><div class="f" style="transform:scaleX(${xpk})"></div></div></div>
        <div class="act"></div>`;
      const act = row.querySelector('.act');
      const on = P.data.petActive === r.uid;
      const roles = document.createElement('div');
      roles.className = 'pet-roles';
      for (const [k, R0] of Object.entries(PET_ROLES)) {
        const rb = document.createElement('button');
        rb.className = 'btn small' + ((r.role || 'dps') === k ? '' : ' ghost');
        rb.textContent = R0.name;
        rb.title = R0.desc;
        rb.onclick = () => { this.setRole(k, r.uid); G.win.refresh(); };
        roles.appendChild(rb);
      }
      row.querySelector('.bd').appendChild(roles);
      const bt = document.createElement('button');
      bt.className = 'btn small' + (on ? ' ghost' : '');
      bt.textContent = on ? 'Renvoyer' : 'Invoquer';
      bt.onclick = () => { if (on) this.dismiss(); else this.setActive(r.uid); G.win.refresh(); };
      act.appendChild(bt);
      const rl = document.createElement('button');
      rl.className = 'btn ghost small';
      rl.textContent = 'Relâcher';
      rl.onclick = () => {
        if (rl.dataset.confirm) { this.release(r.uid); G.win.refresh(); return; }
        rl.dataset.confirm = '1'; rl.textContent = 'Confirmer ?'; rl.classList.add('danger');
        setTimeout(() => { if (rl.isConnected) { delete rl.dataset.confirm; rl.textContent = 'Relâcher'; rl.classList.remove('danger'); } }, 3000);
      };
      act.appendChild(rl);
      b.appendChild(row);
    }
  },
};
