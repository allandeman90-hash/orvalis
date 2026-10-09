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

# Résultat du premier audit

Inspectés/qualifiés : **6** candidats.

- **APPROVED FOR GLB QA : 2**
  - chêne stylisé ;
  - petite maison bois/pierre.
- **MAYBE : 3**
  - lantern post : bon visuel, beaucoup trop lourd ;
  - handcart : bon visuel, beaucoup trop lourd ;
  - village stylisé : utile comme référence, trop lourd/monobloc pour runtime.
- **REJECT : 1**
  - windmill : extrêmement lourd + direction réaliste + preview non validé.

Conclusion : la bibliothèque gratuite Meshy contient bien des assets directement intéressants, mais le tag `lowpoly` ou une apparence simple ne garantit absolument pas une géométrie légère. **Polycount réel/affiché devient un filtre dur dès la découverte**, avant téléchargement.

# Prochaine passe

Rechercher spécifiquement des alternatives gratuites Meshy sous budget pour :
1. lantern post <15–25k ;
2. handcart/cart <15–25k ;
3. stylized mill <50k si landmark ;
4. 2–4 autres chênes/arbres feuillus <15k ;
5. rochers/mossy rocks <15k ;
6. buissons/fleurs/herbes ;
7. clôtures/murs bas sans mention d'IP tierce.
