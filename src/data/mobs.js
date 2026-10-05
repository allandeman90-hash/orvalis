// Bestiaire original d'Orvalis. Chaque créature : niveaux, zone, modèle en blocs, style de combat, capacités.
// hp/dmg/armor sont des multiplicateurs appliqués aux courbes de base (voir combat.js).

const M = [];
const def = (o) => M.push({
  hp: 1, dmg: 1, armor: 1, speed: 5.2, atkRange: 2.3, atkSpeed: 2.0, aggro: 11, social: true, kind: 'melee',
  family: 'bête', abilities: [], xp: 1, ...o,
});

// ============================ VAL D'AZUR (1-6) ============================
def({ id: 'lievre_cornu', name: 'Lièvre cornu', lvl: [1, 2], zone: 'val', aggro: 0, social: false, hp: 0.6, dmg: 0.6, speed: 6.5, xp: 0.7,
  model: { rig: 'quadruped', color: '#b89a74', belly: '#e8dcc4', len: 0.55, wid: 0.32, hgt: 0.3, legH: 0.22, legW: 0.09, headS: 0.26, ears: 'long', tail: 'short', horn: '#efe6d0', snoutL: 0.1 } });
def({ id: 'loup_pres', name: 'Loup des prés', lvl: [1, 3], zone: 'val', speed: 6, abilities: ['bleed'],
  model: { rig: 'quadruped', color: '#8a8a8e', belly: '#c8c8cc', dark: '#5a5a60', len: 1.2, wid: 0.45, hgt: 0.46, legH: 0.48, headS: 0.36, ears: 'pointy', tail: 'long', snoutL: 0.26, eyes: '#e8c040' } });
def({ id: 'sanglier_roux', name: 'Sanglier roux', lvl: [2, 4], zone: 'val', hp: 1.2, abilities: ['charge'],
  model: { rig: 'quadruped', color: '#8a5a3a', belly: '#a87a5a', dark: '#4a2e1e', len: 1.15, wid: 0.62, hgt: 0.6, legH: 0.34, legW: 0.15, headS: 0.44, ears: 'round', tail: 'short', tusks: true, mane: '#4a2e1e', snoutL: 0.2 } });
def({ id: 'grignoteur', name: 'Grignoteur des champs', lvl: [2, 4], zone: 'val', hp: 0.85, speed: 5.8, drop: 'queue_grignoteur',
  model: { rig: 'quadruped', color: '#9a8468', belly: '#d8c8a8', dark: '#6a5438', len: 0.8, wid: 0.44, hgt: 0.4, legH: 0.2, legW: 0.1, headS: 0.34, ears: 'round', tail: 'long', tailL: 0.6, snoutL: 0.16, eyes: '#111' } });
def({ id: 'gelee_verte', name: 'Gelée des champs', lvl: [3, 5], zone: 'val', hp: 1.1, dmg: 0.9, speed: 3.8, family: 'gelée', abilities: ['poison'],
  model: { rig: 'blob', color: '#6ad06a', transparent: true, scale: 1.1 } });
def({ id: 'brigand', name: 'Brigand du Moulin', lvl: [4, 6], zone: 'val', family: 'humanoïde', drop: 'sceau_brigand',
  model: { rig: 'humanoid', skin: '#d8a880', body: '#6a5440', legs: '#4a3a2a', arms: '#6a5440', hood: '#4a3c30', mask: '#2a2420', weapon: 'dagger' } });
def({ id: 'brigand_arbaletrier', name: 'Brigand arbalétrier', lvl: [4, 6], zone: 'val', family: 'humanoïde', kind: 'ranged', atkRange: 20, projectile: 'bolt', hp: 0.85, drop: 'sceau_brigand',
  model: { rig: 'humanoid', skin: '#c89870', body: '#5a4a3a', legs: '#3a2e22', hood: '#5a3a2a', weapon: 'bow' } });
def({ id: 'croc_balafre', name: 'Croc-Balafré', lvl: [6, 6], zone: 'val', elite: true, named: true, speed: 6.2, abilities: ['bleed', 'howl'],
  model: { rig: 'quadruped', color: '#5a5a62', belly: '#9a9aa0', dark: '#2a2a30', len: 1.6, wid: 0.6, hgt: 0.6, legH: 0.62, headS: 0.46, ears: 'pointy', tail: 'long', snoutL: 0.32, eyes: '#ff4020', mane: '#3a3a40', scale: 1.25 } });

// ============================ TERRES DE BRAISE (1-6) ============================
def({ id: 'lezard_sables', name: 'Lézard des sables', lvl: [1, 2], zone: 'terres', aggro: 0, social: false, hp: 0.6, dmg: 0.6, speed: 6.2, xp: 0.7,
  model: { rig: 'quadruped', color: '#c8a060', belly: '#e8d0a0', dark: '#8a6a3a', len: 0.8, wid: 0.3, hgt: 0.2, legH: 0.16, legW: 0.08, headS: 0.22, tail: 'long', tailL: 0.7, snoutL: 0.16, ears: 'none' } });
