import { humanMessage } from '@shared/api-outage'
import { useEffect, useMemo, useState } from 'react'
import type { AiringEntry, BrowseKind, BrowseQuery, ForYou, Manga, MangaKind } from '@shared/types'
import { useBrowse, useDebounced, useNow } from '@/lib/hooks'
import { useApp } from '@/store/app'

/*
 * Les données des pages Découvrir, Calendrier et Manga des expériences.
 *
 * Mêmes requêtes que les pages classiques, sorties de leur mise en page : une
 * expérience ne choisit que la façon de montrer le catalogue, jamais ce qu'il
 * contient.
 */

/** Catalogue AniList : un onglet, ou une recherche dès deux caractères. */
export function useCatalogue(tab: BrowseKind, search: string): ReturnType<typeof useBrowse> & { searching: boolean } {
  const debounced = useDebounced(search.trim(), 380)
  const searching = debounced.length >= 2
  const query = useMemo<BrowseQuery>(
    () => (searching ? { kind: 'search', search: debounced, perPage: 30 } : { kind: tab, perPage: 30 }),
    [searching, debounced, tab]
  )
  return { ...useBrowse(query), searching }
}

/** Les recommandations du profil, demandées une fois tant que la bibliothèque n'est pas vide. */
export function useForYou(): ForYou | null {
  const size = useApp((s) => s.entries.size)
  const [rec, setRec] = useState<ForYou | null>(null)
  useEffect(() => {
    if (!size) return
    let alive = true
    window.api.anime
      .forYou()
      .then((res) => alive && setRec(res))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [size])
  return rec
}

const DAY = 86_400_000

function startOfWeek(ts: number, weekStart: 0 | 1): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime() - ((d.getDay() - weekStart + 7) % 7) * DAY
}

export interface WeekData {
  from: number
  days: { date: number; items: AiringEntry[] }[]
  total: number
  loading: boolean
  error: string | null
}

/** Les épisodes d'une semaine : ceux de la bibliothèque, ou tout ce qui passe. */
export function useWeek(scope: 'library' | 'all', offset: number): WeekData {
  const entries = useApp((s) => s.entries)
  const mediaMap = useApp((s) => s.media)
  const weekStart = useApp((s) => s.prefs.weekStart)
  const now = useNow()

  const ids = useMemo(
    () => [...entries.values()].filter((e) => e.status === 'watching' || e.status === 'planned').map((e) => e.animeId),
    [entries]
  )
  const from = useMemo(() => startOfWeek(now, weekStart) + offset * 7 * DAY, [now, weekStart, offset])
  const to = from + 7 * DAY
  const key = scope === 'library' && !ids.length ? '' : `${scope}|${from}|${scope === 'all' ? '' : ids.join()}`
  const [held, setHeld] = useState<{ key: string; slots: AiringEntry[]; error: string | null }>({
    key: '',
    slots: [],
    error: null
  })

  useEffect(() => {
    if (!key) return
    let alive = true
    const s = Math.floor(from / 1000)
    const e = Math.floor(to / 1000)
    const request =
      scope === 'all'
        ? window.api.anime.airingAll(s, e)
        : window.api.anime
            .airing(ids.slice(0, 200), s, e)
            .then((items) =>
              items
                .map((item) => ({ ...item, media: mediaMap.get(item.mediaId) }))
                .filter((item): item is AiringEntry => !!item.media)
            )
    request
      .then((slots) => alive && setHeld({ key, slots, error: null }))
      .catch((err: Error) => alive && setHeld({ key, slots: [], error: humanMessage(err.message) }))
    return () => {
      alive = false
    }
  }, [key, scope, ids, from, to, mediaMap])

  const fresh = held.key === key
  const days = useMemo(() => {
    const buckets = Array.from({ length: 7 }, (_, i) => ({ date: from + i * DAY, items: [] as AiringEntry[] }))
    for (const slot of fresh ? held.slots : []) {
      const index = Math.floor((slot.airingAt * 1000 - from) / DAY)
      if (index >= 0 && index < 7) buckets[index].items.push(slot)
    }
    for (const bucket of buckets) bucket.items.sort((a, b) => a.airingAt - b.airingAt)
    return buckets
  }, [fresh, held.slots, from])

  return {
    from,
    days,
    total: days.reduce((n, d) => n + d.items.length, 0),
    loading: key !== '' && !fresh,
    error: fresh ? held.error : null
  }
}

/** Le catalogue manga : un onglet, ou une recherche. Lecture seule, comme la page classique. */
export function useMangaList(
  tab: MangaKind,
  search: string
): { items: Manga[]; loading: boolean; error: string | null } {
  const debounced = useDebounced(search.trim(), 380)
  const searching = debounced.length >= 2
  const kind: MangaKind = searching ? 'search' : tab
  const key = `${kind}:${searching ? debounced : ''}`
  const [held, setHeld] = useState<{ key: string; items: Manga[]; error: string | null }>({
    key: '',
    items: [],
    error: null
  })

  useEffect(() => {
    let alive = true
    window.api.manga
      .browse(kind, 1, searching ? debounced : '')
      .then((res) => alive && setHeld({ key, items: res.items, error: null }))
      .catch((err: Error) => alive && setHeld({ key, items: [], error: humanMessage(err.message) }))
    return () => {
      alive = false
    }
  }, [key, kind, searching, debounced])

  const fresh = held.key === key
  return { items: fresh ? held.items : [], loading: !fresh, error: fresh ? held.error : null }
}
