import { describe, expect, it } from 'vitest'
import { MAX_UNDONE, MAX_UNDONE_AGE_DAYS, pruneUndone, undoneKey, type Undone } from './undone'
import type { WatchEvent } from './types'

const DAY = 86_400_000
const now = Date.UTC(2026, 8, 6)

const ev = (episode: number, at = now - 30 * DAY): WatchEvent => ({ animeId: 1, episode, at, minutes: 23 })
const undone = (episode: number, undoneAt: number): Undone => ({ event: ev(episode), undoneAt })

describe('undoneKey', () => {
  it('sépare les passes', () => {
    expect(undoneKey(1, 3, 0)).toBe('1:3:0')
    expect(undoneKey(1, 3, 1)).toBe('1:3:1')
    expect(undoneKey(1, 3, 0)).not.toBe(undoneKey(1, 3, 1))
  })
})

describe('pruneUndone', () => {
  it('garde ce qui vient d’être décoché', () => {
    const memo = { a: undone(1, now - DAY), b: undone(2, now) }
    expect(Object.keys(pruneUndone(memo, now)).sort()).toEqual(['a', 'b'])
  })

  // Un an après, le recocher est un nouveau visionnage, pas une correction.
  it('oublie les décochages trop vieux', () => {
    const old = now - (MAX_UNDONE_AGE_DAYS + 1) * DAY
    const memo = { vieux: undone(1, old), frais: undone(2, now) }
    expect(Object.keys(pruneUndone(memo, now))).toEqual(['frais'])
  })

  it('borne le nombre, les plus récents gagnent', () => {
    const memo: Record<string, Undone> = {}
    for (let i = 0; i < MAX_UNDONE + 20; i += 1) memo[`k${i}`] = undone(i, now - i * 1000)
    const kept = pruneUndone(memo, now)
    expect(Object.keys(kept)).toHaveLength(MAX_UNDONE)
    expect(kept.k0).toBeDefined()
    expect(kept[`k${MAX_UNDONE + 19}`]).toBeUndefined()
  })

  // Le fichier peut venir d’une version qui ne connaissait pas ce champ, ou d’une main.
  it('jette les entrées sans ligne ni date', () => {
    const memo = {
      bon: undone(1, now),
      vide: { undoneAt: now } as unknown as Undone,
      sansDate: { event: ev(2) } as unknown as Undone
    }
    expect(Object.keys(pruneUndone(memo, now))).toEqual(['bon'])
  })

  it('ne modifie pas la table reçue', () => {
    const memo = { a: undone(1, now - (MAX_UNDONE_AGE_DAYS + 1) * DAY) }
    pruneUndone(memo, now)
    expect(Object.keys(memo)).toEqual(['a'])
  })
})
