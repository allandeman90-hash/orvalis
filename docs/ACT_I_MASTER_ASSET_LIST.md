# ORVALIS — MASTER ASSET LIST DE PRODUCTION — ACTE I 1–50

Status: **CANON PRODUCTION BLUEPRINT — 2026-10-09**

Ce document dérive les besoins d'assets du lore et de la campagne verrouillés pour l'Acte I 1–50.

Il ne constitue PAS une liste d'achats aveugle. Il fixe :

- ce qui doit exister visuellement au lancement ;
- ce qui peut être réutilisé entre plusieurs régions ;
- ce qui peut provenir d'assets libres/licenciés puis être normalisé ;
- ce qui doit être original/custom parce qu'il porte l'identité d'Orvalis ;
- la priorité de production.

Les assets suivent toujours `docs/ART_ASSET_PIPELINE.md` : candidate → vetted → local → normalized → runtime → approved.

Principe directeur :

> **Construire des familles modulaires cohérentes plutôt qu'accumuler des modèles isolés.**

---

# I. NIVEAUX DE PRIORITÉ

## P0 — INDISPENSABLE AU PREMIER MONDE CRÉDIBLE

Un asset P0 est requis pour rendre une première région de production réellement jouable et représentative du jeu :

- corps personnages contrôlés ;
- terrain/roches/végétation de base ;
- kit architectural de faction ;
- props routiers ;
- créatures courantes ;
- VFX runiques de base ;
- un petit ensemble d'équipement ;
- signalétique/world UI minimale.

## P1 — INDISPENSABLE À L'ACTE I COMPLET

Nécessaire avant une sortie 1–50 :

- toutes les identités régionales ;
- architectures des peuples intelligents ;
- donjons ;
- boss importants ;
- capitales complètes ;
- kits culturels 30–50 ;
- raids ;
- professions visibles ;
- équipement de progression complet.

## P2 — FINITION / VARIATION / PRESTIGE

Important pour éviter la répétition mais peut arriver après le premier passage complet :

- nombreuses variantes décoratives ;
- props rares ;
- objets de festival ;
- variantes cosmétiques ;
- micro-faune ;
- set dressing de luxe ;
- trophées, statues secondaires, clutter supplémentaire.

---

# II. RÈGLE « LIBRE / NORMALISÉ » VS « ORIGINAL ORVALIS »

## Peut partir d'assets CC0 / libres soigneusement sélectionnés

À condition de passer par la normalisation Orvalis :

- arbres génériques ;
- buissons ;
- herbes ;
- rochers ;
- petits tonneaux/caisses/sacs ;
- outils simples ;
- cordages ;
- petites lanternes ;
- mobilier générique ;
- petits bateaux de travail ;
- certaines pièces modulaires de clôture ;
- os, champignons, souches, végétation secondaire ;
- certains animaux naturels non-signatures.

Ils doivent être retraités par : palette, matériaux, vertex colors, échelle, silhouettes, atlases, variations et composition.

## Doit être original/custom Orvalis

- corps joueur et têtes ;
- équipement joueur identifiable ;
- Havrebleu ;
- Forge-Cendre ;
- architecture Graveur / Grand Glyphe ;
- Huit Ordres et leurs symboles ;
- runes et Ancrages ;
- Crapoussins ;
- Kobolds d'Orvalis ;
- Gobelins d'Orvalis ;
- Trolls d'Orvalis ;
- Drakônides ;
- wyrms majeurs ;
- boss de campagne/raid ;
- Mère Vase ;
- monuments principaux ;
- UI iconographique de faction/classe/rune ;
- architectures très spécifiques des nouvelles cultures 30–50.

Ces éléments sont trop identitaires pour ressembler à un asset pack générique.

---

# III. PERSONNAGES JOUEURS — P0/P1

## Base technique minimale

### Corps

