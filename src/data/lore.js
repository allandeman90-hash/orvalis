// Lore d'Orvalis : chroniques du monde, Huit Ordres, sanctuaires de classe, émissaires, Voilés.
import { WORLD_SCALE, HUBS, HUB_BY_ID, LANDMARKS, LANDMARK_BY_ID } from './zones.js';
import { NPCS, NPC_BY_ID, ROLE_NAMES } from './npcs.js';
import { registerMob, QUEST_ITEMS } from './mobs.js';

// ---------------------------------------------------------------------------
// Chroniques (fenêtre des quêtes, onglet Chroniques)
export const CHRONICLES = [
  { t: 'Le royaume perdu', p: "Il y a mille ans, Orvalis n'était qu'un seul royaume. Depuis Valcœur, la cité blanche bâtie au centre du monde, ses rois gouvernaient des côtes de l'ouest aux plaines brûlées de l'est. Le dernier d'entre eux, Morvhal, craignait la mort plus que tout. Ses mages lui parlèrent d'une frontière sous le monde, un Voile derrière lequel dort Nyxaroth, la Mère des Wyrms, que l'on disait capable d'offrir l'éternité." },
  { t: 'La Fracture', p: "Morvhal déchira le Voile. Nyxaroth ne lui donna pas l'éternité : elle prit son âme et sa cité. La terre se fendit en neuf régions séparées par des montagnes, les orages montèrent sur la Cime, le feu dévora l'est et les morts se relevèrent dans les ruines de Valcœur, que l'on appelle depuis le Cœur d'Orvalis. On nomma ce jour la Fracture. Morvhal, lui, n'est plus que le Roi Oublié, enchaîné sous ses propres catacombes." },
  { t: 'Les Huit Sceaux', p: "Huit héros refermèrent le Voile. Chacun forgea un Sceau de son art : l'Acier de la Lame-Grise, la Lumière de l'Aube, l'Astre d'Astrelune, le Souffle des passeurs, la Traque des chasseurs, l'Ombre de la Main Silencieuse, la Sève du Cercle des Anciens et l'Orage des Voix. À l'Autel des Tempêtes, ils plongèrent Nyxaroth dans un sommeil de mille ans. Puis chacun fonda un Ordre pour garder son Sceau." },
  { t: 'Deux couronnes', p: "Les survivants se divisèrent. Les peuples de la côte fondèrent le Pacte d'Azur autour de Havrebleu ; les clans des terres brûlées se rassemblèrent à Forge-Cendre sous la bannière des Clans de Braise. Chacun accuse l'autre d'avoir hérité de la folie de Morvhal, et depuis mille ans ils se disputent les ruines du royaume." },
  { t: 'Le Serment des Ordres', p: "Les Huit Ordres ont juré de ne jamais prendre parti. Chacun garde un sanctuaire sur les terres des deux factions et y forme ses initiés, qu'ils portent l'azur ou la braise. Leur enseignement tient en une phrase : le véritable ennemi dort sous nos pieds." },
  { t: 'Les Voilés', p: "Aujourd'hui, les Sceaux faiblissent et les mille ans touchent à leur fin. Une secte, les Voilés, promet à ses fidèles la vie éternelle que Morvhal a cherchée. Ils paient des brigands à l'ouest et des pillards à l'est pour attiser la guerre, car chaque goutte de sang versée sur la terre d'Orvalis fissure un peu plus les Sceaux. À leur tête, huit Hérauts, chacun traître à l'un des Ordres, chassent les huit Sceaux." },
];
export const EPILOGUE = { t: 'Ce qui dort sous la Cendre', p: "Les huit Sceaux tiennent encore, grâce aux initiés des deux factions. Mais sous la Désolation Cendrée, dans le Trône de Cendre-Noire, Nyxaroth s'agite. Ses enfants, les wyrms de cendre et de foudre, se réveillent un à un. Le dernier combat d'Orvalis ne se mènera pas seul : il faudra des raids entiers, azur et braise côte à côte." };

