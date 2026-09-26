import { describe, expect, it } from 'vitest'
import { mangaNews, type Adaptation, type MangaNow } from './manga-watch'
import type { LibraryStatus, MangaEntry } from './types'

const entry = (mangaId: number, status: LibraryStatus, chapter = 0): MangaEntry =>
  ({ mangaId, status, chapter }) as MangaEntry
const anime = (id: number): Adaptation => ({ id, title: `Anime ${id}`, format: 'TV', status: 'NOT_YET_RELEASED' })
const now = (status: string, chapters: number | null, adaptations: Adaptation[] = []): MangaNow => ({
  status,
  chapters,
  adaptations
})

describe('mangaNews', () => {
  it('relève en silence un manga vu pour la première fois', () => {
    const { news, seen } = mangaNews(
      [entry(1, 'watching', 10)],
      {},
      new Map([[1, now('FINISHED', 100, [anime(9)])]]),
      new Set()
    )
    expect(news).toEqual([])
    expect(seen).toEqual({ 1: { finished: true, anime: [9] } })
  })

  it('annonce une fin de parution, avec ce qu’il reste à lire', () => {
    const { news, seen } = mangaNews(
      [entry(1, 'watching', 90)],
      { 1: { finished: false, anime: [] } },
      new Map([[1, now('FINISHED', 120)]]),
      new Set()
    )
    expect(news).toEqual([{ kind: 'finished', mangaId: 1, total: 120, left: 30 }])
    expect(seen[1].finished).toBe(true)
    // Le passage suivant ne la redit pas.
    expect(mangaNews([entry(1, 'watching', 90)], seen, new Map([[1, now('FINISHED', 120)]]), new Set()).news).toEqual(
      []
    )
  })

  it('tait la fin d’un manga lu ou abandonné', () => {
    const seen = { 1: { finished: false, anime: [] }, 2: { finished: false, anime: [] } }
    const found = new Map([
      [1, now('FINISHED', 50)],
      [2, now('FINISHED', 50)]
    ])
    expect(mangaNews([entry(1, 'completed', 50), entry(2, 'dropped', 3)], seen, found, new Set()).news).toEqual([])
  })

  it('annonce une adaptation nouvelle, sauf déjà suivie ou manga abandonné', () => {
    const seen = { 1: { finished: false, anime: [9] }, 2: { finished: false, anime: [] } }
    const found = new Map([
      [1, now('RELEASING', null, [anime(9), anime(10), anime(11)])],
      [2, now('RELEASING', null, [anime(12)])]
    ])
    const { news, seen: after } = mangaNews([entry(1, 'watching'), entry(2, 'dropped')], seen, found, new Set([11]))
    expect(news).toEqual([{ kind: 'adaptation', mangaId: 1, anime: anime(10) }])
    // Tout est relevé, même ce qui n'a pas été annoncé.
    expect(after[1].anime).toEqual([9, 10, 11])
    expect(after[2].anime).toEqual([12])
  })

  it('garde le relevé d’un manga absent de la réponse, oublie un manga retiré', () => {
    const seen = { 1: { finished: false, anime: [9] }, 3: { finished: true, anime: [] } }
    const { seen: after } = mangaNews([entry(1, 'watching')], seen, new Map(), new Set())
    expect(after).toEqual({ 1: { finished: false, anime: [9] } })
  })
})
