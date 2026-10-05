// Quête principale de chaque classe : « la voie de l'Ordre », 16 chapitres du niveau 1 au niveau 30.
// Chapitres 1 à 5 : au sanctuaire de l'Ordre (région de départ). Chapitres 6 à 16 : de région en région,
// auprès des Émissaires des Huit Ordres. Entre deux chapitres, les quêtes secondaires des régions comblent les niveaux.
import { QUESTS, QUEST_BY_ID } from './quests.js';
import { ORDERS, ORDER_LIST, EMISSARY_HUBS, emissaryId, mentorId, secondId, sanctId, au, cap1 } from './lore.js';
import { HUB_BY_ID } from './zones.js';
import { NPCS } from './npcs.js';

// noms des émissaires (ajoutés à la liste des PNJ par lore.js)
const EMI_CACHE = {};
for (const n of NPCS) if (n.id.startsWith('e_')) EMI_CACHE[n.hub] = n.name;
const EMI_NAME = (hub) => EMI_CACHE[hub] || 'Émissaire';

// niveaux des chapitres
export const CH_LVL = [1, 1, 2, 3, 5, 6, 8, 11, 13, 16, 19, 22, 25, 28, 30, 30];
export const CH_COUNT = CH_LVL.length;
export const chapterId = (cls, ch, f) => `og_${cls}_${String(ch).padStart(2, '0')}_${f}`;

// Éléments propres à chaque faction
const F = [
  { cap: 'Havrebleu', faction: "le Pacte d'Azur", enemy: 'les Clans de Braise', chef: 'Isaure Valcourt', chefId: 'isaure', zone2: 'Bois-Murmure', band: 'brigands du Vieux Moulin', bandcamp: 'le Vieux Moulin',
    gel: 'gelées des champs', beasts: 'loups, sangliers et grignoteurs', camp2: 'la Clairière voilée', named2: 'le chef Grincedent', named2place: 'Souche-Creuse' },
  { cap: 'Forge-Cendre', faction: 'les Clans de Braise', enemy: "le Pacte d'Azur", chef: 'Korvash', chefId: 'korvash', zone2: 'le Canyon des Scories', band: 'pillards des dunes', bandcamp: 'le Camp des Pillards',
    gel: 'gelées de braise', beasts: 'hyènes, scorpions et vautours', camp2: 'le Gouffre voilé', named2: 'Grand-Mèche', named2place: 'les Terriers de Fouille-Suie' },
];
const MOBS_F = {
  beasts: [['loup_pres', 'sanglier_roux', 'lievre_cornu', 'grignoteur'], ['hyene', 'scorpion_ocre', 'lezard_sables', 'vautour']],
  gel: [['gelee_verte'], ['gelee_braise']],
  band: [['brigand', 'brigand_arbaletrier'], ['pillard', 'pillard_lanceur']],
  named2: ['grincedent', 'grand_meche'],
  camp2: ['voile_bois', 'voile_canyon'],
};

