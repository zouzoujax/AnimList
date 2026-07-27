import { describe, expect, it } from 'vitest'
import {
  countdown,
  dayLabel,
  durationParts,
  minutesToHuman,
  monthBucket,
  premiereLabel,
  premiereOf,
  premiereSort,
  seasonLabel
} from './format'

describe('durationParts', () => {
  it('stays in minutes below an hour', () => {
    expect(durationParts(0)).toEqual([{ value: '0', unit: 'min' }])
    expect(durationParts(45)).toEqual([{ value: '45', unit: 'min' }])
  })

  it('splits hours and minutes below a day', () => {
    expect(durationParts(90)).toEqual([
      { value: '1', unit: 'h' },
      { value: '30', unit: 'min' }
    ])
  })

  it('pads the minute part so columns line up', () => {
    expect(durationParts(69)).toEqual([
      { value: '1', unit: 'h' },
      { value: '09', unit: 'min' }
    ])
  })

  // 43 j 22 h — the real total after the import, and the figure that exposed the
  // ambiguous abbreviated "j".
  it('spells the day unit out in full', () => {
    expect(durationParts(63_240)).toEqual([
      { value: '43', unit: 'jours' },
      { value: '22', unit: 'h' }
    ])
  })

  it('uses the singular for exactly one day', () => {
    expect(durationParts(24 * 60)).toEqual([
      { value: '1', unit: 'jour' },
      { value: '0', unit: 'h' }
    ])
  })

  it('never goes negative', () => {
    expect(durationParts(-10)).toEqual([{ value: '0', unit: 'min' }])
  })
})

describe('dayLabel', () => {
  it('handles zero, one and many', () => {
    expect(dayLabel(0)).toBe('0 jour')
    expect(dayLabel(1)).toBe('1 jour')
    expect(dayLabel(30)).toBe('30 jours')
  })
})

describe('minutesToHuman', () => {
  it('keeps the compact form for inline use', () => {
    expect(minutesToHuman(0)).toBe('0 min')
    expect(minutesToHuman(69)).toBe('1 h 09')
  })
})

describe('monthBucket', () => {
  it('sorts by year then month', () => {
    expect(monthBucket({ year: 2026, month: 10, day: 4 }).key).toBe(202610)
    expect(monthBucket({ year: 2026, month: 10, day: 4 }).key).toBeLessThan(
      monthBucket({ year: 2027, month: 1, day: 1 }).key
    )
  })

  it('capitalises the month label', () => {
    expect(monthBucket({ year: 2026, month: 10, day: null }).label).toBe('Octobre 2026')
  })

  // A known year with no month belongs at the end of that year, not lumped in
  // with the undated titles.
  it('groups a year-only date under that year', () => {
    const bucket = monthBucket({ year: 2027, month: null, day: null })
    expect(bucket.label).toBe('Courant 2027')
    expect(bucket.key).toBe(202799)
    expect(bucket.key).toBeGreaterThan(monthBucket({ year: 2027, month: 12, day: 1 }).key)
  })

  it('sends a missing date last', () => {
    expect(monthBucket(null).label).toBe('Date à confirmer')
    expect(monthBucket(undefined).key).toBe(Number.MAX_SAFE_INTEGER)
  })
})

describe('premiereSort', () => {
  it('orders within a month by day', () => {
    const early = premiereSort({ year: 2026, month: 8, day: 1 })
    const late = premiereSort({ year: 2026, month: 8, day: 28 })
    expect(early).toBeLessThan(late)
  })

  it('puts a day-less date at the end of its month', () => {
    expect(premiereSort({ year: 2026, month: 8, day: null })).toBeGreaterThan(
      premiereSort({ year: 2026, month: 8, day: 28 })
    )
  })

  it('sends an undated title last', () => {
    expect(premiereSort(null)).toBe(Number.MAX_SAFE_INTEGER)
  })
})

describe('premiereLabel', () => {
  it('degrades gracefully as precision drops', () => {
    expect(premiereLabel({ year: 2026, month: 8, day: 28 })).toContain('2026')
    expect(premiereLabel({ year: 2026, month: 8, day: null })).toBe('août 2026')
    expect(premiereLabel({ year: 2026, month: null, day: null })).toBe('2026')
    expect(premiereLabel(null)).toBe('Date à confirmer')
  })
})

describe('premiereOf', () => {
  const startDate = { year: 2026, month: 4, day: 8 }

  // A split cour resuming is still RELEASING and its startDate is months back,
  // so the schedule has to place it on the next episode's air date.
  it('uses the next airing date for a releasing show', () => {
    const airingAt = Math.floor(Date.UTC(2026, 7, 12, 12) / 1000)
    const premiere = premiereOf({ status: 'RELEASING', startDate, nextAiring: { episode: 12, airingAt } })
    expect(premiere).toEqual({ year: 2026, month: 8, day: 12 })
  })

  it('uses the start date for anything not currently airing', () => {
    expect(premiereOf({ status: 'NOT_YET_RELEASED', startDate, nextAiring: null })).toEqual(startDate)
    expect(premiereOf({ status: 'FINISHED', startDate, nextAiring: null })).toEqual(startDate)
  })

  it('falls back to the start date when a releasing show has no schedule', () => {
    expect(premiereOf({ status: 'RELEASING', startDate, nextAiring: null })).toEqual(startDate)
  })

  it('tolerates media cached before startDate existed', () => {
    expect(premiereOf({ status: 'FINISHED', startDate: undefined, nextAiring: null })).toBeNull()
  })
})

describe('countdown', () => {
  it('reports availability once the airing time has passed', () => {
    expect(countdown(Math.floor(Date.now() / 1000) - 60)).toBe('Disponible')
  })

  it('counts days ahead', () => {
    expect(countdown(Math.floor(Date.now() / 1000) + 3 * 86_400 + 3600)).toMatch(/^dans 3 j/)
  })
})

describe('seasonLabel', () => {
  it('translates the season name', () => {
    expect(seasonLabel('FALL', 2026)).toBe('Automne 2026')
    expect(seasonLabel(null, 2026)).toBe('2026')
    expect(seasonLabel(null, null)).toBe('—')
  })
})
