# ORVALIS — SLICE A ASSET SOURCING

Status: **PRODUCTION SOURCING BLUEPRINT — 2026-10-09**

Scope: **Val d'Azur + bord de Havrebleu uniquement**.

Ce document ne remplace pas `ACT_I_MASTER_ASSET_LIST.md`. Il transforme le besoin du premier vertical slice en stratégie d'acquisition concrète.

Principe :

> **Ne pas remplir Orvalis avec un seul asset pack. Utiliser les packs libres comme matière première générique, Meshy pour les formes spécifiques à Orvalis, puis normaliser l'ensemble sous une direction artistique commune.**

---

# I. TROIS VOIES D'ACQUISITION

Chaque asset du Slice A doit être classé dans une de ces voies.

## A — CC0 / FREE SEED

Usage :
- végétation générique ;
- rochers ;
- clôtures ;
- caisses / tonneaux / sacs ;
- outils ;
- bâtiments ruraux secondaires ;
- animaux communs ;
- petits accessoires non identitaires.

Ces assets ne sont jamais acceptés « bruts » dans le rendu final : scale, pivot, matériaux, palette, textures, vertex colors, collisions, LOD et variations d'instance passent par la normalisation Orvalis.

## B — MESHY CUSTOM

Usage :
- objets qui doivent être visuellement spécifiques à Orvalis mais ne justifient pas encore un pipeline d'artiste manuel complet ;
- variantes d'architecture Azur ;
- éléments runiques ;
- statues ;
- monuments secondaires ;
- créatures simples originales ;
- props héroïques ;
- pièces de décor qui doivent éviter le look « asset pack reconnaissable ».

Règle de provenance : chaque génération conserve son prompt, date, plan Meshy utilisé, éventuelle référence d'entrée et preuve que cette référence est originale/licenciée.

Les générations Meshy **gratuites** sont traitées comme `CC BY 4.0` avec attribution Meshy dans le registre du projet. Les générations faites sous un plan payant sont enregistrées comme production privée/propriétaire selon les conditions applicables au moment de génération.

Ne jamais fournir comme référence une capture de WoW, Hordes.io, Aion, ou une autre IP protégée. Les références Meshy doivent être créées par nous ou provenir de sources dont les droits sont clairs.

## C — ORIGINAL CONTROLLED

Obligatoire pour :
- corps joueur masculin/féminin de production ;
- squelette/rig de référence ;
- topologie compatible équipement/transmog ;
- équipement signature des huit Ordres ;
- identité principale de Havrebleu ;
- runes et Ancrages majeurs ;
- héros/PNJ signatures ;
- éléments que le joueur verra des centaines d'heures.

Meshy peut aider à explorer des silhouettes/concepts pour ces catégories, mais un mesh brut généré n'est jamais automatiquement le modèle de production.

---

# II. SHORTLIST CC0 — NATURE DU VAL

## 1. Quaternius — Ultimate Stylized Nature Pack

Source : https://quaternius.com/packs/ultimatestylizednature.html
Licence : **CC0**
Formats : FBX / OBJ / glTF / Blend
Contenu : 60+ assets nature, arbres, herbes, fleurs, rochers, textures/normal maps.

Décision : **P0 REVIEW PRIORITY**.

Usage potentiel :
- arbres feuillus du Val ;
- petits buissons ;
- fleurs ;
- herbe en touffes ;
- rochers calcaires après recolor/material pass.

## 2. Quaternius — Stylized Nature MegaKit

Source : https://quaternius.com/packs/stylizednaturemegakit.html
Licence : **CC0**
Formats : FBX / OBJ / glTF
Contenu : 110+ modèles, dont environ 40 arbres, 35 plantes/fleurs, 27 rochers.

Décision : **P1 REVIEW**.

Raison : très bonne réserve de variantes, mais ne pas importer 110 modèles avant d'avoir choisi 5–10 formes de base cohérentes.

## 3. Kenney — Nature Kit

Source : https://kenney.nl/assets/nature-kit
Licence : **CC0**
Contenu : 330 fichiers 3D.

Décision : **P1 FALLBACK / VARIATION**.

Usage potentiel : petites plantes, rochers secondaires, souches, éléments de scatter si le style reste compatible après normalisation.

---

# III. SHORTLIST CC0 — FERME / VILLAGE