// ---------------------------------------------------------------------------
// Textes propres à chaque classe (chapitres 1 à 5 au sanctuaire, puis une touche personnelle dans les chapitres suivants)
const C = {
  guerrier: {
    n: ['Le serment de la Lame-Grise', "L'épreuve de l'acier", 'Rouille et ichor', 'Des lames à louer', 'Brannoc le Renégat'],
    t: [
      "Ainsi te voilà, initié. {Au_sanct}, on ne demande pas d'où tu viens : on demande qui tu protèges. Il y a mille ans, Aldric Lame-Grise a forgé le Sceau de l'Acier pour enchaîner ce qui dort sous nos pieds. Depuis, nous formons les boucliers d'Orvalis, azur ou braise. Va voir {second}, qui te remettra l'insigne de l'Ordre. Porte-le avec fierté, et avec prudence.",
      "Un insigne ne fait pas un guerrier. Les bêtes des environs sont devenues folles furieuses ces dernières semaines : {beasts} attaquent tout ce qui bouge. Abats-en six, puis présente-toi à {mentor}. Garde ton bouclier haut et ne recule jamais d'un pas que tu n'as pas choisi.",
      "Tu as vu leurs yeux ? Ces bêtes ne sont pas simplement enragées. Les {gel} des alentours suintent une substance noire que nos anciens appelaient l'ichor du Voile. Quand le Sceau faiblit, il fuit comme d'une plaie. Rapporte-m'en cinq fioles : je dois savoir à quel point la blessure est profonde.",
      "L'ichor est épais. Le Sceau de l'Acier s'affaiblit, et ce n'est pas un hasard. Les {band} se battent avec un acharnement que leur solde ne justifie pas. Quelqu'un les paie pour faire couler le sang. Va à {bandcamp}, abats six d'entre eux et trouve qui tient la bourse.",
      "Cette lettre porte le sceau des Voilés. Et cette signature… Brannoc. Il fut mon meilleur élève avant de déserter la Lame-Grise. Les Voilés lui ont promis de ne jamais vieillir. Il rôde non loin d'ici et cherche notre Sceau. Trouve-le et arrête-le. Il frappe fort, mais il a oublié pourquoi il frappait.",
    ],
    d: [
      "Voici ton insigne, initié. L'acier gris : ni azur, ni braise. Ne l'oublie jamais.",
      "Pas une égratignure qui compte. Bien. Tu tiens debout, c'est déjà beaucoup.",
      "Cinq fioles… et elles sont encore chaudes. Le Sceau souffre plus que je ne le craignais.",
      "« Au nom du Voile, que le sang coule. » Voilà donc qui paie les lames.",
      "Brannoc est tombé. Je l'ai formé, je l'ai perdu, et c'est toi qui l'as arrêté. Merci, guerrier.",
    ],
    l: [
      "La Lame-Grise a toujours eu des yeux à {cap}.",
      "Aldric disait qu'un chef qui achète des lames finit toujours par vendre les siennes.",
      "Les passeurs du Dernier Souffle disent que ces lueurs sont des âmes. Un guerrier ne laisse personne derrière, même mort.",
      "Le Chevalier maudit fut le champion de Morvhal, et il portait jadis l'acier gris. Un de nos anciens frères, perdu depuis mille ans.",
      "Nyxaroth nourrit ses enfants de la chaleur de la terre. On ne tue pas un feu : on le prive d'air. À toi de frapper.",
      "Varek le Brise-Serment fut notre plus grand maître d'armes avant de trahir. Il connaît chaque parade de la Lame-Grise. Invente-en une nouvelle.",
      "Tu portes l'acier gris jusqu'au sommet du monde. Aldric serait fier.",
    ],
  },
  templier: {
    n: ["Le serment de l'Aube", "L'épreuve de la lumière", 'Une lumière qui vacille', 'Le prix du sang', 'Frère Malvert'],
    t: [
      "Que l'aube te garde, enfant. {Au_sanct}, nous servons la Lumière que sainte Élyane a scellée dans le Sceau de l'Aube, il y a mille ans. Nous tenons la ligne, nous relevons les blessés, et nous ne demandons jamais la couleur d'une bannière avant de soigner. Va voir {second} : l'insigne de l'Ordre t'attend.",
      "La lumière se prouve dans l'épreuve. Les bêtes des alentours, {beasts}, sont prises d'une rage qui n'a rien de naturel. Abats-en six pour protéger les chemins, puis reviens auprès de {mentor}. Frappe juste, et soigne-toi entre deux assauts : un templier à terre ne protège personne.",
      "Lorsque je prie, je sens la lumière du Sceau vaciller comme une chandelle dans le vent. Les {gel} des environs rejettent un liquide sombre : l'ichor du Voile, le sang de ce qui dort sous le monde. Rapporte-moi cinq fioles. Je veux mesurer l'ombre qui gagne.",
      "L'ichor ne ment pas : le Sceau de l'Aube saigne. Et sa blessure se creuse chaque fois qu'on se bat sur cette terre. Les {band} répandent le sang sans raison apparente. Va à {bandcamp}. Abats six de ces brigands et cherche ce qui les pousse.",
      "Cette lettre est signée de Frère Malvert… Il priait à mes côtés, autrefois. Les Voilés lui ont promis une lumière qui ne s'éteint jamais, et il a vendu la nôtre. Il s'est terré près d'ici. Ramène-le à la raison si tu le peux, arrête-le sinon. Méfie-toi : il sait encore guérir ses blessures.",
    ],
    d: [
      "Voici l'insigne de l'Aube. Qu'il te rappelle que la lumière n'appartient à aucun camp.",
      "Tu es revenu entier, et les chemins sont plus sûrs. La lumière t'accompagne.",
      "Cinq fioles… Qu'Élyane nous pardonne, la blessure est plus profonde que prévu.",
      "« Que le sang coule jusqu'à ce que l'aube s'éteigne. » Les Voilés, donc.",
      "Malvert est tombé. Je prierai pour lui. Et pour toi, qui as dû porter ce fardeau.",
    ],
    l: [
      "L'Aube soigne les blessés de {cap} depuis des siècles. On nous y écoute encore.",
      "La Lumière ne se vend pas. Ceux qui l'achètent n'obtiennent que des ombres dorées.",
      "Ces âmes errent sans repos. Un templier doit leur offrir la paix, pas la terreur.",
      "Le Chevalier maudit porte encore la croix de l'Aube sous la rouille. Sa chute est notre plus vieille honte.",
      "Même le feu de Nyxaroth craint l'aube. Tiens bon, la nuit finit toujours.",
      "Séraphin Cendrelys était notre plus pure lumière. Il est devenu l'Aube éteinte. Rallume-la ou achève-le.",
      "La Lumière d'Élyane brille encore, parce que tu as tenu la ligne.",
    ],
  },
  mage: {
    n: ["L'étoile de l'initié", 'Premier feu', "L'alchimie de l'ombre", 'Des mercenaires bien payés', 'Corvin le Faussaire'],
    t: [
      "Entre, et ne touche à rien. {Au_sanct}, nous étudions les étoiles et ce qui se cache entre elles. Ilvane l'Astronome a forgé le Sceau de l'Astre, et depuis mille ans nous calculons chaque nuit s'il tient encore. Les calculs de ce mois-ci m'inquiètent. Présente-toi à {second}, qui te donnera l'insigne du Cénacle.",
      "Un mage qui n'a jamais tiré sur autre chose qu'un mannequin de paille ne vaut pas grand-chose. Dehors, {beasts} ont perdu la tête. Abats-en six, de loin de préférence. Garde tes distances, surveille ton mana et reviens voir {mentor}.",
      "Mes instruments tremblent : le Sceau de l'Astre émet une fréquence anormale. Les {gel} des environs absorbent quelque chose… Un liquide noir, l'ichor du Voile. Rapporte-m'en cinq fioles. Et ne le goûte pas, quoi qu'en disent les apprentis.",
      "Conclusion de l'analyse : l'ichor provient bien du Voile, et sa concentration augmente à chaque bataille livrée à proximité. Quelqu'un attise la guerre délibérément. Les {band} me semblent de bons suspects. Va à {bandcamp}, abats-en six et fouille-les.",
      "Cette lettre est codée, mais le chiffre est celui du Cénacle. Seul Corvin utilisait cette variante… Corvin, qui falsifiait nos relevés d'étoiles depuis des mois pour cacher l'affaiblissement du Sceau. Il est dehors, tout près, avec des flammes volées. Fais-le taire.",
    ],
    d: [
      "Voici ton insigne. Une étoile à huit branches, une pour chaque Sceau.",
      "Pas mal. Pas mal du tout. Ton feu est encore sauvage, mais il brûle.",
      "Concentration alarmante. Mes calculs sont faux : nous avons moins de temps que prévu.",
      "« Chaque bataille rapproche l'éveil. » C'est donc voulu. Quelle horreur.",
      "Corvin ne falsifiera plus rien. Les étoiles recommencent à dire la vérité.",
    ],
    l: [
      "Le Cénacle entretient un observatoire secret à {cap}. Les émissaires y lisent nos messages.",
      "L'or des Voilés a une odeur de soufre. Même les gobelins et les kobolds devraient s'en méfier.",
      "Ces feux follets sont de la matière d'âme pure. Fascinant, et terriblement triste.",
      "Morvhal avait des mages. Ce sont eux qui ont calculé comment déchirer le Voile. Le savoir brûle, je te l'avais dit.",
      "Le feu des drakônides est celui de Nyxaroth elle-même. Retourne-le contre eux.",
      "Ysmera fut la plus brillante d'entre nous. Elle a lu trop loin dans le Voile. Ne la regarde pas dans les yeux.",
      "L'étoile d'Ilvane brille à nouveau au-dessus de la Cime. Joli travail, mage.",
    ],
  },
  necro: {
    n: ['Le serment du Dernier Souffle', 'Ce qui doit mourir', 'Le sang noir du Voile', 'Du sang pour la porte', 'Sœur Blême'],
    t: [
      "Ne crains pas les ossements, initié : ils ne mordent que sur notre ordre. {Au_sanct}, nous sommes les passeurs. Morwen, notre fondatrice, a forgé le Sceau du Souffle pour que la porte des morts ne s'ouvre que dans un sens. Les vivants nous craignent, et c'est bien normal. Va voir {second}, qui te remettra l'insigne de la Confrérie.",
      "Tout ce qui vit doit mourir un jour, mais certaines choses meurent mal. Les bêtes des environs, {beasts}, sont atteintes d'une rage malsaine. Abats-en six et regarde bien comment elles tombent. Puis reviens voir {mentor}.",
      "As-tu senti le froid dans leur dernier souffle ? Le Voile suinte. Les {gel} se gorgent d'ichor, ce sang noir de l'autre côté. Rapporte-m'en cinq fioles. Un passeur doit connaître l'odeur de ce qu'il combat.",
      "L'ichor est tiède. La porte s'entrouvre, et quelqu'un pousse de l'autre côté… ou de ce côté-ci. Les {band} tuent sans raison, comme pour nourrir la terre de sang. Va à {bandcamp}, abats-en six et trouve pour qui ils travaillent.",
      "Cette lettre est scellée à la cire d'os. Sœur Blême… Elle gardait nos catacombes. Les Voilés lui ont promis qu'elle ne mourrait jamais, et elle a cru que c'était un cadeau. Elle rôde tout près, entourée de morts qui ne sont plus à nous. Rends-la au silence.",
    ],
    d: [
      "Voici l'insigne du Dernier Souffle. Une porte, et une clé qui ne tourne que dans un sens.",
      "Elles sont mortes proprement, cette fois. C'est tout ce qu'on peut leur offrir.",
      "Cinq fioles de sang noir… La porte bat comme un cœur malade.",
      "« Que la porte s'ouvre et que plus personne ne meure. » Le mensonge le plus vieux du monde.",
      "Sœur Blême repose enfin. Elle a obtenu ce qu'elle redoutait le plus : une fin.",
    ],
    l: [
      "La Confrérie a un pied-à-terre à {cap}, près du cimetière. Les émissaires savent où frapper.",
      "Les Voilés promettent l'éternité aux vivants. Nous savons ce que coûte vraiment l'éternité.",
      "Ces lueurs sont des âmes retenues. Le Voile les empêche de passer. Libère-les.",
      "Morvhal, le Roi Oublié, est ce que deviennent ceux qui refusent de mourir. Regarde-le bien, et souviens-toi.",
      "Même les wyrms meurent. Nyxaroth le sait, et c'est pour cela qu'elle a peur de nous.",
      "Grimwald l'Exhumeur a ouvert nos tombes pour lever une armée. Il connaît chaque rituel du Souffle, mais pas la miséricorde.",
      "La porte est refermée. Les morts te remercient à leur manière : en se taisant.",
    ],
  },
  archer: {
    n: ['Le serment de la Traque', 'Chasser avec sa bête', 'Une piste noire', 'Le gibier qui paie', 'Taran le Braconnier'],
    t: [
      "Bienvenue {au_sanct}, chasseur. Ici, personne ne chasse seul : chacun de nous marche avec une bête. Kaela Cœur-de-Loup a forgé le Sceau de la Traque avec le lien qui l'unissait à sa louve, et c'est ce lien qui fit plier Nyxaroth. Ton compagnon est déjà à tes côtés. Va voir {second} pour recevoir l'insigne de la Loge.",
      "Toi et ton familier, vous devez apprendre à chasser ensemble. Les bêtes des environs, {beasts}, sont devenues enragées. Abattez-en six. Essaie les ordres : laisse ton compagnon prendre les coups en tank, ou fais-le soigner si tu préfères tirer. Puis reviens voir {mentor}.",
      "Toutes ces bêtes laissent une piste noire derrière elles. Je l'ai suivie jusqu'aux {gel} : elles suintent l'ichor du Voile, et c'est lui qui rend la faune folle. Rapporte-m'en cinq fioles. Ton familier le sentira avant toi.",
      "L'ichor épaissit à chaque combat. Quelqu'un fait couler le sang pour nourrir le Voile, et les {band} sont bien trop nombreux pour être de simples voleurs. Va à {bandcamp}. Abattez-en six, toi et ta bête, et trouve qui les paie.",
      "Taran… Je reconnais sa marque sur cette lettre. Un braconnier qui a quitté la Loge après avoir abandonné sa propre bête. Les Voilés l'ont recueilli. Il chasse maintenant notre Sceau, tout près d'ici. Traque-le. Il tire vite, mais il n'a plus personne pour couvrir ses arrières.",
    ],
    d: [
      "Voici ton insigne : une patte et une flèche entrecroisées. N'oublie jamais laquelle protège l'autre.",
      "Vous formez une belle paire, ta bête et toi. La Traque est fière de vous.",
      "Même ton familier grogne en les reniflant. Cet ichor est une abomination.",
      "« Que le sang des bêtes et des hommes nourrisse le Voile. » Des chasseurs de chair, voilà ce qu'ils sont.",
      "Taran ne braconnera plus. Et toi, tu n'as jamais été seul. Voilà toute la différence.",
    ],
    l: [
      "Les éclaireurs de {cap} doivent beaucoup à la Traque. On nous y accueille bien.",
      "Ceux qui vendent leur meute finissent toujours seuls. Grincedent ou Grand-Mèche, peu importe.",
      "Même les bêtes des marais fuient ces lueurs. Garde ton familier près de toi.",
      "Le champion de Morvhal chassait les nôtres avec des chiens de guerre. Ses chiens sont morts, pas lui.",
      "Les drakônides sont les chiens de Nyxaroth. Toi aussi, tu as ta meute.",
      "Ravak Mâchoire-Noire a tué sa bête pour prouver sa loyauté aux Voilés. Il ne s'attend pas à ce que tu gardes la tienne.",
      "Kaela et sa louve veillent sur toi, là-haut. Toi et ta bête, vous avez tenu la Traque.",
    ],
  },
  assassin: {
    n: ['Le serment de la Main Silencieuse', 'Sans un bruit', "L'encre noire", 'Suivre la bourse', 'Vesper la Parjure'],
    t: [
      "Tu as trouvé le repaire, c'est un début. {Au_sanct}, nous n'existons pas. Nyss, la Première Lame, a forgé le Sceau de l'Ombre dans le silence d'une nuit sans lune, et depuis nous frappons ceux qui voudraient le briser, sans jamais signer notre travail. {second} te remettra l'insigne. Ne le montre à personne.",
      "Premier exercice : tuer sans être vu. Les bêtes des environs, {beasts}, sont devenues folles. Abats-en six, vite et proprement. Frappe dans le dos, disparais, recommence. Puis reviens voir {mentor}. Si quelqu'un t'a vu, ne reviens pas.",
      "Nos guetteurs ont vu les {gel} se remplir d'une encre noire : l'ichor du Voile. Une chose pareille ne suinte pas toute seule, quelqu'un la fait couler. Rapporte-m'en cinq fioles, et tâche de ne pas en renverser sur tes lames.",
      "L'encre coule plus fort après chaque bataille. Quelqu'un finance la guerre. Et la Main sait une chose : on remonte toujours jusqu'à la bourse. Les {band} sont trop bien équipés pour de simples voleurs. Va à {bandcamp}, abats-en six et fouille leurs poches.",
      "Cette lettre porte une marque que je connais trop bien : celle de Vesper. Elle était la meilleure d'entre nous… avant de vendre nos noms aux Voilés. Elle est tapie tout près d'ici, persuadée que personne ne la voit. Montre-lui qu'elle se trompe.",
    ],
    d: [
      "Voici l'insigne. Une main ouverte, vide. C'est tout ce qu'on laisse derrière nous.",
      "Personne ne t'a vu ? Parfait. Tu as peut-être un avenir.",
      "Cinq fioles… Quelqu'un saigne le monde, et nous allons trouver qui.",
      "« Que le sang coule, et que nul ne voie la main qui le verse. » Ils nous volent même notre devise.",
      "Vesper n'a rien vu venir. La Main Silencieuse n'oublie jamais une trahison.",
    ],
    l: [
      "La Main a des oreilles partout à {cap}. Les émissaires sont nos boîtes aux lettres.",
      "Un chef payé par les Voilés, c'est une bourse qui marche. Coupe-la.",
      "Ces lueurs te suivront si tu les laisses faire. Ne t'arrête pas.",
      "Le Chevalier maudit n'a jamais su se cacher. C'est pour ça qu'il est encore debout : personne n'a jamais osé l'approcher par-derrière.",
      "Même un dragon a un point faible. Trouve-le.",
      "Le Sans-Visage a volé mille visages pour les Voilés, dont celui de notre ancienne maîtresse. Aujourd'hui, il vole son dernier.",
      "Personne ne saura ce que tu as fait au sommet du monde. C'est exactement ainsi que ça doit être.",
    ],
  },
  druide: {
    n: ['Le serment du Cercle', 'La colère des bêtes', 'La terre qui saigne', 'Le sang sur les racines', 'Gaël le Flétri'],
    t: [
      "Pose ta main sur la terre, jeune pousse. Tu la sens trembler ? {Au_sanct}, nous écoutons la Sève. Maëlor Racine-Vieille a planté le Sceau de la Sève au cœur du monde, et depuis mille ans ses racines retiennent ce qui dort. Depuis quelques mois, la terre gémit. Va voir {second}, qui te remettra l'insigne du Cercle.",
      "Les bêtes des environs, {beasts}, ne sont pas mauvaises : elles souffrent, et leur souffrance les rend folles. Abrège celle de six d'entre elles. Soigne-toi entre chaque combat et écoute leur dernier souffle. Puis reviens voir {mentor}.",
      "Les racines du Sceau saignent un liquide noir : l'ichor du Voile. Les {gel} des alentours s'en gorgent. Rapporte-m'en cinq fioles, que je comprenne quel mal ronge la Sève.",
      "La Sève est empoisonnée par le sang versé : chaque bataille enfonce l'ichor plus profond dans les racines. Et les {band} se battent comme s'ils voulaient abreuver la terre. Va à {bandcamp}, abats-en six et découvre qui les pousse.",
      "Cette lettre porte la marque d'une feuille morte : celle de Gaël, qui fut notre gardien le plus doux. Les Voilés lui ont promis une forêt qui ne fanerait jamais. Il s'est flétri de l'intérieur. Il se cache tout près d'ici et empoisonne les racines. Arrête-le.",
    ],
    d: [
      "Voici l'insigne du Cercle : une feuille qui ne tombe jamais. Qu'elle te protège.",
      "Six bêtes apaisées. La terre respire un peu mieux.",
      "Cet ichor… La Sève se meurt plus vite que je ne le pensais.",
      "« Que la terre boive le sang jusqu'à s'ouvrir. » Ils veulent fendre les racines du monde.",
      "Gaël est retourné à la terre. Elle saura, peut-être, lui rendre sa douceur.",
    ],
    l: [
      "Même au cœur de {cap}, il y a un vieil arbre qui parle au Cercle. L'émissaire l'écoute.",
      "La forêt nourrit tout le monde, même les gobelins. Mais pas ceux qui la vendent.",
      "Ces feux follets brûlent sans chaleur. Une forêt entière pleure ces âmes.",
      "Sous les catacombes, les racines du Sceau touchent les os de Morvhal. Elles le retiennent encore.",
      "Les drakônides assèchent tout ce qu'ils touchent. Redonne de la vie à cette terre brûlée.",
      "Ronce-Noire fut le plus vieil arbre du Cercle. Le Voile l'a pourri jusqu'au cœur. Délivre-le.",
      "La Sève remonte dans les racines du monde. Le printemps reviendra, grâce à toi.",
    ],
  },
  chaman: {
    n: ["Le serment des Voix de l'Orage", "L'appel des esprits", 'Les esprits se taisent', 'Le tambour de guerre', 'Orka la Muette'],
    t: [
      "Les esprits m'avaient annoncé ta venue, enfant du tonnerre. {Au_sanct}, nous parlons au feu, à l'eau, à la terre et au vent. Tahuk Parle-au-Tonnerre a enfermé la colère des orages dans le Sceau de l'Orage, et c'est lui qui retient les tempêtes de la Cime. Va voir {second}, qui te remettra l'insigne des Voix.",
      "Les esprits de la terre hurlent de douleur, et les bêtes des environs, {beasts}, deviennent folles en les entendant. Abats-en six pour les apaiser. Plante tes totems, fais tomber la foudre, puis reviens voir {mentor}.",
      "Les esprits de l'eau se taisent, étouffés par quelque chose de noir. Les {gel} des alentours en sont pleines : c'est l'ichor du Voile. Rapporte-m'en cinq fioles. Je dois entendre ce que le silence essaie de me dire.",
      "L'ichor étouffe les esprits, et chaque bataille en répand davantage. Quelqu'un bat le tambour de guerre sans relâche. Les {band} se battent pour un maître invisible. Va à {bandcamp}, abats-en six et trouve qui frappe le tambour.",
      "Cette lettre ne porte aucune signature, mais les esprits murmurent un nom : Orka la Muette. Elle a renoncé à sa voix pour entendre ce que le Voile chuchote. Elle erre tout près d'ici et fait taire les esprits un à un. Rends-leur leur voix.",
    ],
    d: [
      "Voici l'insigne des Voix : un éclair enroulé autour d'une plume. Les esprits te reconnaîtront.",
      "Les esprits de la terre se calment. Ils te remercient, à leur manière.",
      "Même le vent retient son souffle… Le Voile gagne du terrain.",
      "« Que le tambour de guerre ne se taise jamais. » Il faudra bien que quelqu'un crève la peau du tambour.",
      "Orka s'est tue pour de bon. Écoute : les esprits chantent de nouveau.",
    ],
    l: [
      "Les Voix gardent un totem sur les remparts de {cap}. L'émissaire y entend nos messages.",
      "L'or des Voilés rend les esprits malades. Même les chefs qui l'acceptent l'entendent tinter la nuit.",
      "Ces lueurs sont des esprits prisonniers. Brise leurs chaînes.",
      "Le Chevalier maudit n'a plus d'esprit, seulement une colère froide. Même la foudre hésite à le toucher.",
      "Le feu de Nyxaroth est un esprit fou. Parle-lui avec la foudre.",
      "Hurle-Tempête est un esprit de l'orage que les Voilés ont enchaîné. Brise sa chaîne et il retournera au ciel.",
      "Le tonnerre roule sur la Cime, et pour une fois, il chante. Les esprits sont en paix.",
    ],
  },
};

