import { isInstancePoint } from '../data/world-space.js';
// Monstres : IA (errance, aggro, poursuite, laisse), attaques et capacités spéciales, boss.
import { G } from './state.js';
import { Entity } from './entity.js';
import { createModel } from './models.js';
import { MOB_BY_ID } from '../data/mobs.js';
import {
  dealDamage, heal, addBuff, hasBuff, hasFlag, enemiesAround, dist, edgeDist, canAttack, isPlayerLike, telegraph,
  projectile, dash, knockback, burst, beam, shockRing, after, interrupt,
} from './combat.js';
import { getHeight, canWalk } from '../world/terrain.js';
import { R } from '../core/rng.js';
import { angleTo, wrapAngle, clamp } from '../core/util.js';

const PROJ = { bolt: 'bolt', javelin: 'javelin', arrow: 'arrow', bomb: 'bomb', fire: 'fire', frost: 'frost', nature: 'nature', shadow: 'shadow', wisp: 'wisp', swamp: 'swamp', lightning: 'lightning' };
const SCHOOL = { fire: 'fire', frost: 'frost', nature: 'nature', shadow: 'shadow', wisp: 'arcane', swamp: 'nature', lightning: 'lightning' };

// ---------------------------------------------------------------------------
// Capacités des monstres. cd en secondes ; ok(m,t) : conditions ; use(m,t)
const A = {
  bleed: { passive: true, onHit: (m, t) => { if (R() < 0.25) addBuff(t, 'bleed', m, { dur: 6, value: m.stats.dmg * 0.18 }); } },
  poison: { passive: true, onHit: (m, t) => { if (R() < 0.3) addBuff(t, 'poison', m, { dur: 8, value: m.stats.dmg * 0.16 }); } },
  burn: { passive: true, onHit: (m, t) => { if (R() < 0.3) addBuff(t, 'burn', m, { dur: 6, value: m.stats.dmg * 0.2 }); } },
  charge: { cd: 12, ok: (m, t) => dist(m, t) > 7 && dist(m, t) < 22, use: (m, t) => {
    m.say?.('charge');
    dash(m, t.pos.x - Math.sin(m.ry) * 1.5, t.pos.z - Math.cos(m.ry) * 1.5, 22, () => { if (!t.dead && dist(m, t) < 4) { dealDamage(m, t, m.stats.dmg * 1.3); addBuff(t, 'stun', m, { dur: 1 }); } }, { anim: 'charge' });
  } },
  maul: { cd: 9, ok: (m, t) => edgeDist(m, t) < m.def.atkRange + 0.5, windup: 0.8, anim: 'roar', use: (m, t) => { if (edgeDist(m, t) < m.def.atkRange + 1.5) dealDamage(m, t, m.stats.dmg * 2.1); } },
  howl: { cd: 25, ok: () => true, anim: 'roar', use: (m) => {
    for (const e of G.world.query(m.pos.x, m.pos.z, 14)) if (e.kind === 'mob' && !e.dead && e.faction === m.faction) addBuff(e, 'howl', m, { dur: 10 });
    shockRing(m.pos.x, m.pos.z, 10, '#e04040');
    G.audio?.play('howl', m.pos);
  } },
  web: { cd: 14, ok: (m, t) => dist(m, t) < 20, anim: 'attack', use: (m, t) => projectile(m, t, 'nature', () => { addBuff(t, 'web', m, { dur: 3 }); }, 24) },
  root: { cd: 15, ok: (m, t) => dist(m, t) < 18, anim: 'cast', windup: 1.0, use: (m, t) => { addBuff(t, 'root', m, { dur: 3 }); burst(t.pos.x, t.pos.y + 0.2, t.pos.z, { count: 12, color: '#5a8a3a', speed: 2, vy: 3 }); } },
  heal: { cd: 12, ok: (m) => !!m.hurtAlly(), windup: 1.8, anim: 'cast', use: (m) => { const a = m.hurtAlly(); if (a) { heal(m, a, a.stats.maxHp * 0.3); burst(a.pos.x, a.pos.y + 1, a.pos.z, { count: 14, color: '#8fe86a', vy: 3, speed: 1 }); } } },
  // soin sur soi-même, plus faible et interruptible (ennemis personnels de la voie de l'Ordre)
  mend: { cd: 16, ok: (m) => m.hp < m.stats.maxHp * 0.75, windup: 2.2, anim: 'cast', use: (m) => { heal(m, m, m.stats.maxHp * 0.12); burst(m.pos.x, m.pos.y + 1, m.pos.z, { count: 14, color: '#8fe86a', vy: 3, speed: 1 }); } },
  slowbolt: { cd: 8, ok: (m, t) => dist(m, t) < 20, windup: 1.2, anim: 'cast', use: (m, t) => projectile(m, t, m.def.projectile === 'frost' ? 'frost' : 'swamp', () => { dealDamage(m, t, m.stats.dmg * 1.2, { school: 'frost' }); addBuff(t, 'slow', m, { dur: 4 }); }, 22) },
  stomp: { cd: 13, ok: (m, t) => dist(m, t) < 6, anim: 'slam', use: (m) => {
    const r = 5 + m.radius, x = m.pos.x, z = m.pos.z;
    telegraph(x, z, r, 1.2, () => {
      if (m.dead) return;
      for (const e of enemiesAround(m, x, z, r)) { dealDamage(m, e, m.stats.dmg * 1.8); addBuff(e, 'slow', m, { dur: 3 }); }
      shockRing(x, z, r, '#c8b090'); burst(x, getHeight(x, z) + 0.3, z, { count: 30, color: '#8a7a6a', speed: 7, size: 0.25 });
      if (G.player && dist(G.player, m) < 25) G.cam.shake = 0.3;
    });
    m.lockT = 1.3;
  } },
  firebreath: { cd: 11, ok: (m, t) => dist(m, t) < 10, anim: 'roar', use: (m, t) => cone(m, t, 9 + m.radius, 1.2, 1.0, 2.0, 'fire', '#ff7a2a') },
  firebreath_storm: { cd: 11, ok: (m, t) => dist(m, t) < 22, anim: 'roar', use: (m, t) => cone(m, t, 22, 1.3, 1.6, 2.0, 'lightning', '#7fb8ff') },
  blink: { cd: 11, ok: (m, t) => dist(m, t) < 6 || dist(m, t) > 16, use: (m, t) => {
    burst(m.pos.x, m.pos.y + 1, m.pos.z, { count: 14, color: '#d0b0ff', speed: 3 });
    const a = R() * Math.PI * 2, d = 10;
    const x = t.pos.x + Math.sin(a) * d, z = t.pos.z + Math.cos(a) * d;
    if (canWalk(t.pos.x, t.pos.z, x, z)) m.teleport(x, z);
    burst(m.pos.x, m.pos.y + 1, m.pos.z, { count: 14, color: '#d0b0ff', speed: 3 });
  } },
  enrage: { cd: 999, ok: (m) => m.hp < m.stats.maxHp * 0.3, anim: 'roar', use: (m) => { addBuff(m, 'enrage', m, { dur: 999 }); m.say?.('enrage'); burst(m.pos.x, m.pos.y + 1, m.pos.z, { count: 24, color: '#ff3030', speed: 4 }); } },
  regen: { cd: 20, ok: (m) => m.hp < m.stats.maxHp * 0.7, anim: 'roar', use: (m) => addBuff(m, 'hot', m, { dur: 8, value: m.stats.maxHp * 0.02 }) },
  drain: { cd: 12, ok: (m, t) => dist(m, t) < 18, windup: 1.0, anim: 'cast', use: (m, t) => { addBuff(t, 'drain', m, { dur: 6, value: m.stats.dmg * 0.35 }); beam(m.handPos(), { x: t.pos.x, y: t.pos.y + 1, z: t.pos.z }, '#b58cff', 0.4, 0.3); } },
  slam: { cd: 10, ok: (m, t) => edgeDist(m, t) < m.def.atkRange + 1, anim: 'slam', use: (m, t) => {
    const x = m.pos.x + Math.sin(m.ry) * (2 + m.radius), z = m.pos.z + Math.cos(m.ry) * (2 + m.radius);
    telegraph(x, z, 3.5 + m.radius * 0.5, 1.0, () => {
      if (m.dead) return;
      for (const e of enemiesAround(m, x, z, 3.5 + m.radius * 0.5)) { dealDamage(m, e, m.stats.dmg * 2.4); knockback(e, m.pos.x, m.pos.z, 5); }
      shockRing(x, z, 4, '#c8b090');
    });
    m.lockT = 1.1;
  } },
  leap: { cd: 14, ok: (m, t) => dist(m, t) > 8 && dist(m, t) < 24, use: (m, t) => {
    const x = t.pos.x, z = t.pos.z;
    telegraph(x, z, 4, 0.9, null);
    dash(m, x, z, 24, () => {
      for (const e of enemiesAround(m, m.pos.x, m.pos.z, 4)) dealDamage(m, e, m.stats.dmg * 1.5);
      shockRing(m.pos.x, m.pos.z, 4, '#c8b090');
    }, { arc: 5, anim: 'leap' });
  } },
  shock: { cd: 8, ok: (m, t) => dist(m, t) < 18, windup: 0.8, anim: 'cast', use: (m, t) => {
    const a = m.handPos();
    beam(a, { x: t.pos.x, y: t.pos.y + 1, z: t.pos.z }, '#cfe8ff', 0.3, 0.8);
    dealDamage(m, t, m.stats.dmg * 1.3, { school: 'lightning' });
    const n = enemiesAround(m, t.pos.x, t.pos.z, 8).find((e) => e !== t);
    if (n) { beam({ x: t.pos.x, y: t.pos.y + 1, z: t.pos.z }, { x: n.pos.x, y: n.pos.y + 1, z: n.pos.z }, '#cfe8ff', 0.3, 0.8); dealDamage(m, n, m.stats.dmg * 0.9, { school: 'lightning' }); }
  } },
  bomb: { cd: 7, ok: (m, t) => dist(m, t) < 18, anim: 'throw', use: (m, t) => {
    const x = t.pos.x, z = t.pos.z;
    telegraph(x, z, 3.5, 1.3, () => {
      if (m.dead) return;
      for (const e of enemiesAround(m, x, z, 3.5)) dealDamage(m, e, m.stats.dmg * 1.6, { school: 'fire' });
      burst(x, getHeight(x, z) + 0.5, z, { count: 30, color: '#ffb040', color2: '#555', speed: 7, size: 0.25 });
      G.audio?.play('boom', { x, z });
    });
    projectile(m, { x, y: getHeight(x, z), z }, 'bomb', null, 12, 4);
  } },
  nova_poison: { cd: 18, ok: (m, t) => dist(m, t) < 10, anim: 'roar', use: (m) => nova(m, 9, 1.5, '#9ae040', (e) => { dealDamage(m, e, m.stats.dmg * 1.0, { school: 'poison' }); addBuff(e, 'poison', m, { dur: 8, value: m.stats.dmg * 0.25 }); }) },
  nova_frost: { cd: 16, ok: (m, t) => dist(m, t) < 10, anim: 'roar', use: (m) => nova(m, 9, 1.5, '#8fd8ff', (e) => { dealDamage(m, e, m.stats.dmg * 1.4, { school: 'frost' }); addBuff(e, 'frozen', m, { dur: 2 }); }) },
  meteor: { cd: 18, ok: () => true, anim: 'raise', use: (m) => meteors(m, 3, 5, 2.2, '#ff7a2a', 'fire') },
  meteor_storm: { cd: 16, ok: () => true, anim: 'raise', use: (m) => meteors(m, 5, 6, 1.5, '#7fb8ff', 'lightning') },
  summon_spiders: { cd: 30, ok: (m) => m.hp < m.stats.maxHp * 0.85, anim: 'roar', use: (m) => summon(m, 'araignee_petite', 4, 'La Tisseuse appelle ses rejetons !') },
  summon_frogs: { cd: 28, ok: (m) => m.hp < m.stats.maxHp * 0.8, anim: 'roar', use: (m) => summon(m, 'crapoussin_tetard', 4, 'La Mère Vase pond une nuée de têtards !') },
  summon_skeletons: { cd: 30, ok: (m) => m.hp < m.stats.maxHp * 0.8, anim: 'raise', use: (m) => summon(m, 'squelette_invoque', 4, 'Ossevaine relève les morts !') },
  summon_wisps: { cd: 30, ok: (m) => m.hp < m.stats.maxHp * 0.7, anim: 'raise', use: (m) => summon(m, 'feu_follet', 2, 'La Sorcière invoque des feux-follets !') },
  summon_elementals: { cd: 35, ok: (m) => m.hp < m.stats.maxHp * 0.85, anim: 'roar', use: (m) => summon(m, 'eclair_invoque', 5, "Azhkar déchaîne des étincelles d'orage !") },
};

