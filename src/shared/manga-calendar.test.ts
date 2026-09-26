import { describe, expect, it } from 'vitest'
import { chapterEvents, dayOf, dayOfTime, mangaEvents, type MangaDates } from './manga-calendar'
import type { LibraryStatus, MangaEntry } from './types'

const entry = (mangaId: number, status: LibraryStatus = 'watching'): MangaEntry => ({ mangaId, status }) as MangaEntry
const date = (year: number, month: number | null, day: number | null) => ({ year, month, day })
const anime = (id: number, start = date(2026, 10, 4)) => ({
  id,
  title: `Anime ${id}`,
  cover: `c${id}.jpg`,
  color: null,
  start
})
const manga = (id: number, over: Partial<MangaDates> = {}): MangaDates => ({
  id,
  start: date(2020, 3, 9),
  end: null,
  adaptations: [],
  ...over
})

describe('dayOf', () => {
  it('écrit un jour complet, et tait une date sans jour', () => {
    expect(dayOf(date(2026, 1, 5))).toBe('2026-01-05')
    expect(dayOf(date(2026, 1, null))).toBeNull()
    expect(dayOf(null)).toBeNull()
  })

  it('lit un instant au jour local', () => {
    expect(dayOfTime(new Date(2026, 8, 26, 23, 30).getTime())).toBe('2026-09-26')
  })
})

describe('mangaEvents', () => {
  it('pose le début, la fin et la première diffusion d’une adaptation', () => {
    const events = mangaEvents([manga(1, { end: date(2025, 6, 1), adaptations: [anime(9)] })], [entry(1)], new Set())
    expect(events.map((e) => [e.kind, e.day])).toEqual([
      ['start', '2020-03-09'],
      ['end', '2025-06-01'],
      ['adaptation', '2026-10-04']
    ])
  })

  it('ne montre ni un manga abandonné ni un manga qu’on ne suit pas', () => {
    expect(mangaEvents([manga(1), manga(2)], [entry(1, 'dropped')], new Set())).toEqual([])
  })

  it('laisse aux épisodes une adaptation déjà suivie, et ne double pas un anime partagé', () => {
    const events = mangaEvents(
      [manga(1, { adaptations: [anime(9), anime(10)] }), manga(2, { adaptations: [anime(10)] })],
      [entry(1), entry(2)],
      new Set([9])
    )
    expect(events.filter((e) => e.kind === 'adaptation').map((e) => e.kind === 'adaptation' && e.anime.id)).toEqual([
      10
    ])
  })

  it('tait les dates sans jour', () => {
    const events = mangaEvents(
      [manga(1, { start: date(2027, null, null), adaptations: [anime(9, date(2027, 4, null))] })],
      [entry(1)],
      new Set()
    )
    expect(events).toEqual([])
  })
})

describe('chapterEvents', () => {
  const at = (day: number, hour = 12): number => new Date(2026, 8, day, hour).getTime()

  it('réunit les chapitres d’un même jour, et garde les langues du lot', () => {
    const events = chapterEvents(
      {
        1: [
          { chapter: 14, at: at(20, 18), langs: ['en'] },
          { chapter: 13, at: at(20, 9), langs: ['fr', 'en'] },
          { chapter: 12, at: at(13), langs: ['en'] }
        ]
      },
      [entry(1)]
    )
    expect(events).toEqual([
      { kind: 'chapters', mangaId: 1, day: '2026-09-20', from: 13, to: 14, langs: ['fr', 'en'] },
      { kind: 'chapters', mangaId: 1, day: '2026-09-13', from: 12, to: 12, langs: ['en'] }
    ])
  })

  it('ne montre pas les chapitres d’un manga abandonné', () => {
    expect(chapterEvents({ 1: [{ chapter: 3, at: at(1), langs: ['fr'] }] }, [entry(1, 'dropped')])).toEqual([])
  })
})