// Chapitres 6 à 16 : texte commun, avec la touche de l'Ordre (l[k]) au début
const W = [
  // 6 (niv. 6) : vers la capitale
  { n: 'Le Porte-parole des Ordres', gi: 'mentor', ti: 'e0', obj: () => [{ t: 'talk', label: 'Parler à l\'Émissaire des Huit Ordres, à {cap}' }], k: 0,
    t: "{l} Tu as fait tes preuves, et les Voilés sont plus nombreux qu'on ne le croyait. Les Huit Ordres ont des émissaires dans chaque cité et chaque avant-poste de {faction}. Rends-toi à {cap} et présente-toi à {e0}. Là-bas, tu découvriras aussi les quêtes de ta faction : aide-les pendant que tu grandis. Quand tu seras prêt, l'Ordre t'appellera de nouveau.",
    d: "Te voilà. Ton mentor m'a parlé de toi. Les autres Ordres ont vu la même chose que le tien : l'ichor, les lettres, les traîtres. Quelque chose se prépare." },
  // 7 (niv. 8) : 2e région
  { n: 'Au cœur de {camp2}', gi: 'e0', ti: 'e1', obj: (f) => [{ t: 'explore', lm: MOBS_F.camp2[f], r: 24, label: 'Découvrir {camp2}' }, { t: 'kill', mob: 'voile_adepte', n: 6, label: 'Adeptes du Voile vaincus' }],
    t: "Les éclaireurs de tous les Ordres parlent d'un rassemblement de Voilés dans la région de {zone2}, au sud. Ils ont dressé un autel à {camp2} et y récitent des prières au Voile. Va les disperser, puis fais ton rapport à {e1}, notre émissaire sur place. En chemin, n'hésite pas à aider les éclaireurs de {faction} : ils ont besoin de bras.",
    d: "Des adeptes, déjà si loin de leurs cachettes… Et ces prières : ils comptent les jours. Le millénaire de la Fracture approche." },
  // 8 (niv. 11)
  { n: "L'or du Voile", gi: 'e1', ti: 'e1', obj: (f) => [{ t: 'kill', mob: MOBS_F.named2[f], n: 1, label: '{named2c} vaincu' }], k: 1, gear: 'elite',
    t: "{l} Les Voilés ne se contentent plus de payer des brigands. Ils ont acheté {named2} à {named2place} : de l'or contre des éclats de pierre-sceau que ses sbires arrachent aux ruines. Chaque éclat affaiblit un peu plus les Sceaux. Mets fin à ce commerce. Tu ne seras pas de trop avec deux ou trois compagnons.",
    d: "Et voilà l'or des Voilés, répandu dans la boue. Avec ce qu'il transportait, les Sceaux auraient perdu des années de résistance." },
  // 9 (niv. 13) : marais
  { n: "L'Îlot des Voilés", gi: 'e1', ti: 'e2', obj: () => [{ t: 'explore', lm: 'voile_marais', r: 24, label: "Découvrir l'Îlot des Voilés" }, { t: 'kill', mob: 'voile_sectateur', n: 8, label: 'Sectateurs du Voile vaincus' }],
    t: "Les adeptes n'étaient que des prêcheurs. Les vrais fidèles, les sectateurs, se rassemblent dans les Marais de Vasegrise, sur un îlot que la brume cache presque toujours. Les deux factions s'y battent sans cesse, et c'est exactement ce que veulent les Voilés. Va à l'Îlot des Voilés, abats huit sectateurs, puis retrouve {e2}.",
    d: "Huit sectateurs de moins. Ils portaient tous le même poignard, gravé d'une date : le jour exact de la Fracture, il y a mille ans." },
  // 10 (niv. 16)
  { n: 'Les âmes des tourbières', gi: 'e2', ti: 'e2', obj: () => [{ t: 'explore', lm: 'bourbier', r: 28, label: 'Explorer le Bourbier de la Mère Vase' }, { t: 'kill', mob: 'feu_follet', n: 6, label: 'Feux follets apaisés' }], k: 2,
    t: "{l} Les feux follets des marais se multiplient depuis que le Voile suinte. Ce sont des âmes que la brèche retient de ce côté-ci, et les Voilés les récoltent pour leurs rituels. Va jusqu'au Bourbier de la Mère Vase et libère six de ces âmes. La Mère Vase elle-même les attire : ne t'en approche pas trop sans renforts.",
    d: "Les lueurs se sont éteintes une à une, comme des bougies qu'on souffle doucement. Elles ont enfin pu passer. Tu as fait une bonne action." },
  // 11 (niv. 19) : Cœur
  { n: 'La Chapelle voilée', gi: 'e2', ti: 'e3', obj: () => [{ t: 'explore', lm: 'voile_coeur', r: 24, label: 'Découvrir la Chapelle voilée' }, { t: 'kill', mob: 'voile_zelote', n: 8, label: 'Zélotes du Voile vaincus' }],
    t: "Tous les chemins mènent au Cœur d'Orvalis, là où la Fracture a commencé. Les zélotes du Voile ont relevé une chapelle dans les ruines de Valcœur et y prient pour le retour de leur roi. Va la trouver, abats huit zélotes, puis rejoins {e3}. Le Bastion central est tout proche : les combats y font rage entre azur et braise.",
    d: "Leur roi… Ils parlaient de Morvhal. Les Voilés ne veulent pas seulement réveiller Nyxaroth : ils veulent rendre au Roi Oublié son trône." },
  // 12 (niv. 22)
  { n: 'Le champion du Roi Oublié', gi: 'e3', ti: 'e3', obj: () => [{ t: 'explore', lm: 'crypte', r: 26, label: "Entrer dans la Crypte d'Ossevaine" }, { t: 'kill', mob: 'chevalier_maudit', n: 1, label: 'Chevalier maudit vaincu' }], k: 3, gear: 'elite',
    t: "{l} Le Chevalier maudit garde l'entrée de la Crypte d'Ossevaine, où les Voilés cherchent un passage vers les catacombes du Roi Oublié. Tant qu'il tient la porte, ils peuvent descendre en paix. Abats-le. C'est un adversaire redoutable : ne va pas seul le défier.",
    d: "Le champion de Morvhal est tombé, et avec lui la clé des catacombes. Le Roi Oublié restera oublié encore un peu. Mais il reste huit Hérauts." },
  // 13 (niv. 25) : Pics Gelés
  { n: 'Le Bastion voilé', gi: 'e3', ti: 'e4', obj: () => [{ t: 'explore', lm: 'voile_pics', r: 24, label: 'Découvrir le Bastion voilé' }, { t: 'kill', mob: 'voile_inquisiteur', n: 8, label: 'Inquisiteurs du Voile vaincus' }],
    t: "Les Hérauts rassemblent leur garde personnelle dans les Pics Gelés, au nord-ouest : les inquisiteurs, des guerriers en armure que la Fracture elle-même semble avoir forgés. Leur bastion garde le chemin de la Cime des Tempêtes, où reposent les Huit Sceaux. Détruis cette garde et rejoins {e4}.",
    d: "Les inquisiteurs sont tombés, mais ils avaient déjà envoyé leurs ordres : les Hérauts marchent vers l'Autel des Tempêtes. Il reste peu de temps." },
  // 14 (niv. 28) : Désolation
  { n: 'Les enfants de Nyxaroth', gi: 'e4', ti: 'e5', obj: () => [{ t: 'kill', mob: 'drakonide', n: 8, label: 'Drakônides vaincus' }, { t: 'explore', lm: 'caldeira', r: 34, label: 'Observer la Caldeira du Wyrm' }], k: 4,
    t: "{l} Les Hérauts ne marchent pas seuls. Dans la Désolation Cendrée, les drakônides, enfants de Nyxaroth, se sont mis en route pour les escorter jusqu'à la Cime. Abats-en huit et approche-toi de la Caldeira du Wyrm pour voir ce qu'ils y préparent. Puis rejoins {e5}.",
    d: "La Caldeira se remplit de lave, comme un cœur qui recommence à battre. Nyxaroth s'éveille. Il faut défendre les Sceaux maintenant." },
  // 15 (niv. 30) : Cime, le Héraut
  { n: '{herald}', gi: 'e5', ti: 'e6', obj: (f, cls) => [{ t: 'explore', lm: 'autel', r: 46, label: "Rejoindre l'Autel des Tempêtes" }, { t: 'kill', mob: ORDERS[cls].herald.id, n: 1, label: '{herald} vaincu{he}', spawnHerald: true }], k: 5, reward: 'mythicWeapon',
    t: "{l} Les huit Hérauts sont à l'Autel des Tempêtes, là où les Sceaux furent forgés. Chacun traque le sien. Celui de {order} s'appelle {herald}. Monte à l'Autel, affronte-{hl} devant {seal}, et ne {hl} laisse pas le briser. Les tiens comptent sur toi. Puis rejoins {e6}.",
    d: "Le Héraut est tombé, et {seal} tient. Prends cette arme : elle a été forgée pour ce jour-là, il y a mille ans, et elle attendait quelqu'un comme toi." },
  // 16 (niv. 30) : épilogue
  { n: 'Ce qui dort sous la Cendre', gi: 'e6', ti: 'chef', obj: () => [{ t: 'talk', label: 'Faire ton rapport à {chef}, à {cap}' }], k: 6, fame: 60,
    t: "{l} Les Huit Sceaux tiennent, parce que des initiés des deux factions se sont battus côte à côte sans le savoir. Mais Nyxaroth ne dort plus vraiment : ses enfants se réveillent dans le Trône de Cendre-Noire et au Sanctuaire des Tempêtes. Va trouver {chef} à {cap}. La guerre contre {enemy} devra attendre : il faudra des raids entiers pour ce qui vient.",
    d: "L'émissaire m'a tout raconté. Les Huit Ordres, les Hérauts, les Sceaux… Et toi, au milieu de tout ça. Tu as l'étoffe d'une légende. Prépare-toi : les raids t'attendent." },
];

