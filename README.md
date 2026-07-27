<div align="center">

# AnimeList

**Suivi d'animes local-first pour Windows 11.**
Pas de compte, pas de serveur, pas de pub, pas d'analytics —
toute ta bibliothèque vit dans un fichier sur ton PC.

![Electron](https://img.shields.io/badge/Electron-43-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white)
![Tests](https://img.shields.io/badge/tests-262%20passing-3FB950)
![Runtime deps](https://img.shields.io/badge/dépendances%20runtime-0-8957E5)

Auteur : **Zaidal**

</div>

Inspiré des fonctionnalités d'*OpenTV: TV & Movie Tracker*, transposées à l'anime.

## Ce que ça fait

- **Suivi épisode par épisode** — grille cliquable, `Maj+clic` pour cocher jusqu'à un épisode,
  passage automatique de « À voir » → « En cours » → « Terminé »
- **Bibliothèque** — 5 statuts + favoris, filtres par genre/format, tri, vues grille et liste
- **Notes & ressentis** — étoiles par demi-point (0–10), réactions emoji, notes libres, au
  niveau de la série **et de chaque épisode** (clic droit sur une vignette)
- **Revisionnage** — « Revoir » ouvre un nouveau passage : la grille se vide, l'historique
  précédent reste et continue de compter dans le temps total. Chaque visionnage garde sa
  propre date, sa durée, ses ressentis et sa note
- **Historique corrigeable** — modifier la date ou la durée d'un épisode vu, en supprimer un.
  Une date corrigée à la main rejoint les statistiques par jour, dont les imports sont exclus
- **Découverte** — tendances, saison en cours, populaires, mieux notés, à venir, recherche
  instantanée, bandes-annonces, casting, relations, recommandations
- **Calendrier** — grille hebdomadaire des prochains épisodes de tes séries
- **Où regarder** — chaque fiche propose Crunchyroll, Anime-Sama et ADN, en indiquant
  si le lien mène à l'anime lui-même ou à une recherche. Les slugs Anime-Sama étant
  indevinables (`Kaiju No. 8` → `kaiju-n8`), ils sont lus dans le catalogue du site puis
  l'URL de saison est vérifiée avant d'être proposée : 87 % de liens directs mesurés sur
  une bibliothèque de 85 titres, le reste bascule sur la recherche
- **Statistiques** — temps total, séries de jours (streaks), heatmap annuelle, graphique
  mensuel, top genres/studios, 12 badges, panthéon des mieux notées
- **Notifications Windows** quand un épisode d'une série suivie sort
- **Import MyAnimeList** (`animelist_*.xml` ou `.xml.gz`) avec reconstruction de l'historique
- **Import TV Time / OpenTV** — choisis le dossier de l'export, les séries suivies sont
  retrouvées sur AniList et leurs épisodes répartis sur les bonnes saisons. TheTVDB modélise
  un long anime comme une série à saisons là où AniList le découpe en une entrée par cour,
  donc les épisodes sont versés le long d'une chaîne de suites avec débordement. Les séries
  introuvables sont listées avec un champ pour saisir un id AniList ; les corrections sont
  conservées et rejouées
- **Export / restauration** JSON, et fonctionnement hors-ligne grâce au cache disque

## Démarrer

```bash
npm install      # télécharge aussi le binaire Electron (voir la note Node ci-dessous)
npm run dev      # développement, HMR sur le renderer
npm start        # lance la version buildée
npm run build    # typecheck + bundles de production dans out/
npm run dist     # installeur Windows (NSIS) dans release/
```

Développé et vérifié sur **Node 24.18.0 / npm 11.16.0**.

L'icône (`build/icon.ico` + `icon.png`) est générée par `python scripts/make-icon.py` — même
géométrie que le logo affiché dans l'app, à relancer si tu changes la marque.

> **Pourquoi `scripts/install-electron.mjs`.** Le binaire Electron (~110 Mo) n'est pas dans le
> paquet npm : il est téléchargé par un script d'installation. Ce script échoue dans deux cas
> courants, et l'app refuse alors de démarrer avec `Error: Electron uninstall` :
>
> 1. sur Node < 20.19, le postinstall d'`electron@43` fait un `require()` sur `@electron/get`
>    devenu ESM-only → `ERR_REQUIRE_ESM` ;
> 2. sur npm ≥ 11, les scripts d'installation des dépendances tierces sont bloqués par défaut
>    (`npm approve-scripts`), donc celui d'Electron ne s'exécute pas du tout.
>
> Le script maison est branché en `postinstall` de *ce* paquet — donc toujours autorisé — et
> refait le travail via `import()` dynamique. Il ne fait rien si le binaire est déjà là.
>
> Les autres scripts bloqués par npm 11 (`esbuild`, `electron-winstaller`) n'ont pas d'impact :
> esbuild passe par ses paquets de binaires optionnels, et `electron-winstaller` ne sert qu'à la
> cible Squirrel, alors qu'on package en NSIS.

> **Audit.** `npm audit` remonte des alertes « high » sur l'arbre d'`electron-builder`
> (`brace-expansion` → `minimatch` → `glob`…). Ce sont des dépendances de développement utilisées
> au packaging uniquement ; rien de tout ça n'est embarqué dans l'application distribuée.

## Raccourcis

| Touche | Action |
|---|---|
| `Ctrl+K` | Palette de recherche (bibliothèque + AniList + navigation) |
| `↑` `↓` `⏎` | Naviguer / ouvrir dans la palette |
| `Alt+←` | Retour |
| `Maj+clic` sur un épisode | Cocher tous les épisodes jusque-là |
| Clic droit sur un épisode | Éditer ses visionnages : date, durée, ressenti, note |

## Où sont mes données

Un seul fichier JSON, écrit de façon atomique avec une copie de secours :

```
%APPDATA%\animelist\animelist.json      # bibliothèque, historique, préférences
%APPDATA%\animelist\animelist.json.bak  # sauvegarde du dernier état valide
%APPDATA%\animelist\anilist-cache.json  # cache réseau (supprimable sans risque)
```

Réglages → *Mes données* → **Ouvrir** te dépose directement dedans. L'export produit
exactement le même format que le fichier principal : c'est ta sauvegarde.

## Architecture

```
src/
  main/        process Electron : store JSON atomique, client AniList, IPC, notifications
  preload/     pont contextBridge typé (window.api)
  renderer/    React 19 + Tailwind v4 + Motion
  shared/      types partagés main ↔ renderer
```

- **Zéro dépendance runtime.** Tout est bundlé ; aucun module natif, donc aucun outil de
  compilation C++ requis et aucun problème d'ABI au packaging.
- **Le main détient les données.** Le renderer mute via IPC, le main renvoie un événement
  `store:change`, le renderer resynchronise. Les coches d'épisodes sont optimistes pour rester
  instantanées.
- **Données AniList** via l'API GraphQL publique (sans clé), appelée depuis le main : pas de
  CORS, une file d'attente qui respecte la limite de débit, et un cache disque qui sert de
  repli hors-ligne.
- **Sécurité** : `contextIsolation` activé, `nodeIntegration` désactivé, CSP stricte en
  production, navigation externe forcée vers le navigateur système.

## Design

Sombre, verre dépoli, aurore animée en fond, matériau **Mica** de Windows 11 (désactivable).
La couleur d'accent est configurable et se propage à toute l'UI, y compris les graphiques.

Les graphiques suivent une méthode explicite : chaque série encode une magnitude, donc chaque
graphique reste **mono-teinte** et laisse la longueur, la position ou la clarté porter la valeur.
La rampe de la heatmap est une rampe ordinale validée (teinte unique, clarté monotone, palier le
plus clair à ≥ 2:1 sur la surface du graphique), et les libellés portent des couleurs de texte,
jamais celle de la série.

Quatre **thèmes** (Nuit, Papier, Terminal, Synth) et quatre **dispositions** (Barre latérale,
Rail, Barre haute, Tableau de bord) se combinent librement depuis les Réglages.

## Qualité

```bash
npm test           # 262 tests unitaires (Vitest)
npm run lint       # ESLint 10, typé, 0 erreur
npm run typecheck  # tsc sur les deux projets
npm run format     # Prettier
```

Ce qui est couvert par des tests : appariement et normalisation des titres, formatage,
lecture/écriture du store, migrations de schéma, ordonnanceur de requêtes, et toute la
chaîne d'import TV Time (lecture CSV, appariement, marche dans les suites, répartition
des épisodes, localisation des fichiers).

Deux mécanismes méritent d'être signalés :

- **Migrations de schéma versionnées** (`src/main/migrations.ts`). Le fichier de données porte
  un numéro de version ; à l'ouverture, les migrations manquantes sont appliquées après une
  sauvegarde horodatée. Un fichier écrit par une version *plus récente* passe en lecture seule
  plutôt que d'être réécrit par un build ancien.
- **File de requêtes à deux voies** (`src/main/queue.ts`). AniList tolère ~30 requêtes/minute.
  Les appels déclarent une voie : ce que l'utilisateur attend passe devant le travail de fond,
  et les requêtes identiques sont mutualisées plutôt que répétées.

## Feuille de route

- [x] Importeur TV Time / OpenTV intégré à l'app
- [x] Interface de revisionnage
- [x] Édition de l'historique (corriger une date, retirer un épisode)
- [x] Notes et ressentis par épisode
- [ ] Listes personnalisées et actions groupées
- [ ] Notifications par série, avec délai configurable
- [ ] Accessibilité et découpage du bundle
- [ ] Écriture incrémentale du store
- [ ] Mise à jour automatique

## Licence

Projet personnel, non distribué. Les données d'anime proviennent de l'API publique
[AniList](https://anilist.co) et appartiennent à leurs auteurs respectifs.
