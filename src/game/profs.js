import { isInstancePoint } from '../data/world-space.js';
// Métiers : apprentissage (2 primaires + 2 secondaires), atouts et défauts, récolte (filons, plantes, dépeçage, pêche),
// artisanat (recettes), progression de la compétence (1 à 150) et objets de métier (élixirs, plats, bandages).
import * as THREE from 'three';
import { G } from './state.js';
import {
  PROFS, PROF_LIST, PROF_MAX, TIER_REQ, TIER_NAMES, ZONE_TIER, tierForLevel, matId, matColor, RECIPES, RECIPE_BY_ID,
  diffColor, SKILLUP_CHANCE, TIER_ILVL, MAX_PRIMARY, MAX_SECONDARY,
} from '../data/profs.js';
import { makeConsumable, makeGear, CONSUMABLES, ARMOR_TYPE } from '../data/items.js';
import { CLASSES, CLASS_LIST } from '../data/classbase.js';
import { Inv } from './inventory.js';
import { Runes } from './runes.js';
import { RUNE_TYPES, RUNE_LIST, runeName } from '../data/runes.js';
import { WORLD_SCALE, WORLD_HALF, ZONES, HUBS, LANDMARKS } from '../data/zones.js';
import { zoneAt, getHeight, getSlope, roadDist, waterDepth, isLava, EXT_X } from '../world/terrain.js';
import { GeoBuilder, vcMaterial, vcGlowMaterial } from '../engine/geom.js';
import { mulberry32, R } from '../core/rng.js';
import { clamp, fmtInt } from '../core/util.js';
import { addBuff, removeBuff, hasBuff, dist } from './combat.js';
import { burst, pillar } from './fx.js';

