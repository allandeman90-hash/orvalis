import { WORLD_SCALE } from '../data/world-space.js';
import { isInstancePoint } from '../data/world-space.js';
// Joueurs simulés : population persistante des deux factions, simulation abstraite à distance,
// IA complète à proximité (farm, JcJ, repos, monture, groupe avec le joueur).
import { G, xpToNext, LEVEL_CAP } from './state.js';
import { Entity } from './entity.js';
import { buildCharacterModel } from './appearance.js';
import { classSkills, SKILL_BY_ID } from '../data/skills.js';
import { makeGear, gearStats, SLOTS } from '../data/items.js';
import { CLASS_LIST, CLASSES } from '../data/classbase.js';
import { specOf, isTank, isHealer, isMelee, validSpec } from '../data/specs.js';
import { autoBuild, computeTal, learnSkills, talentPoints, botSpec, specAbilityIds, basicSkill } from './talents.js';
import { ZONES, ZONE_BY_ID, HUBS, HUB_BY_ID, FACTIONS, LANDMARK_BY_ID } from '../data/zones.js';
import { makeName } from '../data/names.js';
import { useSkill, canAttack, isFriendly, dist, edgeDist, hasFlag, hasBuff, enemiesAround, alliesAround, isPlayerLike, skillCost, dangerAt } from './combat.js';
import { Pets } from './pets.js';
import { weaponAvg } from './stats.js';
import { mobXp } from './progress.js';
import { zoneAt, getHeight, canWalk } from '../world/terrain.js';
import { mulberry32, hashStr, R } from '../core/rng.js';
import { clamp, pick } from '../core/util.js';
import { burst, pillar } from './fx.js';

const ACT_R = 135, DEACT_R = 175;
// provocations disponibles par classe, par ordre de préférence
const TAUNTS = {
  guerrier: ['g_provoc', 'g_cri', 'g_charge'], templier: ['t_defi', 't_onde'], druide: ['d_rugissement'], necro: ['n_provoc'],
};
// capacités d'interruption par classe (portée utile)
const INTERRUPT = {
  guerrier: { id: 'g_heurt', range: 3.4 }, templier: { id: 't_defi', range: 21 }, assassin: { id: 'as_poudre', range: 5.5 },
  archer: { id: 'a_paralysant', range: 29 }, necro: { id: 'n_hurlement', range: 6, self: true }, chaman: { id: 'c_seisme', range: 6, self: true },
};

export function zoneForLevel(level, faction, rnd = Math.random) {
  if (level < 6) return faction ? 'terres' : 'val';
  if (level < 12) return faction ? 'canyon' : 'bois';
  if (level < 18) return 'marais';
  if (level < 24) return 'coeur';
  if (level < 27) return 'pics';
  if (level < 30) return 'desolation';
  return rnd() < 0.5 ? 'cime' : rnd() < 0.5 ? 'desolation' : 'coeur';
}

function zonePoint(zoneId, rnd = Math.random) {
  const areas = [];
  for (const k in G.quests.mobAreas) for (const a of G.quests.mobAreas[k]) if (a.zone === zoneId) areas.push(a);
  if (areas.length) {
    const a = areas[Math.floor(rnd() * areas.length)];
    return { x: a.x + (rnd() - 0.5) * 20, z: a.z + (rnd() - 0.5) * 20 };
  }
  const z = ZONE_BY_ID[zoneId];
  return { x: (z.col - 1) * 330 * WORLD_SCALE, z: (z.row - 1) * 330 * WORLD_SCALE };
}

// ---------------------------------------------------------------------------
export class Bot extends Entity {
  constructor(rec) {
    super('bot');
    this.rec = rec;
    this.name = rec.name;
    this.cls = rec.cls;
    this.faction = rec.faction;
    this.level = rec.level;
    this.radius = 0.45;
    this.thinkT = R() * 0.3;
    this.fameRank = G.pvp?.rankName(rec.fame, rec.faction) || '';
    this.buildGear();
    this.buildSkills();
  }

  get hasMount() { return this.level >= 10; }
  get inMyParty() { return !!this.rec.party; }
  get isLocalParty() { return !!this.rec.party; }

  buildGear() {
    const rec = this.rec;
    const rnd = mulberry32(hashStr(rec.name + '|' + rec.level));
    const equip = {};
    for (const slot of SLOTS) {
      if (slot === 'offhand' && rec.cls === 'archer') continue;
      const q = clamp(Math.round(rec.gearQ + (rnd() - 0.5) * 30), 5, 99);
      equip[slot] = makeGear({ slot, cls: rec.cls, ilvl: Math.max(1, rec.level - (rnd() < 0.5 ? 1 : 0)), quality: q }, rnd);
      if (rec.level >= 12 && rnd() < 0.3) equip[slot].upg = Math.floor(rnd() * Math.min(7, rec.level / 4));
    }
    this.equip = equip;
    const tot = {};
    let wavg = weaponAvg(rec.level) * 0.8;
    for (const s in equip) {
      const st = gearStats(equip[s]);
      for (const k in st) if (k !== 'dmgMin' && k !== 'dmgMax') tot[k] = (tot[k] || 0) + st[k];
      if (s === 'weapon') wavg = (st.dmgMin + st.dmgMax) / 2;
    }
    this.gearStats = tot;
    this.weaponAvg = wavg;
    this.hasShield = !!equip.offhand && (rec.cls === 'guerrier' || rec.cls === 'templier');
    this.statsDirty = true;
  }

  buildSkills() {
    const rec = this.rec;
    rec.spec = validSpec(this.cls, rec.spec || botSpec(this.cls, hashStr(rec.name)));
    this.spec = rec.spec;
    this.talents = autoBuild(this.spec, talentPoints(this.level));
    computeTal(this);
    learnSkills(this, { mount: true });
    this.statsDirty = true;
  }

