import { worldAtPoint } from '../data/world-space.js';
import { isInstancePoint } from '../data/world-space.js';
// Entité de base : position, déplacement sur le relief, effets, incantation, régénération, montures.
import * as THREE from 'three';
import { G } from './state.js';
import { getHeight, canWalk, isLava, EXT_X } from '../world/terrain.js';
import { resolve } from '../world/collide.js';
import { computeStats } from './stats.js';
import { updateBuffs, updateCasting, hasFlag, addBuff, removeBuff, hasBuff } from './combat.js';
import { createModel } from './models.js';
import { uid, clamp, turnTowards } from '../core/util.js';

let chickenSpec = { rig: 'quadruped', bird:true, snout:false, color: '#f4f0e6', belly: '#ffffff', dark: '#e04040', len: 0.5, wid: 0.36, hgt: 0.4, legH: 0.22, legW: 0.06, headS: 0.24, ears: 'none', tail: 'short', snoutL: 0.12, snoutColor: '#f0b030', feet: '#f0b030', legColor: '#f0b030', headUp: 0.7, eyes: '#111' };
// formes animales du druide (Gardien : ours, Sauvage : félin)
const FORM_SPECS = {
  ours: { rig: 'quadruped', color: '#8e6642', belly: '#b89066', dark: '#5c3e26', len: 1.6, wid: 0.86, hgt: 0.86, legH: 0.52, legW: 0.24, headS: 0.52, ears: 'round', tail: 'short', snoutL: 0.24, snoutColor: '#c8a47a', eyes: '#9aff6a', mane: '#76522f', scale: 1.42 },
  felin: { rig: 'quadruped', color: '#dca450', belly: '#f2dcae', dark: '#7a5028', len: 1.45, wid: 0.5, hgt: 0.55, legH: 0.55, legW: 0.14, headS: 0.4, ears: 'pointy', tail: 'long', tailL: 0.9, snoutL: 0.16, eyes: '#9aff6a', spots: '#6e4620', scale: 1.22 },
};
const FORM_ANIM = { attack: 'attack', attack2: 'bite', slam: 'charge', spin: 'attack', leap: 'charge', throw: 'attack', shoot: 'attack', cast: 'roar', raise: 'roar', roar: 'roar', channel: 'roar', block: 'roar', hit: 'hit' };

export class Entity {
  constructor(kind) {
    this.id = uid(kind[0]);
    this.kind = kind;
    this.name = '';
    this.level = 1;
    this.faction = 2;
    this.pos = new THREE.Vector3();
    this.ry = 0;
    this.vy = 0;
    this.airborne = false;
    this.radius = 0.5;
    this.stats = {};
    this.hp = 1;
    this.mp = 1;
    this.buffs = [];
    this.cast = null;
    this.gcd = 0;
    this.cds = {};
    this.target = null;
    this.dead = false;
    this.deathT = 0;
    this.combatT = 99;
    this.model = null;
    this.statsDirty = true;
    this.speedNow = 0;
    this.dashing = null;
    this.swimming = false;
    this.mounted = false;
    this.mountModel = null;
    this.polyModel = null;
    this.skills = {};
    this.gearStats = null;
    this.visible = true;
    this.lavaT = 0;
  }

  get rooted() { return hasFlag(this, 'root') || hasFlag(this, 'stun'); }
  get stunned() { return hasFlag(this, 'stun'); }
  inCombat() { return this.combatT < 5; }
  skillRank(id) { return this.skills[id] || 0; }
  get eye() { return (this.model ? this.model.height : 1.8) * 0.95; }
  get x() { return this.pos.x; }
  get y() { return this.pos.y; }
  get z() { return this.pos.z; }

  recalc() {
    const oldMax = this.stats.maxHp || 0, oldMp = this.stats.maxMp || 0;
    computeStats(this);
    if (oldMax && this.stats.maxHp !== oldMax && !this.dead) this.hp = Math.max(1, this.hp * (this.stats.maxHp / oldMax));
    if (oldMp && this.stats.maxMp !== oldMp) this.mp = this.mp * (this.stats.maxMp / oldMp);
    this.hp = Math.min(this.hp, this.stats.maxHp);
    this.mp = Math.min(this.mp, this.stats.maxMp);
    this.statsDirty = false;
  }

  faceTo(x, z) {
    if (Math.abs(x - this.pos.x) + Math.abs(z - this.pos.z) < 0.01) return;
    this.ry = Math.atan2(x - this.pos.x, z - this.pos.z);
  }

  teleport(x, z) {
    this.worldId=worldAtPoint(x,z);
    this.pos.x = x; this.pos.z = z;
    this.pos.y = this.groundY();
    this.dashing = null;
    this.vy = 0;
    if (this.model) this.model.root.position.copy(this.pos);
    if (this.onTeleport) this.onTeleport();
  }