// ---------------------------------------------------------------------------
// Données du personnage
export function ensureProfData(d) {
  if (!d.profs || !Array.isArray(d.profs.list)) d.profs = { list: [] };
  d.profs.list = d.profs.list.filter((p) => p && PROFS[p.id]);
  for (const p of d.profs.list) p.skill = clamp(Math.round(p.skill || 1), 1, PROF_MAX);
}
// somme des atouts et défauts des métiers appris
export function profMods(d) {
  const out = {};
  for (const p of d?.profs?.list || []) {
    const m = PROFS[p.id]?.mods;
    if (m) for (const k in m) out[k] = (out[k] || 0) + m[k];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Nœuds de récolte (filons et plantes), identiques pour tous les joueurs
const NODE_PER_ZONE = { ore: 13, herb: 15 };
const NODE_LABEL = {
  ore: ['Filon de cuivre', 'Filon de fer', "Filon d'argent-lune", "Filon d'orichalque", "Filon d'astralite"],
  herb: ['Feuille-soleil', 'Murmurelle', 'Vasefleur', 'Chardon-spectre', 'Givre-épine'],
};
let MAT_BASE = null, MAT_GLOW = null;
const GEO = {};
function nodeGeo(kind, tier) {
  const key = kind + tier;
  if (GEO[key]) return GEO[key];
  const b = new GeoBuilder(), g = new GeoBuilder();
  const col = matColor(kind === 'ore' ? 'ore' : 'herb', tier);
  if (kind === 'ore') {
    b.dodeca(0.85, '#6a6470', 0, 0.45, 0, 1.35, 0.75, 1.1);
    b.dodeca(0.55, '#5a5460', 0.75, 0.3, 0.35, 1, 0.8, 1);
    b.dodeca(0.45, '#625c68', -0.7, 0.25, -0.3, 1, 0.8, 1);
    const glowy = tier >= 3;
    for (const [x, y, z, s] of [[0.2, 0.95, 0.1, 1], [-0.35, 0.75, 0.35, 0.8], [0.6, 0.6, -0.2, 0.75], [-0.1, 0.55, -0.55, 0.7], [0.75, 0.55, 0.45, 0.6]]) {
      (glowy ? g : b).octa(0.2 * s, col, x, y, z, 1, 1.7, 1);
    }
  } else {
    const stem = tier >= 5 ? '#6aa0c0' : tier >= 4 ? '#7a8a7a' : '#4a8a2a';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.box(0.07, 0.7, 0.07, stem, Math.sin(a) * 0.18, 0.35, Math.cos(a) * 0.18, Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25);
      b.box(0.34, 0.04, 0.14, '#5aa03a', Math.sin(a) * 0.3, 0.25, Math.cos(a) * 0.3, 0, a, 0.3);
      (tier >= 3 ? g : b).octa(0.11, col, Math.sin(a) * 0.26, 0.74, Math.cos(a) * 0.26, 1, 0.8, 1);
    }
    (tier >= 3 ? g : b).octa(0.14, col, 0, 0.82, 0, 1, 1, 1);
  }
  GEO[key] = { base: b.build(), glow: g.empty ? null : g.build() };
  return GEO[key];
}

// ---------------------------------------------------------------------------
export const Profs = {
  nodes: [],
  built: false,
  get d() { return G.player?.data; },

  // --- apprentissage
  list() { return this.d?.profs?.list || []; },
  has(id) { return this.list().some((p) => p.id === id); },
  skill(id) { return this.list().find((p) => p.id === id)?.skill || 0; },
  rec(id) { return this.list().find((p) => p.id === id) || null; },
  mod(key) { return G.player?.pmods?.[key] || 0; },
  counts() {
    let primary = 0, secondary = 0;
    for (const p of this.list()) { if (PROFS[p.id].kind === 'primary') primary++; else secondary++; }
    return { primary, secondary };
  },
  whyNotLearn(id) {
    const P = PROFS[id];
    if (!P) return 'Métier inconnu.';
    if (this.has(id)) return 'Déjà appris.';
    const c = this.counts();
    if (P.kind === 'primary' && c.primary >= MAX_PRIMARY) return `Vous avez déjà ${MAX_PRIMARY} métiers primaires.`;
    if (P.kind === 'secondary' && c.secondary >= MAX_SECONDARY) return `Vous avez déjà ${MAX_SECONDARY} métiers secondaires.`;
    return null;
  },
  learn(id) {
    const err = this.whyNotLearn(id);
    if (err) { G.ui?.error(err); return false; }
    this.d.profs.list.push({ id, skill: 1 });
    this.applyMods();
    G.ui?.announce(`Nouveau métier : ${PROFS[id].name}`, 'quest', `Atout — ${PROFS[id].atout.name}. Défaut — ${PROFS[id].defaut.name}.`);
    G.audio?.play('learn');
    G.saveSoon?.();
    return true;
  },
  abandon(id) {
    const d = this.d;
    if (!d || !this.has(id)) return false;
    d.profs.list = d.profs.list.filter((p) => p.id !== id);
    this.applyMods();
    G.ui?.notify(`Vous avez abandonné le métier ${PROFS[id].name}. Sa compétence est perdue.`);
    G.saveSoon?.();
    return true;
  },
  applyMods() {
    const P = G.player;
    if (!P) return;
    P.pmods = profMods(P.data);
    P.statsDirty = true;
    G.ui?.refresh?.();
  },

  // --- progression : chance selon la couleur (orange, jaune, vert, gris)
  skillUp(id, req) {
    const r = this.rec(id);
    if (!r || r.skill >= PROF_MAX) return false;
    const col = diffColor(r.skill, req);
    if (!(R() < SKILLUP_CHANCE[col])) return false;
    r.skill++;
    G.ui?.log(`Votre compétence de ${PROFS[id].name} passe à ${r.skill}.`, 'sys');
    G.ui?.floatText(G.player, `${PROFS[id].name} ${r.skill}`, 'xp');
    const ti = TIER_REQ.indexOf(r.skill);
    if (ti > 0) G.ui?.announce(`${PROFS[id].name} : ${TIER_NAMES[ti]}`, 'quest', `Vous pouvez maintenant travailler les matériaux du palier ${ti + 1}.`);
    if (r.skill === PROF_MAX) G.ui?.announce(`${PROFS[id].name} : grand maître !`, 'level', 'Compétence maximale atteinte (150).');
    G.saveSoon?.();
    return true;
  },

  // --- action avec barre d'incantation (récolte, fabrication, pêche). Bouger l'interrompt.
  work(name, dur, fn, o = {}) {
    const P = G.player;
    if (!P || P.dead) return false;
    if (P.cast) { G.ui?.error('Vous êtes déjà occupé.'); return false; }
    if (P.mounted) P.dismount?.();
    const s = { id: 'x_work', name, cost: 0, cd: 0, anim: o.anim || 'cast', noCombat: true, moveOk: false, sound: o.sound || 'learn', run: () => { try { fn(); } catch (e) { console.error('métier', e); } } };
    P.cast = { s, rank: 1, t: null, pos: null, time: 0, dur, channel: false, tickT: 0 };
    P.model?.play(o.anim === 'channel' ? 'channel' : 'cast', dur + 0.1);
    return true;
  },

  // ---------------------------------------------------------------------------
  // Nœuds : génération déterministe
  buildNodes() {
    if (this.built) return;
    this.built = true;
    const rnd = mulberry32(5150);
    const out = [];
    const nearHub = (x, z) => HUBS.some((h) => Math.hypot(x - h.x, z - h.z) < h.r + 20);
    const nearLm = (x, z) => LANDMARKS.some((l) => l.r && Math.hypot(x - l.x, z - l.z) < l.r + 8);
    for (const zone of ZONES) {
      const tier = ZONE_TIER[zone.id] || 1;
      const cx0 = (zone.col === 0 ? -470 : zone.col === 1 ? -150 : 190) * WORLD_SCALE;
      const cz0 = (zone.row === 0 ? -470 : zone.row === 1 ? -150 : 190) * WORLD_SCALE;
      const size = (zone.col === 1 ? 300 : 280) * WORLD_SCALE;
      for (const kind of ['ore', 'herb']) {
        let n = 0, tries = 0;
        while (n < NODE_PER_ZONE[kind] * 8 && tries < 24000) {
          tries++;
          const x = cx0 + rnd() * size, z = cz0 + rnd() * size;
          if (zoneAt(x, z) !== zone || Math.abs(x) > WORLD_HALF - 100 || Math.abs(z) > WORLD_HALF - 100) continue;
          const h = getHeight(x, z);
          if (h < (zone.biome === 'swamp' ? -0.2 : 0.5) || waterDepth(x, z) > 0.05 || isLava(x, z)) continue;
          if (getSlope(x, z) > (kind === 'ore' ? 0.9 : 0.6)) continue;
          if (nearHub(x, z) || nearLm(x, z) || roadDist(x, z) < 5) continue;
          if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 22)) continue;
          out.push({ id: out.length, kind, tier, x, z, zone: zone.id, until: 0, grp: null });
          n++;
        }
      }
    }
    this.nodes = out;
  },
  nodeName(n) { return NODE_LABEL[n.kind][n.tier - 1]; },
  nodeProf(n) { return n.kind === 'ore' ? 'mineur' : 'herboriste'; },
  // activation des maillages autour du joueur ; réapparition des nœuds récoltés
  update(dt) {
    const P = G.player;
    if (!P || !G.scene) return;
    if (!this.built) this.buildNodes();
    this.actT = (this.actT || 0) - dt;
    if (this.actT > 0) return;
    this.actT = 0.5;
    if (!MAT_BASE) { MAT_BASE = vcMaterial(); MAT_GLOW = vcGlowMaterial(); }
    const far = isInstancePoint(P.pos.x, P.pos.z);
    for (const n of this.nodes) {
      const live = G.time >= n.until;
      const d = Math.hypot(n.x - P.pos.x, n.z - P.pos.z);
      const want = live && !far && d < 150;
      if (want && !n.grp) {
        const geo = nodeGeo(n.kind, n.tier);
        const grp = new THREE.Group();
        const m = new THREE.Mesh(geo.base, MAT_BASE);
        m.castShadow = true;
        grp.add(m);
        if (geo.glow) grp.add(new THREE.Mesh(geo.glow, MAT_GLOW));
        grp.position.set(n.x, getHeight(n.x, n.z) - 0.05, n.z);
        grp.rotation.y = (n.id * 2.39996) % (Math.PI * 2);
        const s = n.kind === 'ore' ? 1 : 1.25;
        grp.scale.setScalar(s);
        G.scene.add(grp);
        n.grp = grp;
      } else if (!want && n.grp) {
        G.scene.remove(n.grp);
        n.grp = null;
      }
    }
  },
  // retire les maillages (retour à l'écran titre)
  reset() {
    for (const n of this.nodes) if (n.grp) { G.scene?.remove(n.grp); n.grp = null; }
  },
  nearestNode(r = 4.8) {
    const P = G.player;
    let best = null, bd = r;
    for (const n of this.nodes) {
      if (G.time < n.until) continue;
      const d = Math.hypot(n.x - P.pos.x, n.z - P.pos.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  },
  gather(n) {
    const P = G.player;
    const prof = this.nodeProf(n);
    const pn = PROFS[prof].name;
    if (!this.has(prof)) { G.ui?.error(`Il faut le métier ${pn} (touche N).`); return true; }
    const req = TIER_REQ[n.tier - 1];
    const sk = this.skill(prof);
    if (sk < req) { G.ui?.error(`${pn} ${req} requis (vous : ${sk}).`); return true; }
    if (Math.hypot(n.x - P.pos.x, n.z - P.pos.z) > 5.5) { G.ui?.error('Trop loin.'); return true; }
    if (Inv.freeSlots() < 1) { G.ui?.error('Votre sac est plein !'); return true; }
    P.faceTo(n.x, n.z);
    this.work(n.kind === 'ore' ? `Extraction : ${this.nodeName(n)}` : `Cueillette : ${this.nodeName(n)}`, n.kind === 'ore' ? 2.2 : 1.6, () => {
      if (G.time < n.until) return;
      const kind = n.kind === 'ore' ? 'ore' : 'herb';
      const qty = 1 + (R() < 0.55 ? 1 : 0) + (R() < 0.15 ? 1 : 0);
      Inv.add(makeConsumable(matId(kind, n.tier), qty));
      if (kind === 'ore' && R() < this.mod('gemChance')) Inv.add(makeConsumable(matId('gem', n.tier), 1));
      // une rune se cache parfois dans un filon
      if (kind === 'ore' && R() < 0.015) Runes.add(Runes.rollType(), n.tier >= 4 ? 2 : 1, 1, { found: true });
      this.skillUp(prof, req);
      n.until = G.time + 150 + R() * 90;
      if (n.grp) { burst(n.x, getHeight(n.x, n.z) + 0.8, n.z, { count: 14, color: matColor(kind, n.tier), speed: 3, life: 0.5 }); G.scene.remove(n.grp); n.grp = null; }
      G.audio?.play(kind === 'ore' ? 'anvil' : 'loot');
    }, { sound: n.kind === 'ore' ? 'anvil' : 'loot' });
    return true;
  },

  // --- dépeçage des bêtes vaincues
  skinnable(m) {
    return !!m && m.kind === 'mob' && m.dead && !m.skinned && !m.temp && (m.def.family || 'bête') === 'bête' && !m.passiveCritter && m.deathT < 60;
  },
  trySkin(m) {
    const P = G.player;
    if (!this.skinnable(m)) return false;
    if (!this.has('depeceur')) { G.ui?.error('Il faut le métier Dépeceur (touche N).'); return true; }
    const t = tierForLevel(m.level);
    const req = TIER_REQ[t - 1];
    const sk = this.skill('depeceur');
    if (sk < req) { G.ui?.error(`Dépeceur ${req} requis (vous : ${sk}).`); return true; }
    if (dist(P, m) > 6) { G.ui?.error('Trop loin.'); return true; }
    if (Inv.freeSlots() < 1) { G.ui?.error('Votre sac est plein !'); return true; }
    P.faceTo(m.pos.x, m.pos.z);
    this.work(`Dépeçage : ${m.name}`, 1.8, () => {
      if (m.skinned) return;
      m.skinned = true;
      const qty = 1 + (m.elite || m.named ? 2 : 0) + (R() < 0.4 ? 1 : 0);
      Inv.add(makeConsumable(matId('leather', t), qty));
      this.skillUp('depeceur', req);
      burst(m.pos.x, m.pos.y + 0.5, m.pos.z, { count: 10, color: '#b08a5a', speed: 2, life: 0.4 });
    }, { sound: 'swing' });
    return true;
  },

  // --- pêche : il faut de l'eau (ou de la lave !) devant soi
  waterAhead() {
    const P = G.player;
    for (const d of [3, 5, 7, 9, 11, 13]) {
      const x = P.pos.x + Math.sin(P.ry) * d, z = P.pos.z + Math.cos(P.ry) * d;
      const lava = isLava(x, z);
      if (waterDepth(x, z) > 0.35 || lava) {
        const zone = zoneAt(x, z);
        const t = lava ? 5 : zone.id === 'pics' ? 4 : ZONE_TIER[zone.id] || 1;
        return { x, z, tier: Math.min(t, lava ? 5 : 4), lava };
      }
    }
    return null;
  },
  fish() {
    const P = G.player;
    const w = this.waterAhead();
    if (!w) return false;
    if (!this.has('pecheur')) { G.ui?.error('Il faut le métier Pêcheur (touche N).'); return true; }
    const req = TIER_REQ[w.tier - 1];
    const sk = this.skill('pecheur');
    if (sk < req) { G.ui?.error(`Pêcheur ${req} requis pour ces eaux (vous : ${sk}).`); return true; }
    if (P.inCombat()) { G.ui?.error('Impossible en combat.'); return true; }
    if (Inv.freeSlots() < 1) { G.ui?.error('Votre sac est plein !'); return true; }
    // bouchon
    const bob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshLambertMaterial({ color: w.lava ? '#ffcc66' : '#e03a2a', emissive: w.lava ? '#aa5500' : '#000000' }));
    bob.position.set(w.x, Math.max(getHeight(w.x, w.z), -0.1) + 0.1, w.z);
    G.scene.add(bob);
    const t0 = G.time;
    const bobTick = () => { if (!bob.parent) return false; bob.position.y = Math.max(getHeight(w.x, w.z), -0.1) + 0.12 + Math.sin((G.time - t0) * 4) * 0.05; return true; };
    G.world.addTicker(bobTick);
    const clean = () => { G.scene.remove(bob); bob.geometry.dispose(); bob.material.dispose(); };
    const ok = this.work(w.lava ? 'Pêche dans la lave' : 'Pêche', 4 + R() * 3, () => {
      clean();
      burst(w.x, bob.position.y + 0.2, w.z, { count: 12, color: w.lava ? '#ff9a3a' : '#bfe8ff', speed: 2.5, life: 0.5 });
      const r = R();
      if (r < 0.06) Inv.add(makeConsumable('bottle', 1));
      else Inv.add(makeConsumable(matId('fish', w.tier), 1 + (R() < 0.3 ? 1 : 0)));
      if (R() < 0.02) Runes.add(Runes.rollType(), 1 + (w.tier >= 4 ? 1 : 0), 1, { found: true });
      this.skillUp('pecheur', req);
    }, { anim: 'channel', sound: 'loot' });
    if (!ok) clean();
    // si l'action est interrompue (mouvement), le bouchon disparaît
    else G.world.addTicker(() => { if (!bob.parent) return false; if (!G.player?.cast || G.player.cast.s.id !== 'x_work') { clean(); return false; } return true; });
    return true;
  },

  // --- touche F : nœud, corps à dépecer, puis eau
  interact() {
    const P = G.player;
    if (!P || isInstancePoint(P.pos.x, P.pos.z)) return false;
    const n = this.nearestNode();
    if (n) return this.gather(n);
    let best = null, bd = 6;
    for (const e of G.world.query(P.pos.x, P.pos.z, 6)) {
      if (!this.skinnable(e)) continue;
      const d = dist(P, e);
      if (d < bd) { bd = d; best = e; }
    }
    if (best && this.has('depeceur')) return this.trySkin(best);
    if (this.waterAhead()) return this.fish();
    return false;
  },
  // clic droit sur un nœud à l'écran
  clickAt(sx, sy) {
    const P = G.player, cam = G.camera;
    if (!P || !cam) return false;
    const v = new THREE.Vector3();
    let best = null, bd = 34;
    for (const n of this.nodes) {
      if (!n.grp) continue;
      if (Math.hypot(n.x - P.pos.x, n.z - P.pos.z) > 40) continue;
      v.set(n.x, getHeight(n.x, n.z) + 0.6, n.z).project(cam);
      if (v.z > 1) continue;
      const x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
      const d = Math.hypot(x - sx, y - sy);
      if (d < bd) { bd = d; best = n; }
    }
    if (!best) return false;
    return this.gather(best);
  },

  // ---------------------------------------------------------------------------
  // Artisanat
  recipesFor(profId) { return RECIPES.filter((r) => r.prof === profId); },
  matsOk(r, times = 1) {
    for (const cid in r.mats) if (Inv.count((it) => it.cid === cid) < r.mats[cid] * times) return false;
    return true;
  },
  whyNotCraft(r, o = {}) {
    if (!this.has(r.prof)) return `Il faut le métier ${PROFS[r.prof].name}.`;
    if (this.skill(r.prof) < r.req) return `${PROFS[r.prof].name} ${r.req} requis.`;
    if (!this.matsOk(r)) return 'Matériaux insuffisants.';
    if (r.out.transmute) {
      const from = o.from;
      if (!from || Runes.count(from.t, from.l) < 2) return 'Choisissez 2 runes identiques à transmuter.';
      if (!o.type || o.type === from.t) return 'Choisissez un autre type de rune.';
    }
    if (r.out.rune && !o.type) return 'Choisissez le type de rune à graver.';
    if (!r.out.rune && !r.out.transmute && Inv.freeSlots() < 1) return 'Votre sac est plein !';
    return null;
  },
  craft(id, o = {}, times = 1) {
    const r = RECIPE_BY_ID[id];
    if (!r) return false;
    const err = this.whyNotCraft(r, o);
    if (err) { G.ui?.error(err); return false; }
    const P = G.player;
    if (P.inCombat()) { G.ui?.error('Impossible en combat.'); return false; }
    return this.work(`Fabrication : ${r.name}`, r.out.gear ? 2.5 : 1.6, () => {
      if (this.whyNotCraft(r, o)) return;
      for (const cid in r.mats) Inv.removeWhere((it) => it.cid === cid, r.mats[cid]);
      this.produce(r, o);
      this.skillUp(r.prof, r.req);
      G.win?.refresh?.();
      // fabrication en série
      if (times > 1) setTimeout(() => { if (G.player === P && !P.cast && !this.whyNotCraft(r, o)) this.craft(id, o, times - 1); }, 150);
    }, { sound: r.prof === 'forgeron' ? 'anvil' : 'learn' });
  },
  produce(r, o) {
    const P = G.player;
    const sk = this.skill(r.prof);
    if (r.out.item) {
      const n = r.out.n || 1;
      Inv.add(makeConsumable(r.out.item, n));
      return;
    }
    if (r.out.rune) {
      let l = r.out.rune;
      if (R() < clamp((sk - r.req) / 150, 0, 0.2)) l++;
      Runes.add(o.type, l, 1);
      return;
    }
    if (r.out.transmute) {
      Runes.take(o.from.t, o.from.l, 2);
      Runes.add(o.type, o.from.l, 1);
      G.ui?.notify(`Transmutation : ${runeName(o.type, o.from.l)}`);
      return;
    }
    if (r.out.gear) {
      const gspec = r.out.gear;
      let cls = o.cls || P.cls;
      if (gspec.classes && !gspec.classes.includes(cls)) cls = gspec.classes.includes(P.cls) ? P.cls : gspec.classes[0];
      // qualité : meilleure quand la compétence dépasse largement le prérequis
      let q = 38 + Math.min(48, (sk - r.req) * 1.15) + R() * 20;
      if (sk >= PROF_MAX && r.tier >= 4 && R() < 0.06) q = 99 + R();
      q = clamp(Math.round(q), 0, 100);
      const mythic = sk >= PROF_MAX && r.tier === 5 && R() < 0.02;
      const it = makeGear({ slot: gspec.slot, cls, ilvl: TIER_ILVL[r.tier - 1] + (sk - r.req >= 30 ? 1 : 0), quality: q, mythic });
      it.crafted = P.name;
      Inv.add(it);
      if (it.rarity >= 3) G.ui?.announce(mythic ? 'Chef-d\'œuvre mythique !' : 'Chef-d\'œuvre !', 'level', `${it.name} — ${it.sockets} emplacement${it.sockets > 1 ? 's' : ''} de rune`);
    }
  },

  // ---------------------------------------------------------------------------
  // Butin lié aux métiers (étoffes des humanoïdes, viande des bêtes)
  onLoot(m) {
    if (!m || m.kind !== 'mob' || m.passive && !m.def) return;
    const fam = m.def.family || 'bête';
    const t = tierForLevel(m.level);
    if (fam === 'humanoïde') {
      const want = this.has('couturier') || this.has('secouriste');
      if (R() < (want ? 0.32 : 0.05)) Inv.add(makeConsumable(matId('cloth', t), 1 + (R() < 0.3 ? 1 : 0)));
    } else if (fam === 'bête' && this.has('cuisinier') && R() < 0.35) {
      Inv.add(makeConsumable(matId('meat', t), 1));
    }
  },

  // ---------------------------------------------------------------------------
  // Objets de métier (clic droit ou barre d'action). Retourne vrai si l'objet est géré ici.
  useItem(it, idx) {
    const P = G.player;
    const def = CONSUMABLES[it.cid];
    if (!def) return false;
    const T = it.type;
    if (T !== 'elixir' && T !== 'dish' && T !== 'bandage' && T !== 'bottle') return false;
    if (def.req > P.level) { G.ui?.error(`Niveau ${def.req} requis.`); return true; }
    if (T === 'elixir') {
      removeBuff(P, 'elixir');
      addBuff(P, 'elixir', P, { dur: def.dur * (1 + this.mod('elixirDur')), stats: { [def.stat]: def.amount } });
      pillar(P.pos.x, P.pos.y, P.pos.z, def.tint || '#3a8a7a', 16, 1.5);
      G.audio?.play('potion');
      G.ui?.notify(`${def.name} : +${def.amount} pendant ${Math.round((def.dur * (1 + this.mod('elixirDur'))) / 60)} min.`);
    } else if (T === 'dish') {
      if (P.inCombat()) { G.ui?.error('Impossible en combat.'); return true; }
      const k = 1 + this.mod('foodPct');
      const stats = {};
      for (const s in def.stats) stats[s] = Math.round(def.stats[s] * k);
      removeBuff(P, 'wellfed');
      addBuff(P, 'wellfed', P, { dur: def.dur * (1 + this.mod('foodDur')), stats });
      addBuff(P, 'food', P, { dur: 8, value: (P.stats.maxHp * 0.3) / 8 });
      P.model.sitting = true; P.sitUntil = G.time + 8;
      G.audio?.play('eat');
      G.ui?.notify(`Bien nourri : ${Object.entries(stats).map(([s, v]) => `+${v} ${s === 'sta' ? 'endurance' : s === 'str' ? 'force' : s === 'agi' ? 'agilité' : s === 'int' ? 'intelligence' : 'sagesse'}`).join(', ')}.`);
    } else if (T === 'bandage') {
      if (hasBuff(P, 'bandaged')) { G.ui?.error('Vous avez été bandé récemment.'); return true; }
      if (P.hp >= P.stats.maxHp) { G.ui?.error('Vous êtes en pleine santé.'); return true; }
      const k = 1 + this.mod('bandagePct');
      addBuff(P, 'bandage', P, { dur: 8, value: (P.stats.maxHp * def.heal * k) / 8 });
      addBuff(P, 'bandaged', P, { dur: 45 });
      G.audio?.play('heal');
    } else if (T === 'bottle') {
      const L = P.level;
      const gold = Math.round((5 + R() * 20) * (1 + L / 5));
      P.data.gold += gold;
      G.ui?.goldMsg?.(gold);
      if (R() < 0.25) Runes.add(Runes.rollType(), Runes.rollLevel(L), 1, { found: true });
      if (R() < 0.08) Inv.add(makeConsumable(matId('gem', tierForLevel(L)), 1));
      G.ui?.notify('Vous ouvrez la bouteille à la mer…');
    }
    P.consume(idx);
    G.ui?.refresh?.();
    return true;
  },

  // ---------------------------------------------------------------------------
  // Mini-carte : nœuds des métiers de récolte appris
  drawMinimap(c, toX, toY, W) {
    const mine = this.has('mineur'), herb = this.has('herboriste');
    if (!mine && !herb) return;
    for (const n of this.nodes) {
      if (G.time < n.until) continue;
      if ((n.kind === 'ore' && !mine) || (n.kind === 'herb' && !herb)) continue;
      const x = toX(n.x), y = toY(n.z);
      if (x < 0 || y < 0 || x > W || y > W) continue;
      c.save();
      c.translate(x, y);
      if (n.kind === 'ore') { c.rotate(Math.PI / 4); c.fillStyle = matColor('ore', n.tier); c.strokeStyle = '#000'; c.lineWidth = 2; c.fillRect(-5, -5, 10, 10); c.strokeRect(-5, -5, 10, 10); }
      else { c.beginPath(); c.arc(0, 0, 5.5, 0, Math.PI * 2); c.fillStyle = '#6ad04a'; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 2; c.stroke(); c.beginPath(); c.arc(0, 0, 2.2, 0, Math.PI * 2); c.fillStyle = matColor('herb', n.tier); c.fill(); }
      c.restore();
    }
  },
  // étiquette flottante au-dessus des nœuds proches (métier appris)
  labelsNear() {
    const P = G.player;
    const out = [];
    for (const n of this.nodes) {
      if (!n.grp) continue;
      const d = Math.hypot(n.x - P.pos.x, n.z - P.pos.z);
      if (d > 22) continue;
      const prof = this.nodeProf(n);
      const sk = this.skill(prof), req = TIER_REQ[n.tier - 1];
      const col = !this.has(prof) ? '#9a9aa0' : { red: '#ff5a4a', orange: '#ff9a3a', yellow: '#ffd24a', green: '#5fd35a', grey: '#9a9aa0' }[diffColor(sk, req)];
      out.push({ n, d, col, text: this.nodeName(n), sub: this.has(prof) ? (d < 5 ? 'F : récolter' : '') : `${PROFS[prof].name} ${req}` });
    }
    return out;
  },
};
