# AnimeList

App de bureau Windows pour suivre ses animes. Electron + electron-vite, React 19, Tailwind v4, zustand. Données AniList (GraphQL), stockées en local.

## Commandes

- `npm run dev` : lancer en développement (fermer d'abord toute fenêtre AnimeList ouverte)
- `npm run lint` · `npm run typecheck` · `npm test` (Vitest) · `npm run format`
- `npm run build` : typecheck + build
- `npm run screenshots -- <dossier> --themes=<ids|all> --only=<pages> [--new-design]` : captures avec les données de démo, jamais la vraie bibliothèque
- `node scripts/install-electron.mjs` : réinstalle le programme d'Electron (npm 11 bloque les scripts d'installation, et `npm update` le supprime)

## Architecture

- `src/main` : processus principal (AniList, stockage, notifications, publication)
- `src/preload` : pont `window.api`
- `src/renderer/src` : interface (`pages/`, `components/`, `store/app.ts`)
- `src/shared` : types et logique partagés (`types.ts` : Prefs, THEMES, DEFAULT_PREFS)
- `experiences/` : 5 expériences (Streaming, Console, Magazine, Cockpit, Carnet), chargées à la demande
- `pages/nd/` + `components/nd.tsx` + `nd.css` : le nouveau design, activable page par page (`useNewDesign`)
- Détails : `docs/technique.md`

## Conventions

- Français partout : interface, commentaires, messages de commit
- Un commit par changement cohérent ; ne pousser que sur demande
- Après chaque modification : build, fermer l'app proprement, relancer `npm run dev`
- Thèmes : couleurs en jetons CSS (`:root[data-theme]`) ; l'accent teinte les fonds et contours, jamais le texte ; un thème clair a besoin de `.on-art` pour le texte posé sur une jaquette

## Pièges

- AniList : 30 requêtes/min ; une série de captures peut atteindre la limite (pages bloquées sur le chargement)
- `position: fixed` casse sous un parent transformé : modales et lecteur passent par `createPortal`
- La bibliothèque réelle n'a aucune note : ne rien bâtir sur `score` sans vérifier

## Publier une version

`npm version X.Y.Z --no-git-tag-version`, section `## X.Y.Z — date` en tête de `CHANGELOG.md` (le script refuse sans), commit, `git push origin main`, puis lancer `Create Realeses on Github.ps1` (porte le jeton : ne jamais afficher son contenu). Les étiquettes sont créées sur GitHub : `git fetch --tags`.
