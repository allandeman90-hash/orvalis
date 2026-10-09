# ORVALIS — SLICE A ASSET SOURCING

Status: **PRODUCTION SOURCING BLUEPRINT — 2026-10-09**

Scope: **Val d'Azur + bord de Havrebleu uniquement**.

Ce document ne remplace pas `ACT_I_MASTER_ASSET_LIST.md`. Il transforme le besoin du premier vertical slice en stratégie d'acquisition concrète.

Principe :

> **Ne pas remplir Orvalis avec un seul asset pack. Priorité absolue à la bibliothèque gratuite Meshy, inspectée visuellement via navigateur et recherchée par tags + descriptions ; compléter ensuite avec CC0/free externes ; générer du custom seulement si un besoin reste réellement vide.**

---

# 0. CONTRAT VISUEL + BUDGET GÉOMÉTRIQUE — VERROUILLÉ

Direction artistique globale :
- stylisé / cartoon MMO ;
- formes lisibles à distance ;
- proportions légèrement exagérées quand cela aide la silhouette ;
- surfaces propres, peintes ou semi-stylisées ;
- détails lisibles plutôt que micro-détails réalistes ;
- **pas de photoréalisme comme direction de production**.

Budget géométrique par asset :
- **~15 000 triangles** = cible de base pour la majorité des props, végétation, créatures communes et modules ;
- **jusqu'à ~50 000 triangles** = asset important / hero / personnage ou objet vu souvent et de près ;
- **100 000 triangles maximum** = exceptionnel, uniquement quand le gain visuel est réellement nécessaire et justifié ;
- au-delà = rejet ou simplification obligatoire pour le runtime web.

Le nombre affiché par Meshy peut être en faces/quads plutôt qu'en triangles : mesurer le GLB final avant validation runtime.

La silhouette, le nombre d'instances simultanées, les matériaux, textures, bones et draw calls comptent autant que le simple polycount.

---

# I. ORDRE D'ACQUISITION — MESHY GRATUIT D'ABORD

Pour **chaque besoin** de la Master Asset List :

1. rechercher d'abord dans la bibliothèque **gratuite Meshy** ;
2. exploiter les **tags et la description/prompt**, pas seulement le titre ;
3. utiliser plusieurs synonymes anglais liés au rôle, au matériau, à la silhouette et au style ;
4. ouvrir les meilleurs résultats dans un navigateur dynamique et **inspecter réellement le preview / viewer 3D** ;
5. relever titre, URL, auteur, licence, tags, description, topologie, faces/vertices visibles et rôle potentiel ;
6. classer `APPROVED`, `MAYBE` ou `REJECT` ;
7. ajouter chaque candidat au registre central avant téléchargement ;
8. seulement si aucun asset gratuit satisfaisant n'existe : chercher Quaternius / Poly Pizza / Kenney / autres CC0 ;
9. seulement après ces deux passes : générer un nouvel asset Meshy custom.

### Exemple de vocabulaire de recherche

Maison rurale : `medieval`, `fantasy`, `stylized`, `cartoon`, `low poly`, `game asset`, `cottage`, `farmhouse`, `village`, `timber`, `stone`, `slate`.

Arbre : `tree`, `oak`, `deciduous`, `stylized`, `lowpoly`, `nature`, `environment`, `game asset`, `hand painted`.

Props : combiner rôle + matériau + style, par ex. `handcart wooden medieval stylized game asset`.

Ne jamais accepter un asset parce que son **nom** semble correct : la validation est visuelle.

---

# II. TROIS VOIES DE PRODUCTION

## A — MESHY FREE LIBRARY — PRIORITÉ 1

Usage : tout asset gratuit qui satisfait visuellement et techniquement le besoin.

Avantages :
- immense bibliothèque ;
- preview 3D inspectable ;
- tags / descriptions / prompts utiles ;
- GLB et formats de jeu disponibles sur de nombreux modèles ;
- de nombreux assets stylisés/game-ready déjà proches d'Orvalis.

Règle : les résultats Meshy mentionnant explicitement une IP tierce dans leur prompt/titre (`World of Warcraft`, etc.) ne sont pas prioritaires et ne doivent pas devenir une dépendance identitaire d'Orvalis. Préférer les assets génériques/originaux équivalents.

## B — CC0 / FREE EXTERNE — PRIORITÉ 2

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

## C — MESHY CUSTOM / ORIGINAL CONTROLLED — PRIORITÉ 3

À utiliser uniquement lorsque la bibliothèque gratuite + sources CC0 ne suffisent pas.

Usage potentiel :
- objets visuellement spécifiques à Orvalis ;
- variantes d'architecture Azur ;
- éléments runiques ;
- statues ;
- monuments secondaires ;
- créatures simples originales ;
- props héroïques ;
- pièces de décor qui doivent éviter le look « asset pack reconnaissable ».

Règle de provenance : chaque génération conserve prompt, date, plan Meshy utilisé, éventuelle référence d'entrée et preuve que cette référence est originale/licenciée.

Pour les corps joueurs, rigs, topologies de transmog et équipements signature, Meshy peut aider à explorer mais un mesh brut généré n'est jamais automatiquement le contrat de production.

---

# III. SHORTLIST CC0 — NATURE DU VAL

## 1. Quaternius — Ultimate Stylized Nature Pack

Source : https://quaternius.com/packs/ultimatestylizednature.html
Licence : **CC0**
Formats : FBX / OBJ / glTF / Blend
Contenu : 60+ assets nature, arbres, herbes, fleurs, rochers, textures/normal maps.

Décision : **P0 FALLBACK/COMPLEMENT**, après recherche Meshy gratuite.

