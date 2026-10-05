# Migration Orvalis : inventaire du jeu actuel (M0.3)

Mesuré le 2026-10-02 sur les sources v4.0.0 (sourceHash caa115fa…), 86 fichiers `.js` dans `src/`.
Les chiffres viennent d'une analyse automatique des `import` ; ils sont à remesurer après chaque étape d'isolation.

## 1. Dépendance à Three.js

| Catégorie | Fichiers |
|---|---:|
| importent `three` directement | 33 |
| n'importent pas `three` mais l'atteignent par un autre fichier | 20 |
| totalement indépendants de Three.js | 33 |

Par dossier :

| Dossier | Fichiers | Taille | Importent `three` | Rôle |
|---|---:|---:|---:|---|
| `src/core` | 4 | 7 Ko | 0 | aléatoire déterministe, bruit, utilitaires |
| `src/data` | 18 | 366 Ko | 0 | zones, monstres, compétences, objets, quêtes, lore |
| `src/engine` | 9 | 65 Ko | 6 | ciel, eau, caméra, textures, géométrie, audio, entrées |
| `src/world` | 10 | 122 Ko | 9 | terrain, décor, villes, donjons, collisions |
| `src/game` | 31 | 515 Ko | 12 | entités, combat, joueur, bots, familiers, instances |
| `src/ui` | 11 | 3123 Ko | 4 | HUD, fenêtres, écran-titre (dont `painted.js` : 2,9 Mo d'images intégrées) |
| `src/net` | 2 | 22 Ko | 1 | présence multijoueur |
| `src/main.js` | 1 | 19 Ko | 1 | démarrage, renderer, boucle |

Indépendants de Three.js (réutilisables tels quels par le nouveau moteur) :
- `core` : les 4 fichiers.
- `data` : 16 sur 18 (`classbase, dungeons, expeditions, items, lore, mobs, names, npcs, profs, quests, runes, specs, story, talents, world-space, zones`).
- `game` : `inventory, runes, save, state, stats`.
- `engine` : `audio, input, perf`. `world` : `collide`. `net` : `mockroom`. `ui` : `icons, layout, painted`.

## 2. Points d'entrée du rendu

- Un seul `THREE.WebGLRenderer` principal, créé dans `src/main.js` (ligne 83), avec la caméra (ligne 89) et la boucle `requestAnimationFrame`.
- Un second renderer dédié aux portraits dans `src/ui/portrait3d.js`.
- L'écran-titre a sa propre scène (`src/ui/stage.js`), rendue par le renderer principal.
- L'état global `G` (`src/game/state.js`) porte `renderer`, `scene`, `camera`, `sky`, `water`… : c'est par lui que le reste du jeu atteint le rendu.

## 3. Nœuds de couplage (ce qui « contamine » le code de jeu)

Les 20 fichiers qui atteignent Three.js indirectement passent presque tous par quatre fichiers :

| Nœud | Usage réel de Three.js | Fichiers entraînés |
|---|---|---|
| `game/entity.js` | `THREE.Vector3` pour la position (2 usages) | mob, bots, bossmech, world, social, market, commands |
| `game/fx.js` | effets visuels (particules, projectiles, zones au sol) | combat, progress, `data/skills`, talents |
| `game/npc.js` | modèle du PNJ (`THREE.Group`) | quests, story |
| `ui/hud.js` | portraits et éléments 3D du HUD | windows, talents, runes, profs |

Deux fichiers de `data` ne sont pas purs : `data/skills.js` (importe `game/combat`, `game/fx`, `game/pets`, `world/terrain`, `ui/painted`) et `data/spawns.js` (importe `world/terrain`).

## 4. Monde : décision officielle (Allan, 2026-10-02)

```
TARGET WORLD: nouvelle world map Orvalis
OLD WORLD: prototype uniquement
WORLD STRUCTURE: plusieurs continents + océans + îles
OLD COORDINATES: non contraintes
CONTENT: réutilisable et repositionnable
WORLD STREAMING: tile/chunk based
EXPANSION: nouveaux continents/maps doivent pouvoir être ajoutés facilement
```

Le monde actuel est un prototype : un carré de 4096 m contenant 9 zones en grille. Le nouvel Orvalis aura une vraie carte de MMORPG : plusieurs grands continents aux formes naturelles, océans, côtes, îles et archipels, chaînes de montagnes, plaines, forêts, déserts, marais, régions enneigées, lacs et rivières, grandes distances entre certaines régions, et la possibilité d'ajouter des continents plus tard.

Conséquences pour la migration :
- **Ce qu'on garde** : les systèmes, et le contenu — noms de zones, lore, factions, monstres, quêtes, villes, ressources, donjons, classes, objets.
- **Ce qu'on ne garde pas** : la géographie. Les positions des villes, routes, points d'apparition, lacs et cols peuvent être entièrement remappées. Rien n'oblige à les préserver.
- **Ce qui ne contraint plus le moteur** : les 1024 × 1024 cellules, la cellule de 4 m, le découpage en 32 × 32 secteurs, les coordonnées actuelles.

Structure cible :

```
World
├── Map / Continent 0   → grille de tiles (creuse), régions, villes, donjons
├── Map / Continent 1   → grille de tiles (creuse), régions, îles
├── Map / Continent 2
└── futures maps / continents
```

- La grille de tiles est une structure technique de streaming, invisible pour le joueur.
- Une tile porte un type défini par les données (océan, côte, terre, montagne, île…). Beaucoup de tiles sont vides ou océaniques et ne produisent aucune géométrie détaillée.
- Des régions très éloignées peuvent exister sans remplir l'espace intermédiaire.
- La spec va dans ce sens : un index de présence par map, qui évite de charger les tiles absentes comme l'océan ouvert (§2), un terrain lointain très léger (§14), et des zones rattachées à une table de maps (§234). Le découpage « un continent = une map » est notre choix d'architecture, pas une valeur tirée de la spec.
- Le 64 × 64 de la spec est la taille de SES maps : référence historique uniquement. Dans Orvalis, les coordonnées de tile sont des entiers sans borne (négatifs compris) et une map est creuse.
- Echelle : on garde la topologie de la spec (16 × 16 chunks par tile, 8 × 8 cellules par chunk) ; la taille physique est configurable (`cellSize`, profil Orvalis : 4 → chunk 32, tile 512).

Le monde définitif n'est pas à générer maintenant ; il sera conçu à la phase terrain/world.

### Ancien terrain (pour mémoire)

`src/world/terrain.js` (20 Ko) contient une carte de hauteurs `Float32Array` de 1025 × 1025 sommets et des fonctions pures (`getHeight`, `getSlope`, `waterDepth`, `canWalk`, `zoneAt`, `roadDist`…). Three.js n'y sert qu'à trois endroits, pour des couleurs.
Usage possible : fournir un extrait de relief comme **zone de test technique** du nouveau terrain. Il ne définit pas la géographie du nouvel Orvalis.

## 4 bis. Données liées aux anciennes coordonnées

Ces fichiers mélangent du contenu réutilisable et des positions du prototype. Au moment de concevoir la nouvelle carte, il faudra y séparer le contenu (à garder) des coordonnées (à refaire) :
- `data/zones.js` : zones, factions, capitales et avant-postes, cols, lacs, routes, lieux remarquables ;
- `data/spawns.js` : points d'apparition des créatures ;
- `data/npcs.js`, `data/quests.js`, `data/story.js`, `data/dungeons.js` : PNJ, objectifs et entrées de donjon placés dans le monde ;
- `data/world-space.js` : limites du monde et migration des anciennes sauvegardes ;
- `world/towns.js`, `world/landmarks.js`, `world/decor.js` : construction des lieux aux positions actuelles.
⚠️ Cette liste vient des noms et rôles des fichiers ; le détail de ce qui est positionné dans chacun reste à mesurer.

## 5. Ordre d'isolation proposé

1. **`data/skills.js`** : couper ses imports vers `game/`, `world/`, `ui/` pour que le contenu de `src/data` soit pur (M0.5). `data/spawns.js` dépend des anciennes coordonnées : à refaire avec la nouvelle carte plutôt qu'à isoler.
2. **Terrain** : pas d'isolation de l'ancien terrain. Le nouveau terrain est construit dans `engine/` ; l'ancien ne sert, au besoin, que de source pour une zone de test.
3. **`game/entity.js`** : remplacer `THREE.Vector3` par un type de position neutre ; libère d'un coup mob, bots, world, social, market.
4. **`game/fx.js`** : passer par une interface d'effets ; libère combat et compétences.
5. **`game/npc.js`, `ui/hud.js`** : même principe, plus tard.

Règle : chaque modification d'un fichier de `src/` change l'empreinte `sourceHash`. Après une modification voulue, il faut reconstruire `dist/` (`npm run build:prod` à la racine), relancer les scénarios de `tests/` concernés, puis `npm run verify` dans `engine/`.