def({ id: 'hyene', name: 'Hyène galeuse', lvl: [1, 3], zone: 'terres', speed: 6, abilities: ['bleed'],
  model: { rig: 'quadruped', color: '#b08a5a', belly: '#d0b080', dark: '#5a3e24', len: 1.15, wid: 0.44, hgt: 0.5, legH: 0.5, headS: 0.38, ears: 'round', tail: 'short', snoutL: 0.22, spots: '#4a3020', mane: '#4a3020', eyes: '#e0a020' } });
def({ id: 'scorpion_ocre', name: 'Scorpion ocre', lvl: [2, 4], zone: 'terres', hp: 1.15, abilities: ['poison'], drop: 'dard_scorpion',
  model: { rig: 'insect', scorpion: true, color: '#c07a3a', dark: '#8a4a1e', eyes: '#1a1a1a', stinger: '#f0d040' } });
def({ id: 'vautour', name: 'Vautour charognard', lvl: [2, 4], zone: 'terres', hp: 0.85, speed: 6.5, family: 'bête',
  model: { rig: 'flyer', color: '#4a3a34', wing: '#3a2e2a', beak: '#d9a441', neck: '#e0b8a0', span: 1.3, eyes: '#111', hover: 2.4 } });
def({ id: 'gelee_braise', name: 'Gelée de braise', lvl: [3, 5], zone: 'terres', hp: 1.1, dmg: 0.9, speed: 3.8, family: 'gelée', abilities: ['burn'],
  model: { rig: 'blob', color: '#ff8a3a', transparent: true, scale: 1.1 } });
def({ id: 'pillard', name: 'Pillard des dunes', lvl: [4, 6], zone: 'terres', family: 'humanoïde', drop: 'insigne_pillard',
  model: { rig: 'humanoid', skin: '#a87a5a', body: '#c8a878', legs: '#8a6a4a', helmet: 'bandana', helmetColor: '#e8e0c8', mask: '#c8b898', weapon: 'sword', weaponColors: { metal: '#d8d0c0' } } });
def({ id: 'pillard_lanceur', name: 'Pillard lanceur', lvl: [4, 6], zone: 'terres', family: 'humanoïde', kind: 'ranged', atkRange: 18, projectile: 'javelin', hp: 0.85, drop: 'insigne_pillard',
  model: { rig: 'humanoid', skin: '#9a6a4a', body: '#b89868', legs: '#7a5a3a', helmet: 'bandana', helmetColor: '#c83a2a', weapon: 'spear' } });
def({ id: 'machoire_fer', name: 'Mâchoire-de-Fer', lvl: [6, 6], zone: 'terres', elite: true, named: true, speed: 6.2, abilities: ['bleed', 'howl'],
  model: { rig: 'quadruped', color: '#8a6a4a', belly: '#b89a70', dark: '#3a2a1a', len: 1.6, wid: 0.62, hgt: 0.64, legH: 0.6, headS: 0.5, ears: 'round', tail: 'short', snoutL: 0.3, spots: '#2a1a10', mane: '#2a1a10', eyes: '#ff3020', scale: 1.25, snoutColor: '#9aa0a8' } });

// ============================ BOIS-MURMURE (6-12) ============================
def({ id: 'araignee', name: 'Araignée sylvestre', lvl: [6, 8], zone: 'bois', abilities: ['poison', 'web'], drop: 'glande_venin',
  model: { rig: 'insect', color: '#3a4a2a', dark: '#2a3420', mark: '#c8d040', eyes: '#ff3030' } });
def({ id: 'ours', name: 'Ours des fougères', lvl: [7, 9], zone: 'bois', hp: 1.35, dmg: 1.15, speed: 5.4, abilities: ['maul'], drop: 'peau_ours',
  model: { rig: 'quadruped', color: '#5a3e2a', belly: '#7a5a3e', dark: '#3a2618', len: 1.5, wid: 0.8, hgt: 0.8, legH: 0.5, legW: 0.22, headS: 0.5, ears: 'round', tail: 'short', snoutL: 0.24, scale: 1.1 } });
def({ id: 'gobelin', name: 'Gobelin des souches', lvl: [8, 10], zone: 'bois', family: 'humanoïde', drop: 'babiole_gobeline',
  model: { rig: 'humanoid', head: 'goblin', skin: '#6aa84a', body: '#7a5a3a', legs: '#5a4028', weapon: 'club', scale: 0.78, prop: { headS: 0.54 } } });
def({ id: 'gobelin_mystique', name: 'Gobelin mystique', lvl: [8, 10], zone: 'bois', family: 'humanoïde', kind: 'caster', atkRange: 18, projectile: 'nature', hp: 0.8, abilities: ['heal'], drop: 'babiole_gobeline',
  model: { rig: 'humanoid', head: 'goblin', skin: '#7ab85a', body: '#4a6a8a', legs: '#3a4a5a', weapon: 'staff', weaponColors: { gem: '#9fff70' }, helmet: 'antlers', scale: 0.78, prop: { headS: 0.54 } } });
