import { describe, expect, it } from 'vitest'
import { applyBudget, type Aged } from './cache-budget'

const NOW = 1_800_000_000_000
const HOUR = 3_600_000

const base = { now: NOW, maxBytes: 1_000_000, staleFactor: 30, defaultTtl: HOUR, minKeepMs: 0 }

/** Un contenu dont on choisit le poids, pour éprouver le budget en octets. */
const row = (key: string, ageHours: number, ttl?: number, pad = 10): [string, Aged & { data: string }] => [
  key,
  { at: NOW - ageHours * HOUR, ttl, data: 'x'.repeat(pad) }
]

describe('applyBudget', () => {
  it('keeps a stale entry: it is still a fallback when the network is down', () => {
    const { kept, droppedExpired } = applyBudget([row('a', 5, HOUR)], base)
    expect(kept).toHaveLength(1)
    expect(droppedExpired).toBe(0)
  })

  it('drops what is far past its own freshness', () => {
    // 40 h pour une fraîcheur d'une heure : bien au-delà du facteur 30.
    const { kept, droppedExpired } = applyBudget([row('a', 40, HOUR)], base)
    expect(kept).toHaveLength(0)
    expect(droppedExpired).toBe(1)
  })

  it('measures each entry against its own freshness, not a shared one', () => {
    const rows = [row('court', 40, HOUR), row('long', 40, 24 * HOUR)]
    const { kept } = applyBudget(rows, base)
    expect(kept.map(([k]) => k)).toEqual(['long'])
  })

  it('falls back to a default freshness for entries written before it was stored', () => {
    const { kept } = applyBudget([row('vieux', 40, undefined)], base)
    expect(kept).toHaveLength(0)
  })

  it('spends the budget on the newest entries', () => {
    const rows = [row('vieux', 3, HOUR, 400), row('recent', 1, HOUR, 400)]
    const { kept, droppedForSize } = applyBudget(rows, { ...base, maxBytes: 460 })
    expect(kept.map(([k]) => k)).toEqual(['recent'])
    expect(droppedForSize).toBe(1)
  })

  // Le défaut d'origine : un plafond qui compte les entrées laisse deux lignes
  // énormes peser plus que six cents petites.
  it('weighs entries instead of counting them', () => {
    const rows = [row('enorme', 1, HOUR, 5000), row('a', 2, HOUR, 10), row('b', 3, HOUR, 10)]
    const { kept, bytes } = applyBudget(rows, { ...base, maxBytes: 2000 })
    expect(kept.map(([k]) => k)).toEqual(['enorme'])
    expect(bytes).toBeGreaterThan(2000)
  })

  it('never empties the cache entirely, even under an impossible budget', () => {
    const { kept } = applyBudget([row('seul', 1, HOUR, 5000)], { ...base, maxBytes: 1 })
    expect(kept).toHaveLength(1)
  })

  // Sans plancher, une recherche fraîche dix minutes disparaît en cinq heures
  // et quelqu'un hors ligne se retrouve devant des écrans vides.
  it('never drops anything younger than the floor, however short its freshness', () => {
    const rows = [row('recherche', 20, 10 * 60_000)]
    expect(applyBudget(rows, base).kept).toHaveLength(0)
    expect(applyBudget(rows, { ...base, minKeepMs: 3 * 24 * HOUR }).kept).toHaveLength(1)
  })

  it('handles an empty cache', () => {
    expect(applyBudget([], base)).toEqual({ kept: [], droppedExpired: 0, droppedForSize: 0, bytes: 0 })
  })
})
