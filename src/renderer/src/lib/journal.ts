/**
 * Ce que les deux journaux lisent.
 *
 * La page classique et celle du nouveau design montrent les mêmes lignes, avec
 * les mêmes filtres : seule la forme change. Tout ce qui décide de *quoi* est
 * montré vit donc ici, et les deux pages ne gardent que leur mise en page.
 */

import { useMemo, useState } from 'react'
import { EMOTIONS, type EmotionId, type Media, type WatchEvent } from '@shared/types'
import { startOfDay, titleOf } from '@/lib/format'
import { useSessionState } from '@/lib/hooks'
import { useApp } from '@/store/app'

export interface JournalRow {
  event: WatchEvent
  media: Media
}

export type JournalFilter = 'all' | 'notes' | 'pinned'

export const JOURNAL_FILTERS: { id: JournalFilter; label: string; hint: string }[] = [
  { id: 'all', label: 'Tout', hint: 'Chaque épisode coché, du plus récent au plus ancien.' },
  { id: 'notes', label: 'Avec une note', hint: 'Les épisodes dont tu as écrit quelque chose.' },
  { id: 'pinned', label: 'À revoir', hint: 'Les épisodes que tu as mis de côté.' }
]

/** Un pas de lecture : assez pour remplir l'écran, assez peu pour rester vif. */
const PAGE = 120

export const passLabel = (pass: number): string => (pass === 1 ? '2ᵉ visionnage' : `${pass + 1}ᵉ visionnage`)

const EMOTION_BY_ID = new Map(EMOTIONS.map((e) => [e.id, e]))

export const emotionOf = (id: EmotionId): { emoji: string; label: string } | undefined => EMOTION_BY_ID.get(id)

export interface Journal {
  /** Les visionnages datés, avant tout filtre. */
  total: number
  /** Les lignes importées, mises de côté — voir le commentaire du filtre. */
  imported: number
  noted: number
  pinned: number
  rows: JournalRow[]
  days: { day: number; rows: JournalRow[] }[]
  remaining: number
  more: () => void
  emotionCounts: Map<EmotionId, number>
  filter: JournalFilter
  setFilter: (value: JournalFilter) => void
  emotion: EmotionId | null
  setEmotion: (value: EmotionId | null) => void
  search: string
  setSearch: (value: string) => void
  reset: () => void
}

export function useJournal(): Journal {
  const events = useApp((s) => s.events)
  const media = useApp((s) => s.media)
  const lang = useApp((s) => s.prefs.titleLang)

  const [filter, keepFilter] = useSessionState<JournalFilter>('journal.filter', 'all')
  const [emotion, keepEmotion] = useSessionState<EmotionId | null>('journal.emotion', null)
  const [search, keepSearch] = useSessionState<string>('journal.search', '')
  const [shown, setShown] = useState(PAGE)

  const imported = useMemo(() => events.filter((e) => e.imported).length, [events])

  /*
   * Le journal entier, une fois : c'est lui qu'on filtre ensuite, et le tri
   * d'un historique de plusieurs milliers de lignes n'a pas à recommencer à
   * chaque frappe dans la recherche.
   *
   * Les lignes importées en sont exclues. Elles portent la date du pointage
   * dans l'app d'origine, pas celle du visionnage : les ranger par journée
   * inventerait des soirées qui n'ont pas eu lieu, souvent des centaines le
   * même jour. C'est déjà pour cette raison que les statistiques par jour les
   * ignorent. Corriger la date d'une ligne depuis sa fiche la rend réelle, et
   * elle rejoint le journal.
   */
  const all = useMemo(
    () =>
      events
        .filter((event) => !event.imported)
        .map((event) => ({ event, media: media.get(event.animeId) }))
        .filter((row): row is JournalRow => !!row.media)
        .sort((a, b) => b.event.at - a.event.at),
    [events, media]
  )

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return all.filter(({ event, media: m }) => {
      if (filter === 'notes' && !event.note?.trim()) return false
      if (filter === 'pinned' && !event.pinned) return false
      if (emotion && !event.emotions?.includes(emotion)) return false
      if (!needle) return true
      // La recherche porte sur ce qu'on a écrit autant que sur le titre : on
      // cherche « ce passage du train » sans savoir de quelle série il venait.
      return titleOf(m, lang).toLowerCase().includes(needle) || (event.note?.toLowerCase().includes(needle) ?? false)
    })
  }, [all, filter, emotion, search, lang])

  // Les émotions jamais posées ne servent à rien comme filtre : elles ne
  // donneraient qu'une page vide. Seules celles du journal sont proposées.
  const emotionCounts = useMemo(() => {
    const tally = new Map<EmotionId, number>()
    for (const { event } of all) for (const id of event.emotions ?? []) tally.set(id, (tally.get(id) ?? 0) + 1)
    return tally
  }, [all])

  /** Découpé en journées : c'est l'unité dans laquelle on se souvient. */
  const days = useMemo(() => {
    const out: { day: number; rows: JournalRow[] }[] = []
    for (const row of rows.slice(0, shown)) {
      const day = startOfDay(row.event.at)
      const last = out[out.length - 1]
      if (last && last.day === day) last.rows.push(row)
      else out.push({ day, rows: [row] })
    }
    return out
  }, [rows, shown])

  const noted = useMemo(() => all.filter(({ event }) => event.note?.trim()).length, [all])
  const pinned = useMemo(() => all.filter(({ event }) => event.pinned).length, [all])

  // Changer de filtre remet la lecture au début : garder le rang atteint plus
  // bas dans une liste qui vient de changer ne veut rien dire.
  const setFilter = (value: JournalFilter): void => {
    keepFilter(value)
    setShown(PAGE)
  }
  const setEmotion = (value: EmotionId | null): void => {
    keepEmotion(value)
    setShown(PAGE)
  }
  const setSearch = (value: string): void => {
    keepSearch(value)
    setShown(PAGE)
  }

  return {
    total: all.length,
    imported,
    noted,
    pinned,
    rows,
    days,
    remaining: Math.max(0, rows.length - shown),
    more: () => setShown(shown + PAGE),
    emotionCounts,
    filter,
    setFilter,
    emotion,
    setEmotion,
    search,
    setSearch,
    reset: () => {
      keepFilter('all')
      keepEmotion(null)
      keepSearch('')
      setShown(PAGE)
    }
  }
}
