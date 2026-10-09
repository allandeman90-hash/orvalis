# ORVALIS — ACTE I : PLAN TECHNIQUE DES CARTES ET DU STREAMING

Status: **CANON TECHNICAL WORLD BLUEPRINT — 2026-10-09**

Ce document transforme le périmètre narratif/visuel de l'Acte I 1–50 en structure de monde exploitable par le moteur Orvalis.

Il ne modifie pas encore le runtime. Il fixe les frontières de production, les espaces de carte, les tailles cibles, les règles de transition et la stratégie de streaming qui guideront ensuite le greybox, les assets et les futurs providers de données.

En cas de conflit d'échelle avec un ancien document de campagne, `ACT_I_LAUNCH_SCOPE_1_50.md` reste maître sur le contenu et le présent document est maître sur le découpage technique du monde de lancement.

---

# I. LES UNITÉS TECHNIQUES DÉJÀ EXISTANTES

Le moteur possède déjà une topologie utilisable telle quelle :

- **1 cellule terrain = 4 unités ≈ 4 m** dans le profil Orvalis actuel ;
- **1 chunk = 8 × 8 cellules = 32 × 32 m** ;
- **1 tile = 16 × 16 chunks = 512 × 512 m** ;
- une tile représente donc environ **0,262 km²** ;
- les coordonnées de tiles sont des entiers non bornés, positifs ou négatifs ;
- une `TerrainMap` est sparse : une coordonnée sans terrain ne consomme pas de tile ;
- plusieurs `TerrainMap` peuvent exister dans le même `TerrainWorld`.

Cette structure est conservée.

## Nouvelle unité de production : le secteur de contenu

Pour les objets, PNJ, créatures, événements et props, on ajoute au **plan de données futur** la notion de :

# **secteur de contenu = 4 × 4 chunks = 128 × 128 m**

Une tile terrain contient donc **16 secteurs de contenu**.

Cette unité ne remplace pas les chunks du moteur. Elle sert à regrouper logiquement :

- instances de végétation ;
- props ;
- bâtiments ;
- spawn sets ;
- événements ;
- volumes audio ;
- petits volumes de biome ;
- références de collision ;
- points d'intérêt.

Ainsi, le terrain reste streamé en tiles de 512 m tandis que les objets peuvent être activés/désactivés plus finement.

---

# II. PRINCIPE DE MONDE : LE MOINS DE MAPS POSSIBLE

Une région de lore n'est PAS automatiquement une `TerrainMap` différente.

Le joueur doit ressentir un monde continu.

Le lancement vise seulement **trois grands espaces persistants principaux** :

1. `orvalis_mainland` — continent principal ;
2. `nacrebrume` — archipel maritime ;
3. `sous_trame` — grand réseau souterrain.

Les donjons, raids, scénarios spéciaux et l'Abîme utilisent ensuite des maps instanciées séparées.

Cette organisation évite :

- un écran de chargement à chaque frontière de région ;
- treize systèmes de coordonnées indépendants ;
- la duplication artificielle de terrain lointain ;
- des transitions de biome qui ressemblent à des changements de niveau.

---

# III. MAP 1 — `orvalis_mainland`

Cette map contient de manière **seamless** :

## Noyau d'Orvalis — niveaux 1–30

1. Val d'Azur
2. Terres de Braise
3. Bois-Murmure
4. Canyon des Scories
5. Marais de Vasegrise
6. Cœur d'Orvalis
7. Pics Gelés
8. Désolation Cendrée
9. Cime des Tempêtes

## Prolongements de l'Acte I — niveaux 30–50

10. Marches de Verre, avec Plateaux/Haut-Silex ;
11. Territoires d'Orée, avec Lisière Blanche et Confluence.

Nacrebrume et Sous-Trame restent sur leurs propres espaces techniques.

## Enveloppe de greybox proposée

Le **Cœur d'Orvalis est placé près de l'origine technique** afin de garder les coordonnées importantes proches de `(0,0)`.

Enveloppe initiale du Noyau :

- environ **10 × 10 tiles** ;
- donc environ **5,12 km × 5,12 km** de bounding box maximale ;
- la forme réelle est irrégulière et sparse ;
- montagnes, falaises, eau et bords inaccessibles signifient que toutes les coordonnées de cette enveloppe ne doivent pas devenir du terrain jouable dense.

