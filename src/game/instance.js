import { isInstancePoint } from '../data/world-space.js';
// Instances : donjons (5 joueurs), raids (10) et Abîme sans fin. Construction et peuplement des salles,
// rencontres de boss (phases, barrière, fureur, gardiens, boss liés), points de contrôle, résurrections,
// récompenses (emblèmes), navigation par chemin (A*) et interface (suivi, carte, mini-carte).
import * as THREE from 'three';
import { texturizeProps } from '../engine/textures.js';
import { G } from './state.js';
import { DUNGEON_BY_ID, INFINITE, THEME_TRASH, INFINITE_BOSSES, AFFIXES, encounterName } from '../data/dungeons.js';
import { MOB_BY_ID } from '../data/mobs.js';
import { buildDungeon, gridHeight, gridWalk, gridLava, gridLos, findPath, roomAt, roomDoorCells, cellCenter, invalidateNav } from '../world/dungeon.js';
import { setExtRegion, EXT_X } from '../world/terrain.js';
import { EXTRA_ABILITIES } from './mob.js';
import { addBuff, removeBuff, hasBuff, dist, dealDamage, telegraph, groundZone, burst, shockRing, kill } from './combat.js';
import { pillar } from './fx.js';
import { GeoBuilder, vcGlowMaterial } from '../engine/geom.js';
import { makeConsumable } from '../data/items.js';
import { Inv } from './inventory.js';
import { mulberry32, R } from '../core/rng.js';
import { clamp, escapeHtml, pick } from '../core/util.js';
import { CLASSES } from '../data/classbase.js';
import { isHealer } from '../data/specs.js';
import { mobXp } from './progress.js';

// Réglages de difficulté (multiplicateurs appliqués aux courbes de base des monstres)
const TUNE = {
  dungeon: { trashHp: 1.9, trashDmg: 1.2, bossHp: 2.7, bossDmg: 1.4 },
  raid: { trashHp: 2.4, trashDmg: 1.35, bossHp: 2.4, bossDmg: 1.6 },
  infinite: { trashHp: 1.8, trashDmg: 1.15, bossHp: 2.4, bossDmg: 1.3 },
  heroic: { hp: 1.4, dmg: 1.25 },
};
const TIPS = [
  'Écartez-vous des zones rouges annoncées au sol.',
  'Les soins des boss peuvent être interrompus : étourdissement, Heurt de bouclier, Défi solennel, Onde sismique…',
  "Quand un boss s'entoure de gardiens, abattez-les pour briser son bouclier.",
  'Après un combat, un soigneur vivant relève les membres tombés du groupe.',
  'Chaque boss vaincu rapporte des Emblèmes de bravoure, à échanger à l\'Intendance (touche U).',
  "Dans l'Abîme sans fin, si tout le groupe tombe en même temps, la descente s'arrête.",
  'Condamné ? Éloignez-vous de vos alliés avant l\'explosion.',
  'Traqué par un boss ? Courez : il vous lâchera au bout de quelques secondes.',
  'Les créatures vaincues laissent parfois leur pierre d\'âme : elles deviennent vos familiers (touche Y).',
];

// source neutre des dangers d'affixes (Abîme)
const AFFIX_SRC = { kind: 'mob', name: "L'Abîme", faction: 2, pos: { x: 0, z: 0 }, stats: {}, level: 30, buffs: [] };

export const fmtTime = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const idxOf = (D, x, z) => Math.floor(z - D.z0) * D.size + Math.floor(x - D.x0);
const okFloor = (D, x, z) => gridWalk(D, x, z) && !gridLava(D, x, z);
const short = (name) => name.split(',')[0];

function insidePoint(r, x, z, m = 3) {
  const dx = x - r.x, dz = z - r.z;
  if (r.round) { const d = Math.hypot(dx, dz) || 1; const k = Math.min(1, (r.hw - m) / d); return { x: r.x + dx * k, z: r.z + dz * k }; }
  return { x: r.x + clamp(dx, -(r.hw - m), r.hw - m), z: r.z + clamp(dz, -(r.hd - m), r.hd - m) };
}

function packPoints(D, r, n, rnd) {
  const out = [];
  for (let tries = 0; tries < 120 && out.length < n; tries++) {
    const x = r.x + (rnd() - 0.5) * 2 * (r.hw - 4), z = r.z + (rnd() - 0.5) * 2 * (r.hd - 4);
    if (r.round && Math.hypot(x - r.x, z - r.z) > r.hw - 4) continue;
    if (!okFloor(D, x, z)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 8.5)) continue;
    out.push({ x, z });
  }
  return out;
}

function pickAffixes(floor, rnd) {
  const n = floor >= 15 ? 3 : floor >= 8 ? 2 : floor >= 3 ? 1 : 0;
  const keys = Object.keys(AFFIXES);
  const out = [];
  while (out.length < n) { const k = keys[Math.floor(rnd() * keys.length)]; if (!out.includes(k)) out.push(k); }
  return out;
}