  groundY(x = this.pos.x, z = this.pos.z) {
    const h = getHeight(x, z);
    if (isInstancePoint(x, z)) return h; // instances : pas d'eau, le sol peut descendre sous le niveau de la mer
    if (h < -1.25 && !this.model?.flying && !this.model?.floating) return -1.2; // nage
    return Math.max(h, h < -0.2 && this.model?.floating ? -0.1 : h);
  }

  handPos() {
    const m = this.model;
    if (m && m.parts.handR && this.visible) {
      const v = new THREE.Vector3();
      (m.weaponType === 'bow' ? m.parts.handL : m.parts.handR).getWorldPosition(v);
      return { x: v.x, y: v.y + 0.2, z: v.z };
    }
    return { x: this.pos.x, y: this.pos.y + (m ? m.height * 0.7 : 1.3), z: this.pos.z };
  }

  // Déplacement avec pente, obstacles et glissement le long des murs. Retourne la distance parcourue.
  tryMove(dx, dz) {
    if (dx === 0 && dz === 0) return 0;
    const ox = this.pos.x, oz = this.pos.z;
    let nx = ox + dx, nz = oz + dz;
    if (!canWalk(ox, oz, nx, nz)) {
      if (canWalk(ox, oz, ox + dx, oz)) { nx = ox + dx; nz = oz; }
      else if (canWalk(ox, oz, ox, oz + dz)) { nx = ox; nz = oz + dz; }
      else return 0;
    }
    const r = resolve(nx, nz, this.radius * 0.7);
    if (!canWalk(ox, oz, r[0], r[1])) return 0;
    this.pos.x = r[0]; this.pos.z = r[1];
    return Math.hypot(this.pos.x - ox, this.pos.z - oz);
  }

  jump(v = 8.5) {
    if (this.airborne || this.rooted || this.swimming) return false;
    this.vy = v;
    this.airborne = true;
    return true;
  }

  // Mise à jour commune (appelée par les sous-classes)
  updateBase(dt, moved = false) {
    if (this.statsDirty) this.recalc();
    this.combatT += dt;
    if (this.gcd > 0) this.gcd -= dt;
    for (const k in this.cds) if (this.cds[k] > 0) this.cds[k] -= dt;
    if (!this.dead) {
      updateBuffs(this, dt);
      updateCasting(this, dt, moved);
      // régénération
      const S = this.stats;
      const ooc = !this.inCombat();
      const om = ooc ? S.oocMul || 1 : 1;
      if (this.hp < S.maxHp) this.hp = Math.min(S.maxHp, this.hp + (ooc ? S.maxHp * 0.035 + S.hpRegen : S.hpRegen) * om * dt);
      if (this.mp < S.maxMp) this.mp = Math.min(S.maxMp, this.mp + (S.mpRegen || 0) * (ooc ? 2.5 : 1) * om * dt);
      // lave
      if (isLava(this.pos.x, this.pos.z) && !this.model?.flying && !this.model?.floating && this.kind !== 'mob') {
        this.lavaT -= dt;
        if (this.lavaT <= 0) { this.lavaT = 1; addBuff(this, 'lava', this, { dur: 1.2, value: this.stats.maxHp * 0.06 }); }
      }
    }
    // déplacement forcé (charge, bond, recul)
    if (this.dashing) {
      const d = this.dashing;
      d.t += dt;
      const dx = d.x - this.pos.x, dz = d.z - this.pos.z;
      const dd = Math.hypot(dx, dz);
      const step = d.speed * dt;
      if (dd <= step || d.t > 2) {
        const r = resolve(d.x, d.z, this.radius * 0.7);
        if (canWalk(this.pos.x, this.pos.z, r[0], r[1])) { this.pos.x = r[0]; this.pos.z = r[1]; }
        this.dashing = null;
        this.pos.y = this.groundY();
        if (d.onArrive) d.onArrive();
      } else {
        const mx = (dx / dd) * step, mz = (dz / dd) * step;
        if (this.tryMove(mx, mz) < step * 0.3) { this.dashing = null; if (d.onArrive) d.onArrive(); }
        if (this.dashing && d.arc) {
          const k = 1 - Math.hypot(d.x - this.pos.x, d.z - this.pos.z) / Math.max(0.1, d.d);
          this.pos.y = this.groundY() + Math.sin(k * Math.PI) * d.arc;
        }
      }
      this.speedNow = d.speed;
    }
    // gravité
    const gy = this.groundY();
    this.swimming = !isInstancePoint(this.pos.x, this.pos.z) && gy <= -1.19 && getHeight(this.pos.x, this.pos.z) < -1.25;
    if (this.flying) { this.vy = 0; this.airborne = false; if (this.pos.y < gy) this.pos.y = gy; }
    else if (!this.dashing || !this.dashing.arc) {
      if (this.airborne || this.pos.y > gy + 0.05) {
        this.vy -= 24 * dt;
        this.pos.y += this.vy * dt;
        if (this.pos.y <= gy) { this.pos.y = gy; this.vy = 0; this.airborne = false; }
        else this.airborne = true;
      } else {
        this.pos.y = gy;
        this.vy = 0;
      }
    }
  }