// ---------------------------------------------------------------------------
// Les Huit Ordres (un par classe). f : [Pacte d'Azur, Clans de Braise]
export const ORDERS = {
  guerrier: {
    order: "l'Ordre de la Lame-Grise", short: 'Lame-Grise', seal: "le Sceau de l'Acier", founder: 'Aldric Lame-Grise', color: '#c8763a',
    motto: "« Une lame qui ne protège personne n'est qu'un morceau de fer. »",
    desc: "Les gardiens de l'Acier. Ils enseignent que la force se mesure à ce qu'elle protège, et forment les boucliers de première ligne des deux factions.",
    sanct: ['Fort de la Lame-Grise', 'Arène de la Lame-Grise'],
    mentor: [{ name: 'Aubrecht', title: "Maître d'armes de la Lame-Grise", look: { skin: 1, hair: 4, hairStyle: 0, body: '#6a6a74', helmet: 'plate', cape: '#5a3a2a', beard: true, weapon: 'greatsword', pauldrons: '#8a8a94' } },
      { name: 'Durgan', title: "Maître d'armes de la Lame-Grise", look: { skin: 3, hair: 0, hairStyle: 3, body: '#4a3a34', helmet: 'horned', cape: '#5a2a1a', beard: true, weapon: 'axe', pauldrons: '#5a4a44' } }],
    second: [{ name: 'Liane', title: 'Écuyère de la Lame-Grise', look: { skin: 0, hair: 5, hairStyle: 1, body: '#7a6a5a', weapon: 'sword' } },
      { name: 'Tarek', title: 'Écuyer de la Lame-Grise', look: { skin: 3, hair: 1, hairStyle: 2, body: '#5a4a3a', weapon: 'mace' } }],
    traitor: { id: 'traitre_guerrier', name: 'Brannoc le Renégat' }, herald: { id: 'heraut_guerrier', name: 'Varek le Brise-Serment' },
  },
  templier: {
    order: "l'Ordre de l'Aube", short: 'Aube', seal: 'le Sceau de la Lumière', founder: 'Sainte Élyane', color: '#f0c850',
    motto: "« Chaque aube est une promesse tenue. »",
    desc: "Les porteurs de la Lumière. Chevaliers et guérisseurs, ils ont juré de tenir la ligne et de relever ceux qui tombent, quelle que soit leur bannière.",
    sanct: ["Prieuré de l'Aube", "Autel de l'Aube Ardente"],
    mentor: [{ name: 'Mère Clémence', title: "Prieure de l'Aube", look: { skin: 0, hair: 7, hairStyle: 4, body: '#e8e0c8', helmet: 'circlet', cape: '#d9a441', weapon: 'warhammer' } },
      { name: 'Borvan', title: "Haut-prêtre de l'Aube", look: { skin: 2, hair: 0, hairStyle: 3, body: '#c89a4a', helmet: 'crest', cape: '#8a2a1a', beard: true, weapon: 'warhammer' } }],
    second: [{ name: 'Frère Oswin', title: "Frère de l'Aube", look: { skin: 1, hair: 2, hairStyle: 3, body: '#d8d0b8' } },
      { name: 'Sœur Ytta', title: "Sœur de l'Aube", look: { skin: 3, hair: 6, hairStyle: 1, body: '#c8a060' } }],
    traitor: { id: 'traitre_templier', name: 'Frère Malvert' }, herald: { id: 'heraut_templier', name: "Séraphin Cendrelys, l'Aube éteinte" },
  },
  mage: {
    order: "le Cénacle d'Astrelune", short: 'Astrelune', seal: "le Sceau de l'Astre", founder: "Ilvane l'Astronome", color: '#8f7bff',
    motto: "« Le savoir est une étoile : il éclaire, et il brûle. »",
    desc: "Les veilleurs de l'Astre. Ils étudient les étoiles et le Voile lui-même, pour mieux savoir comment il se referme… ou comment il se déchire.",
    sanct: ["Tour d'Astrelune", "Observatoire d'Astrelune"],
    mentor: [{ name: 'Archimage Séverin', title: "Maître du Cénacle d'Astrelune", look: { skin: 1, hair: 4, hairStyle: 3, body: '#3a3a8a', helmet: 'wizard', helmetColor: '#3a3a8a', cape: '#1a1a4a', beard: true, weapon: 'staff' } },
      { name: 'Zaïra', title: "Astromancienne d'Astrelune", look: { skin: 3, hair: 0, hairStyle: 1, body: '#5a2a6a', helmet: 'wizard', helmetColor: '#5a2a6a', cape: '#2a1a3a', weapon: 'staff' } }],
    second: [{ name: 'Nell', title: "Apprentie d'Astrelune", look: { skin: 0, hair: 5, hairStyle: 4, body: '#4a4a9a' } },
      { name: 'Kov', title: "Apprenti d'Astrelune", look: { skin: 2, hair: 1, hairStyle: 2, body: '#6a3a7a' } }],
    traitor: { id: 'traitre_mage', name: 'Corvin le Faussaire' }, herald: { id: 'heraut_mage', name: 'Ysmera la Voilée', f: true },
  },
  necro: {
    order: 'la Confrérie du Dernier Souffle', short: 'Dernier Souffle', seal: 'le Sceau du Souffle', founder: 'Morwen la Passeuse', color: '#a8a4d8',
    motto: "« Nous gardons la porte des morts, pour qu'elle ne s'ouvre que dans un sens. »",
    desc: "Les passeurs du Souffle. Craints de tous, ils commandent aux morts pour que les morts ne commandent à personne. Ce sont eux qui savent le mieux ce que le Voile promet vraiment.",
    sanct: ['Ossuaire du Dernier Souffle', 'Nécropole du Dernier Souffle'],
    mentor: [{ name: 'Passeur Aurèle', title: 'Gardien du Dernier Souffle', look: { skin: 0, hair: 6, hairStyle: 3, body: '#2a2a3a', hood: '#1a1a2a', cape: '#1a1026', weapon: 'scythe' } },
      { name: 'Passeuse Vharna', title: 'Gardienne du Dernier Souffle', look: { skin: 4, hair: 0, hairStyle: 1, body: '#3a1a2a', hood: '#2a1020', cape: '#1a0a14', weapon: 'scythe' } }],
    second: [{ name: 'Brume', title: 'Fossoyeuse de la Confrérie', look: { skin: 0, hair: 7, hairStyle: 4, body: '#3a3a44', weapon: 'pick' } },
      { name: 'Gronn', title: 'Fossoyeur de la Confrérie', look: { skin: 3, hair: 1, hairStyle: 0, body: '#3a3032', weapon: 'pick', beard: true } }],
    traitor: { id: 'traitre_necro', name: 'Sœur Blême', f: true }, herald: { id: 'heraut_necro', name: "Grimwald l'Exhumeur" },
  },
  archer: {
    order: 'la Loge de la Traque', short: 'Traque', seal: 'le Sceau de la Traque', founder: 'Kaela Cœur-de-Loup', color: '#6fbf4a',
    motto: "« Qui chasse seul meurt seul. Qui chasse avec sa bête vit deux fois. »",
    desc: "Les chasseurs de la Traque. Chacun d'eux marche avec une bête apprivoisée : c'est ce lien, disent-ils, qui fit plier Nyxaroth.",
    sanct: ['Pavillon de la Traque', 'Camp de la Traque'],
    mentor: [{ name: 'Sylve', title: 'Maîtresse-veneuse de la Traque', look: { skin: 1, hair: 3, hairStyle: 1, body: '#3a5a2a', hood: '#2a4a1a', cape: '#2a3a1a', weapon: 'bow' } },
      { name: 'Harok', title: 'Grand-traqueur de la Traque', look: { skin: 3, hair: 0, hairStyle: 0, body: '#6a4a2a', fur: '#8a6a4a', weapon: 'bow', beard: true } }],
    second: [{ name: 'Joss', title: 'Pisteur de la Traque', look: { skin: 2, hair: 2, hairStyle: 2, body: '#4a6a3a', hood: '#3a5a2a', weapon: 'bow' } },
      { name: 'Anka', title: 'Pisteuse de la Traque', look: { skin: 3, hair: 6, hairStyle: 4, body: '#7a5a3a', weapon: 'bow' } }],
    traitor: { id: 'traitre_archer', name: 'Taran le Braconnier' }, herald: { id: 'heraut_archer', name: 'Ravak Mâchoire-Noire' },
  },
  assassin: {
    order: 'la Main Silencieuse', short: 'Main Silencieuse', seal: "le Sceau de l'Ombre", founder: 'Nyss, la Première Lame', color: '#e05a78',
    motto: "« On ne nous voit jamais. C'est ainsi qu'on sait que nous étions là. »",
    desc: "Les lames de l'Ombre. Espions et exécuteurs, ils frappent les Voilés là où ils se croient à l'abri, sans jamais signer leur travail.",
    sanct: ['Repaire de la Main Silencieuse', 'Terrier de la Main Silencieuse'],
    mentor: [{ name: "L'Ombre-Mère", title: 'Maîtresse de la Main Silencieuse', look: { skin: 1, hair: 7, hairStyle: 1, body: '#2a2226', helmet: 'mask', helmetColor: '#2a2226', cape: '#1a1216', weapon: 'dagger' } },
      { name: 'Le Chuchoteur', title: 'Maître de la Main Silencieuse', look: { skin: 4, hair: 0, hairStyle: 0, body: '#3a1a1a', helmet: 'mask', helmetColor: '#3a1a1a', cape: '#1a0a0a', weapon: 'dagger' } }],
    second: [{ name: 'Fil', title: 'Guetteur de la Main', look: { skin: 1, hair: 1, hairStyle: 2, body: '#3a3036', hood: '#2a2226', weapon: 'dagger' } },
      { name: 'Sil', title: 'Guetteuse de la Main', look: { skin: 3, hair: 6, hairStyle: 4, body: '#4a2a2a', hood: '#3a1a1a', weapon: 'dagger' } }],
    traitor: { id: 'traitre_assassin', name: 'Vesper la Parjure', f: true }, herald: { id: 'heraut_assassin', name: 'Le Sans-Visage' },
  },
  druide: {
    order: 'le Cercle des Anciens', short: 'Cercle des Anciens', seal: 'le Sceau de la Sève', founder: 'Maëlor Racine-Vieille', color: '#3fbf9f',
    motto: "« Ce qui a des racines ne tombe pas. »",
    desc: "Les gardiens de la Sève. Ils écoutent la terre elle-même, et la terre, depuis des mois, ne cesse de gémir.",
    sanct: ['Bosquet des Anciens', 'Oasis des Anciens'],
    mentor: [{ name: 'Archidruide Éolas', title: 'Voix du Cercle des Anciens', look: { skin: 0, hair: 4, hairStyle: 3, body: '#3a6a3a', helmet: 'antlers', cape: '#2a4a2a', beard: true, weapon: 'staff' } },
      { name: 'Archidruidesse Nahla', title: 'Voix du Cercle des Anciens', look: { skin: 3, hair: 2, hairStyle: 1, body: '#5a6a2a', helmet: 'antlers', cape: '#3a4a1a', weapon: 'staff' } }],
    second: [{ name: 'Mélisse', title: 'Gardienne du Cercle', look: { skin: 1, hair: 6, hairStyle: 4, body: '#6a8a4a' } },
      { name: 'Buru', title: 'Gardien du Cercle', look: { skin: 3, hair: 1, hairStyle: 0, body: '#6a5a2a', beard: true } }],
    traitor: { id: 'traitre_druide', name: 'Gaël le Flétri' }, herald: { id: 'heraut_druide', name: "Ronce-Noire, l'Arbre pourri" },
  },
  chaman: {
    order: "les Voix de l'Orage", short: "Voix de l'Orage", seal: "le Sceau de l'Orage", founder: 'Tahuk Parle-au-Tonnerre', color: '#2ab5ff',
    motto: "« Le tonnerre ne ment jamais. Il faut seulement savoir l'écouter. »",
    desc: "Les porte-voix des éléments. Ils parlent aux esprits du feu, de l'eau, de la terre et de l'air, et gardent le Sceau qui tient les orages de la Cime.",
    sanct: ["Rocher des Voix de l'Orage", "Totems des Voix de l'Orage"],
    mentor: [{ name: 'Ancienne Kaïla', title: "Aînée des Voix de l'Orage", look: { skin: 2, hair: 7, hairStyle: 4, body: '#2a5a7a', fur: '#8a7a5a', weapon: 'totemmace' } },
      { name: 'Ancien Tahruk', title: "Aîné des Voix de l'Orage", look: { skin: 3, hair: 0, hairStyle: 3, body: '#5a3a2a', fur: '#6a4a2a', beard: true, weapon: 'totemmace' } }],
    second: [{ name: 'Oren', title: "Tambour des Voix", look: { skin: 1, hair: 1, hairStyle: 2, body: '#3a6a8a' } },
      { name: 'Asha', title: 'Tambourineuse des Voix', look: { skin: 3, hair: 6, hairStyle: 1, body: '#7a4a2a' } }],
    traitor: { id: 'traitre_chaman', name: 'Orka la Muette', f: true }, herald: { id: 'heraut_chaman', name: 'Hurle-Tempête' },
  },
};
export const ORDER_LIST = Object.keys(ORDERS);

