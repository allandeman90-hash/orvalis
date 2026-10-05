// Objets : équipement généré (niveau d'objet, qualité 0-100 %, rareté), consommables, matériaux et objets de quête.
import { CLASSES, CLASS_LIST } from './classbase.js';
import { weaponAvg } from '../game/stats.js';
import { QUEST_ITEMS } from './mobs.js';
import { clamp } from '../core/util.js';
import { socketsFor, runeStats, hash01 } from './runes.js';

export const SLOTS = ['head', 'amulet', 'chest', 'legs', 'hands', 'feet', 'ring', 'weapon', 'offhand'];
export const SLOT_NAMES = { weapon: 'Arme', offhand: 'Main gauche', head: 'Tête', chest: 'Torse', legs: 'Jambes', hands: 'Mains', feet: 'Pieds', ring: 'Anneau', amulet: 'Cou' };
export const RARITY = [
  { name: 'Commun', color: '#cfd3da' },
  { name: 'Peu commun', color: '#5fd35a' },
  { name: 'Rare', color: '#3fa0ff' },
  { name: 'Épique', color: '#b86bff' },
  { name: 'Légendaire', color: '#ff9f2a' },
  { name: 'Mythique', color: '#ff4f7b' },
];
export const rarityOf = (q) => (q >= 99 ? 4 : q >= 90 ? 3 : q >= 70 ? 2 : q >= 50 ? 1 : 0);
export const tierOf = (ilvl) => clamp(Math.ceil(ilvl / 5), 1, 7);
export const BAG_SIZE = 32;
export const STASH_SIZE = 48;

