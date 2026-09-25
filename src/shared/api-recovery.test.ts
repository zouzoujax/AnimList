import { describe, expect, it } from 'vitest'
import {
  ageLabel,
  nextProbeDelay,
  oldestShown,
  PROBE_MAX_MS,
  PROBE_MIN_MS,
  REPLAY_MAX,
  ReplayBook
} from './api-recovery'

describe('nextProbeDelay', () => {
  it('commence au plancher', () => {
    expect(nextProbeDelay(0)).toBe(PROBE_MIN_MS)
    expect(nextProbeDelay(Number.NaN)).toBe(PROBE_MIN_MS)
  })

  it('double à chaque échec, sans dépasser le plafond', () => {
    expect(nextProbeDelay(PROBE_MIN_MS)).toBe(PROBE_MIN_MS * 2)
    let d = PROBE_MIN_MS
    for (let i = 0; i < 20; i += 1) d = nextProbeDelay(d)
    expect(d).toBe(PROBE_MAX_MS)
  })
})

describe('ReplayBook', () => {
  it('ne note une clé qu’une fois, et la remonte quand elle revient', () => {
    const book = new ReplayBook<number>()
    book.note('a', 1)
    book.note('b', 2)
    book.note('a', 3)
    expect(book.drain()).toEqual([
      ['b', 2],
      ['a', 3]
    ])
    expect(book.size).toBe(0)
  })

  it('oublie la plus ancienne au-delà de sa capacité', () => {
    const book = new ReplayBook<number>(2)
    book.note('a', 1)
    book.note('b', 2)
    book.note('c', 3)
    expect(book.drain().map(([k]) => k)).toEqual(['b', 'c'])
  })

  it('laisse tomber ce qui a fini par passer', () => {
    const book = new ReplayBook<number>()
    book.note('a', 1)
    book.settle('a')
    expect(book.size).toBe(0)
  })

  it('a une capacité par défaut raisonnable pour trente requêtes par minute', () => {
    expect(REPLAY_MAX).toBeLessThanOrEqual(60)
  })
})

describe('oldestShown', () => {
  it('garde la plus ancienne', () => {
    expect(oldestShown(undefined, 50)).toBe(50)
    expect(oldestShown(30, 50)).toBe(30)
    expect(oldestShown(80, 50)).toBe(50)
  })
})

describe('ageLabel', () => {
  const now = 1_000_000_000_000
  it('parle comme on parle', () => {
    expect(ageLabel(now - 30_000, now)).toBe('à l’instant')
    expect(ageLabel(now - 12 * 60_000, now)).toBe('il y a 12 min')
    expect(ageLabel(now - 3 * 3600_000, now)).toBe('il y a 3 h')
    expect(ageLabel(now - 50 * 3600_000, now)).toBe('il y a 2 j')
  })
})
