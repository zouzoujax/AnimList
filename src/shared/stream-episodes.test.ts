import { describe, expect, it } from 'vitest'
import { labelNumber, matchStreamEpisodes, normalizeStreamUrl, stripLabel } from './stream-episodes'

const ep = (
  title: string | null,
  url = 'http://www.crunchyroll.com/watch/X/y'
): {
  title: string | null
  thumbnail: string | null
  url: string | null
} => ({ title, thumbnail: null, url })

describe('labelNumber', () => {
  it('reads the number Crunchyroll writes in front', () => {
    expect(labelNumber('Episode 130 - Scent of Danger!')).toBe(130)
    expect(labelNumber('Épisode 3 : Le départ')).toBe(3)
    expect(labelNumber('E12')).toBe(12)
    expect(labelNumber('Ep. 7')).toBe(7)
  })

  it('reads nothing from a title that has no number in front', () => {
    expect(labelNumber('Cruelty')).toBeNull()
    expect(labelNumber('OVA - Les origines')).toBeNull()
    expect(labelNumber(null)).toBeNull()
  })
})

describe('stripLabel', () => {
  it('drops the prefix the grid already shows', () => {
    expect(stripLabel('Episode 1 - Cruelty')).toBe('Cruelty')
    expect(stripLabel('Épisode 3 : Le départ')).toBe('Le départ')
  })

  it('leaves a title that carries no prefix', () => {
    expect(stripLabel('Cruelty')).toBe('Cruelty')
  })

  it('returns nothing rather than an empty string', () => {
    expect(stripLabel('Episode 12')).toBeNull()
  })
})

describe('normalizeStreamUrl', () => {
  it('upgrades the legacy links AniList still serves', () => {
    expect(normalizeStreamUrl('http://www.crunchyroll.com/watch/G9D/cruelty')).toBe(
      'https://www.crunchyroll.com/fr/watch/G9D/cruelty'
    )
  })

  it('leaves a link that already names its locale', () => {
    const url = 'https://www.crunchyroll.com/fr/watch/G9D/cruelty'
    expect(normalizeStreamUrl(url)).toBe(url)
  })

  it('passes other platforms through untouched apart from the scheme', () => {
    expect(normalizeStreamUrl('http://example.dev/x')).toBe('https://example.dev/x')
    expect(normalizeStreamUrl(null)).toBeNull()
  })
})

describe('matchStreamEpisodes', () => {
  // Le défaut d'origine : One Piece arrive en décroissant et ne couvre qu'une
  // partie de la série. Apparier par position donnait à l'épisode 1 le lien du
  // 130.
  it('matches by the number in the label, not by position', () => {
    const listed = [ep('Episode 130 - C'), ep('Episode 129 - B'), ep('Episode 128 - A')]
    const out = matchStreamEpisodes(listed, 130)
    expect(out[0]).toEqual({ number: 1, title: null, thumbnail: null, url: null })
    expect(out[129].title).toBe('C')
    expect(out[128].title).toBe('B')
  })

  it('leaves unlisted episodes empty rather than borrowing a neighbour', () => {
    const out = matchStreamEpisodes([ep('Episode 2 - B')], 3)
    expect(out.map((e) => e.title)).toEqual([null, 'B', null])
  })

  it('keeps the first of two entries claiming the same episode', () => {
    const listed = [ep('Episode 1 - Original'), ep('Episode 1 - Reprise')]
    expect(matchStreamEpisodes(listed, 1)[0].title).toBe('Original')
  })

  it('falls back to position only when no label is numbered and the count matches', () => {
    const listed = [ep('Cruelty'), ep('Trainer Sakonji Urokodaki')]
    expect(matchStreamEpisodes(listed, 2).map((e) => e.title)).toEqual(['Cruelty', 'Trainer Sakonji Urokodaki'])
  })

  it('refuses that fallback when the count does not match', () => {
    const listed = [ep('Cruelty'), ep('Trainer Sakonji Urokodaki')]
    expect(matchStreamEpisodes(listed, 3).map((e) => e.title)).toEqual([null, null, null])
  })

  it('normalises the links it attaches', () => {
    const out = matchStreamEpisodes([ep('Episode 1 - A', 'http://www.crunchyroll.com/watch/G9D/a')], 1)
    expect(out[0].url).toBe('https://www.crunchyroll.com/fr/watch/G9D/a')
  })

  it('produces one row per episode even with nothing listed', () => {
    expect(matchStreamEpisodes([], 3)).toHaveLength(3)
  })
})
