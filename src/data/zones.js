// Géographie d'Orvalis : 9 régions sur une grille 3x3, frontières montagneuses avec cols.
// X : ouest(-) -> est(+), Z : nord(-) -> sud(+).

import { WORLD_HALF, WORLD_SCALE } from './world-space.js';
export { WORLD_HALF };
export { WORLD_SCALE };
export const BORDER = 170 * WORLD_SCALE;

export const FACTIONS = [
  {
    id: 0, key: 'azur', name: "Pacte d'Azur", short: 'Azur', color: '#4f8dff', dark: '#1f3f7a',
    desc: "Une alliance de cités portuaires et de chevaliers. Discipline, lumière et acier poli. Leur capitale, Havrebleu, veille sur la côte ouest.",
    capital: 'havrebleu',
  },
  {
    id: 1, key: 'braise', name: 'Clans de Braise', short: 'Braise', color: '#ff5a36', dark: '#7a2413',
    desc: "Des clans forgés dans les terres brûlées de l'est. Honneur, feu et force brute. Leur capitale, Forge-Cendre, gronde au pied des mesas.",
    capital: 'forge_cendre',
  },
];

// biome : paramètres de relief et de couleurs (utilisés par terrain.js et decor.js)
export const ZONES = [
  { id: 'cime', name: 'Cime des Tempêtes', col: 1, row: 0, lvl: [30, 30], owner: -1, biome: 'storm',
    desc: "Un haut plateau fouetté par la foudre. Les titans de pierre y gardent l'Autel des Tempêtes." },
  { id: 'pics', name: 'Pics Gelés', col: 0, row: 0, lvl: [24, 27], owner: -1, biome: 'snow',
    desc: 'Des sommets enneigés où rôdent yétis et trolls des glaces.' },
  { id: 'desolation', name: 'Désolation Cendrée', col: 2, row: 0, lvl: [27, 30], owner: -1, biome: 'volcanic',
    desc: 'Cendres, obsidienne et lacs de lave. Le repaire du Wyrm de Cendre.' },
  { id: 'val', name: "Val d'Azur", col: 0, row: 1, lvl: [1, 6], owner: 0, biome: 'meadow',
    desc: "Prairies douces et champs dorés autour de Havrebleu. Terre natale du Pacte d'Azur." },
  { id: 'coeur', name: "Cœur d'Orvalis", col: 1, row: 1, lvl: [18, 24], owner: -1, biome: 'ruins',
    desc: "Les ruines de l'ancien royaume. Le Bastion central y est disputé sans relâche." },
  { id: 'terres', name: 'Terres de Braise', col: 2, row: 1, lvl: [1, 6], owner: 1, biome: 'badlands',
    desc: 'Mesas ocre et savane brûlée autour de Forge-Cendre. Terre natale des Clans de Braise.' },
  { id: 'bois', name: 'Bois-Murmure', col: 0, row: 2, lvl: [6, 12], owner: 0, biome: 'forest',
    desc: 'Une forêt dense où les arbres chuchotent. Gobelins et araignées y prolifèrent.' },
  { id: 'marais', name: 'Marais de Vasegrise', col: 1, row: 2, lvl: [12, 18], owner: -1, biome: 'swamp',
    desc: 'Des tourbières brumeuses, royaume des Crapoussins et de la Mère Vase.' },
  { id: 'canyon', name: 'Canyon des Scories', col: 2, row: 2, lvl: [6, 12], owner: 1, biome: 'canyon',
    desc: 'Des gorges de roche rouge creusées par les kobolds et leurs mines.' },
];

export const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z]));
export const ZONE_GRID = [[], [], []];
for (const z of ZONES) ZONE_GRID[z.row][z.col] = z;

