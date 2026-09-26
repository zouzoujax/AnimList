import type { ReleaseNote } from './release-notes'
import type { MangaOrigin } from './origin'
import type { TasteFacet } from './taste'
export type MediaFormat = 'TV' | 'TV_SHORT' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'MUSIC'
export type MediaStatus = 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS'
export type SeasonName = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL'
export type LibraryStatus = 'watching' | 'planned' | 'completed' | 'paused' | 'dropped'
export type EmotionId = 'love' | 'hype' | 'cry' | 'laugh' | 'mind' | 'chill' | 'scared' | 'bored'
export type TitleLang = 'romaji' | 'english' | 'native'
export type ThemeId =
  | 'nebula'
  | 'paper'
  | 'terminal'
  | 'synth'
  | 'indigo'
  | 'oled'
  | 'manga'
  | 'arcade'
  | 'cyber'
  | 'kawaii'
  | 'liquid'
  | 'bento'
  | 'boreal'
  | 'ds-ardoise'
  | 'ds-carbon'
  | 'xp-streaming'
  | 'xp-console'
  | 'xp-magazine'
  | 'xp-hud'
  | 'xp-carnet'

/**
 * Une « expérience » ne se contente pas d'habiller l'app : elle remplace la
 * navigation, l'accueil, la bibliothèque et les transitions (voir
 * renderer/src/experiences).
 */
export type ExperienceId = 'streaming' | 'console' | 'magazine' | 'hud' | 'carnet'

export interface ThemeDef {
  id: ThemeId
  name: string
  hint: string
  swatch: [string, string]
  /** Native Windows caption buttons have to match the active theme. */
  titlebar: { color: string; symbolColor: string }
  /** Fond clair : le texte posé sur une jaquette assombrie reprend des jetons sombres. */
  light?: boolean
  /** Accent appliqué quand on choisit le thème ; sans lui, l'accent par défaut. Modifiable ensuite. */
  accent?: string
  /** Présent : le thème refait la mise en page, pas seulement l'habillage. */
  experience?: ExperienceId
}

export const THEMES: ThemeDef[] = [
  {
    id: 'nebula',
    name: 'Nébuleuse',
    hint: 'Verre dépoli, aurore, néons doux',
    swatch: ['#0a0c18', '#7c5cff'],
    titlebar: { color: '#0B0E1A', symbolColor: '#C9D0EA' }
  },
  {
    id: 'paper',
    name: 'Papier',
    hint: 'Clair, éditorial, sans effets',
    swatch: ['#f6f4ef', '#1c1a17'],
    titlebar: { color: '#FFFFFF', symbolColor: '#3A362F' },
    light: true
  },
  {
    id: 'terminal',
    name: 'Terminal',
    hint: 'Monospace, angles vifs, contraste',
    swatch: ['#05070a', '#2bff88'],
    titlebar: { color: '#080B10', symbolColor: '#92A49B' }
  },
  {
    id: 'synth',
    name: 'Synthwave',
    hint: 'Saturé, arrondi, néon assumé',
    swatch: ['#1a0b2e', '#ff2e97'],
    titlebar: { color: '#210D3A', symbolColor: '#C9A4DC' }
  },

  {
    id: 'indigo',
    name: 'Indigo',
    hint: 'Suisse et sombre, un trait de lumière en bordure',
    swatch: ['#0b1120', '#6366f1'],
    titlebar: { color: '#0F172A', symbolColor: '#A3B0C2' },
    accent: '#6366f1'
  },
  {
    id: 'oled',
    name: 'OLED',
    hint: 'Noir pur, étoiles filantes',
    swatch: ['#000000', '#22c55e'],
    titlebar: { color: '#000000', symbolColor: '#A1A1AA' },
    accent: '#22c55e'
  },
  {
    id: 'manga',
    name: 'Manga',
    hint: 'Cases encrées, trame de points',
    swatch: ['#fff7ed', '#f97316'],
    titlebar: { color: '#FFF7ED', symbolColor: '#0F172A' },
    light: true,
    accent: '#f97316'
  },
  {
    id: 'arcade',
    name: 'Arcade',
    hint: 'Pixels, polices 8 bits, grille qui clignote',
    swatch: ['#0f172a', '#22c55e'],
    titlebar: { color: '#0B1222', symbolColor: '#A3B0C2' },
    accent: '#22c55e'
  },
  {
    id: 'cyber',
    name: 'Cyberpunk',
    hint: 'HUD, angles coupés, grille qui s’allume',
    swatch: ['#0f0f23', '#f43f5e'],
    titlebar: { color: '#0B0B1C', symbolColor: '#B8ACD9' },
    accent: '#f43f5e'
  },
  {
    id: 'kawaii',
    name: 'Kawaii',
    hint: 'Pastel, tout arrondi, bulles',
    swatch: ['#fdf2f8', '#ec4899'],
    titlebar: { color: '#FFF7FB', symbolColor: '#7A4A63' },
    light: true,
    accent: '#ec4899'
  },
  {
    id: 'liquid',
    name: 'Liquid Glass',
    hint: 'Verre sombre, reflet d’or qui tourne',
    swatch: ['#0c0a09', '#ca8a04'],
    titlebar: { color: '#1C1917', symbolColor: '#D6D3D1' },
    accent: '#ca8a04'
  },
  {
    id: 'bento',
    name: 'Bento',
    hint: 'Blocs noirs, chiffres d’affiche, bordure sous le curseur',
    swatch: ['#0a0a0a', '#ec4899'],
    titlebar: { color: '#0A0A0A', symbolColor: '#A3A3A3' },
    accent: '#ec4899'
  },
  {
    id: 'boreal',
    name: 'Aurore',
    hint: 'Nuit polaire, rideaux de lumière',
    swatch: ['#050816', '#2dd4bf'],
    titlebar: { color: '#0A0F24', symbolColor: '#AAB6D3' },
    accent: '#2dd4bf'
  },

  {
    id: 'ds-ardoise',
    name: 'Ardoise',
    hint: 'Neutres froids, bleu, rayons moyens',
    swatch: ['#020617', '#3b82f6'],
    titlebar: { color: '#0F172A', symbolColor: '#CBD5E1' },
    accent: '#3b82f6'
  },
  {
    id: 'ds-carbon',
    name: 'Carbon',
    hint: 'Gris industriels, angles droits',
    swatch: ['#161616', '#0f62fe'],
    titlebar: { color: '#161616', symbolColor: '#C6C6C6' },
    accent: '#0f62fe'
  },

  {
    id: 'xp-streaming',
    name: 'Streaming',
    hint: 'Bannière plein écran, rangées qui défilent, menu en haut',
    swatch: ['#0b0b0f', '#e50914'],
    titlebar: { color: '#0B0B0F', symbolColor: '#B3B3B3' },
    accent: '#e50914',
    experience: 'streaming'
  },
  {
    id: 'xp-console',
    name: 'Console',
    hint: 'Tuiles géantes, focus animé, menu horizontal de console',
    swatch: ['#0a1330', '#4f8cff'],
    titlebar: { color: '#0A1330', symbolColor: '#AFC3E8' },
    accent: '#4f8cff',
    experience: 'console'
  },
  {
    id: 'xp-magazine',
    name: 'Magazine',
    hint: 'Pages en cases, gros titres, lecture comme un numéro papier',
    swatch: ['#f4efe6', '#d7261e'],
    titlebar: { color: '#F4EFE6', symbolColor: '#1A1A1A' },
    light: true,
    accent: '#d7261e',
    experience: 'magazine'
  },
  {
    id: 'xp-hud',
    name: 'Cockpit',
    hint: 'Panneaux, jauges et données partout, façon HUD',
    swatch: ['#050a0a', '#22d3ee'],
    titlebar: { color: '#050A0A', symbolColor: '#7FA9A6' },
    accent: '#22d3ee',
    experience: 'hud'
  },
  {
    id: 'xp-carnet',
    name: 'Carnet',
    hint: 'Étagères de jaquettes, cartes à collectionner',
    swatch: ['#2b2118', '#e0a458'],
    titlebar: { color: '#2B2118', symbolColor: '#D9C5A7' },
    accent: '#e0a458',
    experience: 'carnet'
  }
]

