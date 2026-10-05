import { WORLD_VERSION, migratePosition, validWorldPoint } from '../data/world-space.js';
import { isInstancePoint } from '../data/world-space.js';
// Joueur local : données du personnage, contrôles, ciblage, barre d'action, expérience et mort.
import { G, LEVEL_CAP, xpToNext } from './state.js';
import { Entity } from './entity.js';
import { buildCharacterModel } from './appearance.js';
import { SKILL_BY_ID, classSkills } from '../data/skills.js';
import { useSkill, canAttack, dist, isFriendly, hasFlag, addBuff, heal, edgeDist, removeBuff, hasBuff } from './combat.js';
import { gearStats, itemStats, makeGear, makeConsumable, CONSUMABLES, BAG_SIZE, STASH_SIZE } from '../data/items.js';
import { ensureRuneData } from './runes.js';
import { ensureProfData, profMods } from './profs.js';
import { FACTIONS, HUB_BY_ID } from '../data/zones.js';
import { CLASSES } from '../data/classbase.js';
import { weaponAvg } from './stats.js';
import { pillar, burst } from './fx.js';
import { turnTowards, angleTo, wrapAngle } from '../core/util.js';
import { SPECS, DEFAULT_SPEC, specOf } from '../data/specs.js';
import { TREES, NODE_BY } from '../data/talents.js';
import { ensureTalentData, refreshTalents, basicSkill, whyNot, canRemove, talentPoints, spent, specAbilityIds, BAR_SLOTS } from './talents.js';
import { zoneAt, getHeight } from '../world/terrain.js';
import { resolve } from '../world/collide.js';
import { WORLD_HALF } from '../data/world-space.js';
import * as THREE from 'three';

export function newCharacter({ name, cls, faction, app }) {
  const C = CLASSES[cls];
  const lvl1 = classSkills(cls).filter((s) => s.lvl === 1);
  const skills = { x_rappel: 1 };
  for (const s of lvl1) skills[s.id] = 1;
  const bar = Array(BAR_SLOTS).fill(null);
  lvl1.forEach((s, i) => (bar[i] = { k: 's', id: s.id }));
  bar[8] = { k: 'i', cid: 'pot_hp1' };
  bar[9] = { k: 's', id: 'x_rappel' };
  const bag = Array(BAG_SIZE).fill(null);
  bag[0] = makeConsumable('pot_hp1', 5);
  bag[1] = makeConsumable('pot_mp1', 3);
  bag[2] = makeConsumable('food1', 5);
  const equip = {
    weapon: makeGear({ slot: 'weapon', cls, ilvl: 1, quality: 25 }),
    chest: makeGear({ slot: 'chest', cls, ilvl: 1, quality: 20 }),
    legs: makeGear({ slot: 'legs', cls, ilvl: 1, quality: 20 }),
  };
  if (cls === 'guerrier' || cls === 'templier' || cls === 'assassin') equip.offhand = makeGear({ slot: 'offhand', cls, ilvl: 1, quality: 20 });
  const cap = FACTIONS[faction].capital;
  return {
    v: 1, worldVersion: WORLD_VERSION, id: 'c' + Date.now().toString(36), name, cls, faction, app,
    level: 1, xp: 0, gold: 20,
    spec: DEFAULT_SPEC[cls], talents: {}, specBars: {},
    skills, bar, bag, bagExtra: 0, equip, stash: Array(STASH_SIZE).fill(null),
    quests: { active: {}, done: {} },
    pos: null, ry: 0,
    discovered: [cap], bind: cap,
    fame: 0, kills: 0, deaths: 0, pvpKills: 0, bossKills: 0,
    hasMount: false, mountTier: 0,
    listings: [],
    created: Date.now(), played: 0,
    tutorial: 0,
  };
}