// Capacités supplémentaires (boss de donjon et de raid), enregistrées depuis d'autres modules
export const EXTRA_ABILITIES = {};
export const MOB_ABILITIES = A;

function cone(m, t, range, angle, delay, mult, school, color) {
  const dir = Math.atan2(t.pos.x - m.pos.x, t.pos.z - m.pos.z);
  m.ry = dir;
  const x = m.pos.x, z = m.pos.z;
  telegraph(x, z, range, delay, () => {
    if (m.dead) return;
    for (const e of enemiesAround(m, x, z, range)) {
      const a = angleTo(x, z, e.pos.x, e.pos.z);
      if (Math.abs(wrapAngle(a - dir)) <= angle / 2) { dealDamage(m, e, m.stats.dmg * mult, { school }); if (school === 'fire') addBuff(e, 'burn', m, { dur: 5, value: m.stats.dmg * 0.2 }); }
    }
    for (let i = 0; i < 40; i++) {
      const a = dir + (R() - 0.5) * angle, d = R() * range;
      burst(x + Math.sin(a) * d, m.pos.y + 1.2, z + Math.cos(a) * d, { count: 1, color, color2: '#ffffff', speed: 1, life: 0.6, size: 0.3 });
    }
  }, { angle, dir, color: '#ff5a2a' });
  m.lockT = delay + 0.2;
}
function nova(m, r, delay, color, fn) {
  const x = m.pos.x, z = m.pos.z;
  telegraph(x, z, r, delay, () => {
    if (m.dead) return;
    for (const e of enemiesAround(m, x, z, r)) fn(e);
    shockRing(x, z, r, color, 0.6);
    burst(x, m.pos.y + 1, z, { count: 40, color, speed: 9, up: 0.3, size: 0.22 });
  });
  m.lockT = delay;
}
function meteors(m, n, r, mult, color, school) {
  const targets = enemiesAround(m, m.pos.x, m.pos.z, 40);
  for (let i = 0; i < n; i++) {
    const t = targets.length ? targets[i % targets.length] : m;
    const x = t.pos.x + (i >= targets.length ? (R() - 0.5) * 16 : (R() - 0.5) * 3), z = t.pos.z + (i >= targets.length ? (R() - 0.5) * 16 : (R() - 0.5) * 3);
    const delay = 1.6 + i * 0.15;
    telegraph(x, z, r, delay, () => {
      if (m.dead) return;
      for (const e of enemiesAround(m, x, z, r)) dealDamage(m, e, m.stats.dmg * mult, { school });
      burst(x, getHeight(x, z) + 0.5, z, { count: 26, color, color2: '#ffffff', speed: 8, size: 0.28 });
      shockRing(x, z, r, color, 0.4);
    });
    after(delay - 0.45, () => projectile({ handPos: () => ({ x: x + 5, y: getHeight(x, z) + 26, z: z - 3 }), pos: m.pos }, { x, y: getHeight(x, z), z }, school === 'fire' ? 'bigfire' : 'lightning', null, 40));
  }
}
function summon(m, id, n, msg) {
  if (G.player && dist(G.player, m) < 60) G.ui?.announce(msg, 'boss');
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = m.pos.x + Math.sin(a) * 4, z = m.pos.z + Math.cos(a) * 4;
    const add = G.world.spawnTemp(id, x, z, m);
    if (add && m.target) { add.threat.set(m.target, 10); add.target = m.target; add.state = 'combat'; }
  }
}

