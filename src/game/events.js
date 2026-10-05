// Événements du monde, synchronisés sur l'horloge réelle (identiques pour tous les joueurs) :
// boss du monde (toutes les 30 min), Bastion d'Orvalis (point de contrôle), caravanes de ravitaillement (toutes les 20 min).
import * as THREE from 'three';
import { G } from './state.js';
import { Entity } from './entity.js';
import { Bots } from './bots.js';
import { LANDMARK_BY_ID, HUB_BY_ID, FACTIONS } from '../data/zones.js';
import { roadChains, getHeight, zoneAt } from '../world/terrain.js';
import { dist, isPlayerLike, addBuff, removeBuff, hasBuff, dealDamage } from './combat.js';
import { GeoBuilder } from '../engine/geom.js';
import { createModel } from './models.js';
import { Inv } from './inventory.js';
import { makeGear, makeConsumable, makeUnique, rollQuality } from '../data/items.js';
import { rollLoot } from './progress.js';
import { R } from '../core/rng.js';
import { fmtTime, escapeHtml, clamp, pick } from '../core/util.js';
import { burst, pillar } from './fx.js';

const $ = (id) => document.getElementById(id);
const minuteIn = (period) => ((Date.now() / 60000) % period + period) % period;

// ---------------------------------------------------------------------------
// Caravane (chariot + cheval)
class Caravan extends Entity {
  constructor(faction, path) {
    super('npc');
    this.name = faction ? 'Chariot des Clans' : 'Chariot du Pacte';
    this.roleName = 'Caravane de ravitaillement';
    this.faction = faction;
    this.level = 22;
    this.caravan = true;
    this.path = path;
    this.travelTimeout = Math.max(380,path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-path[i].x,p.z-path[i].z),0)/2.4*1.5+60);
    this.pi = 1;
    this.radius = 1.6;
    this.threat = null;
    this.tappers = new Set();
  }
  createModel(scene) {
    const b = new GeoBuilder();
    const col = FACTIONS[this.faction].color;
    b.box(2.2, 0.9, 3.6, '#6b4a2e', 0, 1.0, -0.6);
    b.box(2.3, 1.2, 3.0, '#e8e0cc', 0, 2.0, -0.6);
    b.roof(2.4, 0.8, 3.2, col, 0, 2.6, -0.6, 0);
    for (const [x, z] of [[-1.1, 0.4], [1.1, 0.4], [-1.1, -1.6], [1.1, -1.6]]) b.cyl(0.5, 0.5, 0.2, 8, '#4a3020', x, 0.5, z, 0, 0, Math.PI / 2);
    b.box(0.15, 0.15, 1.8, '#5a3e28', 0, 0.9, 1.9);
    for (let i = 0; i < 3; i++) b.box(0.5, 0.5, 0.5, '#9a7448', -0.5 + i * 0.5, 1.7, -2.3);
    const cart = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    cart.castShadow = true;
    const horse = createModel({ rig: 'quadruped', color: this.faction ? '#5a4a44' : '#8a6a4a', belly: '#b89a7a', len: 1.9, wid: 0.6, hgt: 0.7, legH: 1.0, legW: 0.18, headS: 0.4, headL: 0.6, neck: 0.5, headUp: 0.6, ears: 'pointy', tail: 'long', snoutL: 0.3, mane: '#3a2a1a', saddle: col });
    horse.root.position.z = 3.2;
    const g = new THREE.Group();
    g.add(cart, horse.root);
    this.horse = horse;
    this.model = { root: g, height: 3.4, radius: 1.6, parts: {}, mat: cart.material, baseEmissive: new THREE.Color(),
      update: (dt, sp) => horse.update(dt, sp), play() {}, flash: (c) => { cart.material.emissive.setHex(0x442222); setTimeout(() => cart.material.emissive.setHex(0), 90); }, die() { g.rotation.z = 0.4; }, revive() {}, dispose() { horse.dispose(); cart.geometry.dispose(); } };
    scene.add(g);
    this.stats = { maxHp: 9000, maxMp: 1, armor: 400, power: 1, dmg: 1, crit: 0, haste: 0, moveSpeed: 2.4, dmgMul: 1, dmgTaken: 1, healMul: 1, leech: 0, dodge: 0, block: 0, hpRegen: 0, mpRegen: 0, castMul: 1 };
    this.hp = this.stats.maxHp;
    this.statsDirty = false;
    this.teleport(this.path[0].x, this.path[0].z);
  }
  recalc() { this.statsDirty = false; }
  update(dt) {
    this.speedNow = 0;
    if (!this.dead) {
      const p = this.path[this.pi];
      if (p) {
        if (this.moveTowards(p.x, p.z, dt, 1.2, 2.4)) this.pi++;
        if (this.stuckT > 2) { this.teleport(p.x, p.z); this.pi++; }
      }
    }
    this.updateBase(dt);
    if (!this.dead) this.hp = Math.min(this.stats.maxHp, this.hp);
    this.syncModel(dt);
  }
  get arrived() { return this.pi >= this.path.length; }
}