Marches de Verre :

- extension orientale d'environ **5 tiles de profondeur** au-delà du Noyau ;
- environ **14–18 tiles de terrain jouable** selon le greybox final.

Territoires d'Orée :

- prolongement au-delà des Marches ;
- environ **14–18 tiles jouables** ;
- connexion terrestre réellement praticable, pas une téléportation.

Le continent principal complet tient ainsi dans une enveloppe d'environ :

- **20 tiles d'ouest en est ≈ 10,24 km** ;
- environ **10–11 tiles nord-sud ≈ 5,1–5,6 km** ;
- avec une surface réellement jouable nettement inférieure grâce aux formes sparse, montagnes, mers et vides naturels.

Ces chiffres sont des **budgets de greybox**, pas une obligation de remplir chaque mètre carré.

---

# IV. BUDGET DE TILES PAR GRANDE RÉGION

Le but est la densité, pas le gigantisme.

Budgets de production recommandés pour le premier greybox :

| Région | Tiles jouables cibles | Surface approx. | Rôle |
|---|---:|---:|---|
| Val d'Azur | 9–11 | 2,4–2,9 km² | starter dense + Havrebleu |
| Terres de Braise | 9–11 | 2,4–2,9 km² | starter dense + Forge-Cendre |
| Bois-Murmure | 10–13 | 2,6–3,4 km² | forêt verticale/dense |
| Canyon des Scories | 10–13 | 2,6–3,4 km² | gorges + mines |
| Vasegrise | 10–13 | 2,6–3,4 km² | marais / eau / passerelles |
| Cœur d'Orvalis | 12–15 | 3,1–3,9 km² | plus grande densité de ruines/PvP |
| Pics Gelés | 9–11 | 2,4–2,9 km² | routes étroites + lac |
| Désolation Cendrée | 10–13 | 2,6–3,4 km² | volcanique / frontière est |
| Cime des Tempêtes | 7–9 | 1,8–2,4 km² | zone verticale de climax |
| Marches de Verre | 14–18 | 3,7–4,7 km² | grande progression 30–40 |
| Territoires d'Orée | 14–18 | 3,7–4,7 km² | fin de leveling 43–50 |

La somme n'est pas une surface de rectangle : les régions partagent des lisières visuelles et sont dessinées dans une map sparse unique.

## Temps de traversée visé

Une région normale doit donner l'impression d'être importante sans être vide.

Cible de design :

- **3 à 6 minutes** pour traverser directement une région moyenne à pied si l'on ignore combats/arrêts ;
- beaucoup plus en jeu normal à cause des routes, reliefs, quêtes et détours ;
- les grandes régions haut niveau peuvent dépasser cette cible sur leur axe principal.

Ce critère est plus utile que de viser une superficie arbitraire.

---

# V. POSITION RELATIVE DU NOYAU

La composition 3 × 3 du lore reste la base géographique :

```text
[Pics Gelés]       [Cime des Tempêtes]    [Désolation Cendrée]
[Val d'Azur]       [Cœur d'Orvalis]       [Terres de Braise]
[Bois-Murmure]     [Marais de Vasegrise]  [Canyon des Scories]
```

Les cases ne sont PAS carrées en production.

Les frontières suivent :

- montagnes ;
- ruptures de terrain ;
- fleuves ;
- falaises ;
- lignes de stabilité ;
- cols ;
- anciennes routes.

Les douze cols déjà prévus servent de passages lisibles et de points naturels de préchargement.

Marches de Verre prolongent principalement l'est / nord-est au-delà de Désolation et des routes orientales.

Territoires d'Orée se trouvent au-delà des Marches et forment le prolongement terrestre final de l'Acte I.

---

# VI. MAP 2 — `nacrebrume`

Nacrebrume est une map séparée pour trois raisons :

1. elle est géographiquement offshore ;
2. charger des kilomètres d'océan détaillé serait inutile ;
3. le voyage en bateau depuis Havrebleu constitue une transition diégétique naturelle.

## Enveloppe

- environ **6 × 6 tiles** d'espace logique ;
- seulement **9–12 tiles de terre réellement jouable** ;
- le reste peut être mer sparse + surface océanique/far backdrop plutôt que terrain détaillé.

