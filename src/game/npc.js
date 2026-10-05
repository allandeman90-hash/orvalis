// PNJ : donneurs de quêtes, marchands, gardes, citoyens et pierres de voyage. Activés à proximité du joueur.
import * as THREE from 'three';
import { G } from './state.js';
import { Entity } from './entity.js';
import { createModel } from './models.js';
import { NPCS, ROLE_NAMES, CITIZEN_LINES } from '../data/npcs.js';
import { HUBS, HUB_BY_ID, FACTIONS } from '../data/zones.js';
import { SKIN_TONES, HAIR_COLORS } from './appearance.js';
import { canAttack, dealDamage, dist, edgeDist, isPlayerLike, hasFlag } from './combat.js';
import { getHeight } from '../world/terrain.js';
import { R, mulberry32, hashStr } from '../core/rng.js';
import { pick } from '../core/util.js';

// Modèle invisible (pour les pierres de voyage)
class FakeModel {
  constructor(h) { this.root = new THREE.Group(); this.height = h; this.radius = 1.2; this.parts = {}; this.mat = { emissive: new THREE.Color() }; }
  update() {} play() {} flash() {} die() {} revive() {} dispose() {} setWeapon() {} setOffhand() {}
}

function npcSpec(def, faction) {
  const L = def.look || {};
  const fac = FACTIONS[faction];
  return {
    rig: 'humanoid', skin: SKIN_TONES[L.skin ?? 1], hair: HAIR_COLORS[L.hair ?? 1], hairStyle: L.hairStyle ?? 0,
    body: L.body || '#6a5a4a', arms: L.body || '#6a5a4a', legs: L.legs || '#4a3a2a', beard: L.beard ? HAIR_COLORS[L.hair ?? 1] : null,
    helmet: L.helmet || null, helmetColor: L.helmetColor || (L.helmet === 'wizard' ? L.body : '#9aa2ae'), helmetAccent: '#d9a441',
    hood: L.hood || null, cape: L.cape || null, fur: L.fur || null, pauldrons: L.pauldrons || null,
    // les PNJ portent des tenues civiles (tablier, gilet) : ni tabard de faction ni épaulières de héros
    tabard: L.tabard === true ? fac.color : null, apron: L.apron ?? null,
    plume: fac.color, scale: 0.97,
  };
}

export class NPC extends Entity {
  constructor(rec) {
    super('npc');
    this.rec = rec;
    this.name = rec.name;
    this.faction = rec.faction;
    this.level = rec.guard ? 35 : 25;
    this.npcRole = rec.role;
    this.npcId = rec.id;
    this.roleName = rec.title || ROLE_NAMES[rec.role] || '';
    this.guard = !!rec.guard;
    this.neutral = !rec.guard;
    this.noTarget = false;
    this.home = { x: rec.x, z: rec.z };
    this.ry = rec.ry || 0;
    this.homeRy = this.ry;
    this.threat = null;
    this.swingT = 1;
    this.talkT = 5 + R() * 20;
    this.wanderT = 3 + R() * 6;
    this.radius = 0.5;
  }

  createModel(scene) {
    if (this.npcRole === 'travel') {
      this.model = new FakeModel(4.8);
      this.radius = 1.3;
    } else {
      const spec = this.rec.guard ? guardSpec(this.faction) : npcSpec(this.rec.def || {}, this.faction);
      this.model = createModel(spec);
      const L = this.rec.def?.look || {};
      const w = this.rec.guard ? (this.faction ? 'axe' : 'sword') : L.weapon;
      if (w) this.model.setWeapon(w, { metal: '#c9ced6' });
      if (this.rec.guard) this.model.setOffhand('shield', { color: FACTIONS[this.faction].color });
      if (this.rec.guard) this.model.root.scale.setScalar(1.12);
    }
    scene.add(this.model.root);
    this.recalc();
    this.stats.maxHp = this.guard ? 9000 : 5000;
    this.stats.power = 420; this.stats.dmg = 260; this.stats.armor = 900; this.stats.dodge = 5; this.stats.moveSpeed = 7.5;
    this.hp = this.stats.maxHp;
    this.teleport(this.home.x, this.home.z);
  }

  recalc() {
    const S = this.stats;
    S.maxHp = this.guard ? 9000 : 5000; S.maxMp = 100; S.power = 420; S.dmg = 260; S.armor = 900; S.crit = 5; S.haste = 0;
    S.moveSpeed = 7.5; S.dmgMul = 1; S.dmgTaken = 1; S.healMul = 1; S.leech = 0; S.dodge = 5; S.block = 0; S.hpRegen = 0; S.mpRegen = 0; S.castMul = 1;
    this.statsDirty = false;
  }