export class Player extends Entity {
  constructor(data) {
    super('player');
    migratePosition(data);
    this.data = data;
    this.name = data.name;
    this.cls = data.cls;
    this.faction = data.faction;
    this.level = data.level;
    ensureTalentData(data);
    ensureRuneData(data);
    ensureProfData(data);
    this.pmods = profMods(data);
    this.spec = data.spec;
    this.talents = data.talents[data.spec];
    this.skills = data.skills || {};
    this.bindHub = data.bind;
    this.engaged = null;
    this.autoRun = false;
    this.potionCd = 0;
    this.lastZone = null;
    this.radius = 0.45;
    this.isLocalParty = true;
    this.deadT = 0;
    this.lastHub = null;
    this.tabIdx = 0;
    this.moveIntent = false;
  }

  get hasMount() { return this.data.hasMount; }
  get speedBonusMount() { return this.data.mountTier >= 2 ? 1.55 : 1; }

  init(scene) {
    this.scene = scene;
    // téléportation (pierre de voyage, rappel, réapparition) : la caméra suit sans balayer le décor
    this.onTeleport = () => { if (G.cam) G.cam.first = true; };
    this.refreshGear(true);
    this.applyTalents(false);
    const cap = HUB_BY_ID[this.data.bind] || HUB_BY_ID[FACTIONS[this.faction].capital];
    const p = this.data.pos;
    if (validWorldPoint(p)) this.teleport(p.x, p.z);
    else this.teleport(cap.x, cap.z + 10);
    this.ry = this.data.ry || 0;
    this.recalc();
    this.hp = this.data.hp ? Math.min(this.data.hp, this.stats.maxHp) : this.stats.maxHp;
    this.mp = this.data.mp ? Math.min(this.data.mp, this.stats.maxMp) : this.stats.maxMp;
    if (this.hp <= 0) this.hp = this.stats.maxHp * 0.5;
  }

  // Recalcule les bonus d'équipement et reconstruit le modèle
  refreshGear(rebuild = true) {
    const tot = {};
    let wavg = null;
    for (const slot in this.data.equip) {
      const it = this.data.equip[slot];
      if (!it) continue;
      const s = itemStats(it);
      for (const k in s) if (k !== 'dmgMin' && k !== 'dmgMax') tot[k] = (tot[k] || 0) + s[k];
      if (slot === 'weapon') wavg = (s.dmgMin + s.dmgMax) / 2;
    }
    this.gearStats = tot;
    this.weaponAvg = wavg ?? weaponAvg(1) * 0.5;
    this.hasShield = !!this.data.equip.offhand && (this.cls === 'guerrier' || this.cls === 'templier');
    this.statsDirty = true;
    if (rebuild) this.rebuildModel();
  }

  rebuildModel() {
    const wasMounted = this.mounted;
    if (wasMounted) this.dismount();
    if (this.model) { this.scene.remove(this.model.root); this.model.dispose(); }
    this.model = buildCharacterModel(this.data);
    this.scene.add(this.model.root);
    this.model.root.position.copy(this.pos);
    if (wasMounted) this.mount();
  }

  // Déplacement en vol : pas de pente ; les bâtiments et les arbres n'arrêtent qu'à basse altitude.
  flyMove(dx, dz) {
    const ox = this.pos.x, oz = this.pos.z, lim = WORLD_HALF - 14;
    let nx = Math.max(-lim, Math.min(lim, ox + dx)), nz = Math.max(-lim, Math.min(lim, oz + dz));
    if (isInstancePoint(nx, nz)) return 0;
    if (this.pos.y - getHeight(nx, nz) < 15) { const r = resolve(nx, nz, this.radius * 0.7); nx = r[0]; nz = r[1]; }
    this.pos.x = nx; this.pos.z = nz;
    const gy = this.groundY();
    if (this.pos.y < gy) this.pos.y = gy;
    return Math.hypot(nx - ox, nz - oz);
  }

