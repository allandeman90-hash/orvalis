# ORVALIS — SLICE A MESHY FREE AUDIT

Status: **ACTIVE AUDIT — 2026-10-09**

Scope: bibliothèque gratuite Meshy uniquement, pour **Val d'Azur + bord de Havrebleu**.

Règles :
- recherche par titre + tags + description/prompt ;
- inspection visuelle réelle du preview/viewer avant verdict ;
- direction stylisée/cartoon MMO, pas photoréaliste ;
- cible géométrique ~15k triangles ; jusqu'à ~50k pour hero/important ; 100k max exceptionnel ;
- noter quand Meshy affiche faces/quads plutôt que triangles ;
- aucun téléchargement/intégration avant verdict ;
- priorité aux modèles génériques/originaux ; éviter les dépendances à une IP tierce explicitement citée dans le prompt/titre.

## Verdicts
- `APPROVED` = mérite téléchargement + analyse GLB.
- `MAYBE` = visuellement intéressant mais besoin d'une inspection/normalisation supplémentaire.
- `REJECT` = hors direction, trop réaliste, trop générique/mauvaise silhouette, coût disproportionné, ou problème d'IP/provenance.

---

## MF-VAL-TREE-001 — An oak tree, stylized, low poly asset

- Rôle Orvalis : arbre feuillu / chêne du Val d'Azur
- Source : https://www.meshy.ai/3d-models/An-oak-tree-stylized-low-poly-asset-v2-01971a1b-6213-7e6d-a635-74f22abb7cd8
- Auteur : `vivra_akathon`
- Licence affichée : **CC0**
- Tags : `tree`, `oak`, `stylized`, `lowpoly`, `nature`, `environment`
- Catégories visibles : Nature & Plants / Trees & Plants
- Topologie affichée : **Quad**
- Faces affichées : **10,854**
- Vertices affichés : **8,870**
- Formats annoncés : FBX / OBJ / GLB / USDZ / STL
- Description : `An oak tree, stylized, low poly asset`
- Inspection : preview Meshy disponible ; silhouette feuillue stylisée et clairement non photoréaliste. Le modèle tombe dans la bonne famille visuelle pour un MMO cartoon et reste sous notre enveloppe de base en faces affichées. Les triangles réels devront être mesurés sur le GLB.
- Verdict : **APPROVED FOR DOWNLOAD/GLB QA**
- Raisons : style correct, tags très pertinents, licence CC0, complexité compatible, usage répétable dans le Val.
- À vérifier après téléchargement : triangles réels, nombre de matériaux, texture(s), UV, alpha foliage éventuel, pivot, bounds, possibilité de variations de teinte/scale sans dupliquer le mesh.

---

## MF-VAL-ARCH-001 — low poly wooden house #medieval

- Rôle Orvalis : petite maison rurale / dépendance / variante de ferme dans le Val
- Source : https://www.meshy.ai/3d-models/low-poly-wooden-house-medieval-01944a6f-9a27-7170-9daa-30c4500eb4de
- Licence affichée : **CC0**
- Tags : `house`, `wood`, `medieval`, `lowpoly`, `architecture`, `building`
- Topologie affichée : **Quad**
- Faces affichées : **11,473**
- Vertices affichés : **11,080**
- Inspection navigateur : maison bois stylisée avec toit brun sombre en bardeaux, murs en bois clair/brun et soubassement de pierre grise. Le rendu est stylisé/semi-peint, non photoréaliste, sans tomber dans le jouet très simplifié. La silhouette est lisible et le mélange bois/pierre est compatible avec le Val.
- Verdict : **APPROVED FOR DOWNLOAD/GLB QA**
- Raisons : complexité proche de notre cible de base ; très bonne compatibilité rurale ; licence CC0 ; réutilisable.
- Adaptation Orvalis probable : éclaircir la pierre vers le calcaire, assombrir certains bois, remplacer/recolorer toiture vers bleu-gris sur les variantes Azur, ajouter éventuellement ferrures bronze très discrètes.

---

## MF-VAL-LIGHT-001 — Medieval Lantern Post

