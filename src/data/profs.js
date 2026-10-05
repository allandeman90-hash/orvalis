// Métiers d'Orvalis : 12 métiers, dont 2 primaires et 2 secondaires au choix.
// Chaque métier a un atout et un défaut (bonus et malus permanents), une compétence de 1 à 150,
// et 5 paliers de matériaux (un par étape du voyage : régions de départ, 2e région, marais, Cœur, hautes terres).
import { CONSUMABLES } from './items.js';

export const PROF_MAX = 150;
export const TIER_REQ = [1, 30, 60, 90, 120]; // compétence requise par palier
export const TIER_NAMES = ['Apprenti', 'Compagnon', 'Artisan', 'Expert', 'Maître'];
export const MAX_PRIMARY = 2;
export const MAX_SECONDARY = 2;

// palier des ressources selon la région
export const ZONE_TIER = { val: 1, terres: 1, bois: 2, canyon: 2, marais: 3, coeur: 4, pics: 5, desolation: 5, cime: 5 };
// palier d'une créature selon son niveau (dépeçage, viande, étoffe)
export const tierForLevel = (L) => (L <= 6 ? 1 : L <= 12 ? 2 : L <= 18 ? 3 : L <= 24 ? 4 : 5);

// mods : effets permanents (atout + défaut). Clés reconnues par le jeu :
// armorPct hpPct mpPct dmgPct dmgPhysPct dmgSpellPct critAdd dodgeAdd speedPct hastePct regenPct regenOutPct
// healRecvPct beastDmgPct beastAggroPct vendorPricePct potionPct elixirDur foodPct foodDur bandagePct runeKeep runeFind gemChance
export const PROFS = {
  mineur: {
    id: 'mineur', name: 'Mineur', kind: 'primary', type: 'gather', glyph: 'p_mine', color: '#8a6a4a',
    desc: 'Extrait le minerai des filons (touche F à côté d\'un filon). Fournit forgerons et joailliers.',
    atout: { name: 'Poigne de roc', text: "+5 % d'armure ; 12 % de chances de trouver une gemme brute dans un filon." },
    defaut: { name: 'Sacoche de pierres', text: '−4 % de vitesse de déplacement.' },
    mods: { armorPct: 0.05, gemChance: 0.12, speedPct: -0.04 },
  },
  herboriste: {
    id: 'herboriste', name: 'Herboriste', kind: 'primary', type: 'gather', glyph: 'p_herb', color: '#4a8a3a',
    desc: 'Cueille les plantes (touche F à côté d\'une plante). Fournit alchimistes, runistes et cuisiniers.',
    atout: { name: 'Sève vivifiante', text: '+25 % de régénération de vie ; +4 % de soins reçus.' },
    defaut: { name: 'Mains vertes', text: '−3 % de dégâts physiques.' },
    mods: { regenPct: 0.25, healRecvPct: 0.04, dmgPhysPct: -0.03 },
  },
  depeceur: {
    id: 'depeceur', name: 'Dépeceur', kind: 'primary', type: 'gather', glyph: 'p_skin', color: '#8a4a3a',
    desc: 'Récupère le cuir des bêtes vaincues (touche F à côté du corps). Fournit les maroquiniers.',
    atout: { name: 'Instinct du traqueur', text: '+8 % de dégâts contre les bêtes.' },
    defaut: { name: 'Odeur du sang', text: 'Les bêtes vous repèrent de 25 % plus loin.' },
    mods: { beastDmgPct: 0.08, beastAggroPct: 0.25 },
  },
  forgeron: {
    id: 'forgeron', name: 'Forgeron', kind: 'primary', type: 'craft', glyph: 'p_forge', color: '#6a6a78',
    desc: "Forge les armes de toutes les classes, les armures de plaques et les boucliers, avec du minerai.",
    atout: { name: 'Bras de forge', text: '+5 % de dégâts physiques ; +3 % d\'armure.' },
    defaut: { name: 'Allergie aux arcanes', text: '−5 % de dégâts des sorts (feu, givre, ombre, nature…).' },
    mods: { dmgPhysPct: 0.05, armorPct: 0.03, dmgSpellPct: -0.05 },
  },
  maroquinier: {
    id: 'maroquinier', name: 'Maroquinier', kind: 'primary', type: 'craft', glyph: 'p_leather', color: '#8a6440',
    desc: 'Coud les armures de cuir (chasseurs, assassins, druides) et de mailles (chamans) à partir de cuir.',
    atout: { name: 'Cuir souple', text: "+3 points d'esquive." },
    defaut: { name: 'Protection légère', text: "−4 % d'armure." },
    mods: { dodgeAdd: 3, armorPct: -0.04 },
  },
  couturier: {
    id: 'couturier', name: 'Couturier', kind: 'primary', type: 'craft', glyph: 'p_tailor', color: '#5a6a9a',
    desc: "Taille les robes et armures de tissu (mages, nécromanciens) et les sacoches, à partir d'étoffes.",
    atout: { name: "Fil d'argent", text: '+8 % de mana maximum.' },
    defaut: { name: 'Doigts piqués', text: '−3 % de points de vie maximum.' },
    mods: { mpPct: 0.08, hpPct: -0.03 },
  },
  alchimiste: {
    id: 'alchimiste', name: 'Alchimiste', kind: 'primary', type: 'craft', glyph: 'p_alch', color: '#3a8a7a',
    desc: 'Distille potions de soin et de mana, et élixirs de caractéristiques, à partir de plantes.',
    atout: { name: 'Métabolisme alchimique', text: 'Potions 30 % plus efficaces ; élixirs deux fois plus longs.' },
    defaut: { name: 'Vapeurs toxiques', text: '−5 % de soins reçus (hors potions).' },
    mods: { potionPct: 0.3, elixirDur: 1, healRecvPct: -0.05 },
  },
  joaillier: {
    id: 'joaillier', name: 'Joaillier', kind: 'primary', type: 'craft', glyph: 'p_jewel', color: '#b86bff',
    desc: 'Sertit anneaux et amulettes (toutes classes) avec du minerai et des gemmes.',
    atout: { name: 'Œil du lapidaire', text: '+3 % de chances de coup critique.' },
    defaut: { name: 'Goût du luxe', text: 'Les marchands vous vendent tout 15 % plus cher.' },
    mods: { critAdd: 3, vendorPricePct: 0.15 },
  },
  runiste: {
    id: 'runiste', name: 'Runiste', kind: 'primary', type: 'craft', glyph: 'p_rune', color: '#5a3a8a',
    desc: 'Grave des runes à partir d\'éclats runiques et transmute les runes indésirables en runes utiles.',
    atout: { name: 'Main sûre', text: '20 % de chances de conserver une rune à chaque fusion ; +25 % de runes trouvées.' },
    defaut: { name: 'Esprit ailleurs', text: '−4 % de hâte.' },
    mods: { runeKeep: 0.2, runeFind: 0.25, hastePct: -0.04 },
  },
  pecheur: {
    id: 'pecheur', name: 'Pêcheur', kind: 'secondary', type: 'gather', glyph: 'p_fish', color: '#3a6a9a',
    desc: "Pêche dans les lacs, la mer, les tourbières… et même la lave (touche F face à l'eau). Fournit les cuisiniers.",
    atout: { name: 'Patience', text: '+50 % de régénération de vie et de mana hors combat.' },
    defaut: { name: 'Mains mouillées', text: '−2 % de chances de coup critique.' },
    mods: { regenOutPct: 0.5, critAdd: -2 },
  },
  cuisinier: {
    id: 'cuisinier', name: 'Cuisinier', kind: 'secondary', type: 'craft', glyph: 'p_cook', color: '#b0703a',
    desc: 'Prépare des plats qui donnent des bonus de caractéristiques pendant 30 minutes (viande et poissons).',
    atout: { name: 'Bon vivant', text: '+3 % de points de vie ; vos plats sont 25 % plus efficaces et durent 50 % plus longtemps.' },
    defaut: { name: 'Gourmandise', text: '−3 % de vitesse de déplacement.' },
    mods: { hpPct: 0.03, foodPct: 0.25, foodDur: 0.5, speedPct: -0.03 },
  },
  secouriste: {
    id: 'secouriste', name: 'Secouriste', kind: 'secondary', type: 'craft', glyph: 'p_aid', color: '#c83a3a',
    desc: "Confectionne des bandages avec des étoffes : des soins utilisables en plein combat.",
    atout: { name: 'Mains expertes', text: 'Bandages 50 % plus efficaces ; +5 % de soins reçus.' },
    defaut: { name: 'Prudence', text: '−3 % de dégâts infligés.' },
    mods: { bandagePct: 0.5, healRecvPct: 0.05, dmgPct: -0.03 },
  },
};
export const PROF_LIST = Object.keys(PROFS);