- 1 corps masculin original ;
- 1 corps féminin original ;
- squelette partagé compatible avec les animations et équipements ;
- proportions stylisées, lisibles à distance, non-photoréalistes ;
- mains/pieds correctement conçus pour armes/armures ;
- LOD joueur/NPC.

### Personnalisation de lancement

Cible raisonnable, pas infinie :

- 4–6 formes de visage par corps ;
- 8–12 coiffures réutilisables intelligemment ;
- 4–6 barbes/moustaches pour modèles compatibles ;
- plusieurs tons de peau ;
- couleurs de cheveux/yeux ;
- cicatrices/maquillages/tatouages via textures/overlays ;
- morphs légers de corpulence/visage si la pipeline le permet sans casser l'équipement.

### Silhouette des 8 classes

Les classes utilisent le même contrat corporel mais leur équipement doit immédiatement différencier :

- Guerrier ;
- Templier ;
- Mage ;
- Nécromancien ;
- Chasseur ;
- Assassin ;
- Druide ;
- Chaman.

Pas besoin de 8 squelettes différents.

---

# IV. ÉQUIPEMENT JOUEUR — P0/P1

## Emplacements visuels prioritaires

- tête ;
- épaules ;
- torse ;
- gants ;
- ceinture ;
- jambes ;
- bottes ;
- cape ;
- arme main ;
- arme secondaire/bouclier ;
- accessoires visibles exceptionnels.

## Familles d'armure

Minimum lancement :

- tissu ;
- cuir ;
- mailles ;
- plaques.

## Tiers visuels recommandés

Au lieu d'un modèle unique par objet, créer des familles modulaires :

1. **Rudimentaire 1–10** ;
2. **Régional 10–20** ;
3. **Ordres 20–30** ;
4. **Hors-Noyau 30–40** ;
5. **Ascendant 40–50** ;
6. **Endgame 50**.

Chaque famille peut contenir 2–4 silhouettes principales + variantes matériaux/couleurs.

## Armes

Familles nécessaires :

- épée 1M ;
- épée 2M ;
- hache 1M ;
- hache 2M ;
- masse 1M ;
- masse 2M ;
- dague ;
- lance/polearm ;
- arc ;
- arbalète si maintenue gameplay ;
- bâton ;
- sceptre/focus ;
- bouclier ;
- arme chamanique/totem portable si utile ;
- faux/arme nécromantique uniquement comme esthétique, pas comme nouvelle catégorie obligatoire.

## Ancrages runiques

Original Orvalis obligatoire :

- socket visible discret ;
- version active ;
- version surchargée ;
- version endgame ;
- 8 familles visuelles reliées aux types de runes sans imposer une couleur fluo permanente.

---

# V. KIT MONDE PARTAGÉ — P0

Ces familles doivent servir plusieurs régions.

## Roches et falaises

Créer/normaliser environ :

- 6–8 rochers génériques ;
- 4 formations verticales ;
- 4 blocs/falaises modulaires ;
- 3 arches naturelles ;
- 3 éboulis/talus ;
- 2–3 gros hero rocks.

Le même mesh peut recevoir plusieurs familles de matériaux :

- calcaire clair ;
- grès rouge ;
- basalte ;
- roche humide/moussue ;
- pierre gelée ;
- obsidienne ;
- silex/verre.

## Terrain textures

Base commune :

- herbe douce ;
- herbe sèche ;
- terre ;
- boue ;
- sable ;
- gravier ;
- route tassée ;
- roche claire ;
- roche rouge ;
- roche sombre ;
- neige ;
- glace ;
- cendre ;
- scorie ;
- mousse ;
- sol forestier ;
- marais ;
- verre/silex fissuré ;
- pierre Graveur.

Le moteur 4-layer doit permettre des compositions régionales à partir de cette bibliothèque plutôt que créer une texture unique par chunk.

## Végétation partagée

Familles de base :