  // ----- formes animales : le modèle humanoïde est masqué, les animations lui sont relayées
  setForm(kind) {
    kind = kind || null;
    if ((this.formKind || null) === kind) return;
    if (this.formModel) { this.formModel.root.parent?.remove(this.formModel.root); this.formModel.dispose(); this.formModel = null; }
    this.formKind = kind;
    const hm = this.model;
    if (!hm) return;
    if (!hm._origPlay) { hm._origPlay = hm.play; hm._origFlash = hm.flash; }
    if (kind && FORM_SPECS[kind]) {
      if (this.mounted) this.dismount?.();
      this.formModel = createModel(FORM_SPECS[kind]); // l'échelle (spec.scale) est appliquée par createModel
      hm.root.parent?.add(this.formModel.root);
      this.formModel.root.position.copy(this.pos);
      this.formModel.root.visible = this.visible !== false && !this.polyModel;
      const fm = this.formModel;
      hm.play = (n, d) => { hm._origPlay.call(hm, n, d); if (this.formModel === fm) fm.play(FORM_ANIM[n] || (n === 'wave' || n === 'dance' ? 'roar' : 'attack'), d); };
      hm.flash = (c, t) => { hm._origFlash.call(hm, c, t); if (this.formModel === fm) fm.flash(c, t); };
      hm.root.visible = false;
    } else {
      hm.play = hm._origPlay; hm.flash = hm._origFlash;
      hm.root.visible = this.visible !== false && !this.polyModel;
    }
  }

  syncModel(dt) {
    if (this.formModel && this.model) {
      if (this.dead && !this.model.dead) this.model.die();
      if (this.dead !== !!this.formModel.dead) { if (this.dead) this.formModel.die(); else this.formModel.revive(); }
    }
    const m = this.polyModel || this.formModel || this.model;
    if (!m) return;
    const root = m.root;
    root.position.copy(this.pos);
    if (this.mounted && this.mountModel) {
      this.mountModel.root.position.copy(this.pos);
      this.mountModel.root.rotation.y = this.ry;
      this.mountModel.update(dt, this.flying ? Math.max(this.speedNow, 7) : this.speedNow);
      root.position.y += this.mountSaddle || 1.0;
    }
    root.rotation.y = this.ry;
    m.airborne = this.airborne;
    m.mounted = this.mounted;
    m.update(dt, this.mounted ? 0 : this.speedNow);
    if (this.swimming) root.position.y -= 0.2;
    // camouflage (Voile d'ombre, Camouflage…) : 80 % moins visible pour soi et ses alliés, presque invisible pour l'ennemi
    const st = this.buffs?.some((b) => b.def.flags?.stealth);
    if (m.setStealth && (st || m._stealth !== undefined && m._stealth < 1)) {
      const P = G.player;
      m.setStealth(!st ? 1 : this === P || !P || this.faction === P.faction ? 0.2 : 0.07);
    }
  }

  // ----- métamorphose (poulet)
  setPoly(on) {
    if (!this.model) return;
    if (on && !this.polyModel) {
      this.polyModel = createModel(chickenSpec);
      this.polyModel.root.scale.setScalar(Math.max(1, this.radius * 1.4));
      this.model.root.visible = false;
      if (this.formModel) this.formModel.root.visible = false;
      this.model.root.parent?.add(this.polyModel.root);
    } else if (!on && this.polyModel) {
      this.polyModel.root.parent?.remove(this.polyModel.root);
      this.polyModel.dispose();
      this.polyModel = null;
      if (this.formModel) this.formModel.root.visible = this.visible !== false;
      else this.model.root.visible = this.visible;
    }
  }

