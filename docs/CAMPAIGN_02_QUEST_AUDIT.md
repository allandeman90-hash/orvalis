# ORVALIS — CAMPAGNE 2 : AUDIT DES QUÊTES ET PLAN DE RÉÉCRITURE

Status: **CANON MIGRATION BLUEPRINT — 2026-10-09**

Ce document audite les quêtes actuellement présentes dans `src/data/quests.js` et les 16 chapitres générés par `src/data/story.js`, puis fixe ce qui doit être conservé, réécrit ou remplacé avant toute modification runtime.

Il prolonge `CAMPAIGN_01_LEVELING_1_30.md` et le canon `LORE_FOUNDATION.md` + `LORE_01` à `LORE_06`.

Aucun code runtime n'est modifié dans ce bloc.

---

# I. LÉGENDE D'AUDIT

- **KEEP** — objectif, cible et intention sont déjà compatibles avec le canon. Seules des micro-retouches de ton peuvent être faites plus tard.
- **REWRITE** — on conserve principalement l'ID, la cible, le lieu ou l'objectif technique, mais le sens narratif et les textes doivent changer.
- **REPLACE** — la quête contredit le canon ou demande une action qui n'a plus de sens. On conserve l'ID si possible pour limiter la casse, mais objectifs, texte et parfois PNJ/cible doivent être remplacés.
- **REMOVE** — suppression pure. À ce stade aucune quête régionale n'a besoin d'être supprimée : chaque slot peut être réutilisé.

Principe de migration : **préserver autant que possible les IDs, niveaux, récompenses, PNJ déjà placés et primitives d'objectif** afin de ne pas casser la progression, tout en remplaçant complètement les actions moralement/narrativement incompatibles.

---

# II. RÈGLES GÉNÉRALES DE RÉÉCRITURE

1. Les quêtes locales restent locales : tout ne doit pas être causé par les Voilés.
2. Les peuples intelligents ne sont jamais des cibles génériques. Toute violence doit viser une faction hostile identifiée, un criminel, un groupe en guerre ou un individu précis.
3. Les animaux et monstres peuvent rester des objectifs de chasse lorsque le contexte écologique ou de sécurité le justifie.
4. Les quêtes PvP restent facultatives et ne bloquent jamais la compréhension de la campagne principale.
5. Les donjons offrent les preuves les plus fortes, mais la campagne principale possède toujours une piste solo suffisante.
6. La montée du joueur doit être visible socialement : recrue → individu remarqué → anomalie runique → Ascendant confirmé.
7. Une révélation doit recontextualiser les faits déjà observés, jamais annuler artificiellement l'histoire précédente.
8. Le jeu ne doit pas demander au joueur de piller ou massacrer une culture intelligente puis lui annoncer dix niveaux plus tard qu'elle était complexe.

---

# III. VAL D'AZUR — AUDIT 1–6

## `val1` — Le serment de Havrebleu — **REWRITE**
Conserver : Isaure → Clairbourg, niveau 1, tutoriel de déplacement social.

Nouvelle fonction : ouverture pendant les préparatifs du millénaire de la Fracture. Isaure n'envoie pas simplement « une recrue » tuer des nuisibles : les routes rurales connaissent des incidents inhabituels et le Pacte manque de bras.

Titre proposé : **Le millénaire de la Fracture**.

## `val2` — Des loups à la lisière — **REWRITE**
Conserver : 6 loups, Gaspard, protection des enclos.

Ajouter : les loups sont inhabituellement téméraires. Le comportement, pas l'espèce, est anormal.

## `val3` — Rongeurs voraces — **KEEP**
Bonne quête locale simple. Elle sert précisément le principe « le monde vient avant la menace cosmique ».

## `val4` — La charge des sangliers — **REWRITE**
Conserver la cible et le gameplay.

Ajouter des traces de comportement incohérent : les sangliers chargent parfois sans chercher nourriture ni territoire.

Titre possible : **La charge impossible**.

## `val5` — Gelées au bord du lac — **REWRITE**
Conserver les gelées et le lac.

Les gelées servent de premier indice sur la Cicatrice de Continuité : certaines se reforment autour des mêmes berges et reproduisent les mêmes trajectoires.

## `val6` — Les ombres du Vieux Moulin — **REWRITE**
Conserver le Moulin, les brigands et le combat.

Les brigands occupent une ancienne route pré-Fracture et ont reçu ordre de multiplier les agressions à cet endroit précis.

## `val7` — Les sceaux des brigands — **REWRITE**
Conserver l'enquête sur les commanditaires.

Remplacer le faux indice « venu de l'est » par des paiements anonymes, des itinéraires marqués et une consigne répétée : **faire couler le sang sur l'ancienne route**.

