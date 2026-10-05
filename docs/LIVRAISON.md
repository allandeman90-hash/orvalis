# Orvalis 4 — livraison de la refonte

## Jouer et reconstruire

Ouvrir `dist/Jouer-Orvalis.html` dans Edge ou Chrome. Aucune installation n'est nécessaire pour le jeu solo. Les polices distantes sont facultatives : le jeu possède des polices de repli. Le test de l'archive bloque les requêtes HTTP externes.

Les sauvegardes dépendent du navigateur et de l'origine de la page. Un fichier déplacé ou une ouverture sur localhost peut utiliser un autre stockage : cela ne signifie pas que l'ancienne sauvegarde a été effacée. Sur la même origine, les anciennes coordonnées sont converties une seule fois et la sauvegarde initiale est copiée sous `orvalis.save.v1.before-world-v2`.

Pour reconstruire : Node.js récent, `npm ci`, puis `npm run build:prod`. La sortie autonome est `dist/Jouer-Orvalis.html`. `npm test` vérifie la géographie et les migrations. `node tools/serve.mjs` propose aussi une ouverture sur `http://127.0.0.1:8766/`.

Les tests navigateur utilisent Playwright et Edge. Installer Playwright dans l'environnement de test, ou définir `PLAYWRIGHT` vers le module. Les outils de test n'interviennent pas dans le fonctionnement du jeu.

## Changements

- Continent de 4096 × 4096 m, neuf régions, 32 villes/postes/sanctuaires, 48 lieux remarquables, 43 liaisons routières. Les 27 lieux et 18 quêtes d'exploration ajoutés accompagnent l'agrandissement.
- Instances déplacées dans un espace distinct autour de x = 6000. Identification explicite du monde et garde de version des présences multijoueurs.
- Terrain et décor chargés par secteurs ; détails du terrain et des arbres réduits avec la distance ; destruction des ressources de rendu des secteurs quittés.
- Corps UV à squelettes indépendants pour les 121 définitions du bestiaire, personnages, PNJ, familiers, montures et transformations. Armes profilées, matières, végétation, éclairage et particules remaniés.
- Carte, minimap, positions de quêtes, ressources, réapparitions et destinations adaptées au nouveau continent. Durée des caravanes adaptée à la longueur réelle des trajets.
- Interface compacte corrigée pour laisser accessibles chat, menus et barre d'action.

## Ce qui est effectivement vérifié

Les rapports JSON de `validation` contiennent les données brutes. `docs/COUVERTURE.md` relie les familles et régions aux preuves. La compilation seule ne sert pas de validation visuelle.

- Création de personnage par l'interface, déplacement, huit classes équipées, formes d'ours/félin/poulet, monture, combat avec butin, mort/réapparition, exploration, carte et sauvegarde/rechargement.
- 121 modèles instanciés en double : UV, squelette, poses finies et indépendantes ; actions, mort, retour et transparence de camouflage.
- Entrée et sortie de toutes les neuf régions et huit instances. Un donjon complet, Mèchenoir, terminé avec groupe IA : 34 ennemis et trois boss. Les sept autres instances ont un test d'accès, pas un parcours intégral de tous les boss.
- Routes échantillonnées tous les deux mètres dans les deux sens : pentes franchissables et absence de passage sous l'eau. Ce test ne prouve pas à lui seul toutes les collisions avec les bâtiments.
- Export et rechargement GLB du loup avec os et sept clips.
- Parcours d'endurance de 20 min 18 s sur une itération intermédiaire : trois régions revisitées, mémoire après GC approximativement 43–47 Mio, pas d'erreur JavaScript. Ce rapport précède les derniers détails des modèles et les derniers LOD ; il ne constitue pas un test d'endurance de vingt minutes octet pour octet sur la livraison finale.

- Vérification complémentaire sur le build final : 136.9 secondes, 12 visites dans trois régions, mémoire après GC de 44.5 à 46.5 Mio, variation à région comparable de -0.34 Mio et aucune erreur JavaScript. Ce contrôle court ne remplace pas l'endurance de vingt minutes.

## Limites du résultat

La refonte couvre les systèmes et définitions du jeu, mais le niveau artistique ambitieux du document initial n'est pas déclaré atteint. Les surfaces sont anatomiques et animées ; certaines variantes restent proches, les matières sont procédurales et les animations restent simples. Les bâtiments utilisent encore des volumes architecturaux modulaires. Une production artistique individuelle et une revue des silhouettes, visages, fourrures et armures restent nécessaires pour atteindre une finition comparable à un MMO commercial.

Le squelette des classes comporte actuellement 16–18 os et environ 7 256–8 604 triangles pour le corps : les budgets indicatifs du plan ne sont pas tous respectés. Les modèles GLB ne remplacent pas encore le générateur au chargement du jeu.

Les mesures de performances sont celles d'Edge headless sur le GPU identifié dans `validation/final/results.json`. Elles n'autorisent pas à annoncer 60 images/s sur tout ordinateur. La vidéo n'est pas utilisée comme mesure de performance. Les anciennes captures de départ n'ont pas un cadrage suffisamment contrôlé pour une comparaison quantitative avant/après.

Le multijoueur entre onglets est vérifié localement ; le service externe de salles n'est pas testé dans cette livraison.

## Intégrité

`dist/build-info.json` contient l'empreinte SHA-256 des sources de construction. La même empreinte est embarquée dans `window.__build` de la page jouable. L'archive inclut un manifeste SHA-256 des fichiers ; une copie extraite est démarrée dans un navigateur avec les accès HTTP externes bloqués.

L'original reçu reste conservé dans son dossier initial. Les scripts de transformation ponctuelle ont été retirés des outils livrés pour éviter une seconde application de la multiplication des coordonnées.
