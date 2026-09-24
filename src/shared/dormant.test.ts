import { describe, expect, it } from 'vitest'
import { DORMANT_DAYS, dormantSeries, dormantVerdict, sleepLabel, type PausedRow } from './dormant'

const DAY = 86_400_000
const now = Date.UTC(2026, 8, 24)
const ilYA = (days: number): number => now - days * DAY

const row = (over: Partial<PausedRow> = {}): PausedRow => ({
  animeId: 1,
  lastAt: ilYA(200),
  seen: 12,
  aired: 24,
  ...over
})

describe('dormantSeries', () => {
  it('laisse tranquille une pause récente', () => {
    expect(dormantSeries([row({ lastAt: ilYA(DORMANT_DAYS - 1) })], now)).toEqual([])
  })

  it('retient une pause assez vieille', () => {
    const [found] = dormantSeries([row({ lastAt: ilYA(DORMANT_DAYS) })], now)
    expect(found.days).toBe(DORMANT_DAYS)
    expect(found.remaining).toBe(12)
  })

  it('met la plus enfouie en tête', () => {
    const found = dormantSeries(
      [
        row({ animeId: 1, lastAt: ilYA(90) }),
        row({ animeId: 2, lastAt: ilYA(600) }),
        row({ animeId: 3, lastAt: ilYA(200) })
      ],
      now
    )
    expect(found.map((s) => s.animeId)).toEqual([2, 3, 1])
  })

  it('ne compte jamais un reste négatif', () => {
    // Un rattrapage marqué au-delà de ce que la fiche annonce comme diffusé.
    expect(dormantSeries([row({ seen: 30, aired: 24 })], now)[0].remaining).toBe(0)
  })

  it('avoue ne pas savoir quand la fiche se tait', () => {
    expect(dormantSeries([row({ aired: null })], now)[0].remaining).toBeNull()
  })
})

describe('sleepLabel', () => {
  it('parle en semaines, en mois, puis en années', () => {
    expect(sleepLabel(7)).toBe('une semaine')
    expect(sleepLabel(21)).toBe('3 semaines')
    expect(sleepLabel(35)).toBe('un mois')
    expect(sleepLabel(213)).toBe('7 mois')
    expect(sleepLabel(400)).toBe('un an')
    expect(sleepLabel(900)).toBe('2 ans')
  })
})

describe('dormantVerdict', () => {
  it('propose de finir quand il ne reste rien', () => {
    expect(dormantVerdict(dormantSeries([row({ seen: 24, aired: 24 })], now)[0])).toBe('finish')
  })

  it('propose de reprendre quand il reste des épisodes', () => {
    expect(dormantVerdict(dormantSeries([row()], now)[0])).toBe('resume')
  })

  it('propose de reprendre quand on ne sait pas', () => {
    expect(dormantVerdict(dormantSeries([row({ aired: null })], now)[0])).toBe('resume')
  })
})