Titre proposé : **Le sang acheté**.

## `val8` — Croc-Balafré — **REWRITE**
Conserver le boss local.

Croc-Balafré n'est plus « la cause de toute l'agressivité ». Il est le spécimen le plus fortement affecté par l'anomalie locale. Sa mort soulage la région sans prétendre résoudre le phénomène.

## `val9` — Vers Bois-Murmure — **REWRITE**
Conserver la transition.

Élina est demandée non seulement pour les routes mais parce que des arbres reproduisent des formes impossibles et que des groupes inconnus cherchent quelque chose dans la forêt.

## `valc` — L'enclume de Gaudry — **REWRITE**
Conserver le tutoriel équipement/runes et les éclats.

Cette quête doit introduire clairement l'idée populaire : une rune est un outil de puissance serti dans un Ancrage. Le joueur ne connaît pas encore la vérité cosmologique.

Titre possible : **L'enclume et la rune**.

## `valm` — Du haut des remparts — **REPLACE**
Conserver le Cercle des Pierres Levées comme lieu.

Nouvel objectif : approcher les pierres avec une rune équipée. Une ligne supplémentaire apparaît brièvement dans son inscription. Margot transmet l'incident au mentor de l'Ordre.

Titre proposé : **La rune qui te lit**.

### Chaîne finale Val
`val1 → val2/val3 → val4/val5 → val6 → val7 → val8 → val9`, avec `valc` et `valm` comme chaînes parallèles de système/mystère.

---

# IV. TERRES DE BRAISE — AUDIT 1–6

## `ter1` — Le sang des clans — **REWRITE**
Conserver Korvash → Rougecamp.

Ouvrir sur les commémorations de 1000 AF et la nécessité de sécuriser les caravanes pendant que Forge-Cendre se remplit de visiteurs.

Titre proposé : **Les feux du millénaire**.

## `ter2` — Hyènes affamées — **REWRITE**
Conserver la chasse.

Les hyènes attaquent les porteurs d'eau avec une agressivité anormale autour de petites poches de Transformation instable.

## `ter3` — Dards pour la chamane — **KEEP**
Bonne quête locale/métier.

## `ter4` — Charognards — **KEEP**
Bonne quête quotidienne de camp.

## `ter5` — Braises vivantes — **REWRITE**
Conserver les gelées de braise.

Elles servent à montrer que la matière change trop facilement dans la Cicatrice de Transformation.

## `ter6` — Le Camp des Pillards — **REWRITE**
Conserver le camp et les pillards.

Il s'agit d'un groupe précis ayant choisi la prédation et payé pour attaquer certains trajets caravaniers.

## `ter7` — Insignes volés — **REWRITE**
Remplacer l'indice simpliste « symbole de l'ouest » par des paiements sans clan, cartes de trajets et ordres de provoquer des morts près de lignes anciennes.

Titre proposé : **Un paiement sans clan**.

## `ter8` — Mâchoire-de-Fer — **REWRITE**
Conserver la hyène élite.

Ses crocs métallisés deviennent un effet visible de la Transformation : du métal d'anciens débris s'est littéralement incorporé à sa mâchoire.

## `ter9` — Vers le Canyon des Scories — **REWRITE**
Conserver la transition.

Rukh signale des conflits miniers et surtout un mystérieux Battement sous le Canyon.

## `terc` — La forge de Brenna — **REWRITE**
Conserver le tutoriel runique.

Brenna explique la différence entre une rune et l'Ancrage qui la supporte.

Titre possible : **La forge et la rune**.

## `term` — La vue des mesas — **REPLACE**
Conserver l'Oasis de Sèchepierre.

Nouvel objectif : tester une rune près de l'eau anormalement stable. Même phénomène que les Pierres Levées côté Azur : une ligne supplémentaire apparaît.

Titre proposé : **L'eau qui refuse la Braise**.

### Chaîne finale Terres
`ter1 → ter2/ter3 → ter4/ter5 → ter6 → ter7 → ter8 → ter9`, avec `terc` et `term` parallèles.

---

# V. BOIS-MURMURE — AUDIT 6–12

## `bois1` — Toiles et venin — **KEEP**
Les araignées restent une menace naturelle locale.

## `bois2` — Le remède de l'herboriste — **KEEP**
Bonne quête de culture/métier.

## `bois3` — Des peaux pour l'hiver — **KEEP**
Compatible si présentée comme chasse de subsistance et non extermination.

## `bois4` — Souche-Creuse — **REPLACE**
L'ancienne version transforme tous les gobelins en cibles.