- Rôle Orvalis : éclairage de village / route / bord de Havrebleu
- Source : https://www.meshy.ai/3d-models/Medieval-Lantern-Post-v2-019a18cb-edf8-7ec4-8cd5-d2389cbded38
- Licence affichée : **CC0**
- Tags : `medieval`, `lantern`, `post`, `street`, `lighting`, `ornate`, `vintage`, `outside`, `decor`, `lamp`, `lamps`
- Topologie affichée : **Triangle**
- Faces affichées : **287,345**
- Vertices affichés : **169,008**
- Matériaux visibles : Base Color, Roughness, Metallic, Normal
- Inspection navigateur : poteau sombre/rustique, socle pierre brute, lanterne verre + métal avec lumière chaude. Bon langage de matériaux et stylisation correcte ; pas photoréaliste.
- Verdict : **MAYBE — VISUAL FIT / GEOMETRY FAIL**
- Raisons : visuellement intéressant mais ~287k faces pour un simple lampadaire est totalement disproportionné pour notre MMO web et dépasse même le plafond exceptionnel de 100k.
- Action : ne pas télécharger pour runtime tel quel. Chercher d'abord une alternative gratuite Meshy <15–25k. Retopo seulement si aucun équivalent satisfaisant n'existe et si la silhouette vaut réellement l'effort.

---

## MF-VAL-PROP-001 — Low-poly medieval wooden handcart

- Rôle Orvalis : charrette de marché / ferme / route
- Source : https://www.meshy.ai/3d-models/Lowpoly-3D-model-of-a-medieval-wooden-handcart-The-cart-features-a-simple-rectangular-base-with-sturdy-wooden-planks-two-large-spoked-wheels-and-a-handlebar-for-pulling-The-design-is-minimalistic-and-stylized-with-blocky-shapes-no-intricate-details-and-a-slightly-weathered-look-Ideal-for-a-medieval-market-setting-v2-01937f21-7f1c-7ee8-afa5-f9326778fb3f
- Licence affichée : **CC0**
- Description : modèle minimaliste/stylisé, formes blocky, peu de détails, bois légèrement vieilli, conçu pour marché médiéval.
- Topologie affichée : **Triangle**
- Faces affichées : **168,508**
- Vertices affichés : **105,246**
- Inspection navigateur : deux grandes roues à rayons, plateforme et ridelles bois, tons terre/brun. Bonne silhouette MMO et très bon rôle de prop générique.
- Verdict : **MAYBE — VISUAL FIT / GEOMETRY FAIL**
- Raisons : design adapté mais géométrie beaucoup trop lourde pour un prop répétable ; dépasse le plafond 100k.
- Action : chercher un autre handcart gratuit Meshy beaucoup plus léger avant toute retopo.

---

## MF-VAL-LANDMARK-001 — Medieval Wind-Mill

- Rôle potentiel : moulin rural / landmark secondaire
- Source : https://www.meshy.ai/3d-models/medieval-wind-mill-01a05311-f8f3-7360-a304-db3f5102852e
- Licence affichée : **CC0**
- Tags visibles : `windmill`, `waterwheel`, `stonework`, `weathered`, `canvas`, `sails`, `shingleroof`, `tower`, `environment`, `realistic`
- Topologie affichée : **Triangle**
- Faces affichées : **1,639,246**
- Vertices affichés : **906,027**
- Inspection : viewer 3D non chargé pendant l'audit ; tags orientés réalistes et complexité extrême.
- Verdict : **REJECT**
- Raisons : 1,6M faces = totalement incompatible avec notre enveloppe web ; `realistic` s'éloigne de la direction ; pas de validation visuelle complète.
- Action : continuer la recherche avec `stylized`, `cartoon`, `lowpoly`, `game asset`, `water mill`, `windmill`, `medieval`, `fantasy`.

---

## MF-VAL-ARCH-002 — A stylized medieval village

- Rôle potentiel : référence de composition / source éventuelle de modules si séparables
- Source : https://www.meshy.ai/3d-models/A-stylized-medieval-village-v2-0194a435-6c97-7f42-b67a-b888f2a13a05
- Licence affichée : **CC0**
- Tags : `village`, `medieval`, `stylized`, `architecture`, `buildings`, `fantasy`, `town`, `landscape`, `historic`, `shaders`
- Topologie affichée : **Triangle**
- Faces affichées : **280,947**
- Vertices affichés : **186,074**
- Inspection navigateur : scène village complète avec plusieurs bâtiments, puits et végétation. Direction clairement stylisée, non photoréaliste, mais modèle monobloc/complexe et palette plus fantasy générique que spécifiquement Azur.
- Verdict : **MAYBE — REFERENCE ONLY FOR NOW**
- Raisons : trop lourd pour être importé comme village monobloc ; pourrait servir de référence de densité/composition ou éventuellement de source si les bâtiments sont séparables et optimisables.
- Action : ne pas valider comme runtime. Préférer des bâtiments/modules individuels sous nos budgets.

