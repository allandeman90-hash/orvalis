// Quêtes d'Orvalis (contenu original).
// giver/turnin : id de PNJ, ou [pnjAzur, pnjBraise] pour les régions disputées.
// obj : kill {mob|mobs, n} | collect {item, n} | explore {lm, r} | talk | pvp {n, zone?} | event {ev, n}
import { xpToNext } from '../game/state.js';

const Q = [];
const q = (o) => Q.push({ prereq: [], faction: null, ...o });

// ============================ VAL D'AZUR (Pacte, 1-6) ============================
q({ id: 'val1', name: 'Le serment de Havrebleu', zone: 'val', lvl: 1, faction: 0, giver: 'isaure', turnin: 'gaspard',
  obj: [{ t: 'talk', label: 'Parler à Gaspard, à Clairbourg' }],
  text: "Bienvenue dans le Pacte, recrue. Nos fermes de Clairbourg, à l'est d'ici, sont harcelées par la faune enragée et par des brigands. Rends-toi là-bas et présente-toi au fermier Gaspard. Suis la route, tu ne peux pas la manquer.",
  done: "La commandante t'envoie ? Enfin une bonne nouvelle ! Pose ton sac, on a du travail." });
q({ id: 'val2', name: 'Des loups à la lisière', zone: 'val', lvl: 1, faction: 0, giver: 'gaspard', turnin: 'gaspard', prereq: ['val1'],
  obj: [{ t: 'kill', mob: 'loup_pres', n: 6 }],
  text: "Chaque nuit, les loups des prés descendent jusqu'à mes enclos. J'ai perdu trois brebis cette semaine. Chasse six de ces bêtes dans les prairies autour du village.",
  done: "Six loups de moins ! Mes brebis te remercient, et moi aussi.", gear: true });
q({ id: 'val3', name: 'Rongeurs voraces', zone: 'val', lvl: 2, faction: 0, giver: 'gaspard', turnin: 'gaspard', prereq: ['val1'],
  obj: [{ t: 'collect', item: 'queue_grignoteur', n: 5 }],
  text: "Les grignoteurs dévorent mes réserves de grain. Ces sales bêtes ont des queues longues comme mon bras. Rapporte-m'en cinq comme preuve, et je te paierai une prime.",
  done: "Beurk. Mais c'est bien du travail honnête. Voilà ta prime." });
q({ id: 'val4', name: 'La charge des sangliers', zone: 'val', lvl: 3, faction: 0, giver: 'mathurin', turnin: 'mathurin', prereq: ['val1'],
  obj: [{ t: 'kill', mob: 'sanglier_roux', n: 5 }],
  text: "Les sangliers roux sont devenus fous. Ils chargent les charrettes sur la route du moulin. Abats-en cinq, mais méfie-toi : quand ils prennent de l'élan, écarte-toi.",
  done: "Bien joué. La route sera plus sûre pour les convois.", gear: true });
q({ id: 'val5', name: 'Gelées au bord du lac', zone: 'val', lvl: 3, faction: 0, giver: 'mathurin', turnin: 'mathurin', prereq: ['val4'],
  obj: [{ t: 'kill', mob: 'gelee_verte', n: 5 }],
  text: "Des gelées gluantes sortent du lac au nord-ouest de Clairbourg. Elles empoisonnent l'eau que boivent nos bêtes. Éclate-en cinq.",
  done: "Tu sens la vase, mais le lac respire mieux." });
q({ id: 'val6', name: 'Les ombres du Vieux Moulin', zone: 'val', lvl: 4, faction: 0, giver: 'gaspard', turnin: 'gaspard', prereq: ['val2'],
  obj: [{ t: 'explore', lm: 'moulin', r: 26, label: 'Explorer le Vieux Moulin' }, { t: 'kill', mobs: ['brigand', 'brigand_arbaletrier'], n: 6, label: 'Brigands du Moulin vaincus' }],
  text: "Le Vieux Moulin, au nord-est, est occupé par une bande de brigands. Ils rançonnent les voyageurs et volent nos récoltes. Va les déloger. Six d'entre eux devraient suffire à faire fuir les autres.",
  done: "Le moulin est libre ? Mon grand-père l'a construit de ses mains. Merci, du fond du cœur.", gear: true });
q({ id: 'val7', name: 'Les sceaux des brigands', zone: 'val', lvl: 5, faction: 0, giver: 'mathurin', turnin: 'mathurin', prereq: ['val6'],
  obj: [{ t: 'collect', item: 'sceau_brigand', n: 6 }],
  text: "Ces brigands portent tous un sceau de cire au même motif. Quelqu'un les paie, et je veux savoir qui. Rapporte-moi six de ces sceaux.",
  done: "Ce motif… je l'ai déjà vu sur des lettres venues de l'est. Je vais prévenir la commandante." });
q({ id: 'val8', name: 'Croc-Balafré', zone: 'val', lvl: 6, faction: 0, giver: 'mathurin', turnin: 'mathurin', prereq: ['val5'],
  obj: [{ t: 'kill', mob: 'croc_balafre', n: 1 }],
  text: "Un loup énorme mène la meute depuis le Cercle des Pierres Levées, au nord-ouest. On l'appelle Croc-Balafré. C'est lui qui rend les autres si agressifs. Élimine-le, mais ne pars pas seul : il est bien plus coriace que les autres.",
  done: "Croc-Balafré est tombé ! Le Val va enfin retrouver le calme.", gear: 'elite' });