Nouvelle fonction : identifier les responsables des attaques. Le joueur rencontre d'abord un gobelin neutre ou marchand, apprend que Souche-Creuse est divisée, puis combat uniquement les fidèles armés de Grincedent.

Titre proposé : **Ceux de Souche-Creuse**.

## `bois5` — Babioles gobelines — **REPLACE**
On ne vole plus arbitrairement les objets culturels de gobelins génériques.

Nouvelle quête : récupérer sur les hommes de Grincedent des **fragments de bois-mémoire** déjà arrachés à la forêt, ou les acheter/recevoir d'un gobelin neutre pour analyse.

Titre proposé : **Les souvenirs volés**.

## `bois6` — Le chef Grincedent — **REWRITE**
Conserver Grincedent comme boss.

Il dirige une faction violente, pas « les gobelins ». Il vend aux Voilés des fragments de mémoire forestière en échange d'or et de protection.

Sa mort provoque une crise politique à Souche-Creuse au lieu de « vaincre les gobelins ».

## `bois7` — La sève corrompue — **REWRITE**
La sève noire devient une mémoire végétale forcée/extraitement runique. Les Voilés tentent de lire le passé de la forêt.

Titre proposé : **La sève se souvient**.

## `bois8` — La Reine des toiles — **KEEP**
Tisseuse reste une créature majeure et non un peuple intelligent.

## `bois9` — Vers le Marais — **REWRITE**
Conserver la transition mais annoncer Vasegrise comme une frontière culturelle complexe, pas uniquement « le front contre Braise ».

### Chaîne finale Bois
`bois1/bois2 → bois3 → bois4 → bois5 → bois6/bois7 → bois8 → bois9`.

La campagne principale y croise la première preuve que les Voilés recherchent la **mémoire géographique pré-Fracture**.

---

# VI. CANYON DES SCORIES — AUDIT 6–12

## `can1` — Ailes de la nuit — **KEEP**
Menace locale valable.

## `can2` — Glandes ignées — **KEEP**
Bonne quête d'artisanat/expérimentation.

## `can3` — Les terriers de Fouille-Suie — **REPLACE**
L'ancienne version demande de montrer « qui commande » à tous les kobolds.

Nouvelle fonction : arbitrer un conflit de galerie puis identifier la faction de Grand-Mèche qui a accepté l'aide des Voilés.

Titre proposé : **Fouille-Suie ne parle pas d'une seule voix**.

## `can4` — Bougies volées — **REPLACE**
La culture kobolde n'est plus traitée comme curiosité à piller.

Nouvelle fonction : obtenir de la cire de scorie auprès de kobolds neutres ou récupérer des lampes appartenant aux saboteurs de Grand-Mèche.

Titre proposé : **La cire qui ne s'éteint pas**.

## `can5` — Grand-Mèche — **REWRITE**
Conserver le boss.

Il est le chef d'une faction hostile, payé pour creuser une ligne enterrée précise. Ses plans montrent que les Voilés ne cherchent pas du minerai.

## `can6` — Noyaux de scorie — **REWRITE**
Les golems deviennent potentiellement des mécanismes ou organismes liés à la Cicatrice de Profondeur. Les noyaux collectés présentent un rythme identique au Battement.

Titre proposé : **Ce qui bat dans la pierre**.

## `can7` — Le cœur de la mine — **REWRITE**
Conserver le boss de groupe.

Le joueur comprend que le « cœur » protège une ancienne structure. Cette quête prépare Mèchenoire et le premier schéma des neuf nœuds.

## `can8` — Vers le Marais — **REWRITE**
Conserver la transition en signalant que des mineurs et kobolds différents rapportent simultanément des phénomènes venant de Vasegrise.

### Chaîne finale Canyon
`can1/can2 → can3 → can4 → can5 → can6 → can7 → can8`.

---

# VII. MARAIS DE VASEGRISE — AUDIT 12–18

C'est la zone qui nécessite la plus forte refonte des quêtes existantes.

## `mar1` — Écailles et lances — **REPLACE**
Supprimer l'objectif générique « tuer 8 Crapoussins ».

Nouvelle quête : repousser une bande précise de guerriers crapoussins ayant attaqué les deux camps, puis découvrir qu'ils ne représentent pas Bourg-Crapoussin dans son ensemble.

Titre proposé : **Les roseaux ont des voix**.

## `mar2` — Cuir de croco — **KEEP**
Bonne quête locale de survie.

## `mar3` — Sang épais — **KEEP**
Bonne quête de guérison et d'environnement.

## `mar4` — Lueurs trompeuses — **REPLACE**
Les feux follets ne doivent plus être simplement « éteints » si le lore les lie à des Empreintes retenues.

