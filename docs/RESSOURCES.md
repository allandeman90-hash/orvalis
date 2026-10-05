# Ressources de la refonte

Les nouveaux corps, squelettes, textures de matières, végétaux et armes sont créés dans les sources de ce projet. Aucun modèle ni texture de World of Warcraft n'a été importé. Les icônes existantes du projet sont conservées ; leur présence antérieure ne constitue pas un nouvel audit de provenance.

| Ressource | Source éditable | Technique |
|---|---|---|
| Corps et visages | `src/game/organic.js` | Sections anatomiques reliées par surfaces UV indexées, pondérations et squelette indépendant |
| Atlas des acteurs | `organicAtlas()` dans ce même fichier | Canvas 1024 × 512, huit matières, génération déterministe |
| Armes et objets tenus | `src/game/equipment-art.js` | Lames profilées, arcs courbés, boucliers, livres et accessoires |
| Animation en jeu | `src/game/models.js` | Adaptateur des actions et poses du jeu sur les os |
| Export et chargement GLB | `src/engine/art-pipeline.js` | GLTFExporter / GLTFLoader de Three.js ; sept clips échantillonnés |
| Exemple GLB autonome | `assets/models/wolf-original.glb` | Export du loup réellement utilisé par le jeu, vérifié par rechargement |
| Arbres | `src/world/trees.js` | Troncs et branches courbes, feuilles pliées, trois niveaux de détail |
| Plantes et petits décors | `src/world/ground-cover.js` | Tiges, feuilles, fougères, roseaux, cactus, champignons et os courbes |
| Matières du monde | `src/engine/textures.js` | Motifs originaux générés, projection sur terrain et architecture |
| Peuplement et secteurs | `src/world/decor.js` | Positions déterministes et collisions persistantes, rendu instancié chargé à proximité |
| Terrain | `src/world/terrain.js`, `src/world/sectors.js` | Hauteurs CPU partagées, maillages de proximité, niveaux de détail et jupes de raccord |

Le moteur construit les modèles à partir de ces sources au lancement. Il ne charge pas 121 fichiers GLB externes. Le chemin GLB est livré et testé pour poursuivre la production artistique ; ce choix conserve une page HTML jouable autonome.

Les textures d'acteurs sont des atlas de matières procédurales, pas 121 textures peintes individuellement. Les variantes partagent leurs familles anatomiques. Les captures du catalogue permettent d'en juger la qualité sans confondre couverture technique et validation artistique.

Three.js conserve sa licence MIT, reproduite dans `THREE-LICENSE.txt`. Les dépendances de construction sont fixées par `package-lock.json`.
