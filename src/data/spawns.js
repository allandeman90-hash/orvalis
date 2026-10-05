// Points d'apparition des monstres, générés de façon déterministe (identiques chez tous les joueurs).
import { WORLD_SCALE, WORLD_HALF, ZONES, HUBS, LANDMARK_BY_ID, HUB_BY_ID, FACTIONS } from './zones.js';
import { MOB_BY_ID } from './mobs.js';
import { zoneAt, getHeight, getSlope, roadDist } from '../world/terrain.js';
import { mulberry32 } from '../core/rng.js';
import { STORY_CAMPS } from './lore.js';
import { clamp, lerp } from '../core/util.js';

// Faune par région : [mob, poids, bornes de niveau optionnelles]
const WILD = {
  val: [['lievre_cornu', 1.2], ['loup_pres', 2], ['sanglier_roux', 1.6], ['grignoteur', 1.4], ['gelee_verte', 1]],
  terres: [['lezard_sables', 1.2], ['hyene', 2], ['scorpion_ocre', 1.6], ['vautour', 1.3], ['gelee_braise', 1]],
  bois: [['araignee', 2], ['ours', 1.5], ['sylvain', 1.2]],
  canyon: [['chauve_souris', 1.6], ['salamandre', 1.6], ['golem_scories', 1.2], ['kobold', 0.8]],
  marais: [['crocodile', 1.8], ['sangsue', 1.6], ['feu_follet', 1.4], ['crapoussin', 0.8]],
  coeur: [['squelette', 2], ['squelette_archer', 1.4], ['spectre', 1.5], ['gargouille', 1.3]],
  pics: [['loup_neiges', 2], ['yeti', 1.4], ['elementaire_givre', 1.4]],
  desolation: [['diablotin', 1.5], ['chien_lave', 1.6], ['golem_obsidienne', 1.2], ['drakonide', 1.2]],
  cime: [['harpie', 1.6], ['elementaire_foudre', 1.5], ['gardien_runique', 1.2]],
};
const COUNT = { val: 26, terres: 26, bois: 24, canyon: 24, marais: 24, coeur: 22, pics: 21, desolation: 21, cime: 18 };

// Camps et lieux gardés : [lieu, [[mob, nombre], ...], options]
const CAMPS = [
  ['moulin', [['brigand', 5], ['brigand_arbaletrier', 3]], { r: 16 }],
  ['pierres_levees', [['loup_pres', 4], ['croc_balafre', 1]], { r: 12, lvl: 3 }],
  ['camp_pillards', [['pillard', 5], ['pillard_lanceur', 3]], { r: 16 }],
  ['oasis', [['hyene', 4], ['machoire_fer', 1]], { r: 14, lvl: 3 }],
  ['camp_gobelin', [['gobelin', 6], ['gobelin_mystique', 3], ['grincedent', 1]], { r: 18 }],
  ['nid_tisseuse', [['araignee', 6], ['tisseuse', 1]], { r: 18, lvl: 10 }],
  ['terrier_kobold', [['kobold', 6], ['kobold_dynamiteur', 3], ['grand_meche', 1]], { r: 16 }],
  ['mine', [['golem_scories', 3], ['kobold_dynamiteur', 2], ['coeur_magma', 1]], { r: 14, lvl: 11, bossAt: [0, -2] }],
  ['village_crapoussin', [['crapoussin', 7], ['crapoussin_sorcier', 4]], { r: 20 }],
  ['bourbier', [['sangsue', 3], ['mere_vase', 1]], { r: 16 }],
  ['crypte', [['squelette', 5], ['squelette_archer', 3], ['chevalier_maudit', 1], ['ossevaine', 1]], { r: 18, bossAt: [0, 8] }],
  ['antre_trolls', [['troll_glaces', 6], ['jarl', 1]], { r: 18 }],
  ['caldeira', [['drakonide', 4], ['chien_lave', 2], ['vyrmathra', 1]], { r: 18 }],
];
// Élites isolés
const LONERS = [
  { mob: 'sorciere', x: 70, z: 440 },
  { mob: 'titan', x: -60, z: -300 },
  { mob: 'titan', x: 70, z: -330 },
];

function farFromHubs(x, z, extra = 16) {
  for (const h of HUBS) if (Math.hypot(x - h.x, z - h.z) < h.r + extra) return false;
  return true;
}