export function chromeFor(theme: ThemeId): { color: string; symbolColor: string } {
  return (THEMES.find((t) => t.id === theme) ?? THEMES[0]).titlebar
}

/** Couleur de départ d'un thème, celle que « Couleur du thème » rétablit. */
export function accentFor(theme: ThemeId): string {
  return THEMES.find((t) => t.id === theme)?.accent ?? DEFAULT_PREFS.accent
}

/** Where the navigation lives and how densely pages are composed. */
export type LayoutId = 'classic' | 'rail' | 'topbar' | 'dashboard'

export const LAYOUTS: { id: LayoutId; name: string; hint: string }[] = [
  { id: 'classic', name: 'Classique', hint: 'Menu latéral libellé, sections empilées' },
  { id: 'rail', name: 'Rail compact', hint: 'Menu en icônes, grilles denses' },
  { id: 'topbar', name: 'Barre haute', hint: 'Navigation dans l’en-tête, pleine largeur' },
  { id: 'dashboard', name: 'Tableau de bord', hint: 'Accueil en tuiles côte à côte' }
]

export interface Media {
  id: number
  idMal: number | null
  title: { romaji: string; english: string | null; native: string | null }
  cover: { large: string; xl: string; color: string | null }
  banner: string | null
  format: MediaFormat | null
  status: MediaStatus | null
  episodes: number | null
  duration: number | null
  season: SeasonName | null
  seasonYear: number | null
  /** Absent on rows cached before this field existed — always guard it. */
  startDate?: { year: number | null; month: number | null; day: number | null } | null
  genres: string[]
  studios: string[]
  averageScore: number | null
  popularity: number
  description: string | null
  nextAiring: { episode: number; airingAt: number } | null
  trailer: { id: string; site: string } | null
  cachedAt: number
}

export interface CharacterRef {
  id: number
  name: string
  image: string | null
  role: string
  va: string | null
  vaImage: string | null
  /** Identifiant du doubleur, pour ouvrir ses autres rôles. */
  vaId: number | null
}