- chêne/feuillu tempéré ;
- pin/conifère ;
- arbre sec/torsadé ;
- arbre marécageux ;
- arbre forestier ancien massif ;
- arbuste tempéré ;
- arbuste sec ;
- roseaux ;
- fougères ;
- graminées ;
- fleurs ;
- champignons ;
- lianes/racines ;
- algues/plantes aquatiques.

Chaque famille doit viser 3–5 silhouettes + variation runtime de taille/rotation/teinte.

---

# VI. PROPS PARTAGÉS — P0/P1

## Route et voyage

- panneaux directionnels ;
- bornes ;
- poteaux ;
- pont bois ;
- pont pierre ;
- passerelle ;
- corde/barrière ;
- chariot ;
- charrette ;
- roue cassée ;
- sacoche ;
- feu de camp ;
- tente ;
- petit auvent ;
- banc ;
- coffre ;
- caisse ;
- tonneau ;
- sacs ;
- pile de bois.

## Artisanat

- forge ;
- enclume ;
- établi ;
- métier à tisser ;
- table d'alchimie ;
- mortier ;
- rack d'armes ;
- chevalet/cuir ;
- table runiste ;
- étal de marché ;
- paniers ;
- outils miniers ;
- outils agricoles ;
- filets/pêche.

## Monde habité

- table/chaises ;
- lits ;
- étagères ;
- coffres ;
- vaisselle ;
- jarres ;
- tissus suspendus ;
- lanternes ;
- bougies ;
- drapeaux ;
- cordes à linge ;
- panneaux d'auberge ;
- cages ;
- râteliers ;
- livres/parchemins ;
- cartes ;
- statues secondaires.

Les props doivent partager des atlases par culture lorsque possible.

---

# VII. KITS ARCHITECTURAUX MAJEURS

## A. AZUR / HAVREBLEU — P0/P1

### Modules

- mur pierre claire ;
- angle ;
- arche ;
- pilier ;
- fenêtre ;
- porte ;
- galerie couverte ;
- balcon ;
- escaliers ;
- pont ;
- parapet ;
- toiture ardoise/bleu-gris ;
- poutres chêne ;
- petites maisons ;
- entrepôts ;
- bâtiments administratifs ;
- tours ;
- quais ;
- digues ;
- canaux/bassins.

### Hero assets originaux

- les Deux Phares ;
- Flèche/complexe des Archives ;
- Porte Sans Couronne ;
- Pont des Noms ;
- portions de vieille ville noyée ;
- grande silhouette portuaire de Havrebleu.

## B. BRAISE / FORGE-CENDRE — P0/P1

### Modules

- mur grès rouge ;
- basalte ;
- arches robustes ;
- plateformes ;
- ponts métalliques/bois ;
- escaliers extérieurs ;
- terrasses ;
- auvents ;
- citernes ;
- cheminées ;
- conduits ;
- grues ;
- ateliers ouverts ;
- forges ;
- logements imbriqués ;
- structures accrochées aux mesas.

### Hero assets originaux

- Salle des Feux ;
- grande forge centrale ;
- skyline verticale de Forge-Cendre ;
- foyers mémoriels / Cendre des Noms ;
- fractures géothermiques aménagées.

## C. ANCIEN ORVALIS / VALCŒUR — P1

- avenue monumentale ;
- bâtiments civils blancs ;
- tours brisées ;
- statues royales ;
- arches ;
- places ;
- cryptes ;
- catacombes ;
- canaux ;
- murs effondrés ;
- mosaïques ;
- mobilier royal abîmé ;
- architecture funéraire.

Doit pouvoir exister en trois états : intact/ancien, ruiné, contradiction runique.

## D. GRAVEURS / GRAND GLYPHE — P1 ORIGINAL OBLIGATOIRE

C'est l'une des signatures visuelles majeures d'Orvalis.

Créer une grammaire modulaire complète :