Sous-zones :

- Port-Nacré ;
- Îles des Brisants ;
- Bancs de Nacre ;
- Île du Phare ;
- Crique des Sans-Bannière.

## Navigation inter-îles

Les petites traversées utilisent :

- bateaux courts ;
- pontons ;
- embarcadères ;
- streaming de l'île destination pendant le trajet.

Il n'est pas nécessaire de conserver en mémoire toutes les îles simultanément.

## Océan

Ne jamais créer une grille géante de tiles de terrain uniquement pour représenter la mer.

Utiliser :

- plan/surface océanique dédiée ;
- bathymétrie locale seulement près des côtes ;
- far silhouettes d'îles ;
- fog/horizon ;
- tiles détaillées uniquement là où le joueur peut réellement approcher le fond / la côte.

---

# VII. MAP 3 — `sous_trame`

Sous-Trame doit être une vraie grande map indépendante car elle se superpose verticalement à plusieurs régions de surface et ne peut pas être représentée proprement par un simple heightfield extérieur.

## Enveloppe

- environ **5 × 6 tiles** d'enveloppe logique ;
- environ **12–16 tiles réellement parcourables** ;
- forme extrêmement sparse et linéaire ;
- beaucoup de volume apparent vient des gouffres, structures, ponts et meshes, pas de terrain plein.

## Hub

`Relais Sept` occupe un groupe central de secteurs de contenu et sert de pivot.

## Entrées

Prévoir plusieurs connexions canoniques, dont au minimum :

- Canyon / profondeur ;
- Marches / installation du convoi ;
- accès plus tardif vers Orée.

Ces accès changent de `TerrainMap` dans :

- un ascenseur ;
- un tunnel courbe ;
- une porte Graveur ;
- une descente suffisamment masquée pour précharger la destination.

Le joueur ne doit pas voir un écran arbitraire « chargement de zone » si une transition diégétique peut le cacher.

---

# VIII. CAPITALES ET HUBS : PAS DES MAPS SÉPARÉES PAR DÉFAUT

## Havrebleu

Reste dans `orvalis_mainland` sur la bordure du Val.

Footprint cible visible : environ **700–1000 m** sur son grand axe, incluant quais et silhouette.

Le skyline doit être visible depuis plusieurs tiles du Val via :

- géométrie simplifiée ;
- proxies de tours/phares ;
- far objects séparés du terrain détaillé.

Le Dessous / vieille ville noyée peut utiliser un intérieur/carte secondaire seulement pour les secteurs impossibles à représenter proprement dans le monde extérieur.

## Forge-Cendre

Reste dans `orvalis_mainland` et exploite surtout la verticalité de meshes/bâtiments contre les mesas.

Footprint horizontal plus compact que Havrebleu, mais plusieurs niveaux verticaux.

## Port-Nacré

Reste dans `nacrebrume`.

Petit hub dense, pas une nouvelle capitale de taille Havrebleu.

## Haut-Silex

Reste dans les Marches sur la mainland.

## Cités d'Orée

Reste dans `orvalis_mainland`.

Ville internationale dense d'environ quelques secteurs de contenu majeurs ; elle doit paraître importante par verticalité, silhouette et population, pas par des kilomètres de rues vides.

---

# IX. INTÉRIEURS

## Intérieurs seamless

Utiliser l'architecture/bâtiment groupée dans la map principale pour :

- auberges ;
- petites maisons ;
- ateliers ;
- sanctuaires modestes ;
- commerces ;
- bâtiments dont l'intérieur est proche de leur footprint extérieur.

## Intérieurs séparés

Créer une map/scene séparée lorsque l'intérieur :

- est beaucoup plus grand que son bâtiment extérieur ;
- descend profondément sous le terrain ;
- nécessite un éclairage/sky différent ;
- comporte plusieurs étages complexes ;
- est une instance de groupe ;
- doit être réinitialisable séparément ;
- utilise une géométrie incompatible avec le heightfield extérieur.

Exemples :

- Sous-Valcœur profond ;
- grandes sections du Dessous de Havrebleu ;
- donjons ;
- raids ;
- Possibles Brisés ;
- Abîme sans fin.

---

# X. DONJONS — MAPS INSTANCIÉES