// Cols entre régions. dir 'v' = frontière verticale (x = ±BORDER), 'h' = horizontale (z = ±BORDER)
// at = coordonnée le long de la frontière, hw = demi-largeur du col.
export const PASSES = [
  { dir: 'v', line: -1, at: -335, hw: 22 }, // Pics <-> Cime
  { dir: 'v', line: -1, at: 15, hw: 15 },   // Val <-> Cœur (étroit)
  { dir: 'v', line: -1, at: 318, hw: 24 },  // Bois <-> Marais
  { dir: 'v', line: 1, at: -335, hw: 22 },  // Cime <-> Désolation
  { dir: 'v', line: 1, at: -15, hw: 15 },   // Cœur <-> Terres (étroit)
  { dir: 'v', line: 1, at: 318, hw: 24 },   // Marais <-> Canyon
  { dir: 'h', line: -1, at: -322, hw: 22 }, // Pics <-> Val
  { dir: 'h', line: -1, at: 0, hw: 30 },    // Cime <-> Cœur
  { dir: 'h', line: -1, at: 322, hw: 22 },  // Désolation <-> Terres
  { dir: 'h', line: 1, at: -300, hw: 40 },  // Val <-> Bois
  { dir: 'h', line: 1, at: 0, hw: 34 },     // Cœur <-> Marais
  { dir: 'h', line: 1, at: 300, hw: 40 },   // Terres <-> Canyon
];

// Lieux habités : capitales, villages et avant-postes des deux factions.
export const HUBS = [
  // ---- Pacte d'Azur
  { id: 'havrebleu', name: 'Havrebleu', type: 'capital', faction: 0, zone: 'val', x: -408, z: 18, r: 52 },
  { id: 'clairbourg', name: 'Clairbourg', type: 'village', faction: 0, zone: 'val', x: -292, z: 72, r: 26 },
  { id: 'chenevert', name: 'Poste de Chênevert', type: 'outpost', faction: 0, zone: 'bois', x: -310, z: 290, r: 24 },
  { id: 'fort_roseau', name: 'Fort Roseau', type: 'outpost', faction: 0, zone: 'marais', x: -100, z: 300, r: 24 },
  { id: 'garde_aube', name: "Garde de l'Aube", type: 'outpost', faction: 0, zone: 'coeur', x: -105, z: 88, r: 24 },
  { id: 'refuge_col', name: 'Refuge du Col', type: 'outpost', faction: 0, zone: 'pics', x: -318, z: -236, r: 22 },
  { id: 'aube_grise', name: "Tour de l'Aube Grise", type: 'outpost', faction: 0, zone: 'desolation', x: 232, z: -410, r: 20 },
  { id: 'bastide', name: 'Bastide Céleste', type: 'outpost', faction: 0, zone: 'cime', x: -92, z: -236, r: 20 },
  // ---- Clans de Braise
  { id: 'forge_cendre', name: 'Forge-Cendre', type: 'capital', faction: 1, zone: 'terres', x: 400, z: -18, r: 52 },
  { id: 'rougecamp', name: 'Rougecamp', type: 'village', faction: 1, zone: 'terres', x: 292, z: -72, r: 26 },
  { id: 'scorie_noire', name: 'Camp Scorie-Noire', type: 'outpost', faction: 1, zone: 'canyon', x: 310, z: 290, r: 24 },
  { id: 'bivouac_crocs', name: 'Bivouac des Crocs', type: 'outpost', faction: 1, zone: 'marais', x: 100, z: 300, r: 24 },
  { id: 'braise_vive', name: 'Poste de la Braise Vive', type: 'outpost', faction: 1, zone: 'coeur', x: 105, z: 88, r: 24 },
  { id: 'halte_cornes', name: 'Halte des Cornes', type: 'outpost', faction: 1, zone: 'pics', x: -232, z: -410, r: 20 },
  { id: 'camp_obsidienne', name: "Camp d'Obsidienne", type: 'outpost', faction: 1, zone: 'desolation', x: 318, z: -236, r: 22 },
  { id: 'bivouac_tonnerre', name: 'Bivouac du Tonnerre', type: 'outpost', faction: 1, zone: 'cime', x: 92, z: -236, r: 20 },
];
export const HUB_BY_ID = Object.fromEntries(HUBS.map((h) => [h.id, h]));