def({ id: 'sylvain', name: 'Sylvain corrompu', lvl: [10, 12], zone: 'bois', family: 'plante', hp: 1.4, dmg: 1.1, speed: 4.2, abilities: ['root'], drop: 'coeur_seve',
  model: { rig: 'humanoid', head: 'treant', skin: '#5a4a34', body: '#5a4a34', legs: '#4a3a28', arms: '#5a4a34', gloves: '#4a3a28', boots: '#3a2a1e', belt: false, scale: 1.45, bigHands: true, fur: '#4f7a30' } });
def({ id: 'grincedent', name: 'Chef Grincedent', lvl: [11, 11], zone: 'bois', elite: true, named: true, family: 'humanoïde', abilities: ['enrage', 'howl'],
  model: { rig: 'humanoid', head: 'goblin', skin: '#5a984a', body: '#8a3a2a', legs: '#4a3020', weapon: 'axe', helmet: 'horned', helmetColor: '#6a6a70', scale: 1.0, prop: { headS: 0.54 }, pauldrons: '#6a6a70' } });
def({ id: 'tisseuse', name: 'La Tisseuse', lvl: [12, 12], zone: 'bois', boss: true, named: true, abilities: ['poison', 'web', 'summon_spiders', 'nova_poison'],
  model: { rig: 'insect', color: '#2a2a3a', dark: '#1a1a26', mark: '#b040ff', eyes: '#ff40ff', scale: 2.6 } });

// ============================ CANYON DES SCORIES (6-12) ============================
def({ id: 'kobold', name: 'Kobold fouisseur', lvl: [6, 8], zone: 'canyon', family: 'humanoïde', drop: 'bougie_kobold',
  model: { rig: 'humanoid', head: 'kobold', skin: '#a86a4a', body: '#6a5a4a', legs: '#4a3a2a', weapon: 'pick', tail: true, tailColor: '#a86a4a', scale: 0.72, helmet: 'circlet', helmetAccent: '#6a6a6a', gem: '#ffd060', prop: { headS: 0.5 } } });
def({ id: 'kobold_dynamiteur', name: 'Kobold dynamiteur', lvl: [7, 9], zone: 'canyon', family: 'humanoïde', kind: 'ranged', atkRange: 16, projectile: 'bomb', hp: 0.8, abilities: ['bomb'], drop: 'bougie_kobold',
  model: { rig: 'humanoid', head: 'kobold', skin: '#8a5a3a', body: '#8a3a2a', legs: '#4a3a2a', weapon: 'torch', tail: true, tailColor: '#8a5a3a', scale: 0.72, prop: { headS: 0.5 } } });
def({ id: 'chauve_souris', name: 'Chauve-souris des failles', lvl: [7, 9], zone: 'canyon', hp: 0.8, speed: 6.8, abilities: ['drain'],
  model: { rig: 'flyer', color: '#3a2a34', wing: '#4a3440', ears: true, span: 1.0, eyes: '#ff3030', hover: 2.0 } });
def({ id: 'salamandre', name: 'Salamandre de scories', lvl: [8, 10], zone: 'canyon', hp: 1.1, abilities: ['firebreath'], drop: 'glande_ignee',
  model: { rig: 'quadruped', color: '#c84a2a', belly: '#f0a040', dark: '#6a2010', len: 1.4, wid: 0.44, hgt: 0.32, legH: 0.24, legW: 0.12, headS: 0.34, tail: 'long', tailL: 1.0, ears: 'none', snoutL: 0.2, spikes: '#f0c040', eyes: '#ffe040' } });
def({ id: 'golem_scories', name: 'Golem de scories', lvl: [10, 12], zone: 'canyon', family: 'élémentaire', hp: 1.5, dmg: 1.15, armor: 1.5, speed: 4, abilities: ['stomp'], drop: 'noyau_scorie',
  model: { rig: 'humanoid', head: 'golem', skin: '#5a4a44', body: '#4a3e3a', legs: '#4a3e3a', arms: '#5a4a44', gloves: '#3a302c', boots: '#3a302c', belt: false, core: '#ff8a2a', cracks: true, scale: 1.4, bigHands: true, prop: { torsoW: 0.8, legW: 0.3, armW: 0.26 } } });
def({ id: 'grand_meche', name: 'Grand-Mèche', lvl: [11, 11], zone: 'canyon', elite: true, named: true, family: 'humanoïde', kind: 'ranged', atkRange: 18, projectile: 'bomb', abilities: ['bomb', 'enrage'],
  model: { rig: 'humanoid', head: 'kobold', skin: '#6a4a3a', body: '#3a3a4a', legs: '#2a2a34', weapon: 'torch', tail: true, tailColor: '#6a4a3a', helmet: 'crown', helmetAccent: '#d9a441', scale: 0.95, prop: { headS: 0.5 } } });