  update(dt) {
    let moved = false;
    this.speedNow = 0;
    const P = G.player;
    if (this.dead) {
      this.deathT += dt;
      if (this.deathT > 60) { this.dead = false; this.hp = this.stats.maxHp; this.model.revive(); this.teleport(this.home.x, this.home.z); }
      this.updateBase(dt); this.syncModel(dt); return;
    }
    if (this.guard) moved = this.guardAI(dt);
    else if (this.rec.citizen) moved = this.citizenAI(dt);
    else if (P && dist(this, P) < 7 && this.npcRole !== 'travel') {
      this.faceTo(P.pos.x, P.pos.z);
    } else this.ry += (this.homeRy - this.ry) * Math.min(1, dt * 2);
    if (this.hp < this.stats.maxHp && !this.inCombat()) this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * 0.05 * dt);
    this.talkT -= dt;
    if (this.talkT <= 0) {
      this.talkT = 25 + R() * 40;
      if (this.rec.citizen && P && dist(this, P) < 25) { this.bubble = pick(R, CITIZEN_LINES); this.bubbleUntil = G.time + 5; }
      else if (this.model && R() < 0.5) this.model.play(R() < 0.5 ? 'wave' : 'raise', 1.2);
    }
    this.updateBase(dt, moved);
    this.syncModel(dt);
  }

  guardAI(dt) {
    // cherche des ennemis proches (joueurs de l'autre faction, monstres)
    this.scanT = (this.scanT || 0) - dt;
    if (this.scanT <= 0) {
      this.scanT = 0.5;
      let best = null, bd = 18;
      for (const e of G.world.query(this.pos.x, this.pos.z, 18)) {
        if (!canAttack(this, e) || e.passive) continue;
        if (e.kind === 'npc') continue;
        if (hasFlag(e, 'stealth')) continue;
        const d = dist(this, e);
        if (d < bd) { bd = d; best = e; }
      }
      if (best && (!this.target || this.target.dead)) this.target = best;
    }
    // coup en cours (délai en temps de jeu, annulé si la cible s'est éloignée ou téléportée)
    if (this.pendingHit) {
      this.pendingHit.t -= dt;
      if (this.pendingHit.t <= 0) {
        const tt = this.pendingHit.tgt;
        this.pendingHit = null;
        if (tt && !tt.dead && edgeDist(this, tt) < 4.5) dealDamage(this, tt, (tt.kind === 'mob' ? tt.stats.maxHp * 0.12 : tt.stats.maxHp * 0.09) + 40);
      }
    }
    const t = this.target;
    if (t && (t.dead || !canAttack(this, t) || Math.hypot(t.pos.x - this.home.x, t.pos.z - this.home.z) > 32)) this.target = null;
    if (this.target) {
      const d = edgeDist(this, this.target);
      if (d > 2.8) { this.moveTowards(this.target.pos.x, this.target.pos.z, dt, 1.5); return this.speedNow > 0.1; }
      this.faceTo(this.target.pos.x, this.target.pos.z);
      this.swingT -= dt;
      if (this.swingT <= 0) {
        this.swingT = 1.6;
        this.model.play('attack', 0.45);
        this.pendingHit = { t: 0.18, tgt: this.target };
      }
      return false;
    }
    // retour au poste / ronde
    if (this.rec.patrol) {
      this.wanderT -= dt;
      if (this.wanderT <= 0) { this.wanderT = 6 + R() * 8; const a = R() * Math.PI * 2; this.wanderTo = { x: this.home.x + Math.sin(a) * 10, z: this.home.z + Math.cos(a) * 10 }; }
      if (this.wanderTo && this.moveTowards(this.wanderTo.x, this.wanderTo.z, dt, 0.8, 2.2)) this.wanderTo = null;
      return this.speedNow > 0.1;
    }
    if (Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) > 1) { this.moveTowards(this.home.x, this.home.z, dt, 0.5, 4); return true; }
    this.ry += (this.homeRy - this.ry) * Math.min(1, dt * 3);
    return false;
  }

  citizenAI(dt) {
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = 5 + R() * 10;
      const a = R() * Math.PI * 2, r = 4 + R() * 14;
      this.wanderTo = { x: this.home.x + Math.sin(a) * r, z: this.home.z + Math.cos(a) * r };
    }
    if (this.wanderTo) {
      if (this.moveTowards(this.wanderTo.x, this.wanderTo.z, dt, 0.6, 1.8) || this.stuckT > 1.5) this.wanderTo = null;
      return this.speedNow > 0.1;
    }
    return false;
  }
}

