# Couverture de la refonte

Les statuts distinguent intégration, tests automatiques et appréciation artistique. « Testé » ne signifie pas finition artistique approuvée.

## Régions

| Région | Spawns définis | Contrôle | Capture |
|---|---:|---|---|
| val | 524 | Visite, zone correcte | [Voir](../validation/refit/val.png) |
| terres | 515 | Visite, zone correcte | [Voir](../validation/refit/terres.png) |
| bois | 462 | Visite, zone correcte | [Voir](../validation/refit/bois.png) |
| canyon | 474 | Visite, zone correcte | [Voir](../validation/refit/canyon.png) |
| marais | 480 | Visite, zone correcte | [Voir](../validation/refit/marais.png) |
| coeur | 458 | Visite, zone correcte | [Voir](../validation/refit/coeur.png) |
| pics | 439 | Visite, zone correcte | [Voir](../validation/refit/pics.png) |
| desolation | 408 | Visite, zone correcte | [Voir](../validation/refit/desolation.png) |
| cime | 339 | Visite, zone correcte | [Voir](../validation/refit/cime.png) |

## Instances

| Instance | Contrôle | Capture |
|---|---|---|
| meche | Entrée, sortie, espace instance ; 34 ennemis et 3 boss terminés | [Voir](../validation/refit/instance_meche.png) |
| englouti | Entrée, sortie, espace instance | [Voir](../validation/refit/instance_englouti.png) |
| catacombes | Entrée, sortie, espace instance | [Voir](../validation/refit/instance_catacombes.png) |
| givre | Entrée, sortie, espace instance | [Voir](../validation/refit/instance_givre.png) |
| creuset | Entrée, sortie, espace instance | [Voir](../validation/refit/instance_creuset.png) |
| tempetes | Entrée, sortie, espace instance | [Voir](../validation/refit/instance_tempetes.png) |
| cendre | Entrée, sortie, espace instance | [Voir](../validation/refit/instance_cendre.png) |
| abime | Entrée, sortie, espace instance | [Voir](../validation/refit/instance_abime.png) |

## Systèmes

| Domaine | Ressources et état | Preuve / limite |
|---|---|---|
| Terrain | world/terrain.js, world/sectors.js : 4096 m, niveaux de détail | world/results.json ; parcours et captures des 9 régions |
| Routes et activités | data/expeditions.js, zones.js : 27 lieux, 18 quêtes, 43 routes | Pentes de toutes les routes ; une quête d’exploration terminée |
| Végétation | world/trees.js, ground-cover.js, decor.js : géométries courbes, instanciation, 3 LOD arbres | Captures forêt/montagne ; mesures séparées de la vidéo |
| Architecture | world/towns.js et ressources communes : matériaux et identités régionales | Les volumes modulaires des édifices sont conservés et retravaillés ; pas de nouvelle architecture GLB individuelle |
| Personnages | appearance.js, organic.js : huit classes, squelette et équipement | gameplay/results.json ; budgets 16–18 os et 7256–8604 triangles |
| PNJ | npc.js et organic.js : même adaptateur, habits métier | Présents dans visites ; interaction supplémentaire dans peers/results.json |
| Familiers | Bestiaire et modèles partagés ; chasseur | peers/results.json ; pas de combat exhaustif de chaque familier |
| Montures et transformations | entity.js, models.js, organic.js | Montée/déplacement/descente ; ours, félin, poulet animé |
| Équipement | equipment-art.js, models.js | Armes et objets tenus des 8 classes ; remplacement d’arme en inventaire |
| Effets et ciel | game/fx.js, engine/sky.js | Particules douces orientées caméra et nuages ; les télégraphes/runes géométriques restent intentionnels |
| Carte et interface | world/mapgen.js, minimap et style.css | Capture de carte ; 900 × 800 sans débordement ni chevauchement de la barre principale |
| Sauvegarde | game/save.js, data/world-space.js | Migration idempotente, secours initial et rechargement réel |
| GLB | engine/art-pipeline.js, assets/models/wolf-original.glb | Export/rechargement loup : 13 os, 7 clips ; runtime reste procédural |
| Performances | engine/perf.js et validation/final | Mesures absolues, matériel indiqué ; cibles du plan non présumées acquises |

## Catalogue exhaustif des 121 créatures

Chaque entrée a été instanciée deux fois et soumise aux actions, à la mort/réapparition et au contrôle d’indépendance des poses. Les sept planches de `validation/catalogue` exposent le résultat visuel. Certaines variantes partagent fortement leur silhouette : la finition artistique reste à affiner.