def({ id: 'coeur_magma', name: 'Cœur-de-Magma', lvl: [12, 12], zone: 'canyon', boss: true, named: true, family: 'élémentaire', armor: 1.6, speed: 3.8, abilities: ['stomp', 'meteor', 'enrage'],
  model: { rig: 'humanoid', head: 'golem', skin: '#3a2a26', body: '#2e2220', legs: '#2e2220', arms: '#3a2a26', gloves: '#1e1614', boots: '#1e1614', belt: false, core: '#ffb030', scale: 2.4, bigHands: true, emissive: '#3a1004', prop: { torsoW: 0.84, legW: 0.3, armW: 0.28 } } });

// ============================ MARAIS DE VASEGRISE (12-18) ============================
def({ id: 'crapoussin', name: 'Crapoussin guerrier', lvl: [12, 14], zone: 'marais', family: 'humanoïde', drop: 'ecaille_crapoussin',
  model: { rig: 'humanoid', head: 'frog', skin: '#5a8a3a', body: '#6a7a3a', legs: '#4a6a2a', arms: '#5a8a3a', weapon: 'spear', scale: 0.95, belt: true, beltColor: '#6a4a2a', prop: { headS: 0.5 } } });
def({ id: 'crapoussin_sorcier', name: 'Crapoussin sorcier', lvl: [12, 15], zone: 'marais', family: 'humanoïde', kind: 'caster', atkRange: 18, projectile: 'swamp', hp: 0.8, abilities: ['heal', 'slowbolt'], drop: 'ecaille_crapoussin',
  model: { rig: 'humanoid', head: 'frog', skin: '#4a7a5a', body: '#5a4a6a', legs: '#3a3a4a', weapon: 'staff', weaponColors: { gem: '#c0f060' }, helmet: 'antlers', scale: 0.9, prop: { headS: 0.5 } } });
def({ id: 'crocodile', name: 'Crocodile des vases', lvl: [13, 15], zone: 'marais', hp: 1.3, dmg: 1.1, speed: 4.6, abilities: ['maul'], drop: 'cuir_croco',
  model: { rig: 'quadruped', color: '#4a5a34', belly: '#8a8a5a', dark: '#2a3420', len: 2.2, wid: 0.66, hgt: 0.36, legH: 0.22, legW: 0.16, headS: 0.4, headL: 0.5, snoutL: 0.6, tail: 'thick', tailL: 0.9, ears: 'none', spikes: '#2a3420', eyes: '#f0d040' } });
def({ id: 'sangsue', name: 'Sangsue géante', lvl: [14, 16], zone: 'marais', hp: 1.1, speed: 3.8, abilities: ['drain'], drop: 'sang_sangsue',
  model: { rig: 'worm', color: '#4a3a3a', scale: 1.25 } });
def({ id: 'feu_follet', name: 'Feu-follet des tourbières', lvl: [15, 17], zone: 'marais', family: 'esprit', kind: 'caster', atkRange: 18, projectile: 'wisp', hp: 0.75, abilities: ['blink'], drop: 'lueur_follet',
  model: { rig: 'floater', kind: 'wisp', color: '#9aff9a', hover: 1.6, bits: 3 } });
def({ id: 'sorciere', name: 'Sorcière des tourbières', lvl: [17, 17], zone: 'marais', elite: true, named: true, family: 'humanoïde', kind: 'caster', atkRange: 20, projectile: 'swamp', abilities: ['heal', 'slowbolt', 'summon_wisps'],
  model: { rig: 'humanoid', skin: '#9aa87a', body: '#3a4a2a', legs: '#2a3420', arms: '#3a4a2a', helmet: 'wizard', helmetColor: '#2a3420', helmetAccent: '#8a6a3a', hair: '#c8c8c0', hairStyle: 1, weapon: 'staff', weaponColors: { gem: '#9aff9a', wood: '#3a2a1a' }, cape: '#2a3420', hunch: true } });
def({ id: 'mere_vase', name: 'Mère Vase', lvl: [18, 18], zone: 'marais', boss: true, named: true, speed: 3.6, abilities: ['stomp', 'poison', 'summon_frogs', 'nova_poison'],
  model: { rig: 'quadruped', color: '#5a7a3a', belly: '#c8c890', dark: '#3a5a2a', len: 1.6, wid: 1.6, hgt: 1.0, legH: 0.35, legW: 0.3, headS: 1.1, headL: 0.8, snout: false, tail: 'none', ears: 'none', spots: '#3a4a20', eyes: '#f0d040', headUp: 0.3, scale: 2.4 } });

