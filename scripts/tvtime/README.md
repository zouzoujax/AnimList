# Import TV Time / OpenTV

Scripts rapatriés d'un dossier temporaire de session. Ils ont produit l'import
initial : **2 660 épisodes placés, 0 non apparié, 52 séries → 85 entrées AniList**.

Ce sont des scripts Node autonomes (`node --experimental-…` pas nécessaire), sans
dépendance, à lancer depuis la racine du projet.

| Fichier | Rôle |
|---|---|
| `import-tvtime.mjs` | Convertit l'export GDPR en fichier de sauvegarde AnimeList. Usage : `node scripts/tvtime/import-tvtime.mjs <sortie.json>` |
| `match.mjs` | Appariement des titres TheTVDB → AniList (chaîne de suites, recherche par franchise, répartition par saison). |
| `verify.mjs` | Contrôles de cohérence sur le résultat : doublons, épisode au-delà du plafond, statuts. |

## Le problème que ça résout

TheTVDB modélise un long anime comme **une** série à saisons ; AniList le découpe
en **une entrée par cour**. Les épisodes vus sont donc versés dans l'ordre le long
d'une chaîne d'entrées reliées par des relations `SEQUEL`, avec débordement sur
l'entrée suivante quand la courante est pleine. L'allocation par saison privilégie
une correspondance exacte du nombre d'épisodes.

## Limites actuelles (→ étape 6)

- Le chemin de l'export est **codé en dur** dans `import-tvtime.mjs` (`BASE`).
- Aucune interface : il faut lancer le script à la main puis restaurer le JSON.
- La table de correspondances manuelles n'est pas éditable depuis l'app.

L'étape 6 de la feuille de route porte cette logique dans le process principal
avec un sélecteur de dossier dans les Réglages, un rapport de résultats et une
table de correspondances modifiable sans recompiler.