  // ---------------------------------------------------------------------------
  update(dt) {
    const input = G.input;
    this.potionCd = Math.max(0, this.potionCd - dt);
    this.data.played += dt;
    if (this.dead) {
      this.deadT += dt;
      this.speedNow = 0;
      this.updateBase(dt);
      this.syncModel(dt);
      return;
    }
    let moved = false;
    this.speedNow = 0;
    // vol : monture ailée, hors donjon. Espace décolle et monte, X descend.
    const canFly = this.mounted && this.mountWinged && !isInstancePoint(this.pos.x, this.pos.z);
    if (!canFly) this.flying = false;
    else if (!this.flying && input.isDown('Space') && !this.rooted) { this.flying = true; this.airborne = false; this.vy = 0; G.audio?.play('mount', this.pos); }
    const ax = input.axis(G.settings.keyTurn !== false);
    // Q/D : la caméra tourne en douceur et le personnage la suit
    if (ax.t) {
      G.cam.yaw += ax.t * dt * 2.6;
      if (!this.rooted) this.ry = G.cam.yaw;
    }
    if (input.wasPressed('NumLock') || input.wasPressed('Backquote')) this.autoRun = !this.autoRun;
    if (ax.f !== 0 || ax.s !== 0) { if (ax.f < 0) this.autoRun = false; }
    const f = this.autoRun && ax.f === 0 ? 1 : ax.f, s = ax.s;
    const yaw = G.cam.yaw;
    if (input.mouse.right && !this.cast) this.ry = yaw;
    this.moveIntent = f !== 0 || s !== 0;
    if ((f !== 0 || s !== 0) && !this.rooted && !this.dashing) {
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const rx = -Math.cos(yaw), rz = Math.sin(yaw);
      let mx = fx * f + rx * s, mz = fz * f + rz * s;
      const l = Math.hypot(mx, mz);
      mx /= l; mz /= l;
      let sp = this.stats.moveSpeed * (this.swimming ? 0.6 : 1) * (this.flying ? 1.4 : 1);
      if (f < 0 && s === 0) sp *= 0.6;
      if (this.cast && !this.cast.s.moveOk) {
        // bouger annule l'incantation
      }
      const d = this.flying ? this.flyMove(mx * sp * dt, mz * sp * dt) : this.tryMove(mx * sp * dt, mz * sp * dt);
      if (d > 0.001) moved = true;
      this.speedNow = d / dt;
      if (!input.mouse.right && !(ax.t && s === 0)) {
        // mode « Q/D tournent » : on garde le regard vers l'avant en pas de côté et en reculant (comme dans les grands MMO)
        const want = G.settings.keyTurn !== false && s !== 0 ? yaw : f < 0 && s === 0 ? Math.atan2(-mx, -mz) : Math.atan2(mx, mz);
        this.ry = turnTowards(this.ry, want, dt * 14);
      }
    }
    if (this.flying) {
      let v = (input.isDown('Space') ? 1 : 0) - (input.isDown('KeyX') ? 1 : 0);
      // clic droit maintenu : on vole là où regarde la caméra
      if (input.mouse.right && f > 0) v -= Math.sin(G.cam.pitch) * 1.2;
      const gy = this.groundY();
      this.pos.y = Math.min(Math.max(this.pos.y + v * 11 * dt, gy), Math.max(gy, 0) + 150);
      if (v < 0 && this.pos.y <= gy + 0.05) { this.flying = false; this.pos.y = gy; }
      if (v !== 0) moved = true;
    } else if (input.wasPressed('Space') && !canFly) { if (this.jump()) { if (this.cast && !this.cast.s.moveOk) moved = true; } }

    // ciblage
    if (input.wasPressed('Tab')) this.cycleTarget(input.isDown('ShiftLeft') || input.isDown('ShiftRight'));
    for (const c of input.clicks) this.onClick(c);

    // compétences (Maj + chiffre : deuxième barre d'action si elle est affichée)
    const shift = G.settings.bar2 && (input.isDown('ShiftLeft') || input.isDown('ShiftRight'));
    for (let i = 0; i < 10; i++) {
      const code = i === 9 ? 'Digit0' : 'Digit' + (i + 1);
      if (input.wasPressed(code)) this.useBarSlot(shift ? 10 + i : i);
    }
    if (input.wasPressed('KeyF')) G.ui?.interact?.();

    // file d'attente : relance la compétence demandée pendant le temps de recharge global
    if (this.queued) {
      this.queued.t -= dt;
      if (this.queued.t <= 0) this.queued = null;
      else if (this.gcd <= 0 && !this.cast) { const id = this.queued.id; this.queued = null; this.useSkillById(id); }
    }
    // auto-attaque
    if (this.target && this.target.dead) { if (this.engaged === this.target) this.engaged = null; }
    if (G.settings.autoAttack && this.engaged && this.engaged === this.target && !this.cast && this.gcd <= 0 && canAttack(this, this.target)) {
      const basic = basicSkill(this);
      if (basic && edgeDist(this, this.target) <= (basic.range || 3.6) + 0.3 && !(basic.cast && this.moveIntent)) useSkill(this, basic, this.target, { autoTarget: false });
    }

    this.updateBase(dt, moved);
    this.syncModel(dt);

    // région
    const z = zoneAt(this.pos.x, this.pos.z);
    if (z !== this.lastZone) { this.lastZone = z; G.ui?.zoneEnter?.(z); G.sky?.setBiome(z.biome); G.audio?.setZone?.(z); G.world.emit('zone', z); }
    // en instance, on sauvegarde le point de retour dans le monde
    this.data.pos = isInstancePoint(this.pos.x, this.pos.z) ? G.inst?.active?.returnPos || null : { x: this.pos.x, z: this.pos.z };
    this.data.ry = this.ry;
    this.data.hp = this.hp; this.data.mp = this.mp;
  }

