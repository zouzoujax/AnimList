/**
 * Les mangas dans le calendrier : ce qu'AniList date, et rien d'autre.
 *
 * AniList ne connaît ni les chapitres à venir ni les tomes : pour un manga, il
 * ne date que le début et la fin de sa parution. S'y ajoute la première
 * diffusion des animes qui en sont tirés — la date qu'un lecteur guette le
 * plus. Une date sans jour ne se place pas sur une semaine : elle est tue
 * plutôt que posée au 1er du mois.
 *
 * Les chapitres, eux, viennent de MangaDex (`mangadex.ts`) : `chapterEvents`
 * les pose à côté.
 *
 * Pur et testé : la fenêtre décide seulement où poser ce qui sort d'ici.
 */

import type { ChapterLang, ChapterRelease } from './mangadex'
import type { MangaEntry } from './types'

/** Une date d'AniList : l'année seule, le mois, ou le jour. */
export interface FuzzyDate {
  year: number | null
  month: number | null
  day: number | null
}

/** Ce que le calendrier a besoin de savoir d'un manga suivi. */
export interface MangaDates {
  id: number
  start: FuzzyDate | null
  end: FuzzyDate | null
  /** Les animes qui en sont tirés, avec leur première diffusion. */
  adaptations: {
    id: number
    title: string
    cover: string
    color: string | null
    start: FuzzyDate | null
  }[]
}

export type MangaEvent =
  | { kind: 'start' | 'end'; mangaId: number; day: string }
  | {
      kind: 'adaptation'
      mangaId: number
      day: string
      anime: { id: number; title: string; cover: string; color: string | null }
    }
  | {
      /** Des chapitres devenus lisibles ce jour-là, d'après MangaDex. */
      kind: 'chapters'
      mangaId: number
      day: string
      /** Le plus petit et le plus grand numéro du jour : égaux pour un seul chapitre. */
      from: number
      to: number
      langs: ChapterLang[]
    }

/** `2026-10-04`, ou `null` si le jour manque. */
export function dayOf(date: FuzzyDate | null): string | null {
  if (!date?.year || !date.month || !date.day) return null
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

/** Le même format pour un jour local : c'est lui que la grille compare. */
export function dayOfTime(ts: number): string {
  const d = new Date(ts)
  return dayOf({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() })!
}

/**
 * Les dates à poser, pour les mangas qu'on suit.
 *
 * Un manga abandonné ne se montre plus : on ne voulait plus de l'histoire.
 * Une adaptation qu'on suit déjà n'a pas sa carte — ses épisodes sont dans la
 * grille, le premier compris.
 */
export function mangaEvents(dates: MangaDates[], entries: MangaEntry[], ownAnime: Set<number>): MangaEvent[] {
  const followed = new Set(entries.filter((e) => e.status !== 'dropped').map((e) => e.mangaId))
  const out: MangaEvent[] = []
  const shown = new Set<number>()
  for (const m of dates) {
    if (!followed.has(m.id)) continue
    const start = dayOf(m.start)
    if (start) out.push({ kind: 'start', mangaId: m.id, day: start })
    const end = dayOf(m.end)
    if (end && end !== start) out.push({ kind: 'end', mangaId: m.id, day: end })
    for (const a of m.adaptations) {
      const day = dayOf(a.start)
      // Deux mangas suivis d'une même franchise peuvent citer le même anime.
      if (!day || ownAnime.has(a.id) || shown.has(a.id)) continue
      shown.add(a.id)
      out.push({
        kind: 'adaptation',
        mangaId: m.id,
        day,
        anime: { id: a.id, title: a.title, cover: a.cover, color: a.color }
      })
    }
  }
  return out
}

/**
 * Les chapitres parus, un jour par carte.
 *
 * Une série qui sort trois chapitres d'un coup fait une carte « Ch. 12 – 14 »,
 * pas trois : la colonne du jour resterait sinon illisible. Les langues sont
 * celles de tout le lot.
 */
export function chapterEvents(releases: Record<number, ChapterRelease[]>, entries: MangaEntry[]): MangaEvent[] {
  const out: MangaEvent[] = []
  for (const entry of entries) {
    if (entry.status === 'dropped') continue
    const byDay = new Map<string, ChapterRelease[]>()
    for (const r of releases[entry.mangaId] ?? []) {
      const day = dayOfTime(r.at)
      byDay.set(day, [...(byDay.get(day) ?? []), r])
    }
    for (const [day, list] of byDay) {
      const numbers = list.map((r) => r.chapter)
      const langs = new Set(list.flatMap((r) => r.langs))
      out.push({
        kind: 'chapters',
        mangaId: entry.mangaId,
        day,
        from: Math.min(...numbers),
        to: Math.max(...numbers),
        langs: (['fr', 'en'] as ChapterLang[]).filter((l) => langs.has(l))
      })
    }
  }
  return out
}