Les 10 donjons de lancement possèdent chacun un `MapId`/instance propre.

Budget recommandé :

- **1 à 2 tiles de bounding box technique** par donjon typique ;
- le terrain n'occupe que les espaces nécessaires ;
- architecture/WMO-like meshes produisent la majorité du volume intérieur ;
- far terrain inutile dans la plupart des donjons fermés.

Donjons :

1. `dungeon_mechenoire`
2. `dungeon_sanctuaire_englouti`
3. `dungeon_catacombes_roi_oublie`
4. `dungeon_givre_ecaille`
5. `dungeon_creuset_ecarlate`
6. `dungeon_phare_marees_muettes`
7. `dungeon_fort_route_brisee`
8. `dungeon_atelier_formes`
9. `dungeon_prison_ancres`
10. `dungeon_bibliotheque_noms_absents`

Une instance ne doit jamais charger la map extérieure complète derrière elle.

---

# XI. RAIDS ET CARTES SPÉCIALES

Maps dédiées :

- `raid_sanctuaire_tempetes`
- `raid_trone_cendre_noire`
- `raid_conclave_brise`
- `raid_chambre_neuvieme_lecture`

Budget de bounding box : **2–4 tiles** selon raid, mais seules les surfaces réellement visibles existent.

Cartes/scénarios spéciaux :

- `scenario_possibles_brises`
- `abyss_template_*`

## Abîme sans fin

L'Abîme ne doit pas être une seule map infinie physiquement.

Utiliser plus tard :

- une bibliothèque de modules/salles ;
- plusieurs templates techniques réutilisables ;
- génération d'étage/seed ;
- réinitialisation entre étages ;
- aucun terrain gigantesque permanent.

---

# XII. STREAMING TERRAIN — PROFIL DE BASE

Le moteur actuel possède déjà un `TerrainStreamer` configurable.

Profil de production initial recommandé :

- `loadRadius = 1` → fenêtre détaillée cible jusqu'à **3 × 3 tiles** autour du joueur ;
- `unloadRadius = 2` → hystérésis jusqu'à **5 × 5** avant déchargement ;
- `maxLoadsPerUpdate` faible + time slicing pour éviter les gros spikes ;
- terrain lointain `FarTerrainWindow radius = 3` → jusqu'à **7 × 7 far tiles** lorsqu'elles existent.

Avec des tiles de 512 m :

- le joueur conserve environ un kilomètre de terrain détaillé autour de lui selon sa position dans la tile ;
- le terrain lointain permet des silhouettes jusqu'à environ 1,5–2 km sans charger toute la géométrie détaillée.

Ces valeurs sont un **profil de départ à profiler**, pas une constante sacrée.

Un profil graphique élevé pourra éventuellement augmenter certaines distances uniquement si la mémoire et le GPU le permettent.

---

# XIII. STREAMING DES OBJETS

Le terrain résident ne doit pas forcer tous les objets de ses tiles à rester en haute qualité.

## Anneau A — gameplay immédiat

Environ **0–100 m** :

- personnages complets ;
- créatures ;
- collisions précises ;
- interactables ;
- petits props ;
- VFX ;
- végétation proche.

## Anneau B — scène proche

Environ **100–300 m** :

- bâtiments complets/LOD proches ;
- végétation instanciée ;
- props moyens ;
- créatures simplifiées si visibles ;
- collisions uniquement si nécessaires.

## Anneau C — composition distante

Environ **300–700 m** :

- LOD simplifiés ;
- clusters de végétation ;
- bâtiments batchés ;
- suppression des micro-props ;
- aucune simulation inutile.

## Anneau D — landmarks

Au-delà, jusqu'à la limite du terrain lointain :

- phares ;
- tours ;
- pics ;
- grandes cheminées ;
- forteresses ;
- silhouettes de villes ;
- proxies/low-poly très peu coûteux.

Les distances finales seront profilées, mais la hiérarchie est canonique : **les landmarks survivent beaucoup plus loin que les petits props**.

---

# XIV. SECTEURS DE CONTENU ET DENSITÉ

Chaque secteur 128 × 128 m reçoit plus tard un manifeste listant seulement des références :

