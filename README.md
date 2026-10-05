# Orvalis 4 — Les Routes d’Orvalis

Ouvrir `dist/Jouer-Orvalis.html` dans Edge ou Chrome. Sources et page autonome sont livrées ensemble.
Voir [la livraison et ses limites](docs/LIVRAISON.md), [la couverture](docs/COUVERTURE.md) et [les ressources originales](docs/RESSOURCES.md).

Monde : 4096 × 4096 m, neuf régions, 43 routes, 27 nouveaux lieux et 18 quêtes d’exploration. Les sauvegardes antérieures sont migrées une seule fois, avec copie de secours locale.

Le contenu ci-dessous décrit les systèmes de jeu existants ; le rapport de livraison indique les vérifications réellement effectuées pour cette refonte.

MMORPG 3D jouable dans le navigateur (Three.js), en français, clavier et souris.
Monde, créatures, personnages, quêtes, donjons et noms entièrement originaux.

## Contenu

- 9 régions (niveaux 1 à 30), 16 villes et avant-postes dont 2 capitales, 16 sanctuaires de classe, routes, cols, lacs, mer.
- 2 factions (Pacte d'Azur, Clans de Braise) et 8 classes avec 12 compétences de base chacune.
- 24 spécialisations (2 à 4 par classe), chacune avec son rôle, son passif, ses techniques propres et son arbre de talents :
  - Guerrier : Armes, Furie (dégâts), Rempart (tank) — un guerrier ne soigne jamais.
  - Templier : Lumière (soins), Bastion (tank), Châtiment (dégâts).
  - Mage : Feu, Givre, Arcanes. Nécromancien : Fléau, Légion (dégâts), Ossuaire (tank).
  - Chasseur : Précision, Survie, Meute (toujours accompagné de son familier). Assassin : Venin, Ombres.
  - Druide : Restauration (soins), Équilibre, Sauvage (dégâts, forme féline), Gardien (tank, forme d'ours).
  - Chaman : Restauration (soins), Élémentaire, Amélioration (dégâts).
- Fenêtre Talents (touche K) façon grand MMO : un point par niveau à partir du niveau 2, 7 paliers (4 points par palier),
  prérequis fléchés, techniques débloquées par les talents, grimoire, changement de spécialisation gratuit hors combat
  (chaque spécialisation garde ses talents et sa barre d'action). Les compétences de classe montent de rang toutes seules.
- Infobulles d'équipement : gain ou perte en % (vert/rouge) pour chaque statistique et pour votre rôle,
  « meilleur équipement disponible » quand l'emplacement est vide, flèche verte sur les améliorations dans le sac.
- Loupe à côté de chaque quête acceptée : flèche de guidage, distance en mètres, balise lumineuse et repère sur la mini-carte
  (vers l'objectif, ou vers le PNJ à qui rendre la quête).
- Options d'interface : vie et niveau au-dessus de son propre personnage, jusqu'à 3 barres d'action supplémentaires
  (Maj+1…0 pour la deuxième).
- Héros au style marqué (capes et emblèmes de faction, épaulières, armes lumineuses) : impossible de les confondre avec les PNJ.
- 121 types de créatures (élites, boss de monde, 16 boss de donjon, 11 boss de raid, Voilés, traîtres et Hérauts des Ordres),
  74 quêtes secondaires et une quête principale de 16 chapitres par classe et par faction (256 chapitres écrits).
- 5 donjons (5 joueurs, niveaux 8 à 30, mode héroïque au niveau maximum), 2 raids (10 joueurs, niveau 30)
  et l'Abîme sans fin (étages générés, affixes, gardien tous les 5 étages, classement).
- Recherche de groupe (touche U) avec l'option « Remplir avec l'IA » : des compagnons bots prennent les places
  de tank, de soigneur et de dégâts. Emblèmes de bravoure et boutique d'équipement épique (Intendance).
- Mécaniques de boss : zones annoncées au sol, ruées, tourbillons, renforts, boucliers de gardiens,
  soins à interrompre, condamnations, traques, phases, fureur, rencontres à plusieurs boss.
- Familiers (touche Y) : chaque créature vaincue peut laisser sa pierre d'âme, plus rarement pour les boss difficiles.
  Les familiers combattent, gagnent des niveaux et sont visibles des autres joueurs. Chaque familier a un rôle au choix :
  Tank (provoque, encaisse), Dégâts ou Soins (soigne son maître et le groupe), et un mode Agressif, Défensif ou Passif.
- Chasseur : familier permanent dès le niveau 1 (loup ou hyène selon la faction), barre de commandes façon grand MMO
  (Attaque, Suivre, Rester, modes, rôles), Apprivoiser une bête (niveau 5), Ressusciter et Soigner le familier.
- Runes (touche R) : chaque équipement, armes comprises, a des emplacements selon sa rareté (commun 0, inhabituel 0-1,
  rare 1, épique 2, légendaire 3, mythique 4-5). 8 runes : Force, Agilité, Intelligence, Sagesse, Endurance, Critique,
  Vol de vie, Fortune. Onglet Fusion : 3 runes identiques donnent 1 rune du niveau suivant, 40 % plus forte, sans limite
  de niveau (valeur = base × 1,4^(niveau−1)). Onglet Sertissage : placer et retirer les runes. Rareté Mythique (boss de haut niveau, artisanat).
- Métiers (touche N, maîtres des métiers dans les capitales) : 12 métiers, 2 primaires et 2 secondaires au choix,
  chacun avec un atout et un défaut permanents. Primaires : Mineur, Herboriste, Dépeceur, Forgeron, Maroquinier,
  Couturier, Alchimiste, Joaillier, Runiste. Secondaires : Pêcheur, Cuisinier, Secouriste. Compétence de 1 à 150,
  2016 emplacements de filons et plantes, dépeçage, pêche, recettes par palier (équipement avec emplacements de runes, potions,
  élixirs, plats, bandages, gravure et transmutation de runes).
- Lore et voie de l'Ordre : l'histoire d'Orvalis (la Fracture, le Roi Oublié, Nyxaroth, les Huit Sceaux, les Voilés).
  Chaque classe commence dans le sanctuaire de son Ordre (8 Ordres, un sanctuaire par faction), avec son mentor,
  ses 5 premiers chapitres sur place (insigne avec emplacement de rune, traître de l'Ordre), puis un voyage de région en
  région auprès des émissaires jusqu'au Héraut de son Ordre à l'Autel des Tempêtes (arme mythique) et l'épilogue au niveau 30.
  Chapitres verrouillés par le niveau : le suivi de quêtes propose alors les quêtes secondaires les plus proches.
  Onglet Chroniques dans le journal (touche L). Les anciens personnages reprennent au chapitre adapté à leur niveau.
- Butin avec qualité et rareté, forge (+1 à +10), marchands, hôtel des ventes, coffre, monture, pierres de voyage.
- 80 joueurs simulés, groupes, JcJ avec Gloire et rangs, classement, discussion.
- Événements calés sur l'horloge réelle : boss de monde toutes les 30 min, caravanes toutes les 20 min, Bastion à capturer.
- Écran d'accueil : connexion, cinématique, sélection du personnage sur une estrade 3D, création (faction, classe, apparence, nom aléatoire).
- Bouton plein écran dédié (équivalent F11), dans le menu et dans la barre de menus en jeu.
- Interface façon MMO classique (cadres dorés, portraits ronds, barre d'action en pierre) ; tous les cadres se déplacent (Options > Déplacer l'interface) et restent en place ; bandeau des événements masquable.
- Effets actifs en haut à droite (néfastes encadrés de rouge, temps restant), vos effets sur la cible et au-dessus des ennemis, suivi des invocations et totems (nombre et temps restant).
- Camouflage (Voile d'ombre, Camouflage) : personnage translucide à 20 % pour soi et ses alliés, presque invisible pour l'ennemi.
- Cycle jour/nuit, sons et musique générés.
- Multijoueur en direct entre vrais joueurs via la capacité `room` de l'artifact Claude (y compris invitation dans un donjon).

## Construire

```
npm install
node tools/build.mjs          # version de développement
node tools/build.mjs --prod   # version minifiée
```

Fichiers produits :

- `dist/orvalis.html` : la page publiée comme artifact (sans doctype/html/body).
- `dist/test.html` : la même page en document autonome. Ouvrez-la directement dans un navigateur pour jouer en solo.

## Tester

- Scénarios automatiques : `npm i -D playwright`, puis `node tools/play.mjs tests/qa1.mjs 1300 800`. Les captures sont écrites dans `shots/`.
  - `tests/d1.mjs` : donjon complet avec pilote automatique (`DUN=creuset CLS=druide LVL=30 DIFF=heroic`).
  - `tests/d1.mjs` accepte aussi `SPEC=sp_gardien` (spécialisation du joueur).
  - `tests/l1.mjs` : recherche de groupe, `tests/w1.mjs` : écran d'accueil, `tests/m1.mjs` : multijoueur simulé à deux onglets, `tests/f1.mjs` : bouton plein écran (connexion, sélection, barre de menus).
  - `tests/k1.mjs` : fenêtre des talents, `tests/k2.mjs` : les 24 spécialisations lancent toutes leurs techniques,
    `tests/k3.mjs` : formes animales, comparaison d'équipement, guidage de quête, barres et plaque personnelle,
    `tests/k4.mjs` : statistiques de chaque spécialisation à équipement identique.
  - `tests/r1.mjs` : runes (butin, fusion, sertissage, statistiques), `tests/p1.mjs` : familier du chasseur (rôles, ordres,
    apprivoisement, résurrection), `tests/m2.mjs` : métiers (récolte, pêche, fabrication, consommables).
  - `tests/s1.mjs` : voie de l'Ordre (`CLS=necro FAC=1`), `tests/s2.mjs` : équilibrage des traîtres et Hérauts (`WHICH=herald`),
    `tests/s3.mjs` : maître des métiers et émissaires, `tests/v2.mjs` : captures de la création, des sanctuaires, d'un camp des Voilés et d'un Héraut.
- Multijoueur local : `python3 -m http.server 8765 -d dist`, puis ouvrez deux onglets sur `http://localhost:8765/test.html#mockroom`.
- Console du navigateur : `__dbg.quick('mage', 1, 15, 'sp_givre')` crée un personnage de test (classe, faction 0/1, niveau, spécialisation),
  `__dbg.spec('sp_feu')` change de spécialisation,
  `__dbg.tp(x, z)` téléporte, `__dbg.inst('meche')` entre dans un donjon avec un groupe complété par l'IA,
  `__dbg.fresh('archer', 1)` crée un personnage neuf à son sanctuaire, `__dbg.legacy('mage', 0, 20)` simule un ancien personnage.

## Structure

- `src/core` : aléatoire déterministe, bruit, utilitaires.
- `src/engine` : ciel, eau, caméra, entrées, géométrie, audio.
- `src/world` : terrain, décor, villes, lieux, collisions, carte, génération des donjons (`dungeon.js`).
- `src/data` : zones, monstres, donjons et boss, compétences, spécialisations (`specs.js`), arbres de talents (`talents.js`), objets, runes (`runes.js`),
  métiers et recettes (`profs.js`), lore, Ordres et sanctuaires (`lore.js`), quête principale (`story.js`), PNJ, quêtes, noms.
- `src/game` : entités, combat, talents (`talents.js`), joueur, bots, familiers, instances (`instance.js`), mécaniques de boss (`bossmech.js`),
  recherche de groupe (`lfg.js`), runes (`runes.js`), métiers (`profs.js`), voie de l'Ordre (`story.js`), événements, économie, sauvegarde.
- `src/net` : présence multijoueur.
- `src/ui` : interface, fenêtres des talents (`talents.js`), des runes (`runes.js`) et des métiers (`profs.js`), écran d'accueil et sa scène 3D.

Sauvegarde locale dans le navigateur (`localStorage`). Un code d'export (`ORV1.…`) permet de transférer un personnage.

## Preview web automatique

Le projet peut être publié sur GitHub Pages après chaque push grâce à `.github/workflows/pages.yml`.
Voir [`docs/DEPLOY_GITHUB_PAGES.md`](docs/DEPLOY_GITHUB_PAGES.md) pour l'activation unique et le fonctionnement.