Nouvel objectif : les **apaiser/libérer** à l'aide d'un rituel ou d'un objet, avec combat uniquement contre les manifestations devenues dangereuses.

Titre proposé : **Lueurs retenues**.

## `mar5` — Bourg-Crapoussin — **REPLACE**
Supprimer l'infiltration pour voler des écailles.

Nouvelle fonction : première mission diplomatique à Bourg-Crapoussin. Le joueur apprend la culture locale, rencontre une faction non hostile et découvre que certains guerriers sont manipulés par les Voilés.

Titre conservé possible : **Bourg-Crapoussin**.

## `mar6` — La Sorcière des tourbières — **REWRITE**
Conserver le boss si souhaité.

La Sorcière devient une figure dissidente ayant conclu un pacte avec les Voilés pour contrôler les Empreintes retenues dans la Cicatrice de Frontière. Elle n'est pas « responsable du marais » entier.

## `mar7` — La Mère Vase — **REPLACE**
La Mère Vase saine ne doit pas être tuée.

Nouvelle mission : les Voilés tentent d'arracher ou de contaminer sa mémoire. Le joueur affronte une **manifestation de corruption / parasite runique / écho détaché**, puis protège la Mère Vase.

Titre proposé : **La mémoire de la Mère Vase**.

Le modèle actuel de `mere_vase` peut éventuellement servir provisoirement à une manifestation corrompue, mais le canon final distingue clairement la gardienne saine du boss.

## `mar8` — Guerre dans les roseaux — **REWRITE**
Conserver comme quête PvP facultative.

Le texte doit reconnaître que les affrontements Azur/Braise nourrissent exactement le type de violence exploité par les Voilés. La quête peut rester proposée par des officiers bellicistes et devenir volontairement révélatrice des contradictions politiques.

Elle ne doit pas être prérequis de campagne.

## `mar9` — Vers le Cœur d'Orvalis — **REWRITE**
Transition conservée. Le joueur part vers le Cœur avec une preuve : des marques de Vasegrise forment un motif de **neuf positions**.

### Chaîne finale Marais
`mar1 → mar5 → mar6 → mar7 → mar9` comme colonne narrative, avec `mar2/mar3/mar4` en culture/survie et `mar8` en PvP optionnel.

---

# VIII. CŒUR D'ORVALIS — AUDIT 18–24

## `coe1` — Les légions sans repos — **REWRITE**
Conserver les squelettes.

Ils répètent des formations anciennes parce que la Cicatrice de Contradiction maintient certaines Empreintes dans des routines incomplètes.

## `coe2` — Os pour l'archiviste — **REWRITE**
Les gravures ne se limitent plus à « une seule couronne ». Elles contiennent des fragments administratifs et runiques permettant de dater les dernières semaines avant la Fracture.

Titre proposé : **Les os écrivent encore**.

## `coe3` — Chasse aux spectres — **REWRITE**
Les ectoplasmes deviennent des fragments d'Empreintes permettant de reconstruire des phrases répétées : Morvhal étudiait déjà une défaillance du Glyphe avant Elyra.

Titre proposé : **Ce que les spectres répètent**.

## `coe4` — Pierre qui vole — **REWRITE**
Conserver les gargouilles.

Elles sont d'anciennes sentinelles qui se réactivent autour des lignes du Grand Glyphe.

Titre proposé : **Les sentinelles qui se réveillent**.

## `coe5` — Le Bastion d'Orvalis — **REWRITE**
Conserver entièrement le système de capture/event.

Le Bastion devient aussi un ancien nœud de stabilité. Sa « bénédiction » d'XP n'est pas un bonus arbitraire : contrôler le nœud stabilise momentanément l'Empreinte des membres de la faction proche.

PvP toujours facultatif pour la campagne principale.

## `coe6` — Le Chevalier maudit — **REWRITE**
Conserver le boss.

Il ne garde plus simplement « le dernier roi ». Son serment incomplet le force à protéger un accès aux niveaux où Morvhal travaillait sur le Grand Glyphe.

Titre proposé : **Le serment du Chevalier**.

## `coe7` — La Reine-Liche — **REWRITE**
Conserver Ossevaine comme boss, mais enrichir son identité.

Ossevaine ne « reconstruit pas juste un royaume ». Son Empreinte contradictoire répète une mission de préservation de Valcœur. Elle peut avoir été reine consort, régente ou haute gardienne royale ; son statut exact sera fixé lors de la réécriture du boss.

Titre proposé : **Ossevaine, la Reine suspendue**.

Sa défaite doit donner une archive ou clé menant aux Catacombes, pas prétendre « libérer définitivement le Cœur ».