/** Un personnage ou un doubleur, et les séries où on le retrouve. */
export interface PersonWorks {
  id: number
  kind: 'character' | 'staff'
  name: string
  image: string | null
  /** Chaque série, avec le rôle qui y est tenu. */
  roles: { media: Media; role: string | null }[]
}

/** Ce qu'on peut suivre. Un personnage, non : il ne sort rien de nouveau. */
export type FollowKind = 'staff' | 'studio'

export interface Follow {
  /** `staff:97042`, `studio:Bones` — stable, et unique par suivi. */
  key: string
  kind: FollowKind
  /** L'identifiant AniList pour une personne, le nom pour un studio. */
  ref: number | string
  name: string
  image: string | null
  addedAt: number
  /**
   * Ce que la personne ou le studio avait déjà produit au moment du suivi.
   *
   * C'est la référence contre laquelle une nouveauté se mesure : suivre
   * quelqu'un ne doit pas annoncer les vingt séries qu'il a déjà faites.
   */
  known: number[]
  /** Trouvé depuis, et pas encore regardé par l'utilisateur. */
  fresh: number[]
  lastCheck: number
}

/** Une nouveauté, avec le suivi qui l'a fait remonter. */
export interface FollowNews {
  follow: Follow
  media: Media[]
}

export interface MediaRef {
  id: number
  title: string
  cover: string
  format: string | null
  extra: string | null
  /**
   * Manga, manhwa ou manhua, pour les œuvres écrites seulement.
   *
   * Absente sur les relations d'anime : la question ne s'y pose pas.
   */
  origin?: MangaOrigin
}

export interface EpisodeMeta {
  number: number
  title: string | null
  thumbnail: string | null
  url: string | null
}

export interface MediaDetail extends Media {
  tags: string[]
  links: { site: string; url: string }[]
  characters: CharacterRef[]
  relations: MediaRef[]
  /**
   * Le manga dont la série est tirée, ou qu'elle a inspiré. À part des autres
   * relations : celles-là s'ouvrent sur une fiche d'anime, celui-ci n'en a pas.
   */
  manga: MediaRef[]
  recommendations: MediaRef[]
  episodeMeta: EpisodeMeta[]
}

/**
 * Où en est le catalogue AniList, vu du processus principal.
 *
 * `paused` : panne déclarée, on se tait jusqu'à `until`. `throttled` : trop de
 * requêtes, AniList a demandé d'attendre jusqu'à `until`. `offline` : le
 * réseau lui-même ne répond pas.
 */
export interface ApiStatus {
  state: 'ok' | 'paused' | 'throttled' | 'offline'
  until?: number
  message?: string
  /** La plus ancienne donnée servie depuis le cache pendant la panne, en millisecondes. */
  staleAt?: number
  /** Les requêtes ratées qui repartiront d'elles-mêmes au retour du service. */
  pending?: number
  /** Le prochain essai de la sonde, quand elle attend. */
  probeAt?: number
}

export interface Entry {
  animeId: number
  status: LibraryStatus
  addedAt: number
  updatedAt: number
  score: number | null
  emotions: EmotionId[]
  favorite: boolean
  notes: string
  rewatches: number
  startedAt: number | null
  finishedAt: number | null
  /**
   * Whether to be told when an episode of this series airs. Absent means yes,
   * so muting is opt-in and existing files keep working.
   */
  notify?: boolean
}

export type EntryPatch = Partial<Omit<Entry, 'animeId' | 'addedAt' | 'updatedAt'>>

/**
 * Où en est l'épisode qui joue, poussé du processus principal vers les fenêtres.
 *
 * Partagé plutôt que défini côté principal : le préchargement et la grille
 * d'épisodes s'en servent tous les deux, et un type qui traverse le pont n'a
 * rien à faire dans le seul module qui l'émet.
 */
export interface WatchProgress {
  animeId: number
  episode: number
  /** Entre 0 et 1. */
  ratio: number
}

export interface WatchEvent {
  animeId: number
  episode: number
  at: number
  minutes: number
  /**
   * Set when the episode came from an import. Such rows carry the date the
   * episode was *ticked* in the source app, not when it was watched, so they
   * must stay out of day-based stats (best day, streaks, heatmap, monthly).
   */
  imported?: boolean
  /**
   * Épisode marqué « à revoir ».
   *
   * Distinct d'une note : on n'a rien à en dire, on veut juste le retrouver.
   * Absent plutôt que `false` — la grande majorité des lignes ne le sont pas,
   * et le journal est réécrit en entier à chaque correction.
   */
  pinned?: boolean
  /**
   * Which viewing this belongs to: absent or `0` is the first watch, `1` the
   * first rewatch, and so on. Only the pass matching the entry's `rewatches`
   * counts as "currently seen"; earlier passes stay in the history so watch
   * time and per-episode notes survive a restart.
   */
  pass?: number
  /** Free note written about this particular viewing. */
  note?: string
  /** How this viewing felt. */
  emotions?: EmotionId[]
}

/** Identifies one watch event. Three fields, because a rewatch repeats an episode. */
export interface WatchEventRef {
  animeId: number
  episode: number
  pass: number
}

export type WatchEventPatch = Partial<Pick<WatchEvent, 'at' | 'minutes' | 'note' | 'emotions' | 'pinned'>>

