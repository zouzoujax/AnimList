# AnimeList

App de bureau Windows pour suivre ses animes. Electron + electron-vite, React 19, Tailwind v4, zustand. Données AniList (GraphQL), stockées en local.

## Commandes

- `npm run dev` : lancer en développement (fermer d'abord toute fenêtre AnimeList ouverte)
- `npm run lint` · `npm run typecheck` · `npm test` (Vitest) · `npm run format`
- `npm run build` : typecheck + build
- `npm run screenshots -- <dossier> --themes=<ids|all> --only=<pages> [--new-design]` : captures avec les données de démo, jamais la vraie bibliothèque
- `node scripts/install-electron.mjs` : réinstalle le programme d'Electron (npm 11 bloque les scripts d'installation, et `npm update` le supprime)
- Rapports `session-report` : les enregistrer hors du dépôt (ils citent les messages de la conversation)

## Architecture

- `src/main` : processus principal (AniList, stockage, notifications, publication)
- `src/preload` : pont `window.api`
- `src/renderer/src` : interface (`pages/`, `components/`, `store/app.ts`)
- `src/shared` : types et logique partagés (`types.ts` : Prefs, THEMES, DEFAULT_PREFS)
- `experiences/` : 5 expériences (Streaming, Console, Magazine, Cockpit, Carnet), chargées à la demande
- `pages/nd/` + `components/nd.tsx` + `nd.css` : le nouveau design, activable page par page (`useNewDesign`)
- Ajouter une page au nouveau design : l'id dans `NewDesignPage` + `NEW_DESIGN_PAGES` (`shared/types.ts`), un `lazy()` et l'aiguillage dans `App.tsx` ; une expérience garde toujours la priorité sur ses pages
- Réglages : la coquille est `pages/Settings.tsx`, le contenu `pages/settings/Body.tsx` — un réglage s'ajoute là. Page unique, hors du nouveau design
- `pages/Home.tsx` est l'accueil classique ; le nouveau est `pages/nd/Home.tsx`
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
- Git Bash : un heredoc contenant des caractères typographiques (’ « ») casse le shell (« unexpected EOF ») ; écrire ces fichiers avec l'outil d'écriture
- Python sous Windows : `open(p, 'w')` convertit les fins de ligne en CRLF et Prettier échoue ; ouvrir avec `newline=''`
- Lint `react-hooks/purity` : pas de `Date.now()` au rendu, passer par `useNow()` (`lib/hooks.ts`)

## Publier une version

`npm version X.Y.Z --no-git-tag-version`, section `## X.Y.Z — date` en tête de `CHANGELOG.md` (le script refuse sans), commit, `git push origin main`, puis lancer `Create Realeses on Github.ps1` (porte le jeton : ne jamais afficher son contenu). Les étiquettes sont créées sur GitHub : `git fetch --tags`.
