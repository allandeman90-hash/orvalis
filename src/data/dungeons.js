// Donjons (5 joueurs), raids (10 joueurs) et Abîme sans fin : définitions, créatures et boss originaux.
import { registerMob } from './mobs.js';

// ============================ CRÉATURES DES DONJONS ============================
// Adeptes et gardiens propres aux donjons (le reste des salles reprend le bestiaire du monde)
registerMob({ id: 'd1_mineur', name: 'Mineur possédé', lvl: [8, 12], family: 'humanoïde', hp: 1.1, abilities: ['bleed'],
  model: { rig: 'humanoid', skin: '#b8906a', body: '#5a4a3a', legs: '#3e3228', helmet: 'bandana', helmetColor: '#8a3a2a', weapon: 'pick', glowEyes: '#ffb050', eyes: '#ffb050', beard: '#3a2a1e' } });
registerMob({ id: 'd2_noye', name: 'Garde noyé', lvl: [13, 17], family: 'mort-vivant', hp: 1.15, abilities: ['slowbolt'],
  model: { rig: 'humanoid', skin: '#7a9a8a', body: '#3a5a4a', legs: '#2a4038', arms: '#3a5a4a', helmet: 'plate', helmetColor: '#5a7a6a', helmetAccent: '#8ab870', weapon: 'spear', weaponColors: { metal: '#8ab8a0' }, fur: '#4a7a3a', glowEyes: '#b8ff90' } });
registerMob({ id: 'd3_acolyte', name: 'Acolyte des cendres', lvl: [18, 22], family: 'humanoïde', kind: 'caster', atkRange: 18, projectile: 'shadow', hp: 0.9, abilities: ['drain'],
  model: { rig: 'humanoid', skin: '#c8b8a8', body: '#2a2236', legs: '#1a1426', arms: '#2a2236', hood: '#1a1426', weapon: 'staff', weaponColors: { gem: '#b58cff', wood: '#2a2030' }, cape: '#1a1426' } });
registerMob({ id: 'd4_sentinelle', name: 'Sentinelle de givre', lvl: [23, 27], family: 'élémentaire', hp: 1.35, armor: 1.4, abilities: ['slam'],
  model: { rig: 'humanoid', head: 'golem', skin: '#9ab8d0', body: '#8aa8c4', legs: '#7a98b4', arms: '#9ab8d0', gloves: '#6a88a4', boots: '#6a88a4', belt: false, core: '#dff6ff', scale: 1.5, bigHands: true, prop: { torsoW: 0.78, legW: 0.28, armW: 0.25 } } });
registerMob({ id: 'd5_forgeflamme', name: 'Forgeflamme', lvl: [28, 30], family: 'humanoïde', hp: 1.2, abilities: ['burn', 'slam'],
  model: { rig: 'humanoid', skin: '#8a4a3a', body: '#3a2a26', legs: '#2a1e1a', arms: '#8a4a3a', gloves: '#2a2020', boots: '#1a1414', helmet: 'horned', helmetColor: '#3a3034', weapon: 'warhammer', weaponColors: { metal: '#5a5058', accent: '#ff7a2a' }, beard: '#ff8a3a', fur: '#ff7a2a', scale: 1.05, prop: { torsoW: 0.7, headS: 0.5 } } });
registerMob({ id: 'r1_sentinelle', name: 'Sentinelle céleste', lvl: [30, 31], family: 'élémentaire', hp: 1.3, armor: 1.3, abilities: ['shock', 'slam'],
  model: { rig: 'humanoid', skin: '#e8e0cc', body: '#d8d0bc', legs: '#c8c0ac', arms: '#e8e0cc', helmet: 'crest', helmetColor: '#e8e0cc', helmetAccent: '#d9a441', plume: '#7fb8ff', weapon: 'spear', weaponColors: { metal: '#dff0ff', accent: '#d9a441' }, offhand: 'shield', offhandColors: { color: '#7fb8ff' }, cape: '#5a7ac8', glowEyes: '#9fe8ff', scale: 1.35 } });
registerMob({ id: 'r2_brasier', name: 'Brasier vivant', lvl: [30, 31], family: 'élémentaire', kind: 'caster', atkRange: 18, projectile: 'fire', hp: 1.1, abilities: ['burn'],
  model: { rig: 'floater', kind: 'storm', color: '#ff6a1a', core: '#ffe080', hover: 1.6, bits: 4, bitColor: '#ffb040' } });

// ============================ BOSS ============================
const boss = (o) => registerMob({ boss: true, named: true, social: false, aggro: 16, speed: 5, ...o });