/** Les pages que le nouveau design sait refaire, chacune activable à part. */
export type NewDesignPage =
  | 'home'
  | 'library'
  | 'discover'
  | 'calendar'
  | 'season'
  | 'manga'
  | 'stats'
  | 'journal'
  | 'detail'
  | 'studio'
  | 'person'

export const NEW_DESIGN_PAGES: { id: NewDesignPage; label: string; hint: string }[] = [
  { id: 'home', label: 'Accueil', hint: 'Frise d’épisodes, file « À regarder », semaine de diffusion' },
  { id: 'library', label: 'Bibliothèque', hint: 'Onglets par statut, une ligne par série avec sa frise' },
  { id: 'discover', label: 'Découvrir', hint: 'Grande recherche, recommandations expliquées' },
  { id: 'calendar', label: 'Calendrier', hint: 'Grille de programme : matin, après-midi, soirée, nuit' },
  { id: 'season', label: 'Tri de la saison', hint: 'Cartes à trancher, lignes pour celles que tu suis déjà' },
  { id: 'manga', label: 'Manga', hint: 'Origine et sens de lecture en tête, étagères' },
  { id: 'stats', label: 'Statistiques', hint: 'Ton visionnage raconté en phrases, badges en liste' },
  { id: 'journal', label: 'Journal', hint: 'Journées annoncées en toutes lettres, visionnages en lignes' },
  { id: 'detail', label: 'Fiche d’un anime', hint: 'Frise dans l’en-tête, sommaire qui suit la lecture' },
  { id: 'studio', label: 'Studio', hint: 'Ce que tu as vu en lignes, le reste en affiches' },
  { id: 'person', label: 'Personnage et doubleur', hint: 'Rôles déjà vus en tête, avec le nom du rôle' }
]