## 4. Quaternius — Farm Buildings Pack / Bundle

Sources :
- https://quaternius.com/packs/farmbuildings.html
- https://poly.pizza/bundle/Farm-Buildings-Bundle-ppbnhEfNEt

Licence : **CC0**
Formats disponibles : FBX / GLB (bundle Poly Pizza), FBX / OBJ / Blend côté Quaternius.

Contenu vérifié : clôtures, silos, granges, poulailler, plusieurs barns, Tower Windmill.

Décision : **P0 REVIEW PRIORITY**.

Usage : Clairbourg / fermes du Val / silhouette de moulin secondaire.

Important : ces bâtiments servent de matière première rurale, pas de langage architectural final de Havrebleu.

## 5. Quaternius — Medieval Village MegaKit

Source : https://quaternius.com/packs/medievalvillagemegakit.html
Licence : **CC0**
Formats : FBX / OBJ / glTF
Contenu : 300+ pièces modulaires, murs, sols, escaliers, toits, portes, fenêtres, végétation grimpante, collisions dans les versions source.

Décision : **P0/P1 REVIEW pour construire le prototype du kit Azur**.

Usage :
- volume de maisons ;
- petites boutiques ;
- auberge ;
- murs secondaires ;
- bases de toiture.

Limite : Havrebleu doit recevoir ensuite des modules/monuments originaux. Le MegaKit ne doit jamais rendre la capitale reconnaissable comme une démo Quaternius.

## 6. Kenney — Fantasy Town Kit

Source : https://kenney.nl/assets/fantasy-town-kit
Licence : **CC0**
Contenu : 160 fichiers 3D.

Décision : **P1 ALTERNATIVE STYLE TEST**.

Ne pas mélanger automatiquement avec Quaternius. Comparer d'abord dans l'Art Review sous la même lumière.

---

# IV. SHORTLIST CC0 — PROPS

## 7. Quaternius — Fantasy Props MegaKit

Source : https://quaternius.com/packs/fantasypropsmegakit.html
Licence : **CC0**
Formats : FBX / OBJ / glTF / Blend
Contenu : 200+ props avec très peu de jeux de textures partagés.

Décision : **P0 REVIEW PRIORITY**.

Usage potentiel :
- caisses ;
- tonneaux ;
- sacs ;
- outils ;
- étals ;
- meubles ;
- livres ;
- chests ;
- accessoires artisans.

Très intéressant pour le web grâce à la mutualisation des textures.

## 8. Kay Lousberg — Lantern

Déjà dans `art-review-registry.json`.
Source : https://poly.pizza/m/CtHBJ1ufeW
Licence : **CC0**

Décision : conserver comme test de compatibilité inter-auteur.

---

# V. SHORTLIST CC0 — ANIMAUX / CREATURES COMMUNES

## 9. Quaternius — Animated Animal Pack

Source : https://poly.pizza/bundle/Animated-Animal-Pack-ILAPXeUYiS
Licence : **CC0**
Formats : FBX / glTF

Contenu vérifié : Cow, Donkey, Deer, Alpaca, Bull, Fox, Shiba Inu, Stag, Husky, **Wolf**, White Horse, Horse ; plus de 12 animations par animal dans le pack d'origine.

Décision : **P0 pour Wolf** ; deer/horse/fox potentiellement utiles plus tard.

## 10. Quaternius — Farm Animal Pack

Source : https://poly.pizza/bundle/Farm-Animal-Pack-1kUvRTPLzT
Licence : **CC0**
Formats : FBX / GLTF

Contenu vérifié : llama, **pig**, pug, sheep, horse, cow, zebra.

Décision : **P1 pour ambiance agricole**.

Le pig peut servir de base technique pour un sanglier uniquement comme prototype. Le sanglier final doit avoir une silhouette sauvage distincte, idéalement Meshy/custom si aucun CC0 compatible n'est trouvé.

---

# VI. MESHY — CIBLES PRIORITAIRES DU SLICE A

Meshy est utilisé là où les packs gratuits commenceraient à rendre le jeu générique.

## M0 — Sanglier du Val

But : créature commune originale, lisible, stylisée, faible complexité.

Contraintes :
- quadrupède ;
- proportions légèrement héroïques mais crédibles ;
- défenses lisibles ;
- silhouette différente du simple cochon de ferme ;
- matériaux mats ;
- peu de micro-détails ;
- rig quadrupède propre requis avant production.