// --- D1 : Galeries de Mèchenoire
boss({ id: 'b1_grattefer', name: 'Grattefer, contremaître kobold', dungeonBoss: true, lvl: [10, 10], family: 'humanoïde', kind: 'ranged', atkRange: 16, projectile: 'bomb', hp: 0.9,
  abilities: ['bomb', 'bb_adds', 'bb_fire_pools'], addId: 'kobold', enrageT: 240,
  phases: [{ at: 0.5, add: ['bb_line'], yell: 'Grattefer : « Plus de mèche ! PLUS DE MÈCHE ! »' }],
  yells: { pull: 'Grattefer : « Qui a laissé entrer ces fouineurs dans MA galerie ? »', death: 'Grattefer : « Ma… ma paie… »' },
  model: { rig: 'humanoid', head: 'kobold', skin: '#7a5a3a', body: '#4a4a5a', legs: '#2a2a34', weapon: 'torch', tail: true, tailColor: '#7a5a3a', helmet: 'crown', helmetAccent: '#c8872e', pauldrons: '#6a6a70', scale: 1.5, prop: { headS: 0.52 } } });
boss({ id: 'b1_braisegueule', name: 'Braisegueule', dungeonBoss: true, lvl: [11, 11], family: 'bête', hp: 1.1, speed: 5.6,
  abilities: ['firebreath', 'bb_fire_pools', 'bb_line'], enrageT: 240,
  phases: [{ at: 0.4, add: ['bb_whirl'], yell: 'Braisegueule se tord de rage, sa peau crépite !' }],
  yells: { pull: 'Un grondement brûlant monte des profondeurs…' },
  model: { rig: 'quadruped', color: '#c84a2a', belly: '#f0a040', dark: '#6a2010', len: 1.6, wid: 0.5, hgt: 0.38, legH: 0.28, legW: 0.14, headS: 0.4, tail: 'long', tailL: 1.2, ears: 'none', snoutL: 0.26, spikes: '#f0c040', eyes: '#ffe040', scale: 2.6, emissive: '#2a0800' } });
boss({ id: 'b1_colosse', name: 'Le Colosse de Scories', dungeonBoss: true, lvl: [12, 12], family: 'élémentaire', hp: 1.3, armor: 1.5, speed: 4,
  abilities: ['bb_slam_ring', 'bb_cleave', 'stomp'], anchorId: 'golem_scories', enrageT: 270,
  phases: [{ at: 0.55, once: 'bb_shield', yell: 'Le Colosse se couvre de scories en fusion ! Brisez ses piliers !' }, { at: 0.25, add: ['bb_nova_run'] }],
  yells: { pull: 'Les parois tremblent : le Colosse s\'éveille.', death: 'Le Colosse s\'effondre en un tas de pierres fumantes.' },
  model: { rig: 'humanoid', head: 'golem', skin: '#4a3e3a', body: '#3a302c', legs: '#3a302c', arms: '#4a3e3a', gloves: '#2a221e', boots: '#2a221e', belt: false, core: '#ff9a2a', scale: 2.7, bigHands: true, emissive: '#200800', prop: { torsoW: 0.84, legW: 0.3, armW: 0.28 } } });

// --- D2 : Sanctuaire Englouti
boss({ id: 'b2_glougloss', name: 'Grand-Prêtre Glougloss', dungeonBoss: true, lvl: [15, 15], family: 'humanoïde', kind: 'caster', atkRange: 20, projectile: 'swamp', hp: 0.9,
  abilities: ['bb_heal', 'slowbolt', 'bb_adds', 'bb_poison_cloud'], addId: 'crapoussin', enrageT: 240,
  yells: { pull: 'Glougloss : « Les eaux vous réclament, étrangers ! »', death: 'Glougloss : « Glou… »' },
  model: { rig: 'humanoid', head: 'frog', skin: '#4a8a5a', body: '#6a3a6a', legs: '#3a5a3a', arms: '#4a8a5a', helmet: 'crown', helmetAccent: '#9aff9a', weapon: 'staff', weaponColors: { gem: '#9aff9a', wood: '#3a2a1a' }, cape: '#4a2a4a', scale: 1.7, prop: { headS: 0.52 } } });
boss({ id: 'b2_sangsue_reine', name: 'La Sangsue-Reine', dungeonBoss: true, lvl: [16, 16], family: 'bête', hp: 1.2, speed: 4.2,
  abilities: ['drain', 'bb_doom', 'nova_poison'], enrageT: 250,
  phases: [{ at: 0.5, add: ['bb_whirl'], yell: 'La Sangsue-Reine se gorge de sang et devient frénétique !' }],
  model: { rig: 'worm', color: '#5a2a3a', scale: 2.6 } });
