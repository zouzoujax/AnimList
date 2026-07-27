# Import TV Time / OpenTV

Cet import vit maintenant **dans l'application** : Réglages → *Mes données* →
« Importer depuis TV Time / OpenTV ».

Les scripts autonomes qui occupaient ce dossier ont été portés dans
`src/main/tvtime/` et supprimés. On les retrouve dans l'historique git si
besoin (`git show 5756598 -- scripts/tvtime/`).

## Où est passé quoi

| Ancien script | Remplacé par |
|---|---|
| lecture des CSV | `src/main/tvtime/csv.ts` + `read.ts` |
| appariement des titres | `src/main/tvtime/match.ts` |
| chaîne de suites AniList | `src/main/tvtime/chain.ts` |
| répartition des épisodes | `src/main/tvtime/allocate.ts` |
| orchestration et rapport | `src/main/tvtime/run.ts` |
| dossier, dialogues, store | `src/main/tvtime/service.ts` + `folder.ts` |

## Le problème que ça résout

TheTVDB modélise un long anime comme **une** série à saisons ; AniList le découpe
en **une entrée par cour**. Les épisodes vus ne peuvent donc pas être appariés par
numéro : ils sont versés dans l'ordre de diffusion le long d'une chaîne d'entrées
reliées par des relations `SEQUEL`, avec débordement sur l'entrée suivante quand
la courante est pleine.

Le graphe de relations d'AniList a des trous (Dr. STONE, Tensei Shitara Slime
Datta Ken n'exposent pas un `SEQUEL` pour chaque cour) : une recherche de
franchise complète alors la chaîne par préfixe de titre et date de diffusion.

## Ce que la version applicative apporte

- plus aucun chemin codé en dur : le dossier se choisit dans l'app, et le
  dernier utilisé est mémorisé
- les séries introuvables sont listées avec un champ pour saisir un id AniList,
  ou les ignorer — les corrections sont conservées et rejouées
- progression en direct et interruption possible
- les requêtes passent par la file d'attente de l'app, voie « arrière-plan »,
  donc naviguer pendant un import reste instantané
- les événements d'historique portent `imported: true`, sans quoi les dates de
  pointage fausseraient séries de jours, heatmap et meilleure journée
- couvert par des tests : `src/main/tvtime/*.test.ts`