// ============================ CŒUR D'ORVALIS (18-24) ============================
def({ id: 'squelette', name: 'Squelette légionnaire', lvl: [18, 20], zone: 'coeur', family: 'mort-vivant', drop: 'os_ancien',
  model: { rig: 'humanoid', bone: true, head: 'skull', skin: '#e6dfcd', armor: '#7a6a5a', weapon: 'sword', weaponColors: { metal: '#8a8a80' }, offhand: 'buckler', offhandColors: { color: '#6a5a4a' }, glowEyes: '#7fe0ff' } });
def({ id: 'squelette_archer', name: 'Squelette archer', lvl: [18, 21], zone: 'coeur', family: 'mort-vivant', kind: 'ranged', atkRange: 22, projectile: 'arrow', hp: 0.85, drop: 'os_ancien',
  model: { rig: 'humanoid', bone: true, head: 'skull', skin: '#ddd4c0', weapon: 'bow', glowEyes: '#7fe0ff', hood: '#4a4038' } });
def({ id: 'spectre', name: 'Spectre errant', lvl: [20, 22], zone: 'coeur', family: 'mort-vivant', kind: 'caster', atkRange: 16, projectile: 'shadow', hp: 0.9, abilities: ['drain', 'blink'], drop: 'ectoplasme',
  model: { rig: 'humanoid', head: 'ghost', floating: true, skin: '#b8e8e0', body: '#8ac8c0', arms: '#8ac8c0', gloves: '#b8e8e0', opacity: 0.62, emissive: '#1a4a44', glowEyes: '#e0fff8', claws: true } });
def({ id: 'gargouille', name: 'Gargouille de ruine', lvl: [21, 23], zone: 'coeur', family: 'élémentaire', hp: 1.25, armor: 1.4, abilities: ['leap'], drop: 'eclat_gargouille',
  model: { rig: 'humanoid', head: 'imp', skin: '#8a8a88', body: '#7a7a78', legs: '#6a6a68', arms: '#7a7a78', gloves: '#5a5a58', boots: '#5a5a58', belt: false, wings: '#6a6a6a', hunch: true, claws: true, horns: '#4a4a4a', scale: 1.1 } });
def({ id: 'chevalier_maudit', name: 'Chevalier maudit', lvl: [23, 23], zone: 'coeur', elite: true, named: true, family: 'mort-vivant', abilities: ['slam', 'drain', 'enrage'],
  model: { rig: 'humanoid', head: 'skull', skin: '#cfc6b0', body: '#3a3a44', legs: '#2a2a34', arms: '#3a3a44', gloves: '#2a2a30', boots: '#2a2a30', helmet: 'plate', helmetColor: '#3a3a44', helmetAccent: '#7a3aff', plume: '#5a2aa0', weapon: 'greatsword', weaponColors: { metal: '#8a7aff' }, cape: '#2a1a3a', pauldrons: '#3a3a44', glowEyes: '#b58cff', scale: 1.25 } });
def({ id: 'ossevaine', name: 'Ossevaine, la Reine-Liche', lvl: [24, 24], zone: 'coeur', boss: true, named: true, family: 'mort-vivant', kind: 'caster', atkRange: 22, projectile: 'shadow', abilities: ['nova_frost', 'summon_skeletons', 'meteor', 'drain'],
  model: { rig: 'humanoid', head: 'skull', skin: '#e0d8c4', body: '#2a1a3a', legs: '#1a1026', arms: '#2a1a3a', helmet: 'crown', helmetAccent: '#b58cff', weapon: 'staff', weaponColors: { gem: '#b58cff', wood: '#2a2030' }, cape: '#1a1026', glowEyes: '#d0a0ff', floating: true, scale: 1.7, emissive: '#1a0a2a' } });

// ============================ PICS GELÉS (24-27) ============================
def({ id: 'loup_neiges', name: 'Loup des neiges', lvl: [24, 25], zone: 'pics', speed: 6.2, abilities: ['bleed', 'howl'], drop: 'fourrure_givre',
  model: { rig: 'quadruped', color: '#e0e6ee', belly: '#ffffff', dark: '#9aa8b8', len: 1.3, wid: 0.5, hgt: 0.52, legH: 0.52, headS: 0.4, ears: 'pointy', tail: 'long', snoutL: 0.28, eyes: '#40a0ff', scale: 1.05 } });
def({ id: 'yeti', name: 'Yéti des cimes', lvl: [25, 26], zone: 'pics', family: 'bête', hp: 1.4, dmg: 1.15, abilities: ['stomp', 'maul'], drop: 'fourrure_givre',
  model: { rig: 'humanoid', head: 'yeti', skin: '#eef2f6', body: '#e4eaf0', legs: '#d8e0e8', arms: '#e4eaf0', gloves: '#8aa4c0', boots: '#8aa4c0', belt: false, hunch: true, bigHands: true, scale: 1.55, prop: { torsoW: 0.72, armL: 0.72, armW: 0.22 } } });