// ---------------------------------------------------------------------------
export class Mob extends Entity {
  constructor(spawn, defId) {
    super('mob');
    const def = MOB_BY_ID[defId || spawn.mob];
    this.def = def;
    this.spawn = spawn;
    this.name = def.name;
    this.level = spawn?.level ?? def.lvl[0];
    this.elite = !!(def.elite || spawn?.elite);
    this.boss = !!def.boss;
    this.worldBoss = !!def.worldBoss;
    this.named = !!def.named;
    this.faction = 2;
    this.passive = def.aggro === 0;
    this.home = { x: spawn?.x ?? 0, z: spawn?.z ?? 0 };
    this.threat = new Map();
    this.tappers = new Set();
    this.tappedByMe = false;
    this.state = 'idle';
    this.swingT = 1 + R();
    this.wanderT = R() * 6;
    this.aggroT = R() * 0.3;
    this.abCd = {};
    this.abilityList = def.abilities;
    for (const id of def.abilities) this.abCd[id] = ((A[id] || EXTRA_ABILITIES[id])?.cd || 10) * (0.3 + R() * 0.5);
    this.lockT = 0;
    this.windup = null;
    this.evadeT = 0;
    this.leash = this.boss ? 80 : this.elite ? 55 : 42;
    // réglages propres aux instances (donjons, raids, Abîme)
    if (spawn?.hpScale) this.hpScale = spawn.hpScale;
    if (spawn?.dmgScale) this.dmgScale = spawn.dmgScale;
    if (spawn?.leash) this.leash = spawn.leash;
  }