  createModel(scene) {
    this.model = buildCharacterModel({ cls: this.cls, faction: this.faction, app: this.rec.app, equip: this.equip });
    scene.add(this.model.root);
    this.recalc();
    this.hp = this.stats.maxHp * (this.rec.hpK ?? 1);
    this.mp = this.stats.maxMp;
    this.teleport(this.rec.x, this.rec.z);
  }

  gainXp(xp) {
    const rec = this.rec;
    if (rec.level >= LEVEL_CAP) return;
    rec.xp += xp;
    if (rec.xp >= xpToNext(rec.level)) {
      rec.xp = 0;
      rec.level++;
      this.level = rec.level;
      this.buildGear(); this.buildSkills();
      this.recalc();
      if (this.model) {
        pillar(this.pos.x, this.pos.y, this.pos.z, '#ffe68a', 40, 3);
        const wasM = this.mounted;
        if (wasM) this.dismount();
        this.model.root.parent?.remove(this.model.root); this.model.dispose();
        this.model = buildCharacterModel({ cls: this.cls, faction: this.faction, app: rec.app, equip: this.equip });
        G.scene.add(this.model.root);
      }
      if (rec.party && R() < 0.8) G.chat?.say(this, 'grp', pick(R, ['ding !', `niveau ${rec.level} !`, 'Level up :D', 'ding ' + rec.level]));
    }
  }