- sol gravé ;
- murs à inscriptions ;
- piliers ;
- portes sans charnières visibles ;
- ponts ;
- consoles ;
- canaux énergétiques ;
- chambres circulaires ;
- anneaux ;
- nœuds ;
- conduites ;
- dispositifs de confinement ;
- mécanismes de synchronisation ;
- grandes salles de maintenance.

Style : ancien, précis, monumental, non-sci-fi. La technologie doit être lisible comme architecture runique, pas comme laboratoire futuriste néon.

## E. NACREBRUME — P1

- quais bois/pierre ;
- maisons portuaires enduites ;
- toits salins/tuiles ;
- passerelles ;
- pieux ;
- petits phares ;
- entrepôts marins ;
- tavernes ;
- bateaux courts ;
- voiles ;
- cordages ;
- casiers/filets ;
- structures sur récifs.

Hero assets :

- Port-Nacré ;
- Phare des Marées Muettes ;
- Crique des Sans-Bannière.

## F. SILEX / MARCHES DE VERRE — P1

- murs de pierre sèche ;
- tours routières ;
- citernes ;
- relais caravaniers ;
- terrasses rocheuses ;
- auvents lourds ;
- architecture plateau/fort ;
- structures contre vents/sable ;
- verre naturel intégré dans maçonnerie.

Hero assets :

- Halte du Dernier Convoi ;
- Fort de la Route Brisée ;
- Haut-Silex ;
- monuments du convoi.

## G. RELAIS SEPT / SOUS-TRAME — P1

Mélange contrôlé : architecture Graveur + occupation moderne.

Ajouter :

- passerelles contemporaines fixées sur structure ancienne ;
- échafaudages ;
- tentes ;
- ateliers ;
- plateformes commerciales ;
- ascenseurs ;
- rails ;
- pompes ;
- éclairage suspendu ;
- jardins souterrains.

Hero assets :

- Relais Sept ;
- Ponts du Dessous ;
- Atelier des Formes ;
- Chambre des Mesures.

## H. ORÉE — P1

Doit paraître internationale et non une troisième faction monolithique.

Kit fondamental :

- architecture publique neutre ;
- halls diplomatiques ;
- appartements/maisons multi-culturels ;
- marchés ;
- tribunaux ;
- passerelles ;
- bibliothèques ;
- prisons runiques ;
- places publiques ;
- panneaux multilingues/symboliques.

Hero assets :

- Cités d'Orée ;
- Prison des Ancrés ;
- Bibliothèque des Noms Absents ;
- infrastructures de la Confluence.

---

# VIII. IDENTITÉ ENVIRONNEMENTALE PAR RÉGION

## 1. Val d'Azur

Réutilise : feuillus, prairie, pierre claire, kit rural Azur.

Uniquement requis :

- moulin ;
- fermes/granges ;
- vergers ;
- vieux pont ;
- murs agricoles ;
- pierres levées ;
- routes anciennes rémanentes ;
- falaises côtières.

Hero shot obligatoire : route/champs/pont/moulin/Havrebleu à l'horizon.

## 2. Terres de Braise

Réutilise : roches rouges, arbres secs, kit Braise.

Unique :

- oasis ;
- fissures géothermiques ;
- petites cheminées naturelles ;
- caravanes ;
- Rougeverre ;
- structures de mesa.

## 3. Bois-Murmure

Unique fort :

- arbres anciens très massifs ;
- racines arches ;
- troncs creux ;
- plateformes forestières ;
- pierres mémorielles ;
- silhouettes/pollen mémoire ;
- Souche-Creuse.

## 4. Canyon des Scories

Réutilise : roche rouge/noire, props miniers.

Unique :

- falaises stratifiées ;
- ponts suspendus ;
- ascenseurs miniers ;
- rails verticaux ;
- entrées de galerie multiples ;
- Fouille-Suie ;
- manifestations visuelles du Battement.

## 5. Marais de Vasegrise