def({ id: 'elementaire_givre', name: 'Élémentaire de givre', lvl: [25, 27], zone: 'pics', family: 'élémentaire', kind: 'caster', atkRange: 18, projectile: 'frost', abilities: ['slowbolt', 'nova_frost'], drop: 'eclat_givre',
  model: { rig: 'floater', kind: 'crystal', color: '#9fdcff', hover: 1.5, bits: 4, bitColor: '#e0f4ff' } });
def({ id: 'troll_glaces', name: 'Troll des glaces', lvl: [26, 27], zone: 'pics', family: 'humanoïde', hp: 1.45, dmg: 1.2, abilities: ['regen', 'slam'], drop: 'defense_troll',
  model: { rig: 'humanoid', head: 'troll', skin: '#6a9ab8', body: '#8a7a6a', legs: '#5a4a3a', arms: '#6a9ab8', gloves: '#6a9ab8', boots: '#4a3a2a', hair: '#e8f0f8', fur: '#e8e0d0', weapon: 'club', weaponColors: { wood: '#8a8a90' }, hunch: true, scale: 1.5, prop: { armL: 0.75 } } });
def({ id: 'jarl', name: 'Jarl Crocglace', lvl: [27, 27], zone: 'pics', elite: true, named: true, family: 'humanoïde', hp: 1.2, abilities: ['slam', 'nova_frost', 'enrage', 'regen'],
  model: { rig: 'humanoid', head: 'troll', skin: '#4a7a9a', body: '#3a4a5a', legs: '#2a3440', arms: '#4a7a9a', gloves: '#4a7a9a', boots: '#2a3440', hair: '#ffffff', fur: '#f0f0f0', helmet: 'horned', helmetColor: '#8a9aaa', weapon: 'axe', weaponColors: { metal: '#bfe8ff' }, cape: '#2a4a6a', hunch: true, scale: 1.75, prop: { armL: 0.75 } } });

// ============================ DÉSOLATION CENDRÉE (27-30) ============================
def({ id: 'diablotin', name: 'Diablotin de cendre', lvl: [27, 28], zone: 'desolation', family: 'démon', kind: 'caster', atkRange: 18, projectile: 'fire', hp: 0.8, abilities: ['blink'], drop: 'corne_diablotin',
  model: { rig: 'humanoid', head: 'imp', skin: '#c83a2a', body: '#8a2a1a', legs: '#6a1a10', arms: '#c83a2a', gloves: '#c83a2a', boots: '#2a1010', belt: false, wings: '#5a1a14', tail: true, tailColor: '#c83a2a', scale: 0.75, flapAlways: true, prop: { headS: 0.5 } } });
def({ id: 'chien_lave', name: 'Chien de lave', lvl: [27, 29], zone: 'desolation', family: 'démon', speed: 6.2, abilities: ['burn', 'firebreath'], drop: 'croc_lave',
  model: { rig: 'quadruped', color: '#2a2224', belly: '#3a3034', dark: '#1a1414', len: 1.35, wid: 0.5, hgt: 0.52, legH: 0.52, headS: 0.42, ears: 'pointy', tail: 'long', snoutL: 0.26, eyes: '#ffb020', cracks: '#ff7a1a', spikes: '#ff7a1a', emissive: '#1a0600' } });
def({ id: 'golem_obsidienne', name: "Golem d'obsidienne", lvl: [28, 29], zone: 'desolation', family: 'élémentaire', hp: 1.4, dmg: 1.15, armor: 1.5, speed: 4, abilities: ['stomp', 'slam'], drop: 'eclat_obsidienne',
  model: { rig: 'humanoid', head: 'golem', skin: '#2b2830', body: '#221f28', legs: '#221f28', arms: '#2b2830', gloves: '#16141a', boots: '#16141a', belt: false, core: '#b040ff', scale: 1.6, bigHands: true, prop: { torsoW: 0.82, legW: 0.3, armW: 0.27 } } });
def({ id: 'drakonide', name: 'Drakônide', lvl: [28, 30], zone: 'desolation', family: 'dragon', abilities: ['firebreath', 'leap'], drop: 'ecaille_drake',
  model: { rig: 'humanoid', head: 'lizard', skin: '#8a2a2a', body: '#5a1a1a', legs: '#4a1414', arms: '#8a2a2a', gloves: '#8a2a2a', boots: '#3a1010', wings: '#6a1a1a', tail: true, tailColor: '#8a2a2a', weapon: 'spear', weaponColors: { metal: '#e0a040' }, backSpikes: '#e0c080', glowEyes: '#ffd040', pauldrons: '#3a3a3a', scale: 1.2 } });
def({ id: 'vyrmathra', name: 'Vyrmathra, Wyrm de Cendre', lvl: [30, 30], zone: 'desolation', boss: true, named: true, family: 'dragon', speed: 4.5, atkRange: 4.5, abilities: ['firebreath', 'meteor', 'stomp', 'enrage'],
  model: { rig: 'drake', color: '#3a2a2a', belly: '#c86a3a', wing: '#5a2020', horn: '#e0c090', eyes: '#ffb020', scale: 1.9, emissive: '#1a0400' } });