boss({ id: 'b2_ondrakis', name: "Ondrakis, l'Hydre des Tourbières", dungeonBoss: true, lvl: [17, 17], family: 'dragon', hp: 1.3, speed: 4.5, atkRange: 4.5,
  abilities: ['bb_acid_breath', 'bb_tail', 'bb_poison_cloud'], addId: 'crapoussin_tetard', enrageT: 280,
  phases: [{ at: 0.5, add: ['bb_adds'], yell: "Ondrakis plonge la tête sous l'eau… des têtards grouillent de partout !" }],
  yells: { pull: "L'eau stagnante se met à bouillonner…", death: "Ondrakis s'effondre dans la vase." },
  model: { rig: 'drake', color: '#2a5a4a', belly: '#9ac890', wing: '#3a6a5a', horn: '#d8e8c0', eyes: '#ffe040', scale: 1.7 } });

// --- D3 : Catacombes du Roi Oublié
boss({ id: 'b3_geolier', name: 'Le Geôlier Sans-Visage', dungeonBoss: true, lvl: [20, 20], family: 'mort-vivant', hp: 1.2,
  abilities: ['bb_cleave', 'bb_fixate', 'summon_skeletons'], enrageT: 250,
  yells: { pull: 'Des chaînes raclent le sol. Le Geôlier sent votre peur.', death: 'Les chaînes tombent, inertes.' },
  model: { rig: 'humanoid', head: 'skull', skin: '#cfc6b0', body: '#2a2a30', legs: '#1e1e24', arms: '#2a2a30', gloves: '#1a1a20', boots: '#1a1a20', helmet: 'plate', helmetColor: '#2a2a30', helmetAccent: '#6a6a70', weapon: 'axe', weaponColors: { metal: '#8a8a90' }, pauldrons: '#3a3a40', cape: '#1a1a20', glowEyes: '#ff5a3a', scale: 1.9 } });
boss({ id: 'b3_veuve', name: 'Veuve Pâle', dungeonBoss: true, lvl: [21, 21], family: 'mort-vivant', kind: 'caster', atkRange: 20, projectile: 'shadow', hp: 1.0,
  abilities: ['bb_doom', 'drain', 'blink', 'bb_nova_run'], enrageT: 250,
  yells: { pull: 'Veuve Pâle : « Restez… restez pour toujours avec moi… »', death: 'Un long soupir glacé traverse la salle.' },
  model: { rig: 'humanoid', head: 'ghost', floating: true, skin: '#e0f0ff', body: '#b8c8e0', arms: '#b8c8e0', gloves: '#e0f0ff', opacity: 0.7, emissive: '#1a2a44', glowEyes: '#ffffff', hair: '#f0f4ff', scale: 1.7, claws: true } });
boss({ id: 'b3_morvhal', name: 'Morvhal, le Roi Oublié', dungeonBoss: true, lvl: [22, 22], family: 'mort-vivant', kind: 'caster', atkRange: 20, projectile: 'shadow', hp: 1.35,
  abilities: ['nova_frost', 'drain', 'bb_fire_pools'], anchorId: 'd3_acolyte', enrageT: 300,
  phases: [{ at: 0.6, once: 'bb_shield', yell: 'Morvhal : « Mes fidèles, protégez votre roi ! »' }, { at: 0.3, add: ['meteor', 'bb_heal'], yell: 'Morvhal : « Je ne serai pas oublié une seconde fois ! »' }],
  yells: { pull: 'Morvhal : « Qui ose troubler le sommeil de son souverain ? »', death: 'Morvhal : « Mon royaume… n\'était que poussière… »' },
  model: { rig: 'humanoid', head: 'skull', skin: '#e0d8c4', body: '#3a2a1a', legs: '#2a1e12', arms: '#3a2a1a', gloves: '#2a1e12', boots: '#2a1e12', helmet: 'crown', helmetAccent: '#d9a441', weapon: 'staff', weaponColors: { gem: '#9fe8ff', wood: '#2a2030' }, cape: '#5a1a2a', pauldrons: '#d9a441', glowEyes: '#9fe8ff', scale: 1.9, emissive: '#0a0a1a' } });

// --- D4 : Citadelle de Givre-Écaille
boss({ id: 'b4_brisegel', name: 'Brisegel le Veilleur', dungeonBoss: true, lvl: [25, 25], family: 'bête', hp: 1.3, speed: 4.6,
  abilities: ['stomp', 'bb_slam_ring', 'bb_frost_breath'], enrageT: 250,
  yells: { pull: 'Un rugissement fait trembler la glace des murs.', death: 'Brisegel s\'écroule dans un nuage de givre.' },
  model: { rig: 'humanoid', head: 'yeti', skin: '#f4f8fc', body: '#e8eef4', legs: '#dce4ec', arms: '#e8eef4', gloves: '#6a8aaa', boots: '#6a8aaa', belt: false, hunch: true, bigHands: true, scale: 2.5, prop: { torsoW: 0.74, armL: 0.74, armW: 0.23 } } });
