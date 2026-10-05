// Runes : pierres gravées serties dans l'équipement (armes comprises).
// - Emplacements selon la rareté : commun 0, peu commun 0 ou 1, rare 1, épique 2, légendaire 3, mythique 4 ou 5.
// - Fusion : 3 runes identiques (même type, même niveau) donnent 1 rune du niveau suivant, sans limite de niveau.
// - Chaque niveau donne 40 % de plus que le précédent : valeur = base × 1,4^(niveau − 1).
//   Une rune de Force niveau 1 donne +1 Force ; niveau 2 : +1,4 ; niveau 3 : +1,96 ; niveau 10 : +20,7…
// La « Vitalité » demandée s'appelle Endurance dans Orvalis (c'est la statistique qui donne les points de vie).

export const RUNE_GROWTH = 1.4;

// base : valeur d'une rune de niveau 1 ; pct : valeur exprimée en %
export const RUNE_TYPES = {
  str: { id: 'str', name: 'Force', short: 'For', base: 1, color: '#e0703a', sym: 0, desc: 'Force : puissance des guerriers, templiers et de leurs coups.' },
  agi: { id: 'agi', name: 'Agilité', short: 'Agi', base: 1, color: '#6fd35a', sym: 1, desc: 'Agilité : puissance des chasseurs et assassins, critique et esquive.' },
  int: { id: 'int', name: 'Intelligence', short: 'Int', base: 1, color: '#8f7bff', sym: 2, desc: 'Intelligence : puissance des sorts et mana.' },
  wis: { id: 'wis', name: 'Sagesse', short: 'Sag', base: 1, color: '#3fbfd0', sym: 3, desc: 'Sagesse : soins, mana et régénération.' },
  sta: { id: 'sta', name: 'Endurance', short: 'End', base: 1, color: '#e04848', sym: 4, desc: 'Endurance (vitalité) : points de vie et un peu d\'armure.' },
  crit: { id: 'crit', name: 'Critique', short: 'Cri', base: 0.1, pct: true, color: '#ffd24a', sym: 5, desc: 'Critique : chances de coup critique (en %).' },
  leech: { id: 'leech', name: 'Vol de vie', short: 'VdV', base: 0.1, pct: true, color: '#c0305a', sym: 6, desc: 'Vol de vie : une part des dégâts infligés vous soigne (en %).' },
  fortune: { id: 'fortune', name: 'Fortune', short: 'For.', base: 1, pct: true, color: '#e8c050', sym: 7, desc: "Fortune : plus d'or, de meilleurs objets et davantage de runes sur les monstres (en %)." },
};
export const RUNE_LIST = Object.keys(RUNE_TYPES);

// valeur d'une rune (sans arrondi)
export function runeValue(type, lvl) {
  const T = RUNE_TYPES[type];
  if (!T) return 0;
  return T.base * Math.pow(RUNE_GROWTH, Math.max(0, (lvl || 1) - 1));
}

// affichage compact d'une valeur (1,4 ; 20,7 ; 1 234 ; 3,3 M…)
export function fmtRuneNum(v) {
  if (!isFinite(v)) return '∞';
  const a = Math.abs(v);
  const fr = (x, d) => x.toFixed(d).replace(/\.?0+$/, '').replace('.', ',');
  if (a >= 1e12) return fr(v / 1e12, 2) + ' T';
  if (a >= 1e9) return fr(v / 1e9, 2) + ' G';
  if (a >= 1e6) return fr(v / 1e6, 2) + ' M';
  if (a >= 1e4) return Math.round(v).toLocaleString('fr-FR').replace(/ | /g, ' ');
  if (a >= 100) return String(Math.round(v));
  if (a >= 10) return fr(v, 1);
  return fr(v, 2);
}

export function runeBonusText(type, lvl) {
  const T = RUNE_TYPES[type];
  return `+${fmtRuneNum(runeValue(type, lvl))}${T.pct ? ' %' : ''} ${T.name}`;
}
export function runeName(type, lvl) {
  const T = RUNE_TYPES[type];
  const de = /^[AEIOUÉÈÊ]/i.test(T.name) ? "d'" : 'de ';
  return `Rune ${de}${T.name}${lvl ? ` niv. ${lvl}` : ''}`;
}
export const runeKey = (type, lvl) => `${type}:${lvl}`;
export function parseRuneKey(k) {
  const i = k.indexOf(':');
  return { t: k.slice(0, i), l: +k.slice(i + 1) };
}

// ---------------------------------------------------------------------------
// Emplacements selon la rareté (5 = mythique). rnd : aléatoire 0-1 (déterministe si besoin)
export function socketsFor(rarity, ilvl, rnd) {
  switch (rarity | 0) {
    case 0: return 0;
    case 1: return rnd() < 0.5 ? 1 : 0;
    case 2: return 1;
    case 3: return 2;
    case 4: return 3;
    default: return ilvl >= 32 || rnd() < 0.5 ? 5 : 4;
  }
}

// hachage simple d'une chaîne vers [0, 1) : sert aux objets créés avant les runes
export function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

// statistiques apportées par les runes serties d'un objet
export function runeStats(it) {
  const out = {};
  if (!it || !it.runes) return out;
  for (const r of it.runes) {
    if (!r || !RUNE_TYPES[r.t]) continue;
    out[r.t] = (out[r.t] || 0) + runeValue(r.t, r.l);
  }
  return out;
}