  // ----- montures
  mount() {
    if (this.mounted || !this.model) return;
    for (const b of this.buffs.slice()) if (b.def.flags?.form) removeBuff(this, b);
    const spec = this.faction === 1
      ? { rig: 'quadruped', color: '#5a4a44', belly: '#7a6a60', dark: '#2a2220', len: 1.9, wid: 0.7, hgt: 0.72, legH: 0.85, legW: 0.2, headS: 0.52, ears: 'pointy', tail: 'long', snoutL: 0.34, eyes: '#ffb020', saddle: '#7a2a1a', saddle2: '#c8321e', mane: '#2a2220' }
      : { rig: 'quadruped', color: '#e8e2d8', belly: '#f4f0ea', dark: '#8a7a6a', len: 1.9, wid: 0.62, hgt: 0.72, legH: 1.0, legW: 0.18, headS: 0.4, headL: 0.62, neck: 0.5, headUp: 0.6, ears: 'pointy', tail: 'long', tailL: 0.7, snoutL: 0.3, mane: '#6a5a4a', saddle: '#2f5da8', saddle2: '#3b6fd8', feet: '#4a3a2a' };
    if (this.mountSpecOverride) Object.assign(spec, this.mountSpecOverride);
    // monture volante (niveau maximum) : drake céleste du Pacte, wyrm de braise des Clans
    const winged = this.wingedMount ?? ((this.data?.mountTier || 0) >= 3);
    const fly = this.faction === 1
      ? { rig: 'drake', color: '#8a2a1e', belly: '#e0a050', wing: '#5a1a14', horn: '#2a2020', eyes: '#ffd040', scale: 0.92 }
      : { rig: 'drake', color: '#e8ecf4', belly: '#f6e2a0', wing: '#5f8fe0', horn: '#e6b84a', eyes: '#3fa0ff', scale: 0.92 };
    this.mountModel = createModel(winged ? fly : spec);
    this.mountWinged = winged;
    this.mountSaddle = winged ? 1.5 : (spec.legH + spec.hgt) - 0.35;
    this.model.root.parent?.add(this.mountModel.root);
    this.mounted = true;
    addBuff(this, 'mounted', this, { dur: 1e9 });
    if (this.speedBonusMount) { const b = hasBuff(this, 'mounted'); if (b) b.scale = this.speedBonusMount; }
    G.audio?.play('mount', this.pos);
  }
  dismount() {
    if (!this.mounted) return;
    removeBuff(this, 'mounted');
  }
  onDismount() {
    this.mounted = false;
    if (this.flying) { this.flying = false; this.airborne = true; }
    if (this.mountModel) {
      this.mountModel.root.parent?.remove(this.mountModel.root);
      this.mountModel.dispose();
      this.mountModel = null;
    }
  }

  setVisible(v) {
    this.visible = v;
    if (this.model) this.model.root.visible = v && !this.polyModel && !this.formModel;
    if (this.formModel) this.formModel.root.visible = v && !this.polyModel;
    if (this.mountModel) this.mountModel.root.visible = v;
  }

  removeModel() {
    if (this.formModel) { this.formModel.root.parent?.remove(this.formModel.root); this.formModel.dispose(); this.formModel = null; this.formKind = null; }
    if (this.polyModel) { this.polyModel.root.parent?.remove(this.polyModel.root); this.polyModel.dispose(); this.polyModel = null; }
    if (this.mountModel) { this.mountModel.root.parent?.remove(this.mountModel.root); this.mountModel.dispose(); this.mountModel = null; this.mounted = false; }
    if (this.model) { this.model.root.parent?.remove(this.model.root); this.model.dispose(); this.model = null; }
  }

  // se déplace vers (x,z) à la vitesse donnée ; retourne vrai si arrivé
  moveTowards(x, z, dt, stopDist = 0.5, speed = null) {
    const d = Math.hypot(x - this.pos.x, z - this.pos.z);
    if (d <= stopDist) { this.speedNow = 0; return true; }
    if (this.rooted || this.cast && !this.cast.s?.moveOk) { this.speedNow = 0; return false; }
    // instances : on suit un chemin (A*) quand la cible n'est pas en vue directe
    let wx = x, wz = z;
    if (isInstancePoint(this.pos.x, this.pos.z) && G.inst?.active) { const w = G.inst.steer(this, x, z); wx = w.x; wz = w.z; }
    const dx = wx - this.pos.x, dz = wz - this.pos.z;
    const dw = Math.hypot(dx, dz) || 0.001;
    const sp = speed ?? this.stats.moveSpeed ?? 5;
    const step = Math.min(sp * (this.swimming ? 0.6 : 1) * dt, Math.max(0.01, d - stopDist * 0.9), dw + 0.5);
    const want = Math.atan2(dx, dz);
    this.ry = turnTowards(this.ry, want, dt * 10);
    const moved = this.tryMove((dx / dw) * step, (dz / dw) * step);
    this.speedNow = dt > 0 ? moved / dt : 0;
    if (moved < step * 0.2) {
      // bloqué : essaie de contourner
      const side = (this.id.charCodeAt(1) % 2 ? 1 : -1);
      const a = want + side * 1.2;
      this.tryMove(Math.sin(a) * step, Math.cos(a) * step);
      this.stuckT = (this.stuckT || 0) + dt;
    } else this.stuckT = 0;
    return false;
  }
}
