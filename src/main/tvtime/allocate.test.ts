import { describe, expect, it } from 'vitest'
import { allocate, statusFor, type Slot } from './allocate'

/** `n` timestamps one day apart, so ordering is observable. */
const days = (n: number, from = 1_700_000_000_000): number[] =>
  Array.from({ length: n }, (_, i) => from + i * 86_400_000)

const slot = (animeId: number, cap: number | null, minutes?: number): Slot => ({
  animeId,
  cap,
  minutes
})

/** Episode numbers received by each anime, in placement order. */
const byAnime = (placements: { animeId: number; episode: number }[]): Record<number, number[]> => {
  const out: Record<number, number[]> = {}
  for (const p of placements) (out[p.animeId] ??= []).push(p.episode)
  return out
}

describe('cas simple', () => {
  it('places one season into one entry', () => {
    const { placements, leftover } = allocate([days(12)], [slot(1, 12)])
    expect(leftover).toBe(0)
    expect(placements).toHaveLength(12)
    expect(placements[0]).toMatchObject({ animeId: 1, episode: 1 })
    expect(placements[11]).toMatchObject({ animeId: 1, episode: 12 })
  })

  it('numbers episodes from 1 inside each entry, not across the chain', () => {
    // The whole point: AniList restarts numbering at every cour.
    const { placements } = allocate([days(24)], [slot(1, 12), slot(2, 12)])
    expect(byAnime(placements)).toEqual({
      1: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      2: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    })
  })

  it('does nothing with no watched episodes', () => {
    const result = allocate([], [slot(1, 12)])
    expect(result.placements).toEqual([])
    expect(result.leftover).toBe(0)
    expect(result.slots[0].used).toBe(0)
  })

  it('ignores an empty season', () => {
    const { placements } = allocate([[], days(3)], [slot(1, 12)])
    expect(placements).toHaveLength(3)
  })
})

describe('débordement', () => {
  it('spills a long TVDB season across two AniList cours', () => {
    // Dr. STONE: a 22-episode TVDB season is two 11-episode AniList entries.
    const { placements, leftover } = allocate([days(22)], [slot(1, 11), slot(2, 11)])
    expect(leftover).toBe(0)
    expect(byAnime(placements)[1]).toHaveLength(11)
    expect(byAnime(placements)[2]).toHaveLength(11)
  })

  it('keeps chronological order across the spill', () => {
    const ats = days(4)
    const { placements } = allocate([ats], [slot(1, 2), slot(2, 2)])
    expect(placements.map((p) => p.at)).toEqual(ats)
  })

  it('reports episodes the chain cannot hold', () => {
    const { placements, leftover } = allocate([days(30)], [slot(1, 12)])
    expect(placements).toHaveLength(12)
    expect(leftover).toBe(18)
  })

  it('never fills an earlier slot with a later season', () => {
    // Slot 1 keeps a free episode, but season 2 must not go backwards into it.
    const { placements } = allocate([days(11), days(12, 2_000_000_000_000)], [slot(1, 12), slot(2, 12)])
    expect(byAnime(placements)[1]).toHaveLength(11)
    expect(byAnime(placements)[2]).toHaveLength(12)
  })
})

describe('appariement exact du nombre d’épisodes', () => {
  it('prefers an untouched slot whose count matches the season', () => {
    // Season 2 has 13 episodes; without the exact-count rule it would land in
    // the 12-slot and shift everything after it by one.
    const { placements, leftover } = allocate([days(12), days(13)], [slot(1, 12), slot(2, 13)])
    expect(leftover).toBe(0)
    expect(byAnime(placements)[2]).toHaveLength(13)
  })

  it('does not steal a slot that already received episodes', () => {
    // Season 1 is short and leaves slot 1 half empty. Season 2 matches slot 1's
    // capacity exactly, but slot 1 is already used — so it must go to slot 2
    // rather than overwrite what is there.
    const { placements } = allocate([days(5), days(12)], [slot(1, 12), slot(2, 12)])
    expect(byAnime(placements)[1]).toEqual([1, 2, 3, 4, 5])
    expect(byAnime(placements)[2]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })
})

describe('capacité inconnue', () => {
  it('absorbs everything when AniList has no episode count', () => {
    const { placements, leftover } = allocate([days(40)], [slot(1, null)])
    expect(placements).toHaveLength(40)
    expect(leftover).toBe(0)
  })

  it('treats a zero episode count as unknown rather than as a full slot', () => {
    const { placements, leftover } = allocate([days(3)], [slot(1, 0)])
    expect(placements).toHaveLength(3)
    expect(leftover).toBe(0)
  })
})

describe('durée et horodatage', () => {
  it('uses the entry runtime', () => {
    const { placements } = allocate([days(2)], [slot(1, 2, 47)])
    expect(placements.every((p) => p.minutes === 47)).toBe(true)
  })

  it('falls back to 24 minutes when the runtime is missing', () => {
    const { placements } = allocate([days(1)], [{ animeId: 1, cap: 1 }])
    expect(placements[0].minutes).toBe(24)
  })

  it('records the first and last watch of each slot', () => {
    const ats = days(4)
    const { slots } = allocate([ats], [slot(1, 2), slot(2, 2)])
    expect(slots[0]).toMatchObject({ firstAt: ats[0], lastAt: ats[1] })
    expect(slots[1]).toMatchObject({ firstAt: ats[2], lastAt: ats[3] })
  })

  it('survives identical timestamps', () => {
    // Ticking a whole season at once stamps every episode with the same instant.
    const { slots, placements } = allocate([[500, 500, 500]], [slot(1, 3)])
    expect(placements).toHaveLength(3)
    expect(slots[0]).toMatchObject({ firstAt: 500, lastAt: 500 })
  })

  it('leaves an untouched slot without dates', () => {
    const { slots } = allocate([days(2)], [slot(1, 2), slot(2, 12)])
    expect(slots[1]).toMatchObject({ used: 0, firstAt: null, lastAt: null })
  })
})

describe('statusFor', () => {
  it('calls an untouched entry planned', () => {
    expect(statusFor({ animeId: 1, cap: 12, used: 0, firstAt: null, lastAt: null })).toBe('planned')
  })

  it('calls a full entry completed', () => {
    expect(statusFor({ animeId: 1, cap: 12, used: 12, firstAt: 1, lastAt: 2 })).toBe('completed')
  })

  it('calls a partial entry watching', () => {
    expect(statusFor({ animeId: 1, cap: 12, used: 5, firstAt: 1, lastAt: 2 })).toBe('watching')
  })

  it('never completes an entry whose length is unknown', () => {
    // An airing show has no episode count; calling it finished would be a lie.
    expect(statusFor({ animeId: 1, cap: null, used: 40, firstAt: 1, lastAt: 2 })).toBe('watching')
  })
})
