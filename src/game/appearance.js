// Apparence des personnages joueurs et bots : silhouettes héroïques par classe (épaulières, capes à l'emblème
// de faction, cols, fourreaux…), couleurs d'armure selon le palier et la rareté de l'équipement.
// Les PNJ gardent des tenues simples (voir npc.js) : un joueur se reconnaît au premier coup d'œil.
import { createModel } from './models.js';
import { FACTIONS } from '../data/zones.js';
import { CLASSES } from '../data/classbase.js';
import { ARMOR_TYPE } from '../data/items.js';

export const SKIN_TONES = ['#f1c9a5', '#e0b48a', '#c68e62', '#9a6a44', '#6e4a30', '#b8c8a0'];
export const HAIR_COLORS = ['#2a1e16', '#5a3a22', '#a86a30', '#d8b060', '#e8e0d0', '#8a2a1a', '#3a4a6a', '#1a1a1a'];
export const HAIR_STYLES = ['Court', 'Long', 'Crête', 'Rasé', 'Tresses'];

// palette par type d'armure et palier (1..7)
const PAL = {
  plate: ['#8a7a66', '#9aa4b0', '#b8c2ce', '#d0dcec', '#6f8fd0', '#8a5ac8', '#f2e2a0'],
  mail: ['#7a746a', '#8a929c', '#96a6b4', '#a8bcd0', '#4f8ac0', '#3fa08a', '#e8f0f8'],
  cloth: ['#a08a6e', '#5f7ab8', '#8a5ac0', '#3f78d8', '#c04a9a', '#5a3fa0', '#f4ecff'],
  leather: ['#96703e', '#8a5a2e', '#6f8a3e', '#3f8a4a', '#b0703a', '#a03a2e', '#e6d49a'],
};
const TRIM = ['#8a7a60', '#8a8a8a', '#5fd35a', '#3fa0ff', '#b86bff', '#ff9f2a'];
const RARITY_GLOW = [null, null, '#58b4ff', '#c98bff', '#ffb040'];
const METAL = ['#9a8a70', '#b8bec8', '#d0d6de', '#c8d8f0', '#9fb8ff', '#8a6aa0', '#fff0c0'];
const GEMS = ['#7fd1ff', '#8fe86a', '#ffb050', '#b58cff', '#ff5a8a', '#9fe8ff', '#fff0a0'];
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, '0')).join('');
};

function pieceColor(it, type, fallback) {
  if (!it) return fallback;
  return PAL[type][(it.tier || 1) - 1];
}

// Cape et emblème de faction
function factionCape(f, cls) {
  const azur = f === 0;
  const base = azur ? { color: '#2a4f94', trim: '#e8e0c8', emblem: 'azur', emblemColor: '#f4ecd8' } : { color: '#6e1f13', trim: '#1c1412', emblem: 'braise', emblemColor: '#ffc080' };
  if (cls === 'necro') return { ...base, color: azur ? '#232a44' : '#2e1614', style: 'tattered', len: 1.7 };
  if (cls === 'chaman') return { ...base, color: '#7a5a3e', trim: null, style: 'fur', len: 1.2, emblem: null };
  if (cls === 'archer' || cls === 'assassin') return { ...base, style: 'short', len: 1.1 };
  if (cls === 'mage' || cls === 'druide') return { ...base, len: 1.65 };
  return { ...base, len: 1.55 };
}