- arbres marécageux ;
- roseaux ;
- plateformes/pilotis ;
- pontons ;
- barques ;
- eau trouble ;
- brume ;
- Dômes Noyés ;
- Bourg-Crapoussin ;
- sanctuaires de mémoire ;
- habitat des Gens des Roseaux.

## 6. Cœur d'Orvalis

- kit Valcœur ruiné ;
- rues blanches brisées ;
- lignes du Glyphe sous pavés ;
- statues ;
- bastion ;
- crypte ;
- Jardins du Dernier Jour ;
- effets de Contradiction ;
- silhouettes d'états passés superposés.

## 7. Pics Gelés

- roches neige ;
- glace ;
- pins ;
- cabanes/refuges ;
- routes trolles ;
- lac transparent ;
- chariots/ruines gelés sous glace ;
- citadelle prise dans glacier.

## 8. Désolation Cendrée

- obsidienne ;
- basalte ;
- lave ;
- fumée ;
- cendre ;
- campements résistants au feu ;
- Refuge Sans-Écaille ;
- caldeira ;
- forge drakônide.

## 9. Cime des Tempêtes

- roches hautes ;
- neige résiduelle ponctuelle ;
- nuages sous le joueur ;
- ponts du ciel ;
- Autel ;
- milliers de plaques de serment ;
- pylônes/structures Graveurs ;
- Sanctuaire visible dans la tempête.

## 10. Nacrebrume

- récifs ;
- falaises océaniques ;
- petites plages ;
- végétation saline ;
- ports ;
- bateaux ;
- ruines noyées ;
- brouillard marin ;
- balises anciennes.

## 11. Marches de Verre

- plateaux secs ;
- dunes pierreuses ;
- surfaces vitrifiées ;
- éclats de verre géants ;
- routes caravanières ;
- forts ;
- citernes ;
- ruines du convoi ;
- Haut-Silex.

## 12. Sous-Trame

- halls Graveurs monumentaux ;
- gouffres ;
- ponts ;
- lacs souterrains ;
- champignons/plantes pâles ;
- cascades ;
- machines runiques ;
- occupation multiculturelle moderne.

## 13. Territoires d'Orée

- plaines/hauteurs de transition ;
- ville internationale ;
- Lisière Blanche visuellement simplifiée ;
- Confluence riche en lignes runiques croisées ;
- architecture civile neutre ;
- dispositifs de contrôle d'Ascendants ;
- Possibles Brisés via variantes de la même scène plutôt qu'une nouvelle région entière.

---

# IX. PEUPLES INTELLIGENTS — P1 ORIGINAL

## Gobelins

Besoin :

- base adulte ;
- 2–3 silhouettes/corpulences ;
- marchand ;
- récupérateur ;
- mystique ;
- combattant ;
- chef ;
- vêtements modulaires ;
- props de récupération ;
- architecture Souche-Creuse.

## Kobolds

- base adulte ;
- mineur ;
- dynamiteur ;
- ancien ;
- marchand ;
- contremaître ;
- équipement minier ;
- bougies/cire ;
- architecture Fouille-Suie.

## Crapoussins

- base adulte ;
- guerrier ;
- sorcier/mémoire ;
- pêcheur ;
- porte-parole ;
- gardien ;
- enfant/têtard si nécessaire visuellement ;
- architecture sur pilotis ;
- objets de chant/mémoire.

## Trolls

- base adulte ;
- voyageur ;
- guerrier ;
- ancien ;
- jarl ;
- fourrures/ornements ;
- refuges de montagne ;
- totems de route non religieux génériques.

## Drakônides

- base humanoïde draconique ;
- Cendres-Liées ;
- Forgés ;
- Sans-Écaille ;
- combattant ;
- caster ;
- artisan ;
- dissident ;
- armure/armes propres ;
- architecture du Creuset et Refuge.

---

# X. CRÉATURES DU MONDE — FAMILLES