  cycleTarget(back) {
    const list = [];
    for (const e of G.world.query(this.pos.x, this.pos.z, 40)) {
      if (!canAttack(this, e) || e.noTarget) continue;
      const a = Math.abs(wrapAngle(angleTo(this.pos.x, this.pos.z, e.pos.x, e.pos.z) - G.cam.yaw));
      if (a > 1.3 && dist(this, e) > 8) continue;
      list.push({ e, s: dist(this, e) + a * 10 + (e.passive ? 15 : 0) });
    }
    if (!list.length) { this.setTarget(null); return; }
    list.sort((a, b) => a.s - b.s);
    let idx = list.findIndex((l) => l.e === this.target);
    idx = back ? idx - 1 : idx + 1;
    if (idx < 0) idx = list.length - 1;
    if (idx >= list.length) idx = 0;
    this.setTarget(list[idx].e);
  }

  setTarget(e) {
    if (this.target !== e) { this.target = e; G.audio?.play('target'); }
    if (!e || !canAttack(this, e)) this.engaged = null;
  }

  // choix de l'entité sous le curseur (projection écran)
  pick(x, y) {
    const cam = G.camera;
    const v = new THREE.Vector3();
    let best = null, bd = 1e9;
    for (const e of G.world.query(this.pos.x, this.pos.z, 80)) {
      if (e === this || !e.model || e.noTarget && !e.npcRole) continue;
      if (!e.model.root.visible && !e.polyModel && !e.formModel) continue;
      const h = (e.formModel || e.model).height;
      for (const k of [0.3, 0.65, 0.95]) {
        v.set(e.pos.x, e.pos.y + h * k, e.pos.z).project(cam);
        if (v.z > 1) continue;
        const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
        const d = Math.hypot(sx - x, sy - y);
        const rad = Math.max(26, (e.radius * 90) / Math.max(1, dist(this, e) * 0.35));
        if (d < rad && d + dist(this, e) * 0.5 < bd) { bd = d + dist(this, e) * 0.5; best = e; }
      }
    }
    return best;
  }

  onClick(c) {
    // clic droit sur un filon ou une plante : récolte (métiers)
    if (c.button === 2 && G.profs?.clickAt(c.x, c.y)) return;
    const e = this.pick(c.x, c.y);
    if (!e) { if (c.button === 0) this.setTarget(null); return; }
    // clic droit sur une bête vaincue : dépeçage
    if (c.button === 2 && e.kind === 'mob' && e.dead && G.profs?.skinnable(e) && G.profs.has('depeceur')) { G.profs.trySkin(e); return; }
    this.setTarget(e);
    if (e.npcRole && (c.button === 2 || dist(this, e) < 6)) {
      if (dist(this, e) < 7) G.ui?.openNpc?.(e);
      else G.ui?.error('Trop loin.');
    } else if (c.button === 2 && canAttack(this, e)) {
      this.engaged = e;
    }
  }