export interface Prefs {
  titleLang: TitleLang
  theme: ThemeId
  layout: LayoutId
  accent: string
  mica: boolean
  notifications: boolean
  /**
   * How long before an episode airs to be told, in minutes. `0` means "when it
   * airs"; a negative value is not allowed. A lead time only works for episodes
   * AniList has scheduled, so a catch-up sweep still covers the rest.
   */
  notifyLeadMinutes: number
  /** Minutes between airing checks. Lower means fresher and more requests. */
  notifyEveryMinutes: number
  reduceMotion: boolean
  /**
   * Le nouveau design (frise d'épisodes, phrases plutôt qu'étiquettes, lignes
   * par série). Éteint, toutes les pages gardent leur forme d'origine ; allumé,
   * `newDesignPages` dit lesquelles changent.
   */
  newDesign: boolean
  newDesignPages: Record<NewDesignPage, boolean>
  defaultRuntime: number
  showAdult: boolean
  weekStart: 0 | 1
  lastAiringCheck: number
  /** Les séries de la saison écartées d'un « Pas pour moi », hors bibliothèque. */
  seasonSkipped: number[]
  /**
   * Télécharge une nouvelle version dès qu'elle paraît, et l'installe à la
   * fermeture de l'app. Coupé, tout reste manuel depuis les Réglages.
   */
  autoUpdate: boolean
  /**
   * Coche l'épisode tout seul quand la lecture en atteint les neuf dixièmes,
   * chez Anime-Sama. Le reste est le générique de fin.
   */
  /**
   * Proposer de passer les génériques, quand un minutage existe.
   *
   * Allumé : un bouton dans le coin du lecteur, qu'on ignore sans conséquence.
   */
  skipHint: boolean
  /**
   * Les passer sans rien demander.
   *
   * Éteint par défaut, et ce n'est pas de la prudence de façade : le minutage
   * vient d'inconnus, sur une copie qui n'est pas forcément la nôtre. Un
   * bouton ignoré ne coûte rien ; un saut de travers coupe une scène.
   */
  autoSkip: boolean
  autoTick: boolean
  /**
   * Enchaîne sur l'épisode suivant à la fin du précédent, après un compte à
   * rebours annulable posé dans le lecteur.
   */
  autoNext: boolean
  /** Add a series' sequels to the library on their own, once they have aired. */
  autoSequels: boolean
  /**
   * Sequels already offered. Kept even after the user removes one, so a series
   * they deliberately deleted is never silently put back.
   */
  sequelsAdded: number[]
  lastSequelSweep: number
  /** Prévenir quand un manga suivi finit de paraître, ou qu'un anime en est tiré. */
  mangaAlerts: boolean
  /**
   * Ce qu'on savait de chaque manga suivi au dernier passage : fini ou non, et
   * les animes qui en sont tirés. Un relevé de ce qui a déjà été vu, rangé
   * ici comme `sequelsAdded` ; les règles sont dans `shared/manga-watch.ts`.
   */
  mangaSeen: Record<string, MangaSeen>
  lastMangaSweep: number
  /**
   * Ce qui remplit le bas de la barre latérale, au-dessus de « Ces 7 jours » :
   * voir `components/SidebarWidget.tsx`.
   */
  sidebarWidget: SidebarWidget
  /**
   * Suite → série dont elle découle, relevé pendant le balayage des suites.
   * Sert à replier les saisons suivantes derrière leur saison mère dans la
   * bibliothèque, sans redemander la relation à AniList à chaque affichage.
   */
  sequelOf: Record<string, number>
  /**
   * Clé DeepL, collée par l'utilisateur, pour traduire les textes d'AniList.
   *
   * Vide par défaut, et aucune clé n'est embarquée : en glisser une dans un
   * dépôt public reviendrait à l'offrir. Sans clé, les résumés restent
   * anglais et l'app marche comme avant.
   */
  deeplKey: string
  /** Traduire les résumés et les titres d'épisodes, quand une clé est posée. */
  translate: boolean
  /**
   * Annoncer sur Discord l'anime en cours de lecture.
   *
   * Éteint par défaut, et ce n'est pas de la prudence de façade : c'est la
   * seule chose de cette app qui sorte du PC de sa propre initiative. Tous ceux
   * qui voient ton profil verraient le titre.
   */
  discord: boolean
  /**
   * Identifiant de l'application Discord, celui qui donne le nom affiché en
   * gros. Public par nature — il voyage dans le statut de tous ceux qui s'en
   * servent — mais modifiable pour qui préfère créer la sienne.
   */
  discordAppId: string
  /** N'annoncer que « Un anime » : ni titre, ni jaquette, ni épisode. */
  discordHideTitle: boolean
  /**
   * Le mot de passe de la télécommande, quand on préfère le choisir.
   *
   * Vide, c'est le comportement d'origine : un mot de passe tiré au hasard à
   * chaque allumage, qu'on rescanne. Rempli, le lien ne change plus et se met
   * en favori sur le téléphone — au prix d'un secret qui dure. Les règles
   * qu'il doit tenir sont dans `shared/remote.ts`.
   */
  remotePassword: string
  /** Hand corrections for the TV Time importer, keyed by source series id. */
  tvtimeOverrides: Record<string, number>
  /** Last export folder read, so a re-run can offer it straight away. */
  tvtimeFolder: string | null
  /**
   * Les badges déjà obtenus, et le jour où ils sont tombés.
   *
   * Les badges se recalculent depuis l'historique et ne sont écrits nulle
   * part : sans ce registre, rien ne peut dire quand l'un d'eux a été gagné,
   * ni qu'il vient de l'être. Rangé dans les réglages comme `sequelsAdded`,
   * pour la même raison — c'est un relevé de ce qui a déjà eu lieu, pas une
   * donnée de la bibliothèque.
   *
   * `null` veut dire que le registre n'a jamais été tenu : les règles sont
   * dans `shared/badge-log.ts`, et le premier inventaire se fait en silence.
   */
  badgesAt: Record<string, number> | null
  /** Un son quand un badge tombe. L'animation, elle, suit `reduceMotion`. */
  badgeSound: boolean
  /**
   * Où déposer la sauvegarde automatique, hors du dossier de données.
   *
   * `null` tant qu'on n'a rien choisi : personne ne veut d'un dossier décidé à
   * sa place, et le seul endroit qui vaille — un autre disque, un dossier
   * synchronisé — ne se devine pas. Les règles sont dans `shared/backups.ts`.
   */
  backupFolder: string | null
  /** Quand la dernière copie a été écrite. Zéro tant qu'il n'y en a pas eu. */
  backupAt: number
  /**
   * Prévenir aussi sur le téléphone, par ntfy. Éteint par défaut : allumer
   * envoie un titre et un numéro d'épisode au serveur choisi. Les règles sont
   * dans `shared/phone-push.ts`.
   */
  phonePush: boolean
  /** Le serveur ntfy : le public, ou le sien. */
  phonePushServer: string
  /** Le sujet, tiré au hasard à l'allumage. Il fait office de mot de passe. */
  phonePushTopic: string
  /**
   * Les surnoms donnés à une série, par identifiant.
   *
   * « jjk », « le truc des sorciers » : ce que tu tapes pour la retrouver et
   * qu'aucun de ses trois titres ne contient. Dans les préférences et non dans
   * l'entrée de bibliothèque, comme `sequelOf` et `tvtimeOverrides` : c'est un
   * réglage de recherche, pas une donnée du registre, et l'y mettre
   * demanderait une migration pour un champ qu'on peut retaper en deux
   * secondes.
   */
  aliases: Record<string, string[]>
}

/** Ce que les Réglages montrent de la sauvegarde automatique. */
/** Une copie du dossier de sauvegarde automatique. */
export interface BackupCopy {
  name: string
  at: number
  bytes: number
}

export interface BackupStatus {
  folder: string | null
  /** La plus récente trouvée dans le dossier, relue depuis son nom. */
  lastAt: number
  count: number
  /** Dossier introuvable, disque plein… : à afficher tel quel. */
  error: string | null
}

/** A user-made collection, orthogonal to the five statuses. */
export interface CustomList {
  id: string
  name: string
  emoji: string
  /** Membership order is the user's, so it is an array rather than a set. */
  animeIds: number[]
  createdAt: number
  updatedAt: number
}