| Identifiant | Nom | Famille | Os | Triangles | État |
|---|---|---|---:|---:|---|
| lievre_cornu | Lièvre cornu | quadruped | 13 | 4040 | UV + skin + poses testés |
| loup_pres | Loup des prés | quadruped | 13 | 3944 | UV + skin + poses testés |
| sanglier_roux | Sanglier roux | quadruped | 13 | 4280 | UV + skin + poses testés |
| grignoteur | Grignoteur des champs | quadruped | 13 | 3944 | UV + skin + poses testés |
| gelee_verte | Gelée des champs | blob | 1 | 1024 | UV + skin + poses testés |
| brigand | Brigand du Moulin | humanoid | 15 | 6504 | UV + skin + poses testés |
| brigand_arbaletrier | Brigand arbalétrier | humanoid | 15 | 6312 | UV + skin + poses testés |
| croc_balafre | Croc-Balafré | quadruped | 13 | 4088 | UV + skin + poses testés |
| lezard_sables | Lézard des sables | quadruped | 13 | 3704 | UV + skin + poses testés |
| hyene | Hyène galeuse | quadruped | 13 | 6392 | UV + skin + poses testés |
| scorpion_ocre | Scorpion ocre | insect | 14 | 2832 | UV + skin + poses testés |
| vautour | Vautour charognard | flyer | 3 | 1440 | UV + skin + poses testés |
| gelee_braise | Gelée de braise | blob | 1 | 1024 | UV + skin + poses testés |
| pillard | Pillard des dunes | humanoid | 15 | 6504 | UV + skin + poses testés |
| pillard_lanceur | Pillard lanceur | humanoid | 15 | 6312 | UV + skin + poses testés |
| machoire_fer | Mâchoire-de-Fer | quadruped | 13 | 6392 | UV + skin + poses testés |
| araignee | Araignée sylvestre | insect | 9 | 1920 | UV + skin + poses testés |
| ours | Ours des fougères | quadruped | 13 | 3944 | UV + skin + poses testés |
| gobelin | Gobelin des souches | humanoid | 15 | 5864 | UV + skin + poses testés |
| gobelin_mystique | Gobelin mystique | humanoid | 15 | 6312 | UV + skin + poses testés |
| sylvain | Sylvain corrompu | humanoid | 15 | 6008 | UV + skin + poses testés |
| grincedent | Chef Grincedent | humanoid | 15 | 6696 | UV + skin + poses testés |
| tisseuse | La Tisseuse | insect | 9 | 1920 | UV + skin + poses testés |
| kobold | Kobold fouisseur | humanoid | 16 | 6272 | UV + skin + poses testés |
| kobold_dynamiteur | Kobold dynamiteur | humanoid | 16 | 6040 | UV + skin + poses testés |
| chauve_souris | Chauve-souris des failles | flyer | 3 | 1344 | UV + skin + poses testés |
| salamandre | Salamandre de scories | quadruped | 13 | 4280 | UV + skin + poses testés |
| golem_scories | Golem de scories | humanoid | 15 | 6008 | UV + skin + poses testés |
| grand_meche | Grand-Mèche | humanoid | 16 | 6296 | UV + skin + poses testés |
| coeur_magma | Cœur-de-Magma | humanoid | 15 | 6008 | UV + skin + poses testés |
| crapoussin | Crapoussin guerrier | humanoid | 15 | 5800 | UV + skin + poses testés |
| crapoussin_sorcier | Crapoussin sorcier | humanoid | 15 | 6248 | UV + skin + poses testés |
| crocodile | Crocodile des vases | quadruped | 13 | 4280 | UV + skin + poses testés |
| sangsue | Sangsue géante | worm | 8 | 1344 | UV + skin + poses testés |
| feu_follet | Feu-follet des tourbières | floater | 5 | 768 | UV + skin + poses testés |
| sorciere | Sorcière des tourbières | humanoid | 16 | 6648 | UV + skin + poses testés |
| mere_vase | Mère Vase | quadruped | 10 | 5504 | UV + skin + poses testés |
| squelette | Squelette légionnaire | humanoid | 15 | 6744 | UV + skin + poses testés |
| squelette_archer | Squelette archer | humanoid | 15 | 7000 | UV + skin + poses testés |
| spectre | Spectre errant | humanoid | 10 | 5640 | UV + skin + poses testés |
| gargouille | Gargouille de ruine | humanoid | 17 | 7208 | UV + skin + poses testés |
| chevalier_maudit | Chevalier maudit | humanoid | 16 | 7224 | UV + skin + poses testés |
| ossevaine | Ossevaine, la Reine-Liche | humanoid | 11 | 5848 | UV + skin + poses testés |
| loup_neiges | Loup des neiges | quadruped | 13 | 3944 | UV + skin + poses testés |
| yeti | Yéti des cimes | humanoid | 15 | 6248 | UV + skin + poses testés |
| elementaire_givre | Élémentaire de givre | floater | 6 | 960 | UV + skin + poses testés |
| troll_glaces | Troll des glaces | humanoid | 15 | 5864 | UV + skin + poses testés |
| jarl | Jarl Crocglace | humanoid | 16 | 6504 | UV + skin + poses testés |
| diablotin | Diablotin de cendre | humanoid | 18 | 6872 | UV + skin + poses testés |
| chien_lave | Chien de lave | quadruped | 13 | 4520 | UV + skin + poses testés |
| golem_obsidienne | Golem d'obsidienne | humanoid | 15 | 6008 | UV + skin + poses testés |
| drakonide | Drakônide | humanoid | 18 | 7192 | UV + skin + poses testés |
| vyrmathra | Vyrmathra, Wyrm de Cendre | drake | 20 | 5816 | UV + skin + poses testés |
| harpie | Harpie des orages | humanoid | 15 | 6712 | UV + skin + poses testés |
| elementaire_foudre | Élémentaire de foudre | floater | 6 | 960 | UV + skin + poses testés |
| gardien_runique | Gardien runique | humanoid | 15 | 6008 | UV + skin + poses testés |
| titan | Titan de pierre | humanoid | 15 | 6008 | UV + skin + poses testés |
| azhkar | Azhkar, le Dévoreur d'Orages | drake | 20 | 5816 | UV + skin + poses testés |
| araignee_petite | Rejeton de la Tisseuse | insect | 9 | 1920 | UV + skin + poses testés |
| crapoussin_tetard | Têtard de vase | blob | 1 | 1024 | UV + skin + poses testés |
| squelette_invoque | Squelette relevé | humanoid | 15 | 6744 | UV + skin + poses testés |
| eclair_invoque | Étincelle d'orage | floater | 4 | 576 | UV + skin + poses testés |
| squelette_serviteur | Squelette serviteur | humanoid | 15 | 6744 | UV + skin + poses testés |
| mage_squelette | Mage squelette | humanoid | 15 | 6744 | UV + skin + poses testés |
| loup_chasse | Loup de chasse | quadruped | 13 | 3944 | UV + skin + poses testés |
| loup_esprit | Loup spectral | quadruped | 13 | 3944 | UV + skin + poses testés |
| golem_chair | Golem de chair | humanoid | 15 | 5864 | UV + skin + poses testés |
| voile_adepte | Adepte du Voile | humanoid | 16 | 6504 | UV + skin + poses testés |
| voile_sectateur | Sectateur du Voile | humanoid | 16 | 6696 | UV + skin + poses testés |
| voile_zelote | Zélote du Voile | humanoid | 16 | 6504 | UV + skin + poses testés |
| voile_inquisiteur | Inquisiteur du Voile | humanoid | 16 | 6888 | UV + skin + poses testés |
| traitre_guerrier | Brannoc le Renégat | humanoid | 16 | 6504 | UV + skin + poses testés |
| heraut_guerrier | Varek le Brise-Serment | humanoid | 16 | 6888 | UV + skin + poses testés |
| traitre_templier | Frère Malvert | humanoid | 16 | 6504 | UV + skin + poses testés |
| heraut_templier | Séraphin Cendrelys, l'Aube éteinte | humanoid | 16 | 6888 | UV + skin + poses testés |
| traitre_mage | Corvin le Faussaire | humanoid | 16 | 6504 | UV + skin + poses testés |
| heraut_mage | Ysmera la Voilée | humanoid | 16 | 6888 | UV + skin + poses testés |
| traitre_necro | Sœur Blême | humanoid | 16 | 6504 | UV + skin + poses testés |
| heraut_necro | Grimwald l'Exhumeur | humanoid | 16 | 6888 | UV + skin + poses testés |
| traitre_archer | Taran le Braconnier | humanoid | 16 | 6504 | UV + skin + poses testés |
| heraut_archer | Ravak Mâchoire-Noire | humanoid | 16 | 6888 | UV + skin + poses testés |
| traitre_assassin | Vesper la Parjure | humanoid | 16 | 6504 | UV + skin + poses testés |
| heraut_assassin | Le Sans-Visage | humanoid | 16 | 6888 | UV + skin + poses testés |
| traitre_druide | Gaël le Flétri | humanoid | 16 | 6696 | UV + skin + poses testés |
| heraut_druide | Ronce-Noire, l'Arbre pourri | humanoid | 16 | 7080 | UV + skin + poses testés |
| traitre_chaman | Orka la Muette | humanoid | 16 | 6248 | UV + skin + poses testés |
| heraut_chaman | Hurle-Tempête | humanoid | 16 | 6632 | UV + skin + poses testés |
| d1_mineur | Mineur possédé | humanoid | 15 | 6456 | UV + skin + poses testés |
| d2_noye | Garde noyé | humanoid | 15 | 6312 | UV + skin + poses testés |
| d3_acolyte | Acolyte des cendres | humanoid | 16 | 6504 | UV + skin + poses testés |
| d4_sentinelle | Sentinelle de givre | humanoid | 15 | 6008 | UV + skin + poses testés |
| d5_forgeflamme | Forgeflamme | humanoid | 15 | 6648 | UV + skin + poses testés |
| r1_sentinelle | Sentinelle céleste | humanoid | 16 | 6504 | UV + skin + poses testés |
| r2_brasier | Brasier vivant | floater | 6 | 960 | UV + skin + poses testés |
| b1_grattefer | Grattefer, contremaître kobold | humanoid | 16 | 6680 | UV + skin + poses testés |
| b1_braisegueule | Braisegueule | quadruped | 13 | 4280 | UV + skin + poses testés |
| b1_colosse | Le Colosse de Scories | humanoid | 15 | 6008 | UV + skin + poses testés |
| b2_glougloss | Grand-Prêtre Glougloss | humanoid | 16 | 6248 | UV + skin + poses testés |
| b2_sangsue_reine | La Sangsue-Reine | worm | 8 | 1344 | UV + skin + poses testés |
| b2_ondrakis | Ondrakis, l'Hydre des Tourbières | drake | 20 | 5816 | UV + skin + poses testés |
| b3_geolier | Le Geôlier Sans-Visage | humanoid | 16 | 7224 | UV + skin + poses testés |
| b3_veuve | Veuve Pâle | humanoid | 10 | 5640 | UV + skin + poses testés |
| b3_morvhal | Morvhal, le Roi Oublié | humanoid | 16 | 7224 | UV + skin + poses testés |
| b4_brisegel | Brisegel le Veilleur | humanoid | 15 | 6248 | UV + skin + poses testés |
| b4_isvelle | Isvelle, sœur de l'hiver | humanoid | 11 | 5632 | UV + skin + poses testés |
| b4_nivalle | Nivalle, sœur du blizzard | humanoid | 16 | 7080 | UV + skin + poses testés |
| b4_hjarnok | Hjarnok, Cœur-de-Glacier | drake | 20 | 5816 | UV + skin + poses testés |
| b5_kazdrul | Maître-Forgeron Kazdrul | humanoid | 15 | 7032 | UV + skin + poses testés |
| b5_ignivore | Ignivore | quadruped | 13 | 4520 | UV + skin + poses testés |
| b5_velkyra | Pyrarque Velkyra | humanoid | 19 | 7256 | UV + skin + poses testés |
| r1_aegis | Aëgis, le Gardien Colossal | humanoid | 15 | 6392 | UV + skin + poses testés |
| r1_vharn | Vharn, jumeau de foudre | floater | 8 | 1344 | UV + skin + poses testés |
| r1_sylk | Sylk, jumelle des nues | humanoid | 15 | 6968 | UV + skin + poses testés |
| r1_selenia | Haute-Oracle Sélénia | humanoid | 11 | 5632 | UV + skin + poses testés |
| r1_vortharion | Vortharion, l'Œil du Cyclone | drake | 20 | 5816 | UV + skin + poses testés |
| r2_gorlath | Gorlath le Dévoreur | worm | 8 | 1344 | UV + skin + poses testés |
| r2_pyrothe | Pyrothe du Conseil | humanoid | 17 | 6888 | UV + skin + poses testés |
| r2_cendrine | Cendrine du Conseil | humanoid | 11 | 5512 | UV + skin + poses testés |
| r2_ardeval | Ardeval du Conseil | humanoid | 16 | 6872 | UV + skin + poses testés |
| r2_scarnak | Scarnak, Brasier Vivant | floater | 10 | 1728 | UV + skin + poses testés |
| r2_nyxaroth | Nyxaroth, Mère des Wyrms | drake | 20 | 5816 | UV + skin + poses testés |