---

# PASSE SPÉCIALE — PLANCHES / PACKS / COLLECTIONS MESHY

Cette passe confirme que Meshy contient de vraies **planches de dizaines d'assets cohérents**, et qu'elles doivent être recherchées avant de multiplier les modèles isolés.

Règle supplémentaire :
> **Pour chaque besoin générique, chercher d'abord un pack/collection CC0 stylisé cohérent. Ensuite seulement compléter avec des assets isolés.**

Important : une planche où 50 objets sont visibles séparément dans le preview n'est pas encore techniquement confirmée comme 50 meshes/nodes séparables dans le GLB. Cette propriété doit être vérifiée après téléchargement avant passage au statut `local/normalized`.

## MF-VAL-PACK-001 — Medieval Village Asset Pack

- Rôle Orvalis : source principale potentielle de petits props du Val / Clairbourg / marché / ferme / bord de Havrebleu.
- Source : https://www.meshy.ai/3d-models/Medieval-Village-Asset-Pack-019e631a-179e-7513-a932-bfda0f8b7a48?page=landing
- Auteur : `warmsignull`
- Licence affichée et revérifiée sur la page : **CC0**
- Génération : Meshy 6
- Tags : `village`, `medieval`, `asset`, `pack`, `stylized`, `game`, `lowpoly`, `texture`, `props`, `environment`
- Sous-catégories utiles : Game Props / Medieval & Viking / Houses & Homes / Landscapes & Biomes.
- Topologie globale affichée : **Triangle**
- Faces globales affichées : **762,299**
- Vertices globaux affichés : **455,064**
- Inspection visuelle de la planche : environ 50+ objets clairement distincts visibles, notamment caisses, tonneaux, lanternes, clôtures, arbres, champignons, fioles, nourriture, arches, escaliers et autres props de village.
- Style : explicitement `stylized + game + lowpoly`; c'est pour l'instant le meilleur match de pack avec notre direction cartoon MMO.
- Séparabilité : les objets sont visuellement individualisés dans la planche ; **séparabilité GLB encore à prouver**.
- Verdict : **APPROVED FOR DOWNLOAD / PACK QA — PRIORITÉ #1**
- QA obligatoire après téléchargement : lister meshes/nodes/primitives, compter triangles **par objet**, vérifier matériaux/textures partagés, identifier les objets réellement séparables, mesurer le coût si toute la planche est chargée, puis ne retenir que les sous-assets utiles et sous budget.

## MF-VAL-PACK-002 — Rustic Timber & Stone: A Medieval Props Collection

- Rôle Orvalis : réserve secondaire de props ruraux et de construction.
- Source : https://www.meshy.ai/3d-models/Rustic-Timber-Stone-A-Medieval-Props-Collection-019f599b-4f1e-774f-8a93-6574ff2c5b69?page=landing
- Auteur : `blnaq9`
- Licence affichée et revérifiée : **CC0**
- Génération : Meshy 6
- Tags : `medieval`, `props`, `collection`, `timber`, `stone`, `rustic`, `texture`, `set`, `photoreal`, `scene`, `decoration`, `setpiece`
- Topologie globale affichée : **Triangle**
- Faces globales affichées : **777,210**
- Vertices globaux affichés : **455,447**
- Inspection visuelle : ~50 objets distincts visibles, dont clôtures intactes/cassées, caisses, tonneaux, poteries, charrettes, puits, rochers, fagots, végétation, tentes/canopées et panneaux/posts.
- Point positif : excellente couverture fonctionnelle d'un environnement rural.
- Point négatif : le tag `photoreal` est contraire à notre cible si les matériaux tirent réellement vers le réalisme.
- Séparabilité : visuellement modulaire ; **à confirmer dans le GLB**.
- Verdict : **MAYBE / APPROVED FOR TECHNICAL PACK QA, PAS ENCORE POUR LE STYLE FINAL**
- Usage prévu : télécharger pour voir si certains sous-assets peuvent être récupérés puis normalisés vers la palette/material cartoon Orvalis. Ne pas adopter le pack entier automatiquement.