  useBarSlot(i) {
    const slot = this.data.bar[i];
    if (!slot) return;
    if (slot.k === 's') this.useSkillById(slot.id);
    else if (slot.k === 'i') this.useConsumable(slot.cid);
  }

  useSkillById(id) {
    const s = SKILL_BY_ID[id];
    if (!s) return;
    if (s.lvl > this.level) { G.ui?.error(`Niveau ${s.lvl} requis.`); return; }
    const r = useSkill(this, s, this.target);
    if (!r.ok) {
      if (r.gcd || r.busy) { this.queued = { id, t: 0.6 }; return; }
      if (r.err) G.ui?.error(r.err);
      return;
    }
    if (r.target && r.target !== this && canAttack(this, r.target)) {
      if (!this.target || this.target.dead) this.setTarget(r.target);
      this.engaged = r.target;
    }
  }

  // ---------------------------------------------------------------------------
  countItem(cid) {
    let n = 0;
    for (const it of this.data.bag) if (it && it.cid === cid) n += it.count;
    return n;
  }

  useConsumable(cid) {
    const def = CONSUMABLES[cid];
    if (!def) return;
    const idx = this.data.bag.findIndex((it) => it && it.cid === cid);
    if (idx < 0) { G.ui?.error("Vous n'en avez plus."); return; }
    this.useBagItem(idx);
  }

  useBagItem(idx) {
    const it = this.data.bag[idx];
    if (!it) return;
    if (this.dead) return;
    if (it.type === 'potion') {
      const def = CONSUMABLES[it.cid];
      if (def.req > this.level) { G.ui?.error(`Niveau ${def.req} requis.`); return; }
      if (this.potionCd > 0) { G.ui?.error('Potion en recharge.'); return; }
      this.potionCd = 20;
      const pk = 1 + (this.pmods?.potionPct || 0); // Alchimiste : potions plus efficaces
      if (def.heal) addBuff(this, 'potion_hot', this, { dur: 6, value: (def.heal * pk) / 6 });
      if (def.mana) { this.mp = Math.min(this.stats.maxMp, this.mp + this.stats.maxMp * def.mana * pk); burst(this.pos.x, this.pos.y + 1.2, this.pos.z, { count: 12, color: '#7fb8ff', vy: 2, speed: 1 }); }
      else pillar(this.pos.x, this.pos.y, this.pos.z, '#ff7070', 14, 1.5);
      G.audio?.play('potion');
      this.consume(idx);
    } else if (it.type === 'food') {
      if (this.inCombat()) { G.ui?.error('Impossible en combat.'); return; }
      const def = CONSUMABLES[it.cid];
      const pct = it.cid === 'food2' ? 0.45 : 0.3;
      addBuff(this, 'food', this, { dur: 10, value: this.stats.maxHp * pct / 10 });
      this.model.sitting = true;
      this.sitUntil = G.time + 10;
      G.audio?.play('eat');
      this.consume(idx);
    } else if (it.type === 'gear') {
      G.inv?.equip(idx);
    } else if (it.type === 'petstone') {
      if (G.pets?.learn(it)) this.consume(idx);
    } else if (G.profs?.useItem?.(it, idx)) {
      // élixirs, plats, bandages, bouteilles (métiers)
    } else if (it.type === 'bagup') {
      if (this.data.bagExtra >= 3) { G.ui?.error('Votre sac ne peut pas être agrandi davantage.'); return; }
      this.data.bagExtra++;
      for (let k = 0; k < 8; k++) this.data.bag.push(null);
      this.consume(idx);
      G.ui?.notify('Votre sac gagne 8 emplacements.');
    }
    G.ui?.refresh?.();
  }

