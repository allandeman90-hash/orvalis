// Caractéristiques de base des 8 classes (valeurs au niveau 1 + gain par niveau).
export const CLASSES = {
  guerrier: {
    id: 'guerrier', name: 'Guerrier', role: 'Tank ou dégâts', roleKey: 'tank', color: '#c8763a', primary: 'str',
    desc: "Au contact, il encaisse les coups et protège ses alliés. Armure lourde, bouclier et provocations.",
    base: { str: 12, sta: 13, agi: 6, int: 3, wis: 4 },
    grow: { str: 2.1, sta: 2.1, agi: 0.6, int: 0.2, wis: 0.3 },
    hpMul: 1.18, mpMul: 0.7, armorMul: 1.25, range: 'mêlée',
    weapons: ['sword', 'axe', 'mace'], offhand: 'shield', helmet: 'plate', armorType: 'Plaques',
  },
  templier: {
    id: 'templier', name: 'Templier', role: 'Tank, soigneur ou dégâts', roleKey: 'tank', color: '#f0c850', primary: 'str', healStat: 'wis',
    desc: "Chevalier d'un ordre solaire. Tient la ligne sous son bouclier, protège et soigne ses compagnons par la lumière.",
    base: { str: 11, sta: 12, agi: 4, int: 5, wis: 9 },
    grow: { str: 1.9, sta: 2.0, agi: 0.4, int: 0.5, wis: 1.3 },
    hpMul: 1.15, mpMul: 0.9, armorMul: 1.22, range: 'mêlée',
    weapons: ['warhammer', 'sword'], offhand: 'shield', helmet: 'crest', armorType: 'Plaques',
  },
  mage: {
    id: 'mage', name: 'Mage', role: 'Dégâts magiques', roleKey: 'dps', color: '#8f7bff', primary: 'int',
    desc: "Maître du feu, du givre et de l'arcane. Dégâts de zone dévastateurs, mais fragile.",
    base: { str: 3, sta: 8, agi: 5, int: 14, wis: 8 },
    grow: { str: 0.2, sta: 1.25, agi: 0.5, int: 2.6, wis: 1.1 },
    hpMul: 1.0, mpMul: 1.2, armorMul: 0.9, range: 'distance',
    weapons: ['staff'], offhand: 'orb', helmet: 'wizard', armorType: 'Tissu',
  },
  necro: {
    id: 'necro', name: 'Nécromancien', role: 'Dégâts, invocations ou tank', roleKey: 'dps', color: '#a8a4d8', primary: 'int',
    desc: "Il commande aux morts. Malédictions, drains de vie et une armée de squelettes pour faire le travail à sa place.",
    base: { str: 3, sta: 9, agi: 4, int: 13, wis: 8 },
    grow: { str: 0.2, sta: 1.35, agi: 0.4, int: 2.45, wis: 1.1 },
    hpMul: 1.02, mpMul: 1.15, armorMul: 0.9, range: 'distance',
    weapons: ['scythe', 'staff'], offhand: 'tome', helmet: 'cowl', armorType: 'Tissu',
  },
  archer: {
    id: 'archer', name: 'Chasseur', role: 'Dégâts à distance, avec son familier', roleKey: 'dps', color: '#6fbf4a', primary: 'agi',
    desc: "Tireur mobile et précis, jamais sans son familier. Pièges, poisons, volées de flèches et bêtes apprivoisées qui tiennent le rôle de tank, de dégâts ou de soigneur.",
    base: { str: 5, sta: 9, agi: 14, int: 4, wis: 5 },
    grow: { str: 0.6, sta: 1.4, agi: 2.6, int: 0.3, wis: 0.5 },
    hpMul: 1.0, mpMul: 0.9, armorMul: 1.0, range: 'distance',
    weapons: ['bow'], offhand: 'quiver', helmet: 'hood', armorType: 'Cuir',
  },
  assassin: {
    id: 'assassin', name: 'Assassin', role: 'Dégâts au corps à corps', roleKey: 'dps', color: '#e05a78', primary: 'agi',
    desc: "Lames jumelles, poisons et ombres. Frappe là où ça fait mal, disparaît avant la riposte.",
    base: { str: 6, sta: 10, agi: 14, int: 3, wis: 4 },
    grow: { str: 0.7, sta: 1.55, agi: 2.55, int: 0.2, wis: 0.3 },
    hpMul: 1.04, mpMul: 0.8, armorMul: 1.0, range: 'mêlée',
    weapons: ['dagger'], offhand: 'dagger', helmet: 'mask', armorType: 'Cuir',
  },
  druide: {
    id: 'druide', name: 'Druide', role: 'Soigneur, dégâts ou tank', roleKey: 'heal', color: '#3fbf9f', primary: 'int', healStat: 'wis',
    desc: "Gardien de la nature. Soins, régénérations et entraves, avec quelques orages en réserve.",
    base: { str: 4, sta: 10, agi: 5, int: 10, wis: 13 },
    grow: { str: 0.3, sta: 1.55, agi: 0.5, int: 1.6, wis: 2.4 },
    hpMul: 1.0, mpMul: 1.15, armorMul: 0.95, range: 'distance',
    weapons: ['scepter', 'staff'], offhand: 'relic', helmet: 'antlers', armorType: 'Cuir',
  },
  chaman: {
    id: 'chaman', name: 'Chaman', role: 'Soigneur ou dégâts', roleKey: 'heal', color: '#2ab5ff', primary: 'int', healStat: 'wis',
    desc: "Il parle aux esprits des éléments. Totems, vagues de soins et arcs électriques qui sautent d'ennemi en ennemi.",
    base: { str: 6, sta: 11, agi: 4, int: 10, wis: 12 },
    grow: { str: 0.6, sta: 1.6, agi: 0.4, int: 1.6, wis: 2.2 },
    hpMul: 1.05, mpMul: 1.1, armorMul: 1.05, range: 'distance',
    weapons: ['totemmace', 'axe'], offhand: 'fetish', helmet: 'pelt', armorType: 'Mailles',
  },
};
export const CLASS_LIST = ['guerrier', 'templier', 'mage', 'necro', 'archer', 'assassin', 'druide', 'chaman'];

// Rôles de groupe (recherche de donjon, IA des bots)
export const ROLE_OF = Object.fromEntries(CLASS_LIST.map((c) => [c, CLASSES[c].roleKey]));
export const ROLE_NAMES = { tank: 'Tank', heal: 'Soigneur', dps: 'Dégâts' };
export const isMeleeClass = (cls) => cls === 'guerrier' || cls === 'templier' || cls === 'assassin';
export const isHealerClass = (cls) => cls === 'druide' || cls === 'chaman';
export const isTankClass = (cls) => cls === 'guerrier' || cls === 'templier';
// classes dont la puissance dépend de l'intelligence ET de la sagesse
export const HYBRID_CASTER = { druide: true, chaman: true };

export const STAT_NAMES = {
  str: 'Force', sta: 'Endurance', agi: 'Agilité', int: 'Intelligence', wis: 'Sagesse',
  armor: 'Armure', power: 'Puissance', crit: 'Critique', haste: 'Hâte', hp: 'Vie', mp: 'Mana',
  block: 'Blocage', speed: 'Vitesse', regen: 'Régénération', heal: 'Soins', leech: 'Vol de vie', fortune: 'Fortune',
};
