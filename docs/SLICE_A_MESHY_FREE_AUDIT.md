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

# Résultat cumulé de l'audit

Candidats individuels qualifiés : **7** (dont Wooden Stall).
Collections/planches qualifiées : **3**.

Priorité téléchargement/QA actuelle :
1. **Medieval Village Asset Pack** — pack CC0 stylized/game/lowpoly ;
2. **chêne stylisé** — asset individuel léger ;
3. **petite maison bois/pierre** — asset individuel léger ;
4. **Wooden Stall** — prop individuel léger ;
5. **Rustic Timber & Stone Collection** — QA technique utile, mais filtre stylistique renforcé à cause de `photoreal`.

Les modèles lourds isolés (lanterne 287k, charrette 168k, moulin 1,6M) deviennent moins intéressants maintenant que des collections gratuites cohérentes existent : on cherchera d'abord si les packs approuvés contiennent déjà une alternative légère avant de retopo quoi que ce soit.

# Prochaine passe

1. examiner d'autres planches Meshy gratuites via tags `pack`, `collection`, `set`, `props`, `environment`, `modular`, `stylized`, `lowpoly` ;
2. viser spécifiquement nature/vegetation/rocks/farm et architecture modulaire ;
3. télécharger seulement les packs/individuels `APPROVED FOR DOWNLOAD/GLB QA` ;
4. analyser le GLB pour connaître la vraie séparabilité et le triangle count par sous-asset ;
5. alimenter ensuite le registre final d'assets approuvés et le downloader en lot.