## 2. Quaternius — Stylized Nature MegaKit

Source : https://quaternius.com/packs/stylizednaturemegakit.html
Licence : **CC0**
Formats : FBX / OBJ / glTF
Contenu : 110+ modèles, dont environ 40 arbres, 35 plantes/fleurs, 27 rochers.

Décision : **P1 FALLBACK / VARIATION**.

## 3. Kenney — Nature Kit

Source : https://kenney.nl/assets/nature-kit
Licence : **CC0**
Contenu : 330 fichiers 3D.

Décision : **P1 FALLBACK / VARIATION**.

---

# IV. SHORTLIST CC0 — FERME / VILLAGE

## 4. Quaternius — Farm Buildings Pack / Bundle

Sources :
- https://quaternius.com/packs/farmbuildings.html
- https://poly.pizza/bundle/Farm-Buildings-Bundle-ppbnhEfNEt

Licence : **CC0**
Formats disponibles : FBX / GLB (bundle Poly Pizza), FBX / OBJ / Blend côté Quaternius.

Contenu : clôtures, silos, granges, poulailler, plusieurs barns, Tower Windmill.

Décision : **fallback après Meshy free audit**.

## 5. Quaternius — Medieval Village MegaKit

Source : https://quaternius.com/packs/medievalvillagemegakit.html
Licence : **CC0**
Formats : FBX / OBJ / glTF
Contenu : 300+ pièces modulaires, murs, sols, escaliers, toits, portes, fenêtres, végétation grimpante, collisions dans les versions source.

Décision : **fallback / base modulaire si Meshy ne couvre pas assez de modules cohérents**.

## 6. Kenney — Fantasy Town Kit

Source : https://kenney.nl/assets/fantasy-town-kit
Licence : **CC0**
Contenu : 160 fichiers 3D.

Décision : **alternative style test uniquement**.

---

# V. SHORTLIST CC0 — PROPS

## 7. Quaternius — Fantasy Props MegaKit

Source : https://quaternius.com/packs/fantasypropsmegakit.html
Licence : **CC0**
Formats : FBX / OBJ / glTF / Blend
Contenu : 200+ props.

Décision : **fallback/complement** après Meshy free.

## 8. Kay Lousberg — Lantern

Déjà dans `art-review-registry.json`.
Source : https://poly.pizza/m/CtHBJ1ufeW
Licence : **CC0**

Décision : conserver comme contrôle de compatibilité inter-auteur.

---

# VI. SHORTLIST CC0 — ANIMAUX / CREATURES COMMUNES

## 9. Quaternius — Animated Animal Pack

Source : https://poly.pizza/bundle/Animated-Animal-Pack-ILAPXeUYiS
Licence : **CC0**
Formats : FBX / glTF

Contenu : Cow, Donkey, Deer, Alpaca, Bull, Fox, Shiba Inu, Stag, Husky, Wolf, White Horse, Horse ; plus de 12 animations par animal dans le pack d'origine.

Décision : **fort fallback pour Wolf/animaux**, car l'animation peut valoir plus qu'un meilleur mesh statique gratuit.

## 10. Quaternius — Farm Animal Pack

Source : https://poly.pizza/bundle/Farm-Animal-Pack-1kUvRTPLzT
Licence : **CC0**
Formats : FBX / GLTF

Décision : P1 ambiance agricole.

---

# VII. MESHY CUSTOM — UNIQUEMENT SI LE GRATUIT ÉCHOUE

Besoins potentiels :
- Sanglier du Val ;
- Gelée runique ;
- panneaux routiers Azur ;
- petit sanctuaire de route Azur ;
- modules signature Havrebleu ;
- Vieux pont ;
- Vieux Moulin.

Avant génération de chacun : faire une recherche gratuite dédiée avec tags/descriptions et enregistrer la preuve qu'aucun candidat n'est suffisamment bon.

---

# VIII. CE QU'ON NE VALIDE PAS DIRECTEMENT

Ne pas valider automatiquement comme production :
- photoréalisme ;
- asset trop détaillé sans justification ;
- corps joueur ou équipement multi-morph sans inspection rig/topologie ;
- personnage principal riggé sans inspection de toutes les animations ;
- gros bâtiment monobloc pour capitale ;
- asset issu d'une image d'IP protégée comme référence ;
- mesh avec squelette arbitraire incompatible avec Orvalis.

---

# IX. PREMIER LOT À REVIEWER

Priorité actuelle dans la bibliothèque gratuite Meshy :
1. arbres feuillus / chênes ;
2. rochers calcaires / mossy rocks ;
3. buissons / fleurs / herbes ;
4. grange / ferme / petite maison ;
5. moulin ;
6. clôtures / murs bas ;
7. charrette / handcart ;
8. caisses / tonneaux / sacs ;
9. lanterne / lamp post ;
10. loup / sanglier ;
11. pont ;
12. premiers modules pierre/bois compatibles Azur.

Chaque candidat doit recevoir un verdict explicite.

---

# X. REGISTRE / DROITS

Pour tout asset :
- ID stable ;
- rôle Orvalis ;
- titre ;
- URL source ;
- auteur ;
- licence ;
- tags ;
- résumé description/prompt ;
- topologie ;
- faces / vertices affichés ;
- triangles réels après téléchargement ;
- textures / matériaux ;
- animations ;
- verdict visuel ;
- raison ;
- statut candidate/vetted/local/normalized/runtime/approved ;
- chemin local ;
- modifications.

Pour Meshy custom ajouter prompt exact, seed/id, plan, provenance des références et étapes de retopo/rig/modification.

Aucune dépendance de production à une URL distante.