  createModel(scene) {
    const spec = this.def.model;
    this.model = createModel(spec);
    if (spec.weapon) this.model.setWeapon(spec.weapon, spec.weaponColors);
    if (spec.offhand) this.model.setOffhand(spec.offhand, spec.offhandColors);
    if (this.elite && !this.named && spec.rig !== 'drake') this.model.root.scale.multiplyScalar(1.15);
    this.radius = this.model.radius;
    scene.add(this.model.root);
    this.recalc();
    if (!this.hpInit) { this.hp = this.stats.maxHp; this.mp = this.stats.maxMp; this.hpInit = true; }
    this.teleport(this.pos.x || this.home.x, this.pos.z || this.home.z);
  }

  hurtAlly() {
    let best = null, bv = 0.55;
    for (const e of G.world.query(this.pos.x, this.pos.z, 20)) {
      if (e.kind !== 'mob' || e.dead || e.faction !== this.faction) continue;
      const k = e.hp / e.stats.maxHp;
      if (k < bv) { bv = k; best = e; }
    }
    return best;
  }

  onThreat(src) {
    if (this.state === 'idle' || this.state === 'wander') {
      this.state = 'combat';
      this.alertFriends(src);
    }
  }

  alertFriends(src) {
    if (!this.def.social) return;
    for (const e of G.world.query(this.pos.x, this.pos.z, 9)) {
      if (e === this || e.kind !== 'mob' || e.dead || e.state === 'combat' || e.state === 'evade') continue;
      const sameGroup = e.spawn?.group && e.spawn.group === this.spawn?.group;
      if (!sameGroup && !(e.def.family === this.def.family && Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < 5)) continue;
      e.threat.set(src, 1);
      e.state = 'combat';
    }
  }