## `coe8` — Sang pour la bannière — **REWRITE**
Conserver comme PvP optionnel.

Le texte doit montrer le paradoxe : les deux factions se battent exactement au-dessus d'une cicatrice que le sang rend plus instable.

## `coe9` — Vers les Pics Gelés — **REWRITE**
La transition est motivée par la recherche d'archives de l'an 0 préservées par la Cicatrice d'Immobilité.

Titre proposé : **Vers les archives gelées**.

### Chaîne finale Cœur
`coe1/coe2 → coe3/coe4 → coe6 → coe7 → coe9`.
`coe5` et `coe8` restent du contenu de guerre optionnel.

Le donjon Catacombes apporte ici la révélation « INACHEVÉ » et confirme que Morvhal connaissait déjà la dégradation du Glyphe.

---

# IX. PICS GELÉS — AUDIT 24–27

## `pic1` — Fourrures givrées — **KEEP**
Quête de survie locale valable.

## `pic2` — Le pas du yéti — **KEEP**
Les yétis ne sont pas actuellement définis comme peuple intelligent. La quête peut rester écologique/sécuritaire.

## `pic3` — Éclats de givre — **REWRITE**
Les éclats sont intéressants parce qu'ils conservent non seulement le froid mais une configuration runique ancienne.

Titre possible : **Le givre qui refuse de changer**.

## `pic4` — L'Antre des Trolls — **REPLACE**
Supprimer la collecte de défenses sur des trolls génériques.

Nouvelle fonction : découvrir qu'une fortification humaine coupe une ancienne route migratoire troll. Le joueur peut rencontrer un troll non hostile et identifier le clan de Crocglace comme faction belliqueuse distincte.

Titre proposé : **Les chemins des Trolls**.

## `pic5` — Le Jarl Crocglace — **REWRITE**
Conserver le boss.

Crocglace dirige un clan qui exploite le conflit et s'est emparé d'une partie des archives gelées, éventuellement avec l'aide des Voilés.

Sa mort ne signifie pas « les trolls se dispersent ».

## `pic6` — Vers la Désolation — **REWRITE**
La route passe par des preuves de l'an zéro. Le joueur découvre que Valcœur avait bien envoyé des convois de secours vers l'est et que certains furent détournés.

Titre proposé : **La route figée de l'an zéro**.

### Chaîne finale Pics
`pic1/pic2 → pic3 → pic4 → pic5 → pic6`, avec Givre-Écaille comme instance narrative majeure.

---

# X. DÉSOLATION CENDRÉE — AUDIT 27–30

## `des1` — Cornes de diablotin — **KEEP**
Bonne chasse locale.

## `des2` — Crocs de lave — **KEEP**
Bonne collecte de zone.

## `des3` — Cœur d'obsidienne — **REWRITE**
Les golems ne sont pas juste « monstres presque invulnérables » : certains sont des structures animées par la Cicatrice de Dissolution ou des mécanismes réutilisés par le Creuset.

## `des4` — Les Drakônides — **REPLACE**
Supprimer « les drakônides servent le Wyrm » comme généralité.

Nouvelle fonction : rencontrer une faction drakônide hostile et, surtout, un dissident/émissaire prouvant que leur peuple est divisé.

Titre proposé : **Les Drakônides divisés**.

## `des5` — Le Wyrm de Cendre — **REWRITE**
Conserver Vyrmathra comme boss majeur.

Le joueur découvre qu'un wyrm peut **cristalliser autour d'une résonance régionale**. Vyrmathra est donc créature et phénomène de la Désolation.

Sa mort est une vraie victoire locale, pas la fin du phénomène des wyrms.

## `des6` — Vers la Cime des Tempêtes — **REWRITE**
Transition vers la défense des Sceaux. Le joueur sait désormais que les traditions vivantes des Ordres sont elles-mêmes une partie du système de scellement.

Titre proposé : **Vers l'Autel**.

### Chaîne finale Désolation
`des1/des2 → des3 → des4 → des5 → des6`, avec le Creuset Écarlate comme preuve de l'exploitation volontaire d'une ligne du Grand Glyphe.

---

# XI. CIME DES TEMPÊTES — AUDIT NIVEAU 30

## `cim1` — Plumes d'orage — **KEEP**
Bonne quête d'environnement/endgame.

## `cim2` — Cœurs de foudre — **REWRITE**
Les élémentaires deviennent des manifestations de la Cicatrice de Potentiel. Leurs cœurs servent à comprendre et stabiliser l'orage, pas simplement à « affaiblir Azhkar ».

## `cim3` — Les Gardiens runiques — **REPLACE**
Le texte actuel demande de tuer les créatures qui protègent l'Autel pour leur voler leurs runes, contradiction directe.