boss({ id: 'b4_isvelle', name: 'Isvelle, sœur de l\'hiver', dungeonBoss: true, encounter: 'soeurs', lvl: [26, 26], family: 'élémentaire', kind: 'caster', atkRange: 20, projectile: 'frost', hp: 0.62,
  abilities: ['nova_frost', 'slowbolt', 'bb_heal'], enrageT: 260,
  yells: { pull: 'Isvelle : « Ma sœur, nous avons de la visite. »', death: 'Isvelle : « Nivalle… venge-moi… »' },
  model: { rig: 'humanoid', skin: '#dff0ff', body: '#9ac8f0', legs: '#7aa8d0', arms: '#9ac8f0', helmet: 'circlet', helmetAccent: '#bff0ff', gem: '#9fe8ff', hair: '#ffffff', hairStyle: 1, weapon: 'staff', weaponColors: { gem: '#bff0ff' }, cape: '#5a8ac8', floating: true, emissive: '#0a1a2a', scale: 1.55 } });
boss({ id: 'b4_nivalle', name: 'Nivalle, sœur du blizzard', dungeonBoss: true, encounter: 'soeurs', lvl: [26, 26], family: 'élémentaire', hp: 0.62,
  abilities: ['bb_cleave', 'bb_frost_breath', 'bb_line'], enrageT: 260,
  yells: { death: 'Nivalle : « Isvelle… le froid… s\'éteint… »' },
  model: { rig: 'humanoid', skin: '#dff0ff', body: '#5a7ab0', legs: '#4a6a9a', arms: '#5a7ab0', helmet: 'horned', helmetColor: '#bfe8ff', hair: '#e8f4ff', weapon: 'greatsword', weaponColors: { metal: '#bff0ff' }, pauldrons: '#bfe8ff', cape: '#3a5a8a', emissive: '#0a1a2a', scale: 1.6 } });
boss({ id: 'b4_hjarnok', name: 'Hjarnok, Cœur-de-Glacier', dungeonBoss: true, lvl: [27, 27], family: 'dragon', hp: 1.3, speed: 4.5, atkRange: 5,
  abilities: ['bb_frost_breath', 'bb_tail', 'bb_ice_rain'], addId: 'elementaire_givre', enrageT: 300,
  phases: [{ at: 0.5, add: ['bb_adds'], yell: 'Hjarnok rugit : la glace se brise et libère des élémentaires !' }],
  yells: { pull: 'Un souffle glacial balaie la salle : Hjarnok ouvre les yeux.', death: 'Le cœur de glace de Hjarnok se fend en deux.' },
  model: { rig: 'drake', color: '#8ab0d8', belly: '#e8f4ff', wing: '#5a80b8', horn: '#ffffff', eyes: '#9fe8ff', scale: 2.0, emissive: '#081424' } });

// --- D5 : Creuset Écarlate
boss({ id: 'b5_kazdrul', name: 'Maître-Forgeron Kazdrul', dungeonBoss: true, lvl: [28, 28], family: 'humanoïde', hp: 1.25,
  abilities: ['bb_cleave', 'bb_fire_pools', 'bb_adds'], addId: 'd5_forgeflamme', enrageT: 260,
  phases: [{ at: 0.4, add: ['bb_slam_ring'], yell: 'Kazdrul : « Mon marteau n\'a pas encore dit son dernier mot ! »' }],
  yells: { pull: 'Kazdrul : « Encore du minerai qui marche tout seul ! À l\'enclume ! »', death: 'Kazdrul : « La forge… refroidit… »' },
  model: { rig: 'humanoid', skin: '#7a3a2a', body: '#2a2226', legs: '#1e181a', arms: '#7a3a2a', gloves: '#1a1414', boots: '#1a1414', helmet: 'horned', helmetColor: '#2a2226', beard: '#ff8a3a', weapon: 'warhammer', weaponColors: { metal: '#3a3034', accent: '#ff7a2a' }, fur: '#ff7a2a', pauldrons: '#3a3034', scale: 2.0, prop: { torsoW: 0.74, headS: 0.52 } } });