// Petites aides de grammaire : « au Fort », « à l'Arène », « à la Tour », « aux Totems » ; « du Cénacle », « des Voix »
export function au(name) {
  if (/^(Tour|Nécropole)\b/.test(name)) return 'à la ' + name;
  if (/^Totems\b/.test(name)) return 'aux ' + name;
  if (/^[AEÉÈIOUÂÊÎÔÛ]/.test(name)) return "à l'" + name;
  return 'au ' + name;
}
export function de(g) {
  if (g.startsWith('le ')) return 'du ' + g.slice(3);
  if (g.startsWith('les ')) return 'des ' + g.slice(4);
  return 'de ' + g;
}
export const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// « à Sylve », « au Chuchoteur », « à l'Ombre-Mère » ; « de Sylve », « du Chuchoteur », « d'Oren »
export function aName(n) {
  if (/^Le /.test(n)) return 'au ' + n.slice(3);
  if (/^Les /.test(n)) return 'aux ' + n.slice(4);
  if (/^La /.test(n)) return 'à la ' + n.slice(3);
  if (/^L'/.test(n)) return "à l'" + n.slice(2);
  return 'à ' + n;
}
export function deName(n) {
  if (/^Le /.test(n)) return 'du ' + n.slice(3);
  if (/^Les /.test(n)) return 'des ' + n.slice(4);
  if (/^La /.test(n)) return 'de la ' + n.slice(3);
  if (/^L'/.test(n)) return "de l'" + n.slice(2);
  if (/^[AEÉÈÊIÎOÔUÛ]/.test(n)) return "d'" + n;
  return 'de ' + n;
}
const unquote = (s) => s.replace(/^« /, '').replace(/ »$/, '');

// Emplacements des sanctuaires (8 par région de départ)
const SANCT_POS = {
  guerrier: [[-280, 5], [255, 0]], templier: [[-380, 120], [380, -115]], mage: [[-440, -90], [435, -110]], necro: [[-320, -100], [445, 70]],
  archer: [[-230, 100], [275, 105]], assassin: [[-225, 45], [220, -75]], druide: [[-435, 120], [430, 125]], chaman: [[-310, -45], [320, 55]],
};
export const sanctId = (cls, f) => `sanc_${cls}_${f}`;
export const mentorId = (cls, f) => `m_${cls}_${f}`;
export const secondId = (cls, f) => `s_${cls}_${f}`;
for (const cls of ORDER_LIST) {
  const O = ORDERS[cls];
  for (const f of [0, 1]) {
    const [x, z] = SANCT_POS[cls][f];
    const hub = { id: sanctId(cls, f), name: O.sanct[f], type: 'sanctuary', faction: f, zone: f ? 'terres' : 'val', cls, x: x * WORLD_SCALE, z: z * WORLD_SCALE, r: 18 };
    HUBS.push(hub);
    HUB_BY_ID[hub.id] = hub;
    NPCS.push({ id: mentorId(cls, f), hub: hub.id, spot: 'mentor', role: 'quest', name: O.mentor[f].name, title: O.mentor[f].title, look: O.mentor[f].look,
      hello: `Bienvenue ${au(O.sanct[f])}. ${unquote(O.motto)}` });
    NPCS.push({ id: secondId(cls, f), hub: hub.id, spot: 'second', role: 'vendor', name: O.second[f].name, title: O.second[f].title, look: O.second[f].look,
      hello: `Potions, pain et un peu d'équipement pour les initiés ${de(O.order)}. Servez-vous.` });
  }
}

// ---------------------------------------------------------------------------
// Émissaires des Huit Ordres (un par étape du voyage) et maîtres des métiers
export const EMISSARY_HUBS = [
  ['havrebleu', 'chenevert', 'fort_roseau', 'garde_aube', 'refuge_col', 'aube_grise', 'bastide'],
  ['forge_cendre', 'scorie_noire', 'bivouac_crocs', 'braise_vive', 'halte_cornes', 'camp_obsidienne', 'bivouac_tonnerre'],
];
const EMI_NAMES = [
  ['Messagère Ondine', 'Veilleur Gwenn', 'Veilleuse Maud', 'Veilleur Thibaut', 'Veilleuse Blanche', 'Veilleur Hugues', 'Grand Veilleur Albéric'],
  ['Messager Drakh', 'Veilleuse Kesra', 'Veilleur Mog', 'Veilleuse Irka', 'Veilleur Tovar', 'Veilleuse Zhena', 'Grand Veilleur Orrok'],
];
export const emissaryId = (hub) => `e_${hub}`;
EMISSARY_HUBS.forEach((list, f) => list.forEach((hub, i) => {
  NPCS.push({ id: emissaryId(hub), hub, spot: 'order', role: 'quest', name: EMI_NAMES[f][i], title: 'Émissaire des Huit Ordres',
    look: { skin: [1, 3][f], hair: i % 8, hairStyle: i % 5, body: '#4a4058', cape: '#2a2238', helmet: 'circlet', helmetAccent: '#c8b0ff' },
    hello: "Les Huit Ordres veillent, même ici. Si ton Ordre t'a envoyé, j'ai des nouvelles pour toi." });
}));
NPCS.push({ id: 'pm_havrebleu', hub: 'havrebleu', spot: 'profs', role: 'profs', name: 'Maître Gaspard Tournevent', title: 'Maître des métiers', look: { skin: 1, hair: 2, hairStyle: 3, body: '#6a5a3a', beard: true, weapon: 'pick' },
  hello: "Mineur, forgeron, pêcheur ou cuisinier ? Deux métiers primaires, deux secondaires : choisis bien, chacun a ses atouts et ses défauts." });
NPCS.push({ id: 'pm_forge_cendre', hub: 'forge_cendre', spot: 'profs', role: 'profs', name: 'Maîtresse Ruga Main-Calleuse', title: 'Maîtresse des métiers', look: { skin: 3, hair: 0, hairStyle: 1, body: '#5a3a2a', weapon: 'pick' },
  hello: "Un bon métier nourrit mieux qu'une bonne épée. Deux primaires, deux secondaires : pas un de plus." });

// ---------------------------------------------------------------------------
// Les Voilés : camps et créatures
const VEIL = { skin: '#c8b0a0', body: '#2a1a3a', legs: '#1a1026', arms: '#2a1a3a', hood: '#3a1a4a', cape: '#1a0a2a', glowEyes: '#d0a0ff' };
registerMob({ id: 'voile_adepte', name: 'Adepte du Voile', lvl: [7, 10], zone: 'bois', family: 'humanoïde', kind: 'caster', atkRange: 18, projectile: 'shadow', hp: 0.9, abilities: ['drain'],
  model: { rig: 'humanoid', ...VEIL, weapon: 'staff', weaponColors: { gem: '#b58cff', wood: '#2a2030' } } });
registerMob({ id: 'voile_sectateur', name: 'Sectateur du Voile', lvl: [13, 16], zone: 'marais', family: 'humanoïde', hp: 1.05, abilities: ['bleed'],
  model: { rig: 'humanoid', ...VEIL, body: '#3a1a2a', mask: '#10081a', weapon: 'dagger' } });
registerMob({ id: 'voile_zelote', name: 'Zélote du Voile', lvl: [19, 22], zone: 'coeur', family: 'humanoïde', kind: 'caster', atkRange: 20, projectile: 'shadow', hp: 0.95, abilities: ['drain', 'slowbolt'],
  model: { rig: 'humanoid', ...VEIL, body: '#2a1030', helmet: 'wizard', helmetColor: '#2a1030', weapon: 'staff', weaponColors: { gem: '#e060ff', wood: '#1a1020' } } });
registerMob({ id: 'voile_inquisiteur', name: 'Inquisiteur du Voile', lvl: [25, 27], zone: 'pics', family: 'humanoïde', hp: 1.25, armor: 1.3, abilities: ['slam', 'bleed'],
  model: { rig: 'humanoid', ...VEIL, body: '#2a2230', helmet: 'plate', helmetColor: '#2a2230', helmetAccent: '#b58cff', plume: '#5a2aa0', pauldrons: '#3a2a44', weapon: 'greatsword', weaponColors: { metal: '#8a7aff' }, scale: 1.08 } });
export const STORY_LANDMARKS = [
  { id: 'voile_bois', name: 'Clairière voilée', zone: 'bois', x: -330, z: 380, r: 16, kind: 'cultcamp' },
  { id: 'voile_canyon', name: 'Gouffre voilé', zone: 'canyon', x: 330, z: 380, r: 16, kind: 'cultcamp' },
  { id: 'voile_marais', name: 'Îlot des Voilés', zone: 'marais', x: 110, z: 400, r: 16, kind: 'cultcamp' },
  { id: 'voile_coeur', name: 'Chapelle voilée', zone: 'coeur', x: -100, z: -100, r: 16, kind: 'cultcamp' },
  { id: 'voile_pics', name: 'Bastion voilé', zone: 'pics', x: -250, z: -300, r: 16, kind: 'cultcamp' },
];
for (const lm of STORY_LANDMARKS) { lm.x *= WORLD_SCALE; lm.z *= WORLD_SCALE; LANDMARKS.push(lm); LANDMARK_BY_ID[lm.id] = lm; }
export const STORY_CAMPS = [
  ['voile_bois', [['voile_adepte', 7]], { r: 13 }],
  ['voile_canyon', [['voile_adepte', 7]], { r: 13 }],
  ['voile_marais', [['voile_sectateur', 8]], { r: 13 }],
  ['voile_coeur', [['voile_zelote', 8]], { r: 13 }],
  ['voile_pics', [['voile_inquisiteur', 8]], { r: 13 }],
];

// Traîtres (chapitre 5, près du sanctuaire) et Hérauts (chapitre 15, à l'Autel des Tempêtes)
const TRAITOR = {
  guerrier: { weapon: 'greatsword', helmet: 'plate', abilities: ['charge', 'enrage'] },
  templier: { weapon: 'warhammer', helmet: 'crest', abilities: ['slam', 'mend'] },
  mage: { weapon: 'staff', helmet: 'wizard', kind: 'caster', atkRange: 18, projectile: 'fire', abilities: ['slowbolt'] },
  necro: { weapon: 'scythe', hood: '#1a1026', kind: 'caster', atkRange: 18, projectile: 'shadow', abilities: ['drain'] },
  archer: { weapon: 'bow', hood: '#2a3a1a', kind: 'ranged', atkRange: 20, projectile: 'arrow', abilities: ['bleed', 'charge'] },
  assassin: { weapon: 'dagger', helmet: 'mask', abilities: ['bleed', 'poison', 'blink'] },
  druide: { weapon: 'staff', helmet: 'antlers', kind: 'caster', atkRange: 18, projectile: 'nature', abilities: ['root', 'mend'] },
  chaman: { weapon: 'totemmace', fur: '#4a3a2a', kind: 'caster', atkRange: 18, projectile: 'lightning', abilities: ['shock'] },
};
const HERALD_AB = {
  guerrier: ['charge', 'slam', 'enrage'], templier: ['slam', 'mend', 'shock'], mage: ['meteor', 'blink', 'slowbolt'], necro: ['drain', 'nova_frost', 'enrage'],
  archer: ['leap', 'bleed', 'howl'], assassin: ['blink', 'poison', 'bleed', 'enrage'], druide: ['root', 'regen', 'nova_poison'], chaman: ['shock', 'meteor_storm', 'regen'],
};
for (const cls of ORDER_LIST) {
  const O = ORDERS[cls], T = TRAITOR[cls];
  const base = { rig: 'humanoid', skin: '#b8a090', body: '#3a2a44', legs: '#241a2c', arms: '#3a2a44', cape: '#1a0a2a', glowEyes: '#d0a0ff', weapon: T.weapon, helmet: T.helmet || null, helmetColor: '#3a2a44', helmetAccent: '#b58cff', hood: T.hood || null, fur: T.fur || null };
  const caster = T.kind === 'caster' || T.kind === 'ranged';
  registerMob({ id: O.traitor.id, name: O.traitor.name, lvl: [6, 6], zone: 'none', named: true, family: 'humanoïde', hp: 3.8, dmg: caster ? 1.2 : 1.45, kind: T.kind || 'melee', atkRange: T.atkRange || 2.3, projectile: T.projectile, abilities: T.abilities, xp: 3,
    model: { ...base, scale: 1.08 } });
  registerMob({ id: O.herald.id, name: O.herald.name, lvl: [31, 31], zone: 'none', named: true, family: 'humanoïde', hp: 9, dmg: caster ? 1.6 : 1.9, armor: 1.3, kind: T.kind || 'melee', atkRange: T.atkRange || 2.6, projectile: T.projectile, abilities: HERALD_AB[cls], xp: 6,
    model: { ...base, body: '#2a1a3a', pauldrons: '#4a2a5a', cape: '#12061e', scale: 1.3, emissive: '#1a0a2a' } });
}

// les nouveaux PNJ rejoignent l'index
for (const n of NPCS) if (!NPC_BY_ID[n.id]) NPC_BY_ID[n.id] = n;
ROLE_NAMES.profs = 'Maître des métiers';

// Objets de quête des chapitres
Object.assign(QUEST_ITEMS, {
  q_ichor_voile: 'Ichor du Voile',
  q_lettre_voile: 'Lettre scellée du Voile',
});