Nouvelle quête : **réactiver / réparer / libérer les Gardiens corrompus** et récupérer uniquement des fragments détachés ou des clés de maintenance.

Titre proposé : **Réveiller les Gardiens**.

## `cim4` — Le Dévoreur d'Orages — **REWRITE**
Conserver Azhkar et son caractère de world boss périodique.

Azhkar est une concentration récurrente de Potentiel devenue prédatrice. Sa défaite disperse le phénomène, expliquant naturellement son retour.

## `cim5` — Héros de guerre — **REWRITE**
Conserver comme PvP endgame optionnel, mais ne plus présenter la guerre comme priorité au moment où les Sceaux sont menacés.

Peut devenir une quête de prestige de faction explicitement controversée.

Titre possible : **Duel sous l'orage**.

### Chaîne finale Cime
`cim1/cim2 → cim3 → cim4`, tandis que `cim5` reste entièrement optionnelle.

La vraie campagne principale passe ensuite aux Hérauts et aux raids.

---

# XII. AUDIT DES 16 CHAPITRES PRINCIPAUX DE `story.js`

Les 16 chapitres techniques et leurs paliers de niveau sont conservés. On réécrit leurs textes et parfois leurs objectifs, mais il n'est pas nécessaire de jeter le générateur par classe/faction.

## Chapitre 1 — Serment de l'Ordre — **REWRITE**
Conserver le sanctuaire et l'initiation.

Corriger le vieux lore : les fondateurs n'ont pas « forgé de zéro » les Sceaux ; ils ont récupéré/utilisé des Grandes Runes et créé une tradition vivante qui fait désormais partie du Sceau.

## Chapitre 2 — Épreuve de classe — **KEEP / LIGHT REWRITE**
Conserver l'apprentissage des mécaniques propres à chaque classe.

Le texte doit refléter la nouvelle « grammaire runique » de l'Ordre.

## Chapitre 3 — ancienne quête d'ichor — **REPLACE**
La première anomalie centrale devient la réaction de la rune au joueur.

Le mentor constate que l'inscription semble produire une lecture supplémentaire près du Cercle des Pierres / de Sèchepierre.

Titre générique : **La rune te lit**.

## Chapitre 4 — bandits payés — **REWRITE**
Conserver brigands/pillards.

La preuve importante est qu'ils sont payés pour produire de la violence sur des lignes anciennes, pas seulement qu'ils sont méchants.

Titre générique : **Le sang acheté**.

## Chapitre 5 — traître de classe — **REWRITE**
Conserver les huit traîtres existants.

Avant sa chute, chacun reconnaît un détail impossible dans l'Empreinte du joueur.

Phrase commune de fond : **« Ton Empreinte ne se ferme pas. »**

## Chapitre 6 — Porte-parole des Ordres — **REWRITE**
Conserver le trajet vers la capitale et l'émissaire.

La nouvelle scène rassemble les rapports des huit Ordres : la même anomalie est observée chez plusieurs jeunes initiés, pas seulement chez le joueur.

## Chapitre 7 — camp voilé région 6–12 — **REWRITE**
Conserver l'existence d'une implantation voilée.

Le joueur découvre que les Voilés recherchent mémoire/profondeur, pas simplement qu'ils récitent des prières.

## Chapitre 8 — Grincedent / Grand-Mèche — **REWRITE**
Conserver les bosses de faction et la convergence des branches Azur/Braise.

La preuve récupérée représente une portion de structure à neuf nœuds.

## Chapitre 9 — Îlot des Voilés — **REWRITE**
Conserver l'Îlot.

Le joueur découvre que les Voilés alimentent sciemment les affrontements des deux factions dans une zone où la frontière de la Trame est instable.

## Chapitre 10 — anciennes « âmes des tourbières » — **REPLACE**
Nouvelle fonction : enquête auprès des Crapoussins et de la Mère Vase sur les **neuf marques** anciennes.

C'est ici que le rival Ascendant de l'autre faction apparaît réellement dans la campagne. Le joueur et lui peuvent devoir coopérer momentanément.

Titre proposé : **Neuf marques dans la vase**.

## Chapitre 11 — Chapelle voilée au Cœur — **REWRITE**
Conserver la Chapelle et les zélotes.

Les Voilés y présentent Morvhal non comme simple roi fou, mais comme homme qui avait identifié une vraie défaillance. Le joueur n'a pas encore toutes les preuves.

## Chapitre 12 — Chevalier / Crypte / Catacombes — **REWRITE**
Conserver l'accès au Chevalier et au sous-sol.

Après Catacombes ou sa piste solo, une interface/porte des Graveurs reconnaît le joueur par un terme traduit : **INACHEVÉ**.