boss({ id: 'b5_ignivore', name: 'Ignivore', dungeonBoss: true, lvl: [29, 29], family: 'démon', hp: 1.2, speed: 6,
  abilities: ['firebreath', 'bb_line', 'bb_doom'], enrageT: 260,
  phases: [{ at: 0.35, add: ['bb_whirl'], yell: 'Ignivore s\'embrase tout entier !' }],
  model: { rig: 'quadruped', color: '#2a2224', belly: '#3a3034', dark: '#1a1414', len: 1.6, wid: 0.6, hgt: 0.6, legH: 0.6, headS: 0.5, ears: 'pointy', tail: 'long', snoutL: 0.3, eyes: '#ffb020', cracks: '#ff7a1a', spikes: '#ff7a1a', emissive: '#2a0a00', scale: 2.6 } });
boss({ id: 'b5_velkyra', name: 'Pyrarque Velkyra', dungeonBoss: true, lvl: [30, 30], family: 'dragon', kind: 'caster', atkRange: 20, projectile: 'fire', hp: 1.4,
  abilities: ['meteor', 'bb_fire_pools', 'bb_nova_run'], anchorId: 'd5_forgeflamme', enrageT: 320,
  phases: [{ at: 0.6, once: 'bb_shield', yell: 'Velkyra : « Forgeflammes ! Nourrissez mon bouclier ! »' }, { at: 0.3, add: ['bb_platform'], yell: 'Velkyra : « Que le Creuset entier s\'embrase ! »' }],
  yells: { pull: 'Velkyra : « Vous venez mourir dans le feu qui a forgé mon peuple ? »', death: 'Velkyra : « Les cendres… se souviendront… »' },
  model: { rig: 'humanoid', head: 'lizard', skin: '#8a2a2a', body: '#3a1010', legs: '#2a0a0a', arms: '#8a2a2a', gloves: '#8a2a2a', boots: '#1a0808', wings: '#6a1a1a', tail: true, tailColor: '#8a2a2a', weapon: 'staff', weaponColors: { gem: '#ffb040', wood: '#2a1010' }, backSpikes: '#e0c080', glowEyes: '#ffd040', helmet: 'crown', helmetAccent: '#ffb040', cape: '#5a0a0a', scale: 1.9, flapAlways: true, emissive: '#1a0400' } });

// --- R1 : Sanctuaire des Tempêtes
boss({ id: 'r1_aegis', name: 'Aëgis, le Gardien Colossal', raidBoss: true, lvl: [31, 31], family: 'élémentaire', hp: 1.2, armor: 1.6, speed: 4,
  abilities: ['bb_slam_ring', 'bb_cleave', 'bb_line'], anchorId: 'gardien_runique', enrageT: 360,
  phases: [{ at: 0.5, once: 'bb_shield', yell: 'Aëgis : « PROTOCOLE DE DÉFENSE. ACTIVATION DES GARDIENS. »' }],
  yells: { pull: 'Aëgis : « INTRUS DÉTECTÉS. ÉLIMINATION. »', death: 'Aëgis : « GARDE… TERMINÉE. »' },
  model: { rig: 'humanoid', head: 'golem', skin: '#e0d8c8', body: '#d0c8b4', legs: '#c0b8a4', arms: '#e0d8c8', gloves: '#a8a090', boots: '#a8a090', belt: false, core: '#7fd1ff', fur: '#d9a441', pauldrons: '#d9a441', scale: 3.4, bigHands: true, prop: { torsoW: 0.86, legW: 0.32, armW: 0.28 } } });
boss({ id: 'r1_vharn', name: 'Vharn, jumeau de foudre', raidBoss: true, encounter: 'jumeaux', lvl: [31, 31], family: 'élémentaire', kind: 'caster', atkRange: 18, projectile: 'lightning', hp: 0.6,
  abilities: ['shock', 'bb_doom', 'meteor_storm'], enrageT: 360,
  yells: { pull: 'Vharn : « Sylk ! Des proies ! »', death: 'Vharn : « L\'orage… se tait… »' },
  model: { rig: 'floater', kind: 'storm', color: '#4a7aff', core: '#e0f0ff', hover: 2.2, bits: 6, bitColor: '#bfe0ff', scale: 2.2 } });
boss({ id: 'r1_sylk', name: 'Sylk, jumelle des nues', raidBoss: true, encounter: 'jumeaux', lvl: [31, 31], family: 'bête', hp: 0.6, speed: 6,
  abilities: ['shock', 'bb_line', 'bb_fixate'], enrageT: 360,
  yells: { death: 'Sylk : « Vharn… je tombe… »' },
  model: { rig: 'humanoid', head: 'harpy', skin: '#d8c8b8', body: '#3a4a8a', legs: '#5a5a8a', arms: '#d8c8b8', boots: '#d9a441', wingArms: '#4a5ab0', hair: '#2a3a8a', birdLegs: true, belt: false, flapAlways: true, helmet: 'crown', helmetAccent: '#9fe8ff', scale: 1.9 } });
