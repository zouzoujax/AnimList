import type { ReleaseNote } from './release-notes'
import type { MangaOrigin } from './origin'
import type { TasteFacet } from './taste'
export type MediaFormat = 'TV' | 'TV_SHORT' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'MUSIC'
export type MediaStatus = 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS'
export type SeasonName = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL'
export type LibraryStatus = 'watching' | 'planned' | 'completed' | 'paused' | 'dropped'
export type EmotionId = 'love' | 'hype' | 'cry' | 'laugh' | 'mind' | 'chill' | 'scared' | 'bored'
export type TitleLang = 'romaji' | 'english' | 'native'
export type ThemeId = 'nebula' | 'paper' | 'terminal' | 'synth'

export interface ThemeDef {
  id: ThemeId
  name: string
  hint: string
  swatch: [string, string]
  /** Native Windows caption buttons have to match the active theme. */
  titlebar: { color: string; symbolColor: string }
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
    titlebar: { color: '#FFFFFF', symbolColor: '#3A362F' }
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
  }
]

export function chromeFor(theme: ThemeId): { color: string; symbolColor: string } {
  return (THEMES.find((t) => t.id === theme) ?? THEMES[0]).titlebar
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
  defaultRuntime: number
  showAdult: boolean
  weekStart: 0 | 1
  lastAiringCheck: number
  /**
   * Télécharge une nouvelle version dès qu'elle paraît, et l'installe à la
   * fermeture de l'app. Coupé, tout reste manuel depuis les Réglages.
   */
  autoUpdate: boolean
  /** Add a series' sequels to the library on their own, once they have aired. */
  autoSequels: boolean
  /**
   * Sequels already offered. Kept even after the user removes one, so a series
   * they deliberately deleted is never silently put back.
   */
  sequelsAdded: number[]
  lastSequelSweep: number
  /**
   * Suite → série dont elle découle, relevé pendant le balayage des suites.
   * Sert à replier les saisons suivantes derrière leur saison mère dans la
   * bibliothèque, sans redemander la relation à AniList à chaque affichage.
   */
  sequelOf: Record<string, number>
  /** Hand corrections for the TV Time importer, keyed by source series id. */
  tvtimeOverrides: Record<string, number>
  /** Last export folder read, so a re-run can offer it straight away. */
  tvtimeFolder: string | null
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
  defaultRuntime: 24,
  showAdult: false,
  weekStart: 1,
  lastAiringCheck: 0,
  autoUpdate: true,
  autoSequels: true,
  sequelsAdded: [],
  lastSequelSweep: 0,
  sequelOf: {},
  tvtimeOverrides: {},
  tvtimeFolder: null
}
