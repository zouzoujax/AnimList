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
}

export interface MediaRef {
  id: number
  title: string
  cover: string
  format: string | null
  extra: string | null
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

export type WatchEventPatch = Partial<Pick<WatchEvent, 'at' | 'minutes' | 'note' | 'emotions'>>

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

export interface UpdateStatus {
  phase: UpdatePhase
  version: string | null
  percent: number
  message: string | null
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
