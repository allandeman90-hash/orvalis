# Mesures finales

Build : `79eab54f7eeee379a4285cbf1430008f352bd3d380327199260db45ea01cb74c`.

ANGLE (Intel, Intel(R) UHD Graphics (0x000046A3) Direct3D11 vs_5_0 ps_5_0, D3D11) ; Edge headless, fenêtre 1920 × 1080, réglages automatiques désactivés, sans enregistrement vidéo et sans autre test navigateur concurrent. Mesure après stabilisation ; 240 intervalles de requestAnimationFrame par scène standard. Les compteurs GPU correspondent à la dernière image de chaque échantillon.

| Mode | Scène | Médiane ms | P95 ms | P99 ms | FPS équivalent médian | Triangles dernière image |
|---|---|---:|---:|---:|---:|---:|
| Moyen, ombres | village | 27.8 | 34.8 | 41.7 | 36.0 | 555006 |
| Moyen, ombres | foret | 69.4 | 76.6 | 83.4 | 14.4 | 2078808 |
| Moyen, ombres | montagne | 27.8 | 34.8 | 35.1 | 36.0 | 436906 |
| Moyen, ombres | combat | 34.7 | 41.6 | 41.8 | 28.8 | 640902 |
| Réduit | combat | 20.9 | 27.9 | 35.0 | 47.8 | 539674 |
| Réduit | village | 20.7 | 21.0 | 27.7 | 48.3 | 459834 |
| Réduit | foret | 41.6 | 48.6 | 49.4 | 24.0 | 1256204 |
| Réduit | montagne | 13.9 | 20.9 | 21.9 | 71.9 | 247350 |

Mode réduit : résolution interne à 72 % de 1920 × 1080, ombres désactivées, visibilité 240 m, LOD rapprochés. Échantillon de cinq secondes après cinq secondes de stabilisation, six secondes pour le combat.

La cible de 60 FPS standard n’est pas atteinte sur ce GPU Intel. La cible réduite de 30 FPS n’est pas tenue en forêt. Ces limites sont conservées dans le bilan de livraison. Il n’y a pas de preuve de 60 FPS sur la RTX ou un autre GPU. Les valeurs sont des résultats de ce poste et de ce pilote, pas des garanties générales.

Les passages en forêt utilisent maintenant environ 2,1 millions de triangles par image contre 16,7 millions lors du premier essai enregistré ; les temps de cet essai vidéo ne constituent pas une comparaison FPS contrôlée.

Les téléportations sont exclues des échantillons de stabilisation ; les pics durant le chargement ne sont donc pas résumés par ces percentiles. Les ennemis et événements sont dynamiques : une répétition peut différer.