## MF-VAL-PACK-003 — Potion Collection in a Chest

- Rôle potentiel : alchimie / inventaire / boutique.
- Licence vue pendant audit navigateur : **CC0**.
- Topologie globale affichée : **Quad**.
- Faces globales affichées : **95,300**.
- Vertices affichés : **98,566**.
- Inspection : coffre + plusieurs fioles/potions individualisées visuellement.
- Verdict : **MAYBE**.
- Raison : la collection totale touche notre plafond exceptionnel, mais les fioles individuelles pourraient être extrêmement légères si elles sont réellement séparables.
- Priorité : faible pour le Slice A immédiat ; utile plus tard pour professions/alchimie.

## MF-VAL-PROP-002 — Wooden Stall

- Rôle : étal rural / marché / Clairbourg / bord de Havrebleu.
- Source : https://www.meshy.ai/3d-models/Wooden-Stall-019b14bc-388e-73ed-9980-ded7ca272c81?page=landing
- Licence affichée pendant audit : **CC0**.
- Tags : `furniture`, `wood`, `stall`, `market`, `rustic`, `outdoor`, `display`, `craft`, `traditional`, `props`.
- Topologie affichée : **Triangle**.
- Faces affichées : **9,994**.
- Vertices affichés : **9,801**.
- Verdict : **APPROVED FOR DOWNLOAD/GLB QA**.
- Raisons : rôle immédiatement utile, géométrie sous la cible ~15k, style rustique générique facilement normalisable.

---

# PASSE CIBLÉE — MINI SEED KIT A0.2 / 2026-10-09

Cette passe vise explicitement le plus petit lot cohérent demandé par A0.2 : **tree + rock + petit prop d'environnement**, sans élargir encore le scope.

Point outil : l'interface publique Meshy n'a pas exposé de filtre Triangle Count exploitable pendant cette passe. Les métadonnées techniques des pages individuelles ont donc été extraites avant verdict afin d'éviter les faux `lowpoly`. Le filtre authentifié pourra être retesté plus tard, mais il ne doit plus bloquer l'audit.

## MF-VAL-ROCK-001 — Low poly rock

- Rôle Orvalis : rocher générique / famille calcaire du Val après normalisation de palette.
- Source : https://www.meshy.ai/3d-models/Low-poly-rock-019b1362-cb67-7b1b-81de-82214c3595b4?page=landing
- Auteur : `feelzebub`
- Licence affichée : **CC0**.
- Génération : `Meshy-4`.
- Tags : `rock`, `lowpoly`, `terrain`, `3dmodel`, `environment`, `nature`, `asset`, `geology`, `polygon`, `scenery`, `low`, `poly`, `lowpolyart`.
- Topologie affichée : **Quad**.
- Faces affichées : **1,076**.
- Vertices affichés : **1,078**.
- Inspection visuelle : silhouette angulaire simple composée de quelques volumes principaux, tons pierre/terre, lecture très claire et non photoréaliste ; bon candidat pour être recoloré vers un calcaire gris-bleu/ivoire Azur.
- Verdict : **APPROVED FOR DOWNLOAD/GLB QA**.
- Raisons : extrêmement léger, générique, CC0, stylisé, réutilisable en grand nombre avec variations de scale/rotation/teinte.
- À vérifier après téléchargement : triangles réels après triangulation du Quad, nombre de matériaux, texture(s), pivot/échelle, possibilité de créer 2–3 variantes runtime sans dupliquer le mesh source.

## MF-VAL-FENCE-001 — Low Poly Wooden Fence

