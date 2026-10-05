# Orvalis — preview web permanent

Le dépôt contient un workflow GitHub Actions (`.github/workflows/pages.yml`) qui publie automatiquement `engine/dist` sur GitHub Pages.

## Ce qui est déployé

Le workflow :

1. installe les dépendances racine avec `npm ci` ;
2. construit l'Orvalis legacy avec `npm run build:prod` ;
3. installe les dépendances du nouveau moteur avec `npm ci` dans `engine/` ;
4. exécute le typecheck du nouveau moteur ;
5. construit le nouveau moteur avec Vite ;
6. Vite embarque la page legacy dans `engine/dist/legacy/orvalis.html` ;
7. GitHub Pages publie `engine/dist`.

Le site final permet donc d'utiliser le même bootstrap que localement :

- `?engine=legacy` : ancien Orvalis ;
- `?engine=new` : nouveau moteur ;
- les paramètres de debug/scène continuent de fonctionner (`renderer`, `scene`, etc.).

## Activation unique sur GitHub

Après avoir poussé le projet dans un dépôt GitHub :

1. ouvrir **Settings → Pages** ;
2. sous **Build and deployment → Source**, choisir **GitHub Actions** ;
3. pousser sur `main` (ou `master`) ou lancer manuellement le workflow **Deploy Orvalis Preview**.

Après le premier déploiement, GitHub affiche l'URL permanente du site dans l'onglet **Actions** et dans **Settings → Pages**.

Chaque push suivant redéploie automatiquement la même URL.
