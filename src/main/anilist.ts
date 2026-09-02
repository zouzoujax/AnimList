import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { baseAndSeason, compact, seasonNumbers } from '@shared/titles'
import { applyBudget } from '@shared/cache-budget'
import { originOf } from '@shared/origin'
import { matchStreamEpisodes } from '@shared/stream-episodes'
import { createQueue, type Lane } from './queue'
import type { ImportCandidate } from './tvtime/chain'
import type {
  AiringEntry,
  AiringItem,
  BrowseQuery,
  FollowKind,
  Media,
  MediaDetail,
  Manga,
  MangaKind,
  Paged,
  PageInfo,
  PersonWorks,
  StudioWorks,
  SeasonEntry,
  SeasonName
} from '@shared/types'

const ENDPOINT = 'https://graphql.anilist.co'
const MIN_GAP_MS = 700
const TTL = {
  list: 45 * 60_000,
  detail: 24 * 60_000 * 60,
  search: 10 * 60_000,
  airing: 30 * 60_000,
  /** Une franchise ne gagne pas une saison dans la journée. */
  chain: 12 * 3600_000
}
/**
 * Un budget en octets, pas en entrées : une réponse « airing-all » pèse 131 Ko
 * quand un « airing » en pèse 200. Le plafond de six cents entrées n'avait
 * jamais mordu, et le fichier était monté à 7,4 Mo.
 */
const MAX_CACHE_BYTES = 3 * 1024 * 1024
/** Au-delà de trente fois sa fraîcheur, une réponse n'est plus un secours. */
const STALE_FACTOR = 30
/** Mais on ne jette jamais moins de trois jours : hors ligne, tout compte. */
const MIN_KEEP_MS = 3 * 24 * 3600_000

const MEDIA_FIELDS = `
  id
  idMal
  title { romaji english native }
  coverImage { extraLarge large color }
  bannerImage
  format
  status
  episodes
  duration
  season
  seasonYear
  startDate { year month day }
  genres
  averageScore
  popularity
  studios(isMain: true) { nodes { name } }
  synonyms
  description(asHtml: false)
  nextAiringEpisode { episode airingAt }
  trailer { id site }
`

const LIST_QUERY = `
query List($page: Int, $perPage: Int, $sort: [MediaSort], $search: String, $season: MediaSeason,
           $seasonYear: Int, $genre: String, $format: MediaFormat, $status: MediaStatus,
           $after: FuzzyDateInt, $isAdult: Boolean) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { currentPage hasNextPage total }
    media(type: ANIME, sort: $sort, search: $search, season: $season, seasonYear: $seasonYear,
          genre: $genre, format: $format, status: $status, startDate_greater: $after,
          isAdult: $isAdult) { ${MEDIA_FIELDS} }
  }
}`

const DETAIL_QUERY = `
query Detail($id: Int) {
  Media(id: $id, type: ANIME) {
    ${MEDIA_FIELDS}
    tags { name rank isGeneralSpoiler }
    externalLinks { site url type }
    streamingEpisodes { title thumbnail url site }
    # Le calendrier connaît parfois toute la saison alors que « episodes » est
    # vide : c'est le seul moyen de savoir qu'elle en compte 24 et pas 17.
    airingSchedule(perPage: 50) { nodes { episode } }
    characters(sort: [ROLE, RELEVANCE], perPage: 14) {
      edges {
        role
        node { id name { full } image { large } }
        voiceActors(language: JAPANESE, sort: [RELEVANCE]) { id name { full } image { large } }
      }
    }
    relations {
      edges {
        relationType(version: 2)
        # Le pays sert à nommer l'œuvre d'origine : « Le manga » sous une série
        # tirée d'un manhwa coréen est faux, et se voit tout de suite.
        node { id type format countryOfOrigin title { romaji english } coverImage { large } }
      }
    }
    recommendations(sort: RATING_DESC, perPage: 12) {
      nodes {
        mediaRecommendation { id type format averageScore title { romaji english } coverImage { large } }
      }
    }
  }
}`

const AIRING_QUERY = `
query Airing($ids: [Int], $from: Int, $to: Int) {
  Page(perPage: 50) {
    airingSchedules(mediaId_in: $ids, airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
      mediaId episode airingAt
    }
  }
}`

const STUDIO_QUERY = `
query StudioWorks($search: String, $page: Int, $perPage: Int) {
  Studio(search: $search) {
    name
    media(sort: [POPULARITY_DESC], page: $page, perPage: $perPage) {
      pageInfo { currentPage hasNextPage total }
      nodes { ${MEDIA_FIELDS} }
    }
  }
}`

/**
 * Les dernières œuvres d'une personne ou d'un studio.
 *
 * Triées par date de début décroissante, et non par popularité comme la page
 * d'un studio : une série qui vient d'être annoncée n'est populaire nulle
 * part, et c'est précisément celle qu'un suivi doit faire remonter. AniList
 * range d'ailleurs les dates inconnues en tête — les annonces sans date de
 * diffusion arrivent donc en premier, ce qui tombe bien.
 *
 * Pour une personne, les deux connexions comptent : `staffMedia` porte ce
 * qu'elle a réalisé ou écrit, `characterMedia` ce qu'elle a doublé. Un seiyuu
 * n'apparaîtrait pas dans la première.
 */
const STUDIO_LATEST_QUERY = `
query StudioLatest($search: String) {
  Studio(search: $search) {
    id
    name
    media(sort: [START_DATE_DESC], perPage: 25) {
      nodes { type isAdult ${MEDIA_FIELDS} }
    }
  }
}`

const STAFF_LATEST_QUERY = `
query StaffLatest($id: Int) {
  Staff(id: $id) {
    id
    name { full }
    image { large }
    staffMedia(sort: [START_DATE_DESC], perPage: 25, type: ANIME) {
      nodes { type isAdult ${MEDIA_FIELDS} }
    }
    characterMedia(sort: [START_DATE_DESC], perPage: 25) {
      nodes { type isAdult ${MEDIA_FIELDS} }
    }
  }
}`

const AIRING_WINDOW_QUERY = `
query AiringWindow($page: Int, $from: Int, $to: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
      mediaId
      episode
      airingAt
      media { isAdult ${MEDIA_FIELDS} }
    }
  }
}`

const BY_MAL_QUERY = `
query ByMal($ids: [Int], $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    media(idMal_in: $ids, type: ANIME) { ${MEDIA_FIELDS} }
  }
}`