function guardSpec(f) {
  const fac = FACTIONS[f];
  return {
    rig: 'humanoid', skin: SKIN_TONES[f ? 3 : 1], body: f ? '#3a3434' : '#b8c0cc', arms: f ? '#3a3434' : '#b8c0cc', legs: f ? '#2a2424' : '#6a7280',
    gloves: f ? '#2a2424' : '#9aa2ae', boots: f ? '#1a1414' : '#5a6270', helmet: f ? 'horned' : 'plate', helmetColor: f ? '#4a4040' : '#c4ccd8',
    helmetAccent: '#d9a441', plume: fac.color, tabard: fac.color, cape: fac.dark, pauldrons: f ? '#4a4040' : '#c4ccd8',
  };
}

// ---------------------------------------------------------------------------
// Création des enregistrements de PNJ à partir des emplacements des villes
export function buildNpcRecords(spots) {
  const recs = [];
  for (const def of NPCS) {
    const hub = HUB_BY_ID[def.hub];
    const S = spots[def.hub];
    let p = null;
    if (def.spot.startsWith('quest')) p = S.quest[+def.spot.slice(5)] || S.quest[0];
    else p = S[def.spot];
    if (!p) p = { x: hub.x + 3, z: hub.z + 3, ry: 0 };
    recs.push({ id: def.id, def, name: def.name, title: def.title, role: def.role, faction: hub.faction, hub: def.hub, x: p.x, z: p.z, ry: (p.ry ?? 0) + Math.PI });
  }
  // gardes, citoyens et pierres de voyage
  for (const hub of HUBS) {
    const S = spots[hub.id];
    const rnd = mulberry32(hashStr(hub.id + 'g'));
    (S.guards || []).forEach((g, i) => recs.push({ id: `guard_${hub.id}_${i}`, name: hub.faction ? 'Garde des Clans' : 'Garde du Pacte', title: 'Garde', role: 'guard', guard: true, patrol: !!g.patrol, faction: hub.faction, hub: hub.id, x: g.x, z: g.z, ry: g.ry || 0 }));
    if (S.travel) recs.push({ id: `travel_${hub.id}`, name: 'Pierre de voyage', title: hub.name, role: 'travel', faction: hub.faction, hub: hub.id, x: S.travel.x, z: S.travel.z - 2.4, ry: 0 });
    if (hub.type === 'capital') {
      const names = hub.faction ? ['Grok', 'Silka', 'Bruna', 'Tavok', 'Mira'] : ['Aubin', 'Rosalie', 'Mathis', 'Isolde', 'Léon'];
      for (let i = 0; i < 5; i++) {
        const a = rnd() * Math.PI * 2, r = 8 + rnd() * 16;
        recs.push({ id: `cit_${hub.id}_${i}`, name: names[i], title: 'Habitant', role: 'citizen', citizen: true, faction: hub.faction, hub: hub.id, x: hub.x + Math.cos(a) * r, z: hub.z + Math.sin(a) * r, ry: 0,
          def: { look: { skin: Math.floor(rnd() * 5), hair: Math.floor(rnd() * 8), hairStyle: Math.floor(rnd() * 5), body: ['#8a5a3a', '#5a6a8a', '#7a3a3a', '#6a7a4a', '#8a7a5a'][i] } } });
      }
    }
  }
  return recs;
}

export const NpcManager = {
  recs: [],
  byId: new Map(),
  init(spots) {
    this.recs = buildNpcRecords(spots);
    for (const r of this.recs) this.byId.set(r.id, r);
    G.world.on('removed', (e) => { if (e.kind === 'npc' && e.rec) e.rec.ent = null; });
  },
  update() {
    const P = G.player;
    if (!P) return;
    for (const r of this.recs) {
      const d = Math.hypot(r.x - P.pos.x, r.z - P.pos.z);
      if (r.ent) {
        if (d > 170 && !r.ent.inCombat()) { G.world.remove(r.ent); r.ent = null; }
      } else if (d < 140) {
        const n = new NPC(r);
        n.pos.set(r.x, getHeight(r.x, r.z), r.z);
        n.createModel(G.scene);
        r.ent = n;
        G.world.add(n);
      }
    }
  },
  pos(id) {
    const r = this.byId.get(id);
    return r ? { x: r.x, z: r.z } : null;
  },
};