// data : {cls, faction, app:{skin,hair,hairStyle,beard}, equip:{slot:item}}
export function characterSpec(data) {
  const cls = CLASSES[data.cls] ? data.cls : 'guerrier';
  const type = ARMOR_TYPE[cls] || 'leather';
  const eq = data.equip || {};
  const app = data.app || {};
  const fac = FACTIONS[data.faction] || FACTIONS[0];
  const azur = fac.id === 0;
  const base = type === 'plate' ? '#6a5a4a' : type === 'mail' ? '#5e5a54' : type === 'cloth' ? '#8a7a68' : '#6a5038';
  const chest = pieceColor(eq.chest, type, base);
  const legs = pieceColor(eq.legs, type, type === 'cloth' ? '#5a4a3a' : '#4a3a2a');
  const hands = eq.hands ? pieceColor(eq.hands, type) : app.skin !== undefined ? SKIN_TONES[app.skin] || SKIN_TONES[1] : SKIN_TONES[1];
  const feet = eq.feet ? pieceColor(eq.feet, type) : '#3a2e24';
  const trimR = Math.max(eq.chest?.rarity || 0, eq.head?.rarity || 0, eq.legs?.rarity || 0);
  const metal = METAL[(eq.chest?.tier || 1) - 1];
  const accent = trimR >= 2 ? TRIM[trimR + 1 > 5 ? 5 : trimR + 1] : fac.color;
  const spec = {
    rig: 'humanoid',
    hero: true,
    scale: 1.05,
    skin: SKIN_TONES[app.skin ?? 1] || app.skin,
    hair: HAIR_COLORS[app.hair ?? 1] || app.hair,
    hairStyle: app.hairStyle ?? 0,
    beard: app.beard ? HAIR_COLORS[app.hair ?? 1] : null,
    body: chest,
    arms: type === 'cloth' ? chest : eq.chest ? chest : shade(base, 0.9),
    legs,
    gloves: hands,
    boots: feet,
    tabard: fac.color,
    beltColor: type === 'plate' ? '#4a3a2a' : '#3a2a1e',
    cape: factionCape(fac.id, cls),
    bracers: eq.hands && type !== 'cloth' ? hands : null,
  };
  switch (cls) {
    case 'guerrier':
      spec.shoulders = { style: azur ? 'plate' : 'spiked', color: eq.chest ? metal : '#8a8a90', accent };
      spec.gorget = eq.chest ? shade(metal, 0.85) : '#6a6a70';
      break;
    case 'templier':
      spec.shoulders = { style: 'winged', color: eq.chest ? metal : '#c8ccd4', accent: '#e8c860' };
      spec.gorget = '#e8c860';
      spec.tabard = '#f4ecd8';
      spec.tabardLong = '#f4ecd8';
      spec.backItem = 'sundisc';
      spec.backColors = { accent: '#e8c860' };
      spec.beltColor = '#8a6a2a';
      break;
    case 'mage':
      spec.shoulders = { style: 'mantle', color: shade(chest, 0.8), accent: '#d9a441' };
      spec.collar = shade(chest, 0.7);
      spec.skirt = { style: 'robe', color: chest, trim: '#d9a441' };
      spec.tabard = null;
      break;
    case 'necro':
      spec.shoulders = { style: 'bone', color: shade(chest, 0.7), accent: '#8a7ab8' };
      spec.collar = '#1e1a28';
      spec.skirt = { style: 'tattered', color: shade(chest, 0.75) };
      spec.tabard = null;
      break;
    case 'archer':
      spec.shoulders = { style: 'pads', color: shade(chest, 0.85), accent: '#3a2a1e' };
      spec.hoodDown = azur ? '#3a5a3a' : '#5a3a22';
      spec.pouches = '#5a3e28';
      break;
    case 'assassin':
      spec.shoulders = { style: 'pads', color: '#2e2a2c', accent: fac.color };
      spec.hoodDown = '#26222a';
      spec.scarf = azur ? '#2a4f94' : '#8a2418';
      if (!eq.head) spec.faceMask = '#1e1b20';
      spec.backItem = 'sheaths';
      spec.backColors = { accent: '#c9ced6' };
      spec.tabard = null;
      break;
    case 'druide':
      spec.shoulders = { style: 'leaf' };
      spec.skirt = { style: 'short', color: '#3f6a3a', trim: '#8a6440' };
      spec.circlet = '#6b4a2e';
      spec.circletGem = '#8fe86a';
      break;
    case 'chaman':
      spec.shoulders = { style: 'fur', color: '#8a6a4a' };
      spec.necklace = true;
      spec.backItem = 'totem';
      spec.pouches = '#6a4a2e';
      spec.tabard = fac.color;
      break;
  }
  if (trimR >= 3) spec.fur = TRIM[trimR];
  if (eq.head) {
    spec.helmet = CLASSES[cls].helmet;
    spec.helmetColor = type === 'plate' ? METAL[eq.head.tier - 1] : PAL[type][eq.head.tier - 1];
    spec.helmetAccent = TRIM[Math.min(5, (eq.head.rarity || 0) + 1)];
    spec.plume = cls === 'templier' ? '#f4ecd8' : fac.color;
    if (cls === 'mage' || cls === 'necro') spec.helmetColor = PAL.cloth[eq.head.tier - 1];
    if (cls === 'chaman') spec.helmetColor = '#8a6a4a';
  }
  return spec;
}

export function weaponVisual(data) {
  const eq = data.equip || {};
  const cls = CLASSES[data.cls] || CLASSES.guerrier;
  const w = eq.weapon;
  const tier = w ? w.tier || 1 : 1;
  const type = w?.visual || cls.weapons[0];
  const oh = eq.offhand;
  const glowOf = (it) => (it ? RARITY_GLOW[it.rarity || 0] || ((it.tier || 1) >= 5 ? GEMS[(it.tier || 1) - 1] : null) : null);
  return {
    type,
    colors: { metal: METAL[tier - 1], wood: tier >= 5 ? '#3a2a30' : '#6b4a2e', gem: GEMS[tier - 1], accent: TRIM[Math.min(5, (w?.rarity || 0) + 1)], glow: glowOf(w) },
    offhand: oh ? oh.visual || cls.offhand : cls.id === 'archer' ? 'quiver' : null,
    offColors: {
      color: FACTIONS[data.faction]?.color || '#3b6fd8', metal: METAL[(oh?.tier || 1) - 1], accent: TRIM[Math.min(5, (oh?.rarity || 0) + 1)],
      gem: GEMS[(oh?.tier || 1) - 1], glow: glowOf(oh), wood: '#6b4a2e',
    },
  };
}

export function buildCharacterModel(data) {
  const m = createModel(characterSpec(data));
  const v = weaponVisual(data);
  m.setWeapon(v.type, v.colors);
  if (v.offhand) m.setOffhand(v.offhand, v.offColors);
  return m;
}