function chainBetween(aId, bId) {
  // cherche une route reliant les deux hubs
  const A = HUB_BY_ID[aId], B = HUB_BY_ID[bId];
  let best = null, bs = 1e9;
  for (const ch of roadChains) {
    let ia = -1, ib = -1, da = 1e9, db = 1e9;
    ch.forEach((p, i) => {
      const d1 = Math.hypot(p.x - A.x, p.z - A.z), d2 = Math.hypot(p.x - B.x, p.z - B.z);
      if (d1 < da) { da = d1; ia = i; }
      if (d2 < db) { db = d2; ib = i; }
    });
    if (da < 30 && db < 30 && da + db < bs) { bs = da + db; best = ia <= ib ? ch.slice(ia, ib + 1) : ch.slice(ib, ia + 1).reverse(); }
  }
  if (best) return best;
  // sinon : deux segments via le col
  return [{ x: A.x, z: A.z }, { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 }, { x: B.x, z: B.z }];
}

// ---------------------------------------------------------------------------
export const Events = {
  bastion: { owner: -1, p: 0, tickT: 0, flag: null },
  boss: { spawn: null, announced: {}, active: false },
  caravans: [],
  carCycle: -1,

  init() {
    // point d'apparition du boss du monde
    const alt = LANDMARK_BY_ID.autel;
    this.boss.spawn = { id: 'wb', mob: 'azhkar', x: alt.x, z: alt.z - 6, level: 32, eventOnly: true, active: false, respawn: 1e9, wander: 2, group: 'wb', zone: 'cime', boss: true };
    G.world.spawns.push(this.boss.spawn);
    // drapeau du Bastion
    const info = G.landmarks.info.bastion;
    if (info?.flagPos) {
      const b = new GeoBuilder();
      b.box(0.15, 4, 0.15, '#6b4a2e', 0, 2, 0);
      const pole = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
      const flag = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 0.08), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      flag.position.set(1.25, 3.2, 0);
      const g = new THREE.Group();
      g.add(pole, flag);
      g.position.set(info.flagPos.x, info.flagPos.y, info.flagPos.z);
      G.scene.add(g);
      this.bastion.flag = flag;
    }
    // propriétaire initial pseudo-aléatoire selon l'heure
    this.bastion.owner = Math.floor(Date.now() / 3600000) % 2;
    this.bastion.p = this.bastion.owner ? 100 : -100;
    this.applyBastionOwner(true);
    G.world.on('mobKilled', (m, credited) => { if (m.worldBoss) this.onBossKilled(m, credited); });
  },

  bossSoon() {
    const mi = minuteIn(30);
    return mi > 25 || mi < 12 && this.boss.active;
  },

  mapMarks() {
    const out = [];
    if (this.boss.active) out.push({ x: this.boss.spawn.x, z: this.boss.spawn.z, color: '#7fb8ff' });
    const bl = LANDMARK_BY_ID.bastion;
    out.push({ x: bl.x, z: bl.z, color: this.bastion.owner >= 0 ? FACTIONS[this.bastion.owner].color : '#cccccc' });
    for (const c of this.caravans) if (!c.dead) out.push({ x: c.pos.x, z: c.pos.z, color: FACTIONS[c.faction].color });
    return out;
  },

  update(dt) {
    const P = G.player;
    if (!P) return;
    this.updateBoss(dt);
    this.updateBastion(dt);
    this.updateCaravans(dt);
    this.boxT = (this.boxT || 0) - dt;
    if (this.boxT <= 0) { this.boxT = 0.5; this.renderBox(); }
  },

  // ----------------------------- boss du monde -----------------------------
  updateBoss(dt) {
    const mi = minuteIn(30);
    const cycle = Math.floor(Date.now() / 1800000);
    const B = this.boss;
    const ann = (k, title, sub) => { if (B.announced[cycle + k]) return; B.announced[cycle + k] = true; G.ui.announce(title, 'boss', sub); G.audio?.play('horn'); };
    if (mi >= 25 && mi < 25.1) ann('a5', "Le Dévoreur d'Orages approche…", "Il descendra sur l'Autel des Tempêtes (Cime des Tempêtes) dans 5 minutes.");
    if (mi >= 29 && mi < 29.1) ann('a1', "L'orage gronde sur la Cime !", 'Azhkar apparaît dans 1 minute.');
    // les bots de haut niveau convergent
    if ((mi >= 27 || mi < 12) && !B.botsSent) {
      B.botsSent = true;
      const until = G.time + (mi >= 27 ? (30 - mi + 12) * 60 : (12 - mi) * 60);
      for (const r of Bots.recs) if (r.online && r.level >= 25 && !r.party && R() < 0.65) r.goal = { x: B.spawn.x, z: B.spawn.z + 6, r: 16, fight: true, until };
    }
    if (mi >= 12 && mi < 27) B.botsSent = false;
    const shouldBeActive = (mi < 12 || B.forced) && B.killedCycle !== cycle;
    if (shouldBeActive && !B.active) {
      B.active = true;
      B.spawn.active = true;
      B.spawn.deadUntil = 0;
      ann('sp', "Azhkar, le Dévoreur d'Orages, est apparu !", "Rendez-vous à l'Autel des Tempêtes. Les deux factions y sont attendues.");
    }
    if (!shouldBeActive && B.active) {
      B.active = false;
      B.spawn.active = false;
      if (B.spawn.ent && !B.spawn.ent.dead) { G.world.remove(B.spawn.ent); B.spawn.ent = null; if (B.killedCycle !== cycle) G.ui.log("Le Dévoreur d'Orages s'est retiré dans les nuages…", 'evt'); }
    }
    // éclairs d'ambiance près de l'autel
    if (B.active && G.player && dist(G.player, { pos: { x: B.spawn.x, z: B.spawn.z } }) < 150 && R() < dt * 0.3) G.sky.flash = 0.6;
  },

  onBossKilled(m, credited) {
    const cycle = Math.floor(Date.now() / 1800000);
    this.boss.killedCycle = cycle;
    this.boss.active = false;
    this.boss.spawn.active = false;
    G.ui.announce("Le Dévoreur d'Orages est vaincu !", 'level', credited ? 'Votre participation est récompensée.' : 'Il reviendra au prochain orage.');
    G.net?.onWorldBossKilled?.();
    for (const r of Bots.recs) if (r.goal) r.goal = null;
    if (!credited) return;
    const P = G.player;
    P.data.fame += 40;
    Inv.add(makeConsumable('trophy', 2 + Math.floor(R() * 3)));
    rollLoot(m, 1.2);
    if (R() < 0.35) Inv.add(makeUnique('azhkar'));
    for (let i = 0; i < 2; i++) Inv.add(makeGear({ cls: P.cls, ilvl: 32, quality: 85 + Math.floor(R() * 15) }));
    Inv.add(makeConsumable('shard_big', 2));
    P.data.gold += 400;
    G.ui.goldMsg(400);
  },

  // ----------------------------- Bastion -----------------------------
  applyBastionOwner(silent) {
    const B = this.bastion;
    G.flags.bastionBuff = B.owner;
    if (B.flag) B.flag.material.color.set(B.owner >= 0 ? FACTIONS[B.owner].color : '#cccccc');
    const P = G.player;
    if (P) {
      if (B.owner === P.faction) addBuff(P, 'bastion', P, { dur: 1e9 });
      else removeBuff(P, 'bastion');
    }
    if (!silent && B.owner >= 0) G.ui.announce(`${FACTIONS[B.owner].name} s'empare du Bastion !`, 'pvp', B.owner === P?.faction ? 'Bénédiction du Bastion : +10 % d\'expérience pour votre faction.' : "L'ennemi reçoit la bénédiction du Bastion.");
  },

  updateBastion(dt) {
    const B = this.bastion;
    B.tickT -= dt;
    if (B.tickT > 0) return;
    B.tickT = 1;
    const lm = LANDMARK_BY_ID.bastion;
    const P = G.player;
    const near = P && Math.hypot(P.pos.x - lm.x, P.pos.z - lm.z) < 170;
    let n0 = 0, n1 = 0;
    if (near) {
      for (const e of G.world.query(lm.x, lm.z, 13)) if (isPlayerLike(e) && !e.dead) { if (e.faction === 0) n0++; else n1++; }
    } else {
      // simulation abstraite : les bots en ligne du Cœur se disputent le point
      const b0 = Bots.recs.filter((r) => r.online && r.faction === 0 && r.level >= 18 && r.level <= 26).length;
      const b1 = Bots.recs.filter((r) => r.online && r.faction === 1 && r.level >= 18 && r.level <= 26).length;
      if (R() < 0.02) { n0 = b0 > b1 ? 2 : 1; n1 = b1 > b0 ? 2 : 1; if (R() < 0.5) [n0, n1] = [n1, n0]; }
    }
    const old = B.owner;
    if (n0 !== n1) B.p = clamp(B.p + (n1 - n0) * 4, -100, 100);
    else if (n0 === 0) B.p += B.owner === 1 ? 0.5 : B.owner === 0 ? -0.5 : 0;
    B.p = clamp(B.p, -100, 100);
    if (B.p <= -100) B.owner = 0; else if (B.p >= 100) B.owner = 1;
    if (B.owner !== old) this.applyBastionOwner(false);
    // objectif de quête : temps passé dans le cercle
    if (P && !P.dead && Math.hypot(P.pos.x - lm.x, P.pos.z - lm.z) < 13) G.world.emit('eventTick', 'bastion', 1);
    // envoi périodique de bots
    B.sendT = (B.sendT || 0) - 1;
    if (B.sendT <= 0) {
      B.sendT = 90 + R() * 90;
      for (const r of Bots.recs) if (r.online && !r.party && r.level >= 18 && r.level <= 27 && R() < 0.3) r.goal = { x: lm.x, z: lm.z, r: 10, fight: false, until: G.time + 150 };
    }
  },

  // ----------------------------- caravanes -----------------------------
  updateCaravans(dt) {
    const mi = minuteIn(20);
    const cycle = Math.floor(Date.now() / 1200000);
    const P = G.player;
    if (mi >= 5 && mi < 5.2 && this.carCycle !== cycle) {
      this.carCycle = cycle;
      this.spawnCaravans();
    }
    for (let i = this.caravans.length - 1; i >= 0; i--) {
      const c = this.caravans[i];
      c.age = (c.age || 0) + dt;
      if (c.dead) {
        if (!c.resolved) { c.resolved = true; this.caravanEnd(c, false); }
        if (c.deathT > 12 || c.age > c.travelTimeout+20) { G.world.remove(c); this.caravans.splice(i, 1); }
        continue;
      }
      if (c.arrived || c.age > c.travelTimeout) {
        if (!c.resolved) { c.resolved = true; this.caravanEnd(c, c.arrived); }
        G.world.remove(c); this.caravans.splice(i, 1);
      }
    }
  },

  spawnCaravans() {
    const P = G.player;
    const routes = [['fort_roseau', 'garde_aube'], ['bivouac_crocs', 'braise_vive']];
    routes.forEach(([a, b], f) => {
      const path = chainBetween(a, b);
      const c = new Caravan(f, path);
      c.createModel(G.scene);
      G.world.add(c);
      this.caravans.push(c);
      // escorte et assaillants bots
      for (const r of Bots.recs) {
        if (!r.online || r.party || r.level < 14 || r.level > 26 || R() > 0.3) continue;
        const tgt = r.faction === f ? path[Math.floor(path.length / 2)] : path[Math.floor(path.length * 0.6)];
        r.goal = { x: tgt.x, z: tgt.z, r: 14, fight: false, until: G.time + c.travelTimeout, caravan: c };
      }
    });
    G.ui.announce('Les caravanes de ravitaillement partent !', 'pvp', 'Du Marais vers le Cœur d\'Orvalis : escortez la vôtre, pillez celle de l\'ennemi.');
    G.audio?.play('horn');
  },

  caravanEnd(c, arrived) {
    const P = G.player;
    const fname = FACTIONS[c.faction].name;
    if (arrived) G.ui.log(`La caravane du ${fname} est arrivée à destination.`, 'evt');
    else G.ui.log(`La caravane du ${fname} a été détruite !`, 'evt');
    if (!P || P.dead) return;
    const near = dist(P, c) < 60;
    if (arrived && c.faction === P.faction && near) {
      P.data.fame += 30; P.data.gold += 20 + P.level * 6;
      P.gainXp(80 + P.level * 40, 'event');
      G.ui.announce('Caravane escortée !', 'quest', `+30 Gloire, +${20 + P.level * 6} po`);
    }
    if (!arrived && c.faction !== P.faction && c.tappedByMe) {
      P.data.fame += 45; P.data.gold += 30 + P.level * 8;
      P.gainXp(100 + P.level * 45, 'event');
      G.ui.announce('Caravane ennemie pillée !', 'pvp', `+45 Gloire, +${30 + P.level * 8} po`);
      G.world.emit('pvpKill', c);
    }
  },

  // ----------------------------- encart d'événements -----------------------------
  renderBox() {
    const el = $('eventbox');
    if (!el || !G.player) return;
    const P = G.player;
    const parts = [];
    const mi = minuteIn(30);
    if (this.boss.active) {
      const e = this.boss.spawn.ent;
      const pct = e && !e.dead ? Math.ceil((e.hp / e.stats.maxHp) * 100) : 100;
      parts.push(`<div class="evt panel"><b>Boss du monde</b> Azhkar<div class="bar"><div class="f" style="transform:scaleX(${pct / 100});background:linear-gradient(90deg,#7fb8ff,#dff0ff)"></div></div><span class="num">${pct} %</span></div>`);
    } else if (mi > 20) {
      parts.push(`<div class="evt panel"><b>Dévoreur d'Orages</b> dans <span class="num">${fmtTime((30 - mi) * 60)}</span></div>`);
    }
    const lm = LANDMARK_BY_ID.bastion;
    if (Math.hypot(P.pos.x - lm.x, P.pos.z - lm.z) < 140) {
      const B = this.bastion;
      const k = (B.p + 100) / 200;
      parts.push(`<div class="evt panel"><b>Bastion</b> <span style="color:${B.owner >= 0 ? FACTIONS[B.owner].color : '#ccc'}">${B.owner >= 0 ? FACTIONS[B.owner].short : 'Neutre'}</span><div class="bar"><div class="f" style="transform:scaleX(${1 - k})"></div></div><span class="azur">Azur</span>/<span class="braise">Braise</span></div>`);
    }
    for (const c of this.caravans) {
      if (c.dead || dist(P, c) > 250) continue;
      parts.push(`<div class="evt panel"><b style="color:${FACTIONS[c.faction].color}">${escapeHtml(c.name)}</b><div class="bar"><div class="f" style="transform:scaleX(${c.hp / c.stats.maxHp});background:${FACTIONS[c.faction].color}"></div></div></div>`);
    }
    // masquable (croix) et déplaçable (Options > Déplacer l'interface)
    if (G.settings.hideEvents && !G.layout?.editing) { el.hidden = true; return; }
    el.hidden = false;
    if (!el._bound) {
      el._bound = true;
      el.addEventListener('click', (e) => {
        if (!e.target.closest('.evx')) return;
        G.settings.hideEvents = true; G.saveSettings?.(); el.hidden = true;
        G.ui?.notify('Bandeau des événements masqué (réactivable dans les options).');
      });
    }
    const html = parts.length ? parts.join('') + '<button class="evx" title="Masquer ce bandeau" aria-label="Masquer">×</button>' : '';
    if (el._h !== html) { el.innerHTML = html; el._h = html; if (G.layout?.editing) G.layout.handle('eventbox'); }
  },
};