C'est le premier moment où le jeu confirme vraiment que le joueur appartient à une catégorie anormale.

## Chapitre 13 — Pics / archives gelées — **REWRITE**
Conserver la marche vers les Pics.

Le joueur récupère une preuve de l'an zéro : les secours vers l'est existaient bien, mais furent détournés vers une installation runique.

## Chapitre 14 — Désolation / drakônides — **REWRITE**
Remplacer l'idée « tous enfants de Nyxaroth » par une guerre interne drakônide.

Un dissident révèle que le Creuset utilise une ancienne ligne du Grand Glyphe et prépare les Hérauts.

## Chapitre 15 — Héraut de classe — **REWRITE**
Conserver les huit Hérauts, l'Autel et la récompense majeure.

La révélation centrale : détruire un Ordre, ses maîtres et sa transmission peut affaiblir un Sceau même si son fragment physique reste intact.

Le joueur sauve donc **une tradition vivante**.

## Chapitre 16 — ancien rapport final — **REWRITE**
Conserver le retour vers Isaure/Korvash, mais en faire une vraie scène politique.

Les Ordres présentent officiellement le joueur comme **Ascendant**. Sa progression devient un problème stratégique pour les deux factions.

Cette quête débloque l'endgame narratif : Sanctuaire des Tempêtes puis Trône de Cendre-Noire.

Titre proposé : **Ascendant**.

---

# XIII. NOUVELLE COLONNE VERTÉBRALE 1–30

## Niveau 1–6 — « Quelque chose te lit »
Faction, vie locale, première rune, première anomalie, violence achetée, traître d'Ordre.

## Niveau 6–12 — « Le monde possède une structure »
Bois/Canyon, peuples intelligents, Voilés qui cherchent mémoire/profondeur, premier motif à neuf nœuds, Mèchenoire.

## Niveau 12–18 — « Les frontières ne sont pas celles qu'on croit »
Vasegrise, Crapoussins, Mère Vase, guerre exploitée par les Voilés, premier véritable contact avec le rival Ascendant.

## Niveau 18–24 — « Morvhal savait »
Cœur, Contradiction, Elyra, archives royales, Catacombes, terme **INACHEVÉ**, confirmation de l'Ascendance.

## Niveau 24–27 — « L'histoire fondatrice est incomplète »
Pics, trolls comme peuple, archives gelées, convois de l'an zéro, structure des neuf régions.

## Niveau 27–30 — « Les Sceaux sont vivants »
Désolation, factions drakônides, wyrms phénomènes, Creuset, attaque contre les traditions vivantes, Hérauts.

## Niveau 30 — « Le monde sait ce que tu deviens »
Cime, Azhkar, Héraut, proclamation Ascendant, Sanctuaire des Tempêtes, Trône de Cendre-Noire, Rune Impossible.

---

# XIV. INSTANCES — AUDIT DE MIGRATION

## Les Galeries de Mèchenoire — **REWRITE NARRATIF / KEEP STRUCTURE**
Conserver nom, thème mine, trois boss et layout.

Révélation : ancien mécanisme de confinement des Graveurs et première représentation des neuf nœuds.

## Le Sanctuaire Englouti — **REWRITE NARRATIF / KEEP STRUCTURE**
Conserver thème marais et progression.

Le temple est recontextualisé comme ancienne installation de régulation des eaux/frontières. Les Crapoussins ne sont pas les « monstres du donjon » dans leur ensemble : seules certaines factions/occupants hostiles combattent le groupe.

Révélation : même structure à neuf nœuds, indépendante de Mèchenoire.

## Les Catacombes du Roi Oublié — **REWRITE NARRATIF / KEEP STRUCTURE**
Conserver Morvhal comme boss de fin, mais explicitement comme fragment d'Empreinte.

Révélations : dégradation préexistante du Grand Glyphe, recherches d'Elyra/Morvhal, reconnaissance **INACHEVÉ**.

## Citadelle de Givre-Écaille — **REWRITE NARRATIF / KEEP STRUCTURE**
Conserver forteresse glacée, Sœurs et Hjarnok.

Révélations : archives de l'année 0, secours vers Braise, convois détournés, anciennes lignes vues avant la Fracture.

## Creuset Écarlate — **REWRITE NARRATIF / KEEP STRUCTURE**
Conserver forge, drakônides, bosses.

Ajouter une faction drakônide dissidente hors instance. À l'intérieur se trouvent les loyalistes/forgerons du Creuset.

Révélation : les Hérauts attaquent la transmission vivante des Ordres ; une ancienne ligne du Grand Glyphe alimente la forge.