  pickTarget() {
    if (this.forceT > 0 && this.forceTarget && !this.forceTarget.dead) return this.forceTarget;
    let best = null, bv = -1;
    // un boss de donjon ne poursuit pas hors de sa salle
    const room = this.spawn?.enc !== undefined && G.inst?.active ? this.spawn.room : null;
    for (const [e, v] of this.threat) {
      if (e.dead || !canAttack(this, e) || dist(this, e) > 70) { this.threat.delete(e); continue; }
      if (room !== null && !G.inst.inRoom(e, room)) continue;
      if (v > bv) { bv = v; best = e; }
    }
    return best;
  }

  findAggro() {
    if (this.passive) return null;
    let best = null, bd = 1e9;
    for (const e of G.world.query(this.pos.x, this.pos.z, 26)) {
      if (!isPlayerLike(e) && !e.guard) continue;
      if (e.dead || !canAttack(this, e) || hasFlag(e, 'stealth')) continue;
      if (e.kind === 'npc' && !e.guard) continue;
      if (e.flying && e.pos.y - e.groundY() > 4) continue; // hors d'atteinte en vol
      const lvlDiff = this.level - (e.level || 1);
      let r = (this.spawn?.aggro || this.def.aggro || 11) * clamp(1 + lvlDiff * 0.07, 0.45, 1.6) * (this.boss && !this.spawn?.aggro ? 1.2 : 1);
      if (e.pmods?.beastAggroPct && (this.def.family || 'bête') === 'bête') r *= 1 + e.pmods.beastAggroPct;
      const d = dist(this, e);
      if (d < r && d < bd) {
        // en donjon, pas d'aggro à travers les murs
        if (isInstancePoint(this.pos.x, this.pos.z) && G.inst?.active && !G.inst.los(this.pos.x, this.pos.z, e.pos.x, e.pos.z)) continue;
        bd = d; best = e;
      }
    }
    return best;
  }