q({ id: 'val9', name: 'Vers Bois-Murmure', zone: 'val', lvl: 6, faction: 0, giver: 'gaspard', turnin: 'elina', prereq: ['val6'],
  obj: [{ t: 'talk', label: 'Parler à Élina Fougère, au Poste de Chênevert' }],
  text: "Tu as fait tes preuves ici. Au sud, dans la forêt de Bois-Murmure, la rôdeuse Élina Fougère a besoin de gens comme toi. Suis la route vers le sud, au-delà du col.",
  done: "Gaspard t'envoie ? Parfait. La forêt a besoin d'une lame de plus." });
q({ id: 'valc', name: "L'enclume de Gaudry", zone: 'val', lvl: 2, faction: 0, giver: 'anselme', turnin: 'gaudry', prereq: [],
  obj: [{ t: 'talk', label: 'Parler au forgeron Gaudry, à Havrebleu' }],
  text: "Un conseil de vieux moine : ton équipement te sauvera plus souvent que ta chance. Va voir Gaudry, notre forgeron. Il sait renforcer l'acier grâce aux éclats runiques que lâchent les créatures.",
  done: "Anselme t'envoie, hein ? Tiens, quelques éclats pour commencer. Reviens me voir quand tu en auras d'autres.", shards: 4 });
q({ id: 'valm', name: 'Du haut des remparts', zone: 'val', lvl: 3, faction: 0, giver: 'margot', turnin: 'margot', prereq: [],
  obj: [{ t: 'explore', lm: 'pierres_levees', r: 30, label: 'Observer le Cercle des Pierres Levées' }],
  text: "D'ici, je vois d'étranges lueurs au Cercle des Pierres Levées, au nord de la ville. Va jeter un œil, et reviens me dire ce que tu as vu. Prudence : c'est le territoire d'une meute.",
  done: "Une pierre qui brille toute seule ? Je vais noter ça dans le registre. Merci pour ton courage." });

// ============================ TERRES DE BRAISE (Clans, 1-6) ============================
q({ id: 'ter1', name: 'Le sang des clans', zone: 'terres', lvl: 1, faction: 1, giver: 'korvash', turnin: 'ashka',
  obj: [{ t: 'talk', label: 'Parler à Ashka, à Rougecamp' }],
  text: "Tu portes les couleurs des Clans, alors prouve que tu les mérites. Rougecamp, au nord-ouest, manque de chasseurs. Présente-toi à la traqueuse Ashka.",
  done: "Korvash t'envoie ? Il a bon œil, en général. On verra bien." });
q({ id: 'ter2', name: 'Hyènes affamées', zone: 'terres', lvl: 1, faction: 1, giver: 'ashka', turnin: 'ashka', prereq: ['ter1'],
  obj: [{ t: 'kill', mob: 'hyene', n: 6 }],
  text: "Les hyènes galeuses rôdent autour du camp et attaquent nos porteurs d'eau. Abats-en six. Elles fuient rarement, alors garde tes distances quand la meute se regroupe.",
  done: "Leurs ricanements ne me manqueront pas.", gear: true });
q({ id: 'ter3', name: 'Dards pour la chamane', zone: 'terres', lvl: 2, faction: 1, giver: 'borag', turnin: 'borag', prereq: ['ter1'],
  obj: [{ t: 'collect', item: 'dard_scorpion', n: 5 }],
  text: "La chamane Ulka prépare un onguent contre les fièvres. Il lui faut des dards de scorpion ocre, encore frais. Cinq, pas un de moins. Et ne te fais pas piquer, gamin.",
  done: "Ils sont encore tièdes. Parfait." });
q({ id: 'ter4', name: 'Charognards', zone: 'terres', lvl: 3, faction: 1, giver: 'ashka', turnin: 'ashka', prereq: ['ter1'],
  obj: [{ t: 'kill', mob: 'vautour', n: 5 }],
  text: "Les vautours annoncent la mort, et ils finissent par la provoquer. Ils se posent sur nos réserves de viande séchée. Abats-en cinq.",
  done: "Le ciel est plus calme. Pour l'instant.", gear: true });
q({ id: 'ter5', name: 'Braises vivantes', zone: 'terres', lvl: 3, faction: 1, giver: 'borag', turnin: 'borag', prereq: ['ter4'],
  obj: [{ t: 'kill', mob: 'gelee_braise', n: 5 }],
  text: "Des gelées brûlantes suintent des fissures du sol. Elles mettent le feu aux herbes sèches. Éteins-en cinq, et prends garde aux brûlures.",
  done: "Ça sent le roussi, mais c'est fait." });
q({ id: 'ter6', name: 'Le Camp des Pillards', zone: 'terres', lvl: 4, faction: 1, giver: 'ashka', turnin: 'ashka', prereq: ['ter2'],
  obj: [{ t: 'explore', lm: 'camp_pillards', r: 26, label: 'Repérer le Camp des Pillards' }, { t: 'kill', mobs: ['pillard', 'pillard_lanceur'], n: 6, label: 'Pillards des dunes vaincus' }],
  text: "Des pillards des dunes ont dressé leurs tentes à l'ouest, sur la route du Cœur. Ils attaquent nos caravanes. Trouve leur camp et renvoie six d'entre eux dans le sable.",
  done: "Ils réfléchiront à deux fois avant de voler un clan.", gear: true });
q({ id: 'ter7', name: 'Insignes volés', zone: 'terres', lvl: 5, faction: 1, giver: 'borag', turnin: 'borag', prereq: ['ter6'],
  obj: [{ t: 'collect', item: 'insigne_pillard', n: 6 }],
  text: "Ces pillards portent des insignes étrangers. Je veux savoir d'où ils viennent. Ramène-m'en six.",
  done: "Ce symbole vient de l'ouest… de très loin à l'ouest. Intéressant." });
