# Journal des versions

Ce fichier est la source des notes affichées dans l'app. `npm run release` en
extrait la section de la version publiée et la pose dans le corps de la release
GitHub ; l'app installée la relit au moment de la mise à jour.

Un titre de niveau deux par version, puis des rubriques `### Ajouts`,
`### Modifications`, `### Corrections`, `### Suppressions`. Une ligne par
changement, écrite pour quelqu'un qui utilise l'app, pas pour quelqu'un qui lit
le code.

## 0.3.5 — 31 août 2026

### Ajouts

- Un lecteur pour tes fichiers locaux : associe un dossier à une série et regarde les épisodes depuis la fiche
- L'épisode se coche tout seul aux neuf dixièmes de la lecture
- Les sous-titres posés à côté de la vidéo (.srt, .vtt) s'affichent, le SubRip étant converti à la volée
- Ce que l'app ne sait pas décoder — le x265 surtout — s'ouvre dans le lecteur du système au lieu d'un carré noir

## 0.3.4 — 31 août 2026

### Corrections

- La fenêtre « Quoi de neuf » affiche enfin son contenu : GitHub livre les notes déjà converties en HTML, et l'app n'y lisait que du Markdown

## 0.3.3 — 31 août 2026

### Ajouts

- Une fenêtre « Quoi de neuf » : chaque mise à jour dit ce qu'elle apporte, rubrique par rubrique, avant d'être installée
- Un filtre sur le mur des badges — tous, débloqués, à faire — avec les badges les plus proches d'abord

### Modifications

- Les cent badges gardent le compte réel de chaque groupe même quand un filtre est actif

## 0.3.2 — 31 août 2026

### Corrections

- Un épisode qui n'est pas encore diffusé ne peut plus être coché depuis l'accueil, la bibliothèque ni l'en-tête d'une fiche
- Un épisode coché par erreur avant sa diffusion peut à nouveau être décoché
- La une de l'accueil annonce la date du prochain épisode au lieu de proposer de le marquer comme vu

## 0.3.1 — 28 août 2026

### Corrections

- Les mises à jour fonctionnent : l'app installée se croyait lancée depuis les sources et ne contactait jamais GitHub
- Le bouton « Vérifier » dit désormais pourquoi une vérification échoue au lieu de ne rien faire

## 0.3.0 — 28 août 2026

### Ajouts

- Cent badges au lieu de quarante-six, et un septième groupe, « Époques »
- Un panneau unique pour les listes personnalisées : entrer, sortir, renommer, supprimer
- Les halos de l'accueil prennent la couleur de la jaquette mise en avant

### Modifications

- Les actions groupées basculent les favoris au lieu de seulement les ajouter