  evade() {
    this.state = 'evade';
    this.threat.clear();
    this.target = null;
    this.forceTarget = null;
    interrupt(this);
    addBuff(this, 'immune', this, { dur: 8 });
    this.tappers.clear();
    this.tappedByMe = false;
  }

  update(dt) {
    let moved = false;
    this.speedNow = 0;
    if (this.forceT > 0) this.forceT -= dt;
    if (this.dead) {
      this.deathT += dt;
      this.updateBase(dt);
      this.syncModel(dt);
      return;
    }
    const stunned = this.stunned;
    if (this.lockT > 0) this.lockT -= dt;
    for (const k in this.abCd) this.abCd[k] -= dt;

    if (this.state === 'evade') {
      const arrived = this.moveTowards(this.home.x, this.home.z, dt, 1.5, (this.stats.moveSpeed || 5) * 1.6);
      moved = this.speedNow > 0.1;
      this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * 0.3 * dt);
      if (arrived || this.stuckT > 3) {
        if (this.stuckT > 3) this.teleport(this.home.x, this.home.z);
        this.state = 'idle'; this.hp = this.stats.maxHp;
        const im = hasBuff(this, 'immune'); if (im) im.t = im.dur;
      }
    } else if (!stunned) {
      let t = this.state === 'combat' ? this.pickTarget() : null;
      if (!t) {
        if (this.state === 'combat') {
          // plus personne à combattre : retour
          if (Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) > 6) this.evade();
          else this.state = 'idle';
        }
        this.aggroT -= dt;
        if (this.aggroT <= 0) {
          this.aggroT = 0.35;
          const e = this.findAggro();
          if (e) {
            this.threat.set(e, 5);
            this.state = 'combat';
            this.alertFriends(e);
            if (this.named && !this.spawn?.inst && G.player && dist(G.player, this) < 50) G.ui?.announce(`${this.name} vous a repéré !`, 'boss');
            t = e;
          }
        }
        if (!t && !this.cast) {
          // errance
          this.wanderT -= dt;
          if (this.wanderT <= 0) {
            this.wanderT = 4 + R() * 8;
            const a = R() * Math.PI * 2, r = R() * (this.spawn?.wander ?? 7);
            this.wanderTo = { x: this.home.x + Math.sin(a) * r, z: this.home.z + Math.cos(a) * r };
          }
          if (this.wanderTo) {
            if (this.moveTowards(this.wanderTo.x, this.wanderTo.z, dt, 0.6, (this.stats.moveSpeed || 5) * 0.35)) this.wanderTo = null;
            moved = this.speedNow > 0.1;
            if (this.stuckT > 2) this.wanderTo = null;
          }
        }
      }
      if (t) {
        this.target = t;
        const dh = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
        if (dh > this.leash && !this.worldBoss) { this.evade(); }
        else moved = this.combat(dt, t);
      } else this.target = null;
    }
    this.updateBase(dt, moved);
    this.syncModel(dt);
  }

  combat(dt, t) {
    const d = edgeDist(this, t);
    const range = this.def.atkRange;
    let moved = false;
    if (this.windup) {
      this.windup.t -= dt;
      this.faceTo(t.pos.x, t.pos.z);
      if (this.windup.t <= 0) { const w = this.windup; this.windup = null; if (!this.dead && !this.stunned) w.fn(); }
      return false;
    }
    if (this.cast || this.lockT > 0) { this.faceTo(t.pos.x, t.pos.z); return false; }
    // capacités
    for (const id of this.abilityList) {
      const ab = A[id] || EXTRA_ABILITIES[id];
      if (!ab || ab.passive || (this.abCd[id] ?? 0) > 0) continue;
      if (!ab.ok(this, t)) continue;
      this.abCd[id] = (ab.cd || 10) * (0.85 + R() * 0.3);
      this.faceTo(t.pos.x, t.pos.z);
      if (ab.anim && this.model) this.model.play(ab.anim, ab.windup || 0.6);
      if (ab.windup) {
        this.windup = { t: ab.windup, fn: () => { G.curCaster = this; try { ab.use(this, t); } finally { G.curCaster = null; } }, interruptible: !!ab.interruptible };
        this.castBar = { name: ab.label || abilityName(id), dur: ab.windup, start: G.time, interruptible: !!ab.interruptible };
        if (!this.passive && t === G.player) G.audio?.play('windup', this.pos);
      } else { G.curCaster = this; try { ab.use(this, t); } finally { G.curCaster = null; } }
      return false;
    }
    const kind = this.def.kind;
    const want = kind === 'melee' ? range * 0.85 : range * 0.8;
    if (d > want) {
      this.moveTowards(t.pos.x, t.pos.z, dt, 0.2);
      moved = this.speedNow > 0.1;
      if (this.stuckT > 4) { this.evade(); return moved; }
    } else {
      this.faceTo(t.pos.x, t.pos.z);
      this.swingT -= dt;
      if (this.swingT <= 0) {
        this.swingT = this.def.atkSpeed * (1 / (1 + (this.stats.haste || 0) / 100)) * (0.9 + R() * 0.2);
        this.attack(t);
      }
    }
    // séparation légère entre monstres
    return moved;
  }

  attack(t) {
    const def = this.def;
    if (def.kind === 'melee') {
      if (this.model) this.model.play(R() < 0.5 ? 'attack' : 'attack2', 0.45);
      after(0.18, () => {
        if (this.dead || t.dead || edgeDist(this, t) > def.atkRange + 1.2) return;
        const amt = dealDamage(this, t, this.stats.dmg);
        if (amt > 0) for (const id of this.abilityList) (A[id] || EXTRA_ABILITIES[id])?.onHit?.(this, t);
        if (t === G.player) G.audio?.play('hurt', t.pos);
      });
    } else if (def.kind === 'ranged') {
      if (this.model) this.model.play(def.projectile === 'bomb' || def.projectile === 'javelin' ? 'throw' : 'shoot', 0.5);
      after(0.25, () => {
        if (this.dead || t.dead) return;
        projectile(this, t, PROJ[def.projectile] || 'arrow', () => { dealDamage(this, t, this.stats.dmg * 0.95); for (const id of this.abilityList) (A[id] || EXTRA_ABILITIES[id])?.onHit?.(this, t); }, 30, def.projectile === 'bomb' ? 3 : 0);
      });
    } else {
      // lanceur de sorts : courte incantation
      if (this.model) this.model.play('cast', 1.2);
      this.windup = { t: 1.1, fn: () => {
        projectile(this, t, PROJ[def.projectile] || 'shadow', () => dealDamage(this, t, this.stats.dmg * 1.1, { school: SCHOOL[def.projectile] || 'arcane' }), 24);
        if (this.model) this.model.play('cast', 0.3);
      } };
      this.castBar = { name: 'Sort', dur: 1.1, start: G.time };
    }
  }

  say(what) {
    if (!G.player || dist(G.player, this) > 40) return;
    if (what === 'enrage') G.ui?.floatText(this, 'ENRAGÉ !', 'crit');
  }
}

function abilityName(id) {
  return ({
    maul: 'Coup puissant', heal: 'Soins', mend: 'Soins', slowbolt: 'Trait ralentissant', root: 'Racines', drain: 'Drain de vie', shock: 'Électrocution',
  })[id] || 'Capacité';
}
