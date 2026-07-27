/**
 * Maps watched episodes from a TheTVDB-shaped series onto AniList entries.
 *
 * The two databases disagree about what "a season" is. TheTVDB models a long
 * anime as one series with numbered seasons; AniList splits the same show into
 * one entry per broadcast cour. Attack on Titan is 4 TVDB seasons and 6 AniList
 * entries; Dr. STONE's 22-episode third TVDB season is two 11-episode AniList
 * entries.
 *
 * So episodes cannot be matched by number. They are poured, in broadcast order,
 * into a chain of AniList entries, spilling into the next one whenever the
 * current fills up.
 *
 * This module is deliberately free of network and disk access: the chain has
 * already been resolved by the caller, and everything here is arithmetic.
 */

/** One AniList entry available to receive episodes. */
export interface Slot {
  animeId: number
  /** Episode count, or `null` when AniList does not know it yet (airing shows). */
  cap: number | null
  /** Runtime used for the watch-time statistics; falls back to 24 minutes. */
  minutes?: number | null
}

/** A watched episode, ready to be appended to the history. */
export interface Placement {
  animeId: number
  episode: number
  at: number
  minutes: number
}

/** What a slot ended up receiving. */
export interface SlotFill {
  animeId: number
  cap: number | null
  used: number
  /** Earliest and latest watch timestamps, for `startedAt` / `finishedAt`. */
  firstAt: number | null
  lastAt: number | null
}

export interface Allocation {
  placements: Placement[]
  slots: SlotFill[]
  /** Episodes the chain could not hold — the chain was too short. */
  leftover: number
}

const DEFAULT_MINUTES = 24

interface Bucket extends SlotFill {
  minutes: number
  /** `cap`, with the unknown case turned into "never full". */
  room: number
}

/**
 * Pours `seasons` into `slots`.
 *
 * `seasons` is one array of watch timestamps per TheTVDB season, already sorted
 * by season then episode number. Timestamps may repeat: ticking a whole season
 * at once in the source app stamps every episode with the same instant.
 */
export function allocate(seasons: number[][], slots: Slot[]): Allocation {
  const buckets: Bucket[] = slots.map((slot) => ({
    animeId: slot.animeId,
    cap: slot.cap,
    used: 0,
    firstAt: null,
    lastAt: null,
    minutes: slot.minutes || DEFAULT_MINUTES,
    room: slot.cap == null || slot.cap <= 0 ? Number.POSITIVE_INFINITY : slot.cap
  }))

  const placements: Placement[] = []
  let leftover = 0

  for (const season of seasons) {
    let rest = season
    if (!rest.length) continue

    // A TVDB season is usually exactly one AniList cour, so an untouched slot
    // whose episode count matches wins outright. Without this, a series whose
    // first cour is shorter than its TVDB season 1 would shift every later
    // season by the difference.
    let index = buckets.findIndex((b) => b.used === 0 && b.cap === rest.length)
    if (index === -1) index = buckets.findIndex((b) => b.used < b.room)

    while (rest.length && index !== -1) {
      const bucket = buckets[index]
      const take = Math.min(bucket.room - bucket.used, rest.length)
      // Guards against a zero-capacity slot looping forever.
      if (take <= 0) break

      for (let i = 0; i < take; i++) {
        placements.push({
          animeId: bucket.animeId,
          episode: bucket.used + i + 1,
          at: rest[i],
          minutes: bucket.minutes
        })
      }

      const window = rest.slice(0, take)
      bucket.firstAt = bucket.firstAt === null ? Math.min(...window) : Math.min(bucket.firstAt, ...window)
      bucket.lastAt = bucket.lastAt === null ? Math.max(...window) : Math.max(bucket.lastAt, ...window)
      bucket.used += take
      rest = rest.slice(take)

      // Spill forward only: an earlier slot with room left belongs to an earlier
      // season, and filling it now would put later episodes before earlier ones.
      const from = index
      index = buckets.findIndex((b, i) => i > from && b.used < b.room)
    }

    leftover += rest.length
  }

  return {
    placements,
    slots: buckets.map(({ animeId, cap, used, firstAt, lastAt }) => ({
      animeId,
      cap,
      used,
      firstAt,
      lastAt
    })),
    leftover
  }
}

/** Library status implied by how full a slot ended up. */
export function statusFor(fill: SlotFill): 'planned' | 'watching' | 'completed' {
  if (fill.used === 0) return 'planned'
  if (fill.cap != null && fill.cap > 0 && fill.used >= fill.cap) return 'completed'
  return 'watching'
}