export function buildSpawns() {
  const rnd = mulberry32(90210);
  const out = [];
  let gid = 0;
  const add = (mob, x, z, level, o = {}) => {
    const d = MOB_BY_ID[mob];
    out.push({
      id: out.length, mob, x, z, level, elite: !!d.elite, boss: !!d.boss, named: !!d.named,
      respawn: d.boss ? 480 : d.elite ? 240 : 45 + rnd() * 30, wander: o.wander ?? (d.boss || d.elite ? 3 : 8), group: o.group ?? null,
      zone: zoneAt(x, z).id,
    });
  };
  const lvlFor = (mob, t) => {
    const d = MOB_BY_ID[mob];
    return Math.round(lerp(d.lvl[0], d.lvl[1], clamp(t, 0, 1)));
  };

  // camps
  for (const [lmId, list, o] of [...CAMPS, ...STORY_CAMPS]) {
    const lm = LANDMARK_BY_ID[lmId];
    const g = 'camp' + gid++;
    let k = 0;
    const total = list.reduce((s, [, n]) => s + n, 0);
    for (const [mob, n] of list) {
      const d = MOB_BY_ID[mob];
      for (let i = 0; i < n; i++) {
        let x, z;
        if (d.boss || (d.named && !d.boss)) {
          const b = d.boss && o.bossAt ? o.bossAt : [0, 0];
          x = lm.x + b[0] + (d.boss ? 0 : 4); z = lm.z + b[1] + (d.boss ? 0 : -4);
        } else {
          const a = (k / total) * Math.PI * 2 + rnd() * 0.5, r = (o.r || 14) * (0.35 + rnd() * 0.65);
          x = lm.x + Math.cos(a) * r; z = lm.z + Math.sin(a) * r;
        }
        const lvl = o.lvl && !d.named ? clamp(o.lvl + Math.floor(rnd() * 2), d.lvl[0], Math.max(d.lvl[1], o.lvl + 1)) : lvlFor(mob, rnd());
        add(mob, x, z, lvl, { group: g, wander: d.boss ? 2 : 4 });
        k++;
      }
    }
  }
  for (const L of LONERS) add(L.mob, L.x * WORLD_SCALE, L.z * WORLD_SCALE, MOB_BY_ID[L.mob].lvl[1], { wander: 5 });

  // faune sauvage : groupes répartis dans chaque région
  for (const zone of ZONES) {
    const tbl = WILD[zone.id];
    const cx0 = (zone.col === 0 ? -470 : zone.col === 1 ? -150 : 190) * WORLD_SCALE;
    const cz0 = (zone.row === 0 ? -470 : zone.row === 1 ? -150 : 190) * WORLD_SCALE;
    const size = (zone.col === 1 ? 300 : 280) * WORLD_SCALE;
    const pts = [];
    let tries = 0;
    // pour les régions de départ : niveau selon la distance à la capitale
    const cap = zone.owner >= 0 && zone.lvl[0] === 1 ? HUB_BY_ID[FACTIONS[zone.owner].capital] : null;
    while (pts.length < COUNT[zone.id] * 10 && tries < 40000) {
      tries++;
      const x = cx0 + rnd() * size, z = cz0 + rnd() * size;
      if (zoneAt(x, z) !== zone) continue;
      if (Math.abs(x) > WORLD_HALF - 100 || Math.abs(z) > WORLD_HALF - 100) continue;
      const h = getHeight(x, z);
      if (h < (zone.biome === 'swamp' ? -1.0 : 0.4) || getSlope(x, z) > 0.6) continue;
      if (!farFromHubs(x, z, 22)) continue;
      if (roadDist(x, z) < 7) continue;
      let ok = true;
      for (const p of pts) if (Math.hypot(p.x - x, p.z - z) < 30) { ok = false; break; }
      for (const s of out) if (Math.hypot(s.x - x, s.z - z) < 24) { ok = false; break; }
      if (!ok) continue;
      pts.push({ x, z });
    }
    for (const p of pts) {
      // choix du type (pondéré), avec niveau croissant avec l'éloignement
      let t;
      if (cap) t = clamp((Math.hypot(p.x - cap.x, p.z - cap.z) - 60) / (260 * WORLD_SCALE), 0, 1);
      else t = rnd();
      let pool = tbl;
      if (cap) pool = tbl.filter(([m]) => { const d = MOB_BY_ID[m]; const lv = 1 + t * 5; return lv >= d.lvl[0] - 1.2 && lv <= d.lvl[1] + 1.2; });
      if (!pool.length) pool = tbl;
      let tot = 0; for (const [, w] of pool) tot += w;
      let r = rnd() * tot, mob = pool[0][0];
      for (const [m, w] of pool) { r -= w; if (r <= 0) { mob = m; break; } }
      const d = MOB_BY_ID[mob];
      const n = d.aggro === 0 ? 2 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 2.6);
      const g = 'wild' + gid++;
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, rr = 2 + rnd() * 6;
        const x = p.x + Math.cos(a) * rr, z = p.z + Math.sin(a) * rr;
        const lvl = cap ? clamp(Math.round(lerp(d.lvl[0], d.lvl[1], t) + (rnd() - 0.5)), d.lvl[0], d.lvl[1]) : lvlFor(mob, rnd());
        add(mob, x, z, lvl, { group: g });
      }
    }
  }
  return out;
}