// ============================ CIME DES TEMPÊTES (30) ============================
def({ id: 'harpie', name: 'Harpie des orages', lvl: [30, 30], zone: 'cime', family: 'bête', speed: 6.5, abilities: ['shock'], drop: 'plume_orage',
  model: { rig: 'humanoid', head: 'harpy', skin: '#c8b8a8', body: '#4a5a8a', legs: '#6a6a8a', arms: '#c8b8a8', boots: '#d9a441', wingArms: '#5a6aa0', hair: '#3a4a7a', birdLegs: true, belt: false, flapAlways: true, wings: null } });
def({ id: 'elementaire_foudre', name: 'Élémentaire de foudre', lvl: [30, 30], zone: 'cime', family: 'élémentaire', kind: 'caster', atkRange: 18, projectile: 'lightning', abilities: ['shock', 'blink'], drop: 'coeur_foudre',
  model: { rig: 'floater', kind: 'storm', color: '#5a8aff', core: '#e0f0ff', hover: 1.6, bits: 4, bitColor: '#bfe0ff' } });
def({ id: 'gardien_runique', name: 'Gardien runique', lvl: [30, 30], zone: 'cime', family: 'élémentaire', hp: 1.5, armor: 1.6, dmg: 1.15, speed: 4.2, abilities: ['stomp', 'shock'], drop: 'rune_gardien',
  model: { rig: 'humanoid', head: 'golem', skin: '#6d7482', body: '#5d6474', legs: '#4d5464', arms: '#6d7482', gloves: '#3d4454', boots: '#3d4454', belt: false, core: '#7fd1ff', scale: 1.6, bigHands: true, prop: { torsoW: 0.8, legW: 0.3, armW: 0.26 } } });
def({ id: 'titan', name: 'Titan de pierre', lvl: [30, 30], zone: 'cime', elite: true, family: 'élémentaire', hp: 1.3, armor: 1.5, speed: 4, abilities: ['stomp', 'slam', 'leap'], drop: 'rune_gardien',
  model: { rig: 'humanoid', head: 'golem', skin: '#8a8680', body: '#7a7670', legs: '#6a6660', arms: '#8a8680', gloves: '#5a5650', boots: '#5a5650', belt: false, core: '#7fd1ff', scale: 2.3, bigHands: true, fur: '#5e7a4a', prop: { torsoW: 0.84, legW: 0.32, armW: 0.28 } } });
def({ id: 'azhkar', name: "Azhkar, le Dévoreur d'Orages", lvl: [32, 32], zone: 'cime', boss: true, worldBoss: true, named: true, family: 'dragon', speed: 5, atkRange: 7, abilities: ['firebreath_storm', 'meteor_storm', 'stomp', 'summon_elementals', 'enrage'],
  model: { rig: 'drake', color: '#2a3a6a', belly: '#9ab8e8', wing: '#3a5aa0', horn: '#e8f0ff', eyes: '#9fe8ff', scale: 4.2, emissive: '#081030' } });

// ============================ ÉVÉNEMENTS / DIVERS ============================
def({ id: 'araignee_petite', name: 'Rejeton de la Tisseuse', lvl: [10, 11], zone: 'bois', hp: 0.5, dmg: 0.7, abilities: ['poison'], xp: 0.3,
  model: { rig: 'insect', color: '#2a2a3a', dark: '#1a1a26', mark: '#b040ff', eyes: '#ff40ff', scale: 0.7 } });
def({ id: 'crapoussin_tetard', name: 'Têtard de vase', lvl: [16, 17], zone: 'marais', hp: 0.5, dmg: 0.7, xp: 0.3,
  model: { rig: 'blob', color: '#5a8a3a', scale: 0.8 } });
def({ id: 'squelette_invoque', name: 'Squelette relevé', lvl: [22, 23], zone: 'coeur', family: 'mort-vivant', hp: 0.5, dmg: 0.8, xp: 0.3,
  model: { rig: 'humanoid', bone: true, head: 'skull', skin: '#cfc6b0', weapon: 'sword', glowEyes: '#d0a0ff' } });
def({ id: 'eclair_invoque', name: 'Étincelle d\'orage', lvl: [30, 31], zone: 'cime', family: 'élémentaire', kind: 'caster', atkRange: 16, projectile: 'lightning', hp: 0.45, dmg: 0.7, xp: 0.3,
  model: { rig: 'floater', kind: 'wisp', color: '#9fd0ff', hover: 1.8, bits: 2 } });

