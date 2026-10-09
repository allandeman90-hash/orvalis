# ORVALIS — ACTE I : GÉOGRAPHIE ORGANIQUE DU MONDE

Status: **CANON WORLD-GEOGRAPHY OVERRIDE — 2026-10-09**

Ce document corrige explicitement toute interprétation du Noyau d'Orvalis comme une carte composée de neuf carrés.

Il prend priorité sur toute ancienne représentation 3×3 dans le prototype, `src/data/zones.js`, les schémas de lore ou `ACT_I_WORLD_MAP_STREAMING_PLAN.md` lorsqu'il est question de la **forme réelle de la carte, des frontières de régions et de la géographie jouable**.

---

# I. RÈGLE ABSOLUE

La carte finale d'Orvalis ne doit PAS ressembler à :

- neuf carrés ;
- une grille 3×3 ;
- neuf biomes rectangulaires accolés ;
- des frontières de zone qui suivent les bords des tiles ;
- un échiquier de couleurs visible sur la world map ;
- des montagnes placées uniquement pour cacher les coutures d'une grille.

La cible est une géographie organique comparable dans son principe aux grands MMORPG classiques :

> **un continent dessiné comme un vrai territoire, dans lequel les régions possèdent des formes irrégulières dictées par les côtes, montagnes, vallées, bassins, fleuves, falaises, routes anciennes et conséquences de la Fracture.**

Les tiles de 512 m et chunks de 32 m restent uniquement une structure technique invisible de streaming.

Le joueur ne doit jamais pouvoir deviner leur quadrillage en regardant le terrain ou la carte.

---

# II. LE PROTOTYPE 3×3 EST OFFICIELLEMENT OBSOLÈTE

Le jeu jouable actuel utilise encore une structure de prototype :

- `ZONES` avec `col` / `row` ;
- `ZONE_GRID` 3×3 ;
- `BORDER` ;
- frontières verticales/horizontales fixes ;
- `PASSES` situés sur ces lignes ;
- hubs/landmarks placés à partir de cette ancienne géométrie.

Cette structure est une **fixture de gameplay historique**, pas une contrainte de migration.

Lors du passage au nouveau monde :

- les IDs de zones peuvent rester ;
- les concepts de hubs/landmarks peuvent rester ;
- leur position exacte peut changer ;
- les coordonnées actuelles ne sont pas canoniques ;
- `col`, `row`, `ZONE_GRID`, `BORDER` et les frontières rectilignes doivent disparaître de la géographie de production.

On ne doit surtout pas importer la vieille carte puis simplement arrondir ses coins.

---

# III. CE QUE LE SCHÉMA 3×3 SIGNIFIE ENCORE

Les anciennes directions restent seulement des **relations géographiques générales** :

- Pics Gelés : globalement nord-ouest du Cœur ;
- Cime des Tempêtes : globalement au nord / en altitude ;
- Désolation Cendrée : globalement nord-est / est ;
- Val d'Azur : globalement à l'ouest, ouvert sur la mer ;
- Cœur d'Orvalis : central dans l'histoire, pas nécessairement centre géométrique parfait ;
- Terres de Braise : globalement est ;
- Bois-Murmure : globalement sud-ouest ;
- Vasegrise : bassin méridional / central-sud ;
- Canyon des Scories : globalement sud-est.

Ces directions n'imposent :

- ni même largeur ;
- ni même hauteur ;
- ni alignement ;
- ni frontières parallèles ;
- ni obligation que chaque région touche exactement les mêmes voisines que sur une grille.

Un biome peut avancer en pointe dans un autre, contourner un massif, suivre un fleuve ou posséder une enclave naturelle.

---

# IV. SILHOUETTE DU NOYAU

Le Noyau doit être dessiné d'abord comme **une masse géographique**, avant de découper ses régions.

Principes :

- côte ouest irrégulière autour de Havrebleu ;
- baies, caps et falaises plutôt qu'un bord rectiligne ;
- chaînes de montagnes non symétriques autour du Cœur ;
- vallées traversant plusieurs zones ;
- bassins hydrographiques cohérents ;
- routes qui suivent le relief ;
- cols là où le terrain permet réellement un passage ;
- longues lignes de vue entre certains landmarks ;
- impasses naturelles, boucles, raccourcis et chemins secondaires.

La silhouette générale peut être asymétrique.

Le Cœur peut se trouver légèrement décentré si cela produit une meilleure géographie.