## Naturelles / réutilisables avec variantes

- loup ;
- sanglier ;
- ours ;
- hyène ;
- vautour ;
- scorpion ;
- crocodile ;
- chauve-souris ;
- araignée ;
- sangsue ;
- yéti ;
- rapace marin ;
- crustacé/récif ;
- serpent/lézard sec ;
- faune de grotte.

## Fantastiques génériques Orvalis

- gelée Continuité ;
- gelée Braise ;
- élémentaire de givre ;
- élémentaire de feu ;
- élémentaire de foudre ;
- golem scories ;
- golem obsidienne ;
- gardien runique ;
- gargouille ;
- squelettes/morts de Contradiction ;
- spectres ;
- sylvains mémoire ;
- feux-follets ;
- anomalies de verre ;
- anomalies de Confluence.

## Signatures originales

- Mère Vase ;
- Tisseuse ;
- Ondrakis ;
- Hjarnok ;
- Vyrmathra ;
- Azhkar ;
- Vortharion ;
- Nyxaroth Incarnation ;
- créatures majeures des raids 50.

---

# XI. DONJONS — KITS VISUELS

Chaque donjon doit réutiliser la bibliothèque régionale tout en ayant 2–4 hero assets impossibles à confondre avec le monde extérieur.

## 1. Mèchenoire

- mine kobolde ;
- équipement forage ;
- chambre Graveur ;
- piliers de confinement ;
- Colosse.

## 2. Sanctuaire Englouti

- pierre humide ;
- vannes ;
- canaux ;
- autels Crapoussins récents ;
- bassin Ondrakis.

## 3. Catacombes

- cryptes Valcœur ;
- prisons ;
- archives funéraires ;
- salle Morvhal ;
- porte Graveur `INACHEVÉ`.

## 4. Givre-Écaille

- forteresse gelée ;
- mécanismes de stase ;
- chambres prises dans glace ;
- archives année 0 ;
- antre Hjarnok.

## 5. Creuset Écarlate

- forge drakônide ;
- ligne du Glyphe détournée ;
- enclumes géantes ;
- canaux de lave ;
- chambres Empreinte.

## 6. Phare des Marées Muettes

- phare ancien ;
- mécanismes marins ;
- lentilles/balises ;
- salles partiellement noyées ;
- vue océanique forte.

## 7. Fort de la Route Brisée

- fort routier ;
- archives/logistique ;
- wagons/chariots ;
- défenses ;
- accès maintenance enterré.

## 8. Atelier des Formes

- kit Graveur avancé ;
- chambres de transformation environnementale ;
- plateformes mouvantes ;
- prototypes de formes ;
- dispositifs d'ajustement de matière.

## 9. Prison des Ancrés

- architecture Orée ;
- cellules normales ;
- cellules runiques ;
- dispositifs d'Ancrage ;
- zones administratives ;
- zones de contention abîmées.

## 10. Bibliothèque des Noms Absents

- archives monumentales ;
- rayonnages ;
- tablettes ;
- inscriptions incomplètes ;
- chambres dont certains noms/éléments disparaissent visuellement ;
- accès Neuvième Lecture.

---

# XII. RAIDS — HERO ASSETS

## Sanctuaire des Tempêtes

Original :

- plateforme céleste ;
- noyau de redistribution ;
- grands anneaux ;
- ponts aériens ;
- console neuf nœuds ;
- Aëgis ;
- Vharn/Sylk ;
- Sélénia ;
- Vortharion.

## Trône de Cendre-Noire

- cavernes Dissolution ;
- trône ;
- ouverture Informe ;
- ancre Scarnak ;
- Conseil de Cendre ;
- Incarnation Nyxaroth.

## Conclave Brisé

- grand hall international ;
- plateforme de contrôle des Ascendants ;
- dispositifs de synchronisation ;
- plusieurs états de la salle pendant la crise ;
- boss politiques/runologiques originaux.