// ---------------------------------------------------------------------------
// Matériaux (ajoutés aux consommables du jeu)
const T5 = [1, 2, 3, 4, 5];
const MATS = {
  ore: { names: ['Minerai de cuivre', 'Minerai de fer', "Minerai d'argent-lune", "Minerai d'orichalque", "Minerai d'astralite"], icon: 'i_ore', colors: ['#c87a4a', '#9aa2ae', '#bfd8f0', '#e0b040', '#9fe8ff'], desc: 'Minerai brut. Forgerons et joailliers en ont besoin.' },
  gem: { names: ['Quartz fumé', 'Grenat', 'Saphir', 'Rubis de braise', 'Astrolithe'], icon: 'i_gemstone', colors: ['#b0a8a0', '#c83a4a', '#3a6ae0', '#ff5a3a', '#b8f0ff'], desc: 'Gemme brute, trouvée par les mineurs. Joailliers et runistes s\'en servent.' },
  herb: { names: ['Feuille-soleil', 'Murmurelle', 'Vasefleur', 'Chardon-spectre', 'Givre-épine'], icon: 'i_herb', colors: ['#e0c040', '#7ad06a', '#9a6ac8', '#a8b8c8', '#8fd8ff'], desc: 'Plante cueillie par les herboristes. Base des potions, élixirs et plats.' },
  leather: { names: ['Cuir léger', 'Cuir moyen', 'Cuir épais', 'Cuir robuste', 'Cuir de drake'], icon: 'i_leather', colors: ['#b08a5a', '#8a6440', '#6a4a30', '#5a3a2a', '#8a3a2a'], desc: 'Cuir récupéré par les dépeceurs. Les maroquiniers le travaillent.' },
  cloth: { names: ['Étoffe de lin', 'Étoffe de laine', 'Étoffe de soie', 'Tisse-mage', 'Tisse-lune'], icon: 'i_cloth', colors: ['#d8ccb0', '#a89878', '#e8d8f0', '#8a6ac8', '#c8e0ff'], desc: 'Étoffe trouvée sur les humanoïdes. Couturiers et secouristes l\'utilisent.' },
  fish: { names: ['Perche dorée', 'Truite murmurante', 'Anguille des vases', 'Carpe des glaces', 'Poisson-braise'], icon: 'i_fish', colors: ['#e0b040', '#7ab0d0', '#6a7a4a', '#bfe8ff', '#ff7a3a'], desc: 'Poisson frais. Les cuisiniers en font des plats nourrissants.' },
  meat: { names: ['Viande tendre', 'Venaison', 'Viande épaisse', 'Viande de bête géante', 'Viande de drake'], icon: 'i_meat', colors: ['#d87a7a', '#b85a5a', '#a04a4a', '#8a3a3a', '#c85a2a'], desc: 'Viande de bête, récupérée par les cuisiniers.' },
};
export const MAT_KINDS = Object.keys(MATS);
export const matId = (kind, t) => `${kind}${t}`;
export const matColor = (kind, t) => MATS[kind].colors[t - 1];
for (const kind of MAT_KINDS) {
  const M = MATS[kind];
  for (const t of T5) {
    CONSUMABLES[matId(kind, t)] = { name: M.names[t - 1], icon: M.icon, type: 'mat', stack: 99, req: 1, value: Math.round(2 + t * t * 2.5 + (kind === 'gem' ? t * 6 : 0)), desc: `${M.desc} Palier ${t} (${TIER_NAMES[t - 1].toLowerCase()}).`, tint: M.colors[t - 1], mat: kind, tier: t };
  }
}