---

# V. FORMES RECOMMANDÉES DES NEUF RÉGIONS

Ces descriptions servent de direction de greybox, pas de polygones définitifs.

## Val d'Azur

Forme de **croissant côtier / grande vallée ouverte** autour des routes menant à Havrebleu.

- côte découpée ;
- champs suivant les vallons ;
- rivière principale ;
- Bois-Murmure qui remonte naturellement dans certains replis ;
- relief montant progressivement vers le Cœur et les Pics.

Aucune frontière droite avec Bois-Murmure ou Cœur.

## Bois-Murmure

Forme de **masse forestière irrégulière** occupant vallées et reliefs humides.

La forêt peut créer des langues de végétation jusque dans le Val ou le Marais.

Sa limite doit être une transition écologique, pas une ligne.

## Pics Gelés

Chaîne montagneuse **étirée et dentelée**, pas un carré neigeux.

- crêtes ;
- vallées suspendues ;
- lac gelé encaissé ;
- cols naturels ;
- glaciers descendant dans des vallées voisines.

## Cime des Tempêtes

La Cime est une **haute arête / massif terminal**, beaucoup plus étroite horizontalement qu'une région standard.

Elle peut surplomber plusieurs régions sans occuper une grande surface au sol.

## Cœur d'Orvalis

Bassin de ruines **irrégulier**, structuré par l'ancienne Valcœur et les cassures de la Fracture.

Le Cœur historique n'est pas un carré central :

- anciennes avenues ;
- quartiers effondrés ;
- collines de débris ;
- ravins ;
- sections du Grand Glyphe ;
- voies anciennes rayonnant vers le reste du continent.

## Marais de Vasegrise

Véritable **bassin hydrologique**.

Sa forme suit :

- rivières ;
- lacs peu profonds ;
- tourbières ;
- deltas ;
- terrains bas.

Il peut s'étendre entre le Bois, le Cœur et le Canyon par des bras humides irréguliers.

## Canyon des Scories

Réseau de **gorges ramifiées**, donc naturellement très éloigné d'un rectangle.

Les limites de la région viennent de l'ouverture des fractures et des plateaux environnants.

## Terres de Braise

Grand ensemble de **plateaux, savanes sèches et mesas** organisés autour de Forge-Cendre.

La frontière avec le Canyon suit les hauteurs et les vallées sèches ; celle avec la Désolation suit la montée volcanique.

## Désolation Cendrée

Forme en **éventail volcanique / hautes terres brisées**, centrée sur plusieurs structures géologiques plutôt qu'un coin de carte.

Coulées, caldeiras et champs d'obsidienne débordent de façon irrégulière vers les régions voisines.

---

# VI. FRONTIÈRES DE RÉGIONS

Une région de gameplay doit être définie par des **volumes/polygones organiques**, pas par `floor((x+BORDER)/size)` ou une cellule de grille.

Concept futur recommandé :

```text
RegionVolume
  id
  polygon / spline boundary
  height constraints optional
  blend bands
  subzone volumes
  biome weight overrides
```

Le moteur pourra déterminer `regionAt(worldPosition)` à partir de volumes spatiaux.

Les régions peuvent se chevaucher légèrement via des bandes de transition pour produire un mélange naturel.

---

# VII. BIOMES : POIDS CONTINUS, PAS CASES

Le terrain ne doit pas demander :

> « Dans quel carré suis-je ? »

pour choisir soudainement une couleur de sol.

Il doit combiner des champs continus :

- humidité ;
- altitude ;
- température ;
- distance à l'eau ;
- proximité d'une cicatrice ;
- géologie ;
- poids artistiques peints ;
- region/subzone masks.

Exemple Val → Bois :

- champs moins nombreux ;
- haies plus épaisses ;
- bosquets plus fréquents ;
- sol plus sombre ;
- arbres plus grands ;
- brume locale ;
- finalement forêt profonde.

Le joueur traverse un paysage, pas une frontière RGB.

---

# VIII. MONTAGNES ET COLS

Les douze anciens cols ne doivent pas survivre comme « douze trous dans des murs séparant neuf cases ».

Leurs **fonctions de connexion** peuvent rester, mais leur position sera entièrement redessinée.

Un col final doit exister parce que :

- deux vallées se rencontrent ;
- une ancienne route royale suit une faiblesse du relief ;
- une ligne de stabilité de la Fracture a empêché la montagne de se fermer ;
- une rivière ou un glacier a creusé le passage ;
- des habitants ont élargi une route naturelle.

