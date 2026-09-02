/**
 * Importer une liste depuis un pseudo.
 *
 * MyAnimeList et TV Time demandaient un fichier exporté à la main. AniList et
 * Kitsu servent les listes publiques sans compte ni clé : un pseudo suffit,
 * et c'est la façon la plus courte d'amener des années d'historique.
 *
 * Deux chemins, parce que les deux services ne posent pas le même problème :
 *
 * - **AniList** donne directement ses propres identifiants. Rien à rapprocher,
 *   rien à deviner : c'est l'import le plus fidèle possible.
 * - **Kitsu** a ses identifiants à lui, et publie ses correspondances. On y
 *   lit celle de MyAnimeList, que l'app sait déjà résoudre. Une série sans
 *   correspondance est comptée comme ignorée plutôt que rapprochée au titre —
 *   un mauvais rapprochement écrit une progression sur la mauvaise série, et
 *   ne se découvre que bien plus tard.
 *
 * Rien n'est jamais remplacé : l'import fusionne, comme celui de MyAnimeList.
 */

import type { Entry, ImportReport, Media, WatchEvent } from '@shared/types'
import {
  cleanUsername,
  fuzzyDate,
  isoDate,
  scoreFromTwenty,
  scoreOutOfTen,
  statusFromAniList,
  statusFromKitsu,
  watchedCount
} from '@shared/import-list'
import { mediaByMalIds, refreshMedia } from './anilist'
import { importSnapshot } from './store'

const KITSU = 'https://kitsu.app/api/edge'
const KITSU_HEADERS = { Accept: 'application/vnd.api+json' }

/** Kitsu pagine par cent ; au-delà de ce nombre de pages, on s'arrête. */
const MAX_PAGES = 40

const fail = (message: string): ImportReport => ({
  ok: false,
  message,
  added: 0,
  updated: 0,
  episodes: 0,
  skipped: 0
})

/** Une entrée de liste, une fois débarrassée des mots de son service d'origine. */
interface Row {
  animeId: number
  status: Entry['status']
  score: number | null
  progress: number
  rewatches: number
  startedAt: number | null
  finishedAt: number | null
}

/**
 * Assemble les entrées et l'historique, puis fusionne.
 *
 * Un épisode importé porte `imported: true` : il compte dans le temps de
 * visionnage et dans la progression, mais reste hors des statistiques par jour
 * — sa date est celle où il a été coché ailleurs, pas celle où il a été vu.
 */
function commit(rows: Row[], media: Media[], label: string, skipped: number): ImportReport {
  const byId = new Map(media.map((m) => [m.id, m]))
  const now = Date.now()
  const entries: Entry[] = []
  const history: WatchEvent[] = []

  for (const row of rows) {
    const found = byId.get(row.animeId)
    if (!found) continue

    entries.push({
      animeId: row.animeId,
      status: row.status,
      addedAt: row.startedAt ?? now,
      updatedAt: now,
      score: row.score,
      emotions: [],
      favorite: false,
      notes: '',
      rewatches: row.rewatches,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt
    })

    const seen = watchedCount(row.progress, found.episodes)
    const minutes = found.duration || 24
    for (let ep = 1; ep <= seen; ep += 1) {
      history.push({ animeId: row.animeId, episode: ep, at: row.finishedAt ?? now, minutes, imported: true })
    }
  }

  if (!entries.length) return fail(`Rien à importer depuis ${label}.`)

  importSnapshot({ version: 1, entries, media, history, prefs: {} as never }, 'merge')

  return {
    ok: true,
    message: skipped
      ? `${entries.length} animes importés depuis ${label}. ${skipped} sans équivalent AniList ont été ignorés.`
      : `${entries.length} animes importés depuis ${label}.`,
    added: entries.length,
    updated: 0,
    episodes: history.length,
    skipped
  }
}

// ---------------------------------------------------------------- AniList

const LIST_QUERY = `
query List($user: String) {
  MediaListCollection(userName: $user, type: ANIME) {
    lists {
      entries {
        status
        progress
        score(format: POINT_10)
        repeat
        startedAt { year month day }
        completedAt { year month day }
        media { id }
      }
    }
  }
}`

interface RawAniListEntry {
  status: string | null
  progress: number | null
  score: number | null
  repeat: number | null
  startedAt: { year: number | null; month: number | null; day: number | null } | null
  completedAt: { year: number | null; month: number | null; day: number | null } | null
  media: { id: number } | null
}