// ---------------------------------------------------------------------------
// Produits : élixirs, plats, bandages
const ADJ = ['mineur', '', 'supérieur', 'majeur', 'suprême'];
const ELIX = { str: 'force', agi: 'agilité', int: 'intelligence', wis: 'sagesse', sta: 'endurance' };
export const ELIXIR_VAL = [6, 12, 20, 30, 42];
for (const t of T5) {
  for (const k in ELIX) {
    const name = `Élixir de ${ELIX[k]}${ADJ[t - 1] ? ' ' + ADJ[t - 1] : ''}`;
    CONSUMABLES[`elix_${k}${t}`] = { name, icon: 'i_elixir', type: 'elixir', stack: 20, req: [1, 8, 15, 21, 26][t - 1], value: 6 + t * 8, stat: k, amount: ELIXIR_VAL[t - 1], dur: 1800,
      desc: `+${ELIXIR_VAL[t - 1]} ${ELIX[k]} pendant 30 minutes. Un seul élixir à la fois.`, tint: { str: '#e0703a', agi: '#6fd35a', int: '#8f7bff', wis: '#3fbfd0', sta: '#e04848' }[k] };
  }
}
export const FOOD_VAL = [5, 9, 14, 20, 27];
const DISH = [
  ['Brochette de gibier', 'Perche grillée'],
  ['Ragoût de venaison', 'Truite aux herbes'],
  ['Rôti de marais', 'Anguille fumée'],
  ['Festin du chasseur', 'Carpe en croûte de glace'],
  ['Cuissot de drake', 'Poisson-braise flambé'],
];
for (const t of T5) {
  CONSUMABLES[`dish_m${t}`] = { name: DISH[t - 1][0], icon: 'i_dish', type: 'dish', stack: 20, req: [1, 8, 15, 21, 26][t - 1], value: 4 + t * 6, stats: { sta: FOOD_VAL[t - 1], str: Math.round(FOOD_VAL[t - 1] * 0.6), agi: Math.round(FOOD_VAL[t - 1] * 0.6) }, dur: 1800,
    desc: `Repas copieux : +${FOOD_VAL[t - 1]} endurance, +${Math.round(FOOD_VAL[t - 1] * 0.6)} force et agilité pendant 30 minutes.`, tint: '#c86a3a' };
  CONSUMABLES[`dish_f${t}`] = { name: DISH[t - 1][1], icon: 'i_dish', type: 'dish', stack: 20, req: [1, 8, 15, 21, 26][t - 1], value: 4 + t * 6, stats: { sta: FOOD_VAL[t - 1], int: Math.round(FOOD_VAL[t - 1] * 0.6), wis: Math.round(FOOD_VAL[t - 1] * 0.6) }, dur: 1800,
    desc: `Repas raffiné : +${FOOD_VAL[t - 1]} endurance, +${Math.round(FOOD_VAL[t - 1] * 0.6)} intelligence et sagesse pendant 30 minutes.`, tint: '#3a8ac8' };
}
export const BANDAGE_HEAL = [0.22, 0.26, 0.3, 0.34, 0.38]; // part des PV max rendue en 8 s
const BAND = ['Bandage de lin', 'Bandage de laine', 'Bandage de soie', 'Bandage tisse-mage', 'Bandage tisse-lune'];
for (const t of T5) {
  CONSUMABLES[`band${t}`] = { name: BAND[t - 1], icon: 'i_bandage', type: 'bandage', stack: 20, req: [1, 8, 15, 21, 26][t - 1], value: 3 + t * 5, heal: BANDAGE_HEAL[t - 1],
    desc: `Rend ${Math.round(BANDAGE_HEAL[t - 1] * 100)} % de vos points de vie en 8 s, même en combat. Le moindre coup interrompt le bandage.`, tint: '#e8e0d0' };
}
CONSUMABLES.bottle = { name: 'Bouteille à la mer', icon: 'i_bottle', type: 'bottle', stack: 20, req: 1, value: 5, desc: "Clic droit : l'ouvrir. On y trouve parfois de l'or… ou mieux." };

