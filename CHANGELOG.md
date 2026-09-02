# Journal des versions

Ce fichier est la source des notes affichées dans l'app. `npm run release` en
extrait la section de la version publiée et la pose dans le corps de la release
GitHub ; l'app installée la relit au moment de la mise à jour.

Un titre de niveau deux par version, puis des rubriques `### Ajouts`,
`### Modifications`, `### Corrections`, `### Suppressions`. Une ligne par
changement, écrite pour quelqu'un qui utilise l'app, pas pour quelqu'un qui lit
le code.

## 0.3.18 — 2 septembre 2026

### Ajouts

- Un épisode ouvert depuis l'app reprend là où tu l'avais laissé. La position est retenue pendant la lecture et à la fermeture, et la ligne du fichier affiche « reprendre à 12:34 » avec son avancement. Elle est oubliée dès que l'épisode est coché
- Tu peux suivre un studio ou un doubleur depuis sa page. Leurs nouvelles sorties te sont annoncées et remontent sur l'accueil, dans « Chez ceux que tu suis ». Poser un suivi ne dit rien de ce qui existe déjà : seul ce qui arrive après compte
- Manga, manhwa et manhua sont distingués dans le catalogue — AniList les mélange sous un seul mot, alors que sept des huit titres en tendance sont coréens. L'origine paraît sur chaque carte et en tête de chaque fiche, et trois onglets permettent de n'en voir qu'un à la fois
- Un bouton « Retour » sur la fiche d'un anime, y compris quand elle n'a pas réussi à charger — c'était le seul écran sans autre issue qu'un message d'erreur

### Modifications

- « Pour toi » ne se contente plus de reprendre les votes de la communauté : les séries sont classées d'après ce que tu regardes et ce que tu notes, et chaque carte dit pourquoi elle est là. Tant que tu n'as rien noté, le classement suit ce que tu regardes le plus, et l'annonce plutôt que de faire semblant de lire des notes

### Corrections

- La fiche d'un anime intitulait sa source « Le manga » même quand c'en était un autre : sous Solo Leveling, tiré d'un manhwa coréen, c'était faux. Le titre suit maintenant le pays d'origine

## 0.3.17 — 2 septembre 2026

### Modifications

- Le catalogue manga s'arrêtait aux trente premiers titres, sur les trois onglets comme dans la recherche : il se déroule maintenant tout seul en descendant, comme « Découvrir » et les pages de studio

## 0.3.16 — 2 septembre 2026

### Corrections

- « Regarder » ouvrait parfois une saison qui n'existe pas, sur une page vide : un chiffre appartenant au nom de la série — « Kaiju No. 8 » — était compté comme un numéro de saison, et le site répondait à cette adresse sans rien avoir à y montrer. Les liens déjà mémorisés sont refaits

## 0.3.15 — 1er septembre 2026

### Corrections

- Une série cochée jusqu'au bout restait parfois « en cours » pour toujours, proposée dans « Continuer » alors qu'elle était finie : son statut est désormais revu dès que le nombre d'épisodes est connu, et les fiches déjà dans cet état sont rattrapées au lancement, à la date de leur dernier épisode vu
- Sur les cartes de « Continuer », « x / y épisodes » passait à la ligne quand un compte à rebours l'accompagnait, et chassait la barre de progression hors de la carte

## 0.3.14 — 1er septembre 2026

### Ajouts

- `Ctrl+Z` annule la dernière coche : cocher, cocher jusque-là, réinitialiser une progression
- Un bouton « Au hasard » sur « À rattraper », pour les soirs où choisir est déjà un effort
- Marquer un épisode « à revoir » depuis son éditeur : il se retrouve sur l'accueil, et sa case porte une pastille
- Un bilan de santé de la bibliothèque dans les Réglages : fiches manquantes, visionnages orphelins, épisodes au-delà du total, doublons, fichiers résiduels — avec de quoi nettoyer ce qui peut l'être
- Une frise dans les statistiques : chaque mois de visionnage, avec les séries qui l'ont occupé
- Les personnages et leurs doubleurs sont cliquables : leur page rassemble tout ce qu'AniList leur connaît, en signalant ce que tu as déjà
- « Ton année » dans les statistiques : une carte à enregistrer en image, avec le temps, les épisodes et les affiches de l'année
- Un onglet Manga : le catalogue AniList, en lecture seule