// ---------------------------------------------------------------- cache

interface CacheRow {
  at: number
  /** Sa propre fraîcheur : chaque entrée vieillit à son rythme. */
  ttl?: number
  data: unknown
}

let cache = new Map<string, CacheRow>()
let cacheFile = ''
let cacheTimer: NodeJS.Timeout | null = null

export function initAniList(): void {
  cacheFile = join(app.getPath('userData'), 'anilist-cache.json')
  if (!existsSync(cacheFile)) return
  try {
    const rows = JSON.parse(readFileSync(cacheFile, 'utf8')) as [string, CacheRow][]
    cache = new Map(rows)
    // Au démarrage aussi : une app qui ne fait aucune requête doit quand même
    // voir son cache maigrir. Compacter en mémoire ne suffit pas — sans cette
    // écriture, le fichier gardait son poids jusqu'à la première requête.
    if (compactCache() > 0) persistCache()
  } catch {
    cache = new Map()
  }
}

/** Renvoie le nombre d'entrées retirées, pour savoir s'il faut réécrire. */
function compactCache(): number {
  const before = cache.size
  const { kept } = applyBudget([...cache.entries()], {
    now: Date.now(),
    maxBytes: MAX_CACHE_BYTES,
    staleFactor: STALE_FACTOR,
    defaultTtl: TTL.list,
    minKeepMs: MIN_KEEP_MS
  })
  cache = new Map(kept)
  return before - kept.length
}

function persistCache(): void {
  if (cacheTimer) return
  cacheTimer = setTimeout(() => {
    cacheTimer = null
    compactCache()
    fs.writeFile(cacheFile, JSON.stringify([...cache.entries()]), 'utf8').catch(() => {})
  }, 3000)
}

/** Ce que le cache pèse, pour que les Réglages puissent le dire. */
export function cacheStats(): { entries: number; bytes: number } {
  return { entries: cache.size, bytes: JSON.stringify([...cache.entries()]).length }
}

/** Vide le cache AniList. Rien n'est perdu : tout se retélécharge. */
export function purgeCache(): void {
  cache = new Map()
  fs.writeFile(cacheFile, '[]', 'utf8').catch(() => {})
}

// ---------------------------------------------------------------- transport

/**
 * Interactive work always overtakes background work, and identical requests are
 * shared instead of repeated. Spacing between calls is the queue's job now.
 */
const gate = createQueue({ minGapMs: MIN_GAP_MS })

async function raw<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables })
    })

    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after') ?? 5) * 1000
      await new Promise((r) => setTimeout(r, Math.min(wait, 60_000)))
      continue
    }
    if (!res.ok) throw new Error(`AniList HTTP ${res.status}`)

    const body = (await res.json()) as { data?: T; errors?: { message: string }[] }
    if (body.errors?.length) throw new Error(body.errors[0].message)
    if (!body.data) throw new Error('Réponse AniList vide')
    return body.data
  }
  throw new Error('AniList : trop de requêtes, réessaie dans une minute')
}

/**
 * `lane` says whether someone is waiting on this right now. `key` lets an
 * identical in-flight or queued request be shared rather than duplicated —
 * the cache key doubles as the request's identity.
 */
function request<T>(
  query: string,
  variables: Record<string, unknown>,
  lane: Lane = 'interactive',
  key: string | null = null
): Promise<T> {
  return gate.run(lane, key, () => raw<T>(query, variables))
}

/** Serves cache first when fresh; on network failure falls back to stale cache. */
/**
 * Version de la forme des réponses en cache.
 *
 * À monter dès qu'une requête gagne un champ. Une réponse enregistrée avant
 * ne le porte pas, et rien dans sa date ne le dit : une fiche gardée
 * vingt-quatre heures aurait continué d'annoncer « Le manga » sous Solo
 * Leveling jusqu'au lendemain. Changer la clé les périme toutes d'un coup, ce
 * qui coûte une poignée de requêtes une seule fois.
 *
 * v2 — pays d'origine sur les mangas et sur les relations.
 */
const SHAPE = 'v2'

async function cached<T>(key: string, ttl: number, run: () => Promise<T>): Promise<{ data: T; stale: boolean }> {
  const k = `${SHAPE}:${key}`
  const hit = cache.get(k)
  if (hit && Date.now() - hit.at < ttl) return { data: hit.data as T, stale: false }
  try {
    const data = await run()
    cache.set(k, { at: Date.now(), ttl, data })
    persistCache()
    return { data, stale: false }
  } catch (err) {
    if (hit) return { data: hit.data as T, stale: true }
    throw err
  }
}

// ---------------------------------------------------------------- mapping

interface RawMedia {
  id: number
  idMal: number | null
  title: { romaji: string | null; english: string | null; native: string | null }
  coverImage: { extraLarge: string | null; large: string | null; color: string | null } | null
  bannerImage: string | null
  format: string | null
  status: string | null
  episodes: number | null
  duration: number | null
  season: string | null
  seasonYear: number | null
  startDate: { year: number | null; month: number | null; day: number | null } | null
  genres: string[] | null
  averageScore: number | null
  popularity: number | null
  studios: { nodes: { name: string }[] } | null
  synonyms: string[] | null
  description: string | null
  nextAiringEpisode: { episode: number; airingAt: number } | null
  trailer: { id: string | null; site: string | null } | null
}

const PLACEHOLDER = 'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'