// Noms de base : [nom, genre ('m'|'f'), glyphe d'icône, type visuel]
const BASES = {
  weapon: {
    guerrier: [['Épée', 'f', 'i_sword', 'sword'], ['Hache', 'f', 'i_axe', 'axe'], ['Masse', 'f', 'i_mace', 'mace']],
    templier: [['Marteau de guerre', 'm', 'i_hammer', 'warhammer'], ['Épée bénie', 'f', 'i_sword', 'sword']],
    mage: [['Bâton', 'm', 'i_staff', 'staff'], ['Bâton runique', 'm', 'i_staff', 'staff']],
    necro: [['Faux', 'f', 'i_scythe', 'scythe'], ['Bâton d\'ossements', 'm', 'i_staff', 'staff']],
    archer: [['Arc court', 'm', 'i_bow', 'bow'], ['Arc long', 'm', 'i_bow', 'bow']],
    assassin: [['Dague', 'f', 'i_dagger', 'dagger'], ['Stylet', 'm', 'i_dagger', 'dagger']],
    druide: [['Sceptre', 'm', 'i_scepter', 'scepter'], ['Bâton noueux', 'm', 'i_staff', 'staff']],
    chaman: [['Masse-totem', 'f', 'i_totemmace', 'totemmace'], ['Hache des orages', 'f', 'i_axe', 'axe']],
  },
  offhand: {
    guerrier: [['Bouclier', 'm', 'i_shield', 'shield']],
    templier: [['Pavois', 'm', 'i_shield', 'shield']],
    mage: [['Orbe', 'm', 'i_orb', 'orb']],
    necro: [['Grimoire', 'm', 'i_tome', 'tome'], ['Crâne rituel', 'm', 'i_skull', 'skull']],
    archer: [['Carquois', 'm', 'i_quiver', 'quiver']],
    assassin: [['Dague de parade', 'f', 'i_dagger', 'dagger']],
    druide: [['Relique', 'f', 'i_relic', 'relic']],
    chaman: [['Fétiche', 'm', 'i_fetish', 'fetish']],
  },
  head: {
    guerrier: [['Heaume', 'm', 'i_helm']], templier: [['Heaume à crête', 'm', 'i_helm']], mage: [['Chapeau', 'm', 'i_hat']], necro: [['Capuchon', 'm', 'i_hood']],
    archer: [['Capuche', 'f', 'i_hood']], assassin: [['Masque', 'm', 'i_mask']], druide: [['Couronne sylvestre', 'f', 'i_crown']], chaman: [['Coiffe de fourrure', 'f', 'i_pelt']],
  },
  chest: {
    guerrier: [['Cuirasse', 'f', 'i_chest']], templier: [['Cuirasse', 'f', 'i_chest']], mage: [['Robe', 'f', 'i_robe']], necro: [['Robe', 'f', 'i_robe']],
    archer: [['Tunique', 'f', 'i_tunic']], assassin: [['Justaucorps', 'm', 'i_tunic']], druide: [['Veste', 'f', 'i_tunic']], chaman: [['Haubert', 'm', 'i_chest']],
  },
  legs: {
    guerrier: [['Jambières', 'fp', 'i_legs']], templier: [['Cuissards', 'mp', 'i_legs']], mage: [['Chausses', 'fp', 'i_legs']], necro: [['Chausses', 'fp', 'i_legs']],
    archer: [['Braies', 'fp', 'i_legs']], assassin: [['Braies', 'fp', 'i_legs']], druide: [['Jambières', 'fp', 'i_legs']], chaman: [['Jambières', 'fp', 'i_legs']],
  },
  hands: {
    guerrier: [['Gantelets', 'mp', 'i_gloves']], templier: [['Gantelets', 'mp', 'i_gloves']], mage: [['Gants', 'mp', 'i_gloves']], necro: [['Gants', 'mp', 'i_gloves']],
    archer: [['Gants', 'mp', 'i_gloves']], assassin: [['Gants', 'mp', 'i_gloves']], druide: [['Mitaines', 'fp', 'i_gloves']], chaman: [['Gantelets', 'mp', 'i_gloves']],
  },
  feet: {
    guerrier: [['Solerets', 'mp', 'i_boots']], templier: [['Solerets', 'mp', 'i_boots']], mage: [['Sandales', 'fp', 'i_boots']], necro: [['Sandales', 'fp', 'i_boots']],
    archer: [['Bottes', 'fp', 'i_boots']], assassin: [['Bottes souples', 'fp', 'i_boots']], druide: [['Bottes', 'fp', 'i_boots']], chaman: [['Bottes', 'fp', 'i_boots']],
  },
  ring: { '*': [['Anneau', 'm', 'i_ring'], ['Chevalière', 'f', 'i_ring']] },
  amulet: { '*': [['Amulette', 'f', 'i_amulet'], ['Pendentif', 'm', 'i_amulet']] },
};

// Matériaux par palier (1-7) selon le type : [masculin, féminin]
const MAT = {
  plate: [['rouillé', 'rouillée'], ['de fer', 'de fer'], ["d'acier", "d'acier"], ['de chevalier', 'de chevalier'], ['runique', 'runique'], ["d'obsidienne", "d'obsidienne"], ['astral', 'astrale']],
  cloth: [['en lin', 'en lin'], ['en laine', 'en laine'], ['en soie', 'en soie'], ['enchanté', 'enchantée'], ['runique', 'runique'], ['du crépuscule', 'du crépuscule'], ['astral', 'astrale']],
  leather: [['usé', 'usée'], ['en cuir', 'en cuir'], ['clouté', 'cloutée'], ['de rôdeur', 'de rôdeur'], ['runique', 'runique'], ['de drake', 'de drake'], ['astral', 'astrale']],
  mail: [['rapiécé', 'rapiécée'], ['de mailles', 'de mailles'], ['annelé', 'annelée'], ['des steppes', 'des steppes'], ['runique', 'runique'], ["d'écaille-foudre", "d'écaille-foudre"], ['astral', 'astrale']],
  weapon: [['usé', 'usée'], ['de fer', 'de fer'], ["d'acier", "d'acier"], ["d'argent-lune", "d'argent-lune"], ['runique', 'runique'], ["d'obsidienne", "d'obsidienne"], ['astral', 'astrale']],
  jewel: [['de cuivre', 'de cuivre'], ["d'argent", "d'argent"], ["d'or", "d'or"], ["d'ambre", "d'ambre"], ['de saphir', 'de saphir'], ["d'onyx", "d'onyx"], ['astral', 'astrale']],
};
const SUFFIX = { str: 'du Taureau', sta: "de l'Ours", agi: 'du Faucon', int: 'du Hibou', wis: 'du Cerf', crit: 'de la Vipère', haste: 'du Vent', hp: 'du Colosse', mp: 'de la Source', power: 'du Fléau', heal: 'de la Rosée', block: 'du Rempart', speed: 'du Lièvre', regen: 'du Renouveau' };
export const ARMOR_TYPE = { guerrier: 'plate', templier: 'plate', mage: 'cloth', necro: 'cloth', archer: 'leather', assassin: 'leather', druide: 'leather', chaman: 'mail' };

