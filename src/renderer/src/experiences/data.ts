import { useMemo } from 'react'
import type { Entry, Media } from '@shared/types'
import { useNow } from '@/lib/hooks'
import { useApp } from '@/store/app'

/*
 * Ce que les expériences affichent, calculé une fois ici.
 *
 * Chaque expérience compose ses propres écrans, mais la vérité reste la même
 * que sur l'accueil classique : les mêmes séries en cours, le même retard, les
 * mêmes épisodes à venir. Seule la mise en scène change.
 */

export function useLastWatch(): Map<number, number> {
  const events = useApp((s) => s.events)
  return useMemo(() => {
    const map = new Map<number, number>()
    for (const ev of events) map.set(ev.animeId, Math.max(map.get(ev.animeId) ?? 0, ev.at))
    return map
  }, [events])
}

/** Séries en cours, la dernière regardée d'abord. */
export function useContinue(): Media[] {
  const entries = useApp((s) => s.entries)
  const media = useApp((s) => s.media)
  const last = useLastWatch()
  return useMemo(
    () =>
      [...entries.values()]
        .filter((e) => e.status === 'watching')
        .map((e) => media.get(e.animeId))
        .filter((m): m is Media => !!m)
        .sort((a, b) => (last.get(b.id) ?? 0) - (last.get(a.id) ?? 0)),
    [entries, media, last]
  )
}

/** Épisodes déjà diffusés et pas encore vus, par série. */
export function useBehind(): { media: Media; behind: number }[] {
  const entries = useApp((s) => s.entries)
  const mediaMap = useApp((s) => s.media)
  const watched = useApp((s) => s.watched)
  return useMemo(() => {
    const out: { media: Media; behind: number }[] = []
    for (const entry of entries.values()) {
      if (entry.status !== 'watching') continue
      const media = mediaMap.get(entry.animeId)
      if (!media) continue
      const aired = media.nextAiring ? media.nextAiring.episode - 1 : (media.episodes ?? 0)
      const seen = watched.get(media.id)
      let behind = 0
      for (let n = 1; n <= aired; n += 1) if (!seen?.has(n)) behind += 1
      if (behind > 0) out.push({ media, behind })
    }
    return out.sort((a, b) => b.behind - a.behind)
  }, [entries, mediaMap, watched])
}

/** Prochains épisodes des séries suivies, sur huit jours. */
export function useUpcoming(): Media[] {
  const entries = useApp((s) => s.entries)
  const mediaMap = useApp((s) => s.media)
  const now = useNow()
  return useMemo(() => {
    const horizon = now / 1000 + 8 * 86_400
    return [...entries.values()]
      .filter((e) => e.status === 'watching' || e.status === 'planned')
      .map((e) => mediaMap.get(e.animeId))
      .filter((m): m is Media => !!m?.nextAiring && m.nextAiring.airingAt < horizon)
      .sort((a, b) => a.nextAiring!.airingAt - b.nextAiring!.airingAt)
  }, [entries, mediaMap, now])
}

export interface Totals {
  minutes: number
  episodes: number
  week: number
  weekMinutes: number
  watching: number
  completed: number
  planned: number
  /** Jours d'affilée avec au moins un épisode, jusqu'à aujourd'hui ou hier. */
  streak: number
  /** Épisodes par jour sur les quatorze derniers jours, le plus ancien d'abord. */
  days: number[]
}

export function useTotals(): Totals {
  const events = useApp((s) => s.events)
  const entries = useApp((s) => s.entries)
  const now = useNow()
  return useMemo(() => {
    const day = 86_400_000
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    const start = today.getTime()
    const byDay = new Map<number, number>()
    let minutes = 0
    let week = 0
    let weekMinutes = 0
    for (const ev of events) {
      minutes += ev.minutes
      if (ev.imported) continue
      const d = new Date(ev.at)
      d.setHours(0, 0, 0, 0)
      byDay.set(d.getTime(), (byDay.get(d.getTime()) ?? 0) + 1)
      if (ev.at >= now - 7 * day) {
        week += 1
        weekMinutes += ev.minutes
      }
    }
    let streak = 0
    let cursor = byDay.has(start) ? start : start - day
    while (byDay.has(cursor)) {
      streak += 1
      cursor -= day
    }
    const days = Array.from({ length: 14 }, (_, i) => byDay.get(start - (13 - i) * day) ?? 0)
    const statuses = [...entries.values()].map((e) => e.status)
    return {
      minutes,
      episodes: events.length,
      week,
      weekMinutes,
      watching: statuses.filter((s) => s === 'watching').length,
      completed: statuses.filter((s) => s === 'completed').length,
      planned: statuses.filter((s) => s === 'planned').length,
      streak,
      days
    }
  }, [events, entries, now])
}

/** Toute la bibliothèque, l'activité la plus récente d'abord. */
export function useShelf(): { entry: Entry; media: Media }[] {
  const entries = useApp((s) => s.entries)
  const mediaMap = useApp((s) => s.media)
  const last = useLastWatch()
  return useMemo(
    () =>
      [...entries.values()]
        .map((entry) => ({ entry, media: mediaMap.get(entry.animeId) }))
        .filter((row): row is { entry: Entry; media: Media } => !!row.media)
        .sort(
          (a, b) =>
            Math.max(last.get(b.media.id) ?? 0, b.entry.updatedAt) -
            Math.max(last.get(a.media.id) ?? 0, a.entry.updatedAt)
        ),
    [entries, mediaMap, last]
  )
}