## 0.3.13 — 1er septembre 2026

### Ajouts

- Une aide des raccourcis dans l'app, ouverte par `?` ou depuis les Réglages : clavier et souris, y compris les gestes qu'on ne devine pas seul comme le clic droit sur un épisode
- « Ce qu'il te reste » dans les statistiques : les heures en cours, celles en pile, et une estimation en jours à ton rythme réel
- La fiche d'un anime dit combien d'épisodes il reste et le temps que ça représente
- « Pour toi » sur la page Découvrir : ce qu'AniList conseille à partir de ce que tu as aimé, moins ce que tu suis déjà, avec la série qui a mené jusqu'à chaque suggestion
- La vignette d'un épisode s'affiche quand on l'ouvre depuis la grille

## 0.3.12 — 1er septembre 2026

### Corrections

- Le lecteur de fichiers locaux ne se fermait pas : ses boutons tombaient dans la bande de déplacement de la fenêtre, qui capture la souris avant eux
- Cliquer à côté de la vidéo ferme le lecteur, comme on s'y attend
- La vidéo occupe l'espace du lecteur sans le dévorer : une source plus petite restait à sa taille d'origine, une grande prenait tout l'écran
- Le bouton « Fermer » du lecteur était caché derrière les boutons de la fenêtre Windows

## 0.3.11 — 1er septembre 2026

### Ajouts

- Une section « À rattraper » sur l'accueil : les séries dont des épisodes sont sortis sans que tu les aies vus, avec le retard accumulé et les séries encore en diffusion en tête

## 0.3.10 — 1er septembre 2026

### Modifications

- « Redémarrer maintenant » installe la mise à jour en silence et rouvre l'app : plus d'assistant Windows à cliquer. La fermeture normale le faisait déjà ainsi

## 0.3.9 — 1er septembre 2026

### Corrections

- Les fenêtres surgissantes de la page Anime-Sama ne s'ouvrent plus dans le navigateur : elles sont bloquées, comme le fait tout navigateur par défaut
- La fenêtre reste sur le site : un clic mal placé ne peut plus emmener la page entière sur une régie publicitaire

## 0.3.8 — 1er septembre 2026

### Corrections

- La fenêtre Anime-Sama s'affichait vide en version installée : images cassées, publicités bloquées et aucun lecteur. Notre propre politique de sécurité s'appliquait à leur page, ce qui ne se voyait pas en développement où elle n'est pas posée
- La fenêtre détachée de la bande-annonce était dans le même cas

## 0.3.7 — 31 août 2026

### Ajouts

- Un lien vers l'épisode lui-même, et plus seulement vers la série : dans le panneau « Regarder » pour l'épisode en cours, et sur chaque épisode ouvert depuis la grille
- Anime-Sama s'ouvre directement sur le bon épisode, dans une fenêtre de l'app : le site n'a pas d'adresse par épisode, l'app pose le numéro avant que sa page ne le lise
- Le lien Anime-Sama mène à la page des épisodes et non plus à la fiche de la série : le hub répondait 200 sans contenir un seul épisode, ce qui suffisait à le faire retenir
- Chaque épisode diffusé de la grille porte un bouton de lecture au survol, qui ouvre directement ce numéro-là

### Corrections

- Les titres et vignettes d'épisodes étaient décalés : ils étaient appariés par position alors qu'AniList ne les renvoie ni dans l'ordre ni au complet. Sur One Piece, l'épisode 1 affichait le titre du 130

## 0.3.6 — 31 août 2026

### Modifications

- Le cache des données AniList se borne enfin : il pesait 7,4 Mo et ne diminuait jamais
- Les Réglages affichent son poids et permettent de le vider

### Corrections

- Les écrans ne gardent plus les données de la page précédente le temps d'une image en changeant de fiche

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
