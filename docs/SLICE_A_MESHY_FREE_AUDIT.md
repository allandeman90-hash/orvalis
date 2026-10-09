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

## Audit navigateur en cours

Candidats actuellement inspectés dans le navigateur dynamique :
- low-poly medieval wooden house ;
- Medieval Lantern Post ;
- medieval wooden handcart ;
- Medieval Wind-Mill.

Leur verdict sera ajouté uniquement après retour complet de l'inspection visuelle.