// ---------------------------------------------------------------------------
// Génération des quêtes (une version par faction)
// remplace les {clés} ; « à le » devient « au », « de les » devient « des », etc.
function fill(s, V) {
  return s.replace(/(?:(^|[\s'’(«])(à|À|de|De) )?\{(\w+)\}/g, (m, pre = '', prep, k) => {
    const v = V[k];
    if (v === undefined) return m;
    if (!prep) return v;
    const up = prep === 'À' || prep === 'De';
    let r;
    if (v.startsWith('le ')) r = (/^[àÀ]$/.test(prep) ? 'au ' : 'du ') + v.slice(3);
    else if (v.startsWith('les ')) r = (/^[àÀ]$/.test(prep) ? 'aux ' : 'des ') + v.slice(4);
    else if (/^de$/i.test(prep) && /^[AEÉÈÊIÎOÔUÛ]/.test(v)) r = "d'" + v;
    else r = prep.toLowerCase() + ' ' + v;
    return pre + (up ? cap1(r) : r);
  })
    // noms propres avec article (« Le Chuchoteur », « L'Ombre-Mère », « Le Sans-Visage »)
    .replace(/(^|[\s'’(«])(à|À|de|De) (Le|Les) (?=\p{Lu})/gu, (m, pre, prep, art) => pre + (/^[àÀ]$/.test(prep) ? (art === 'Le' ? 'au' : 'aux') : (art === 'Le' ? 'du' : 'des')) + ' ')
    .replace(/([\p{Ll},]) (Le|La|Les|L')(?=\s?\p{Lu})/gu, (m, c, art) => c + ' ' + art.toLowerCase());
}

export const STORY_QUESTS = [];
for (const cls of ORDER_LIST) {
  const O = ORDERS[cls], T = C[cls];
  for (const f of [0, 1]) {
    const Fv = F[f];
    const emi = EMISSARY_HUBS[f].map((h) => emissaryId(h));
    const V = {
      ...Fv, named2c: cap1(Fv.named2), sanct: O.sanct[f], au_sanct: au(O.sanct[f]), Au_sanct: cap1(au(O.sanct[f])), order: O.order, seal: O.seal, founder: O.founder, mentor: O.mentor[f].name, second: O.second[f].name,
      traitor: O.traitor.name, herald: O.herald.name, hl: O.herald.f ? 'la' : 'le', he: O.herald.f ? 'e' : '',
    };
    EMISSARY_HUBS[f].forEach((h, i) => { V['e' + i] = `${EMI_NAME(h)} (${HUB_BY_ID[h].name})`; });
    const npc = (key) => key === 'mentor' ? mentorId(cls, f) : key === 'second' ? secondId(cls, f) : key === 'chef' ? Fv.chefId : emi[+key.slice(1)];
    const push = (ch, o) => {
      const id = chapterId(cls, ch, f);
      const q = {
        id, name: fill(o.name, V), zone: o.zone, lvl: CH_LVL[ch - 1], faction: f, cls, main: true, ch, prereq: ch > 1 ? [chapterId(cls, ch - 1, f)] : [],
        giver: o.giver, turnin: o.turnin, obj: o.obj.map((x) => ({ ...x, label: x.label ? fill(x.label, V) : x.label })), text: fill(o.text, V), done: fill(o.done, V),
      };
      if (o.gear) q.gear = o.gear;
      if (o.reward) q.reward = o.reward;
      if (o.fame) q.fame = o.fame;
      STORY_QUESTS.push(q);
    };
    const zone0 = f ? 'terres' : 'val';
    // 1 à 5 : sanctuaire
    push(1, { name: T.n[0], zone: zone0, giver: npc('mentor'), turnin: npc('second'), obj: [{ t: 'talk', label: "Recevoir l'insigne de l'Ordre auprès de {second}" }], text: T.t[0], done: T.d[0], reward: 'insignia' });
    push(2, { name: T.n[1], zone: zone0, giver: npc('second'), turnin: npc('mentor'), obj: [{ t: 'kill', mobs: MOBS_F.beasts[f], n: 6, label: 'Bêtes enragées abattues' }], text: T.t[1], done: T.d[1], gear: true });
    push(3, { name: T.n[2], zone: zone0, giver: npc('mentor'), turnin: npc('mentor'), obj: [{ t: 'collect', item: 'q_ichor_voile', n: 5, from: MOBS_F.gel[f], chance: 0.6 }], text: T.t[2], done: T.d[2] });
    push(4, { name: T.n[3], zone: zone0, giver: npc('mentor'), turnin: npc('mentor'), obj: [{ t: 'kill', mobs: MOBS_F.band[f], n: 6, label: `${cap1(Fv.band)} vaincus` }, { t: 'collect', item: 'q_lettre_voile', n: 1, from: MOBS_F.band[f], chance: 0.3 }], text: T.t[3], done: T.d[3], gear: true });
    push(5, { name: T.n[4], zone: zone0, giver: npc('mentor'), turnin: npc('mentor'), obj: [{ t: 'kill', mob: O.traitor.id, n: 1, label: `${O.traitor.name} vaincu${O.traitor.f ? 'e' : ''}`, spawnTraitor: true }], text: T.t[4], done: T.d[4], gear: 'elite' });
    // 6 à 16 : le voyage
    const ZONES_F = [null, null, null, null, null, zone0, f ? 'canyon' : 'bois', f ? 'canyon' : 'bois', 'marais', 'marais', 'coeur', 'coeur', 'pics', 'desolation', 'cime', 'cime'];
    W.forEach((w, i) => {
      const ch = 6 + i;
      const Vl = { ...V, l: w.k !== undefined ? fill(T.l[w.k], V) : '' };
      push(ch, { name: w.n, zone: ZONES_F[ch - 1], giver: npc(w.gi), turnin: npc(w.ti), obj: w.obj(f, cls), text: fill(w.t, Vl).replace(/^ /, ''), done: w.d, gear: w.gear, reward: w.reward, fame: w.fame });
    });
  }
}
for (const q of STORY_QUESTS) { QUESTS.push(q); QUEST_BY_ID[q.id] = q; }

// résumé d'un chapitre (Chroniques)
export function chapterSummary(q) {
  return q.done;
}
export function chainOf(cls, f) {
  const out = [];
  for (let ch = 1; ch <= CH_COUNT; ch++) out.push(QUEST_BY_ID[chapterId(cls, ch, f)]);
  return out;
}
