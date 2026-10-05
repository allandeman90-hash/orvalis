// Talents et spécialisations (logique) : points, règles de l'arbre, effets cumulés, compétences apprises,
// construction automatique pour les bots, textes descriptifs des effets.
import { G } from './state.js';
import { SPECS, CLASS_SPECS, DEFAULT_SPEC, specOf, validSpec } from '../data/specs.js';
import { TREES, NODE_BY, TIER_PTS } from '../data/talents.js';
import { SKILL_BY_ID, classSkills } from '../data/skills.js';
import { BUFFS } from './combat.js';

export { TIER_PTS };
export const talentPoints = (level) => Math.max(0, (level || 1) - 1);

// rang automatique d'une compétence selon le niveau (les rangs ne s'achètent plus : ils viennent avec l'expérience)
export function abilityRank(s, level) {
  if (!s || s.noRank) return 1;
  return Math.max(1, Math.min(s.max || 5, 1 + Math.floor(((level || 1) - (s.lvl || 1)) / 8)));
}

export function nodeName(n) { return n.name || SKILL_BY_ID[n.ability]?.name || n.id; }
export function nodeIcon(n) { return n.icon || SKILL_BY_ID[n.ability]?.icon || ['sword', '#555']; }

// --- règles de l'arbre -------------------------------------------------------
export function spent(alloc) { let n = 0; for (const k in alloc || {}) n += alloc[k] || 0; return n; }
function ptsBelow(tree, alloc, row) { let n = 0; for (const x of tree) if (x.row < row) n += alloc[x.id] || 0; return n; }
function validAlloc(tree, alloc) {
  for (const x of tree) {
    const r = alloc[x.id] || 0;
    if (!r) continue;
    if (r > x.max) return false;
    if (ptsBelow(tree, alloc, x.row) < x.row * TIER_PTS) return false;
    if (x.req && (alloc[x.req] || 0) < NODE_BY[x.spec][x.req].max) return false;
  }
  return true;
}
// raison du refus (texte) ou null
export function whyNot(e, spec, node, alloc) {
  const tree = TREES[spec];
  const r = alloc[node.id] || 0;
  if (r >= node.max) return 'Rang maximum atteint.';
  if (spent(alloc) >= talentPoints(e.level)) return 'Aucun point de talent disponible.';
  const need = node.row * TIER_PTS;
  if (ptsBelow(tree, alloc, node.row) < need) return `Requiert ${need} points dans les paliers précédents.`;
  if (node.req) { const q = NODE_BY[spec][node.req]; if ((alloc[q.id] || 0) < q.max) return `Requiert ${nodeName(q)} (${q.max}/${q.max}).`; }
  return null;
}
export function canRemove(spec, node, alloc) {
  if (!(alloc[node.id] > 0)) return false;
  const a = { ...alloc, [node.id]: alloc[node.id] - 1 };
  return validAlloc(TREES[spec], a);
}

// --- effets cumulés (passif de spécialisation + talents) --------------------
export function computeTal(e) {
  const sp = specOf(e);
  const tal = { spec: sp?.id || null, mods: {}, sk: {}, byName: {}, abilities: [] };
  const add = (fx, k) => {
    for (const key in fx) {
      if (key === 'sk') {
        for (const id in fx.sk) { const o = (tal.sk[id] ||= {}); for (const m in fx.sk[id]) o[m] = (o[m] || 0) + fx.sk[id][m] * k; }
      } else tal.mods[key] = (tal.mods[key] || 0) + fx[key] * k;
    }
  };
  if (sp?.passive) add(sp.passive, 1);
  const al = e.talents || {};
  for (const n of TREES[sp?.id] || []) {
    const r = al[n.id] || 0;
    if (!r) continue;
    if (n.ability) tal.abilities.push(n.ability);
    if (n.fx) add(n.fx, r);
  }
  // recherche par nom (les dégâts et soins portent le nom de la compétence ou de l'effet périodique)
  for (const id in tal.sk) {
    const s = SKILL_BY_ID[id], o = tal.sk[id];
    if (!s || !(o.dmg || o.crit)) continue;
    const v = { dmg: o.dmg || 0, crit: o.crit || 0 };
    tal.byName[s.name] = v;
    for (const b of s.buffs || []) if (BUFFS[b]) tal.byName[BUFFS[b].name] = v;
  }
  e.tal = tal;
  return tal;
}

// --- compétences connues -----------------------------------------------------
export function basicSkill(e) {
  const sp = specOf(e);
  return (sp?.basic && SKILL_BY_ID[sp.basic]) || classSkills(e.cls).find((s) => s.basic);
}
export function learnSkills(e, { mount = false } = {}) {
  const L = e.level || 1;
  const sk = {};
  for (const s of classSkills(e.cls)) if (s.lvl <= L) sk[s.id] = abilityRank(s, L);
  const sp = specOf(e);
  for (const id of sp?.core || []) { const s = SKILL_BY_ID[id]; if (s && s.lvl <= L) sk[id] = abilityRank(s, L); }
  for (const id of e.tal?.abilities || []) { const s = SKILL_BY_ID[id]; if (s) sk[id] = abilityRank(s, L); }
  sk.x_rappel = 1;
  if (mount) sk.x_monture = 1;
  e.skills = sk;
  return sk;
}
// techniques propres à une spécialisation (accordées + apprises dans l'arbre)
export function specAbilityIds(specId) {
  const sp = SPECS[specId];
  const out = [...(sp?.core || [])];
  for (const n of TREES[specId] || []) if (n.ability) out.push(n.ability);
  return out;
}

