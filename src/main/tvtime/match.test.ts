import { describe, expect, it } from 'vitest'
import {
  bestMatch,
  MATCH_CONFIDENT,
  MATCH_FLOOR,
  normalizeTitle,
  scoreCandidate,
  searchQueries,
  type Candidate
} from './match'

const tv = (titles: (string | null)[], over: Partial<Candidate> = {}): Candidate => ({
  titles,
  format: 'TV',
  ...over
})

describe('normalizeTitle', () => {
  it('makes both romanisations of a long vowel equal', () => {
    // The whole reason this exists: AniList and TheTVDB disagree here.
    expect(normalizeTitle('Naruto Shippūden')).toBe(normalizeTitle('Naruto Shippuuden'))
    expect(normalizeTitle('Ōkami')).toBe(normalizeTitle('Ookami'))
  })

  it('folds punctuation and case into single spaces', () => {
    expect(normalizeTitle('Re:ZERO -Starting Life-')).toBe('re zero starting life')
  })

  it('survives null and empty input', () => {
    expect(normalizeTitle(null)).toBe('')
    expect(normalizeTitle('')).toBe('')
    expect(normalizeTitle('!!!')).toBe('')
  })

  it('keeps digits, which distinguish sequels', () => {
    expect(normalizeTitle('86 Eighty-Six')).toBe('86 eighty six')
  })

  it('does not collapse a Roman numeral into its own first season', () => {
    // The vowel squeeze turns "II" into "I" unless numerals are exempt, and a
    // sequel then scores a perfect match against season 1 — the episodes of a
    // whole library end up in the wrong entries.
    expect(normalizeTitle('Mushoku Tensei II')).not.toBe(normalizeTitle('Mushoku Tensei I'))
    expect(normalizeTitle('Overlord III')).not.toBe(normalizeTitle('Overlord II'))
  })

  it('still collapses a long vowel inside a word', () => {
    expect(normalizeTitle('Oniisan')).toBe(normalizeTitle('Onīsan'))
  })
})

describe('scoreCandidate', () => {
  it('gives an exact title the top score', () => {
    expect(scoreCandidate('Bleach', tv(['Bleach']))).toBeGreaterThanOrEqual(100)
  })

  it('matches across romanisations', () => {
    const score = scoreCandidate('Naruto Shippuuden', tv(['Naruto Shippūden']))
    expect(score).toBeGreaterThanOrEqual(MATCH_CONFIDENT)
  })

  it('scores a prefix above a mere substring', () => {
    const prefix = scoreCandidate('Vinland Saga', tv(['Vinland Saga Season 2']))
    const inside = scoreCandidate('Saga', tv(['The Vinland Saga Story']))
    expect(prefix).toBeGreaterThan(inside)
  })

  it('finds the best of several titles', () => {
    // The english title is the one that matches; romaji must not drag it down.
    const score = scoreCandidate('Demon Slayer', tv(['Kimetsu no Yaiba', 'Demon Slayer']))
    expect(score).toBeGreaterThanOrEqual(100)
  })

  it('reads synonyms too', () => {
    const score = scoreCandidate('AoT', tv(['Shingeki no Kyojin', null, 'AoT']))
    expect(score).toBeGreaterThanOrEqual(100)
  })

  it('penalises a film carrying the series name', () => {
    const series = scoreCandidate('Jujutsu Kaisen', tv(['Jujutsu Kaisen']))
    const movie = scoreCandidate('Jujutsu Kaisen', tv(['Jujutsu Kaisen'], { format: 'MOVIE' }))
    expect(movie).toBeLessThan(series)
    expect(movie).toBeLessThan(MATCH_CONFIDENT)
  })

  it('penalises a single-episode result', () => {
    const full = scoreCandidate('Chainsaw Man', tv(['Chainsaw Man'], { episodes: 12 }))
    const ova = scoreCandidate('Chainsaw Man', tv(['Chainsaw Man'], { episodes: 1 }))
    expect(ova).toBeLessThan(full)
  })

  it('rewards a broadcast format over an unknown one', () => {
    const known = scoreCandidate('Frieren', tv(['Frieren'], { format: 'ONA' }))
    const unknown = scoreCandidate('Frieren', tv(['Frieren'], { format: null }))
    expect(known).toBeGreaterThan(unknown)
  })

  it('rejects an unrelated show', () => {
    expect(scoreCandidate('Bleach', tv(['Pokemon']))).toBeLessThan(MATCH_FLOOR)
  })

  it('returns 0 for an empty needle', () => {
    expect(scoreCandidate('', tv(['Bleach']))).toBe(0)
  })

  it('ignores empty candidate titles', () => {
    expect(scoreCandidate('Bleach', tv([null, '', 'Bleach']))).toBeGreaterThanOrEqual(100)
  })
})

describe('searchQueries', () => {
  it('always tries the untouched name first', () => {
    expect(searchQueries('Bleach')[0]).toBe('Bleach')
  })

  it('adds an ASCII fallback for macrons', () => {
    // AniList's search never reaches "Shippuuden" from "Shippūden".
    expect(searchQueries('Naruto Shippūden')).toContain('Naruto Shippuden')
  })

  it('drops the subtitle after a colon or a dash', () => {
    expect(searchQueries('Re:ZERO — Starting Life in Another World')).toContain('Re')
  })

  it('drops honorifics', () => {
    expect(searchQueries('Kaguya-sama')).toContain('Kaguya')
  })

  it('never repeats a query', () => {
    const queries = searchQueries('Bleach')
    expect(new Set(queries).size).toBe(queries.length)
  })

  it('produces only the name when nothing can be simplified', () => {
    expect(searchQueries('Bleach')).toEqual(['Bleach'])
  })

  it('never yields an empty query', () => {
    expect(searchQueries(':::').every((q) => q.length > 0)).toBe(true)
  })
})

describe('bestMatch', () => {
  it('picks the highest scorer', () => {
    const result = bestMatch('Vinland Saga', [tv(['Berserk']), tv(['Vinland Saga']), tv(['Vinland Saga Season 2'])])
    expect(result?.candidate.titles[0]).toBe('Vinland Saga')
  })

  it('returns null when nothing clears the floor', () => {
    expect(bestMatch('Bleach', [tv(['Pokemon']), tv(['Digimon'])])).toBeNull()
  })

  it('returns null on an empty candidate list', () => {
    expect(bestMatch('Bleach', [])).toBeNull()
  })

  it('prefers the series over its film', () => {
    const result = bestMatch('Jujutsu Kaisen', [
      tv(['Jujutsu Kaisen 0'], { format: 'MOVIE', episodes: 1 }),
      tv(['Jujutsu Kaisen'], { episodes: 24 })
    ])
    expect(result?.candidate.episodes).toBe(24)
  })
})