function stripHtml(text: string | null): string | null {
  if (!text) return null
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function toMedia(m: RawMedia): Media {
  return {
    id: m.id,
    idMal: m.idMal ?? null,
    title: {
      romaji: m.title?.romaji ?? m.title?.english ?? `#${m.id}`,
      english: m.title?.english ?? null,
      native: m.title?.native ?? null
    },
    cover: {
      large: m.coverImage?.large ?? PLACEHOLDER,
      xl: m.coverImage?.extraLarge ?? m.coverImage?.large ?? PLACEHOLDER,
      color: m.coverImage?.color ?? null
    },
    banner: m.bannerImage ?? null,
    format: (m.format as Media['format']) ?? null,
    status: (m.status as Media['status']) ?? null,
    episodes: m.episodes ?? null,
    duration: m.duration ?? null,
    season: (m.season as SeasonName) ?? null,
    seasonYear: m.seasonYear ?? null,
    startDate: m.startDate ?? null,
    genres: m.genres ?? [],
    studios: m.studios?.nodes?.map((s) => s.name) ?? [],
    averageScore: m.averageScore ?? null,
    popularity: m.popularity ?? 0,
    description: stripHtml(m.description),
    nextAiring: m.nextAiringEpisode ?? null,
    trailer: m.trailer?.id && m.trailer.site === 'youtube' ? { id: m.trailer.id, site: 'youtube' } : null,
    cachedAt: Date.now()
  }
}

export function currentSeason(date = new Date()): { season: SeasonName; year: number } {
  const seasons: SeasonName[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL']
  return { season: seasons[Math.floor((date.getMonth() / 12) * 4)], year: date.getFullYear() }
}

// ---------------------------------------------------------------- public API

/**
 * Le catalogue manga.
 *
 * Une requête à part plutôt qu'un paramètre sur celle des animes : les champs
 * utiles ne sont pas les mêmes — chapitres et volumes au lieu d'épisodes et de
 * durée, auteurs au lieu de studios — et mêler les deux ferait demander à
 * chaque appel la moitié de ce qui ne le concerne pas.
 */
const MANGA_FIELDS = `
  id
  title { romaji english native }
  countryOfOrigin
  format
  coverImage { large extraLarge color }
  bannerImage
  description(asHtml: false)
  chapters
  volumes
  status
  genres
  averageScore
  popularity
  startDate { year }
  siteUrl
  staff(perPage: 2, sort: [RELEVANCE]) { nodes { name { full } } }`

const MANGA_QUERY = `
query Manga(
  $page: Int
  $perPage: Int
  $sort: [MediaSort]
  $search: String
  $genre: String
  $isAdult: Boolean
  $country: CountryCode
) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { currentPage hasNextPage total }
    media(
      type: MANGA
      sort: $sort
      search: $search
      genre: $genre
      isAdult: $isAdult
      countryOfOrigin: $country
    ) { ${MANGA_FIELDS} }
  }
}`

interface RawManga {
  id: number
  title: { romaji: string; english: string | null; native: string | null }
  countryOfOrigin: string | null
  format: string | null
  coverImage: { large: string; extraLarge: string | null; color: string | null }
  bannerImage: string | null
  description: string | null
  chapters: number | null
  volumes: number | null
  status: string | null
  genres: string[] | null
  averageScore: number | null
  popularity: number | null
  startDate?: { year: number | null } | null
  siteUrl: string
  staff?: { nodes: { name: { full: string } }[] } | null
}

const MANGA_SORTS: Record<MangaKind, string[]> = {
  trending: ['TRENDING_DESC'],
  popular: ['POPULARITY_DESC'],
  top: ['SCORE_DESC'],
  search: ['SEARCH_MATCH']
}

function toManga(m: RawManga): Manga {
  return {
    id: m.id,
    title: m.title,
    cover: { large: m.coverImage.large, xl: m.coverImage.extraLarge ?? m.coverImage.large, color: m.coverImage.color },
    banner: m.bannerImage,
    // AniList renvoie du HTML même en `asHtml: false` — les balises de saut de
    // ligne survivent. Le même nettoyage que pour les animes.
    description: m.description ? stripHtml(m.description) : null,
    chapters: m.chapters,
    volumes: m.volumes,
    status: m.status,
    genres: m.genres ?? [],
    averageScore: m.averageScore,
    popularity: m.popularity ?? 0,
    startYear: m.startDate?.year ?? null,
    // AniList range manga, manhwa et manhua sous le même format ; seul le pays
    // les distingue, et sept titres sur huit en tendance sont coréens.
    origin: originOf(m.countryOfOrigin, m.format),
    staff: (m.staff?.nodes ?? []).map((n) => n.name.full),
    siteUrl: m.siteUrl
  }
}

export async function mangas(
  kind: MangaKind,
  page: number,
  search: string,
  genre: string | undefined,
  showAdult: boolean,
  country?: string
): Promise<Paged<Manga>> {
  const vars: Record<string, unknown> = { page, perPage: 30, sort: MANGA_SORTS[kind] }
  if (kind === 'search' && search) vars.search = search
  if (genre) vars.genre = genre
  if (country) vars.country = country
  if (!showAdult) vars.isAdult = false

  const key = `manga:${kind}:${page}:${search}:${genre ?? ''}:${country ?? ''}:${showAdult}`
  const ttl = kind === 'search' ? TTL.search : TTL.list
  const { data, stale } = await cached(key, ttl, () =>
    request<{ Page: { pageInfo: PageInfo; media: RawManga[] } }>(MANGA_QUERY, vars, 'interactive', key)
  )

  return { items: data.Page.media.map(toManga), pageInfo: data.Page.pageInfo, stale }
}

/**
 * Une fiche manga par son identifiant.
 *
 * Le catalogue ne sait servir que des listes : arriver depuis la relation d'un
 * anime, c'est n'avoir qu'un numéro et rien d'autre à montrer.
 */
const MANGA_ONE_QUERY = `
query MangaOne($id: Int) {
  Media(id: $id, type: MANGA) { ${MANGA_FIELDS} }
}`

export async function mangaById(id: number): Promise<Manga> {
  const key = `manga:one:${id}`
  const { data } = await cached(key, TTL.list, () =>
    request<{ Media: RawManga }>(MANGA_ONE_QUERY, { id }, 'interactive', key)
  )
  return toManga(data.Media)
}

/**
 * Une page du catalogue.
 *
 * `lane` décide qui passe devant. Par défaut « interactive » : quelqu'un
 * regarde l'écran et attend. Le travail de fond — constituer un vivier de
 * candidats pour les recommandations, par exemple — doit demander
 * « background », sans quoi il se met en travers de la page que l'utilisateur
 * est en train de regarder. La file est strictement sérielle, avec sept cents
 * millisecondes entre deux requêtes : six appels de fond passés en tête, et
 * la liste visible attend cinq secondes pour rien.
 */
export async function browse(q: BrowseQuery, showAdult: boolean, lane: Lane = 'interactive'): Promise<Paged<Media>> {
  const page = q.page ?? 1
  const perPage = q.perPage ?? 30
  // AniList treats an explicitly passed `null` as a real filter, not as "no
  // filter": sending `genre: null` silently guts the result set (RELEASING went
  // from 5000 matches to 0). Absent filters must be left out of the variables.
  const vars: Record<string, unknown> = { page, perPage }
  if (q.genre) vars.genre = q.genre
  if (q.format) vars.format = q.format
  if (!showAdult) vars.isAdult = false

  switch (q.kind) {
    case 'trending':
      vars.sort = ['TRENDING_DESC', 'POPULARITY_DESC']
      break
    case 'popular':
      vars.sort = ['POPULARITY_DESC']
      break
    case 'top':
      vars.sort = ['SCORE_DESC']
      break
    case 'season': {
      const s = q.season && q.seasonYear ? { season: q.season, year: q.seasonYear } : currentSeason()
      vars.sort = ['POPULARITY_DESC']
      vars.season = s.season
      vars.seasonYear = s.year
      break
    }
    case 'upcoming': {
      // A real chronological schedule. Sorting by START_DATE alone puts every
      // undated title first, which is why the lower bound matters: a fuzzy date
      // of null fails the comparison, so it doubles as an "is dated" filter.
      const now = new Date()
      vars.sort = ['START_DATE']
      vars.status = 'NOT_YET_RELEASED'
      vars.after = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate()
      break
    }
    case 'search':
      vars.sort = ['SEARCH_MATCH']
      vars.search = q.search ?? ''
      break
  }

  const ttl = q.kind === 'search' ? TTL.search : TTL.list
  const k = `list:${JSON.stringify(vars)}`
  const { data, stale } = await cached(k, ttl, () =>
    request<{ Page: { pageInfo: PageInfo; media: RawMedia[] } }>(LIST_QUERY, vars, lane, k)
  )
  return { items: data.Page.media.map(toMedia), pageInfo: data.Page.pageInfo, stale }
}

interface RawDetail extends RawMedia {
  tags: { name: string; rank: number; isGeneralSpoiler: boolean }[] | null
  externalLinks: { site: string; url: string; type: string | null }[] | null
  streamingEpisodes: { title: string | null; thumbnail: string | null; url: string | null }[] | null
  airingSchedule: { nodes: { episode: number }[] } | null
  characters: {
    edges: {
      role: string
      node: { id: number; name: { full: string }; image: { large: string | null } | null }
      voiceActors: { id: number; name: { full: string }; image: { large: string | null } | null }[]
    }[]
  } | null
  relations: {
    edges: {
      relationType: string
      node: {
        id: number
        type: string
        format: string | null
        countryOfOrigin: string | null
        title: { romaji: string | null; english: string | null }
        coverImage: { large: string | null } | null
      }
    }[]
  } | null
  recommendations: {
    nodes: {
      mediaRecommendation: {
        id: number
        type: string
        format: string | null
        averageScore: number | null
        title: { romaji: string | null; english: string | null }
        coverImage: { large: string | null } | null
      } | null
    }[]
  } | null
}

const RELATION_LABELS: Record<string, string> = {
  SEQUEL: 'Suite',
  PREQUEL: 'Précédent',
  SIDE_STORY: 'Spin-off',
  ALTERNATIVE: 'Alternative',
  SUMMARY: 'Résumé',
  SPIN_OFF: 'Spin-off',
  PARENT: 'Série mère',
  SOURCE: 'Source',
  CHARACTER: 'Personnages',
  OTHER: 'Autre'
}

/** AniList only labels episodes that a streaming partner listed; the rest fall back to a number. */
function buildEpisodeMeta(m: RawDetail): MediaDetail['episodeMeta'] {
  const listed = m.streamingEpisodes ?? []

  // Une saison en cours peut n'avoir aucun total annoncé. Il faut alors le
  // déduire, et le calendrier de diffusion le sait mieux que les épisodes
  // référencés par les plateformes : celles-ci n'en listent parfois qu'un seul,
  // ce qui donnait une grille d'un épisode pour une saison déjà bien avancée.
  //
  // L'épisode programmé compte : il existe, la fiche l'annonce en haut, et la
  // grille l'affiche grisé comme celle d'une saison au total connu. Le
  // calendrier va souvent plus loin encore et couvre la saison entière.
  const scheduled = (m.airingSchedule?.nodes ?? []).reduce((max, node) => Math.max(max, node.episode), 0)
  const known = Math.max(m.nextAiringEpisode?.episode ?? 0, scheduled)
  const total = m.episodes ?? Math.max(listed.length, known)
  // L'appariement se fait sur le numéro écrit dans le libellé, jamais sur la
  // position : la liste d'AniList n'est ni forcément complète ni forcément
  // croissante.
  return matchStreamEpisodes(listed, total)
}

/**
 * Ce qu'AniList conseille à partir de ce que tu as aimé.
 *
 * Les recommandations sont attachées à une œuvre, pas à une personne : il
 * n'existe pas de « recommande-moi quelque chose » côté serveur. On interroge
 * donc plusieurs séries d'un coup — par alias, une seule requête — et on
 * additionne.
 *
 * Le vote de la communauté (`rating`) sert de poids : une série conseillée
 * depuis trois de tes favoris avec de bons scores remonte devant une
 * suggestion isolée. Deux graines valent mieux qu'une, et on le dit dans le
 * résultat : savoir *pourquoi* une série est là vaut mieux qu'un classement
 * opaque.
 */
export interface Suggestion {
  media: Media
  /** Poids cumulé des recommandations. */
  score: number
  /** Titres de la bibliothèque qui ont mené jusqu'à celle-ci. */
  from: string[]
}

const RECO_FIELDS = `
  recommendations(sort: RATING_DESC, perPage: 10) {
    nodes { rating mediaRecommendation { isAdult ${MEDIA_FIELDS} } }
  }`

interface RawReco {
  title?: { romaji: string | null; english: string | null } | null
  recommendations: {
    nodes: { rating: number | null; mediaRecommendation: (RawMedia & { isAdult?: boolean | null }) | null }[]
  } | null
}

export async function recommended(seeds: number[], exclude: number[], showAdult: boolean): Promise<Suggestion[]> {
  const ids = seeds.slice(0, 8)
  if (!ids.length) return []

  // La clé porte les graines : changer de favoris doit changer la réponse.
  const key = `reco:${ids.join(',')}:${showAdult}`
  const query = `query { ${ids
    .map((id) => `m${id}: Media(id: ${id}) { title { romaji english } ${RECO_FIELDS} }`)
    .join(' ')} }`

  const { data } = await cached(key, TTL.list, () =>
    request<Record<string, RawReco | null>>(query, {}, 'background', key)
  )

  const skip = new Set(exclude)
  const found = new Map<number, Suggestion>()

  for (const seed of Object.values(data)) {
    // Le titre sans son numéro de saison : « parce que tu as aimé MASHLE,
    // MASHLE » n'apprend rien à personne.
    const full = seed?.title?.english ?? seed?.title?.romaji ?? ''
    const seedTitle = full ? baseAndSeason(full).base : ''
    for (const node of seed?.recommendations?.nodes ?? []) {
      const raw = node.mediaRecommendation
      if (!raw || skip.has(raw.id)) continue
      if (raw.isAdult && !showAdult) continue

      // Une recommandation mal notée par la communauté n'en est pas vraiment
      // une : elle dit surtout que quelqu'un a cliqué.
      const weight = Math.max(1, node.rating ?? 1)
      const held = found.get(raw.id)
      if (held) {
        held.score += weight
        if (seedTitle && !held.from.includes(seedTitle)) held.from.push(seedTitle)
      } else {
        found.set(raw.id, { media: toMedia(raw), score: weight, from: seedTitle ? [seedTitle] : [] })
      }
    }
  }

  return [...found.values()].sort((a, b) => b.from.length - a.from.length || b.score - a.score).slice(0, 24)
}

/**
 * Les autres rôles d'un personnage ou d'un doubleur.
 *
 * AniList sait répondre aux deux, mais pas de la même façon : un personnage
 * porte ses séries directement, un doubleur les porte à travers les
 * personnages qu'il incarne. D'où deux requêtes plutôt qu'un paramètre.
 */
const CHARACTER_QUERY = `
query Person($id: Int) {
  Character(id: $id) {
    id
    name { full }
    image { large }
    media(sort: POPULARITY_DESC, perPage: 30) {
      edges { characterRole node { type ${MEDIA_FIELDS} } }
    }
  }
}`

const STAFF_QUERY = `
query Person($id: Int) {
  Staff(id: $id) {
    id
    name { full }
    image { large }
    characterMedia(sort: POPULARITY_DESC, perPage: 30) {
      edges { characters { name { full } } node { type ${MEDIA_FIELDS} } }
    }
  }
}`

interface RawPerson {
  id: number
  name: { full: string }
  image?: { large: string | null } | null
  media?: { edges: { characterRole: string | null; node: RawMedia & { type?: string | null } }[] } | null
  characterMedia?: {
    edges: { characters: { name: { full: string } }[]; node: RawMedia & { type?: string | null } }[]
  } | null
}

const ROLE_LABELS: Record<string, string> = {
  MAIN: 'Rôle principal',
  SUPPORTING: 'Second rôle',
  BACKGROUND: 'Apparition'
}

export async function personWorks(kind: 'character' | 'staff', id: number): Promise<PersonWorks | null> {
  const key = `person:${kind}:${id}`
  const { data } = await cached(key, TTL.detail, () =>
    request<{ Character?: RawPerson | null; Staff?: RawPerson | null }>(
      kind === 'character' ? CHARACTER_QUERY : STAFF_QUERY,
      { id },
      'interactive',
      key
    )
  )

  const person = kind === 'character' ? data.Character : data.Staff
  if (!person) return null

  // Une même série peut revenir : un doubleur y tient parfois deux rôles.
  const seen = new Set<number>()
  const roles: PersonWorks['roles'] = []
  const edges = kind === 'character' ? (person.media?.edges ?? []) : (person.characterMedia?.edges ?? [])

  for (const edge of edges) {
    if (edge.node.type && edge.node.type !== 'ANIME') continue
    if (seen.has(edge.node.id)) continue
    seen.add(edge.node.id)
    const role =
      'characterRole' in edge && edge.characterRole
        ? (ROLE_LABELS[edge.characterRole] ?? edge.characterRole)
        : 'characters' in edge
          ? (edge.characters?.[0]?.name.full ?? null)
          : null
    roles.push({ media: toMedia(edge.node), role })
  }

  return { id: person.id, kind, name: person.name.full, image: person.image?.large ?? null, roles }
}

export async function detail(id: number): Promise<MediaDetail & { stale: boolean }> {
  const { data, stale } = await cached(`detail:${id}`, TTL.detail, () =>
    request<{ Media: RawDetail }>(DETAIL_QUERY, { id }, 'interactive', `detail:${id}`)
  )
  const m = data.Media
  return {
    ...toMedia(m),
    stale,
    tags: (m.tags ?? [])
      .filter((t) => !t.isGeneralSpoiler)
      .slice(0, 10)
      .map((t) => t.name),
    links: (m.externalLinks ?? [])
      .filter((l) => l.type === 'STREAMING')
      .map((l) => ({ site: l.site, url: l.url }))
      .slice(0, 12),
    episodeMeta: buildEpisodeMeta(m),
    characters: (m.characters?.edges ?? []).map((e) => ({
      id: e.node.id,
      name: e.node.name.full,
      image: e.node.image?.large ?? null,
      role: e.role === 'MAIN' ? 'Principal' : e.role === 'SUPPORTING' ? 'Secondaire' : 'Apparition',
      va: e.voiceActors?.[0]?.name.full ?? null,
      vaImage: e.voiceActors?.[0]?.image?.large ?? null,
      vaId: e.voiceActors?.[0]?.id ?? null
    })),
    relations: (m.relations?.edges ?? [])
      .filter((e) => e.node.type === 'ANIME')
      .map((e) => ({
        id: e.node.id,
        title: e.node.title.romaji ?? e.node.title.english ?? `#${e.node.id}`,
        cover: e.node.coverImage?.large ?? PLACEHOLDER,
        format: e.node.format,
        extra: RELATION_LABELS[e.relationType] ?? e.relationType
      })),
    // La requête les ramenait déjà et on les jetait : le manga d'où la série
    // sort n'était joignable nulle part, alors qu'une page entière lui est
    // consacrée. Seuls la source et l'adaptation comptent — les produits
    // dérivés n'ont pas leur place sur la fiche de l'anime.
    manga: (m.relations?.edges ?? [])
      .filter((e) => e.node.type === 'MANGA' && (e.relationType === 'SOURCE' || e.relationType === 'ADAPTATION'))
      .map((e) => ({
        id: e.node.id,
        title: e.node.title.romaji ?? e.node.title.english ?? `#${e.node.id}`,
        cover: e.node.coverImage?.large ?? PLACEHOLDER,
        format: e.node.format,
        extra: RELATION_LABELS[e.relationType] ?? e.relationType,
        origin: originOf(e.node.countryOfOrigin, e.node.format)
      })),
    recommendations: (m.recommendations?.nodes ?? [])
      .map((n) => n.mediaRecommendation)
      .filter((r): r is NonNullable<typeof r> => !!r && r.type === 'ANIME')
      .map((r) => ({
        id: r.id,
        title: r.title.romaji ?? r.title.english ?? `#${r.id}`,
        cover: r.coverImage?.large ?? PLACEHOLDER,
        format: r.format,
        extra: r.averageScore ? `${r.averageScore}%` : null
      }))
  }
}

type RawLatest = RawMedia & { type?: string | null; isAdult?: boolean | null }

/**
 * Ce qu'une personne ou un studio a de plus récent, annonces comprises.
 *
 * Rend `null` quand AniList ne connaît pas la référence : un studio renommé,
 * une personne supprimée. Le suivi correspondant est alors laissé tel quel
 * plutôt que vidé — une panne de recherche ne doit pas effacer un suivi.
 */
export async function latestWorks(
  kind: FollowKind,
  ref: number | string,
  showAdult: boolean
): Promise<{ name: string; image: string | null; items: Media[] } | null> {
  const key = `follow:${kind}:${ref}`

  if (kind === 'studio') {
    const { data } = await cached(key, TTL.list, () =>
      request<{ Studio: { name: string; media: { nodes: RawLatest[] } } | null }>(
        STUDIO_LATEST_QUERY,
        { search: String(ref) },
        'background',
        key
      )
    )
    if (!data.Studio) return null
    return { name: data.Studio.name, image: null, items: pickAnime(data.Studio.media.nodes, showAdult) }
  }

  const { data } = await cached(key, TTL.list, () =>
    request<{
      Staff: {
        name: { full: string }
        image?: { large: string | null } | null
        staffMedia: { nodes: RawLatest[] }
        characterMedia: { nodes: RawLatest[] }
      } | null
    }>(STAFF_LATEST_QUERY, { id: Number(ref) }, 'background', key)
  )
  if (!data.Staff) return null
  return {
    name: data.Staff.name.full,
    image: data.Staff.image?.large ?? null,
    items: pickAnime([...data.Staff.staffMedia.nodes, ...data.Staff.characterMedia.nodes], showAdult)
  }
}

/** Anime seulement, sans doublon : les deux connexions d'un staff se recoupent. */
function pickAnime(nodes: RawLatest[], showAdult: boolean): Media[] {
  const seen = new Set<number>()
  const out: Media[] = []
  for (const node of nodes) {
    if (node.type && node.type !== 'ANIME') continue
    if (node.isAdult && !showAdult) continue
    if (seen.has(node.id)) continue
    seen.add(node.id)
    out.push(toMedia(node))
  }
  return out
}

export async function airing(ids: number[], from: number, to: number): Promise<AiringItem[]> {
  if (!ids.length) return []
  const k = `airing:${from}:${to}:${ids
    .slice()
    .sort((a, b) => a - b)
    .join(',')}`
  const { data } = await cached(k, TTL.airing, () =>
    request<{ Page: { airingSchedules: AiringItem[] } }>(AIRING_QUERY, { ids, from, to }, 'interactive', k)
  )
  return data.Page.airingSchedules
}

/** Everything a studio has animated, most popular first. */
export async function studioWorks(search: string, page: number): Promise<StudioWorks> {
  const { data, stale } = await cached(`studio:${search}:${page}`, TTL.list, () =>
    request<{
      Studio: { name: string; media: { pageInfo: PageInfo; nodes: RawMedia[] } } | null
    }>(STUDIO_QUERY, { search, page, perPage: 30 }, 'interactive', `studio:${search}:${page}`)
  )

  if (!data.Studio) {
    return { studio: search, items: [], pageInfo: { currentPage: page, hasNextPage: false, total: 0 }, stale }
  }
  return {
    studio: data.Studio.name,
    items: data.Studio.media.nodes.map(toMedia),
    pageInfo: data.Studio.media.pageInfo,
    stale
  }
}

/**
 * Every film in a franchise, from any entry in it. Relations only ever list the
 * films attached to the entry you're on — Naruto's page shows its 3, never
 * Shippuden's 8 — so this sweeps by title instead. Containment rather than a
 * prefix, because "THE LAST: NARUTO THE MOVIE" doesn't start with the franchise
 * name.
 */
export async function franchiseFilms(title: string, showAdult: boolean): Promise<Media[]> {
  const { base } = baseAndSeason(title)
  const needle = compact(base)
  if (needle.length < 4) return []

  const vars: Record<string, unknown> = {
    page: 1,
    perPage: 50,
    sort: ['START_DATE'],
    search: base,
    format: 'MOVIE'
  }
  if (!showAdult) vars.isAdult = false

  // A row far down the detail page: nobody is blocked on it.
  const { data } = await cached(`films:${needle}:${showAdult}`, TTL.detail, () =>
    request<{ Page: { pageInfo: PageInfo; media: RawMedia[] } }>(
      LIST_QUERY,
      vars,
      'background',
      `films:${needle}:${showAdult}`
    )
  )

  return data.Page.media
    .filter((m) =>
      [m.title.romaji, m.title.english, ...(m.synonyms ?? [])]
        .filter(Boolean)
        .some((t) => compact(t as string).includes(needle))
    )
    .map(toMedia)
}

/**
 * Split cours coming back from a break. A weekly show always has its next
 * episode within 7 days, so anything further out has stopped airing and is
 * scheduled to return — which belongs in the upcoming schedule even though the
 * title itself is already RELEASING. Scanning the most popular pages is enough:
 * only a handful of shows are ever in this state at once.
 */
const RETURN_GAP_DAYS = 10

export async function returningSoon(showAdult: boolean): Promise<Media[]> {
  const cutoff = Math.floor(Date.now() / 1000) + RETURN_GAP_DAYS * 86_400
  const { data } = await cached(`returning:${showAdult}`, TTL.list, async () => {
    const found: RawMedia[] = []
    for (let page = 1; page <= 4; page += 1) {
      const vars: Record<string, unknown> = { page, perPage: 50, sort: ['POPULARITY_DESC'], status: 'RELEASING' }
      if (!showAdult) vars.isAdult = false
      const res = await request<{ Page: { pageInfo: PageInfo; media: RawMedia[] } }>(
        LIST_QUERY,
        vars,
        'background',
        `returning:${showAdult}:p${page}`
      )
      found.push(...res.Page.media)
      if (!res.Page.pageInfo.hasNextPage) break
    }
    return found
  })

  return data.filter((m) => m.nextAiringEpisode && m.nextAiringEpisode.airingAt > cutoff).map(toMedia)
}

interface RawAiringSlot {
  mediaId: number
  episode: number
  airingAt: number
  media: (RawMedia & { isAdult: boolean | null }) | null
}

/**
 * Every episode airing in a window, across the whole catalogue — not just the
 * library. Capped at four pages so a busy week stays a handful of requests.
 */
export async function airingWindow(from: number, to: number, showAdult: boolean): Promise<AiringEntry[]> {
  const { data } = await cached(`airing-all:${from}:${to}`, TTL.airing, async () => {
    const slots: RawAiringSlot[] = []
    for (let page = 1; page <= 4; page += 1) {
      const res = await request<{
        Page: { pageInfo: { hasNextPage: boolean }; airingSchedules: RawAiringSlot[] }
      }>(AIRING_WINDOW_QUERY, { page, from, to }, 'background', `airing-all:${from}:${to}:p${page}`)
      slots.push(...res.Page.airingSchedules)
      if (!res.Page.pageInfo.hasNextPage) break
    }
    return slots
  })

  return data
    .filter((slot) => slot.media && (showAdult || !slot.media.isAdult))
    .map((slot) => ({
      mediaId: slot.mediaId,
      episode: slot.episode,
      airingAt: slot.airingAt,
      media: toMedia(slot.media as RawMedia)
    }))
}

/** Forces a network refresh for the given ids, bypassing the cache. */
export async function refreshMedia(ids: number[]): Promise<Media[]> {
  const out: Media[] = []
  for (let i = 0; i < ids.length; i += 50) {
    const slice = ids.slice(i, i + 50)
    const data = await request<{ Page: { media: RawMedia[] } }>(
      `query R($ids: [Int], $perPage: Int) {
         Page(perPage: $perPage) { media(id_in: $ids, type: ANIME) { ${MEDIA_FIELDS} } }
       }`,
      { ids: slice, perPage: slice.length },
      'background',
      `refresh:${slice.join(',')}`
    )
    out.push(...data.Page.media.map(toMedia))
  }
  return out
}

// ---------------------------------------------------------------- import

/**
 * The importer needs more than `browse` returns: synonyms, because TheTVDB and
 * AniList romanise differently, and sequel relations, to rebuild the chain of
 * cours a single followed series spans.
 *
 * Every import request rides the background lane. The user is waiting on the
 * batch as a whole, not on any one call, so browsing the app meanwhile must
 * stay instant.
 */
const IMPORT_FIELDS = `
  ${MEDIA_FIELDS}
  relations { edges { relationType(version: 2) node { id type format episodes } } }
`

const IMPORT_SEARCH_QUERY = `
query ImportSearch($search: String, $perPage: Int, $sort: [MediaSort]) {
  Page(perPage: $perPage) { media(search: $search, type: ANIME, sort: $sort) { ${IMPORT_FIELDS} } }
}`

const IMPORT_BY_ID_QUERY = `
query ImportById($id: Int) { Media(id: $id, type: ANIME) { ${IMPORT_FIELDS} } }`

interface RawRelated extends RawMedia {
  relations: {
    edges: {
      relationType: string | null
      node: { id: number; type: string | null; format: string | null; episodes: number | null }
    }[]
  } | null
}

function toCandidate(m: RawRelated): ImportCandidate {
  return {
    media: toMedia(m),
    synonyms: m.synonyms ?? [],
    sequels: (m.relations?.edges ?? [])
      .filter((e) => e.relationType === 'SEQUEL' && e.node?.type === 'ANIME')
      .map((e) => ({ id: e.node.id, format: e.node.format, episodes: e.node.episodes }))
  }
}

/** Candidates for a series name, best guesses first. */
export async function importSearch(search: string): Promise<ImportCandidate[]> {
  const data = await request<{ Page: { media: RawRelated[] } }>(
    IMPORT_SEARCH_QUERY,
    { search, perPage: 8, sort: ['SEARCH_MATCH'] },
    'background',
    `import:search:${search}`
  )
  return data.Page.media.map(toCandidate)
}

/** Everything sharing a franchise name, oldest first, to patch a broken chain. */
export async function importFranchise(search: string): Promise<ImportCandidate[]> {
  const data = await request<{ Page: { media: RawRelated[] } }>(
    IMPORT_SEARCH_QUERY,
    { search, perPage: 25, sort: ['START_DATE'] },
    'background',
    `import:franchise:${search}`
  )
  return data.Page.media.map(toCandidate)
}

export async function importById(id: number): Promise<ImportCandidate | null> {
  try {
    const data = await request<{ Media: RawRelated | null }>(
      IMPORT_BY_ID_QUERY,
      { id },
      'background',
      `import:media:${id}`
    )
    return data.Media ? toCandidate(data.Media) : null
  } catch {
    // A single unreachable entry ends that chain; the import carries on.
    return null
  }
}

// ---------------------------------------------------------------- season chain

const CHAIN_QUERY = `
query Chain($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    title { romaji english }
    format
    status
    episodes
    startDate { year month day }
    coverImage { large }
    relations { edges { relationType(version: 2) node { id type format } } }
  }
}`

interface RawChainNode {
  id: number
  title: { romaji: string | null; english: string | null }
  format: string | null
  status: string | null
  episodes: number | null
  startDate: { year: number | null; month: number | null; day: number | null } | null
  coverImage: { large: string | null } | null
  relations: {
    edges: { relationType: string | null; node: { id: number; type: string | null; format: string | null } | null }[]
  } | null
}

/** Only formats that air as a season belong in a season strip. */
const CHAIN_FORMATS = new Set(['TV', 'ONA', 'TV_SHORT'])

/**
 * Long enough for the longest franchise, short enough to bound the walk. Compte
 * aussi les OVA et films traversés en chemin, qui n'apparaîtront pas dans la
 * bande mais consomment un pas.
 */
const CHAIN_MAX = 24

async function chainNode(id: number): Promise<RawChainNode | null> {
  try {
    const { data } = await cached(`chain-node:${id}`, TTL.chain, () =>
      request<{ Media: RawChainNode | null }>(CHAIN_QUERY, { id }, 'background', `chain:${id}`)
    )
    return data.Media
  } catch {
    return null
  }
}

/**
 * Le voisin dans la chaîne, en préférant une saison.
 *
 * AniList ne relie pas toujours deux saisons entre elles : de la saison 2 de
 * Slime, la seule arête PREQUEL mène à un OVA, et c'est cet OVA qui pointe vers
 * la saison 1. Refuser les autres formats coupait donc la chaîne — la bande
 * commençait à « S1 Tensei Shitara Slime Datta Ken 2nd Season ». La marche
 * traverse n'importe quel anime ; seule la collecte reste réservée aux saisons.
 */
const neighbour = (node: RawChainNode, kind: 'PREQUEL' | 'SEQUEL'): number | null => {
  const edges = (node.relations?.edges ?? []).filter((e) => e.relationType === kind && e.node?.type === 'ANIME')
  const season = edges.find((e) => CHAIN_FORMATS.has(e.node?.format ?? ''))
  return (season ?? edges[0])?.node?.id ?? null
}

/** Seuls ces formats méritent un numéro de saison. */
const isSeason = (node: RawChainNode): boolean => CHAIN_FORMATS.has(node.format ?? '')

const titleOfNode = (node: RawChainNode): string => node.title.romaji ?? node.title.english ?? `#${node.id}`

/** Habille la chaîne des numéros qu'un spectateur lui donnerait. */
function numberSeasons(nodes: RawChainNode[]): SeasonEntry[] {
  const titles = nodes.map(titleOfNode)

  return seasonNumbers(titles).map((rank, i) => ({
    id: nodes[i].id,
    number: rank.number,
    part: rank.part,
    title: titles[i],
    format: nodes[i].format,
    status: nodes[i].status,
    episodes: nodes[i].episodes,
    year: nodes[i].startDate?.year ?? null,
    cover: nodes[i].coverImage?.large ?? null
  }))
}

/**
 * Every season of the franchise this anime belongs to, in broadcast order.
 *
 * AniList has no notion of "season 3"; it links entries pairwise with PREQUEL
 * and SEQUEL. So the walk goes back to the earliest entry, then forward,
 * collecting as it goes. Numbering is by position in that chain, which is what
 * "season 3" means to a viewer even when the entry is titled "Part 2".
 *
 * Returns an empty array rather than failing: a missing strip is cosmetic.
 *
 * Le résultat est rangé sous chaque membre de la chaîne, pas seulement sous
 * l'anime demandé : tous partagent la même bande, donc ouvrir la saison 4 après
 * la saison 1 ne doit rien coûter. Sans ça la marche repartait du réseau à
 * chaque ouverture de fiche, et la bande mettait plusieurs secondes à paraître.
 */
export async function seasonChain(id: number): Promise<SeasonEntry[]> {
  const hit = cache.get(`chain:${id}`)
  if (hit && Date.now() - hit.at < TTL.chain) return hit.data as SeasonEntry[]

  const chain = await walkChain(id)
  // Une panne réseau ne doit pas se figer douze heures en « pas de saisons » :
  // faute de réponse on ne retient rien et on retentera à la prochaine ouverture.
  if (!chain) return []

  const at = Date.now()
  for (const season of chain) cache.set(`chain:${season.id}`, { at, ttl: TTL.chain, data: chain })
  // Une chaîne vide n'a qu'une clé à retenir, sinon on remarcherait pour rien.
  if (!chain.length) cache.set(`chain:${id}`, { at, ttl: TTL.chain, data: chain })
  persistCache()

  return chain
}

/** `null` veut dire « pas de réponse », à distinguer d'une série sans suite. */
async function walkChain(id: number): Promise<SeasonEntry[] | null> {
  const start = await chainNode(id)
  if (!start) return null

  // Back to the first entry.
  let root = start
  const seenBack = new Set([start.id])
  for (let i = 0; i < CHAIN_MAX; i += 1) {
    const previous = neighbour(root, 'PREQUEL')
    if (!previous || seenBack.has(previous)) break
    const node = await chainNode(previous)
    if (!node) break
    seenBack.add(node.id)
    root = node
  }

  // Then forward, collecting the seasons and stepping over the rest.
  const found: RawChainNode[] = isSeason(root) ? [root] : []
  const seen = new Set([root.id])
  let current = root
  for (let i = 0; i < CHAIN_MAX; i += 1) {
    const next = neighbour(current, 'SEQUEL')
    if (!next || seen.has(next)) break
    const node = await chainNode(next)
    if (!node) break
    seen.add(node.id)
    if (isSeason(node)) found.push(node)
    current = node
  }

  // A single entry is not a season strip.
  return found.length > 1 ? numberSeasons(found) : []
}

// ---------------------------------------------------------------- sequels

const SEQUELS_QUERY = `
query Sequels($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids, type: ANIME) {
      id
      relations {
        edges {
          relationType(version: 2)
          node { type ${MEDIA_FIELDS} }
        }
      }
    }
  }
}`

interface RawRelations {
  edges: { relationType: string | null; node: (RawMedia & { type?: string }) | null }[]
}

/**
 * Sequels of the given series, keyed by the series they follow.
 *
 * Batched fifty at a time: asking per series would be one request each, and a
 * library of a hundred would take a minute of queue time for a check that runs
 * in the background.
 */
export async function sequelsOf(ids: number[]): Promise<Map<number, Media[]>> {
  const out = new Map<number, Media[]>()

  for (let i = 0; i < ids.length; i += 50) {
    const slice = ids.slice(i, i + 50)
    const data = await request<{ Page: { media: { id: number; relations: RawRelations | null }[] } }>(
      SEQUELS_QUERY,
      { ids: slice },
      'background',
      `sequels:${slice.join(',')}`
    )

    for (const row of data.Page.media) {
      const sequels = (row.relations?.edges ?? [])
        .filter((e) => e.relationType === 'SEQUEL' && e.node?.type === 'ANIME')
        .map((e) => e.node)
        .filter((node): node is RawMedia & { type?: string } => node !== null)
        .map(toMedia)
      if (sequels.length) out.set(row.id, sequels)
    }
  }

  return out
}

export async function mediaByMalIds(malIds: number[]): Promise<Map<number, Media>> {
  const found = new Map<number, Media>()
  for (let i = 0; i < malIds.length; i += 50) {
    const slice = malIds.slice(i, i + 50)
    const data = await request<{ Page: { media: RawMedia[] } }>(
      BY_MAL_QUERY,
      { ids: slice, page: 1 },
      'background',
      `mal:${slice.join(',')}`
    )
    for (const raw of data.Page.media) {
      const media = toMedia(raw)
      if (media.idMal) found.set(media.idMal, media)
    }
  }
  return found
}
