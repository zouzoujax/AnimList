import { describe, expect, it } from 'vitest'
import { latestChapter, pickSeries, releasesOf, unreadCount, type MdChapter } from './mangadex'

const row = (chapter: string | null, lang: string, at: string | null): MdChapter => ({
  attributes: { chapter, translatedLanguage: lang, readableAt: at }
})

describe('pickSeries', () => {
  it('prend la série qui porte le lien AniList, la plus suivie d’abord', () => {
    const results = [
      { id: 'autre', attributes: { links: { al: '1' } } },
      { id: 'vraie', attributes: { links: { al: '169355' } } },
      { id: 'couleur', attributes: { links: { al: '169355' } } }
    ]
    expect(pickSeries(results, 169355)).toBe('vraie')
  })

  it('ne se contente pas d’un titre qui ressemble', () => {
    expect(pickSeries([{ id: 'x', attributes: { links: null } }], 5)).toBeNull()
  })
})

describe('releasesOf', () => {
  it('réunit les langues d’un chapitre et garde sa première date', () => {
    const releases = releasesOf([
      row('131', 'fr', '2026-09-06T15:24:30Z'),
      row('131', 'en', '2026-09-06T15:23:58Z'),
      row('130', 'en', '2026-08-30T15:10:02Z')
    ])
    expect(releases).toEqual([
      { chapter: 131, at: Date.parse('2026-09-06T15:23:58Z'), langs: ['fr', 'en'] },
      { chapter: 130, at: Date.parse('2026-08-30T15:10:02Z'), langs: ['en'] }
    ])
  })

  it('écarte les chapitres sans numéro, sans date ou dans une autre langue', () => {
    const releases = releasesOf([
      row(null, 'en', '2026-09-01T00:00:00Z'),
      row('12', 'es', '2026-09-01T00:00:00Z'),
      row('12', 'en', null),
      row('11', 'en', '2026-09-01T00:00:00Z')
    ])
    expect(releases.map((r) => r.chapter)).toEqual([11])
  })
})

describe('unreadCount', () => {
  const releases = releasesOf([row('130.5', 'en', '2026-09-01T00:00:00Z'), row('128', 'fr', '2026-08-01T00:00:00Z')])

  it('compte depuis le dernier chapitre entier', () => {
    expect(latestChapter(releases)).toBe(130)
    expect(unreadCount(releases, 127)).toBe(3)
  })

  it('ne descend pas sous zéro, et ne compte rien sans chapitre connu', () => {
    expect(unreadCount(releases, 140)).toBe(0)
    expect(unreadCount([], 3)).toBe(0)
  })
})