q({ id: 'ter8', name: 'Mâchoire-de-Fer', zone: 'terres', lvl: 6, faction: 1, giver: 'ashka', turnin: 'ashka', prereq: ['ter5'],
  obj: [{ t: 'kill', mob: 'machoire_fer', n: 1 }],
  text: "Une hyène monstrueuse règne sur l'oasis de Sèchepierre, au sud-est. Ses crocs sont couverts de métal rouillé. On l'appelle Mâchoire-de-Fer. Trouve de l'aide et abats-la.",
  done: "Ta réputation va grimper dans tout le clan. Bien joué.", gear: 'elite' });
q({ id: 'ter9', name: 'Vers le Canyon des Scories', zone: 'terres', lvl: 6, faction: 1, giver: 'ashka', turnin: 'rukh', prereq: ['ter6'],
  obj: [{ t: 'talk', label: 'Parler à Rukh, au Camp Scorie-Noire' }],
  text: "Tu es prêt pour plus dangereux. Au sud, le Canyon des Scories grouille de kobolds. Le contremaître Rukh a besoin de bras. Suis la route du sud.",
  done: "Ashka t'envoie ? Bon. J'espère que tu n'as pas peur du noir." });
q({ id: 'terc', name: 'La forge de Brenna', zone: 'terres', lvl: 2, faction: 1, giver: 'ulka', turnin: 'brenna', prereq: [],
  obj: [{ t: 'talk', label: 'Parler à Brenna Poing-de-Fer, à Forge-Cendre' }],
  text: "Les esprits disent qu'une lame nourrie d'éclats runiques ne se brise jamais. Va voir Brenna, notre forgeronne. Elle te montrera comment renforcer ton équipement.",
  done: "Ulka et ses esprits… Enfin. Prends ces éclats, et reviens avec d'autres.", shards: 4 });
q({ id: 'term', name: 'La vue des mesas', zone: 'terres', lvl: 3, faction: 1, giver: 'kesh', turnin: 'kesh', prereq: [],
  obj: [{ t: 'explore', lm: 'oasis', r: 30, label: "Observer l'oasis de Sèchepierre" }],
  text: "Des traces énormes mènent à l'oasis de Sèchepierre, au sud. Va voir ce qui s'y cache, et reviens me faire ton rapport. Ne joue pas au héros.",
  done: "Une hyène grande comme un loup de guerre ? Il faudra une vraie chasse." });

// ============================ BOIS-MURMURE (Pacte, 6-12) ============================
q({ id: 'bois1', name: 'Toiles et venin', zone: 'bois', lvl: 7, faction: 0, giver: 'elina', turnin: 'elina', prereq: [],
  obj: [{ t: 'kill', mob: 'araignee', n: 8 }],
  text: "Les araignées sylvestres tissent leurs toiles jusqu'aux abords du poste. Hier, un de nos éclaireurs a été retrouvé emmailloté. Détruis-en huit.",
  done: "La forêt respire mieux sans elles.", gear: true });
q({ id: 'bois2', name: "Le remède de l'herboriste", zone: 'bois', lvl: 7, faction: 0, giver: 'maelle', turnin: 'maelle', prereq: [],
  obj: [{ t: 'collect', item: 'glande_venin', n: 6 }],
  text: "Le venin des araignées sylvestres est mortel, mais, bien préparé, il devient un antidote puissant. Rapporte-moi six glandes à venin intactes.",
  done: "Parfaites ! Ce remède sauvera des vies au front." });
q({ id: 'bois3', name: "Des peaux pour l'hiver", zone: 'bois', lvl: 8, faction: 0, giver: 'elina', turnin: 'elina', prereq: ['bois1'],
  obj: [{ t: 'collect', item: 'peau_ours', n: 5 }],
  text: "L'hiver sera rude au poste. Les ours des fougères ont une fourrure épaisse, mais un caractère exécrable. Ramène cinq peaux.",
  done: "Mes soldats auront chaud grâce à toi.", gear: true });
q({ id: 'bois4', name: 'Souche-Creuse', zone: 'bois', lvl: 9, faction: 0, giver: 'elina', turnin: 'elina', prereq: ['bois1'],
  obj: [{ t: 'explore', lm: 'camp_gobelin', r: 28, label: 'Trouver le camp de Souche-Creuse' }, { t: 'kill', mobs: ['gobelin', 'gobelin_mystique'], n: 8, label: 'Gobelins vaincus' }],
  text: "Des gobelins ont creusé leur repaire dans une souche gigantesque, au sud-est du poste. Ils volent nos outils et empoisonnent nos puits. Trouve leur camp et mets-y de l'ordre.",
  done: "Ils vont mettre des semaines à s'en remettre.", gear: true });
q({ id: 'bois5', name: 'Babioles gobelines', zone: 'bois', lvl: 9, faction: 0, giver: 'maelle', turnin: 'maelle', prereq: ['bois2'],
  obj: [{ t: 'collect', item: 'babiole_gobeline', n: 7 }],
  text: "Les gobelins mystiques utilisent de drôles de babioles pour lancer leurs sorts. Je voudrais les étudier. Sept devraient suffire.",
  done: "Fascinant ! Des os, des plumes… et un bouton de manteau. Quelle magie étrange." });