// --- construction automatique (bots, compagnons IA, personnages de test) -------
export function autoBuild(specId, points) {
  const tree = TREES[specId] || [];
  const al = {};
  let left = points, total = 0;
  const give = (n) => { if (left <= 0 || (al[n.id] || 0) >= n.max) return false; if (n.req && (al[n.req] || 0) < NODE_BY[specId][n.req].max) return false; if (ptsBelow(tree, al, n.row) < n.row * TIER_PTS) return false; al[n.id] = (al[n.id] || 0) + 1; left--; total++; return true; };
  for (let row = 0; row <= 6; row++) {
    const nodes = tree.filter((n) => n.row === row).sort((a, b) => (b.ability ? 1 : 0) - (a.ability ? 1 : 0));
    const need = (row + 1) * TIER_PTS;
    // d'abord les techniques, puis de quoi débloquer le palier suivant
    for (const n of nodes) if (n.ability) give(n);
    let guard = 0;
    while (total < need && left > 0 && guard++ < 40) { let any = false; for (const n of nodes) if (total < need && give(n)) any = true; if (!any) break; }
  }
  // reste : on complète en remontant
  let guard = 0;
  while (left > 0 && guard++ < 60) { let any = false; for (const n of tree) if (give(n)) any = true; if (!any) break; }
  return al;
}

// spécialisation aléatoire mais stable pour un bot
export function botSpec(cls, seed) {
  const list = CLASS_SPECS[cls] || [DEFAULT_SPEC[cls]];
  return list[Math.abs(seed | 0) % list.length];
}
export { validSpec };

// --- textes ------------------------------------------------------------------
const num = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ',');
const FX = {
  dmg: [100, 'de dégâts infligés'], heal: [100, 'de soins prodigués'], hp: [100, 'de points de vie maximum'], mp: [100, 'de mana maximum'],
  armor: [100, "d'armure"], crit: [1, 'de chances de coup critique'], critDmg: [100, 'de dégâts des coups critiques'], haste: [100, 'de hâte'],
  dodge: [1, "de chances d'esquive"], block: [1, 'de chances de blocage (avec un bouclier)'], speed: [100, 'de vitesse de déplacement'],
  leech: [100, 'des dégâts infligés rendus en vie'], regen: [100, 'de vos points de vie régénérés chaque seconde'], mana: [100, 'de régénération de mana'],
  taken: [100, 'de dégâts subis'], threat: [100, 'de menace générée'], execute: [100, 'de dégâts contre les cibles sous 35 % de vie'],
  dot: [100, 'de dégâts périodiques'], hot: [100, 'de soins périodiques'], absorb: [100, "de puissance des boucliers d'absorption"],
  pet: [100, 'de dégâts et de vie pour vos familiers et serviteurs'], lowhp: [100, 'de dégâts subis sous 35 % de vie'], cast: [100, "de temps d'incantation"],
};
export function fxLines(fx, k = 1) {
  const out = [];
  if (!fx) return out;
  for (const key in fx) {
    if (key === 'sk') {
      for (const id in fx.sk) {
        const s = SKILL_BY_ID[id], o = fx.sk[id], parts = [];
        if (o.dmg) parts.push(`${o.dmg > 0 ? '+' : '−'}${num(Math.abs(o.dmg * k) * 100)} % d'efficacité`);
        if (o.crit) parts.push(`+${num(o.crit * k)} % de critique`);
        if (o.cd) parts.push(`recharge ${o.cd < 0 ? '−' : '+'}${num(Math.abs(o.cd * k))} s`);
        if (o.cost) parts.push(`coût ${o.cost < 0 ? '−' : '+'}${num(Math.abs(o.cost * k) * 100)} %`);
        if (o.cast) parts.push(`incantation ${o.cast < 0 ? '−' : '+'}${num(Math.abs(o.cast * k) * 100)} %`);
        out.push(`${s?.name || id} : ${parts.join(', ')}`);
      }
      continue;
    }
    const d = FX[key];
    if (!d) continue;
    const v = fx[key] * k * d[0];
    out.push(`${v < 0 ? '−' : '+'}${num(Math.abs(v), key === 'regen' ? 2 : 1)} % ${d[1]}`);
  }
  return out;
}
export function passiveText(spec) { return fxLines(SPECS[spec]?.passive).join(' · '); }

// --- données du joueur ---------------------------------------------------------
export const BAR_SLOTS = 40; // 4 barres de 10 emplacements
export function ensureTalentData(d) {
  d.spec = validSpec(d.cls, d.spec);
  d.talents ||= {};
  for (const id of CLASS_SPECS[d.cls] || []) d.talents[id] ||= {};
  d.specBars ||= {};
  if (!Array.isArray(d.bar)) d.bar = [];
  while (d.bar.length < BAR_SLOTS) d.bar.push(null);
  if (d.bar.length > BAR_SLOTS) d.bar.length = BAR_SLOTS;
  // anciennes sauvegardes : les rangs s'obtiennent désormais avec le niveau, les points deviennent des points de talent
  delete d.points;
  return d;
}

// Un personnage (joueur ou bot) : applique spécialisation + talents, recalcule compétences et statistiques
export function refreshTalents(e, opts = {}) {
  computeTal(e);
  learnSkills(e, { mount: opts.mount ?? !!e.hasMount });
  e.statsDirty = true;
  if (e.model) e.recalc?.();
  G.world?.emit?.('talents', e);
}
