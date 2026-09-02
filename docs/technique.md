# Notes techniques

Ce que le README ne dit pas, pour qui veut comprendre les choix — ou reprendre le projet.
Chaque section explique un **pourquoi**, souvent mesuré plutôt que supposé.

## Sommaire

- [Architecture](#architecture)
- [Design](#design)
- [Qualité et tests](#qualité-et-tests)
- [Pourquoi un script d'installation d'Electron](#pourquoi-un-script-dinstallation-delectron)
- [Pourquoi la bande-annonce passe par un serveur local](#pourquoi-la-bande-annonce-passe-par-un-serveur-local)
- [Régénérer les captures](#régénérer-les-captures)
- [Publier une mise à jour](#publier-une-mise-à-jour)
- [Feuille de route](#feuille-de-route)

## Architecture

```
src/
  main/        process Electron : store JSON atomique, client AniList, IPC, notifications
  preload/     pont contextBridge typé (window.api)
  renderer/    React 19 + Tailwind v4 + Motion
  shared/      types partagés main ↔ renderer
```

- **Deux dépendances runtime** : `electron-updater` et `qrcode-generator`. Tout le reste est
  bundlé ; aucun module natif, donc aucun outil de compilation C++ requis et aucun problème
  d'ABI au packaging. Le
  compromis est assumé : faire les mises à jour à la main voudrait dire télécharger un binaire,
  vérifier sa signature et lancer l'installeur NSIS soi-même — se tromper là, c'est se livrer un
  logiciel malveillant à soi-même.
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

Quatre **thèmes** et quatre **dispositions** (Classique, Rail, Barre haute, Tableau de bord) se
combinent librement depuis les Réglages. Un thème est une réécriture complète du jeu de
variables — couleurs, typographie, rayons, ombres, flou, effets de fond — pas seulement une
teinte.

| Thème | Monde |
|---|---|
| **Nébuleuse** | Verre dépoli, aurore animée, néons doux |
| **Papier** | Clair, éditorial, serif, sans effets |
| **Terminal** | Monospace, angles vifs, scanlines, fort contraste |
| **Synthwave** | Saturé, entièrement arrondi, néon assumé |

Un thème ne peut pas figer la couleur d'accent, puisqu'elle est réglable. Sur un fond clair cela
demande de la prudence : un accent vif peut tomber sous 3:1 comme couleur de texte. La règle
tenue partout est donc que l'accent teinte les fonds et les contours, et que le texte reste de
l'encre.

`PRODUCT.md` à la racine consigne la vérité produit — usagers, contraintes, principes — sans
aucune décision visuelle.

## Qualité et tests

```bash
npm test           # 531 tests unitaires (Vitest)
npm run lint       # ESLint 10, typé, 0 erreur
npm run typecheck  # tsc sur les deux projets
npm run format     # Prettier
```

Ce qui est couvert par des tests : appariement et normalisation des titres, formatage,
lecture/écriture du store, migrations de schéma, ordonnanceur de requêtes, profil de goût,
reprise de lecture, origine des mangas, règles d'accès de la télécommande, et toute la chaîne
d'import TV Time (lecture CSV, appariement, marche dans les suites, répartition des épisodes,
localisation des fichiers).

Un test mérite d'être signalé parce qu'il couvre un angle mort : la page servie au téléphone est
une chaîne de caractères assemblée en TypeScript, que ni le compilateur ni le linteur ne
regardent. Une faute y empêche le script entier de se parser, et la page reste sur
« Chargement… » sans rien tenter. `src/main/remote-page.test.ts` la compile donc sans
l'exécuter, et vérifie que chaque bouton a bien un gestionnaire.

Deux mécanismes méritent d'être signalés :

- **Migrations de schéma versionnées** (`src/main/migrations.ts`). Le fichier de données porte
  un numéro de version ; à l'ouverture, les migrations manquantes sont appliquées après une
  sauvegarde horodatée. Un fichier écrit par une version *plus récente* passe en lecture seule
  plutôt que d'être réécrit par un build ancien.
- **File de requêtes à deux voies** (`src/main/queue.ts`). AniList tolère ~30 requêtes/minute.
  Les appels déclarent une voie : ce que l'utilisateur attend passe devant le travail de fond,
  et les requêtes identiques sont mutualisées plutôt que répétées.


## Pourquoi un script d'installation d'Electron

Le binaire Electron (~110 Mo) n'est pas dans le
paquet npm : il est téléchargé par un script d'installation. Ce script échoue dans deux cas
courants, et l'app refuse alors de démarrer avec `Error: Electron uninstall` :

1. sur Node < 20.19, le postinstall d'`electron@43` fait un `require()` sur `@electron/get`
   devenu ESM-only → `ERR_REQUIRE_ESM` ;
2. sur npm ≥ 11, les scripts d'installation des dépendances tierces sont bloqués par défaut
   (`npm approve-scripts`), donc celui d'Electron ne s'exécute pas du tout.

Le script maison est branché en `postinstall` de *ce* paquet — donc toujours autorisé — et
refait le travail via `import()` dynamique. Il ne fait rien si le binaire est déjà là.

Les autres scripts bloqués par npm 11 (`esbuild`, `electron-winstaller`) n'ont pas d'impact :
esbuild passe par ses paquets de binaires optionnels, et `electron-winstaller` ne sert qu'à la
cible Squirrel, alors qu'on package en NSIS.

## Pourquoi la bande-annonce passe par un serveur local

Le lecteur intégré de YouTube refuse
de démarrer quand la page qui l'intègre n'envoie pas d'en-tête `Referer` : il répond
*erreur 153*. Le renderer packagé est chargé depuis `file://`, qui n'en envoie aucun. Mesuré et
non supposé : charger l'URL d'intégration comme page principale échoue pareil, elle n'envoie pas
de referrer non plus.

Le lecteur est donc enveloppé dans une page servie depuis `http://127.0.0.1:<port>`, et c'est
*elle* que la fiche met dans une iframe. Le navigateur envoie alors un `Referer` véridique pour
une page qui intègre réellement la vidéo, et le lecteur démarre — dans la fiche, sans fenêtre
séparée. Rien n'est falsifié : l'autre solution, forcer un `httpReferrer` de `youtube.com`,
consisterait à revendiquer une origine qui n'est pas la nôtre.

Le serveur écoute sur `127.0.0.1` uniquement, sur un port éphémère, derrière un chemin
aléatoire, ne sert qu'un seul type de page et rien depuis le disque. L'identifiant vidéo est
validé contre l'alphabet de YouTube avant toute interpolation. La page embarque sa propre CSP :
elle peut encadrer YouTube et rien d'autre, et n'exécute aucun script.

Deux ajustements côté app ont été nécessaires, tous deux vérifiés par capture. La CSP autorise
`frame-src http://127.0.0.1:*`. Et surtout, son injection est désormais **limitée au document
principal** : elle était appliquée à *toutes* les réponses, y compris celles de YouTube, si bien
que `script-src 'self'` bloquait les propres scripts du lecteur. C'est ce qui rendait la
première tentative entièrement noire — imposer notre CSP à un tiers n'avait de toute façon aucun
sens.

Certaines chaînes désactivent l'intégration de leurs vidéos. Le lecteur affiche alors sa propre
erreur avec un lien « regarder sur YouTube », qui ouvre le vrai navigateur. Sur les 48 bandes-
annonces des animes les plus populaires d'AniList, l'intégration était autorisée dans 48 cas.

## Audit des dépendances

`npm audit` remonte des alertes « high » sur l'arbre d'`electron-builder`
(`brace-expansion` → `minimatch` → `glob`…). Ce sont des dépendances de développement utilisées
au packaging uniquement ; rien de tout ça n'est embarqué dans l'application distribuée.

## Régénérer les captures

```bash
npm run screenshots           # écrit dans docs/screenshots/
npm run screenshots docs/tmp  # ou ailleurs
```

Le script construit une bibliothèque de démonstration, l'écrit dans un dossier de données
jetable, puis lance l'app dessus avec `--screenshots` : elle parcourt ses propres pages et
capture chacune via `webContents.capturePage()`. Une capture d'écran système ne conviendrait pas
— il faut naviguer, et seule l'app peut le faire — et elle embarquerait la barre des tâches.

Trois choix qui expliquent le résultat :

- **La vraie bibliothèque n'est jamais lue.** Le dossier de données est temporaire et supprimé
  après coup. Les fiches sont publiques, la progression est inventée.
- **L'historique est inventé par grappes, et va jusqu'à aujourd'hui.** Un étalement régulier
  donne une heatmap grise, une série de jours à zéro et « ces 7 jours : 0 épisode ». Les épisodes
  sont donc posés à rebours depuis un jour de fin, en séances de trois à cinq.
- **Le casting est fixe, sauf les séries en diffusion.** Celles-là sont demandées à AniList au
  moment du tir, sinon le calendrier serait vide. Deux captures successives ne sont donc pas
  strictement identiques.

Les images sont en JPEG et non en PNG : ce sont surtout des jaquettes, que PNG stocke mal — les
mêmes huit pages pesaient 8,7 Mo en PNG contre 1,7 Mo ici.

## Publier une mise à jour

```bash
# 1. incrémenter "version" dans package.json
# 2. exporter un jeton GitHub ayant le droit d'écrire les releases
export GH_TOKEN=...
npm run release
```

`npm run release` construit l'installeur puis l'envoie par `scripts/publish-release.mjs`.

Ce script existe pour une raison mesurée : `electron-builder --publish always` envoie ses trois
fichiers en parallèle, et chacun, ne trouvant pas de release pour le tag, la crée. Deux fois de
suite la course a produit **deux releases sur un même tag** — le blockmap sur l'une, l'installeur
et le `latest.yml` sur l'autre. Or seule celle qui possède le tag répond aux URLs de
téléchargement : le manifeste renvoyait 404 et chaque app installée se croyait à jour. Le script
crée la release une fois, puis envoie les trois fichiers l'un après l'autre.

Il refuse aussi de partir si le `latest.yml` ne décrit pas l'installeur posé à côté — le mélange
de deux builds dans `release/` a déjà coûté une version — et s'arrête net s'il voit deux releases
sur un même tag. Il vérifie enfin que le `latest.yml` répond bien par l'URL du tag, seule preuve
qui compte.

`electron-updater` ne lit pas la page de release : il lui faut ce `latest.yml`. Envoyer le `.exe`
à la main ne suffit donc pas.

Le corps de la release vient de `CHANGELOG.md` : une section `## <version>`, des rubriques
`### Ajouts`, `### Modifications`, `### Corrections`. Le script refuse de publier une version dont
la section manque — sans elle, la fenêtre « Quoi de neuf » resterait vide chez tout le monde.

Côté application, le cycle est entièrement automatique : recherche au lancement puis toutes
les six heures, téléchargement seul dès qu'une version paraît, installation en silence à la
fermeture de l'app — `electron-updater` passe `/S` à l'installeur NSIS, aucun assistant
n'apparaît. « Redémarrer maintenant » emprunte le même chemin silencieux et rouvre l'app. Une
notification annonce la version prête, et le réglage « Mise à jour automatique » ramène les trois
étapes à des boutons.

Ce que l'app ne fait pas : se fermer d'elle-même pour installer. Remplacer une application en
cours d'usage se décide par celui qui l'utilise.

Une limite à connaître : l'application n'est **pas signée**. Windows SmartScreen avertit à la
première installation, celle faite à la main depuis le `.exe` téléchargé par un navigateur. La
mise à jour, elle, n'est pas concernée : le fichier arrive par Node sans marque de provenance,
donc sans contrôle de réputation.


## Feuille de route

- [x] Importeur TV Time / OpenTV intégré à l'app
- [x] Interface de revisionnage
- [x] Édition de l'historique (corriger une date, retirer un épisode)
- [x] Notes et ressentis par épisode
- [x] Listes personnalisées et actions groupées
- [x] Lecteur de fichiers locaux
- [x] Liens vers l'épisode, et pas seulement vers la série
- [x] Notes de version affichées dans l'app
- [x] Notifications par série, avec délai configurable
- [x] Accessibilité et découpage du bundle
- [x] Écriture incrémentale du store
- [x] Mise à jour automatique
- [x] Captures d'écran générées (`npm run screenshots`, jeu de démo)
- [x] « À rattraper » : ce qui est sorti et qu'on n'a pas vu

Écarté : corriger les dates de diffusion à la main. AniList les fournit, et une
saisie manuelle serait une deuxième source de vérité à maintenir pour un cas rare.