q({ id: 'bois6', name: 'Le chef Grincedent', zone: 'bois', lvl: 11, faction: 0, giver: 'elina', turnin: 'elina', prereq: ['bois4'],
  obj: [{ t: 'kill', mob: 'grincedent', n: 1 }],
  text: "Le chef des gobelins, Grincedent, a survécu à ton passage. Tant qu'il vivra, sa tribu reviendra. Retourne à Souche-Creuse et abats-le. Emmène du monde.",
  done: "Grincedent n'est plus. Tu as la reconnaissance du Pacte.", gear: 'elite' });
q({ id: 'bois7', name: 'La sève corrompue', zone: 'bois', lvl: 11, faction: 0, giver: 'maelle', turnin: 'maelle', prereq: ['bois5'],
  obj: [{ t: 'collect', item: 'coeur_seve', n: 5 }],
  text: "Au plus profond du bois, des sylvains se sont réveillés, corrompus. Leur cœur de sève est noir. Rapporte-m'en cinq, que je comprenne ce qui les ronge.",
  done: "Cette noirceur… elle vient du nord. Du Cœur d'Orvalis." });
q({ id: 'bois8', name: 'La Reine des toiles', zone: 'bois', lvl: 12, faction: 0, giver: 'elina', turnin: 'elina', prereq: ['bois6'],
  obj: [{ t: 'kill', mob: 'tisseuse', n: 1 }],
  text: "Toutes ces araignées viennent d'un même nid, au sud-ouest de la forêt. Leur mère, la Tisseuse, est un monstre gros comme une maison. C'est une mission de groupe. Ne la sous-estime pas.",
  done: "La Tisseuse est morte ! Bois-Murmure te doit une fière chandelle.", gear: 'boss' });
q({ id: 'bois9', name: 'Vers le Marais', zone: 'bois', lvl: 12, faction: 0, giver: 'elina', turnin: 'hugues', prereq: ['bois4'],
  obj: [{ t: 'talk', label: 'Parler au sergent Hugues Brisard, à Fort Roseau' }],
  text: "Le front se déplace. À l'est, dans le Marais de Vasegrise, le sergent Hugues Brisard tient Fort Roseau face aux Clans de Braise. Il a besoin de renforts.",
  done: "Un renfort ? Enfin ! Pose-toi, et garde les pieds au sec si tu peux." });

// ============================ CANYON DES SCORIES (Clans, 6-12) ============================
q({ id: 'can1', name: 'Ailes de la nuit', zone: 'canyon', lvl: 7, faction: 1, giver: 'rukh', turnin: 'rukh', prereq: [],
  obj: [{ t: 'kill', mob: 'chauve_souris', n: 8 }],
  text: "Des chauves-souris géantes sortent des failles à la tombée du jour. Elles saignent nos mineurs à blanc. Abats-en huit.",
  done: "Mes gars vont pouvoir travailler tranquilles.", gear: true });
q({ id: 'can2', name: 'Glandes ignées', zone: 'canyon', lvl: 8, faction: 1, giver: 'nerith', turnin: 'nerith', prereq: [],
  obj: [{ t: 'collect', item: 'glande_ignee', n: 6 }],
  text: "Les salamandres de scories crachent le feu grâce à une glande sous leur gorge. Rapporte-m'en six, j'ai une idée… explosive.",
  done: "Merveilleux ! Maintenant, ne reste pas trop près de mon établi." });
q({ id: 'can3', name: 'Les terriers de Fouille-Suie', zone: 'canyon', lvl: 8, faction: 1, giver: 'rukh', turnin: 'rukh', prereq: ['can1'],
  obj: [{ t: 'explore', lm: 'terrier_kobold', r: 26, label: 'Repérer les terriers de Fouille-Suie' }, { t: 'kill', mobs: ['kobold', 'kobold_dynamiteur'], n: 8, label: 'Kobolds vaincus' }],
  text: "Les kobolds ont creusé un réseau de terriers à l'ouest du camp. Ils ont volé nos filons et nos lampes. Va leur montrer qui commande dans ce canyon.",
  done: "Ils n'oseront plus s'approcher de nos galeries.", gear: true });
q({ id: 'can4', name: 'Bougies volées', zone: 'canyon', lvl: 9, faction: 1, giver: 'nerith', turnin: 'nerith', prereq: ['can2'],
  obj: [{ t: 'collect', item: 'bougie_kobold', n: 7 }],
  text: "Les kobolds portent des bougies sur la tête. Ces bougies ne s'éteignent jamais, même sous la pluie. Il m'en faut sept.",
  done: "De la cire de scorie ! Voilà pourquoi elles résistent à tout." });
q({ id: 'can5', name: 'Grand-Mèche', zone: 'canyon', lvl: 11, faction: 1, giver: 'rukh', turnin: 'rukh', prereq: ['can3'],
  obj: [{ t: 'kill', mob: 'grand_meche', n: 1 }],
  text: "Le chef des kobolds s'appelle Grand-Mèche. Il lance des bombes plus grosses que sa tête. Élimine-le, et ne reste pas dans les cercles de feu.",
  done: "Grand-Mèche est éteint ! Ha ! Bon travail.", gear: 'elite' });
q({ id: 'can6', name: 'Noyaux de scorie', zone: 'canyon', lvl: 11, faction: 1, giver: 'nerith', turnin: 'nerith', prereq: ['can4'],
  obj: [{ t: 'collect', item: 'noyau_scorie', n: 5 }],
  text: "Les golems de scories tiennent debout grâce à un noyau brûlant. Ramène-m'en cinq, j'ai besoin de chaleur pour mes expériences.",
  done: "Ils palpitent encore… Magnifique et terrifiant." });