boss({ id: 'r1_selenia', name: 'Haute-Oracle Sélénia', raidBoss: true, lvl: [31, 31], family: 'humanoïde', kind: 'caster', atkRange: 22, projectile: 'arcane', hp: 1.0,
  abilities: ['bb_heal', 'bb_nova_run', 'bb_fixate', 'bb_adds'], addId: 'eclair_invoque', enrageT: 360,
  phases: [{ at: 0.4, add: ['meteor_storm'], yell: 'Sélénia : « J\'ai vu votre fin dans les étoiles ! »' }],
  yells: { pull: 'Sélénia : « Vous n\'étiez pas dans mes visions… »', death: 'Sélénia : « Je n\'avais… pas vu… ceci… »' },
  model: { rig: 'humanoid', skin: '#f0e0d0', body: '#e8e0f8', legs: '#c8c0e8', arms: '#e8e0f8', helmet: 'circlet', helmetAccent: '#d9a441', gem: '#b58cff', hair: '#f8f0ff', hairStyle: 1, weapon: 'staff', weaponColors: { gem: '#e0c8ff' }, cape: '#6a5ab0', floating: true, emissive: '#10081a', scale: 1.7 } });
boss({ id: 'r1_vortharion', name: "Vortharion, l'Œil du Cyclone", raidBoss: true, lvl: [32, 32], family: 'dragon', hp: 1.5, speed: 5, atkRange: 7,
  abilities: ['firebreath_storm', 'meteor_storm', 'bb_tail', 'bb_whirl'], enrageT: 420,
  phases: [{ at: 0.3, add: ['bb_platform'], yell: 'Vortharion déchaîne la tempête sur tout le sanctuaire !' }],
  yells: { pull: 'Le ciel se déchire : Vortharion fond sur vous !', death: 'Vortharion s\'abat, et le vent tombe enfin.' },
  model: { rig: 'drake', color: '#3a4a8a', belly: '#bfd0f0', wing: '#5a6ac0', horn: '#ffffff', eyes: '#dff6ff', scale: 3.2, emissive: '#060a20' } });

// --- R2 : Trône de Cendre-Noire
boss({ id: 'r2_gorlath', name: 'Gorlath le Dévoreur', raidBoss: true, lvl: [31, 31], family: 'bête', hp: 1.3, speed: 4.6,
  abilities: ['bb_whirl', 'bb_fire_pools', 'bb_line'], enrageT: 360,
  yells: { pull: 'La roche se fend : Gorlath surgit de la lave !', death: 'Gorlath retombe dans le magma.' },
  model: { rig: 'worm', color: '#3a1a14', scale: 3.4, emissive: '#2a0600' } });
boss({ id: 'r2_pyrothe', name: 'Pyrothe du Conseil', raidBoss: true, encounter: 'conseil', lvl: [31, 31], family: 'démon', kind: 'caster', atkRange: 20, projectile: 'fire', hp: 0.45,
  abilities: ['meteor', 'bb_heal'], enrageT: 380,
  yells: { pull: 'Pyrothe : « Le Conseil siège. Jugez-les ! »', death: 'Pyrothe : « Le Conseil… est brisé… »' },
  model: { rig: 'humanoid', head: 'imp', skin: '#c83a2a', body: '#4a1010', legs: '#2a0808', arms: '#c83a2a', gloves: '#c83a2a', boots: '#1a0808', wings: '#5a1a14', helmet: 'crown', helmetAccent: '#ffb040', weapon: 'staff', weaponColors: { gem: '#ffb040' }, scale: 1.6, flapAlways: true } });
boss({ id: 'r2_cendrine', name: 'Cendrine du Conseil', raidBoss: true, encounter: 'conseil', lvl: [31, 31], family: 'démon', kind: 'caster', atkRange: 20, projectile: 'shadow', hp: 0.45,
  abilities: ['bb_doom', 'drain'], enrageT: 380,
  model: { rig: 'humanoid', skin: '#6a6a6a', body: '#2a2a2a', legs: '#1a1a1a', arms: '#6a6a6a', hood: '#1a1a1a', weapon: 'scythe', weaponColors: { metal: '#ff8a4a' }, cape: '#3a1a14', glowEyes: '#ff8a4a', floating: true, scale: 1.6 } });
boss({ id: 'r2_ardeval', name: 'Ardeval du Conseil', raidBoss: true, encounter: 'conseil', lvl: [31, 31], family: 'démon', hp: 0.5,
  abilities: ['bb_cleave', 'bb_fixate'], enrageT: 380,
  model: { rig: 'humanoid', head: 'lizard', skin: '#8a3a1a', body: '#3a2a26', legs: '#2a1e1a', arms: '#8a3a1a', helmet: 'horned', helmetColor: '#2a2226', weapon: 'greatsword', weaponColors: { metal: '#ff7a2a' }, pauldrons: '#2a2226', tail: true, tailColor: '#8a3a1a', scale: 1.8 } });
