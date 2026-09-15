import { useMemo } from 'react'
import { GENRE_LABELS, type Media } from '@shared/types'
import { useApp } from '@/store/app'

/*
 * Les chiffres des pages Statistiques des expériences.
 *
 * Calculés une fois ici pour que les cinq mises en scène racontent la même
 * année : seules la forme et l'ordre changent d'un thème à l'autre.
 */

export interface StatsData {
  minutes: number
  episodes: number
  /** Séries dont au moins un épisode a été vu. */
  series: number
  completed: number
  currentStreak: number
  bestStreak: number
  avgScore: number | null
  scored: number
  topSeries: { media: Media; episodes: number; minutes: number }[]
  genres: { name: string; minutes: number }[]
  studios: { name: string; episodes: number }[]
  /** Douze derniers mois, le plus ancien d'abord. */
  months: { label: string; episodes: number; minutes: number }[]
  /** Lundi d'abord. */
  weekdays: number[]
  hours: number[]
  record: { at: number; episodes: number } | null
}

const DAY = 86_400_000
export const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

export function useStats(): StatsData {
  const events = useApp((s) => s.events)
  const entries = useApp((s) => s.entries)
  const mediaMap = useApp((s) => s.media)

  return useMemo(() => {
    const perSeries = new Map<number, { episodes: number; minutes: number }>()
    const perDay = new Map<number, number>()
    const genres = new Map<string, number>()
    const studios = new Map<string, number>()
    const weekdays = Array.from({ length: 7 }, () => 0)
    const hours = Array.from({ length: 24 }, () => 0)
    let minutes = 0

    for (const ev of events) {
      minutes += ev.minutes
      const row = perSeries.get(ev.animeId) ?? { episodes: 0, minutes: 0 }
      row.episodes += 1
      row.minutes += ev.minutes
      perSeries.set(ev.animeId, row)

      const media = mediaMap.get(ev.animeId)
      for (const g of media?.genres ?? []) genres.set(g, (genres.get(g) ?? 0) + ev.minutes)
      if (media?.studios[0]) studios.set(media.studios[0], (studios.get(media.studios[0]) ?? 0) + 1)

      // Une date d'import n'est pas une date de visionnage : elle fausserait
      // les jours, les heures et les séries.
      if (ev.imported) continue
      const d = new Date(ev.at)
      weekdays[(d.getDay() + 6) % 7] += 1
      hours[d.getHours()] += 1
      d.setHours(0, 0, 0, 0)
      perDay.set(d.getTime(), (perDay.get(d.getTime()) ?? 0) + 1)
    }

    const days = [...perDay.keys()].sort((a, b) => a - b)
    let bestStreak = 0
    let run = 0
    for (let i = 0; i < days.length; i += 1) {
      run = i > 0 && Math.round((days[i] - days[i - 1]) / DAY) === 1 ? run + 1 : 1
      bestStreak = Math.max(bestStreak, run)
    }
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let currentStreak = 0
    let cursor = perDay.has(today.getTime()) ? today.getTime() : today.getTime() - DAY
    while (perDay.has(cursor)) {
      currentStreak += 1
      cursor -= DAY
    }

    let record: StatsData['record'] = null
    for (const [at, n] of perDay) if (!record || n > record.episodes) record = { at, episodes: n }

    const now = new Date()
    const months = Array.from({ length: 12 }, (_, i) => {
      const start = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
      let episodes = 0
      let mins = 0
      for (const ev of events) {
        if (ev.imported || ev.at < start.getTime() || ev.at >= end.getTime()) continue
        episodes += 1
        mins += ev.minutes
      }
      return { label: start.toLocaleDateString('fr-FR', { month: 'short' }), episodes, minutes: mins }
    })

    const scores = [...entries.values()].map((e) => e.score).filter((s): s is number => s !== null)

    return {
      minutes,
      episodes: events.length,
      series: perSeries.size,
      completed: [...entries.values()].filter((e) => e.status === 'completed').length,
      currentStreak,
      bestStreak,
      avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      scored: scores.length,
      topSeries: [...perSeries.entries()]
        .map(([id, row]) => ({ media: mediaMap.get(id), ...row }))
        .filter((row): row is { media: Media; episodes: number; minutes: number } => !!row.media)
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 10),
      genres: [...genres.entries()]
        .map(([g, m]) => ({ name: GENRE_LABELS[g] ?? g, minutes: m }))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 8),
      studios: [...studios.entries()]
        .map(([name, episodes]) => ({ name, episodes }))
        .sort((a, b) => b.episodes - a.episodes)
        .slice(0, 6),
      months,
      weekdays,
      hours,
      record
    }
  }, [events, entries, mediaMap])
}