export async function importAniList(rawUser: string): Promise<ImportReport> {
  const user = cleanUsername(rawUser)
  if (!user) return fail('Indique un pseudo AniList.')

  let lists: { entries: RawAniListEntry[] }[]
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: LIST_QUERY, variables: { user } })
    })
    const body = (await res.json()) as {
      data?: { MediaListCollection: { lists: { entries: RawAniListEntry[] }[] } | null }
      errors?: { message: string; status?: number }[]
    }

    if (body.errors?.length) {
      const first = body.errors[0]
      // Les deux seuls refus qu'on peut expliquer utilement.
      if (first.status === 404 && /private/i.test(first.message)) {
        return fail(`La liste de ${user} est privée. Elle doit être publique pour être lue.`)
      }
      if (first.status === 404) return fail(`Aucun compte AniList nommé « ${user} ».`)
      return fail(`AniList : ${first.message}`)
    }
    lists = body.data?.MediaListCollection?.lists ?? []
  } catch (err) {
    return fail(`AniList injoignable : ${(err as Error).message}`)
  }

  const rows: Row[] = []
  let skipped = 0

  for (const list of lists) {
    for (const entry of list.entries) {
      const status = statusFromAniList(entry.status)
      if (!status || !entry.media) {
        skipped += 1
        continue
      }
      rows.push({
        animeId: entry.media.id,
        status,
        score: scoreOutOfTen(entry.score),
        progress: entry.progress ?? 0,
        rewatches: entry.repeat ?? 0,
        startedAt: fuzzyDate(entry.startedAt),
        finishedAt: fuzzyDate(entry.completedAt)
      })
    }
  }

  if (!rows.length) return fail(`La liste de ${user} est vide.`)

  let media: Media[]
  try {
    media = await refreshMedia(rows.map((r) => r.animeId))
  } catch (err) {
    return fail(`AniList injoignable : ${(err as Error).message}`)
  }

  return commit(rows, media, `AniList (${user})`, skipped)
}

// ---------------------------------------------------------------- Kitsu

interface KitsuEntry {
  attributes: {
    status: string | null
    progress: number | null
    ratingTwenty: number | null
    reconsumeCount: number | null
    startedAt: string | null
    finishedAt: string | null
  }
  relationships?: { anime?: { data?: { id: string } | null } | null }
}

interface KitsuIncluded {
  id: string
  type: string
  attributes?: { externalSite?: string; externalId?: string }
  relationships?: { mappings?: { data?: { id: string }[] } }
}

async function kitsuJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: KITSU_HEADERS })
  if (!res.ok) throw new Error(`Kitsu a répondu ${res.status}.`)
  return (await res.json()) as T
}

export async function importKitsu(rawUser: string): Promise<ImportReport> {
  const user = cleanUsername(rawUser)
  if (!user) return fail('Indique un pseudo Kitsu.')

  let userId: string
  try {
    const found = await kitsuJson<{ data: { id: string }[] }>(`${KITSU}/users?filter[slug]=${encodeURIComponent(user)}`)
    if (!found.data?.length) return fail(`Aucun compte Kitsu nommé « ${user} ».`)
    userId = found.data[0].id
  } catch (err) {
    return fail(`Kitsu injoignable : ${(err as Error).message}`)
  }

  /** Identifiant Kitsu de la série → identifiant MyAnimeList. */
  const malOf = new Map<string, number>()
  const raw: { kitsuId: string; entry: KitsuEntry }[] = []

  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url =
        `${KITSU}/library-entries?filter[userId]=${userId}&filter[kind]=anime` +
        `&page[limit]=100&page[offset]=${page * 100}&include=anime.mappings`
      const body = await kitsuJson<{ data: KitsuEntry[]; included?: KitsuIncluded[] }>(url)

      // Les correspondances arrivent à plat, reliées à leur série par la
      // relation `mappings` : il faut refaire le lien dans les deux sens.
      const mappings = new Map<string, KitsuIncluded>()
      for (const item of body.included ?? []) if (item.type === 'mappings') mappings.set(item.id, item)

      for (const item of body.included ?? []) {
        if (item.type !== 'anime') continue
        for (const ref of item.relationships?.mappings?.data ?? []) {
          const mapping = mappings.get(ref.id)
          if (mapping?.attributes?.externalSite !== 'myanimelist/anime') continue
          const malId = Number(mapping.attributes.externalId)
          if (Number.isFinite(malId) && malId > 0) malOf.set(item.id, malId)
        }
      }

      for (const entry of body.data ?? []) {
        const kitsuId = entry.relationships?.anime?.data?.id
        if (kitsuId) raw.push({ kitsuId, entry })
      }

      if ((body.data?.length ?? 0) < 100) break
    }
  } catch (err) {
    return fail(`Kitsu injoignable : ${(err as Error).message}`)
  }

  if (!raw.length) return fail(`La liste de ${user} est vide, ou privée.`)

  const malIds = [...new Set([...malOf.values()])]
  let byMal: Map<number, Media>
  try {
    byMal = await mediaByMalIds(malIds)
  } catch (err) {
    return fail(`AniList injoignable : ${(err as Error).message}`)
  }

  const rows: Row[] = []
  let skipped = 0

  for (const { kitsuId, entry } of raw) {
    const status = statusFromKitsu(entry.attributes.status)
    const malId = malOf.get(kitsuId)
    const media = malId ? byMal.get(malId) : undefined
    if (!status || !media) {
      skipped += 1
      continue
    }
    rows.push({
      animeId: media.id,
      status,
      score: scoreFromTwenty(entry.attributes.ratingTwenty),
      progress: entry.attributes.progress ?? 0,
      rewatches: entry.attributes.reconsumeCount ?? 0,
      startedAt: isoDate(entry.attributes.startedAt),
      finishedAt: isoDate(entry.attributes.finishedAt)
    })
  }

  return commit(rows, [...byMal.values()], `Kitsu (${user})`, skipped)
}
