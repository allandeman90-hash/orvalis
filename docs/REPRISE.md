# État de reprise

Build livré : 79eab54f7eeee379a4285cbf1430008f352bd3d380327199260db45ea01cb74c. Les sources originales sont conservées séparément ; ne pas réappliquer les scripts historiques de multiplication des coordonnées.

Le fonctionnement et la couverture sont détaillés dans LIVRAISON.md et COUVERTURE.md. Les priorités restantes du plan initial sont la production artistique spécifique des visages, fourrures, armures et silhouettes encore trop proches, l'animation et le contrôle des appuis, puis la réduction du coût de la forêt sur GPU intégré. La chaîne GLB existe mais le chargement utilise encore le générateur de modèles.

Les cibles 60 FPS standard et 30 FPS réduit en forêt ne sont pas atteintes sur Intel UHD dans Edge headless. Ne pas transformer ces mesures en promesse de performances générales.

Après une prochaine modification du rendu : reconstruire, reprendre les vues comparables de validation/final, tester les poses, les interactions, les instances et la migration. Réaliser une endurance de vingt minutes sur le build final et refaire l'archive après toute modification des sources.

Les tests de validation nécessitent Playwright ; les utilisateurs du jeu n'en ont pas besoin.