q({ id: 'can7', name: 'Le cœur de la mine', zone: 'canyon', lvl: 12, faction: 1, giver: 'rukh', turnin: 'rukh', prereq: ['can5'],
  obj: [{ t: 'kill', mob: 'coeur_magma', n: 1 }],
  text: "Au fond de la Mine de Gueule-Noire, au sud-est, quelque chose s'est réveillé. Un golem de magma, plus grand que tous les autres. Rassemble un groupe et arrête-le avant qu'il n'effondre tout le canyon.",
  done: "La mine ne tremble plus. Les clans chanteront ton nom.", gear: 'boss' });
q({ id: 'can8', name: 'Vers le Marais', zone: 'canyon', lvl: 12, faction: 1, giver: 'rukh', turnin: 'zarka', prereq: ['can3'],
  obj: [{ t: 'talk', label: 'Parler à la capitaine Zarka, au Bivouac des Crocs' }],
  text: "Tu es trop bon pour ce canyon. À l'ouest, la capitaine Zarka tient le Bivouac des Crocs, dans le Marais de Vasegrise. Là-bas, les Azuréens ne sont jamais loin.",
  done: "Rukh t'envoie ? Bien. Le marais a soif de guerriers." });

// ============================ MARAIS DE VASEGRISE (disputé, 12-18) ============================
q({ id: 'mar1', name: 'Écailles et lances', zone: 'marais', lvl: 13, giver: ['hugues', 'zarka'], turnin: ['hugues', 'zarka'], prereq: [],
  obj: [{ t: 'kill', mobs: ['crapoussin', 'crapoussin_sorcier'], n: 8, label: 'Crapoussins vaincus' }],
  text: "Les Crapoussins, ce peuple de grenouilles guerrières, attaquent tout ce qui s'approche de leurs eaux. Ils nous empêchent d'avancer dans le marais. Repousse-les : huit guerriers ou sorciers suffiront.",
  done: "Ils coassent moins fort, d'un coup.", gear: true });
q({ id: 'mar2', name: 'Cuir de croco', zone: 'marais', lvl: 14, giver: ['amandine', 'fenn'], turnin: ['amandine', 'fenn'], prereq: [],
  obj: [{ t: 'collect', item: 'cuir_croco', n: 6 }],
  text: "Le cuir des crocodiles des vases est imperméable. Avec, je peux fabriquer des bandages qui ne pourrissent pas dans l'humidité. Ramène-m'en six morceaux.",
  done: "C'est exactement ce qu'il me fallait. Merci." });
q({ id: 'mar3', name: 'Sang épais', zone: 'marais', lvl: 15, giver: ['amandine', 'fenn'], turnin: ['amandine', 'fenn'], prereq: ['mar2'],
  obj: [{ t: 'collect', item: 'sang_sangsue', n: 5 }],
  text: "Le sang des sangsues géantes empêche les plaies de coaguler… mais, dilué, il soigne les caillots. Cinq fioles, s'il te plaît. Et ne te laisse pas vider.",
  done: "Beau travail. Tu es tout pâle, assieds-toi une minute.", gear: true });
q({ id: 'mar4', name: 'Lueurs trompeuses', zone: 'marais', lvl: 16, giver: ['hugues', 'zarka'], turnin: ['hugues', 'zarka'], prereq: ['mar1'],
  obj: [{ t: 'kill', mob: 'feu_follet', n: 7 }],
  text: "Les feux-follets attirent nos patrouilles dans les tourbières, où elles s'enlisent. Éteins-en sept avant qu'ils ne fassent d'autres victimes.",
  done: "Le marais est un peu moins traître, grâce à toi." });
q({ id: 'mar5', name: 'Bourg-Crapoussin', zone: 'marais', lvl: 15, giver: ['hugues', 'zarka'], turnin: ['hugues', 'zarka'], prereq: ['mar1'],
  obj: [{ t: 'explore', lm: 'village_crapoussin', r: 30, label: 'Infiltrer Bourg-Crapoussin' }, { t: 'collect', item: 'ecaille_crapoussin', n: 8 }],
  text: "Le village des Crapoussins se trouve au sud, sur pilotis. Leurs écailles font d'excellentes armures légères. Va là-bas et rapporte-m'en huit.",
  done: "Avec ça, nos éclaireurs seront mieux protégés.", gear: true });
q({ id: 'mar6', name: 'La Sorcière des tourbières', zone: 'marais', lvl: 17, giver: ['amandine', 'fenn'], turnin: ['amandine', 'fenn'], prereq: ['mar4'],
  obj: [{ t: 'kill', mob: 'sorciere', n: 1 }],
  text: "Une sorcière vit à l'est du village des Crapoussins. C'est elle qui commande aux feux-follets. Arrête-la, et le marais redeviendra un simple marais.",
  done: "Son sortilège est brisé. Je le sens dans l'air.", gear: 'elite' });
q({ id: 'mar7', name: 'La Mère Vase', zone: 'marais', lvl: 18, giver: ['hugues', 'zarka'], turnin: ['hugues', 'zarka'], prereq: ['mar5'],
  obj: [{ t: 'kill', mob: 'mere_vase', n: 1 }],
  text: "Tout au sud, dans le Bourbier, vit la Mère Vase, un crapaud colossal vénéré par les Crapoussins. Tant qu'elle vivra, ils se battront. Réunis un groupe solide.",
  done: "La Mère Vase est tombée ! Le marais est à nous.", gear: 'boss' });