export interface Snapshot {
  version: number
  entries: Entry[]
  media: Media[]
  history: WatchEvent[]
  prefs: Prefs
  /** Optional: this type doubles as the shape of a restored backup, and files
   * exported before custom lists existed simply do not have the field. */
  lists?: CustomList[]
  /** Les mangas suivis. Optionnels pour la même raison que les listes. */
  mangaEntries?: MangaEntry[]
  /** Leurs fiches, pour que la liste de lecture tienne hors ligne. */
  mangas?: Manga[]
  reads?: ReadEvent[]
}

export interface PageInfo {
  currentPage: number
  hasNextPage: boolean
  total: number
}

export interface Paged<T> {
  items: T[]
  pageInfo: PageInfo
  stale: boolean
  /** Quand `stale` : la date de la réponse gardée qu'on sert à la place. */
  staleAt?: number
}

export interface StudioWorks extends Paged<Media> {
  studio: string
}

export type BrowseKind = 'trending' | 'popular' | 'top' | 'season' | 'upcoming' | 'search'

export interface BrowseQuery {
  kind: BrowseKind
  page?: number
  perPage?: number
  search?: string
  genre?: string
  format?: MediaFormat
  season?: SeasonName
  seasonYear?: number
}

/**
 * Un manga, tel qu'AniList le décrit.
 *
 * Volontairement à part de `Media` : un manga n'a ni épisodes, ni durée, ni
 * diffusion. Les fondre dans le même type obligerait à répondre « null » à la
 * moitié des questions que l'app pose d'une série, et à s'en souvenir partout.
 */
export interface Manga {
  id: number
  title: { romaji: string; english: string | null; native: string | null }
  cover: { large: string; xl: string; color: string | null }
  banner: string | null
  description: string | null
  chapters: number | null
  volumes: number | null
  status: string | null
  genres: string[]
  averageScore: number | null
  popularity: number
  startYear: number | null
  /**
   * Manga, manhwa ou manhua.
   *
   * Déduit du pays d'origine : AniList les range tous sous le même format,
   * alors que ce ne sont ni les mêmes objets ni le même sens de lecture.
   */
  origin: MangaOrigin
  /** Auteurs et dessinateurs, dans cet ordre. */
  staff: string[]
  siteUrl: string
}

export type MangaKind = 'trending' | 'popular' | 'top' | 'search'

/**
 * Un manga suivi.
 *
 * À part d'`Entry`, comme `Manga` est à part de `Media` : on lit des chapitres
 * et des tomes, on ne coche pas des épisodes d'une durée donnée. Les cinq
 * statuts sont les mêmes — seuls leurs mots changent (`READ_STATUS_LABELS`).
 *
 * La progression est un compteur et non une grille : on dit « j'en suis au
 * chapitre 214 », pas « j'ai lu le 1, le 2, le 3… ». Mille cases pour One
 * Piece n'aideraient personne.
 */
export interface MangaEntry {
  mangaId: number
  status: LibraryStatus
  addedAt: number
  updatedAt: number
  /** Chapitres lus. */
  chapter: number
  /** Tomes lus, pour qui lit en reliés. Indépendant des chapitres. */
  volume: number
  favorite: boolean
  notes: string
  /** Relectures commencées. La progression repart de zéro à chacune. */
  rereads: number
  startedAt: number | null
  finishedAt: number | null
}

export type SidebarWidget = 'none' | 'next' | 'tonight' | 'both' | 'lists'

/** Ce que le dernier passage a vu d'un manga suivi. Voir `shared/manga-watch.ts`. */
export interface MangaSeen {
  finished: boolean
  /** Les animes tirés de ce manga, annoncés ou non. */
  anime: number[]
}

export type MangaEntryPatch = Partial<Omit<MangaEntry, 'mangaId' | 'addedAt' | 'updatedAt'>>

/**
 * Une séance de lecture : les chapitres `from + 1` à `to`, lus à `at`.
 *
 * Une ligne par avancée plutôt qu'une par chapitre : rattraper quarante
 * chapitres en une soirée fait une ligne, et le journal reste court même
 * pour une série au long cours.
 */
export interface ReadEvent {
  mangaId: number
  from: number
  to: number
  at: number
  /** Relecture à laquelle appartient la séance ; absente pour la première lecture. */
  pass?: number
  /**
   * Rattrapage saisi d'un coup, et non lecture du jour : taper « 214 » en
   * ajoutant un manga lu depuis des années. Compté dans les totaux, jamais
   * dans ce qui se mesure au jour ou au mois — même règle que les épisodes
   * importés.
   */
  imported?: boolean
}

export interface AiringItem {
  mediaId: number
  episode: number
  airingAt: number
}

/** An airing slot that carries its own media, for shows outside the library. */
export interface AiringEntry extends AiringItem {
  media: Media
}

/**
 * Episodes that do not advance the source material, from MyAnimeList.
 * Numbers are episode numbers, not indices.
 */
export interface FillerInfo {
  filler: number[]
  recap: number[]
  /** Episodes MyAnimeList knows about; 0 means it has no list for this series. */
  total: number
}

/** One season of a franchise, as a position in its prequel/sequel chain. */
export interface SeasonEntry {
  id: number
  /** Numéro tel qu'un spectateur le compte, pas la position dans la chaîne. */
  number: number
  /** Cour d'une saison scindée : 2 pour « Part 2 », sinon null. */
  part: number | null
  title: string
  format: string | null
  status: string | null
  episodes: number | null
  year: number | null
  cover: string | null
}