boss({ id: 'r2_scarnak', name: 'Scarnak, Brasier Vivant', raidBoss: true, lvl: [32, 32], family: 'élémentaire', kind: 'caster', atkRange: 20, projectile: 'fire', hp: 1.3,
  abilities: ['bb_nova_run', 'bb_platform', 'bb_adds'], addId: 'r2_brasier', enrageT: 400,
  yells: { pull: 'Scarnak : « BRÛLEZ ! »', death: 'Les flammes de Scarnak vacillent… et s\'éteignent.' },
  model: { rig: 'floater', kind: 'storm', color: '#ff5a0a', core: '#fff0a0', hover: 2.6, bits: 8, bitColor: '#ffb040', scale: 3.2 } });
boss({ id: 'r2_nyxaroth', name: 'Nyxaroth, Mère des Wyrms', raidBoss: true, lvl: [32, 32], family: 'dragon', hp: 1.6, speed: 4.8, atkRange: 7,
  abilities: ['firebreath', 'meteor', 'bb_tail'], addId: 'drakonide', enrageT: 480,
  phases: [{ at: 0.6, add: ['bb_adds'], yell: 'Nyxaroth : « Mes enfants ! Dévorez-les ! »' }, { at: 0.3, add: ['bb_platform'], yell: 'Nyxaroth : « Le trône de cendre sera votre tombeau ! »' }],
  yells: { pull: 'Nyxaroth déploie ses ailes au-dessus du trône.', death: 'Nyxaroth : « Mes œufs… éclosent déjà… »' },
  model: { rig: 'drake', color: '#1a1418', belly: '#8a3a2a', wing: '#2a1a1e', horn: '#e0c090', eyes: '#ff4020', scale: 3.6, emissive: '#1a0200' } });