q({ id: 'mar8', name: 'Guerre dans les roseaux', zone: 'marais', lvl: 14, giver: ['hugues', 'zarka'], turnin: ['hugues', 'zarka'], prereq: [],
  obj: [{ t: 'pvp', n: 5, zone: 'marais', label: 'Ennemis de la faction adverse vaincus dans le marais' }],
  text: "L'ennemi patrouille dans le marais. Chaque soldat adverse abattu, c'est un pas de plus vers la victoire. Élimine-en cinq dans le Marais de Vasegrise.",
  done: "Voilà comment on gagne une guerre. Un par un.", gear: true, fame: 40 });
q({ id: 'mar9', name: "Vers le Cœur d'Orvalis", zone: 'marais', lvl: 18, giver: ['hugues', 'zarka'], turnin: ['severin', 'kaelgor'], prereq: ['mar5'],
  obj: [{ t: 'talk', label: "Rejoindre l'avant-poste du Cœur d'Orvalis" }],
  text: "Au nord, le Cœur d'Orvalis. Les ruines de l'ancien royaume, où les morts se relèvent et où les deux factions se disputent le Bastion. Notre avant-poste y a besoin de vétérans.",
  done: "Bienvenue au Cœur. Ici, rien ne reste mort très longtemps." });

// ============================ CŒUR D'ORVALIS (disputé, 18-24) ============================
q({ id: 'coe1', name: 'Les légions sans repos', zone: 'coeur', lvl: 19, giver: ['severin', 'kaelgor'], turnin: ['severin', 'kaelgor'], prereq: [],
  obj: [{ t: 'kill', mobs: ['squelette', 'squelette_archer'], n: 10, label: 'Squelettes détruits' }],
  text: "Les squelettes de l'ancienne légion marchent encore en formation autour des ruines. Brise leurs rangs : dix d'entre eux.",
  done: "Qu'ils reposent en paix, cette fois.", gear: true });
q({ id: 'coe2', name: "Os pour l'archiviste", zone: 'coeur', lvl: 19, giver: ['clemence', 'sombreflamme'], turnin: ['clemence', 'sombreflamme'], prereq: [],
  obj: [{ t: 'collect', item: 'os_ancien', n: 8 }],
  text: "Les os des squelettes portent des gravures, les mêmes que sur les murs du Bastion. Rapporte-m'en huit, je veux les déchiffrer.",
  done: "« Un seul royaume, une seule couronne. » Voilà ce qu'ils disent. Comme c'est ironique." });
q({ id: 'coe3', name: 'Chasse aux spectres', zone: 'coeur', lvl: 21, giver: ['clemence', 'sombreflamme'], turnin: ['clemence', 'sombreflamme'], prereq: ['coe2'],
  obj: [{ t: 'collect', item: 'ectoplasme', n: 6 }],
  text: "Les spectres errants laissent derrière eux un ectoplasme luisant. Il pourrait nous révéler qui les rappelle à la vie. Six échantillons.",
  done: "Cette énergie… elle vient de la crypte, sous les ruines.", gear: true });
q({ id: 'coe4', name: 'Pierre qui vole', zone: 'coeur', lvl: 22, giver: ['severin', 'kaelgor'], turnin: ['severin', 'kaelgor'], prereq: ['coe1'],
  obj: [{ t: 'kill', mob: 'gargouille', n: 8 }],
  text: "Les gargouilles des ruines se réveillent et fondent sur nos patrouilles. Abats-en huit, et garde un œil sur le ciel.",
  done: "Des tas de gravats. Parfait." });
q({ id: 'coe5', name: "Le Bastion d'Orvalis", zone: 'coeur', lvl: 20, giver: ['severin', 'kaelgor'], turnin: ['severin', 'kaelgor'], prereq: [],
  obj: [{ t: 'event', ev: 'bastion', n: 60, label: 'Secondes passées à défendre ou capturer le Bastion' }],
  text: "Le Bastion, au centre des ruines, est la clé du Cœur. La faction qui le tient gagne la bénédiction du Bastion : plus d'expérience pour tous ses membres. Tiens-toi dans le cercle du Bastion pour aider à le capturer ou à le défendre.",
  done: "Chaque seconde passée là-bas compte. Merci, soldat.", gear: true, fame: 50 });
q({ id: 'coe6', name: 'Le Chevalier maudit', zone: 'coeur', lvl: 23, giver: ['severin', 'kaelgor'], turnin: ['severin', 'kaelgor'], prereq: ['coe4'],
  obj: [{ t: 'kill', mob: 'chevalier_maudit', n: 1 }],
  text: "Un chevalier en armure noire garde l'entrée de la Crypte d'Ossevaine, au sud du Bastion. Il était le champion du dernier roi. Il est temps de le libérer de son serment.",
  done: "Son épée est enfin silencieuse.", gear: 'elite' });
q({ id: 'coe7', name: 'La Reine-Liche', zone: 'coeur', lvl: 24, giver: ['clemence', 'sombreflamme'], turnin: ['clemence', 'sombreflamme'], prereq: ['coe3'],
  obj: [{ t: 'kill', mob: 'ossevaine', n: 1 }],
  text: "C'est elle. Ossevaine, la dernière reine d'Orvalis, devenue liche. Elle relève les morts pour reconstruire un royaume qui n'existe plus. Rassemble les plus forts et mets fin à son règne.",
  done: "Le Cœur est libéré de sa reine. L'histoire retiendra ton nom.", gear: 'boss' });
q({ id: 'coe8', name: 'Sang pour la bannière', zone: 'coeur', lvl: 20, giver: ['severin', 'kaelgor'], turnin: ['severin', 'kaelgor'], prereq: [],
  obj: [{ t: 'pvp', n: 8, zone: 'coeur', label: "Ennemis vaincus au Cœur d'Orvalis" }],
  text: "Nos ennemis se croient chez eux dans ces ruines. Montre-leur le contraire : huit victoires contre la faction adverse, au Cœur d'Orvalis.",
  done: "Ta bannière flotte plus haut que la leur.", gear: true, fame: 60 });