  consume(idx, n = 1) {
    const it = this.data.bag[idx];
    if (!it) return;
    it.count = (it.count || 1) - n;
    if (it.count <= 0) this.data.bag[idx] = null;
    G.ui?.refresh?.();
  }

  // ---------------------------------------------------------------------------
  gainXp(amount, source) {
    if (this.level >= LEVEL_CAP) return 0;
    amount = Math.round(amount * (G.settings.xpRate || 1));
    if (amount <= 0) return 0;
    this.data.xp += amount;
    G.ui?.floatText(this, `+${amount} XP`, 'xp');
    let leveled = false;
    while (this.level < LEVEL_CAP && this.data.xp >= xpToNext(this.level)) {
      this.data.xp -= xpToNext(this.level);
      this.levelUp();
      leveled = true;
    }
    if (this.level >= LEVEL_CAP) this.data.xp = 0;
    G.ui?.refresh?.();
    return amount;
  }

  levelUp() {
    this.level++;
    this.data.level = this.level;
    this.applyTalents(false);
    this.statsDirty = true;
    this.recalc();
    this.hp = this.stats.maxHp;
    this.mp = this.stats.maxMp;
    pillar(this.pos.x, this.pos.y, this.pos.z, '#ffe68a', 70, 4);
    burst(this.pos.x, this.pos.y + 1, this.pos.z, { count: 40, color: '#ffe68a', color2: '#ffffff', speed: 6, life: 1 });
    G.audio?.play('levelup');
    const news = classSkills(this.cls).filter((s) => s.lvl === this.level).map((s) => s.name);
    for (const s of classSkills(this.cls)) if (s.lvl === this.level) this.placeOnBar(s.id);
    if (this.level === 10) news.push('Monture (à acheter à l\'écurie)');
    G.ui?.announce(`Niveau ${this.level} !`, 'level', (news.length ? 'Nouvelles compétences : ' + news.join(', ') + '. ' : '') + 'Un point de talent à dépenser (touche K).');
    G.world.emit('levelup', this);
    G.net?.announceLevel?.(this.level);
    G.saveNow?.();
  }

