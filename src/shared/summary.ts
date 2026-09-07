/**
 * Ce que le téléphone montre de la bibliothèque : un bilan, et ce qui arrive.
 *
 * La page servie au téléphone n'a ni build ni dépendance — elle ne peut donc
 * pas réutiliser les pages de l'app, qui sont du React compilé. Ce qu'elle
 * affiche est calculé ici, dans le processus principal, et lui parvient déjà
 * fait : elle n'a qu'à le mettre en forme.
 *
 * D'où ce module, à part et testé plutôt que noyé dans le serveur. Ce sont des
 * chiffres qu'on lit sans les vérifier — un total faux ne se voit pas, il se
 * croit.
 */

export interface SummaryEvent {
  animeId: number
  at: number
  minutes: number
  /** Les lignes importées portent la date d'une coche, pas d'un visionnage. */
  imported?: boolean
}

export interface SummaryEntry {
  animeId: number
  status: string
}

export interface SummaryMedia {
  id: number
  title: string
  cover: string | null
  episodes: number | null
  genres: string[]
  nextAiring: { episode: number; airingAt: number } | null
}

export interface Summary {
  episodes: number
  minutes: number
  /** Sur sept jours glissants, hors lignes importées. */
  week: { episodes: number; minutes: number }
  series: number
  finished: number
  watching: number
  /** Les genres les plus regardés, du plus vu au moins vu. */
  genres: { name: string; count: number }[]
}

const DAY_MS = 86_400_000

/** Assez pour dire ce qu'on aime, assez peu pour tenir sur un écran de poche. */
export const TOP_GENRES = 6

export function summarise(
  events: SummaryEvent[],
  entries: SummaryEntry[],
  media: Map<number, SummaryMedia>,
  now = Date.now()
): Summary {
  let episodes = 0
  let minutes = 0
  let weekEpisodes = 0
  let weekMinutes = 0
  const since = now - 7 * DAY_MS

  for (const ev of events) {
    episodes += 1
    minutes += Number.isFinite(ev.minutes) ? ev.minutes : 0
    // Même règle que la barre latérale de l'app : une ligne importée porte la
    // date à laquelle une autre app l'a cochée, et n'a rien à faire ici.
    if (!ev.imported && ev.at >= since) {
      weekEpisodes += 1
      weekMinutes += Number.isFinite(ev.minutes) ? ev.minutes : 0
    }
  }

  const compte = new Map<number, number>()
  for (const ev of events) compte.set(ev.animeId, (compte.get(ev.animeId) ?? 0) + 1)

  const genres = new Map<string, number>()
  for (const [animeId, vus] of compte) {
    const found = media.get(animeId)
    if (!found) continue
    // Pondéré par les épisodes vus : trois cents épisodes d'action pèsent plus
    // qu'une comédie abandonnée au deuxième.
    for (const genre of found.genres) genres.set(genre, (genres.get(genre) ?? 0) + vus)
  }

  return {
    episodes,
    minutes,
    week: { episodes: weekEpisodes, minutes: weekMinutes },
    series: entries.length,
    finished: entries.filter((e) => e.status === 'completed').length,
    watching: entries.filter((e) => e.status === 'watching').length,
    genres: [...genres.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'))
      .slice(0, TOP_GENRES)
  }
}

export interface Airing {
  animeId: number
  title: string
  cover: string | null
  episode: number
  /** Millisecondes, pour que le téléphone n'ait pas à convertir. */
  airingAt: number
}

/** Deux semaines : au-delà, AniList n'annonce presque plus rien de sûr. */
export const AIRING_DAYS = 14

/**
 * Les prochains épisodes des séries suivies, du plus proche au plus lointain.
 *
 * Seules celles qu'on regarde ou qu'on prévoit : le calendrier répond à
 * « qu'est-ce qui sort pour moi », pas « qu'est-ce qui sort ». Un épisode déjà
 * diffusé n'y figure pas non plus — il est sorti, il n'arrive plus.
 */
export function upcoming(
  entries: SummaryEntry[],
  media: Map<number, SummaryMedia>,
  now = Date.now(),
  days = AIRING_DAYS
): Airing[] {
  const limite = now + days * DAY_MS
  const out: Airing[] = []

  for (const entry of entries) {
    if (entry.status !== 'watching' && entry.status !== 'planned') continue
    const found = media.get(entry.animeId)
    const next = found?.nextAiring
    if (!found || !next) continue

    const at = next.airingAt * 1000
    if (at < now || at > limite) continue
    out.push({ animeId: found.id, title: found.title, cover: found.cover, episode: next.episode, airingAt: at })
  }

  return out.sort((a, b) => a.airingAt - b.airingAt)
}