export interface ImportReport {
  ok: boolean
  message: string
  added: number
  updated: number
  episodes: number
  skipped: number
}

// ---------------------------------------------------------------- TV Time

/** What became of one series of a TV Time / OpenTV export. */
export interface TvTimeShowResult {
  /** TheTVDB id, the key an override is stored under. */
  sourceId: string
  sourceName: string
  watched: number
  placed: number
  /** Match confidence, or `null` when the series was pinned by hand. */
  score: number | null
  status: 'ok' | 'partial' | 'unmatched' | 'skipped'
  chain: { id: number; title: string; took: number; of: number | null }[]
}

export interface TvTimeReport extends ImportReport {
  shows: TvTimeShowResult[]
  /** The folder that was read, kept so a re-run can skip the picker. */
  folder: string | null
  cancelled: boolean
}

export interface TvTimeProgress {
  done: number
  total: number
  label: string
}

/** A hand-made decision: a positive AniList id pins the match, `0` skips it. */
export type TvTimeOverrides = Record<string, number>

export const TVTIME_SKIP = 0

// ---------------------------------------------------------------- updates

export type UpdatePhase =
  | 'idle'
  | 'checking'
  /** Up to date. */
  | 'current'
  /** A newer version exists but has not been downloaded. */
  | 'available'
  | 'downloading'
  /** Downloaded and waiting for a restart. */
  | 'ready'
  | 'error'
  /** Running from source: there is no installed app to replace. */
  | 'unsupported'

export type { ReleaseNote, NoteKind, NoteSection } from './release-notes'

/**
 * Ce qui cloche dans la bibliothèque.
 *
 * Rien de tout cela n'empêche l'app de fonctionner — c'est pour ça que
 * personne ne le voit jamais. Un compte qui dérive de trois épisodes, une
 * fiche perdue depuis un import : ça se répare en une seconde quand c'est dit,
 * et ça reste indéfiniment quand ça ne l'est pas.
 */
export interface HealthReport {
  entries: number
  events: number
  /** Entrées suivies dont la fiche AniList manque : titre et jaquette absents. */
  missingMedia: { animeId: number; episodes: number }[]
  /** Visionnages rattachés à une série qui n'est plus dans la bibliothèque. */
  orphanEvents: { animeId: number; count: number }[]
  /** Épisodes cochés au-delà du total annoncé par AniList. */
  beyondTotal: { animeId: number; title: string; total: number; highest: number }[]
  /** Deux entrées différentes pour ce qui semble être la même œuvre. */
  duplicates: { title: string; ids: number[] }[]
  /** Fichiers du dossier de données qui ne servent plus. */
  strayFiles: { name: string; bytes: number; age: number }[]
}

/** Une série qu'AniList conseille à partir de ce que tu as déjà aimé. */
/** L'état du petit serveur qui sert la télécommande. */
export interface RemoteStatus {
  on: boolean
  /** Adresse à taper sur le téléphone, mot de passe compris. */
  url: string | null
  /** Adresse du calendrier des diffusions, à donner à un agenda. */
  ics: string | null
  token: string | null
  port: number
  error: string | null
}

/** Une scène reconnue dans une image. */
export interface FrameMatch {
  media: Media
  /** Numéro d'épisode. `null` pour un film, ou quand l'index l'ignore. */
  episode: number | null
  /** Bornes de la scène dans l'épisode, en secondes. */
  from: number
  to: number
  /** De 0 à 1. Au-dessus de 0,87 la correspondance est sûre. */
  similarity: number
  /** Vignette de la scène trouvée. */
  preview: string
}

export interface Identification {
  matches: FrameMatch[]
  /** Recherches consommées ce mois-ci, si le service a bien voulu le dire. */
  quota: { used: number; total: number } | null
}

/** Une recommandation, et ce qui la justifie. */
export interface ForYouPick {
  media: Media
  /** Note du profil. Sert au classement, pas à l'affichage. */
  score: number
  /** Pourquoi elle est là, en clair : « tu notes haut drama et psychologique ». */
  reasons: string[]
  /** Les titres de la bibliothèque que la communauté a reliés à celle-ci. */
  from: string[]
}

export interface ForYou {
  profile: {
    /**
     * Les genres qui ont vraiment porté le classement, déjà triés.
     *
     * Calculés là où le tri a lieu : la fenêtre ne doit pas refaire le calcul
     * de son côté, sinon elle finirait par annoncer un goût que le classement
     * n'a pas suivi.
     */
    top: TasteFacet[]
    genres: TasteFacet[]
    studios: TasteFacet[]
    /** Séries regardées qui ont servi à le construire. */
    sample: number
    /** Combien d'entre elles portent une note. Zéro change ce qu'on affiche. */
    scored: number
  }
  /** Le profil repose sur trop peu de séries pour être présenté comme un goût. */
  weak: boolean
  picks: ForYouPick[]
}

export interface Suggestion {
  media: Media
  /** Poids cumulé des recommandations de la communauté. */
  score: number
  /** Les titres de ta bibliothèque qui ont mené jusqu'à celle-ci. */
  from: string[]
}