```text
sector
  region / subzone
  terrain tile ref
  static instance batches
  vegetation batches
  building groups
  spawn groups
  interaction points
  quest/event hooks
  audio volumes
  weather/biome modifiers
  landmark refs
```

Les meshes/textures sont mutualisés dans des packs d'assets.

Un arbre utilisé 400 fois dans le Val ne doit pas exister 400 fois dans les données lourdes : le secteur stocke des transforms/variantes et le renderer utilise l'instancing.

---

# XV. PACKS D'ASSETS POUR LE WEB

Le navigateur ne doit jamais télécharger tous les assets de l'Acte I au premier login.

Découpage futur :

## `core_shared`

- player skeleton/body nécessaires ;
- UI monde ;
- effets communs ;
- props ultra-communs ;
- textures/materials communs.

## Packs régionaux

Exemples :

- `region_val_azur`
- `region_havrebleu`
- `region_braise`
- `region_bois_murmure`
- etc.

## Packs d'instance

Un donjon/raid important possède son pack complémentaire sans dupliquer le kit partagé dont il dépend.

## Préchargement

Lorsque le joueur approche :

- d'un col ;
- d'un embarcadère ;
- d'une entrée de Sous-Trame ;
- d'une porte de donjon ;

le client peut commencer à précharger le pack suivant avant le changement effectif de zone/map.

Le système de fichiers/téléchargement n'existe pas encore dans `TerrainStreamer`, mais son `TileProvider` a justement été conçu pour que cette évolution se branche derrière le provider sans changer la logique de résidence.

---

# XVI. COLLISION, IA ET SIMULATION

## Terrain

Collision précise seulement sur les tiles détaillées/résidentes.

Le far terrain est visuel, jamais une source de collision gameplay.

## Bâtiments

Collision activée par groupe/secteur proche.

Les landmarks lointains visibles en proxy n'ont pas besoin de collision tant que leur vraie géométrie n'est pas chargée.

## PNJ / monstres

Le futur serveur autoritaire ne simule pas tout le continent au même niveau de fréquence.

Les secteurs servent plus tard de base à :

- activation de spawn ;
- AOI réseau ;
- fréquence de simulation ;
- événements dynamiques.

La distance réseau exacte reste un sujet P11/P12 et n'est pas figée ici.

---

# XVII. FRONTIÈRES DE BIOME

Une frontière de région ne correspond jamais mécaniquement à une ligne de tile visible.

Les changements de biome se font :

- sur plusieurs chunks ;
- idéalement sur **1–2 secteurs de contenu** lorsque la géographie le permet ;
- par mélange de textures ;
- végétation intermédiaire ;
- changement progressif du fog/sky/ambiance ;
- landmarks annonçant la région suivante.

Exceptions :

- falaises de Fracture ;
- parois de canyon ;
- cols ;
- portes/fortifications ;
- limites où le lore justifie une rupture brutale.

Même alors, la rupture est un élément du monde, jamais une couture de moteur.

---

# XVIII. TRANSITIONS DE MAP

## Mainland ↔ Mainland

Val → Cœur → Braise, etc. : **aucune transition de map**.

Noyau → Marches → Orée : **aucune transition de map**.

## Mainland ↔ Nacrebrume

Transition par bateau depuis Havrebleu / autre port.

Le trajet masque le changement de map et donne le temps de préparer les assets destination.

## Mainland ↔ Sous-Trame

Transition par descente/ascenseur/tunnel/porte Graveur.

## Monde ↔ donjon/raid

Entrée physique cohérente dans le monde, puis instance séparée.

## Mort / pierre de rappel / voyage rapide

Ces systèmes ne redéfinissent jamais les frontières techniques ; ils téléportent simplement le joueur vers un point valide de la map cible.

---

# XIX. VERTICAL SLICE A — FOOTPRINT TECHNIQUE

Le premier vertical slice ne doit PAS être une scène jetable.

Il est construit directement dans les coordonnées définitives de `orvalis_mainland`.

## Zone d'auteur initiale

Cible : environ **2 × 2 tiles finales** entièrement travaillées, soit ~**1,024 km × 1,024 km** de terrain de production.

Composition :

- une route principale du Val ;
- champs/vergers ;
- vieux pont ;
- Vieux Moulin ou moulin de même kit ;
- ferme/hameau ;
- petit ruisseau ;
- relief permettant une révélation panoramique ;
- bord/silhouette de Havrebleu visible dans la direction de la capitale.