- Rôle Orvalis : clôture rurale / bord de champ / ferme / chemin du Val.
- Source : https://www.meshy.ai/3d-models/low-poly-wooden-fence-019fa865-7de9-7a84-b0b4-bda388fa94af?page=landing
- Auteur : `theanh75`
- Licence affichée : **CC0**.
- Génération : `Meshy 6`.
- Tags : `wooden`, `fence`, `sturdy`, `planks`, `privacy`, `slats`, `grain`, `texture`, `outdoor`, `rustic`.
- Topologie affichée : **Triangle**.
- Faces affichées : **10,060**.
- Vertices affichés : **11,705**.
- Inspection visuelle : structure bois rustique, silhouette simple/lisible, grain visible sans basculer dans un rendu photoréaliste ; compatible avec un MMO stylisé après normalisation des matériaux.
- Verdict : **APPROVED FOR DOWNLOAD/GLB QA**.
- Raisons : sous la cible de base, rôle P0 immédiat, asset générique, CC0, facile à instancier et à décliner en segments.
- À vérifier après téléchargement : nombre de meshes/primitives, dimensions exactes, pivot d'extrémité ou central, répétabilité bord-à-bord, matériaux/textures, possibilité de casser/recolorer certaines planches pour variantes.

## MF-VAL-ROCK-002 — low poly beautiful mountain rocks

- Source : https://www.meshy.ai/3d-models/low-poly-beautiful-mountain-rocks-019ed066-7114-70ee-8619-0d2fe1cd14b6?page=landing
- Auteur : `a.balanyuk`
- Licence : **CC0**.
- Tags : `lowpoly`, `mountain`, `rocks`, `terrain`, `stylized`, `landscape`, `voxellike`, `polygonal`.
- Inspection visuelle : très joli amas rocheux gris stylisé avec mousse, bon fit artistique brut pour le Val.
- Topologie affichée : **Triangle**.
- Faces affichées : **326,686**.
- Vertices affichés : **181,499**.
- Verdict : **REJECT — GEOMETRY FAIL**.
- Raison : malgré le titre `low poly` et un excellent look, la géométrie dépasse largement le plafond absolu de 100k ; exemple typique de faux positif évité par l'audit technique.

## MF-VAL-FENCE-002 — Weathered Fence

- Source : https://www.meshy.ai/3d-models/Weathered-Fence-019988b8-ae38-719b-aacb-f2f56e5852fb
- Auteur : `SashaRX`.
- Licence : **CC0**.
- Tags : `wood`, `fence`, `village`.
- Topologie affichée : **Triangle**.
- Faces affichées : **340,547**.
- Vertices affichés : **198,919**.
- Inspection : rendu plus réaliste/usé que notre cible, en plus d'une géométrie disproportionnée pour une clôture répétable.
- Verdict : **REJECT — STYLE + GEOMETRY FAIL**.

---

# Résultat cumulé de l'audit

Candidats individuels qualifiés : **9** (dont Wooden Stall, Low poly rock et Low Poly Wooden Fence).
Collections/planches qualifiées : **3**.

## Mini seed kit A0.2 désormais qualifié

1. **MF-VAL-TREE-001 — chêne stylisé** — CC0 — 10,854 faces affichées ;
2. **MF-VAL-ROCK-001 — Low poly rock** — CC0 — 1,076 faces affichées ;
3. **MF-VAL-FENCE-001 — Low Poly Wooden Fence** — CC0 — 10,060 faces affichées.

Ce trio est volontairement petit : il suffit pour passer à la copie locale + GLB QA sans importer massivement des assets avant d'avoir validé le pipeline.

Priorité téléchargement/QA actuelle :
1. **mini seed kit A0.2 : chêne + Low poly rock + Low Poly Wooden Fence** ;
2. **Medieval Village Asset Pack** — pack CC0 stylized/game/lowpoly ;
3. **petite maison bois/pierre** — asset individuel léger ;
4. **Wooden Stall** — prop individuel léger ;
5. **Rustic Timber & Stone Collection** — QA technique utile, mais filtre stylistique renforcé à cause de `photoreal`.

Les modèles lourds isolés (lanterne 287k, charrette 168k, moulin 1,6M, Weathered Fence 340k, amas rocheux 326k) restent hors runtime direct. Le mot `lowpoly` ne vaut jamais validation technique.

# Prochaine passe

1. télécharger en priorité les **3 GLB du mini seed kit A0.2** ;
2. les copier localement avec provenance ;
3. analyser nodes / meshes / primitives / matériaux / textures / triangles réels / bounds ;
4. seulement si ce lot est sain, télécharger ensuite `MF-VAL-PACK-001` pour QA de séparabilité ;
5. alimenter le registre final d'assets approuvés et le downloader en lot ;
6. passer ensuite à A0.3 — ingestion/normalisation GLB statique minimale.