// Lieux remarquables (zones aplanies, décors spéciaux, objectifs de quêtes)
export const LANDMARKS = [
  { id: 'moulin', name: 'Vieux Moulin', zone: 'val', x: -215, z: -55, r: 20, kind: 'mill' },
  { id: 'pierres_levees', name: 'Cercle des Pierres Levées', zone: 'val', x: -390, z: -110, r: 14, kind: 'stones' },
  { id: 'camp_pillards', name: 'Camp des Pillards', zone: 'terres', x: 222, z: 48, r: 20, kind: 'banditcamp' },
  { id: 'oasis', name: 'Oasis de Sèchepierre', zone: 'terres', x: 360, z: 110, r: 0, kind: 'oasis' },
  { id: 'nid_tisseuse', name: 'Nid de la Tisseuse', zone: 'bois', x: -430, z: 430, r: 22, kind: 'nest' },
  { id: 'camp_gobelin', name: 'Souche-Creuse', zone: 'bois', x: -220, z: 420, r: 22, kind: 'goblincamp' },
  { id: 'mine', name: 'Mine de Gueule-Noire', zone: 'canyon', x: 420, z: 430, r: 22, kind: 'mine' },
  { id: 'terrier_kobold', name: 'Terriers de Fouille-Suie', zone: 'canyon', x: 220, z: 420, r: 20, kind: 'koboldcamp' },
  { id: 'village_crapoussin', name: 'Bourg-Crapoussin', zone: 'marais', x: 0, z: 400, r: 24, kind: 'frogvillage' },
  { id: 'bourbier', name: 'Bourbier de la Mère Vase', zone: 'marais', x: -30, z: 470, r: 22, kind: 'bog' },
  { id: 'bastion', name: "Bastion d'Orvalis", zone: 'coeur', x: 0, z: -40, r: 22, kind: 'bastion' },
  { id: 'crypte', name: "Crypte d'Ossevaine", zone: 'coeur', x: 0, z: 110, r: 22, kind: 'crypt' },
  { id: 'antre_trolls', name: 'Antre des Trolls', zone: 'pics', x: -420, z: -420, r: 24, kind: 'trollcamp' },
  { id: 'lac_gele', name: 'Lac Gelé', zone: 'pics', x: -400, z: -300, r: 0, kind: 'none' },
  { id: 'caldeira', name: 'Caldeira du Wyrm', zone: 'desolation', x: 425, z: -425, r: 26, kind: 'caldera' },
  { id: 'autel', name: 'Autel des Tempêtes', zone: 'cime', x: 0, z: -405, r: 40, kind: 'altar' },
];
export const LANDMARK_BY_ID = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));

// Lacs et étendues d'eau (dépressions sous le niveau 0)
export const LAKES = [
  { x: -250, z: -95, r: 34, depth: 4 },
  { x: -405, z: 240, r: 22, depth: 3 },
  { x: 360, z: 112, r: 11, depth: 2.2 },
  { x: -400, z: -300, r: 42, depth: 3 },   // gelé
  { x: 380, z: -330, r: 26, depth: 3 },    // lave
  { x: 245, z: -300, r: 15, depth: 2.5 },  // lave
  { x: 60, z: 230, r: 26, depth: 2 },      // marais
  { x: -60, z: 380, r: 22, depth: 2 },
];

// Routes (polylignes). Les points 'pass:i' sont remplacés par le centre réel du col i.
export const ROADS = [
  ['havrebleu', 'clairbourg', 'pass:9', 'chenevert', 'pass:2', 'fort_roseau'],
  ['havrebleu', 'pass:6', 'refuge_col'],
  ['clairbourg', 'moulin', 'pass:1', 'garde_aube'],
  ['forge_cendre', 'rougecamp', 'pass:11', 'scorie_noire', 'pass:5', 'bivouac_crocs'],
  ['forge_cendre', 'pass:8', 'camp_obsidienne'],
  ['rougecamp', 'pass:4', 'braise_vive'],
  ['fort_roseau', 'pass:10', 'garde_aube'],
  ['bivouac_crocs', 'pass:10', 'braise_vive'],
  ['fort_roseau', 'village_crapoussin', 'bivouac_crocs'],
  ['garde_aube', 'bastion', 'braise_vive'],
  ['bastion', 'pass:7', 'bastide'],
  ['pass:7', 'bivouac_tonnerre'],
  ['bastide', 'pass:0', 'refuge_col'],
  ['bivouac_tonnerre', 'pass:3', 'camp_obsidienne'],
  ['refuge_col', 'halte_cornes'],
  ['camp_obsidienne', 'aube_grise'],
  ['bastide', 'autel', 'bivouac_tonnerre'],
  ['garde_aube', 'crypte', 'braise_vive'],
];

// Cimetières / points de réapparition : le hub ami le plus proche est utilisé.

// Les centres sont éloignés ; bâtiments, routes et rayons de combat gardent leur taille.
for (const p of [...HUBS, ...LANDMARKS, ...LAKES]) { p.x *= WORLD_SCALE; p.z *= WORLD_SCALE; }
for (const p of PASSES) p.at *= WORLD_SCALE;
for (const l of LAKES) l.r *= 2;