Certaines régions doivent posséder plusieurs passages ; d'autres seulement un passage sûr majeur.

Le joueur doit pouvoir apprendre la géographie par ses landmarks, pas en mémorisant une grille.

---

# IX. ROUTES

Les routes deviennent un élément majeur de world design.

Elles doivent :

- contourner les pentes trop fortes ;
- suivre cours d'eau et cols ;
- rejoindre villages et ressources ;
- parfois conserver d'anciens tracés pré-Fracture ;
- se diviser ;
- proposer des raccourcis risqués ;
- montrer leur âge par leur état et leur matériau.

Une grande route peut traverser plusieurs tiles et plusieurs régions en courbe sans suivre aucune frontière technique.

---

# X. WORLD MAP DU JOUEUR

La world map finale doit être produite à partir de la **géographie organique**, pas à partir d'un tableau 3×3.

Visuellement :

- silhouette de continent irrégulière ;
- côtes dessinées ;
- montagnes et fleuves lisibles ;
- régions aux contours peints/irréguliers ;
- routes principales ;
- capitales et landmarks ;
- zones non explorées masquées si système de découverte retenu.

Il ne doit rester aucun indice visuel des tiles ou secteurs techniques.

---

# XI. CONSÉQUENCE POUR LE STREAMING

Cette correction ne remet PAS en cause :

- chunks 32 m ;
- tiles 512 m ;
- secteur logique 128 m ;
- streaming sparse ;
- far terrain ;
- mainland seamless ;
- Nacrebrume / Sous-Trame séparées techniquement.

Une tile peut contenir :

- une seule région ;
- deux régions ;
- trois régions près d'une jonction ;
- une côte + mer + deux biomes.

Les frontières de régions et de tiles sont totalement indépendantes.

C'est exactement l'objectif.

---

# XII. CONSÉQUENCE POUR LA MIGRATION DU PROTOTYPE

Lors de la future migration du monde jouable :

## À préserver

- noms des régions ;
- lore ;
- fonctions des capitales/hubs ;
- landmarks intéressants ;
- connexions narratives utiles ;
- IDs lorsque cela évite de casser du contenu inutilement.

## À refaire

- positions `x/z` ;
- `col` / `row` ;
- `ZONE_GRID` ;
- `BORDER` ;
- frontières `dir/line` ;
- placement mécanique des cols ;
- routes construites autour de la grille ;
- relief conçu pour séparer des cases ;
- minimap/world map fondée sur cette géométrie.

La future carte organique est donc une **reconstruction géographique**, pas un reskin de la vieille carte.

---

# XIII. MÉTHODE DE GREYBOX

Avant de sculpter les 13 grandes régions :

1. dessiner la silhouette générale du mainland ;
2. placer océans, grands massifs et bassins ;
3. définir fleuves/lacs principaux ;
4. placer Havrebleu, Forge-Cendre et Valcœur/Cœur selon cette géographie ;
5. tracer les grandes routes historiques ;
6. dessiner ensuite les neuf régions du Noyau comme formes irrégulières autour de ces contraintes ;
7. placer hubs et landmarks ;
8. tester les temps de trajet ;
9. seulement ensuite découper les données en tiles/secteurs techniques.

**On ne dessine jamais la carte en commençant par une grille de tiles.**

---

# XIV. VERTICAL SLICE A

Même le premier slice Val + Havrebleu doit respecter cette direction.

Les 2×2 tiles de production proposées dans le plan streaming ne signifient PAS que le slice doit avoir une forme carrée visible.

Elles ne sont qu'une fenêtre d'auteur/streaming.

À l'intérieur :

- côte ou vallée sortant de la fenêtre ;
- routes courbes ;
- champs irréguliers ;
- ruisseau naturel ;
- relief masquant les bords ;
- forêt/bosquets traversant les limites de tiles ;
- silhouette de Havrebleu hors/au bord de la fenêtre.

Le joueur doit avoir l'impression d'être au milieu d'un continent, jamais dans une map-test carrée.

---

# XV. RÈGLE FINALE

> **Les carrés servent au moteur. Les formes naturelles servent au joueur.**

Et la règle de validation la plus simple est :

> **si une capture de la world map permet de deviner la grille des tiles ou l'ancien 3×3, la géographie a échoué.**