export const Inst = {
  active: null,
  budget: 0,

  init() {
    G.world.on('kill', (tgt, src) => this.onKill(tgt, src));
    G.world.on('instSpawn', (m) => this.onSpawn(m));
    (G.frameHooks ||= []).push((dt) => this.update(dt));
  },

  // ---------------------------------------------------------------------------
  // Groupe
  members() {
    const P = G.player;
    return G.party?.members?.length ? G.party.members.filter(Boolean) : P ? [P] : [];
  },
  sameSpace(e) {
    return isInstancePoint(e.pos.x, e.pos.z) && (e.kind !== 'remote' || e.inst === this.active?.key);
  },
  partyAlive() { return this.members().filter((e) => !e.dead && this.sameSpace(e)); },
  encounterActive() { return !!this.active?.encounters.some((e) => e.state === 'engaged'); },
  los(ax, az, bx, bz) { return !this.active || gridLos(this.active.D, ax, az, bx, bz, 0.35); },
  inRoom(e, room) { return !!this.active && isInstancePoint(e.pos.x, e.pos.z) && roomAt(this.active.D, e.pos.x, e.pos.z) === room; },
  respawnPoint() {
    const c = this.active.checkpoint;
    for (let i = 0; i < 8; i++) { const x = c.x + (R() - 0.5) * 4, z = c.z + (R() - 0.5) * 4; if (okFloor(this.active.D, x, z)) return { x, z }; }
    return c;
  },
  stats() { const d = G.player.data; return (d.inst ||= {}); },
  nameOf(id) { return id === INFINITE.id ? INFINITE.name : DUNGEON_BY_ID[id]?.name || null; },

  // ---------------------------------------------------------------------------
  // Écran de chargement (le temps de générer le donjon)
  withLoading(title, sub, fn) {
    let el = document.getElementById('instload');
    if (!el) { el = document.createElement('div'); el.id = 'instload'; document.getElementById('ui').appendChild(el); }
    el.innerHTML = `<div class="il-t">${escapeHtml(title)}</div><div class="il-s">${escapeHtml(sub || '')}</div><div class="il-tip">${escapeHtml(pick(R, TIPS))}</div>`;
    el.className = 'on';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try { fn(); } catch (e) { console.error(e); }
      setTimeout(() => { el.className = 'off'; }, 350);
    }));
  },
  go(id, o = {}) {
    const def = id === INFINITE.id ? INFINITE : DUNGEON_BY_ID[id];
    if (!def) return;
    const sub = def.kind === 'infinite' ? `Étage ${o.floor || 1}` : def.kind === 'raid' ? (o.diff === 'heroic' ? 'Raid héroïque — 10 joueurs' : 'Raid — 10 joueurs') : o.diff === 'heroic' ? 'Donjon héroïque' : 'Donjon';
    this.withLoading(def.name, sub, () => this.enter(id, o));
  },

  // ---------------------------------------------------------------------------
  // Entrée
  enter(id, o = {}) {
    const P = G.player;
    if (!P || P.dead) return false;
    const def = id === INFINITE.id ? INFINITE : DUNGEON_BY_ID[id];
    if (!def) return false;
    const prev = this.active;
    const returnPos = prev ? prev.returnPos : { x: P.pos.x, z: P.pos.z };
    const run = prev && prev.def === def && def.kind === 'infinite' ? prev.run : null;
    if (prev) this.teardown();
    const kind = def.kind;
    const floor = kind === 'infinite' ? Math.max(1, o.floor | 0 || 1) : 0;
    const seed = (o.seed ?? Math.floor(Math.random() * 2147483646) + 1) >>> 0;
    const rnd = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    const diff = o.diff === 'heroic' && (kind === 'dungeon' || kind === 'raid') ? 'heroic' : 'normal';
    const members = this.members();
    const avg = Math.round(members.reduce((s, e) => s + (e.level || 1), 0) / Math.max(1, members.length));
    let base;
    if (o.base) base = o.base;
    else if (kind === 'infinite') base = clamp(avg, 10, 30) + Math.floor((floor - 1) / 10);
    else if (kind === 'raid') base = diff === 'heroic' ? 32 : 30;
    else if (diff === 'heroic') base = Math.min(32, Math.max(def.lvl[1], avg) + 2);
    else base = clamp(avg, def.lvl[0], def.lvl[1]);
    const cap = kind === 'raid' ? 10 : 5;
    // groupe incomplet : créatures un peu moins robustes (jamais sous 40 %)
    const gf = o.gf ?? clamp(0.4 + (0.6 * Math.min(members.length, cap)) / cap, 0.4, 1);
    let theme, seq;
    if (kind === 'infinite') {
      theme = def.themes[(floor - 1) % def.themes.length];
      seq = floor % 5 === 0 ? ['entry', 'trash', 'trash', 'boss'] : ['entry', 'trash', 'trash', 'trash', 'exit'];
    } else { theme = def.theme; seq = def.layout; }
    const D = buildDungeon({ kind: kind === 'raid' ? 'raid' : 'dungeon', theme, layout: seq }, { seed, theme, seq });
    G.scene.add(D.group);
    const affixes = kind === 'infinite' ? pickAffixes(floor, rnd) : [];
    const kindName = kind === 'raid' ? (diff === 'heroic' ? 'Raid héroïque — 10 joueurs' : 'Raid — 10 joueurs') : kind === 'infinite' ? 'Abîme sans fin' : diff === 'heroic' ? 'Donjon héroïque — 5 joueurs' : 'Donjon — 5 joueurs';
    const A = this.active = {
      def, kind, id: def.id, seed, diff, floor, base, gf, D, theme, affixes, returnPos, kindName,
      key: `${def.id}:${seed}:${diff}:${floor}`,
      spawns: [], encounters: [], mats: [], checkpoint: { x: D.entry.x, z: D.entry.z + 2 },
      startT: G.time, deaths: 0, kills: 0, total: 0, done: false, portal: null,
      run: run || { startFloor: floor, t0: G.time, deaths: 0 },
      zone: {
        id: 'inst_' + def.id, name: kind === 'infinite' ? `${def.name} — étage ${floor}` : def.name, owner: -2, instance: true, kindName,
        biome: kind === 'raid' ? 'raid' : kind === 'infinite' ? 'abyss' : 'dungeon', lvl: [base, base + (kind === 'raid' ? 2 : 1)],
      },
      tickT: 0, volcT: 6, trackT: 0, reviveT: 0, hintT: 0,
    };
    setExtRegion({ height: (x, z) => gridHeight(D, x, z), walk: (x, z) => gridWalk(D, x, z), lava: (x, z) => gridLava(D, x, z), zone: A.zone });
    this.populate(A, rnd);
    G.world.spawns.push(...A.spawns);
    G.sky.setIndoor(theme);
    const r0 = D.rooms[0], r1 = D.rooms[1];
    this.bringParty(A.checkpoint = { x: r0.x, z: r0.z }, Math.atan2(r1.x - r0.x, r1.z - r0.z));
    G.world.actT = 0; // activation immédiate des salles proches
    const sub = kind === 'infinite'
      ? (affixes.length ? 'Affixes : ' + affixes.map((a) => AFFIXES[a].name).join(', ') : 'Pas encore d\'affixe. Descendez !')
      : `${kindName} · Niveau ${base}${A.encounters.length ? ` · ${A.encounters.length} boss` : ''}`;
    setTimeout(() => G.ui?.announce(A.zone.name, 'boss', sub), 900);
    if (kind === 'infinite' && floor > 1) G.ui?.log(`Étage ${floor} de l'Abîme.${affixes.length ? ' Affixes : ' + affixes.map((a) => `${AFFIXES[a].name} (${AFFIXES[a].desc})`).join(' ') : ''}`, 'evt');
    if (this.members().some((m) => m.kind === 'remote') && !o.remote) G.net?.emit?.('ii', def.id, seed, diff, floor, base, Math.round(gf * 100) / 100);
    G.ui?.refresh();
    return true;
  },

  // Création des monstres de chaque salle
  populate(A, rnd) {
    const { D, def, kind } = A;
    const T = TUNE[kind];
    const H = A.diff === 'heroic' ? TUNE.heroic : { hp: 1, dmg: 1 };
    const aff = new Set(A.affixes);
    const fl = A.floor || 1;
    const infHp = kind === 'infinite' ? 1 + 0.08 * (fl - 1) : 1, infDmg = kind === 'infinite' ? 1 + 0.045 * (fl - 1) : 1;
    const gDmg = 0.6 + 0.4 * A.gf;
    const trashHp = T.trashHp * H.hp * A.gf * infHp * (aff.has('renforce') ? 1.25 : 1);
    const trashDmg = T.trashDmg * H.dmg * gDmg * infDmg;
    const bossHp = T.bossHp * H.hp * A.gf * infHp * (aff.has('tyrannique') ? 1.3 : 1) * (aff.has('renforce') ? 1.1 : 1);
    const bossDmg = T.bossDmg * H.dmg * gDmg * infDmg * (aff.has('tyrannique') ? 1.3 : 1);
    const trashList = (kind === 'infinite' ? THEME_TRASH[A.theme] : def.trash).filter((id) => MOB_BY_ID[id]);
    let n = 0, bi = 0;
    const add = (o) => { const s = { id: 1e6 + n++, wander: 1.5, respawn: 1e9, inst: true, ...o }; A.spawns.push(s); return s; };
    const nRooms = D.rooms.length;
    const nBoss = D.rooms.filter((r) => r.kind === 'boss').length;
    D.rooms.forEach((r, k) => {
      if (r.kind === 'entry') return;
      const prog = k / Math.max(1, nRooms - 1);
      if (r.kind === 'boss') {
        const ids = kind === 'infinite' ? [INFINITE_BOSSES[Math.floor(rnd() * INFINITE_BOSSES.length)]] : def.bosses[bi];
        const last = bi === nBoss - 1;
        const lvl = kind === 'raid' ? MOB_BY_ID[ids[0]].lvl[0] : A.base + (last ? 1 : 0);
        const enc = {
          i: A.encounters.length, room: k, r, ids, spawns: [], state: 'idle', t: 0, wipeT: 0, enraged: false, phaseDone: new Set(),
          cells: roomDoorCells(D, r), name: encounterName(ids, MOB_BY_ID), final: last, barrier: null,
        };
        ids.forEach((mid, j) => {
          const a = ids.length > 1 ? (j / ids.length) * Math.PI * 2 + 0.4 : 0;
          const off = ids.length > 1 ? 5.5 : 0;
          const s = add({
            mob: mid, x: r.x + Math.sin(a) * off, z: r.z + Math.cos(a) * off, level: lvl, group: 'enc' + enc.i, hpScale: bossHp, dmgScale: bossDmg,
            leash: Math.max(r.hw, r.hd) + 30, wander: 0, aggro: 12, room: k, enc: enc.i, lootMul: 1 / ids.length,
          });
          enc.spawns.push(s);
        });
        A.encounters.push(enc);
        bi++;
        return;
      }
      // salle de monstres : meutes (un chef d'élite de temps en temps)
      const big = Math.min(r.hw, r.hd) >= 11;
      const packs = kind === 'raid' ? 3 + (big ? 1 : 0) : 2 + (big && rnd() < 0.6 ? 1 : 0);
      packPoints(D, r, packs, rnd).forEach((p, pi) => {
        const size = kind === 'raid' ? 3 + Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * 2);
        const eliteLead = rnd() < (kind === 'raid' ? 0.55 : 0.35);
        for (let q = 0; q < size; q++) {
          const mid = trashList[Math.floor(rnd() * trashList.length)];
          const a = (q / size) * Math.PI * 2 + rnd();
          let x = p.x + Math.sin(a) * (q ? 2.3 : 0), z = p.z + Math.cos(a) * (q ? 2.3 : 0);
          if (!okFloor(D, x, z)) { x = p.x; z = p.z; }
          const lvl = clamp(A.base - 1 + Math.round(prog * 2), 1, 34);
          const elite = eliteLead && q === 0 && !MOB_BY_ID[mid].elite;
          const dElite = MOB_BY_ID[mid].elite || elite;
          add({ mob: mid, x, z, level: lvl, group: `pk${k}_${pi}`, hpScale: dElite ? trashHp * 0.62 : trashHp, dmgScale: dElite ? trashDmg * 0.85 : trashDmg, leash: 55, room: k, elite });
        }
      });
    });
    A.total = A.spawns.filter((s) => s.enc === undefined).length;
  },

  // Téléporte le groupe (bots, familiers) au point donné
  bringParty(pt, face) {
    const P = G.player;
    if (P.mounted) P.dismount();
    P.teleport(pt.x, pt.z);
    P.target = null; P.engaged = null;
    if (face !== undefined) { P.ry = face; G.cam.yaw = face; G.cam.pitch = 0.3; }
    let i = 0;
    for (const m of this.members()) {
      if (m === P || m.kind !== 'bot') continue;
      const a = (i++ / 9) * Math.PI * 2;
      let x = pt.x + Math.sin(a) * 2.6, z = pt.z + Math.cos(a) * 2.6;
      if (this.active && isInstancePoint(pt.x, pt.z) && !okFloor(this.active.D, x, z)) { x = pt.x; z = pt.z; }
      m.rec.x = x; m.rec.z = z;
      const e = m.rec.ent || m;
      if (e.dead) G.bots.reviveAt(e, x, z, 1);
      else { if (e.mounted) e.dismount(); e.teleport(x, z); }
      e.target = null; e.moveGoal = null; e.dodgeGoal = null; e.resting = false;
      if (e.model) e.model.sitting = false;
    }
  },

  // ---------------------------------------------------------------------------
  // Sortie
  leave(msg) {
    const A = this.active;
    if (!A) return;
    const P = G.player;
    const rp = A.returnPos;
    this.teardown();
    if (P.dead) P.resurrect(0.6);
    this.bringParty(rp);
    G.ui?.announce(msg || 'Vous quittez l\'instance.', 'quest');
    this.disbandLfg(true);
    G.saveNow?.();
  },

  // les compagnons de la recherche de groupe s'en vont
  disbandLfg(bye) {
    const list = this.members().filter((m) => m.kind === 'bot' && m.rec?.lfg);
    if (!list.length) return;
    list.forEach((m, k) => {
      const rec = m.rec;
      setTimeout(() => {
        if (bye && R() < 0.7 && rec.ent) G.chat?.say(rec.ent, 'grp', pick(R, ['Merci pour le groupe, à la prochaine !', 'gg, bonne continuation !', 'Merci tout le monde o/', 'C\'était cool, à plus !', 'Bonne soirée !']));
        setTimeout(() => {
          if (!G.party?.has(rec.ent || m)) return;
          G.party.remove(rec.ent || m, 'quitte le groupe.');
          rec.lfg = false;
          if (rec.temp) { if (rec.ent) pillar(rec.ent.pos.x, rec.ent.pos.y, rec.ent.pos.z, '#9fe8ff', 20, 2.5); G.bots.dropTemp(rec); }
        }, 1400);
      }, 600 + k * 350);
    });
    if (G.party) G.party.raid = false;
  },

  teardown() {
    const A = this.active;
    if (!A) return;
    const set = new Set(A.spawns);
    for (const s of A.spawns) if (s.ent) { G.world.remove(s.ent); s.ent = null; }
    G.world.spawns = G.world.spawns.filter((s) => !set.has(s));
    for (let i = G.world.temps.length - 1; i >= 0; i--) { const t = G.world.temps[i]; if (isInstancePoint(t.pos.x, t.pos.z)) { G.world.remove(t); G.world.temps.splice(i, 1); } }
    for (const e of G.world.entities.slice()) if (e.kind === 'mob' && isInstancePoint(e.pos.x, e.pos.z)) G.world.remove(e);
    G.scene.remove(A.D.group);
    A.D.dispose();
    for (const m of A.mats) m.dispose();
    setExtRegion(null);
    G.sky.setIndoor(null);
    this.active = null;
    G.ui?.refresh();
  },

  // ---------------------------------------------------------------------------
  // Navigation : point intermédiaire vers (x, z) en contournant les murs
  steer(e, x, z) {
    const A = this.active;
    const D = A.D;
    if (gridLos(D, e.pos.x, e.pos.z, x, z, 0.45)) { e.nav = null; return { x, z }; }
    let nav = e.nav;
    const stale = !nav || nav.key !== A.key || Math.hypot(nav.tx - x, nav.tz - z) > 3 || G.time > nav.until;
    if (stale) {
      if (this.budget <= 0) return nav && nav.key === A.key && nav.pts[nav.i] ? nav.pts[nav.i] : { x, z };
      this.budget--;
      const pts = findPath(D, e.pos.x, e.pos.z, x, z, 5000);
      nav = e.nav = { pts: pts || [], i: 0, tx: x, tz: z, until: G.time + 1.6 + R() * 0.6, key: A.key };
      if (!pts || !pts.length) return { x, z };
    }
    while (nav.i < nav.pts.length - 1) {
      const p = nav.pts[nav.i], q = nav.pts[nav.i + 1];
      if (Math.hypot(p.x - e.pos.x, p.z - e.pos.z) < 1.2 || gridLos(D, e.pos.x, e.pos.z, q.x, q.z, 0.45)) nav.i++;
      else break;
    }
    const p = nav.pts[nav.i];
    if (!p) return { x, z };
    if (nav.i === nav.pts.length - 1 && Math.hypot(p.x - e.pos.x, p.z - e.pos.z) < 1.2) return { x, z };
    return p;
  },

  // ---------------------------------------------------------------------------
  // Événements
  onSpawn(m) {
    const A = this.active;
    if (!A) return;
    if (A.affixes.includes('hatif')) addBuff(m, 'affix_hatif', m, { dur: 1e9 });
  },
  onTempSpawn(m) {
    const A = this.active;
    if (!A) return;
    m.noLoot = true;
    const T = TUNE[A.kind];
    const fl = A.kind === 'infinite' ? 1 + 0.06 * (A.floor - 1) : 1;
    m.hpScale = T.trashHp * A.gf * (A.diff === 'heroic' ? 1.3 : 1) * fl;
    m.dmgScale = (0.6 + 0.4 * A.gf) * (A.diff === 'heroic' ? 1.2 : 1) * (A.kind === 'infinite' ? 1 + 0.04 * (A.floor - 1) : 1);
    m.leash = 70;
    m.statsDirty = true;
    if (A.affixes.includes('hatif')) addBuff(m, 'affix_hatif', m, { dur: 1e9 });
  },
  onKill(tgt) {
    const A = this.active;
    if (!A) return;
    if (tgt === G.player) { A.deaths++; A.run.deaths++; return; }
    if (tgt.kind !== 'mob' || !isInstancePoint(tgt.pos.x, tgt.pos.z)) return;
    if (A.affixes.includes('bouillonnant') && !tgt.boss) this.pool(tgt.pos.x, tgt.pos.z);
    if (!tgt.spawn?.inst) return;
    if (tgt.spawn.enc === undefined) { A.kills++; this.checkFloor(); return; }
    this.bossDeath(A.encounters[tgt.spawn.enc], tgt);
  },

  yell(text) {
    if (!text) return;
    G.ui?.announce(text, 'boss');
    G.audio?.play('horn');
  },

  // ---------------------------------------------------------------------------
  // Rencontres de boss
  engage(enc, ents) {
    const A = this.active;
    enc.state = 'engaged'; enc.t = 0; enc.wipeT = 0; enc.enraged = false; enc.phaseDone.clear();
    const first = ents.find((e) => !e.dead && e.state === 'combat' && e.threat.size);
    const tgt = first?.pickTarget?.() || G.player;
    for (const e of ents) if (!e.dead && e.state !== 'combat') { e.threat.set(tgt, 1); e.state = 'combat'; }
    this.yell(ents.map((e) => e.def.yells?.pull).find(Boolean) || `${enc.name} engage le combat !`);
    this.setBarrier(enc, true);
    // les retardataires sont attirés dans la salle
    for (const m of this.partyAlive()) {
      if (m.kind === 'remote' || roomAt(A.D, m.pos.x, m.pos.z) === enc.room) continue;
      if (Math.hypot(m.pos.x - enc.r.x, m.pos.z - enc.r.z) > 95) continue;
      const p = insidePoint(enc.r, m.pos.x, m.pos.z);
      m.teleport(p.x, p.z);
      burst(p.x, m.pos.y + 1, p.z, { count: 14, color: '#e0d0ff', speed: 3, life: 0.5 });
      if (m === G.player) G.ui?.notify('Une force mystérieuse vous attire dans la salle !');
    }
  },

  setBarrier(enc, on) {
    const A = this.active;
    const W = A.D.G.walk;
    for (const id of enc.cells) W[id] = on ? 4 : 1;
    invalidateNav(A.D);
    for (const e of G.world.entities) if (e.nav) e.nav = null;
    if (on && !enc.barrier) {
      const gb = new GeoBuilder();
      const col = A.D.theme.accent;
      for (const id of enc.cells) { const c = cellCenter(id); const h = gridHeight(A.D, c.x, c.z); gb.box(1.02, 4.4, 1.02, col, c.x, h + 2.2, c.z); }
      if (!gb.empty) {
        const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false });
        A.mats.push(mat);
        enc.barrier = new THREE.Mesh(gb.build(), mat);
        A.D.group.add(enc.barrier);
      }
    }
    if (enc.barrier) enc.barrier.visible = on;
    // personne ne reste coincé dans la barrière
    if (on) for (const e of G.world.entities) {
      if (!isInstancePoint(e.pos.x, e.pos.z) || e.kind === 'remote') continue;
      if (W[idxOf(A.D, e.pos.x, e.pos.z)] === 4) { const p = insidePoint(enc.r, e.pos.x, e.pos.z); e.teleport(p.x, p.z); }
    }
  },

  phases(enc, m) {
    const ph = m.def.phases;
    if (!ph) return;
    const k = m.hp / (m.stats.maxHp || 1);
    ph.forEach((p, i) => {
      const key = m.spawn.id + ':' + i;
      if (enc.phaseDone.has(key) || k > p.at) return;
      enc.phaseDone.add(key);
      if (p.yell) this.yell(p.yell);
      if (p.add) for (const id of p.add) if (!m.abilityList.includes(id)) { m.abilityList = [...m.abilityList, id]; m.abCd[id] = 1.5 + R() * 3; }
      if (p.once) {
        const ab = EXTRA_ABILITIES[p.once];
        const t = m.pickTarget() || m.target || G.player;
        if (ab && t) { G.curCaster = m; try { ab.use(m, t); } catch (e) { console.error(e); } finally { G.curCaster = null; } }
      }
    });
  },

  updateEncounter(enc, dt) {
    if (enc.state === 'done') return;
    const ents = enc.spawns.map((s) => s.ent).filter(Boolean);
    const alive = ents.filter((e) => !e.dead);
    const allDead = enc.spawns.every((s) => (s.ent && s.ent.dead) || (!s.ent && s.deadUntil > 0));
    if (enc.state === 'idle') {
      if (allDead) { this.complete(enc); return; } // vaincu à distance (autre joueur)
      if (alive.some((e) => e.state === 'combat' && e.threat.size > 0)) this.engage(enc, ents);
      return;
    }
    enc.t += dt;
    if (allDead) { this.complete(enc); return; }
    // plus aucun membre vivant dans la salle, ou boss qui ne se bat plus : le combat est perdu
    const inside = this.partyAlive().filter((e) => roomAt(this.active.D, e.pos.x, e.pos.z) === enc.room);
    const fighting = alive.some((e) => e.state === 'combat');
    if (!inside.length || !fighting) { enc.wipeT += dt; if (enc.wipeT > (fighting ? 3 : 6)) { this.wipe(enc); return; } } else enc.wipeT = 0;
    for (const m of alive) {
      this.phases(enc, m);
      if (m.shieldAdds && hasBuff(m, 'shielded') && m.shieldAdds.every((a) => a.dead || !G.world.entities.includes(a))) {
        removeBuff(m, 'shielded');
        m.shieldAdds = null;
        G.ui?.announce(`Le bouclier de ${short(m.name)} se brise !`, 'boss', 'Il est de nouveau vulnérable.');
      }
      // un boss poussé hors de sa salle y revient
      if (roomAt(this.active.D, m.pos.x, m.pos.z) !== enc.room && !m.dashing && m.state !== 'evade') { const p = insidePoint(enc.r, m.pos.x, m.pos.z, 4); m.teleport(p.x, p.z); }
    }
    const enrageT = (alive[0]?.def.enrageT || 300) * (this.active.diff === 'heroic' ? 0.9 : 1);
    if (!enc.enraged && enc.t > enrageT) {
      enc.enraged = true;
      for (const m of alive) addBuff(m, 'boss_enrage', m, { dur: 9999 });
      G.ui?.announce(`${enc.name} entre dans une fureur meurtrière !`, 'boss', 'Le combat a trop duré : achevez-le vite !');
    }
    if (enc.barrier) enc.barrier.material.opacity = 0.26 + Math.sin(G.time * 4) * 0.08;
  },

  bossDeath(enc, m) {
    if (!enc) return;
    this.yell(m.def.yells?.death);
    if (m.shieldAdds) for (const a of m.shieldAdds) if (!a.dead) kill(a, null);
    const alive = enc.spawns.map((s) => s.ent).filter((e) => e && !e.dead);
    if (alive.length) {
      for (const e of alive) addBuff(e, 'grief', e, { dur: 9999 });
      G.ui?.announce(`Deuil vengeur : ${alive.map((e) => short(e.name)).join(' et ')} redouble${alive.length > 1 ? 'nt' : ''} de fureur !`, 'boss');
    }
  },

  wipe(enc) {
    enc.wipes = (enc.wipes || 0) + 1;
    enc.state = 'idle'; enc.t = 0; enc.wipeT = 0; enc.enraged = false; enc.phaseDone.clear();
    this.setBarrier(enc, false);
    const bosses = new Set();
    for (const s of enc.spawns) {
      const m = s.ent;
      if (!m) continue;
      bosses.add(m);
      if (m.dead) { G.world.remove(m); s.ent = null; s.deadUntil = 0; continue; } // les boss liés reviennent tous
      m.abilityList = m.def.abilities;
      for (const id of ['boss_enrage', 'grief', 'shielded', 'frenzied_affix']) removeBuff(m, id);
      m.shieldAdds = null; m.windup = null; m.castBar = null; m.addsSpawned = 0;
      m.evade();
    }
    for (let i = G.world.temps.length - 1; i >= 0; i--) { const t = G.world.temps[i]; if (t.owner && bosses.has(t.owner)) { G.world.remove(t); G.world.temps.splice(i, 1); } }
    G.ui?.announce('Le groupe a été vaincu…', 'boss', `${enc.name} reprend sa garde. Reprenez des forces et retentez votre chance !`);
  },

  complete(enc) {
    const A = this.active;
    enc.dur = Math.round(enc.t);
    enc.state = 'done';
    this.setBarrier(enc, false);
    A.checkpoint = { x: enc.r.x, z: enc.r.z };
    const em = A.kind === 'raid' ? 4 : A.kind === 'infinite' ? 2 + Math.floor(A.floor / 10) : A.diff === 'heroic' ? 3 : 2;
    this.giveEmblems(em);
    G.ui?.announce(`${enc.name} ${enc.ids.length > 1 ? 'sont vaincus' : 'est vaincu'} !`, 'quest', `+${em} Emblèmes de bravoure`);
    G.audio?.play('quest');
    const st = this.stats();
    st.bosses = (st.bosses || 0) + enc.ids.length;
    if (A.encounters.every((e) => e.state === 'done')) this.finish(enc);
  },

  giveEmblems(n) {
    if (n <= 0) return;
    Inv.add(makeConsumable('emblem', n));
  },

  finish(enc) {
    const A = this.active;
    const r = enc.r;
    if (A.kind === 'infinite') { this.openNextFloor(r.x, r.z + (r.round ? 0 : r.hd * 0.5)); return; }
    A.done = true;
    const P = G.player;
    const t = G.time - A.startT;
    const bonus = A.kind === 'raid' ? 6 : A.diff === 'heroic' ? 5 : 3;
    this.giveEmblems(bonus);
    const gold = Math.round((A.kind === 'raid' ? 420 : 50 + A.base * 8) * (A.diff === 'heroic' ? 1.6 : 1));
    P.data.gold += gold;
    G.ui?.goldMsg(gold);
    P.gainXp(mobXp(A.base) * (A.kind === 'raid' ? 22 : 12), 'dungeon');
    const st = this.stats();
    const key = A.id + (A.diff === 'heroic' ? '_h' : '');
    const rec = (st[key] ||= { n: 0, best: 0 });
    rec.n++;
    if (!rec.best || t < rec.best) rec.best = Math.round(t);
    setTimeout(() => G.ui?.announce(A.kind === 'raid' ? 'Raid terminé !' : 'Donjon terminé !', 'level', `${A.def.name} en ${fmtTime(t)} · +${bonus} emblèmes · +${gold} po`), 2500);
    this.makePortal(r.x, r.z + (r.round ? r.hw * 0.5 : r.hd * 0.55), '#9fe8ff', 'Portail de sortie', () => this.leave('Retour dans le monde. Bravo !'));
    for (const m of this.members()) if (m.kind === 'bot' && R() < 0.6) setTimeout(() => { if (m.model) G.chat?.say(m, 'grp', pick(R, ['gg !', 'GG tout le monde', 'Merci pour le groupe !', 'Bien joué, c\'était propre.', 'Facile :)', 'On en refait un ?'])); }, 1200 + R() * 3000);
    G.saveNow?.();
  },

  // ---------------------------------------------------------------------------
  // Abîme sans fin
  checkFloor() {
    const A = this.active;
    if (A.kind !== 'infinite' || A.portal || A.encounters.length) return;
    if (A.kills >= Math.ceil(A.total * 0.8)) {
      const r = A.D.rooms[A.D.rooms.length - 1];
      this.openNextFloor(r.x, r.z);
    }
  },
  openNextFloor(x, z) {
    const A = this.active;
    if (A.portal) return;
    const f = A.floor;
    this.recordFloor(f);
    const gold = 10 + f * 4;
    G.player.data.gold += gold;
    G.ui?.goldMsg(gold);
    this.giveEmblems(1 + (f >= 10 ? 1 : 0));
    G.ui?.announce(`Étage ${f} purifié !`, 'quest', `Le passage vers l'étage ${f + 1} est ouvert. Entrez dans le portail violet.`);
    this.makePortal(x, z, '#b58cff', `Descendre à l'étage ${f + 1}`, () => this.nextFloor());
  },
  nextFloor() {
    const A = this.active;
    const seed = (Math.imul(A.seed, 1103515245) + 12345) >>> 0 || 7;
    this.withLoading(INFINITE.name, `Étage ${A.floor + 1}`, () => this.enter(INFINITE.id, { floor: A.floor + 1, seed }));
  },
  recordFloor(f) {
    const d = G.player.data;
    const ab = (d.abyss ||= { best: 0, runs: 0 });
    if (f > ab.best) { ab.best = f; if (f > 1) G.ui?.log(`Nouveau record dans l'Abîme : étage ${f} !`, 'evt'); }
  },
  endRun() {
    const A = this.active;
    const reached = A.floor - 1;
    const ab = (G.player.data.abyss ||= { best: 0, runs: 0 });
    ab.runs++;
    this.leave(reached > 0 ? `L'Abîme vous rejette… ${reached} étage${reached > 1 ? 's' : ''} franchi${reached > 1 ? 's' : ''} (record : ${ab.best}).` : 'L\'Abîme vous rejette…');
  },

  // flaque toxique (affixe Bouillonnant)
  pool(x, z) {
    groundZone(AFFIX_SRC, x, z, 3, 7, 1, '#8ad040', () => {
      for (const f of this.partyAlive()) if (f.kind !== 'remote' && Math.hypot(f.pos.x - x, f.pos.z - z) < 3 + (f.radius || 0.5) * 0.5) dealDamage(null, f, f.stats.maxHp * 0.05, { school: 'poison', dot: true, pure: true });
    });
  },
  // éruptions sous les pieds (affixe Volcanique)
  volcano(dt) {
    const A = this.active;
    A.volcT -= dt;
    if (A.volcT > 0) return;
    A.volcT = 7;
    for (const e of this.partyAlive()) {
      if (e.kind === 'remote' || !e.inCombat()) continue;
      const x = e.pos.x, z = e.pos.z;
      telegraph(x, z, 2.8, 1.6, () => {
        for (const f of this.partyAlive()) if (f.kind !== 'remote' && Math.hypot(f.pos.x - x, f.pos.z - z) < 2.8 + (f.radius || 0.5)) dealDamage(null, f, f.stats.maxHp * 0.12, { school: 'fire', pure: true, noCrit: true });
        shockRing(x, z, 2.8, '#ff7a2a', 0.4);
        burst(x, gridHeight(A.D, x, z) + 0.4, z, { count: 22, color: '#ff8a3a', color2: '#ffe080', speed: 7, size: 0.24, life: 0.5 });
      }, { src: AFFIX_SRC });
    }
  },

  // ---------------------------------------------------------------------------
  makePortal(x, z, color, label, fn) {
    const A = this.active;
    const D = A.D;
    if (!okFloor(D, x, z)) { const r = D.rooms[roomAt(D, x, z)] || A.encounters.at(-1)?.r; if (r) { x = r.x; z = r.z; } }
    const y = gridHeight(D, x, z);
    const b = new GeoBuilder(), g = new GeoBuilder();
    const trim = D.theme.trim;
    b.box(0.9, 5.4, 0.9, trim, x - 2.4, y + 2.7, z);
    b.box(0.9, 5.4, 0.9, trim, x + 2.4, y + 2.7, z);
    b.box(5.7, 0.9, 1.0, trim, x, y + 5.5, z);
    b.cyl(2.6, 2.8, 0.25, 12, trim, x, y + 0.12, z);
    g.box(3.9, 4.8, 0.18, color, x, y + 2.7, z);
    g.cyl(2.2, 2.2, 0.06, 16, color, x, y + 0.28, z);
    const grp = new THREE.Group();
    const vc = texturizeProps(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    const gm = vcGlowMaterial();
    A.mats.push(vc);
    grp.add(new THREE.Mesh(b.build(), vc), new THREE.Mesh(g.build(), gm));
    const og = new GeoBuilder();
    og.octa(0.5, '#ffffff', 0, 0, 0, 1, 1.6, 1);
    const orb = new THREE.Mesh(og.build(), gm);
    orb.position.set(x, y + 6.6, z);
    grp.add(orb);
    D.group.add(grp);
    A.portal = { x, z, y, fn, label, grp, orb, color, used: false };
    pillar(x, y, z, color, 40, 4);
    G.audio?.play('teleport', { x, z });
  },

  // ---------------------------------------------------------------------------
  update(dt) {
    const A = this.active;
    if (!A) return;
    this.budget = 3;
    const P = G.player;
    if (!P) return;
    // sortie de l'espace instancié (rappel, pierre de voyage…) : fin de l'instance
    if (!isInstancePoint(P.pos.x, P.pos.z)) { this.teardown(); this.disbandLfg(true); return; }
    for (const enc of A.encounters) this.updateEncounter(enc, dt);
    if (!this.active) return;
    if (A.affixes.includes('volcanique')) this.volcano(dt);
    // portail
    if (A.portal) {
      const p = A.portal;
      p.orb.rotation.y += dt * 1.6;
      p.orb.position.y = p.y + 6.6 + Math.sin(G.time * 2) * 0.25;
      const d = Math.hypot(P.pos.x - p.x, P.pos.z - p.z);
      if (!P.dead && d < 2.8 && !p.used) { p.used = true; p.fn(); return; }
      A.hintT -= dt;
      if (d < 12 && A.hintT <= 0 && !P.dead) { A.hintT = 20; G.ui?.notify(`${p.label} : avancez dans le portail.`); }
    }
    A.tickT -= dt;
    if (A.tickT <= 0) {
      A.tickT = 0.5;
      // affixe Frénésie
      if (A.affixes.includes('frenesie')) {
        for (const e of G.world.entities) if (e.kind === 'mob' && !e.dead && isInstancePoint(e.pos.x, e.pos.z) && e.state === 'combat' && e.hp < e.stats.maxHp * 0.3 && !hasBuff(e, 'frenzied_affix')) addBuff(e, 'frenzied_affix', e, { dur: 999 });
      }
      // Abîme : si tout le groupe tombe, la descente s'arrête
      const alive = this.partyAlive();
      if (A.kind === 'infinite' && !alive.length) { A.endT = (A.endT ?? 3) - 0.5; if (A.endT <= 0) { this.endRun(); return; } }
      else A.endT = undefined;
      this.revives(alive);
    }
    A.trackT -= dt;
    if (A.trackT <= 0) { A.trackT = 0.25; this.renderTracker(document.getElementById('tracker')); }
  },

  // résurrections hors combat (le soigneur du groupe relève les morts)
  revives(alive) {
    const A = this.active;
    const P = G.player;
    const members = this.members();
    if (this.encounterActive() || alive.some((e) => e.inCombat?.())) { A.reviveT = 0; return; }
    A.reviveT += 0.5;
    if (A.reviveT < 3) return;
    const healer = alive.find((e) => e.kind === 'bot' && isHealer(e));
    if (P.dead && healer && dist(healer, P) < 70 && P.deadT > 2) {
      healer.faceTo(P.pos.x, P.pos.z);
      healer.model?.play('cast', 1.2);
      P.resurrect(0.55, healer);
      if (R() < 0.6) G.chat?.say(healer, 'grp', pick(R, ['Je te relève !', 'Debout !', 'Allez, on se relève.', 'Rez !']));
      return;
    }
    if (P.dead) return;
    for (const b of members) {
      if (b.kind !== 'bot' || !b.dead || b.deathT < 3) continue;
      const here = healer && isInstancePoint(b.pos.x, b.pos.z) && dist(healer, b) < 70;
      const x = here ? b.pos.x : P.pos.x + (R() - 0.5) * 4, z = here ? b.pos.z : P.pos.z + (R() - 0.5) * 4;
      G.bots.reviveAt(b, x, z, 0.5);
      if (healer && R() < 0.35) G.chat?.say(healer, 'grp', pick(R, [`Je relève ${b.name}.`, 'Rez en cours…', 'Debout, on continue !']));
    }
  },

  // ---------------------------------------------------------------------------
  // Interface
  renderTracker(el) {
    const A = this.active;
    if (!el || !A) return;
    const sig = [A.key, A.kills, A.portal ? 1 : 0, A.done ? 1 : 0, ...A.encounters.map((e) => e.state)].join('|');
    if (el._sig !== sig) {
      el._sig = sig;
      let html = `<div class="inst-tr"><div class="h">${escapeHtml(A.zone.name)}</div><div class="sub">${escapeHtml(A.kindName)} · niv. ${A.base} · <span class="tm num"></span></div>`;
      if (A.kind === 'infinite') {
        const ab = G.player.data.abyss || { best: 0 };
        html += `<div class="o">Record : étage ${ab.best || 0}</div>`;
        if (A.affixes.length) html += `<div class="aff">${A.affixes.map((a) => `<span title="${escapeHtml(AFFIXES[a].desc)}">${escapeHtml(AFFIXES[a].name)}</span>`).join('')}</div>`;
      }
      for (const enc of A.encounters) {
        const st = enc.state;
        html += `<div class="b ${st}"><span class="ic">${st === 'done' ? '✔' : st === 'engaged' ? '⚔' : '☠'}</span>${escapeHtml(enc.name)}</div>`;
        if (st === 'engaged') html += `<div class="bb" data-e="${enc.i}"></div>`;
      }
      if (A.kind === 'infinite' && !A.encounters.length) html += `<div class="o ${A.portal ? 'done' : ''}">Monstres vaincus : ${A.kills}/${A.total} (${Math.ceil(A.total * 0.8)} requis)</div>`;
      else html += `<div class="o">Monstres vaincus : ${A.kills}/${A.total}</div>`;
      if (A.portal) html += `<div class="o done">${escapeHtml(A.portal.label)} ouvert</div>`;
      html += `<button class="btn ghost small" data-act="leave">Quitter l'instance</button></div>`;
      el.innerHTML = html;
      el.onclick = (ev) => {
        if (ev.target?.dataset?.act !== 'leave') return;
        G.ui?.ask(A.kind === 'infinite' ? 'Remonter à la surface ? La descente dans l\'Abîme s\'arrêtera là.' : 'Quitter l\'instance ? Les boss vaincus ne réapparaîtront pas, mais vous devrez tout recommencer.', () => {
          if (this.active?.kind === 'infinite') this.endRun(); else this.leave();
        }, null, 'Quitter', 'Rester');
      };
    }
    const tm = el.querySelector('.tm');
    if (tm) tm.textContent = fmtTime(G.time - A.startT);
    // barres de vie des boss engagés
    for (const bb of el.querySelectorAll('.bb')) {
      const enc = A.encounters[+bb.dataset.e];
      const ents = enc.spawns.map((s) => s.ent).filter(Boolean);
      if (bb.children.length !== ents.length) bb.innerHTML = ents.map(() => '<div class="bh"><div class="f"></div><span></span></div>').join('');
      ents.forEach((e, i) => {
        const d = bb.children[i];
        const k = e.dead ? 0 : clamp(e.hp / (e.stats.maxHp || 1), 0, 1);
        d.querySelector('.f').style.transform = `scaleX(${k})`;
        const s = `${short(e.name)} ${Math.ceil(k * 100)} %${hasBuff(e, 'shielded') ? ' · protégé' : ''}${hasBuff(e, 'boss_enrage') ? ' · FUREUR' : ''}`;
        const sp = d.querySelector('span');
        if (sp._s !== s) { sp.textContent = s; sp._s = s; }
      });
    }
  },

  drawMinimapMarks(c, toX, toY, W) {
    const A = this.active;
    c.font = 'bold 24px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const enc of A.encounters) {
      let x = toX(enc.r.x), y = toY(enc.r.z);
      const dx = x - W / 2, dy = y - W / 2, d = Math.hypot(dx, dy);
      if (d > W / 2 - 16) { x = W / 2 + (dx / d) * (W / 2 - 16); y = W / 2 + (dy / d) * (W / 2 - 16); }
      const done = enc.state === 'done';
      c.lineWidth = 4; c.strokeStyle = '#000';
      c.fillStyle = done ? '#7a8a7a' : enc.state === 'engaged' ? '#ff5a3a' : '#ffd24a';
      c.strokeText(done ? '✔' : '☠', x, y); c.fillText(done ? '✔' : '☠', x, y);
    }
    if (A.portal) {
      const x = toX(A.portal.x), y = toY(A.portal.z);
      c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.lineWidth = 4; c.strokeStyle = A.portal.color; c.stroke();
    }
  },

  // Carte de l'instance (touche M)
  renderMap(b, win) {
    const A = this.active;
    b.innerHTML = '';
    const title = b.closest('.win')?.querySelector('h2');
    if (title) title.textContent = A.zone.name;
    const wrap = document.createElement('div');
    wrap.className = 'wmap';
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1024;
    wrap.appendChild(cv);
    b.appendChild(wrap);
    const D = A.D;
    // cadrage sur les salles
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (const r of D.rooms) { x0 = Math.min(x0, r.x - r.hw); x1 = Math.max(x1, r.x + r.hw); z0 = Math.min(z0, r.z - r.hd); z1 = Math.max(z1, r.z + r.hd); }
    const pad = 20, span = Math.max(x1 - x0, z1 - z0) + pad * 2;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const k = 1024 / span;
    const tx = (x) => (x - cx) * k + 512, tz = (z) => (z - cz) * k + 512;
    const s2 = D.map.width / D.size;
    const draw = () => {
      if (!win.isOpen('map') || this.active !== A) return;
      const c = cv.getContext('2d');
      c.fillStyle = '#07080c'; c.fillRect(0, 0, 1024, 1024);
      c.imageSmoothingEnabled = false;
      c.drawImage(D.map, (cx - span / 2 - D.x0) * s2, (cz - span / 2 - D.z0) * s2, span * s2, span * s2, 0, 0, 1024, 1024);
      c.font = 'bold 17px "Barlow Semi Condensed", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      D.rooms.forEach((r) => {
        if (r.kind === 'entry') { c.fillStyle = '#9fe8ff'; c.lineWidth = 4; c.strokeStyle = '#000'; c.strokeText('Entrée', tx(r.x), tz(r.z)); c.fillText('Entrée', tx(r.x), tz(r.z)); }
      });
      for (const enc of A.encounters) {
        const x = tx(enc.r.x), y = tz(enc.r.z);
        const done = enc.state === 'done';
        c.font = 'bold 34px Georgia'; c.lineWidth = 5; c.strokeStyle = '#000'; c.fillStyle = done ? '#8a9a8a' : '#ffd24a';
        c.strokeText(done ? '✔' : '☠', x, y - 12); c.fillText(done ? '✔' : '☠', x, y - 12);
        c.font = 'bold 16px "Barlow Semi Condensed", sans-serif'; c.lineWidth = 4;
        c.strokeText(enc.name, x, y + 16); c.fillStyle = done ? '#b0b8b0' : '#ffe9a8'; c.fillText(enc.name, x, y + 16);
      }
      if (A.portal) { c.beginPath(); c.arc(tx(A.portal.x), tz(A.portal.z), 12, 0, Math.PI * 2); c.lineWidth = 5; c.strokeStyle = A.portal.color; c.stroke(); }
      for (const e of this.members()) {
        if (e === G.player || !this.sameSpace(e)) continue;
        c.beginPath(); c.arc(tx(e.pos.x), tz(e.pos.z), 7, 0, Math.PI * 2); c.fillStyle = e.dead ? '#777' : CLASSES[e.cls]?.color || '#5fd3ff'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#000'; c.stroke();
      }
      const P = G.player;
      c.save(); c.translate(tx(P.pos.x), tz(P.pos.z)); c.rotate(-P.ry + Math.PI);
      c.beginPath(); c.moveTo(0, -14); c.lineTo(10, 10); c.lineTo(0, 5); c.lineTo(-10, 10); c.closePath();
      c.fillStyle = '#ffe68a'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#000'; c.stroke(); c.restore();
      requestAnimationFrame(() => setTimeout(draw, 250));
    };
    draw();
    const leg = document.createElement('div');
    leg.className = 'legend';
    leg.innerHTML = `<span><i style="background:#ffd24a;border-radius:50%"></i>Boss à vaincre</span><span><i style="background:#8a9a8a;border-radius:50%"></i>Boss vaincu</span><span><i style="background:#ffe68a"></i>Vous</span><span><i style="background:#5fd3ff;border-radius:50%"></i>Groupe</span>`;
    b.appendChild(leg);
  },
};