## M1 — Gelée runique du Val

But : premier monstre explicitement Orvalis.

Direction :
- masse translucide stylisée mais pas réaliste ;
- noyau minéral/runique visible ;
- asymétrie légère ;
- formes suffisamment simples pour variantes de couleur/noyau ;
- doit fonctionner avec animation shader + quelques bones ou blendshapes simples.

## M2 — Kit de panneaux routiers Azur

3–5 variantes :
- pierre claire + chêne ;
- petites ferrures bronze ;
- emplacement d'inscriptions runiques discrètes ;
- silhouettes cohérentes avec Havrebleu/Val sans être trop monumentales.

## M3 — Petit sanctuaire de route Azur

Objet récurrent très identifiable :
- socle calcaire ;
- toiture/bois travaillé ;
- niche ou plaque de serment ;
- élément runique discret ;
- variantes intacte/usée/envahie par la végétation.

## M4 — Modules signature Havrebleu

À générer comme **prototypes**, puis normaliser/reconstruire si nécessaire :
- arche portuaire ;
- segment de balustrade ;
- borne de quai ;
- pierre de digue sculptée ;
- petit module de galerie couverte ;
- lampe/enseigne administrative.

Ne PAS tenter de générer « toute Havrebleu » en un modèle.

## M5 — Vieux pont du Val

Si les ponts CC0 paraissent trop génériques :
- calcaire clair ancien ;
- une ou deux arches ;
- réparation visible en bois/pierre plus récente ;
- garde-corps irrégulier ;
- mousse légère ;
- traces de Continuité discrètes.

## M6 — Vieux Moulin signature

Utiliser les moulins CC0 pour greybox seulement si nécessaire.

Le Vieux Moulin final mérite une version Meshy/custom originale car c'est un landmark narratif :
- base de pierre ancienne ;
- volume rural réparé sur plusieurs époques ;
- roue hydraulique plutôt qu'un moulin à vent si le placement final le permet ;
- cave/ancien canal lisible dans la structure ;
- silhouette identifiable à distance.

---

# VII. CE QU'ON NE FAIT PAS AVEC MESHY

Ne pas valider directement comme production :
- corps joueurs ;
- équipement devant fonctionner sur tous les morphs ;
- personnage principal riggé sans inspection ;
- gros bâtiment monobloc pour capitale ;
- asset issu d'une image WoW/Hordes/Aion comme référence ;
- mesh avec squelette arbitraire incompatible avec le contrat Orvalis.

Pour ces cas Meshy = **concept / base de retopo / silhouette**, pas contrat final.

---

# VIII. PREMIER LOT À IMPORTER / REVIEWER

Lot recommandé minimal avant toute acquisition massive :

1. 3–5 arbres feuillus Quaternius ;
2. 3 rochers ;
3. 2 buissons + 2 fleurs + 2 touffes d'herbe ;
4. 1 grange ;
5. 1 petite ferme ;
6. 1 moulin CC0 de greybox ;
7. 1 clôture ;
8. 1 set caisses/tonneaux/sacs ;
9. 1 lanterne ;
10. 1 loup animé ;
11. 1 sanglier Meshy/custom ;
12. 1 gelée runique Meshy/custom ;
13. 1 panneau routier Azur Meshy ;
14. 1 module architectural Azur/Havrebleu custom.

Ce lot suffit à répondre à la question essentielle :

> **Peut-on obtenir dans le navigateur un Val d'Azur dense, lisible et original sans que l'on voie immédiatement de quels packs gratuits viennent les éléments ?**

Si la réponse est oui, élargir le kit. Si non, corriger palette, shaders, proportions et sourcing avant d'importer davantage.

---

# IX. REGISTRE / DROITS

Pour tout asset externe :
- source stable ;
- auteur ;
- licence ;
- date de récupération ;
- fichier local ;
- modifications ;
- statut candidate/vetted/local/normalized/runtime/approved.

Pour Meshy : ajouter :
- prompt exact ;
- seed/id de génération si disponible ;
- plan Free/Paid au moment de génération ;
- attribution requise oui/non ;
- provenance de toute image de référence ;
- étapes de retopo/rig/modification.

Aucune dépendance de production à une URL distante.