## Chambre de la Neuvième Lecture

Doit être l'un des environnements les plus identitaires du lancement :

- huit structures périphériques ;
- relation centrale invisible puis révélée ;
- sol montrant plusieurs écritures compatibles/incompatibles ;
- espace capable de changer sans devenir du sci-fi ;
- architecture Graveur à son plus haut niveau de sophistication ;
- effets de synchronisation forcée ;
- état final stabilisé mais non uniformisé.

---

# XIII. VFX — P0/P1

## Runes

- apparition rune ;
- fusion 3→1 ;
- socket ;
- activation passive ;
- montée de rang ;
- saturation normale ;
- absence de saturation Ascendant ;
- Rune Impossible ;
- ligne du Grand Glyphe ;
- Battement.

## 8 grammaires de classe

Chaque classe doit avoir une signature VFX lisible mais appartenir au même monde :

- Lame-Grise : contraintes/impacts/stabilité ;
- Aube : cohérence/lumière structurée ;
- Astrelune : notation/figures ;
- Dernier Souffle : résidu/Empreinte ;
- Traque : liens/traces ;
- Main Silencieuse : lacunes/angles morts ;
- Anciens : croissance/mémoire vivante ;
- Orage : tensions matière/énergie.

Éviter huit palettes néon totalement indépendantes.

## Régionaux

- Continuité : réapparition de formes ;
- Transformation : chaleur/couleur/minéral changeant ;
- Mémoire : silhouettes pollen/sons/empreintes ;
- Profondeur : pulsation/strates ;
- Frontière : eau/matière mêlées ;
- Contradiction : double état ;
- Immobilité : stase/glace figée ;
- Dissolution : matière qui se simplifie/cendre ;
- Potentiel : tension électrique/équilibrage.

---

# XIV. UI / SIGNALÉTIQUE MONDE — P1

Même si l'UI complète est un autre chantier, les besoins d'art doivent être anticipés :

- icônes 8 classes ;
- icônes 8 Grandes Runes/Sceaux ;
- icônes types de runes ;
- Pacte d'Azur ;
- Clans de Braise ;
- Ligue de Silex ;
- Sans-Bannière ;
- Ordres ;
- Voilés ;
- Cendres-Liées ;
- symboles peuple/settlement utiles ;
- panneaux routiers ;
- bannières ;
- plaques de serment ;
- enseignes de professions ;
- symboles donjons/raids ;
- marqueurs de danger runique.

Le monde doit utiliser ses propres symboles physiquement, pas seulement dans l'interface HUD.

---

# XV. EAU / CIEL / ATMOSPHÈRE

## Eau

Familles visuelles :

- rivière claire ;
- mer ;
- marais ;
- lac gelé ;
- eau souterraine ;
- eau de Nacrebrume ;
- lave ;
- canaux runiques.

## Ciel / fog profiles

Prévoir profils de rendu plutôt que textures uniques pour chaque zone :

- tempéré clair ;
- sec poussiéreux ;
- forêt humide ;
- marais brumeux ;
- neige ;
- cendre volcanique ;
- tempête haute altitude ;
- mer/brume saline ;
- sous-terrain ;
- Orée instable.

---

# XVI. BUDGET DE FAMILLES — CIBLE DE PRODUCTION

Ces chiffres sont des ordres de grandeur pour empêcher l'explosion du scope, pas des quotas rigides.

## Environnement générique

- 20–30 meshes roche/falaise réellement réutilisables ;
- 25–35 végétaux de base + variantes runtime ;
- 50–80 props génériques bien atlasés ;
- 15–25 props de métiers ;
- 10–15 véhicules/bateaux/chariots simples.

## Architecture

- 6–8 grands kits modulaires : Azur, Braise, ancien Orvalis, Graveur, Nacre, Silex, Orée, peuple spécifique lorsque nécessaire ;
- 8–15 modules structuraux par kit au minimum ;
- 3–6 hero buildings par culture majeure, beaucoup moins pour cultures secondaires.

