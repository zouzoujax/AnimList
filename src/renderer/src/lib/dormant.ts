import { useMemo } from 'react'
import { dormantSeries, type DormantSeries, type PausedRow } from '@shared/dormant'
import type { Media } from '@shared/types'
import { useNow } from '@/lib/hooks'
import { useApp } from '@/store/app'

export interface DormantRow {
  media: Media
  series: DormantSeries
}

/**
 * Les séries en pause qu'on a oubliées, prêtes à afficher.
 *
 * Le calcul est ici et la règle dans `shared/dormant.ts`, pour que l'accueil
 * classique et celui du nouveau design comptent la même chose — deux comptes
 * différents pour la même phrase se seraient contredits à l'écran.
 *
 * « Depuis quand » est la date du dernier épisode coché, et à défaut celle de
 * la mise en pause : une série importée sans historique n'a que la seconde, et
 * s'en priver la rendrait invisible pour toujours.
 */
export function useDormant(max = 6): DormantRow[] {
  const entries = useApp((s) => s.entries)
  const media = useApp((s) => s.media)
  const watched = useApp((s) => s.watched)
  const events = useApp((s) => s.events)
  // Une heure : l'ancienneté se dit en mois, rien ne bouge à la minute.
  const now = useNow(3_600_000)

  return useMemo(() => {
    const lastWatchAt = new Map<number, number>()
    for (const ev of events) lastWatchAt.set(ev.animeId, Math.max(lastWatchAt.get(ev.animeId) ?? 0, ev.at))

    const rows: PausedRow[] = []
    for (const entry of entries.values()) {
      if (entry.status !== 'paused') continue
      const found = media.get(entry.animeId)
      if (!found) continue
      const aired = found.nextAiring ? found.nextAiring.episode - 1 : found.episodes
      rows.push({
        animeId: entry.animeId,
        lastAt: lastWatchAt.get(entry.animeId) ?? entry.updatedAt,
        seen: watched.get(entry.animeId)?.size ?? 0,
        aired
      })
    }

    return dormantSeries(rows, now)
      .map((series) => ({ series, media: media.get(series.animeId) }))
      .filter((row): row is DormantRow => !!row.media)
      .slice(0, max)
  }, [entries, media, watched, events, now, max])
}