q({ id: 'coe9', name: 'Vers les Pics Gelés', zone: 'coeur', lvl: 24, giver: ['severin', 'kaelgor'], turnin: ['armand', 'oran'], prereq: ['coe4'],
  obj: [{ t: 'talk', label: "Rejoindre l'avant-poste des Pics Gelés" }],
  text: "Au nord-ouest, les Pics Gelés. Les trolls des glaces y descendent des sommets. Notre avant-poste a besoin de combattants aguerris.",
  done: "Tu as fait tout ce chemin ? Viens près du feu." });

// ============================ PICS GELÉS (disputé, 24-27) ============================
q({ id: 'pic1', name: 'Fourrures givrées', zone: 'pics', lvl: 24, giver: ['armand', 'oran'], turnin: ['armand', 'oran'], prereq: [],
  obj: [{ t: 'collect', item: 'fourrure_givre', n: 8 }],
  text: "Nos éclaireurs gèlent sur place. Les loups des neiges et les yétis ont des fourrures qui résistent au pire blizzard. Rapporte-m'en huit.",
  done: "Enfin de quoi tenir jusqu'au printemps.", gear: true });
q({ id: 'pic2', name: 'Le pas du yéti', zone: 'pics', lvl: 25, giver: ['armand', 'oran'], turnin: ['armand', 'oran'], prereq: [],
  obj: [{ t: 'kill', mob: 'yeti', n: 8 }],
  text: "Les yétis des cimes descendent vers les cols et piétinent tout. Huit d'entre eux, et le passage sera dégagé.",
  done: "Le col est libre. Pour un temps." });
q({ id: 'pic3', name: 'Éclats de givre', zone: 'pics', lvl: 26, giver: ['armand', 'oran'], turnin: ['armand', 'oran'], prereq: ['pic1'],
  obj: [{ t: 'collect', item: 'eclat_givre', n: 6 }],
  text: "Les élémentaires de givre tournoient autour du Lac Gelé. Leurs éclats ne fondent jamais. Nos mages en veulent six pour leurs études.",
  done: "Même dans ma main, il reste glacé. Incroyable.", gear: true });
q({ id: 'pic4', name: "L'Antre des Trolls", zone: 'pics', lvl: 26, giver: ['armand', 'oran'], turnin: ['armand', 'oran'], prereq: ['pic2'],
  obj: [{ t: 'explore', lm: 'antre_trolls', r: 30, label: "Trouver l'Antre des Trolls" }, { t: 'collect', item: 'defense_troll', n: 6 }],
  text: "Les trolls des glaces ont leur antre tout au nord-ouest. Ils se régénèrent si vite que seules leurs défenses prouvent qu'on les a vaincus. Ramène-en six.",
  done: "Six défenses ! Les trolls vont se méfier de toi.", gear: true });
q({ id: 'pic5', name: 'Le Jarl Crocglace', zone: 'pics', lvl: 27, giver: ['armand', 'oran'], turnin: ['armand', 'oran'], prereq: ['pic4'],
  obj: [{ t: 'kill', mob: 'jarl', n: 1 }],
  text: "Le chef des trolls, le Jarl Crocglace, règne sur l'Antre. Sa hache gèle tout ce qu'elle touche. Abats-le, et les trolls se disperseront.",
  done: "Le Jarl est tombé. Les Pics sont à nous.", gear: 'elite' });
q({ id: 'pic6', name: 'Vers la Désolation', zone: 'pics', lvl: 27, giver: ['armand', 'oran'], turnin: ['nora', 'ignara'], prereq: ['pic4'],
  obj: [{ t: 'talk', label: "Rejoindre l'avant-poste de la Désolation Cendrée" }],
  text: "À l'est de la Cime s'étend la Désolation Cendrée : cendres, lave et dragons. Notre avant-poste là-bas a besoin de toi. Passe par la Cime des Tempêtes.",
  done: "Tu as traversé la Cime ? Tu as du cran." });

// ============================ DÉSOLATION CENDRÉE (disputé, 27-30) ============================
q({ id: 'des1', name: 'Cornes de diablotin', zone: 'desolation', lvl: 27, giver: ['nora', 'ignara'], turnin: ['nora', 'ignara'], prereq: [],
  obj: [{ t: 'collect', item: 'corne_diablotin', n: 8 }],
  text: "Les diablotins de cendre nous harcèlent de boules de feu. Leurs cornes prouvent qu'on les a éliminés. Rapporte-m'en huit.",
  done: "Ils ont l'air moins drôles sans leurs cornes.", gear: true });
q({ id: 'des2', name: 'Crocs de lave', zone: 'desolation', lvl: 28, giver: ['nora', 'ignara'], turnin: ['nora', 'ignara'], prereq: [],
  obj: [{ t: 'collect', item: 'croc_lave', n: 6 }],
  text: "Les chiens de lave chassent en meute et leurs crocs restent brûlants des heures. Six crocs, pour nos forgerons.",
  done: "Nos lames vont apprécier." });
q({ id: 'des3', name: "Cœur d'obsidienne", zone: 'desolation', lvl: 28, giver: ['nora', 'ignara'], turnin: ['nora', 'ignara'], prereq: ['des1'],
  obj: [{ t: 'kill', mob: 'golem_obsidienne', n: 6 }],
  text: "Les golems d'obsidienne sont presque invulnérables. Presque. Abats-en six, et montre-leur que rien n'est éternel.",
  done: "Six montagnes de verre noir. Bravo.", gear: true });