## Créatures

- ~15 familles animales naturelles ;
- ~12–18 familles fantastiques réutilisables ;
- 5 peuples intelligents non humains principaux ;
- boss/raids traités individuellement.

## Personnage/équipement

- 2 corps contrôlés ;
- personnalisation modulaire ;
- 4 familles d'armure de base ;
- 6 paliers visuels de progression ;
- bibliothèque d'armes partagée ;
- 8 signatures d'Ordre.

Cette approche produit beaucoup plus de diversité apparente que des centaines de modèles sans cohérence.

---

# XVII. PREMIER « VERTICAL SLICE » DE PRODUCTION

La liste complète ne doit PAS être importée d'un coup.

Le premier paquet de production recommandé est :

## Slice A — Val d'Azur + bord de Havrebleu

### Assets P0

- corps joueur M/F ;
- un set équipement léger + un set lourd provisoires de production ;
- chêne/feuillus ;
- buissons/herbe/fleurs ;
- rochers calcaire ;
- terrain herbe/terre/route/roche ;
- ferme modulaire ;
- grange ;
- clôtures ;
- vieux pont ;
- moulin ;
- panneaux/lanternes/charrette ;
- loup ;
- sanglier ;
- gelée ;
- quelques PNJ civils ;
- premier petit kit Azur ;
- silhouette/portes périphériques de Havrebleu ;
- VFX rune de base.

### Pourquoi ce slice

Il permet de juger simultanément :

- terrain ;
- végétation dense ;
- architecture ;
- personnages ;
- équipement ;
- créatures ;
- route ;
- landmark ;
- vue capitale ;
- identité Orvalis.

Si ce slice ne ressemble pas au jeu voulu, il faut corriger la direction avant d'importer les 12 autres régions.

---

# XVIII. ORDRE D'ACQUISITION / CRÉATION APRÈS LE SLICE

1. **Val + Azur seed kit** ;
2. **Terres + Braise seed kit** pour prouver un biome opposé ;
3. **personnages/équipement/8 classes** ;
4. **Bois + Canyon** pour densité verticale ;
5. **Marais + peuples intelligents** ;
6. **Cœur + ancien Orvalis + Graveur** ;
7. **Pics / Désolation / Cime** ;
8. **Nacre / Silex / Sous-Trame / Orée** ;
9. **donjons** en réutilisant les kits régionaux ;
10. **raids et boss signatures** ;
11. finition P2 et variations cosmétiques.

Ce séquencement évite de chercher immédiatement tous les assets du jeu.

---

# XIX. RÈGLE DE VALIDATION VISUELLE

Un kit régional n'est pas approuvé parce que ses modèles sont individuellement beaux.

Il est approuvé seulement si une scène intégrée montre :

- identité immédiate sans UI ;
- silhouette lisible ;
- densité suffisante ;
- matériaux cohérents ;
- performance compatible navigateur ;
- architecture et props issus du lore ;
- absence de sensation « collage de plusieurs asset packs ».

Test simple :

> **Si une capture d'écran sans HUD ne permet pas de reconnaître la région, le kit n'est pas assez spécifique.**

---

# XX. LIVRABLE PRODUIT PAR CETTE LISTE

Cette Master Asset List autorise maintenant deux travaux qui étaient volontairement bloqués :

1. construire le **plan technique de cartes/streaming** de l'Acte I ;
2. reprendre **A0.1/A0.2 acquisition et review d'assets** en cherchant seulement les familles utiles au premier vertical slice, au lieu de télécharger des packs au hasard.

La production ne doit toujours pas chercher tous les assets simultanément.

Le prochain objectif visuel concret est :

> **rendre le Val d'Azur + bord de Havrebleu assez crédibles pour servir de référence artistique intégrée au reste du jeu.**