// ============================ DONJONS ET RAIDS ============================
const DUN_SEQ = ['entry', 'trash', 'trash', 'boss', 'trash', 'trash', 'boss', 'trash', 'trash', 'boss'];
const RAID_SEQ = ['entry', 'trash', 'trash', 'boss', 'trash', 'trash', 'boss', 'trash', 'boss', 'trash', 'trash', 'boss'];
export const DUNGEONS = [
  { id: 'meche', kind: 'dungeon', name: 'Les Galeries de Mèchenoire', short: 'Mèchenoire', lvl: [8, 12], theme: 'mine', layout: DUN_SEQ, size: 5, zone: 'canyon',
    desc: "Une mine kobold creusée trop profond. Les mineurs ont réveillé quelque chose dans la roche en fusion.",
    trash: ['kobold', 'kobold_dynamiteur', 'chauve_souris', 'd1_mineur', 'golem_scories'], bosses: [['b1_grattefer'], ['b1_braisegueule'], ['b1_colosse']] },
  { id: 'englouti', kind: 'dungeon', name: 'Le Sanctuaire Englouti', short: 'Sanctuaire', lvl: [13, 17], theme: 'swamp', layout: DUN_SEQ, size: 5, zone: 'marais',
    desc: "Un temple ancien avalé par les tourbières. Les crapoussins y vénèrent une hydre qui ne dort que d'un œil.",
    trash: ['crapoussin', 'crapoussin_sorcier', 'sangsue', 'feu_follet', 'd2_noye'], bosses: [['b2_glougloss'], ['b2_sangsue_reine'], ['b2_ondrakis']] },
  { id: 'catacombes', kind: 'dungeon', name: 'Les Catacombes du Roi Oublié', short: 'Catacombes', lvl: [18, 22], theme: 'crypt', layout: DUN_SEQ, size: 5, zone: 'coeur',
    desc: "Sous le Cœur d'Orvalis dort un roi que l'histoire a effacé. Ses gardiens, eux, n'ont rien oublié.",
    trash: ['squelette', 'squelette_archer', 'spectre', 'gargouille', 'd3_acolyte'], bosses: [['b3_geolier'], ['b3_veuve'], ['b3_morvhal']] },
  { id: 'givre', kind: 'dungeon', name: 'La Citadelle de Givre-Écaille', short: 'Givre-Écaille', lvl: [23, 27], theme: 'ice', layout: DUN_SEQ, size: 5, zone: 'pics',
    desc: "Une forteresse taillée dans un glacier, où deux sœurs sorcières gardent le sommeil d'un dragon de glace.",
    trash: ['loup_neiges', 'yeti', 'elementaire_givre', 'troll_glaces', 'd4_sentinelle'], bosses: [['b4_brisegel'], ['b4_isvelle', 'b4_nivalle'], ['b4_hjarnok']] },
  { id: 'creuset', kind: 'dungeon', name: 'Le Creuset Écarlate', short: 'Creuset', lvl: [28, 30], theme: 'fire', layout: DUN_SEQ, size: 5, zone: 'desolation',
    desc: "La forge des drakônides, au cœur de la Désolation. On y martèle des armes pour une guerre qui n'a pas encore commencé.",
    trash: ['diablotin', 'chien_lave', 'golem_obsidienne', 'drakonide', 'd5_forgeflamme'], bosses: [['b5_kazdrul'], ['b5_ignivore'], ['b5_velkyra']] },
  { id: 'tempetes', kind: 'raid', name: 'Le Sanctuaire des Tempêtes', short: 'Tempêtes', lvl: [30, 30], theme: 'sky', layout: RAID_SEQ, size: 10, zone: 'cime',
    desc: "Au-dessus de la Cime, une citadelle flotte dans l'œil d'un cyclone éternel. Raid de fin de jeu pour 10 héros.",
    trash: ['harpie', 'elementaire_foudre', 'gardien_runique', 'r1_sentinelle'], bosses: [['r1_aegis'], ['r1_vharn', 'r1_sylk'], ['r1_selenia'], ['r1_vortharion']] },
  { id: 'cendre', kind: 'raid', name: 'Le Trône de Cendre-Noire', short: 'Cendre-Noire', lvl: [30, 30], theme: 'abyss', layout: RAID_SEQ, size: 10, zone: 'desolation',
    desc: "Sous la Désolation, un trône de lave où la mère de tous les wyrms couve la fin du monde. Raid de fin de jeu pour 10 héros.",
    trash: ['diablotin', 'chien_lave', 'drakonide', 'golem_obsidienne', 'r2_brasier'], bosses: [['r2_gorlath'], ['r2_pyrothe', 'r2_cendrine', 'r2_ardeval'], ['r2_scarnak'], ['r2_nyxaroth']] },
];
export const DUNGEON_BY_ID = Object.fromEntries(DUNGEONS.map((d) => [d.id, d]));
// noms des rencontres à plusieurs boss
export const ENCOUNTER_NAMES = { soeurs: "Les Sœurs de l'hiver", jumeaux: "Les Jumeaux de l'orage", conseil: 'Le Conseil de Cendre' };
export const encounterName = (ids, byId) => ENCOUNTER_NAMES[byId[ids[0]]?.encounter] || ids.map((id) => byId[id].name.split(',')[0]).join(' & ');

// ============================ ABÎME SANS FIN ============================
export const INFINITE = {
  id: 'abime', kind: 'infinite', name: "L'Abîme sans fin", short: 'Abîme', lvl: [10, 30], size: 5,
  desc: "Un gouffre qui n'a pas de fond. Chaque étage est plus dangereux que le précédent ; un gardien veille tous les 5 étages. Jusqu'où descendrez-vous ?",
  themes: ['mine', 'swamp', 'crypt', 'ice', 'fire', 'void'],
};
export const THEME_TRASH = {
  mine: DUNGEONS[0].trash, swamp: DUNGEONS[1].trash, crypt: DUNGEONS[2].trash, ice: DUNGEONS[3].trash, fire: DUNGEONS[4].trash,
  void: ['spectre', 'feu_follet', 'd3_acolyte', 'elementaire_givre', 'r2_brasier', 'gargouille'],
};
export const INFINITE_BOSSES = ['b1_colosse', 'b1_braisegueule', 'b2_glougloss', 'b2_ondrakis', 'b3_geolier', 'b3_veuve', 'b3_morvhal', 'b4_brisegel', 'b4_hjarnok', 'b5_kazdrul', 'b5_ignivore', 'b5_velkyra'];
export const AFFIXES = {
  renforce: { name: 'Renforcé', desc: 'Les monstres ont 25 % de vie en plus.' },
  frenesie: { name: 'Frénésie', desc: 'Sous 30 % de vie, les monstres deviennent frénétiques.' },
  volcanique: { name: 'Volcanique', desc: 'Des éruptions jaillissent sous les pieds des héros en combat.' },
  bouillonnant: { name: 'Bouillonnant', desc: 'Les monstres vaincus laissent une flaque toxique.' },
  tyrannique: { name: 'Tyrannique', desc: 'Le gardien de l\'étage a 30 % de vie et de dégâts en plus.' },
  hatif: { name: 'Hâtif', desc: 'Les monstres se déplacent et frappent 20 % plus vite.' },
};