// ============================ INVOCATIONS DES JOUEURS ============================
def({ id: 'squelette_serviteur', name: 'Squelette serviteur', lvl: [1, 34], zone: 'none', family: 'mort-vivant', hp: 0.6, dmg: 0.7, speed: 6.8, atkSpeed: 1.6, xp: 0, social: false,
  model: { rig: 'humanoid', bone: true, head: 'skull', skin: '#ded6c2', weapon: 'sword', weaponColors: { metal: '#a8a4d8' }, glowEyes: '#a8a4d8', scale: 0.92 } });
def({ id: 'mage_squelette', name: 'Mage squelette', lvl: [1, 34], zone: 'none', family: 'mort-vivant', kind: 'caster', atkRange: 18, projectile: 'shadow', hp: 0.5, dmg: 0.8, speed: 6.6, atkSpeed: 2.2, xp: 0, social: false,
  model: { rig: 'humanoid', bone: true, head: 'skull', skin: '#d8d0e8', weapon: 'staff', weaponColors: { gem: '#6affc0' }, glowEyes: '#6affc0', scale: 0.92 } });
def({ id: 'loup_chasse', name: 'Loup de chasse', lvl: [1, 34], zone: 'none', family: 'bête', hp: 0.9, dmg: 0.8, speed: 7.2, atkSpeed: 1.5, abilities: ['bleed'], xp: 0, social: false,
  model: { rig: 'quadruped', color: '#7a6450', belly: '#b8a58a', dark: '#4a3a2a', len: 1.25, wid: 0.46, hgt: 0.5, legH: 0.5, headS: 0.38, ears: 'pointy', tail: 'long', snoutL: 0.28, eyes: '#8fe86a' } });
def({ id: 'loup_esprit', name: 'Loup spectral', lvl: [1, 34], zone: 'none', family: 'esprit', hp: 0.8, dmg: 0.85, speed: 7.4, atkSpeed: 1.4, xp: 0, social: false,
  model: { rig: 'quadruped', color: '#6fd8ff', belly: '#bff4ff', dark: '#2a8ac8', len: 1.2, wid: 0.44, hgt: 0.48, legH: 0.5, headS: 0.37, ears: 'pointy', tail: 'long', snoutL: 0.27, eyes: '#ffffff', opacity: 0.72, emissive: '#1a4a6a' } });
def({ id: 'golem_chair', name: 'Golem de chair', lvl: [13, 34], zone: 'none', family: 'mort-vivant', hp: 1.4, dmg: 1.1, speed: 6.2, atkSpeed: 2.2, abilities: ['slam'], xp: 0, social: false,
  model: { rig: 'humanoid', head: 'troll', skin: '#8a9a7a', body: '#6e7a5a', legs: '#5a4a44', arms: '#8a9a7a', gloves: '#6e7a5a', boots: '#3a2e2a', belt: false, hunch: true, bigHands: true, fur: '#5a4a44', scale: 1.35, prop: { torsoW: 0.78, armL: 0.72, armW: 0.24 } } });

export const MOBS = M;
export const MOB_BY_ID = Object.fromEntries(M.map((m) => [m.id, m]));

// Ajout de créatures depuis d'autres modules (donjons, raids)
export function registerMob(o) {
  const d = { hp: 1, dmg: 1, armor: 1, speed: 5.2, atkRange: 2.3, atkSpeed: 2.0, aggro: 11, social: true, kind: 'melee', family: 'bête', abilities: [], xp: 1, zone: 'none', ...o };
  M.push(d);
  MOB_BY_ID[d.id] = d;
  return d;
}

// Objets de quête lâchés par certains monstres (nom affiché)
export const QUEST_ITEMS = {
  queue_grignoteur: 'Queue de grignoteur',
  sceau_brigand: 'Sceau de brigand',
  dard_scorpion: 'Dard de scorpion',
  insigne_pillard: 'Insigne de pillard',
  glande_venin: 'Glande à venin',
  peau_ours: "Peau d'ours",
  babiole_gobeline: 'Babiole gobeline',
  coeur_seve: 'Cœur de sève',
  bougie_kobold: 'Bougie de kobold',
  glande_ignee: 'Glande ignée',
  noyau_scorie: 'Noyau de scorie',
  ecaille_crapoussin: 'Écaille de crapoussin',
  cuir_croco: 'Cuir de crocodile',
  sang_sangsue: 'Fiole de sang de sangsue',
  lueur_follet: 'Lueur de follet',
  os_ancien: 'Os ancien',
  ectoplasme: 'Ectoplasme',
  eclat_gargouille: 'Éclat de gargouille',
  fourrure_givre: 'Fourrure givrée',
  eclat_givre: 'Éclat de givre',
  defense_troll: 'Défense de troll',
  corne_diablotin: 'Corne de diablotin',
  croc_lave: 'Croc de lave',
  eclat_obsidienne: "Éclat d'obsidienne",
  ecaille_drake: 'Écaille de drake',
  plume_orage: "Plume d'orage",
  coeur_foudre: 'Cœur de foudre',
  rune_gardien: 'Rune de gardien',
};