  // ---------------------------------------------------------------------------
  update(dt) {
    let moved = false;
    this.speedNow = 0;
    const rec = this.rec;
    if (this.dead) {
      this.deathT += dt;
      this.updateBase(dt);
      this.syncModel(dt);
      // en instance, les membres du groupe sont relevés après le combat (voir instance.js)
      if (this.deathT > 9 && !(rec.party && G.inst?.active)) G.bots.onBotRespawn(this);
      return;
    }
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.2 + R() * 0.1; this.think(); }
    // Chasseur : toujours accompagné de son compagnon de chasse
    if (this.cls === 'archer') {
      this.petT = (this.petT ?? 2) - dt;
      if (this.petT <= 0) {
        this.petT = 12;
        if (!this.mounted && !Pets.minionsOf(this, 'loup_chasse').length) Pets.summonMinion(this, 'loup_chasse', { dur: 3600, hp: 0.5, dmg: 0.45 });
      }
    }
    const S = this.stats;
    // repos
    if (this.resting) {
      if (this.inCombat()) this.resting = false;
      else {
        this.hp = Math.min(S.maxHp, this.hp + S.maxHp * 0.05 * dt);
        this.mp = Math.min(S.maxMp, this.mp + S.maxMp * 0.05 * dt);
        if (this.hp > S.maxHp * 0.95 && this.mp > S.maxMp * 0.9) { this.resting = false; this.model.sitting = false; }
      }
    }
    const t = this.target;
    // esquive : sortir d'une zone annoncée prime sur tout le reste
    if (this.dodgeGoal) {
      const g = this.dodgeGoal;
      const arrived = this.moveTowards(g.x, g.z, dt, 0.4, S.moveSpeed * 1.05);
      moved = this.speedNow > 0.1;
      g.t -= dt;
      if (arrived || g.t <= 0 || this.stuckT > 0.6) this.dodgeGoal = null;
      if (this.healer && !this.cast && this.gcd <= 0) this.healLogic(true);
    } else if (this.healer && !this.resting && !this.cast && this.gcd <= 0 && this.healLogic()) {
      // un soin vient d'être lancé
      if (t && !t.dead) this.faceTo(t.pos.x, t.pos.z);
    } else if (!this.resting && t && !t.dead && this.goal !== 'flee') {
      const range = this.prefRange(t);
      const d = edgeDist(this, t);
      if (d > range) {
        this.moveTowards(t.pos.x, t.pos.z, dt, 0.2);
        moved = this.speedNow > 0.1;
      } else {
        this.faceTo(t.pos.x, t.pos.z);
        if (this.isRanged() && d < 3.5 && t.kind !== 'mob' && R() < 0.02) this.kite(t);
      }
      if (!this.cast && !this.stunned && this.tryInterrupt()) { /* incantation ennemie coupée */ }
      else if (!this.cast && this.gcd <= 0 && !this.stunned) this.useRotation(t, d);
    } else if (!this.resting && this.moveGoal) {
      const mg = this.moveGoal;
      if (!this.mounted && this.hasMount && !this.inCombat() && Math.hypot(mg.x - this.pos.x, mg.z - this.pos.z) > 45 && !this.cast && R() < 0.02) { this.mount(); }
      const arrived = this.moveTowards(mg.x, mg.z, dt, mg.stop || 1.5, mg.speed);
      moved = this.speedNow > 0.1;
      if (arrived) { this.moveGoal = null; if (this.mounted && !rec.party) this.dismount(); }
      if (this.stuckT > 2.5) { this.moveGoal = null; this.stuckT = 0; rec.dest = null; }
    }
    this.updateBase(dt, moved);
    this.syncModel(dt);
    rec.x = this.pos.x; rec.z = this.pos.z;
    rec.hpK = this.hp / this.stats.maxHp;
  }

  get healer() { return isHealer(this); }
  isRanged() { return !isMelee(this); }
  prefRange(t) {
    if (isMelee(this)) return this.cls === 'assassin' ? 2.3 : 2.6;
    if (this.healer && this.rec.party) return 17;
    return t.kind === 'mob' && t.def?.kind === 'melee' ? 18 : 20;
  }
  kite(t) {
    const a = Math.atan2(this.pos.x - t.pos.x, this.pos.z - t.pos.z);
    const x = this.pos.x + Math.sin(a) * 8, z = this.pos.z + Math.cos(a) * 8;
    if (canWalk(this.pos.x, this.pos.z, x, z)) { this.moveGoal = { x, z, stop: 0.5 }; }
  }

  // coupe une capacité interruptible (soins de boss…) si la classe en a les moyens
  tryInterrupt() {
    const sk = INTERRUPT[this.cls];
    if (!sk || !this.skills[sk.id] || (this.cds[sk.id] || 0) > 0 || SKILL_BY_ID[sk.id].lvl > this.level) return false;
    if (this.rec.react === undefined) this.rec.react = 0.25 + R() * 0.6;
    for (const e of G.world.query(this.pos.x, this.pos.z, sk.range + 3)) {
      if (e.kind !== 'mob' || e.dead || !e.windup?.interruptible || !canAttack(this, e)) continue;
      if (G.time - (e.castBar?.start ?? G.time) < this.rec.react) continue;
      if (edgeDist(this, e) > sk.range) continue;
      if (this.tryCast(sk.id, sk.self ? this : e)) {
        if (this.rec.party && R() < 0.4) G.chat?.say(this, 'grp', pick(R, ['Interrompu !', 'Coupé !', 'Pas si vite…', 'Kick !']));
        return true;
      }
    }
    return false;
  }

  // point atteignable (dans les donjons : sans traverser de mur)
  reach(x, z) {
    if (!canWalk(this.pos.x, this.pos.z, x, z)) return false;
    return !(isInstancePoint(this.pos.x, this.pos.z) && G.inst?.active) || G.inst.los(this.pos.x, this.pos.z, x, z);
  }

  // s'écarter des alliés (Condamnation) ou fuir un boss (Traque)
  spreadFrom(cx, cz, d, t) {
    const base = Math.hypot(this.pos.x - cx, this.pos.z - cz) > 0.5 ? Math.atan2(this.pos.x - cx, this.pos.z - cz) : R() * Math.PI * 2;
    for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, Math.PI]) {
      const a = base + off;
      const x = this.pos.x + Math.sin(a) * d, z = this.pos.z + Math.cos(a) * d;
      if (!this.reach(x, z) || dangerAt(x, z, 0.3)) continue;
      this.dodgeGoal = { x, z, t };
      return true;
    }
    return false;
  }

  // cherche un point hors de la zone dangereuse
  dodge(dz) {
    let a;
    if (dz.angle) {
      const rel = Math.atan2(this.pos.x - dz.x, this.pos.z - dz.z);
      const side = Math.sin(rel - dz.dir) >= 0 ? 1 : -1;
      a = dz.dir + side * (dz.angle / 2 + 0.9);
      const x = dz.x + Math.sin(a) * Math.max(3, Math.hypot(this.pos.x - dz.x, this.pos.z - dz.z)), z = dz.z + Math.cos(a) * Math.max(3, Math.hypot(this.pos.x - dz.x, this.pos.z - dz.z));
      this.dodgeGoal = { x, z, t: 1.6 };
      return;
    }
    const d = Math.hypot(this.pos.x - dz.x, this.pos.z - dz.z);
    a = d > 0.3 ? Math.atan2(this.pos.x - dz.x, this.pos.z - dz.z) : R() * Math.PI * 2;
    const need = dz.r - d + 2.2;
    let best = null;
    for (const off of [0, 0.7, -0.7, 1.4, -1.4, Math.PI]) {
      const aa = a + off;
      const x = this.pos.x + Math.sin(aa) * need, z = this.pos.z + Math.cos(aa) * need;
      if (!this.reach(x, z) || dangerAt(x, z, 0.3)) continue;
      best = { x, z, t: 1.8 }; break;
    }
    this.dodgeGoal = best || { x: this.pos.x + Math.sin(a) * need, z: this.pos.z + Math.cos(a) * need, t: 1.5 };
  }

  think() {
    const rec = this.rec;
    const S = this.stats;
    const hpK = this.hp / S.maxHp;
    const P = G.player;
    if (!this.dodgeGoal && !this.dashing) {
      const dz = dangerAt(this.pos.x, this.pos.z, 0.7);
      if (dz && dz.src !== this && (!this.boldT || rec.party)) { this.dodge(dz); return; }
      // mécaniques de boss : condamné → s'éloigner des alliés ; traqué → fuir le boss
      if (hasBuff(this, 'doom')) {
        let cx = 0, cz = 0, n = 0;
        for (const a of alliesAround(this, this.pos.x, this.pos.z, 14, false)) { cx += a.pos.x; cz += a.pos.z; n++; }
        if (n && this.spreadFrom(cx / n, cz / n, 10, 2.2)) return;
      }
      const fx = hasBuff(this, 'fixate');
      if (fx && fx.src && !fx.src.dead && !isTank(this) && dist(this, fx.src) < 12) {
        if (this.spreadFrom(fx.src.pos.x, fx.src.pos.z, 9, 1.2)) return;
      }
    }
    // cible actuelle invalide ?
    if (this.target && (this.target.dead || !canAttack(this, this.target) || dist(this, this.target) > 45)) this.target = null;
    // fuite si très faible face à un joueur ennemi
    if (this.target && isPlayerLike(this.target) && hpK < 0.2 && rec.brave < 0.5 && !rec.party) {
      this.goal = 'flee';
      const a = Math.atan2(this.pos.x - this.target.pos.x, this.pos.z - this.target.pos.z);
      this.moveGoal = { x: this.pos.x + Math.sin(a) * 30, z: this.pos.z + Math.cos(a) * 30, speed: S.moveSpeed * 1.05 };
      this.target = null;
      if (this.cls === 'mage') this.tryCast('m_transfert', this);
      return;
    }
    if (this.goal === 'flee' && !this.moveGoal) this.goal = null;
    // soin d'urgence
    if (hpK < 0.35) {
      if (this.cls === 'guerrier') { this.tryCast('g_souffle', this) || this.tryCast('g_mur', this); }
      if (this.cls === 'templier') { this.tryCast('t_rempart', this) || this.tryCast('t_egide', this); }
      if (this.cls === 'mage') this.tryCast('m_bouclier', this);
      if (this.cls === 'necro') this.tryCast('n_os', this);
      if (this.cls === 'assassin') this.tryCast('as_esquive', this);
      if (this.cls === 'druide') this.tryCast('d_soin', this);
      if (this.cls === 'chaman') this.tryCast('c_onde', this);
      for (const id of specAbilityIds(this.spec)) if (SKILL_BY_ID[id]?.ai?.t === 'defensive') this.tryCast(id, this);
    }
    // qui m'attaque ?
    let attacker = null;
    for (const e of G.world.query(this.pos.x, this.pos.z, 30)) {
      if (e.dead || !canAttack(this, e)) continue;
      if (e.target === this || (e.threat && e.threat.has(this))) { attacker = e; break; }
    }
    // groupe avec le joueur : rôles (tank qui reprend les monstres, dégâts qui assistent le tank)
    if (rec.party && P) {
      const pd = dist(this, P);
      const members = G.party?.members || [P];
      const pt = P.target && canAttack(P, P.target) && (P.inCombat() || P.engaged === P.target) ? P.target : null;
      let loose = null, groupFoe = null, bd = 1e9;
      const C = P.dead || pd > 45 ? this : P; // joueur mort ou loin : on regarde autour de soi
      for (const m of G.world.query(C.pos.x, C.pos.z, 38)) {
        if (m.kind !== 'mob' || m.dead || !canAttack(this, m) || m.state === 'evade') continue;
        const hitsAlly = m.target && members.includes(m.target);
        const inFight = hitsAlly || [...m.threat.keys()].some((k) => members.includes(k));
        if (!inFight) continue;
        const d = dist(this, m) + (m.elite || m.boss ? -6 : 0);
        if (hitsAlly && m.target !== this && !isTank(m.target) && (!loose || d < dist(this, loose))) loose = m;
        if (d < bd) { bd = d; groupFoe = m; }
      }
      const tank = members.find((m) => m !== this && !m.dead && isTank(m));
      const tankT = tank && tank.target && canAttack(this, tank.target) && !tank.target.dead && tank.target.kind === 'mob' ? tank.target : null;
      if (isTank(this)) {
        if (loose) {
          this.target = loose;
          this.tauntLoose(loose);
        } else if (pt && dist(this, pt) < 40) this.target = pt;
        else if (groupFoe && (!this.target || this.target.dead)) this.target = groupFoe;
        else if (attacker && (!this.target || this.target.dead)) this.target = attacker;
      } else {
        if (tankT && dist(this, tankT) < 40 && (tankT.state === 'combat')) this.target = tankT;
        else if (pt && dist(this, pt) < 40) this.target = pt;
        else if (groupFoe && (!this.target || this.target.dead)) this.target = groupFoe;
        else if (attacker && (!this.target || this.target.dead)) this.target = attacker;
      }
      if (this.target && (this.target.dead || !canAttack(this, this.target))) this.target = null;
      // boss protégé par ses sbires : les dégâts passent sur les gardiens
      if (this.target && !isTank(this) && this.target.shieldAdds && hasBuff(this.target, 'shielded')) {
        const adds = this.target.shieldAdds.filter((a) => !a.dead);
        if (adds.length) this.target = adds.reduce((b, a) => (dist(this, a) < dist(this, b) ? a : b));
      }
      if (!this.target && !P.inCombat()) this.target = null;
      if (!this.target) {
        const ring = rec.slot >= 5 ? 6.5 : 4;
        if (pd > ring + 3) {
          const a = P.ry + Math.PI + ((rec.slot % 5) - 2) * 0.5 + (rec.slot >= 5 ? 0.25 : 0);
          this.moveGoal = { x: P.pos.x + Math.sin(a) * ring, z: P.pos.z + Math.cos(a) * ring, stop: 1, speed: pd > 20 ? S.moveSpeed * 1.25 : S.moveSpeed };
          if (P.mounted && !this.mounted && this.hasMount) this.mount();
          if (!P.mounted && this.mounted && pd < 12) this.dismount();
          if (pd > 90 && !P.dead && !G.inst?.encounterActive?.()) { this.teleport(P.pos.x + (R() - 0.5) * 6, P.pos.z + (R() - 0.5) * 6); }
        } else this.moveGoal = null;
        const lowMp = this.healer && this.mp / S.maxMp < 0.35;
        if (!P.inCombat() && (hpK < 0.5 || lowMp) && !this.resting && pd < 12) {
          this.rest();
          if (lowMp && R() < 0.5) G.chat?.say(this, 'grp', pick(R, ['Mana, je bois un coup.', 'Pause mana !', 'Je remonte ma mana, 10 s.', 'oom']));
        }
      }
      return;
    }
    if (attacker && (!this.target || this.target.kind === 'mob' && isPlayerLike(attacker))) this.target = attacker;
    if (this.target) return;
    // JcJ opportuniste
    const zone = zoneAt(this.pos.x, this.pos.z);
    const pvpOk = zone.owner !== this.faction;
    if (pvpOk) {
      for (const e of G.world.query(this.pos.x, this.pos.z, 26)) {
        if (!isPlayerLike(e) || e.kind === 'remote' || e.dead || !canAttack(this, e) || hasFlag(e, 'stealth')) continue;
        const ld = e.level - this.level;
        if (ld > 4 && rec.brave < 0.8) continue;
        if (ld < -7) continue;
        if (hpK < 0.6) continue;
        if (R() < rec.aggr) { this.target = e; if (e === P && R() < 0.3) G.chat?.say(this, 'gen', pick(R, ['Pour la faction !', '!!!', 'Ah, un ' + FACTIONS[e.faction].short + ' !', 'Tu vas tomber'])); return; }
      }
    }
    // repos
    if (!this.inCombat() && (hpK < 0.5 || this.mp / S.maxMp < 0.25)) { this.rest(); return; }
    // objectif d'événement
    if (rec.goal && rec.goal.until > G.time) {
      const g = rec.goal;
      const car = g.caravan;
      if (car && !car.dead && car.faction !== this.faction && dist(this, car) < 45) { this.target = car; return; }
      if (car && !car.dead && car.faction === this.faction) { g.x = car.pos.x; g.z = car.pos.z; g.r = 8; }
      if (Math.hypot(g.x - this.pos.x, g.z - this.pos.z) > (g.r || 10)) { this.moveGoal = { x: g.x + (R() - 0.5) * (g.r || 8), z: g.z + (R() - 0.5) * (g.r || 8), stop: 2 }; return; }
      if (g.fight) { const m = this.findMob(40, true); if (m) { this.target = m; return; } }
      return;
    }
    // farm : monstre le plus proche adapté
    const m = this.findMob(38);
    if (m) { this.target = m; if (this.mounted) this.dismount(); return; }
    // errance vers une zone de chasse
    if (!this.moveGoal) {
      if (!rec.dest || Math.hypot(rec.dest.x - this.pos.x, rec.dest.z - this.pos.z) < 6) {
        const zid = zoneForLevel(rec.level, rec.faction);
        rec.dest = zonePoint(zid);
      }
      this.moveGoal = { x: rec.dest.x, z: rec.dest.z, stop: 3 };
    }
  }

  findMob(r, any = false) {
    let best = null, bd = 1e9;
    for (const e of G.world.query(this.pos.x, this.pos.z, r)) {
      if (e.kind !== 'mob' || e.dead || e.passive && !any || e.state === 'evade') continue;
      if (!any && (e.level > this.level + 2 || e.level < this.level - 5)) continue;
      if (!any && (e.elite || e.boss) && this.level < e.level + 3) continue;
      // éviter les monstres déjà engagés par d'autres (sauf événements)
      if (!any && e.target && e.target !== this && !isFriendly(this, e.target)) continue;
      const d = dist(this, e);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  rest() {
    this.resting = true;
    this.moveGoal = null;
    this.target = null;
    if (this.mounted) this.dismount();
    if (this.model) this.model.sitting = true;
  }

  tryCast(id, target) {
    const s = SKILL_BY_ID[id];
    if (!s || !this.skills[id] || s.lvl > this.level) return false;
    if ((this.cds[id] || 0) > 0 || this.mp < skillCost(this, s)) return false;
    if (s.gcd !== false && this.gcd > 0) return false;
    if (this.cast) return false;
    const r = useSkill(this, s, target, { autoTarget: false });
    return r.ok;
  }

  // provocation d'un monstre qui s'en prend à un allié (tanks)
  tauntLoose(m) {
    const d = dist(this, m);
    for (const id of TAUNTS[this.cls] || []) {
      const s = SKILL_BY_ID[id];
      if (!s || !this.skills[id] || (this.cds[id] || 0) > 0) continue;
      if (s.target === 'self') { if (d < (id === 'g_cri' || id === 'd_rugissement' ? 9.5 : 7.5) && this.tryCast(id, this)) return true; }
      else if (id === 'g_charge') { if (d > 7 && d < 22 && this.tryCast(id, m)) return true; }
      else if (d <= (s.range || 20) && this.tryCast(id, m)) return true;
    }
    return false;
  }

  // techniques de spécialisation (indications « ai » des compétences)
  specRotation(t, d) {
    const S = this.stats;
    const hpK = this.hp / S.maxHp, tHpK = t.hp / (t.stats.maxHp || 1);
    for (const id of specAbilityIds(this.spec)) {
      const s = SKILL_BY_ID[id], ai = s?.ai;
      if (!ai || !this.skills[id] || (this.cds[id] || 0) > 0) continue;
      switch (ai.t) {
        case 'form': if (!hasBuff(this, ai.buff) && this.tryCast(id, this)) return true; break;
        case 'summon': if (Pets.minionsOf(this, ai.id).length < (ai.max || 1) && this.tryCast(id, this)) return true; break;
        case 'buff': if (this.inCombat() && (t.elite || t.boss || t.level > this.level || enemiesAround(this, this.pos.x, this.pos.z, 10).length >= 3) && this.tryCast(id, this)) return true; break;
        case 'defensive': if (hpK < (ai.hp || 0.4) && this.tryCast(id, this)) return true; break;
        case 'dot': if (!t.buffs.some((b) => b.def.id === ai.buff && b.src === this) && this.tryCast(id, t)) return true; break;
        case 'consume': if ((t.buffs.find((b) => b.def.id === ai.buff)?.stacks || 0) >= (ai.n || 1) && this.tryCast(id, t)) return true; break;
        case 'aoe': { const c = s.target === 'self' ? this.pos : t.pos; if (enemiesAround(this, c.x, c.z, ai.r || 6).length >= 2 && this.tryCast(id, t)) return true; break; }
        case 'nuke': if (this.tryCast(id, t)) return true; break;
        case 'execute': if (tHpK < (ai.hp || 0.35) && this.tryCast(id, t)) return true; break;
      }
    }
    return false;
  }

  useRotation(t, d) {
    const S = this.stats;
    const hpK = this.hp / S.maxHp;
    const near = enemiesAround(this, this.pos.x, this.pos.z, 6).length;
    const tHpK = t.hp / (t.stats.maxHp || 1);
    const R_ = (id) => this.tryCast(id, t);
    if (this.specRotation(t, d)) return;
    const sp = specOf(this);
    if (sp?.basic) {
      // spécialisations de mêlée d'une classe de lanceurs (ours, félin, chaman amélioration, chevalier d'os)
      if (d > 4.5) return;
      if (this.cls === 'druide') {
        if (hpK < 0.45 && this.tryCast('d_ecorce', this)) return;
        if (hpK < 0.7 && !hasBuff(this, 'hot') && this.tryCast('d_regen', this)) return;
        if (!hasBuff(t, 'swarm') && R_('d_essaim')) return;
      } else if (this.cls === 'chaman') {
        if (this.inCombat() && (t.elite || t.boss || t.level >= this.level) && this.tryCast('c_totem_braise', this)) return;
        if (near >= 2 && this.tryCast('c_seisme', this)) return;
        if (hpK < 0.45 && this.tryCast('c_onde', this)) return;
      } else if (this.cls === 'necro') {
        if (this.inCombat() && !hasBuff(this, 'bone_armor') && this.tryCast('n_os', this)) return;
        if (!hasBuff(t, 'blight') && R_('n_fletrir')) return;
        if (near >= 2 && this.tryCast('n_hurlement', this)) return;
        if (near >= 2 && this.tryCast('n_faux', this)) return;
        if (hpK < 0.65 && R_('n_siphon')) return;
      }
      R_(sp.basic);
      return;
    }
    switch (this.cls) {
      case 'guerrier':
        if (d > 7 && d < 22 && R_('g_charge')) return;
        if (d > 8 && d < 20 && R_('g_bond')) return;
        if (d > 4) return;
        if (hpK < 0.4 && this.tryCast('g_mur', this)) return;
        if (t.level >= this.level && this.tryCast('g_titan', this)) return;
        if (near >= 2 && this.tryCast('g_tourbillon', this)) return;
        if (t.cast && R_('g_heurt')) return;
        if (R_('g_brise')) return;
        if (R_('g_entaille')) return;
        if (isTank(this) && this.inCombat() && R() < 0.1 && this.tryCast('g_cri', this)) return;
        R_('g_frappe');
        return;
      case 'mage':
        if (d < 5 && near >= 1 && this.tryCast('m_nova', this)) return;
        if (this.inCombat() && !hasBuff(this, 'arcane_shield') && this.tryCast('m_bouclier', this)) return;
        if (this.mp < S.maxMp * 0.2 && !this.inCombat() && this.tryCast('m_meditation', this)) return;
        if (t.level >= this.level && this.tryCast('m_surcharge', this)) return;
        if (enemiesAround(this, t.pos.x, t.pos.z, 6).length >= 2 && (R_('m_meteore') || R_('m_pluie'))) return;
        if ((hasBuff(t, 'frozen') || hasBuff(t, 'chill')) && R_('m_lance')) return;
        if (R_('m_chaine')) return;
        if (R() < 0.4 && R_('m_givre')) return;
        R_('m_trait');
        return;
      case 'archer':
        if (d < 5 && this.tryCast('a_bond', this)) return;
        if (t.level >= this.level && this.tryCast('a_deluge', this)) return;
        if (this.tryCast('a_faucon', this)) return;
        if (enemiesAround(this, t.pos.x, t.pos.z, 6).length >= 2 && R_('a_pluie')) return;
        if (!hasBuff(t, 'poison') && R_('a_poison')) return;
        if (R_('a_perforant')) return;
        if (isPlayerLike(t) && !hasBuff(t, 'slow') && R_('a_paralysant')) return;
        if (tHpK > 0.4 && R_('a_vise')) return;
        if (near >= 2 && R_('a_salve')) return;
        R_('a_tir');
        return;
      case 'druide':
        if (hpK < 0.5 && this.tryCast('d_soin', this)) return;
        if (hpK < 0.8 && !hasBuff(this, 'hot') && this.tryCast('d_regen', this)) return;
        if (d < 6 && t.kind !== 'mob' && !hasBuff(t, 'roots_dot') && R_('d_racines')) return;
        if (!hasBuff(t, 'swarm') && R_('d_essaim')) return;
        if (enemiesAround(this, t.pos.x, t.pos.z, 5).length >= 2 && R_('d_orage')) return;
        R_('d_epine');
        return;
      case 'templier':
        if (isTank(this) && d > 6 && d < 22 && t.target && t.target !== this && t.kind === 'mob' && R_('t_defi')) return;
        if (d > 7 && d < 20 && R_('t_jugement')) return;
        if (d > 4) return;
        if (hpK < 0.35 && this.tryCast('t_rempart', this)) return;
        if (hpK < 0.45 && this.tryCast('t_lumiere', this)) return;
        if (this.inCombat() && !hasBuff(this, 'aegis') && this.tryCast('t_egide', this)) return;
        if ((t.level >= this.level || t.elite || t.boss) && this.tryCast('t_ascension', this)) return;
        if (isTank(this) && near >= 2 && this.tryCast('t_onde', this)) return;
        if (near >= 2 && this.tryCast('t_sol', this)) return;
        if (R_('t_verdict')) return;
        if (R_('t_jugement')) return;
        if (this.inCombat() && R() < 0.1 && this.tryCast('t_sceau', this)) return;
        R_('t_coup');
        return;
      case 'assassin':
        if (d > 6 && d < 22 && R_('as_pas')) return;
        if (d > 4) return;
        if (hpK < 0.4 && this.tryCast('as_esquive', this)) return;
        if ((t.level >= this.level || t.elite || t.boss) && this.tryCast('as_frenesie', this)) return;
        if (near >= 2 && this.tryCast('as_danse', this)) return;
        if ((t.elite || t.boss) && !hasBuff(t, 'death_mark') && R_('as_marque')) return;
        if (tHpK < 0.35 && R_('as_execution')) return;
        if (near >= 3 && this.tryCast('as_eventail', this)) return;
        if ((hasBuff(t, 'deadly_poison')?.stacks || 0) < 3 && R_('as_poison')) return;
        if (R_('as_eventrer')) return;
        if (isPlayerLike(t) && R_('as_poudre')) return;
        R_('as_lacer');
        return;
      case 'necro': {
        if (Pets.minionsOf(this, 'squelette_serviteur').length < 2 && this.tryCast('n_squelette', this)) return;
        if (hpK < 0.5 && !hasBuff(this, 'bone_armor') && this.tryCast('n_os', this)) return;
        if (d < 6 && near >= 2 && this.tryCast('n_hurlement', this)) return;
        if ((t.level >= this.level || t.elite || t.boss) && this.tryCast('n_liche', this)) return;
        if ((t.elite || t.boss) && this.tryCast('n_golem', this)) return;
        if ((t.elite || t.boss) && this.tryCast('n_legion', this)) return;
        if (enemiesAround(this, t.pos.x, t.pos.z, 5).length >= 2 && R_('n_deflagration')) return;
        if (!hasBuff(t, 'blight') && R_('n_fletrir')) return;
        if ((t.elite || t.boss || isPlayerLike(t)) && !hasBuff(t, 'affliction') && R_('n_malediction')) return;
        if (d < 8 && this.tryCast('n_faux', this)) return;
        if (hpK < 0.7 && R_('n_siphon')) return;
        R_('n_dard');
        return;
      }
      case 'chaman':
        if (!this.rec.party && hpK < 0.5 && this.tryCast('c_onde', this)) return;
        if (this.inCombat() && (t.elite || t.boss || t.level >= this.level) && this.tryCast('c_totem_braise', this)) return;
        if (enemiesAround(this, t.pos.x, t.pos.z, 6).length >= 2 && R_('c_tempete')) return;
        if (d < 6 && near >= 2 && this.tryCast('c_seisme', this)) return;
        R_('c_arc');
        return;
    }
  }

  // soins : retourne vrai si un soin a été lancé
  healLogic(urgentOnly = false) {
    const inParty = this.rec.party && G.party;
    const allies = inParty ? G.party.members.filter((e) => !e.dead) : alliesAround(this, this.pos.x, this.pos.z, 25);
    let worst = null, wk = 0.8;
    let hurt = 0;
    for (const a of allies) {
      if (a.kind === 'remote' || dist(this, a) > 30) continue;
      const k = a.hp / (a.stats.maxHp || 1);
      // le tank reçoit un peu plus d'attention
      const kk = isTank(a) ? k - 0.08 : k;
      if (k < 0.75) hurt++;
      if (kk < wk) { wk = kk; worst = a; }
    }
    if (!worst) return false;
    if (urgentOnly && wk > 0.35) return false;
    const T = (id, tgt) => this.tryCast(id, tgt);
    for (const id of specAbilityIds(this.spec)) {
      const s = SKILL_BY_ID[id], ai = s?.ai;
      if (!ai || !this.skills[id] || (this.cds[id] || 0) > 0) continue;
      if (ai.t === 'aoeheal' && hurt >= (ai.n || 2) && ((ai.n || 2) < 3 || this.inCombat()) && T(id, this)) return true;
      if (ai.t === 'heal' && wk < (ai.hp || 0.45) && T(id, worst)) return true;
      if (ai.t === 'hot' && wk < (ai.hp || 0.8) && !hasBuff(worst, ai.buff) && T(id, worst)) return true;
    }
    if (this.cls === 'templier' && this.healer) {
      if (wk < 0.28 && worst !== this && T('t_voile', worst)) return true;
      if (wk < 0.5 && !hasBuff(worst, 'aegis') && T('t_egide', worst)) return true;
      if (wk < 0.7 && T('t_lumiere', worst)) return true;
      return false;
    }
    if (this.cls === 'druide') {
      if (wk < 0.3 && T('d_renouveau', worst)) return true;
      if (hurt >= 2 && T('d_cercle', this)) return true;
      if (hurt >= 3 && T('d_floraison', this)) return true;
      if (wk < 0.4 && T('d_ecorce', worst)) return true;
      if (!hasBuff(worst, 'hot') && T('d_regen', worst)) return true;
      if (wk < 0.62 && T('d_soin', worst)) return true;
      return false;
    }
    if (this.cls === 'chaman') {
      if (hurt >= 3 && T('c_maree', this)) return true;
      if (this.inCombat() && hurt >= 2 && T('c_totem_source', this)) return true;
      if (wk < 0.4 && !hasBuff(worst, 'stormscale') && T('c_ecailles', worst)) return true;
      if (hurt >= 2 && wk < 0.72 && T('c_ricochet', worst)) return true;
      if (wk < 0.78 && !hasBuff(worst, 'ancestral') && T('c_esprit', worst)) return true;
      if (wk < 0.62 && T('c_onde', worst)) return true;
      if (inParty && this.inCombat() && G.party.members.length >= 5 && T('c_totem_vents', this)) return true;
      return false;
    }
    if (this.cls === 'templier' && worst !== this) {
      if (wk < 0.28 && T('t_voile', worst)) return true;
      if (wk < 0.4 && !hasBuff(worst, 'aegis') && T('t_egide', worst)) return true;
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
export const Bots = {
  recs: [],
  simT: 0,

  init(saved) {
    const used = new Set();
    const rnd = mulberry32(4242);
    const recs = [];
    const bands = [[1, 5, 9], [5, 10, 8], [10, 16, 7], [16, 22, 6], [22, 27, 5], [27, 31, 5]];
    for (const f of [0, 1]) {
      for (const [lo, hi, n] of bands) {
        for (let i = 0; i < n; i++) {
          const level = Math.min(30, lo + Math.floor(rnd() * (hi - lo)));
          const cls = CLASS_LIST[Math.floor(rnd() * CLASS_LIST.length)];
          const name = makeName(rnd, used);
          recs.push({
            id: 'b_' + name, name, cls, faction: f, level, xp: 0,
            fame: Math.round(Math.max(0, (level - 8) * (20 + rnd() * 90))), kills: 0, pvpKills: Math.floor(level * rnd() * 4),
            gearQ: 30 + rnd() * 45, aggr: 0.2 + rnd() * 0.7, brave: rnd(), chatty: rnd(),
            app: { skin: Math.floor(rnd() * 5), hair: Math.floor(rnd() * 8), hairStyle: Math.floor(rnd() * 5), beard: rnd() < 0.25 },
            online: rnd() < 0.72, sessionT: 300 + rnd() * 2400, x: 0, z: 0, dest: null, ent: null, party: false, slot: 0,
            spec: botSpec(cls, Math.floor(rnd() * 997)),
          });
        }
      }
    }
    // état sauvegardé (niveaux, gloire…)
    if (saved && Array.isArray(saved)) {
      for (const s of saved) {
        const r = recs.find((x) => x.name === s.n);
        if (!r) continue;
        r.level = s.l; r.xp = s.x || 0; r.fame = s.f || 0; r.pvpKills = s.k || 0;
      }
    }
    for (const r of recs) {
      const zid = zoneForLevel(r.level, r.faction, rnd);
      const p = zonePoint(zid, rnd);
      r.x = p.x; r.z = p.z;
    }
    this.recs = recs;
    G.world.on('removed', (e) => { if (e.kind === 'bot' && e.rec) e.rec.ent = null; });
  },

  serialize() {
    return this.recs.filter((r) => !r.temp).map((r) => ({ n: r.name, l: r.level, x: Math.round(r.xp), f: r.fame, k: r.pvpKills }));
  },

  online() { return this.recs.filter((r) => r.online); },

  update(dt) {
    const P = G.player;
    if (!P) return;
    this.simT -= dt;
    const doSim = this.simT <= 0;
    const simDt = 1;
    if (doSim) this.simT = simDt;
    for (const r of this.recs) {
      if (doSim) this.simulate(r, simDt);
      if (!r.online) { if (r.ent) this.deactivate(r); continue; }
      const d = Math.hypot(r.x - P.pos.x, r.z - P.pos.z);
      if (r.ent) {
        if (d > DEACT_R && !r.party && !r.ent.inCombat()) this.deactivate(r);
      } else if (d < ACT_R) this.activate(r);
    }
  },

  activate(r) {
    const b = new Bot(r);
    b.pos.set(r.x, getHeight(r.x, r.z), r.z);
    b.createModel(G.scene);
    r.ent = b;
    G.world.add(b);
  },
  deactivate(r) {
    const e = r.ent;
    if (!e) return;
    r.x = e.pos.x; r.z = e.pos.z;
    G.world.remove(e);
    r.ent = null;
  },

  // simulation abstraite (hors de vue)
  simulate(r, dt) {
    r.sessionT -= dt;
    if (r.sessionT <= 0 && !r.party) {
      r.online = !r.online;
      r.sessionT = r.online ? 900 + R() * 3000 : 300 + R() * 1800;
      if (r.online && R() < 0.5) { const cap = HUB_BY_ID[FACTIONS[r.faction].capital]; r.x = cap.x + (R() - 0.5) * 20; r.z = cap.z + (R() - 0.5) * 20; r.dest = null; }
    }
    if (!r.online || r.ent) return;
    // progression lente
    if (r.level < LEVEL_CAP) {
      r.xp += (mobXp(r.level) / 16) * 0.3 * dt;
      if (r.xp >= xpToNext(r.level)) { r.xp = 0; r.level++; }
    }
    // déplacement vers une destination
    const goal = r.goal && r.goal.until > G.time ? r.goal : null;
    if (!r.dest || Math.hypot(r.dest.x - r.x, r.dest.z - r.z) < 5) {
      if (goal) r.dest = { x: goal.x + (R() - 0.5) * (goal.r || 10), z: goal.z + (R() - 0.5) * (goal.r || 10) };
      else r.dest = R() < 0.9 ? zonePoint(zoneForLevel(r.level, r.faction)) : zonePoint(zoneAt(r.x, r.z).id);
    }
    const dx = r.dest.x - r.x, dz = r.dest.z - r.z;
    const d = Math.hypot(dx, dz);
    const sp = (r.level >= 10 ? 10 : 6) * (goal ? 1.4 : 0.5) * dt;
    if (d > 0.1) { r.x += (dx / d) * Math.min(sp, d); r.z += (dz / d) * Math.min(sp, d); }
  },

  onBotRespawn(b) {
    const r = b.rec;
    const gy = G.world.graveyardFor(b);
    G.world.remove(b);
    r.ent = null;
    r.hpK = 0.7;
    if (r.party && G.player) { r.x = G.player.pos.x + (R() - 0.5) * 6; r.z = G.player.pos.z + (R() - 0.5) * 6; }
    else { r.x = gy.x + (R() - 0.5) * 8; r.z = gy.z + (R() - 0.5) * 8; r.dest = null; }
  },

  byName(n) {
    n = n.toLowerCase();
    return this.recs.find((r) => r.name.toLowerCase() === n);
  },

  // Compagnon IA temporaire (recherche de donjon « Remplir avec l'IA »)
  makeTemp({ cls, spec, level, faction, gearQ = 60 }) {
    const used = new Set(this.recs.map((r) => r.name));
    const rnd = mulberry32((Date.now() ^ (this.recs.length * 7919)) >>> 0);
    const name = makeName(rnd, used);
    const r = {
      id: 'b_' + name, name, cls, faction, level: clamp(level, 1, LEVEL_CAP), xp: 0,
      fame: Math.round(Math.max(0, (level - 8) * (20 + rnd() * 60))), kills: 0, pvpKills: Math.floor(level * rnd() * 3),
      gearQ, aggr: 0.3, brave: 0.8, chatty: 0.3 + rnd() * 0.5,
      app: { skin: Math.floor(rnd() * 5), hair: Math.floor(rnd() * 8), hairStyle: Math.floor(rnd() * 5), beard: rnd() < 0.25 },
      online: true, sessionT: 99999, x: G.player?.pos.x || 0, z: G.player?.pos.z || 0, dest: null, ent: null, party: false, slot: 0, temp: true,
      spec: validSpec(cls, spec),
    };
    this.recs.push(r);
    return r;
  },
  dropTemp(r) {
    if (r.ent) this.deactivate(r);
    const i = this.recs.indexOf(r);
    if (i >= 0) this.recs.splice(i, 1);
  },
  // relève un bot sur place (fin de combat en instance, résurrection par un soigneur)
  reviveAt(b, x, z, k = 0.6) {
    if (!b.dead) return;
    b.dead = false;
    b.deathT = 0;
    b.model?.revive();
    b.teleport(x, z);
    b.recalc();
    b.hp = b.stats.maxHp * k;
    b.mp = b.stats.maxMp * k;
    b.combatT = 99;
    b.target = null; b.moveGoal = null; b.dodgeGoal = null;
    pillar(b.pos.x, b.pos.y, b.pos.z, '#fff4c8', 18, 2.2);
  },
};