Autour de ces 2 × 2 tiles :

- far terrain de greybox ;
- proxies de Havrebleu ;
- reliefs simples ;
- aucun besoin d'auteuriser immédiatement toute la région.

Le streamer peut malgré tout fonctionner avec sa vraie fenêtre de résidence et ne charge que les tiles existantes.

## Critère de réussite

Depuis une route normale, sans HUD :

- le joueur identifie immédiatement le Val ;
- le monde paraît dense mais lisible ;
- Havrebleu crée une destination visible ;
- aucune bordure de tile n'est perceptible ;
- les assets répétés ne ressemblent pas à un pack posé brut ;
- le navigateur tient la scène à performance acceptable sur la machine cible avant extension du monde.

---

# XX. MANIFESTES À CRÉER PLUS TARD

Le runtime futur devra converger vers des données proches de :

## `WorldMapManifest`

- map id ;
- terrain config ;
- tile existence index ;
- region/subzone index ;
- water/ocean definition ;
- far terrain source ;
- landmark registry ;
- regional asset packs.

## `TileManifest`

- height/paint/holes ;
- 16 sector references ;
- large building groups ;
- liquids ;
- landmark refs.

## `ContentSectorManifest`

- static transforms ;
- foliage transforms ;
- spawn/event hooks ;
- interactive refs ;
- audio/weather volumes.

Le format exact n'est PAS encore imposé : P9 reste le checkpoint de typed game/static data. Ce document fixe seulement la forme du problème afin que P9 ne soit pas conçu dans le vide.

---

# XXI. CE QUE LE MOTEUR A DÉJÀ / CE QUI MANQUE

## Déjà compatible

- terrain 32 m chunks / 512 m tiles ;
- maps sparse ;
- coordonnées non bornées ;
- plusieurs maps ;
- chargement/déchargement par rayon ;
- hystérésis ;
- construction time-sliced ;
- far terrain ;
- normals recousues entre tiles résidentes ;
- architecture WMO-like / building groups fondation déjà présente dans le moteur.

## À ajouter plus tard — pas dans ce checkpoint

- tile files / manifestes de production ;
- provider de données réel ;
- background download ;
- worker de décompression/build si profiling nécessaire ;
- sector streaming des objets ;
- asset bundle prefetch/cache ;
- LOD/proxy authoring de landmarks ;
- server-side sector/AOI integration.

Point important : aucune de ces additions n'exige de jeter le `TerrainStreamer`. Elles doivent se brancher autour/derrière les contrats déjà présents.

---

# XXII. RÈGLES DE PRODUCTION DÉFINITIVES

1. **Une région de lore n'est pas une map technique.**
2. **Mainland reste seamless de niveau 1 à 50** partout où la géographie est terrestre.
3. **512 m reste la tile terrain de référence** jusqu'à preuve par profiling qu'elle pose un problème réel.
4. **128 m devient l'unité logique de contenu** pour préparer objects/spawns/events.
5. **Terrain détaillé proche, far terrain + proxies au loin.**
6. **Les capitales restent dans le monde extérieur** sauf leurs intérieurs impossibles/instanciés.
7. **Océan et gouffres ne sont pas remplis de tiles inutiles.** Le monde est sparse.
8. **Donjons/raids sont des maps indépendantes.**
9. **Le vertical slice A est une partie finale du continent**, pas une démo jetable.
10. **On valide la densité/performance sur 2 × 2 tiles de Val avant d'auteuriser 40 km² de monde.**

---

# XXIII. PROCHAINE ÉTAPE

Le squelette monde/streaming est suffisamment défini pour commencer la production ciblée.

Ordre :

1. reprendre A0.1/A0.2 uniquement pour **Vertical Slice A — Val + bord Havrebleu** ;
2. rechercher/revoir les assets génériques CC0 nécessaires à ce slice ;
3. définir ce qui manque obligatoirement en custom Orvalis ;
4. localiser + enregistrer provenance ;
5. normaliser/importer une petite seed library ;
6. authoriser les premières 2 × 2 tiles finales ;
7. profiler la vraie scène avant toute acquisition massive pour les 12 autres régions.