const SLOT_BUDGET = { weapon: 1.3, offhand: 0.8, head: 0.9, chest: 1.1, legs: 0.95, hands: 0.7, feet: 0.75, ring: 0.8, amulet: 0.9 };
const SLOT_ARMOR = { chest: 1.0, legs: 0.8, head: 0.7, feet: 0.55, hands: 0.5, offhand: 0 };
const TYPE_ARMOR = { plate: 1.8, mail: 1.55, leather: 1.35, cloth: 0.75 };

// statistiques bonus possibles par classe (pondérées)
const POOL = {
  guerrier: [['str', 3], ['sta', 3], ['agi', 1], ['crit', 1], ['block', 1], ['hp', 1.2], ['regen', 0.6]],
  templier: [['str', 3], ['sta', 3], ['wis', 1.6], ['heal', 1], ['block', 1], ['hp', 1], ['regen', 0.6]],
  mage: [['int', 3], ['sta', 1.5], ['wis', 1.5], ['crit', 1.2], ['haste', 1.2], ['mp', 1], ['power', 0.8]],
  necro: [['int', 3], ['sta', 1.8], ['wis', 1.2], ['crit', 1], ['haste', 1.2], ['mp', 1], ['power', 0.9]],
  archer: [['agi', 3], ['sta', 1.8], ['crit', 1.5], ['haste', 1.2], ['str', 0.6], ['power', 0.8]],
  assassin: [['agi', 3], ['sta', 1.8], ['crit', 1.8], ['haste', 1.2], ['str', 0.8], ['power', 0.8]],
  druide: [['wis', 3], ['int', 2], ['sta', 1.8], ['heal', 1.5], ['haste', 1], ['mp', 1], ['regen', 0.8]],
  chaman: [['wis', 3], ['int', 2], ['sta', 2], ['heal', 1.4], ['crit', 0.8], ['mp', 1], ['regen', 0.8]],
};
const STAT_WEIGHT = { str: 1, sta: 1, agi: 1, int: 1, wis: 1, crit: 0.12, haste: 0.14, hp: 9, mp: 7, power: 0.9, heal: 1.1, block: 0.18, speed: 0.12, regen: 0.4 };

let uidN = Date.now() % 100000;
export const itemUid = () => 'i' + (uidN++).toString(36) + Math.floor(Math.random() * 1296).toString(36);

function pickW(rng, list) {
  let t = 0; for (const [, w] of list) t += w;
  let r = rng() * t;
  for (const [k, w] of list) { r -= w; if (r <= 0) return k; }
  return list[0][0];
}

// Qualité aléatoire selon la source
export function rollQuality(rng, src = 'mob') {
  const r = rng();
  if (src === 'raid') return Math.round(84 + Math.pow(r, 0.8) * 16);
  if (src === 'boss') return Math.round(55 + Math.pow(r, 0.7) * 45);
  if (src === 'elite') return Math.round(Math.pow(r, 1.3) * 100);
  if (src === 'quest') return Math.round(50 + r * 42);
  if (src === 'vendor') return Math.round(20 + r * 30);
  return Math.round(Math.pow(r, 2.1) * 100);
}