q({ id: 'des4', name: 'Les Drakônides', zone: 'desolation', lvl: 29, giver: ['nora', 'ignara'], turnin: ['nora', 'ignara'], prereq: ['des2'],
  obj: [{ t: 'kill', mob: 'drakonide', n: 8 }],
  text: "Les drakônides servent le Wyrm de Cendre. Ils gardent la route de la Caldeira, au nord-est. Élimine-en huit pour ouvrir le chemin.",
  done: "La route de la Caldeira est ouverte." });
q({ id: 'des5', name: 'Le Wyrm de Cendre', zone: 'desolation', lvl: 30, giver: ['nora', 'ignara'], turnin: ['nora', 'ignara'], prereq: ['des4'],
  obj: [{ t: 'kill', mob: 'vyrmathra', n: 1 }],
  text: "Vyrmathra, le Wyrm de Cendre, dort dans la Caldeira. Quand il se réveille, le ciel brûle. Rassemble les meilleurs combattants de ta faction et abats-le.",
  done: "Le Wyrm est mort ! La Désolation respire enfin.", gear: 'boss' });
q({ id: 'des6', name: 'Vers la Cime des Tempêtes', zone: 'desolation', lvl: 30, giver: ['nora', 'ignara'], turnin: ['ysolde', 'thessa'], prereq: ['des3'],
  obj: [{ t: 'talk', label: "Rejoindre l'avant-poste de la Cime des Tempêtes" }],
  text: "Tu es prêt pour la Cime des Tempêtes. Là-haut, notre avant-poste guette le retour d'Azhkar, le Dévoreur d'Orages. Va les rejoindre.",
  done: "Les éclairs t'ont laissé passer. Bon présage." });

// ============================ CIME DES TEMPÊTES (30) ============================
q({ id: 'cim1', name: "Plumes d'orage", zone: 'cime', lvl: 30, giver: ['ysolde', 'thessa'], turnin: ['ysolde', 'thessa'], prereq: [],
  obj: [{ t: 'collect', item: 'plume_orage', n: 8 }],
  text: "Les harpies des orages portent des plumes chargées d'électricité. Nous en faisons des paratonnerres. Rapporte-m'en huit.",
  done: "Attention, ça pique encore.", gear: true });
q({ id: 'cim2', name: 'Cœurs de foudre', zone: 'cime', lvl: 30, giver: ['ysolde', 'thessa'], turnin: ['ysolde', 'thessa'], prereq: [],
  obj: [{ t: 'collect', item: 'coeur_foudre', n: 6 }],
  text: "Les élémentaires de foudre sont des fragments de l'orage d'Azhkar. Leur cœur contient une part de sa puissance. Six cœurs, et nous pourrons l'affaiblir.",
  done: "Ils vibrent comme des cœurs vivants. Tu as fait du bon travail.", gear: true });
q({ id: 'cim3', name: 'Les Gardiens runiques', zone: 'cime', lvl: 30, giver: ['ysolde', 'thessa'], turnin: ['ysolde', 'thessa'], prereq: ['cim2'],
  obj: [{ t: 'collect', item: 'rune_gardien', n: 6 }],
  text: "Les gardiens runiques et les titans de pierre protègent l'Autel des Tempêtes. Leurs runes pourraient sceller l'orage. Rapporte-m'en six.",
  done: "Avec ces runes, nous tiendrons l'Autel quand le Dévoreur reviendra.", gear: 'elite' });
q({ id: 'cim4', name: "Le Dévoreur d'Orages", zone: 'cime', lvl: 30, giver: ['ysolde', 'thessa'], turnin: ['ysolde', 'thessa'], prereq: ['cim3'],
  obj: [{ t: 'kill', mob: 'azhkar', n: 1, label: "Azhkar vaincu à l'Autel des Tempêtes" }],
  text: "Azhkar descend sur l'Autel des Tempêtes toutes les demi-heures, quand l'orage atteint son sommet. Les deux factions s'y pressent. Sois là, et participe à sa chute.",
  done: "Le Dévoreur est tombé, et tu étais là. Tu es une légende d'Orvalis.", gear: 'boss', fame: 100 });
q({ id: 'cim5', name: 'Héros de guerre', zone: 'cime', lvl: 30, giver: ['ysolde', 'thessa'], turnin: ['ysolde', 'thessa'], prereq: [],
  obj: [{ t: 'pvp', n: 10, label: 'Ennemis de la faction adverse vaincus' }],
  text: "La guerre ne s'arrête jamais au sommet. Abats dix membres de la faction adverse, où que tu les trouves.",
  done: "Dix victoires. Les ménestrels vont avoir du travail.", gear: 'elite', fame: 120 });

// ---------------------------------------------------------------------------
export const QUESTS = Q;
export const QUEST_BY_ID = Object.fromEntries(Q.map((x) => [x.id, x]));

export function questXp(qq) {
  const base = xpToNext(Math.min(29, qq.lvl)) * 0.26;
  const mul = qq.obj.some((o) => o.t === 'talk') && qq.obj.length === 1 ? 0.35 : qq.gear === 'boss' ? 1.8 : qq.gear === 'elite' ? 1.3 : 1;
  return Math.round(base * mul * (qq.main ? 1.5 : 1));
}
export function questGold(qq) {
  return Math.round((8 + qq.lvl * 5) * (qq.gear === 'boss' ? 3 : qq.gear === 'elite' ? 2 : 1));
}
export function resolveNpc(v, faction) {
  return Array.isArray(v) ? v[faction] : v;
}