/** Un fichier vidéo trouvé dans le dossier associé à une série. */
export interface LocalEpisode {
  /** Numéro lu dans le nom du fichier, ou `null` s'il est illisible. */
  episode: number | null
  name: string
  path: string
  /** URL du protocole maison, la seule que la fenêtre puisse ouvrir. */
  url: string
  /** Faux pour ce que Chromium ne décode pas : le système prend le relais. */
  playable: boolean
  subtitleUrl: string | null
  size: number
  /** Seconde où reprendre, relevée à la dernière lecture. `null` : au début. */
  resumeAt: number | null
  /** Durée connue du fichier, une fois qu'il a été lu au moins une fois. */
  duration: number | null
}

export interface LocalFolder {
  path: string
  /** Le dossier a été choisi puis déplacé ou supprimé. */
  missing: boolean
  episodes: LocalEpisode[]
}

export interface UpdateStatus {
  phase: UpdatePhase
  version: string | null
  percent: number
  message: string | null
  /** Ce que la mise à jour apporte, une entrée par version sautée. Vide tant
   *  qu'aucune version n'a été trouvée, ou si la release n'a pas de notes. */
  notes: ReleaseNote[]
}

export const EMOTIONS: { id: EmotionId; emoji: string; label: string }[] = [
  { id: 'love', emoji: '💜', label: 'Coup de cœur' },
  { id: 'hype', emoji: '🔥', label: 'Hype' },
  { id: 'cry', emoji: '😭', label: 'Larmes' },
  { id: 'laugh', emoji: '😂', label: 'Fou rire' },
  { id: 'mind', emoji: '🤯', label: 'Claque' },
  { id: 'chill', emoji: '🍵', label: 'Cosy' },
  { id: 'scared', emoji: '😱', label: 'Flippant' },
  { id: 'bored', emoji: '🥱', label: 'Longuet' }
]

export const STATUS_LABELS: Record<LibraryStatus, string> = {
  watching: 'En cours',
  planned: 'À voir',
  completed: 'Terminé',
  paused: 'En pause',
  dropped: 'Abandonné'
}

/** Les mêmes statuts, dits pour un manga : on le lit, on ne le regarde pas. */
export const READ_STATUS_LABELS: Record<LibraryStatus, string> = {
  watching: 'En lecture',
  planned: 'À lire',
  completed: 'Lu',
  paused: 'En pause',
  dropped: 'Abandonné'
}

export const FORMAT_LABELS: Record<string, string> = {
  TV: 'Série TV',
  TV_SHORT: 'Format court',
  MOVIE: 'Film',
  SPECIAL: 'Spécial',
  OVA: 'OAV',
  ONA: 'ONA',
  MUSIC: 'Clip'
}

export const GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller'
] as const

export const GENRE_LABELS: Record<string, string> = {
  Action: 'Action',
  Adventure: 'Aventure',
  Comedy: 'Comédie',
  Drama: 'Drame',
  Ecchi: 'Ecchi',
  Fantasy: 'Fantasy',
  Horror: 'Horreur',
  'Mahou Shoujo': 'Magical girl',
  Mecha: 'Mecha',
  Music: 'Musique',
  Mystery: 'Mystère',
  Psychological: 'Psychologique',
  Romance: 'Romance',
  'Sci-Fi': 'Science-fiction',
  'Slice of Life': 'Tranche de vie',
  Sports: 'Sport',
  Supernatural: 'Surnaturel',
  Thriller: 'Thriller'
}

export const DEFAULT_PREFS: Prefs = {
  titleLang: 'romaji',
  theme: 'nebula',
  layout: 'classic',
  accent: '#7C5CFF',
  mica: true,
  notifications: true,
  notifyLeadMinutes: 0,
  notifyEveryMinutes: 15,
  reduceMotion: false,
  newDesign: false,
  newDesignPages: {
    home: true,
    library: true,
    discover: true,
    calendar: true,
    season: true,
    manga: true,
    stats: true,
    journal: true,
    detail: true,
    studio: true,
    person: true
  },
  defaultRuntime: 24,
  showAdult: false,
  weekStart: 1,
  lastAiringCheck: 0,
  seasonSkipped: [],
  autoUpdate: true,
  skipHint: true,
  autoSkip: false,
  autoTick: true,
  autoNext: true,
  autoSequels: true,
  sequelsAdded: [],
  lastSequelSweep: 0,
  mangaAlerts: true,
  mangaSeen: {},
  lastMangaSweep: 0,
  sidebarWidget: 'next',
  sequelOf: {},
  deeplKey: '',
  translate: true,
  discord: false,
  discordAppId: '1544850319878656161',
  discordHideTitle: false,
  // Vide : le tirage au sort reste ce qui se passe quand on ne demande rien.
  remotePassword: '',
  tvtimeOverrides: {},
  tvtimeFolder: null,
  // `null` et non `{}` : une bibliothèque d'avant a déjà ses badges, et le
  // premier inventaire doit pouvoir les inscrire sans les fêter.
  badgesAt: null,
  badgeSound: true,
  backupFolder: null,
  backupAt: 0,
  phonePush: false,
  phonePushServer: 'https://ntfy.sh',
  phonePushTopic: '',
  aliases: {}
}