## Sanctuaire des Tempêtes — **REWRITE NARRATIF / KEEP STRUCTURE**
Premier raid recommandé.

Le groupe comprend que l'Autel, la Cime et les huit traditions forment ensemble une partie du système de stabilisation.

Révélation : huit périphéries + centre = structure plus grande.

## Trône de Cendre-Noire — **REWRITE NARRATIF / KEEP STRUCTURE**
Deuxième raid / conclusion Arc 1.

Nyxaroth y apparaît sous forme d'une **Incarnation réelle mais partielle**. La victoire est authentique sans tuer la présence cosmologique.

Dernière phrase proposée de l'Incarnation :

> « Vous aussi, vous devenez difficiles à écrire. »

Stinger post-raid : apparition ou message lié à la Rune Impossible — **« VOUS APPRENEZ ENCORE À LIRE. »**

---

# XV. QUÊTES À NE JAMAIS REPRODUIRE SOUS LEUR ANCIEN SENS

Même si les IDs sont réutilisés, les intentions suivantes sont définitivement non canoniques :

- massacrer des Gobelins parce qu'ils sont Gobelins ;
- massacrer des Kobolds parce qu'ils occupent une mine ;
- voler des objets culturels kobolds/gobelins sans contexte ;
- massacrer des Crapoussins pour avancer dans le marais ;
- voler leurs écailles à Bourg-Crapoussin ;
- tuer la Mère Vase saine pour « prendre le marais » ;
- tuer des Trolls génériques et ramener leurs défenses comme preuve ;
- tuer des Drakônides génériques parce que tous serviraient Nyxaroth ;
- tuer les Gardiens runiques de l'Autel pour leur voler leurs runes ;
- présenter la mort d'un chef non humain comme la défaite de tout son peuple ;
- présenter le PvP Azur/Braise comme moralement nécessaire pour comprendre l'histoire principale.

---

# XVI. NOUVEAUX PNJ / ÉLÉMENTS NARRATIFS NÉCESSAIRES À LA MIGRATION RUNTIME

La réécriture demandera probablement un petit nombre de nouveaux PNJ plutôt qu'une explosion de contenu :

1. **un gobelin neutre de Souche-Creuse** — marchand/guide/témoin de la scission Grincedent ;
2. **un kobold neutre ou ancien de Fouille-Suie** — explique que « la pierre compte » et le Battement ;
3. **un porte-parole crapoussin** — diplomatie à Bourg-Crapoussin ;
4. **un gardien/mémoire lié à la Mère Vase** ;
5. **un troll non hostile** dans les Pics — preuve immédiate qu'un peuple ≠ une faction hostile ;
6. **un drakônide dissident** dans la Désolation ;
7. **Maëlys Varenne / Darek Cendre-Libre**, rival Ascendant selon la faction du joueur ;
8. éventuellement un archiviste spécialisé dans les données d'Elyra au Cœur.

Ces PNJ devront être réutilisés sur plusieurs quêtes pour créer de vrais personnages plutôt que des distributeurs de texte jetables.

---

# XVII. ORDRE DE MIGRATION RUNTIME RECOMMANDÉ

Quand le projet passera réellement à la réécriture du code :

1. ajouter les nouveaux PNJ/factions de créatures nécessaires ;
2. migrer Val + Terres ;
3. migrer Bois + Canyon ;
4. migrer Vasegrise ;
5. migrer Cœur ;
6. migrer Pics ;
7. migrer Désolation + Cime ;
8. réécrire les templates `story.js` chapitres 1–16 ;
9. réécrire descriptions/rencontres narratives de `dungeons.js` ;
10. tests ciblés de chaînes/prérequis/PNJ manquants ;
11. seulement ensuite faire un smoke de progression complète 1–30.

On ne mélange pas cette migration avec l'acquisition d'assets.

---

# XVIII. GATE DE VALIDATION

Avant de considérer la campagne prête à être implémentée, chaque zone doit réussir ces questions :

- Pourquoi le joueur est-il ici autrement que « il faut XP » ?
- Quelle culture locale découvre-t-il ?
- Quel élément du canon est montré visuellement ?
- Quelle information nouvelle apprend-il ?
- Cette information recontextualise-t-elle une précédente ?
- Y a-t-il au moins une quête qui n'a rien à voir avec les Voilés ?
- Un peuple intelligent est-il traité comme une société et non comme une famille de mobs ?
- Le joueur comprend-il pourquoi le boss local est son ennemi ?
- La zone prépare-t-elle naturellement la suivante ?
- L'environnement et les quêtes racontent-ils la même histoire ?

Si une zone échoue à plusieurs de ces questions, elle doit être réécrite avant production artistique finale.
