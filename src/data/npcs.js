// Personnages non joueurs d'Orvalis (tous originaux). spot : emplacement dans le hub (voir towns.js).
// role : quest, vendor, smith, stable, auction, stash, trainer, leader

export const ROLE_NAMES = {
  quest: 'Donneur de quêtes', vendor: 'Marchand', smith: 'Forgeron', stable: 'Écuyer', auction: 'Hôtel des ventes',
  stash: 'Coffre personnel', trainer: "Maître d'armes", leader: 'Chef de faction', travel: 'Pierre de voyage', guard: 'Garde', citizen: '',
};

export const NPCS = [
  // ===================== HAVREBLEU (Pacte d'Azur) =====================
  { id: 'isaure', hub: 'havrebleu', spot: 'leader', role: 'leader', name: 'Isaure Valcourt', title: 'Commandante du Pacte',
    look: { skin: 1, hair: 3, hairStyle: 1, body: '#2f5da8', helmet: 'circlet', cape: '#1f3f7a', weapon: 'sword' },
    hello: "Le Pacte tient la côte, mais nos frontières saignent. Chaque lame compte, recrue." },
  { id: 'anselme', hub: 'havrebleu', spot: 'quest0', role: 'quest', name: 'Frère Anselme', title: 'Gardien des archives',
    look: { skin: 0, hair: 4, hairStyle: 3, body: '#e8e0c8', beard: true },
    hello: "Les archives racontent qu'Orvalis était un seul royaume, autrefois. Difficile à croire aujourd'hui." },
  { id: 'gaudry', hub: 'havrebleu', spot: 'smith', role: 'smith', name: 'Gaudry', title: 'Maître-forgeron',
    look: { skin: 2, hair: 0, hairStyle: 3, body: '#5a4a3a', beard: true, weapon: 'mace' },
    hello: "Apporte-moi des éclats runiques et de l'or, et ton acier chantera plus fort." },
  { id: 'lise', hub: 'havrebleu', spot: 'vendor', role: 'vendor', name: 'Lise Moreuil', title: 'Marchande',
    look: { skin: 0, hair: 2, hairStyle: 4, body: '#8a3a5a' },
    hello: "Potions, provisions, et un peu d'équipement pour débuter. Tout est frais, promis !" },
  { id: 'bastien', hub: 'havrebleu', spot: 'stable', role: 'stable', name: 'Bastien', title: 'Écuyer',
    look: { skin: 1, hair: 1, hairStyle: 0, body: '#6a5038' },
    hello: "Un bon cheval vaut dix paires de bottes. À partir du niveau 10, je t'en confie un." },
  { id: 'oriane', hub: 'havrebleu', spot: 'auction', role: 'auction', name: 'Oriane', title: 'Commissaire-priseur',
    look: { skin: 3, hair: 7, hairStyle: 1, body: '#3a3a5a', helmet: 'circlet' },
    hello: "Tout Orvalis vend et achète ici. Même les objets que vous n'osez pas porter." },
  { id: 'parrin', hub: 'havrebleu', spot: 'stash', role: 'stash', name: 'Parrin', title: 'Intendant du coffre',
    look: { skin: 1, hair: 4, hairStyle: 3, body: '#4a4a3a' },
    hello: "Votre coffre personnel est bien gardé. Rien ne s'y perd, rien ne s'y vole." },
  { id: 'theobald', hub: 'havrebleu', spot: 'trainer', role: 'trainer', name: 'Théobald', title: "Maître d'armes",
    look: { skin: 2, hair: 0, hairStyle: 0, body: '#6a6a70', weapon: 'sword', helmet: 'plate' },
    hello: "Tes techniques ne te conviennent plus ? Contre un peu d'or, je t'apprends à tout recommencer." },
  { id: 'margot', hub: 'havrebleu', spot: 'quest1', role: 'quest', name: 'Margot la vigie', title: 'Éclaireuse',
    look: { skin: 1, hair: 5, hairStyle: 1, body: '#3a5a3a', hood: '#2a4a2a' },
    hello: "Du haut des remparts, je vois tout. Même les feux des Clans de Braise, loin à l'est." },

  // ===================== CLAIRBOURG =====================
  { id: 'gaspard', hub: 'clairbourg', spot: 'quest0', role: 'quest', name: 'Gaspard', title: 'Fermier',
    look: { skin: 2, hair: 1, hairStyle: 3, body: '#8a7a4a', beard: true },
    hello: "Ah, du renfort ! Mes champs ne se défendront pas tout seuls." },
  { id: 'mathurin', hub: 'clairbourg', spot: 'quest1', role: 'quest', name: 'Mathurin', title: 'Garde-chasse',
    look: { skin: 1, hair: 2, hairStyle: 0, body: '#4a6a3a', hood: '#3a5a2a', weapon: 'bow' },
    hello: "Le gibier devient enragé depuis quelque temps. Quelque chose ne tourne pas rond dans le Val." },
  { id: 'colombe', hub: 'clairbourg', spot: 'vendor', role: 'vendor', name: 'Colombe', title: 'Aubergiste',
    look: { skin: 0, hair: 3, hairStyle: 4, body: '#b8a070' },
    hello: "Un pain chaud, une potion, un lit ? J'ai tout ce qu'il faut, sauf de la patience." },

  // ===================== BOIS-MURMURE / Chênevert =====================
  { id: 'elina', hub: 'chenevert', spot: 'quest0', role: 'quest', name: 'Élina Fougère', title: 'Rôdeuse',
    look: { skin: 1, hair: 6, hairStyle: 1, body: '#3a5a2a', hood: '#2a4020', weapon: 'bow' },
    hello: "Les arbres murmurent des avertissements. Écoute-les, ou tu finiras dans une toile." },
  { id: 'maelle', hub: 'chenevert', spot: 'quest1', role: 'quest', name: 'Maëlle', title: 'Herboriste',
    look: { skin: 0, hair: 2, hairStyle: 4, body: '#6a8a4a', helmet: 'antlers' },
    hello: "Chaque poison a son remède. Il suffit de savoir où chercher, et d'avoir un peu de courage." },
  { id: 'jory', hub: 'chenevert', spot: 'vendor', role: 'vendor', name: 'Jory', title: 'Colporteur',
    look: { skin: 2, hair: 1, hairStyle: 2, body: '#7a5a3a' },
    hello: "J'ai traversé la forêt avec une charrette pleine. Profites-en avant que les gobelins s'en chargent." },

  // ===================== MARAIS / Fort Roseau (Azur) =====================
  { id: 'hugues', hub: 'fort_roseau', spot: 'quest0', role: 'quest', name: 'Hugues Brisard', title: 'Sergent',
    look: { skin: 2, hair: 0, hairStyle: 0, body: '#2f5da8', helmet: 'plate', weapon: 'sword', beard: true },
    hello: "Le marais est une guerre à deux fronts : les bestioles, et les Clans de Braise." },
  { id: 'amandine', hub: 'fort_roseau', spot: 'quest1', role: 'quest', name: 'Amandine', title: 'Guérisseuse',
    look: { skin: 1, hair: 3, hairStyle: 1, body: '#e8e0d0', weapon: 'scepter' },
    hello: "Les fièvres des tourbières emportent plus de soldats que les épées. Aide-moi à les soigner." },
  { id: 'pol', hub: 'fort_roseau', spot: 'vendor', role: 'vendor', name: 'Pol', title: 'Intendant',
    look: { skin: 3, hair: 1, hairStyle: 3, body: '#5a5a3a' },
    hello: "Ravitaillement du front. Pas de crédit, pas de réclamation." },

  // ===================== CŒUR / Garde de l'Aube (Azur) =====================
  { id: 'severin', hub: 'garde_aube', spot: 'quest0', role: 'quest', name: 'Séverin', title: 'Paladin',
    look: { skin: 1, hair: 4, hairStyle: 0, body: '#e8e0c8', helmet: 'plate', weapon: 'mace', cape: '#2f5da8' },
    hello: "Ces ruines étaient notre berceau. Les morts qui s'y relèvent n'ont plus rien de nos ancêtres." },
  { id: 'clemence', hub: 'garde_aube', spot: 'quest1', role: 'quest', name: 'Clémence', title: 'Archiviste',
    look: { skin: 0, hair: 5, hairStyle: 1, body: '#4a4a7a', helmet: 'wizard' },
    hello: "Chaque pierre du Cœur raconte une histoire. Je voudrais simplement vivre assez pour toutes les lire." },
  { id: 'aube_v', hub: 'garde_aube', spot: 'vendor', role: 'vendor', name: 'Renaud', title: 'Quartier-maître',
    look: { skin: 2, hair: 1, hairStyle: 0, body: '#5a6a7a' }, hello: "Tout ce qu'il faut pour survivre une nuit de plus au Cœur." },

  // ===================== PICS / Refuge du Col (Azur) =====================
  { id: 'armand', hub: 'refuge_col', spot: 'quest0', role: 'quest', name: 'Armand Neigeroc', title: 'Guide de montagne',
    look: { skin: 1, hair: 4, hairStyle: 0, body: '#8a8a9a', fur: '#e8e0d0', beard: true },
    hello: "Là-haut, le froid tue plus vite que les trolls. Couvre-toi, et garde ta lame affûtée." },
  { id: 'col_v', hub: 'refuge_col', spot: 'vendor', role: 'vendor', name: 'Berthe', title: 'Tenancière du refuge',
    look: { skin: 0, hair: 3, hairStyle: 4, body: '#9a6a4a' }, hello: "Soupe chaude et potions tièdes. Ou l'inverse, selon l'humeur du poêle." },

  // ===================== DÉSOLATION / Tour de l'Aube Grise (Azur) =====================
  { id: 'nora', hub: 'aube_grise', spot: 'quest0', role: 'quest', name: 'Nora', title: 'Éclaireuse',
    look: { skin: 3, hair: 0, hairStyle: 2, body: '#4a4a5a', hood: '#3a3a4a', weapon: 'bow' },
    hello: "Cette tour est la seule chose debout entre nous et le Wyrm. Ne traîne pas dans la cendre." },
  { id: 'grise_v', hub: 'aube_grise', spot: 'vendor', role: 'vendor', name: 'Aldo', title: 'Ravitailleur', look: { skin: 2, hair: 1, hairStyle: 3, body: '#6a6a6a' }, hello: "Les prix montent avec la température." },

  // ===================== CIME / Bastide Céleste (Azur) =====================
  { id: 'ysolde', hub: 'bastide', spot: 'quest0', role: 'quest', name: 'Ysolde', title: 'Haute-mage',
    look: { skin: 0, hair: 4, hairStyle: 1, body: '#3a5aa0', helmet: 'wizard', weapon: 'staff', cape: '#1f3f7a' },
    hello: "L'orage qui gronde là-haut a un nom : Azhkar. Et il a faim." },
  { id: 'bastide_v', hub: 'bastide', spot: 'vendor', role: 'vendor', name: 'Lucien', title: 'Fournisseur', look: { skin: 1, hair: 7, hairStyle: 0, body: '#4a5a8a' }, hello: "Même au bout du monde, il faut des potions." },

  // ===================== FORGE-CENDRE (Clans de Braise) =====================
  { id: 'korvash', hub: 'forge_cendre', spot: 'leader', role: 'leader', name: 'Korvash', title: 'Seigneur de guerre',
    look: { skin: 3, hair: 7, hairStyle: 2, body: '#7a2413', helmet: 'horned', cape: '#1c1414', weapon: 'axe', pauldrons: '#3a3434' },
    hello: "Les clans ne plient pas. Nous forgeons, nous brûlons, et nous avançons." },
  { id: 'ulka', hub: 'forge_cendre', spot: 'quest0', role: 'quest', name: 'Ulka', title: 'Chamane des braises',
    look: { skin: 4, hair: 5, hairStyle: 4, body: '#8a3a2a', helmet: 'antlers', weapon: 'scepter' },
    hello: "Les esprits du feu parlent en crépitant. Ce soir, ils parlent de toi." },
  { id: 'brenna', hub: 'forge_cendre', spot: 'smith', role: 'smith', name: 'Brenna Poing-de-Fer', title: 'Forgeronne',
    look: { skin: 2, hair: 5, hairStyle: 2, body: '#3a302a', weapon: 'mace' },
    hello: "Des éclats runiques ? Pose-les là. Mon enclume a soif." },
  { id: 'zog', hub: 'forge_cendre', spot: 'vendor', role: 'vendor', name: 'Zog', title: 'Marchand',
    look: { skin: 5, hair: 0, hairStyle: 3, body: '#6a4a2a' },
    hello: "Zog vend tout. Zog ne rembourse rien. Zog est un marchand honnête." },
  { id: 'thrak', hub: 'forge_cendre', spot: 'stable', role: 'stable', name: 'Thrak', title: 'Maître-loup',
    look: { skin: 3, hair: 0, hairStyle: 3, body: '#4a3a2a', fur: '#8a7a6a' },
    hello: "Mes loups de guerre obéissent à qui les mérite. Reviens au niveau 10." },
  { id: 'vessa', hub: 'forge_cendre', spot: 'auction', role: 'auction', name: 'Vessa', title: 'Commissaire-priseuse',
    look: { skin: 3, hair: 7, hairStyle: 1, body: '#5a2a3a', helmet: 'circlet' },
    hello: "Les enchères ne dorment jamais. Les bonnes affaires, elles, s'envolent vite." },
  { id: 'morka', hub: 'forge_cendre', spot: 'stash', role: 'stash', name: 'Morka', title: 'Intendante du coffre',
    look: { skin: 4, hair: 7, hairStyle: 3, body: '#3a3a3a' },
    hello: "Ton coffre est sous clé. Et la clé est sous ma hache." },
  { id: 'durgan', hub: 'forge_cendre', spot: 'trainer', role: 'trainer', name: 'Durgan', title: "Maître d'armes",
    look: { skin: 3, hair: 0, hairStyle: 2, body: '#5a3a2a', helmet: 'horned', weapon: 'axe' },
    hello: "Oublier ses techniques, c'est comme tomber de cheval. Ça fait mal, mais on se relève." },
  { id: 'kesh', hub: 'forge_cendre', spot: 'quest1', role: 'quest', name: 'Kesh', title: 'Guetteuse',
    look: { skin: 3, hair: 5, hairStyle: 1, body: '#6a2a1a', hood: '#4a1a10' },
    hello: "Depuis les mesas, on voit la fumée de Havrebleu. Un jour, on ira voir de plus près." },

  // ===================== ROUGECAMP =====================
  { id: 'ashka', hub: 'rougecamp', spot: 'quest0', role: 'quest', name: 'Ashka', title: 'Traqueuse',
    look: { skin: 3, hair: 7, hairStyle: 1, body: '#8a5a3a', hood: '#6a3a1a', weapon: 'bow' },
    hello: "Les charognards tournent au-dessus du camp. Ce n'est jamais bon signe." },
  { id: 'borag', hub: 'rougecamp', spot: 'quest1', role: 'quest', name: 'Borag', title: 'Ancien du clan',
    look: { skin: 4, hair: 4, hairStyle: 3, body: '#6a4a3a', beard: true },
    hello: "J'ai vu trois guerres, gamin. Celle-ci sent le même sang que les autres." },
  { id: 'nima', hub: 'rougecamp', spot: 'vendor', role: 'vendor', name: 'Nima', title: 'Cuisinière',
    look: { skin: 2, hair: 0, hairStyle: 4, body: '#a86a3a' },
    hello: "Ragoût de lézard ou potion de feu ? Les deux réchauffent." },

  // ===================== CANYON / Scorie-Noire =====================
  { id: 'rukh', hub: 'scorie_noire', spot: 'quest0', role: 'quest', name: 'Rukh', title: 'Contremaître',
    look: { skin: 4, hair: 0, hairStyle: 3, body: '#5a5a5a', weapon: 'pick' },
    hello: "Les kobolds ont volé nos filons. Et maintenant, la mine gronde toute seule." },
  { id: 'nerith', hub: 'scorie_noire', spot: 'quest1', role: 'quest', name: 'Nerith', title: 'Alchimiste',
    look: { skin: 1, hair: 6, hairStyle: 1, body: '#6a3a6a', helmet: 'circlet' },
    hello: "Les créatures du canyon regorgent d'ingrédients. Explosifs, surtout." },
  { id: 'scorie_v', hub: 'scorie_noire', spot: 'vendor', role: 'vendor', name: 'Grim', title: 'Fournisseur', look: { skin: 4, hair: 1, hairStyle: 0, body: '#4a3a2a' }, hello: "Pioches, potions, pain dur." },

  // ===================== MARAIS / Bivouac des Crocs (Braise) =====================
  { id: 'zarka', hub: 'bivouac_crocs', spot: 'quest0', role: 'quest', name: 'Zarka', title: 'Capitaine',
    look: { skin: 3, hair: 7, hairStyle: 2, body: '#7a2413', helmet: 'horned', weapon: 'sword' },
    hello: "Le marais nous appartiendra. Les Azuréens s'y noieront avant nous." },
  { id: 'fenn', hub: 'bivouac_crocs', spot: 'quest1', role: 'quest', name: 'Fenn', title: 'Rebouteux',
    look: { skin: 4, hair: 4, hairStyle: 3, body: '#5a6a3a' },
    hello: "Je remets les os en place. Et parfois, je les prends ailleurs." },
  { id: 'crocs_v', hub: 'bivouac_crocs', spot: 'vendor', role: 'vendor', name: 'Tulga', title: 'Intendante', look: { skin: 3, hair: 0, hairStyle: 4, body: '#6a3a2a' }, hello: "Ravitaillement, et vite." },

  // ===================== CŒUR / Braise Vive (Braise) =====================
  { id: 'kaelgor', hub: 'braise_vive', spot: 'quest0', role: 'quest', name: 'Kaelgor', title: 'Sentinelle',
    look: { skin: 4, hair: 0, hairStyle: 3, body: '#3a3434', helmet: 'plate', helmetColor: '#3a3434', weapon: 'axe', cape: '#7a2413' },
    hello: "Le Bastion changera de mains encore cent fois. Assure-toi qu'il finisse entre les nôtres." },
  { id: 'sombreflamme', hub: 'braise_vive', spot: 'quest1', role: 'quest', name: 'Sombreflamme', title: 'Érudite',
    look: { skin: 2, hair: 7, hairStyle: 1, body: '#3a1a2a', helmet: 'wizard', weapon: 'staff' },
    hello: "Les morts du Cœur obéissent à une volonté. J'aimerais savoir laquelle." },
  { id: 'vive_v', hub: 'braise_vive', spot: 'vendor', role: 'vendor', name: 'Drok', title: 'Quartier-maître', look: { skin: 4, hair: 1, hairStyle: 0, body: '#5a3a2a' }, hello: "Achète ou dégage." },

  // ===================== PICS / Halte des Cornes (Braise) =====================
  { id: 'oran', hub: 'halte_cornes', spot: 'quest0', role: 'quest', name: 'Oran', title: 'Pisteur',
    look: { skin: 3, hair: 4, hairStyle: 0, body: '#6a5a4a', fur: '#e0d8c8' },
    hello: "Les traces de yéti sont grandes comme des boucliers. Et elles vont vers nous." },
  { id: 'cornes_v', hub: 'halte_cornes', spot: 'vendor', role: 'vendor', name: 'Hilda', title: 'Marchande', look: { skin: 1, hair: 3, hairStyle: 4, body: '#7a5a4a' }, hello: "Fourrures et potions, deux remèdes au froid." },

  // ===================== DÉSOLATION / Camp d'Obsidienne (Braise) =====================
  { id: 'ignara', hub: 'camp_obsidienne', spot: 'quest0', role: 'quest', name: 'Ignara', title: 'Porte-flamme',
    look: { skin: 4, hair: 5, hairStyle: 2, body: '#8a2a1a', weapon: 'staff', helmet: 'circlet' },
    hello: "Le feu de la Désolation n'est pas le nôtre. Il faut l'éteindre, ou le dompter." },
  { id: 'obs_v', hub: 'camp_obsidienne', spot: 'vendor', role: 'vendor', name: 'Varg', title: 'Ravitailleur', look: { skin: 4, hair: 0, hairStyle: 3, body: '#3a2a2a' }, hello: "Les potions fondent vite ici. Achète en quantité." },

  // ===================== CIME / Bivouac du Tonnerre (Braise) =====================
  { id: 'thessa', hub: 'bivouac_tonnerre', spot: 'quest0', role: 'quest', name: 'Thessa', title: 'Oracle',
    look: { skin: 2, hair: 4, hairStyle: 1, body: '#5a2a4a', helmet: 'antlers', weapon: 'scepter', cape: '#1c1414' },
    hello: "J'ai vu l'orage s'ouvrir comme une gueule. Le Dévoreur approche à chaque cycle." },
  { id: 'tonnerre_v', hub: 'bivouac_tonnerre', spot: 'vendor', role: 'vendor', name: 'Brak', title: 'Fournisseur', look: { skin: 3, hair: 1, hairStyle: 0, body: '#4a2a2a' }, hello: "Potions contre l'orage. Garanties ou presque." },
];

export const NPC_BY_ID = Object.fromEntries(NPCS.map((n) => [n.id, n]));

// Répliques des citoyens et des gardes
export const CITIZEN_LINES = [
  "Belle journée pour la guerre, hein ?", "On dit que le Bastion a encore changé de mains.", "Mon cousin s'est fait mordre par un grignoteur. Il ne s'en remet pas.",
  "Tu as vu passer une caravane ?", "Les prix des potions ont encore grimpé.", "Fais attention aux Pics, le froid y est traître.",
  "Si tu vas au marais, prends des bottes. Et un bon remède.", "J'ai entendu un rugissement venant du nord, cette nuit.",
];
export const GUARD_NAMES = ['Garde du Pacte', 'Garde des Clans'];