  // ---------------------------------------------------------------------------
  // Spécialisation et talents
  applyTalents(save = true) {
    this.talents = this.data.talents[this.spec] ||= {};
    refreshTalents(this, { mount: !!this.data.hasMount });
    this.data.skills = this.skills;
    if (this.model) this.recalc();
    G.ui?.refresh?.();
    if (save) G.saveSoon?.();
  }
  talentsFree() { return talentPoints(this.level) - spent(this.talents); }
  talentAdd(nodeId) {
    const n = NODE_BY[this.spec]?.[nodeId];
    if (!n) return false;
    const err = whyNot(this, this.spec, n, this.talents);
    if (err) { G.ui?.error(err); return false; }
    this.talents[n.id] = (this.talents[n.id] || 0) + 1;
    this.applyTalents();
    if (n.ability) { this.placeOnBar(n.ability); G.ui?.notify(`Nouvelle technique : ${SKILL_BY_ID[n.ability]?.name}`); }
    G.audio?.play('learn');
    return true;
  }
  talentRemove(nodeId) {
    const n = NODE_BY[this.spec]?.[nodeId];
    if (!n || !canRemove(this.spec, n, this.talents)) return false;
    this.talents[n.id]--;
    if (!this.talents[n.id]) delete this.talents[n.id];
    this.applyTalents();
    G.audio?.play('close');
    return true;
  }
  talentReset() {
    for (const k of Object.keys(this.talents)) delete this.talents[k];
    this.applyTalents();
    G.ui?.notify('Talents réinitialisés.');
  }
  setSpec(id) {
    if (!SPECS[id] || SPECS[id].cls !== this.cls || id === this.spec) return false;
    if (this.inCombat()) { G.ui?.error('Impossible en combat.'); return false; }
    if (G.inst?.encounterActive?.()) { G.ui?.error('Impossible pendant un combat de boss.'); return false; }
    const d = this.data;
    // chaque spécialisation garde sa propre barre d'action
    d.specBars[this.spec] = d.bar.map((x) => (x ? { ...x } : null));
    for (const b of this.buffs.slice()) if (b.def.flags?.form) removeBuff(this, b);
    const old = this.spec;
    this.spec = d.spec = id;
    this.applyTalents(false);
    const saved = d.specBars[id];
    if (saved) d.bar = saved.map((x) => (x ? { ...x } : null));
    else {
      const oldOnly = new Set(specAbilityIds(old));
      d.bar = d.bar.map((x) => (x && x.k === 's' && oldOnly.has(x.id) ? null : x));
      const ob = basicSkill({ cls: this.cls, spec: old }), nb = basicSkill(this);
      if (ob && nb && ob.id !== nb.id) { const i = d.bar.findIndex((x) => x && x.k === 's' && x.id === ob.id); if (i >= 0) d.bar[i] = { k: 's', id: nb.id }; }
      for (const sid of specAbilityIds(id)) if (this.skills[sid]) this.placeOnBar(sid);
      // cases vides : compétences de classe apprises qui ne sont pas encore sur la barre
      for (const s of classSkills(this.cls)) if (this.skills[s.id] && !s.basic) this.placeOnBar(s.id);
    }
    while (d.bar.length < BAR_SLOTS) d.bar.push(null);
    this.cds = {};
    this.hp = Math.min(this.hp, this.stats.maxHp);
    pillar(this.pos.x, this.pos.y, this.pos.z, '#ffe68a', 26, 2.5);
    G.audio?.play('levelup');
    G.ui?.announce(`Spécialisation : ${SPECS[id].name}`, 'quest', `${({ tank: 'Tank', heal: 'Soigneur', dps: 'Dégâts' })[SPECS[id].role]} — vos talents de cette voie sont actifs.`);
    G.net?.announceSpec?.();
    G.ui?.refresh?.();
    G.saveSoon?.();
    return true;
  }
  // place une compétence sur la première case libre des barres visibles
  placeOnBar(id) {
    const bar = this.data.bar;
    if (!id || bar.some((x) => x && x.k === 's' && x.id === id)) return false;
    const order = [...Array(9).keys()];
    const S = G.settings || {};
    if (S.bar2) for (let i = 10; i < 20; i++) order.push(i);
    if (S.bar3) for (let i = 20; i < 30; i++) order.push(i);
    if (S.bar4) for (let i = 30; i < 40; i++) order.push(i);
    const i = order.find((k) => !bar[k]);
    if (i === undefined) return false;
    bar[i] = { k: 's', id };
    G.ui?.refresh?.();
    return true;
  }

  onDeath(killer) {
    this.data.deaths++;
    this.deadT = 0;
    this.engaged = null;
    this.autoRun = false;
    G.ui?.showDeath(killer);
    G.audio?.play('death');
  }

  respawn() {
    this.dead = false;
    this.model.revive();
    if (G.inst?.active) { const c = G.inst.respawnPoint(); this.teleport(c.x, c.z); }
    else { const gy = G.world.graveyardFor(this); this.teleport(gy.x + (Math.random() - 0.5) * 6, gy.z + 6); }
    this.recalc();
    this.hp = this.stats.maxHp * 0.6;
    this.mp = this.stats.maxMp * 0.6;
    this.combatT = 99;
    pillar(this.pos.x, this.pos.y, this.pos.z, '#ffffff', 30, 3);
    G.ui?.hideDeath();
    G.saveNow?.();
  }

  // relevé sur place par un soigneur
  resurrect(k = 0.5, by = null) {
    if (!this.dead) return;
    this.dead = false;
    this.model.revive();
    this.recalc();
    this.hp = this.stats.maxHp * k;
    this.mp = this.stats.maxMp * k;
    this.combatT = 99;
    pillar(this.pos.x, this.pos.y, this.pos.z, '#fff4c8', 30, 3);
    G.ui?.hideDeath();
    if (by) G.ui?.notify(`${by.name} vous ressuscite.`);
    G.audio?.play('levelup');
  }
}