// Crée une pièce d'équipement
export function makeGear(o, rng = Math.random) {
  const slot = o.slot || SLOTS[Math.floor(rng() * SLOTS.length)];
  const cls = o.cls || CLASS_LIST[Math.floor(rng() * CLASS_LIST.length)];
  const ilvl = clamp(Math.round(o.ilvl || 1), 1, 34);
  const mythic = !!o.mythic;
  const q = mythic ? 100 : clamp(o.quality ?? rollQuality(rng), 0, 100);
  const tier = tierOf(ilvl);
  const rarity = mythic ? 5 : rarityOf(q);
  const bases = BASES[slot][cls] || BASES[slot]['*'];
  const bi = o.base != null ? Math.min(o.base, bases.length - 1) : Math.floor(rng() * bases.length);
  const [bname, gender, icon, visual] = bases[bi];
  const shieldUser = cls === 'guerrier' || cls === 'templier';
  const aType = slot === 'weapon' || slot === 'offhand' && !shieldUser ? 'weapon' : slot === 'ring' || slot === 'amulet' ? 'jewel' : ARMOR_TYPE[cls];
  const matForm = MAT[aType === 'weapon' || aType === 'jewel' ? aType : aType][tier - 1];
  const fem = gender[0] === 'f';
  let mat = matForm[fem ? 1 : 0];
  if (gender.length > 1 && !/^(de |des |d'|en |du )/.test(mat)) mat = !fem && mat.endsWith('al') ? mat.slice(0, -2) + 'aux' : mat + 's';
  const stats = {};
  const qf = 0.8 + (q / 100) * 0.45;
  if (slot === 'weapon') {
    const avg = weaponAvg(ilvl) * (0.85 + (q / 100) * 0.35) * (mythic ? 1.08 : 1);
    stats.dmgMin = Math.round(avg * 0.8);
    stats.dmgMax = Math.round(avg * 1.2);
  }
  if (SLOT_ARMOR[slot]) stats.armor = Math.round((6 + ilvl * 3.2) * SLOT_ARMOR[slot] * TYPE_ARMOR[ARMOR_TYPE[cls]] * qf);
  if (slot === 'offhand' && shieldUser) { stats.armor = Math.round((8 + ilvl * 3.4) * 1.2 * qf); stats.block = Math.round(3 + q / 25); }
  if (slot === 'offhand' && cls === 'assassin') { const a = weaponAvg(ilvl) * 0.32 * (0.85 + (q / 100) * 0.35); stats.power = Math.max(1, Math.round(a)); }
  // statistiques bonus
  const nBonus = [rng() < 0.5 ? 1 : 0, 1 + (rng() < 0.4 ? 1 : 0), 2 + (rng() < 0.5 ? 1 : 0), 3 + (rng() < 0.5 ? 1 : 0), 4 + (rng() < 0.5 ? 1 : 0), 5][rarity] + (slot === 'ring' || slot === 'amulet' ? 1 : 0);
  const budget = (2 + ilvl * 1.25) * SLOT_BUDGET[slot] * (0.55 + (q / 100) * 0.9) * (mythic ? 1.18 : 1);
  const pool = POOL[cls].slice();
  if (slot === 'feet' && rng() < 0.35) pool.push(['speed', 3]);
  const chosen = [];
  for (let i = 0; i < nBonus && pool.length; i++) {
    const k = pickW(rng, pool);
    chosen.push(k);
    pool.splice(pool.findIndex((p) => p[0] === k), 1);
  }
  let main = null;
  chosen.forEach((k, i) => {
    const share = i === 0 ? 0.5 : 0.5 / Math.max(1, chosen.length - 1);
    let v = (budget * (chosen.length === 1 ? 0.8 : share)) * STAT_WEIGHT[k];
    if (k === 'crit' || k === 'haste' || k === 'block' || k === 'speed') v = Math.max(1, Math.round(v * 10) / 10);
    else v = Math.max(1, Math.round(v));
    if (k === 'speed') v = Math.min(v, 8);
    stats[k] = v;
    if (!main) main = k;
  });
  let name = `${bname} ${mat}`;
  if (main && rarity >= 1) name += ' ' + SUFFIX[main];
  const value = Math.round((4 + Math.pow(ilvl, 1.55) * 1.6) * (1 + rarity * 0.9) * (slot === 'weapon' ? 1.4 : 1));
  const sockets = socketsFor(rarity, ilvl, rng);
  return {
    uid: itemUid(), type: 'gear', slot, cls: slot === 'ring' || slot === 'amulet' ? null : cls, ilvl, tier, quality: q, rarity, upg: 0,
    name, icon, base: bi, visual: visual || null, stats, value, req: Math.max(1, ilvl - 2),
    ...(mythic ? { mythic: true } : {}),
    sockets, runes: Array(sockets).fill(null),
  };
}

// Emplacements de runes des objets créés avant l'arrivée des runes (déterministe selon l'identifiant)
export function ensureSockets(it) {
  if (!it || it.type !== 'gear') return it;
  if (typeof it.sockets !== 'number') it.sockets = socketsFor(it.rarity || 0, it.ilvl || 1, () => hash01(it.uid || it.name || 'x'));
  if (!Array.isArray(it.runes)) it.runes = [];
  if (it.runes.length > it.sockets) it.runes.length = it.sockets;
  while (it.runes.length < it.sockets) it.runes.push(null);
  return it;
}

// Statistiques totales d'un objet : base + amélioration + runes serties
export function itemStats(it) {
  const out = gearStats(it);
  const r = runeStats(it);
  for (const k in r) out[k] = (out[k] || 0) + r[k];
  return out;
}

// Statistiques effectives (avec amélioration +N)
export function gearStats(it) {
  const m = 1 + (it.upg || 0) * 0.08;
  const out = {};
  for (const k in it.stats) {
    const v = it.stats[k] * m;
    out[k] = k === 'crit' || k === 'haste' || k === 'block' || k === 'speed' ? Math.round(v * 10) / 10 : Math.round(v);
  }
  return out;
}

// Score de l'objet (pour comparer / bots)
export function gearScore(it) {
  if (!it || it.type !== 'gear') return 0;
  const s = gearStats(it);
  let v = 0;
  for (const k in s) {
    if (k === 'dmgMin' || k === 'dmgMax') v += s[k] * 0.9;
    else if (k === 'armor') v += s[k] * 0.12;
    else v += s[k] / (STAT_WEIGHT[k] || 1);
  }
  return Math.round(v);
}

// ---------------------------------------------------------------------------
// Consommables et matériaux
export const CONSUMABLES = {
  pot_hp1: { name: 'Potion de soin mineure', icon: 'i_potion_red', type: 'potion', stack: 20, req: 1, value: 6, heal: 90, desc: 'Rend 90 points de vie en 6 s.' },
  pot_hp2: { name: 'Potion de soin', icon: 'i_potion_red', type: 'potion', stack: 20, req: 8, value: 18, heal: 320, desc: 'Rend 320 points de vie en 6 s.' },
  pot_hp3: { name: 'Grande potion de soin', icon: 'i_potion_red', type: 'potion', stack: 20, req: 16, value: 40, heal: 800, desc: 'Rend 800 points de vie en 6 s.' },
  pot_hp4: { name: 'Potion de soin supérieure', icon: 'i_potion_red', type: 'potion', stack: 20, req: 24, value: 75, heal: 1500, desc: 'Rend 1 500 points de vie en 6 s.' },
  pot_mp1: { name: 'Potion de mana mineure', icon: 'i_potion_blue', type: 'potion', stack: 20, req: 1, value: 6, mana: 0.25, desc: 'Rend 25 % de votre mana.' },
  pot_mp2: { name: 'Potion de mana', icon: 'i_potion_blue', type: 'potion', stack: 20, req: 12, value: 25, mana: 0.35, desc: 'Rend 35 % de votre mana.' },
  pot_mp3: { name: 'Grande potion de mana', icon: 'i_potion_blue', type: 'potion', stack: 20, req: 22, value: 55, mana: 0.5, desc: 'Rend 50 % de votre mana.' },
  food1: { name: 'Pain de campagne', icon: 'i_bread', type: 'food', stack: 20, req: 1, value: 3, desc: 'Hors combat : rend 30 % de vie en 10 s.' },
  food2: { name: 'Ragoût du chasseur', icon: 'i_stew', type: 'food', stack: 20, req: 15, value: 12, desc: 'Hors combat : rend 45 % de vie en 10 s.' },
  shard: { name: 'Éclat runique', icon: 'i_shard', type: 'mat', stack: 999, req: 1, value: 8, desc: "Matériau d'amélioration. Le forgeron l'utilise pour renforcer votre équipement." },
  shard_big: { name: 'Cœur runique', icon: 'i_runeheart', type: 'mat', stack: 999, req: 1, value: 60, desc: 'Matériau rare. Requis pour les améliorations +7 et au-delà.' },
  trophy: { name: 'Trophée des tempêtes', icon: 'i_trophy', type: 'mat', stack: 999, req: 1, value: 150, desc: "Arraché au Dévoreur d'Orages. Monnaie des récompenses d'élite." },
  emblem: { name: 'Emblème de bravoure', icon: 'i_emblem', type: 'mat', stack: 999, req: 1, value: 0, desc: "Remis pour chaque boss de donjon, de raid ou de l'Abîme vaincu. À échanger auprès de l'Intendance (touche U)." },
  bag_scroll: { name: 'Sacoche renforcée', icon: 'i_bag', type: 'bagup', stack: 1, req: 1, value: 250, desc: 'Utiliser : ajoute 8 emplacements à votre sac (max. 3).' },
};

export function makeConsumable(id, count = 1) {
  const c = CONSUMABLES[id];
  const rarity = id === 'shard_big' || id === 'trophy' || id === 'emblem' ? 3 : id === 'bag_scroll' ? 2 : c.mat === 'gem' ? (c.tier >= 4 ? 2 : 1) : c.tier >= 5 ? 1 : 0;
  const it = { uid: itemUid(), type: c.type, cid: id, name: c.name, icon: c.icon, count, stack: c.stack, value: c.value, req: c.req, rarity };
  if (c.tint) it.tint = c.tint;
  return it;
}
export function makeQuestItem(qi, count = 1) {
  return { uid: itemUid(), type: 'quest', qid: qi, name: QUEST_ITEMS[qi] || qi, icon: 'i_quest', count, stack: 50, value: 0, rarity: 1 };
}

// Potions adaptées au niveau
export function potionFor(level, kind = 'hp') {
  if (kind === 'hp') return level >= 24 ? 'pot_hp4' : level >= 16 ? 'pot_hp3' : level >= 8 ? 'pot_hp2' : 'pot_hp1';
  return level >= 22 ? 'pot_mp3' : level >= 12 ? 'pot_mp2' : 'pot_mp1';
}

// Objets légendaires uniques (butin des boss)
export const UNIQUES = {
  tisseuse: { slot: 'ring', name: 'Anneau de la Tisseuse', stats: { agi: 9, crit: 3, sta: 6 }, ilvl: 13 },
  coeur_magma: { slot: 'amulet', name: 'Cœur de magma figé', stats: { sta: 10, str: 8, hp: 60 }, ilvl: 13 },
  mere_vase: { slot: 'ring', name: 'Anneau de la Vase-Mère', stats: { wis: 12, heal: 10, regen: 6 }, ilvl: 19 },
  ossevaine: { slot: 'amulet', name: "Phylactère d'Ossevaine", stats: { int: 16, crit: 4, mp: 90 }, ilvl: 25 },
  vyrmathra: { slot: 'ring', name: 'Écaille-mère de Vyrmathra', stats: { str: 16, agi: 14, sta: 14, crit: 3 }, ilvl: 31 },
  azhkar: { slot: 'amulet', name: "Œil du Dévoreur d'Orages", stats: { str: 18, agi: 18, int: 18, wis: 18, sta: 18, haste: 5 }, ilvl: 34 },
  // donjons et raids (boss finaux)
  b1_colosse: { slot: 'amulet', name: 'Cœur de scories', stats: { sta: 11, str: 9, hp: 70 }, ilvl: 13 },
  b2_ondrakis: { slot: 'ring', name: 'Anneau des Tourbières', stats: { wis: 12, int: 9, regen: 6 }, ilvl: 18 },
  b3_morvhal: { slot: 'amulet', name: 'Sceau du Roi Oublié', stats: { int: 15, crit: 4, mp: 80, sta: 8 }, ilvl: 23 },
  b4_hjarnok: { slot: 'ring', name: 'Givre-Cœur', stats: { str: 13, agi: 13, sta: 12, haste: 3 }, ilvl: 28 },
  b5_velkyra: { slot: 'amulet', name: 'Flamme de Velkyra', stats: { int: 17, wis: 14, crit: 4, haste: 3 }, ilvl: 31 },
  r1_vortharion: { slot: 'ring', name: "Œil du Cyclone", stats: { agi: 19, str: 16, crit: 5, haste: 4 }, ilvl: 34 },
  r2_nyxaroth: { slot: 'amulet', name: 'Écaille de la Mère des Wyrms', stats: { sta: 20, str: 15, int: 15, wis: 15, hp: 120 }, ilvl: 34 },
};
export function makeUnique(id) {
  const u = UNIQUES[id];
  return {
    uid: itemUid(), type: 'gear', slot: u.slot, cls: null, ilvl: u.ilvl, tier: tierOf(u.ilvl), quality: 100, rarity: 4, upg: 0,
    name: u.name, icon: u.slot === 'ring' ? 'i_ring' : 'i_amulet', stats: { ...u.stats }, value: Math.round(Math.pow(u.ilvl, 1.6) * 12), req: u.ilvl - 2, unique: id,
    sockets: 3, runes: [null, null, null],
  };
}

export function itemColor(it) {
  return RARITY[it.rarity || 0].color;
}

// ============================ ENSEMBLES DE DONJON ET DE RAID ============================
// Un ensemble par contenu et par classe : 7 pièces (tête, torse, jambes, mains, pieds, arme, main gauche).
export const SET_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet', 'weapon', 'offhand'];
export const SETS = {
  meche: { suffix: 'de Mèchenoire', kind: 'dungeon', ilvl: 13 },
  englouti: { suffix: 'des Tourbières englouties', kind: 'dungeon', ilvl: 18 },
  catacombes: { suffix: 'du Roi Oublié', kind: 'dungeon', ilvl: 23 },
  givre: { suffix: 'de Givre-Écaille', kind: 'dungeon', ilvl: 28 },
  creuset: { suffix: 'du Creuset écarlate', kind: 'dungeon', ilvl: 31 },
  tempetes: { suffix: "de l'Œil du Cyclone", kind: 'raid', ilvl: 33 },
  tempetes_h: { suffix: 'de la Tempête éternelle', kind: 'raid', heroic: true, ilvl: 34 },
  cendre: { suffix: 'de Cendre-Noire', kind: 'raid', ilvl: 33 },
  cendre_h: { suffix: 'de la Mère des Wyrms', kind: 'raid', heroic: true, ilvl: 34 },
};
export const SET_NOUN = { guerrier: 'Harnois', templier: 'Panoplie sacrée', mage: 'Atours', necro: 'Linceul', archer: 'Tenue de traque', assassin: "Tenue d'ombre", druide: 'Parure sylvestre', chaman: 'Broigne' };
export const setName = (set, cls) => `${SET_NOUN[cls]} ${SETS[set].suffix}`;
// Pièce d'ensemble. heroic : version héroïque d'un ensemble de donjon (mêmes pièces, niveau d'objet plus haut).
export function makeSetPiece(set, cls, slot, o = {}) {
  const S = SETS[set];
  const raid = S.kind === 'raid';
  const ilvl = Math.min(34, S.ilvl + (o.heroic ? 3 : 0));
  const q = raid ? (S.heroic ? 100 : 99) : o.heroic ? 97 : 92 + Math.floor(Math.random() * 5);
  const it = makeGear({ slot, cls, ilvl, quality: q, mythic: !!S.heroic, base: 0 });
  it.set = set;
  if (o.heroic) it.heroic = true;
  it.name = `${(BASES[slot][cls] || BASES[slot]['*'])[0][0]} ${S.suffix}${o.heroic ? ' (héroïque)' : ''}`;
  it.rarity = raid ? (S.heroic ? 5 : 4) : 3;
  it.sockets = Math.max(it.sockets, raid ? (S.heroic ? 4 : 3) : 2);
  it.runes = Array(it.sockets).fill(null);
  it.value = Math.round(it.value * 1.5);
  return it;
}

// Clé d'icône unique d'une pièce d'équipement (icônes peintes) :
//  ensemble → set_<ensemble>_<classe>_<emplacement> ; unique → u_<id> ; arme mythique → my_<classe>_<base>
//  sinon → g_<classe|x>_<emplacement>_<base>_t<palier>
export function gearBase(it) {
  if (it.base != null) return it.base;
  const bases = BASES[it.slot]?.[it.cls] || BASES[it.slot]?.['*'] || [];
  let bi = 0, best = -1;
  bases.forEach((b, i) => { if (it.name?.startsWith(b[0]) && b[0].length > best) { best = b[0].length; bi = i; } });
  return bi;
}
export function gearIconKey(it) {
  if (it.type !== 'gear') return null;
  if (it.unique) return 'u_' + it.unique;
  if (it.set) return `set_${it.set}_${it.cls}_${it.slot}`;
  const jewel = it.slot === 'ring' || it.slot === 'amulet';
  const c = jewel ? 'x' : it.cls;
  if (it.rarity === 5 && it.slot === 'weapon') return `my_${c}_${gearBase(it)}`;
  return `g_${c}_${it.slot}_${gearBase(it)}_t${it.tier || tierOf(it.ilvl || 1)}`;
}
// Catalogue complet des pièces (pour les planches d'icônes) : [clé, description utile]
export function gearCatalog() {
  const out = [];
  const CL = Object.keys(ARMOR_TYPE);
  for (const set of Object.keys(SETS)) for (const cls of CL) for (const slot of SET_SLOTS) {
    const b = (BASES[slot][cls] || BASES[slot]['*'])[0];
    out.push({ key: `set_${set}_${cls}_${slot}`, group: 'set', set, cls, slot, name: `${b[0]} ${SETS[set].suffix}`, visual: b[3] || b[2] });
  }
  for (const [id, u] of Object.entries(UNIQUES)) out.push({ key: 'u_' + id, group: 'unique', slot: u.slot, name: u.name, id });
  for (const cls of CL) (BASES.weapon[cls]).forEach((b, i) => out.push({ key: `my_${cls}_${i}`, group: 'mythic', cls, slot: 'weapon', name: b[0] + ' mythique', visual: b[3] }));
  for (let t = 1; t <= 7; t++) {
    for (const cls of CL) for (const slot of ['head', 'chest', 'legs', 'hands', 'feet', 'weapon', 'offhand']) (BASES[slot][cls]).forEach((b, i) => out.push({ key: `g_${cls}_${slot}_${i}_t${t}`, group: 'gear', tier: t, cls, slot, name: b[0], visual: b[3] || b[2] }));
    for (const slot of ['ring', 'amulet']) BASES[slot]['*'].forEach((b, i) => out.push({ key: `g_x_${slot}_${i}_t${t}`, group: 'gear', tier: t, cls: null, slot, name: b[0], visual: b[2] }));
  }
  return out;
}