// ---------------------------------------------------------------------------
// Recettes. out : { gear: {slot, armor} } | { item: id, n } | { rune } | { transmute }
// Les armures dépendent de la classe choisie (menu « Pour »). ilvl = niveau d'objet produit.
export const TIER_ILVL = [6, 12, 18, 24, 30];
const R = [];
const rec = (o) => R.push(o);
const TMAT = ['cuivre', 'fer', 'argent-lune', 'orichalque', 'astralite'];
for (const t of T5) {
  const req = TIER_REQ[t - 1];
  // Forgeron : armes (toutes classes), plaques, boucliers
  rec({ id: `forge_weapon${t}`, prof: 'forgeron', tier: t, req, name: `Arme en ${TMAT[t - 1]}`, out: { gear: { slot: 'weapon', any: true } }, mats: { [matId('ore', t)]: 6 + t, ...(t >= 3 ? { [matId('gem', t - 1)]: 1 } : {}) } });
  rec({ id: `forge_offhand${t}`, prof: 'forgeron', tier: t, req: req + 5, name: `Bouclier en ${TMAT[t - 1]}`, out: { gear: { slot: 'offhand', classes: ['guerrier', 'templier'] } }, mats: { [matId('ore', t)]: 5 + t } });
  for (const [slot, nm, k] of [['chest', 'Cuirasse', 6], ['legs', 'Jambières', 5], ['head', 'Heaume', 4], ['hands', 'Gantelets', 3], ['feet', 'Solerets', 3]]) {
    rec({ id: `forge_${slot}${t}`, prof: 'forgeron', tier: t, req: req + (slot === 'chest' ? 10 : slot === 'legs' ? 8 : 3), name: `${nm} en ${TMAT[t - 1]}`, out: { gear: { slot, classes: ['guerrier', 'templier'] } }, mats: { [matId('ore', t)]: k + t } });
  }
  // Maroquinier : cuir (chasseur, assassin, druide) et mailles (chaman)
  for (const [slot, nm, k] of [['chest', 'Plastron', 6], ['legs', 'Jambières', 5], ['head', 'Coiffe', 4], ['hands', 'Gants', 3], ['feet', 'Bottes', 3]]) {
    rec({ id: `leather_${slot}${t}`, prof: 'maroquinier', tier: t, req: req + (slot === 'chest' ? 10 : slot === 'legs' ? 8 : 3), name: `${nm} de ${MATS.leather.names[t - 1].toLowerCase()}`, out: { gear: { slot, classes: ['archer', 'assassin', 'druide', 'chaman'] } }, mats: { [matId('leather', t)]: k + t } });
  }
  rec({ id: `leather_quiver${t}`, prof: 'maroquinier', tier: t, req: req + 5, name: `Carquois (palier ${t})`, out: { gear: { slot: 'offhand', classes: ['archer'] } }, mats: { [matId('leather', t)]: 4 + t } });
  // Couturier : tissu (mage, nécromancien) et sacoches
  for (const [slot, nm, k] of [['chest', 'Robe', 6], ['legs', 'Chausses', 5], ['head', 'Capuche', 4], ['hands', 'Gants', 3], ['feet', 'Sandales', 3]]) {
    rec({ id: `tailor_${slot}${t}`, prof: 'couturier', tier: t, req: req + (slot === 'chest' ? 10 : slot === 'legs' ? 8 : 3), name: `${nm} en ${MATS.cloth.names[t - 1].toLowerCase().replace(/^étoffe de /, '')}`, out: { gear: { slot, classes: ['mage', 'necro'] } }, mats: { [matId('cloth', t)]: k + t } });
  }
  // Joaillier : anneaux et amulettes
  rec({ id: `jewel_ring${t}`, prof: 'joaillier', tier: t, req, name: `Anneau serti (palier ${t})`, out: { gear: { slot: 'ring', any: true } }, mats: { [matId('ore', t)]: 3 + t, [matId('gem', t)]: 1 } });
  rec({ id: `jewel_amulet${t}`, prof: 'joaillier', tier: t, req: req + 8, name: `Amulette sertie (palier ${t})`, out: { gear: { slot: 'amulet', any: true } }, mats: { [matId('ore', t)]: 3 + t, [matId('gem', t)]: 2 } });
  // Alchimiste : potions et élixirs
  const pots = [['pot_hp1', 'pot_mp1'], ['pot_hp2', 'pot_mp1'], ['pot_hp2', 'pot_mp2'], ['pot_hp3', 'pot_mp3'], ['pot_hp4', 'pot_mp3']][t - 1];
  rec({ id: `alch_hp${t}`, prof: 'alchimiste', tier: t, req, name: CONSUMABLES[pots[0]].name, out: { item: pots[0], n: 2 }, mats: { [matId('herb', t)]: 2 } });
  rec({ id: `alch_mp${t}`, prof: 'alchimiste', tier: t, req: req + 3, name: CONSUMABLES[pots[1]].name, out: { item: pots[1], n: 2 }, mats: { [matId('herb', t)]: 2 } });
  for (const k in ELIX) rec({ id: `alch_elix_${k}${t}`, prof: 'alchimiste', tier: t, req: req + 10, name: CONSUMABLES[`elix_${k}${t}`].name, out: { item: `elix_${k}${t}`, n: 1 }, mats: { [matId('herb', t)]: 3, ...(t >= 2 ? { [matId('herb', t - 1)]: 2 } : {}) } });
  // Cuisinier : plats
  rec({ id: `cook_m${t}`, prof: 'cuisinier', tier: t, req, name: CONSUMABLES[`dish_m${t}`].name, out: { item: `dish_m${t}`, n: 2 }, mats: { [matId('meat', t)]: 2, ...(t >= 2 ? { [matId('herb', t - 1)]: 1 } : {}) } });
  rec({ id: `cook_f${t}`, prof: 'cuisinier', tier: t, req: req + 5, name: CONSUMABLES[`dish_f${t}`].name, out: { item: `dish_f${t}`, n: 2 }, mats: { [matId('fish', t)]: 2 } });
  // Secouriste : bandages
  rec({ id: `aid_band${t}`, prof: 'secouriste', tier: t, req, name: CONSUMABLES[`band${t}`].name, out: { item: `band${t}`, n: 2 }, mats: { [matId('cloth', t)]: 2 } });
}
// Couturier : sacoche renforcée (+8 emplacements)
rec({ id: 'tailor_bag', prof: 'couturier', tier: 3, req: 70, name: 'Sacoche renforcée', out: { item: 'bag_scroll', n: 1 }, mats: { cloth3: 10, leather2: 4 } });
// Runiste : gravure et transmutation
rec({ id: 'rune_grave1', prof: 'runiste', tier: 1, req: 1, name: 'Gravure mineure (rune niv. 1)', out: { rune: 1 }, mats: { shard: 3, herb1: 1 } });
rec({ id: 'rune_transmute', prof: 'runiste', tier: 2, req: 30, name: 'Transmutation (2 runes → 1 rune du type choisi)', out: { transmute: true }, mats: { shard: 1 } });
rec({ id: 'rune_grave2', prof: 'runiste', tier: 3, req: 60, name: 'Gravure fine (rune niv. 2)', out: { rune: 2 }, mats: { shard: 5, gem3: 1 } });
rec({ id: 'rune_grave3', prof: 'runiste', tier: 4, req: 95, name: 'Gravure savante (rune niv. 3)', out: { rune: 3 }, mats: { shard: 8, gem4: 1, herb4: 2 } });
rec({ id: 'rune_grave4', prof: 'runiste', tier: 5, req: 130, name: 'Gravure de maître (rune niv. 4)', out: { rune: 4 }, mats: { shard: 12, shard_big: 1, gem5: 1 } });
export const RECIPES = R;
export const RECIPE_BY_ID = Object.fromEntries(R.map((r) => [r.id, r]));

// couleur de difficulté (façon grand MMO) selon l'écart compétence / prérequis
export function diffColor(skill, req) {
  const d = skill - req;
  if (d < 0) return 'red';
  if (d < 15) return 'orange';
  if (d < 30) return 'yellow';
  if (d < 45) return 'green';
  return 'grey';
}
export const SKILLUP_CHANCE = { orange: 1, yellow: 0.6, green: 0.25, grey: 0, red: 0 };
