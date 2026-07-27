/**
 * Rewatching, and editing the history it produces.
 *
 * The invariant under test: an episode is "currently seen" only in the pass the
 * entry is on. Earlier passes stay in the history — they still count towards
 * watch time and keep their notes — but they must not fill the grid again.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Media } from '@shared/types'
import {
  cancelRewatch,
  clearWatched,
  flush,
  importSnapshot,
  initStore,
  removeEvent,
  resetAll,
  setEntry,
  setWatched,
  setWatchedUpTo,
  snapshot,
  startRewatch,
  updateEvent
} from './store'

function media(id: number, episodes: number | null, duration: number | null = 24): Media {
  return {
    id,
    idMal: null,
    title: { romaji: `Anime ${id}`, english: null, native: null },
    cover: { large: '', xl: '', color: null },
    banner: null,
    format: 'TV',
    status: 'FINISHED',
    episodes,
    duration,
    season: null,
    seasonYear: null,
    startDate: null,
    genres: [],
    studios: [],
    averageScore: null,
    popularity: 0,
    description: null,
    nextAiring: null,
    trailer: null,
    cachedAt: Date.now()
  }
}

const entryOf = (animeId: number) => snapshot().entries.find((e) => e.animeId === animeId)
const history = (animeId: number) => snapshot().history.filter((h) => h.animeId === animeId)
const passOf = (ev: { pass?: number }): number => ev.pass ?? 0
/** Episodes that count as seen right now — the current pass only. */
const currentEpisodes = (animeId: number): number[] => {
  const pass = entryOf(animeId)?.rewatches ?? 0
  return history(animeId)
    .filter((h) => passOf(h) === pass)
    .map((h) => h.episode)
    .sort((a, b) => a - b)
}

/** A finished 3-episode series. */
function finished(id = 1): void {
  setEntry(id, { status: 'planned' }, media(id, 3))
  setWatchedUpTo(id, 3)
}

beforeAll(() => initStore())
beforeEach(() => resetAll())
afterAll(() => flush())

describe('startRewatch', () => {
  it('empties the current progress without losing the history', () => {
    finished()
    expect(entryOf(1)?.status).toBe('completed')

    startRewatch(1)

    expect(entryOf(1)?.rewatches).toBe(1)
    expect(currentEpisodes(1)).toEqual([])
    // The first viewing is still on record.
    expect(history(1)).toHaveLength(3)
  })

  it('puts the series back in progress', () => {
    finished()
    startRewatch(1)
    expect(entryOf(1)).toMatchObject({ status: 'watching', finishedAt: null })
    expect(entryOf(1)?.startedAt).toBeTypeOf('number')
  })

  it('records new episodes in the new pass', () => {
    finished()
    startRewatch(1)
    setWatched(1, 1, true)

    expect(currentEpisodes(1)).toEqual([1])
    expect(history(1)).toHaveLength(4)
    const fresh = history(1).filter((h) => passOf(h) === 1)
    expect(fresh).toHaveLength(1)
  })

  it('completes again once the new pass is full', () => {
    finished()
    startRewatch(1)
    setWatchedUpTo(1, 3)
    expect(entryOf(1)?.status).toBe('completed')
    expect(history(1)).toHaveLength(6)
  })

  it('stacks several rewatches', () => {
    finished()
    startRewatch(1)
    setWatchedUpTo(1, 3)
    startRewatch(1)
    expect(entryOf(1)?.rewatches).toBe(2)
    expect(currentEpisodes(1)).toEqual([])
    expect(history(1)).toHaveLength(6)
  })

  it('does nothing for a series that is not in the library', () => {
    expect(startRewatch(999)).toBeNull()
  })

  it('leaves other series alone', () => {
    finished(1)
    finished(2)
    startRewatch(1)
    expect(currentEpisodes(2)).toEqual([1, 2, 3])
    expect(entryOf(2)?.status).toBe('completed')
  })
})

describe('unticking during a rewatch', () => {
  it('only removes the current pass', () => {
    finished()
    startRewatch(1)
    setWatched(1, 1, true)
    setWatched(1, 1, false)

    expect(currentEpisodes(1)).toEqual([])
    // The original viewing of episode 1 survives.
    expect(history(1).filter((h) => h.episode === 1)).toHaveLength(1)
  })

  it('does not re-tick an episode from an earlier pass', () => {
    finished()
    startRewatch(1)
    // Episode 1 exists in pass 0, so a naive index would call it already seen.
    setWatched(1, 1, true)
    expect(history(1).filter((h) => h.episode === 1)).toHaveLength(2)
  })
})

describe('cancelRewatch', () => {
  it('discards the pass and restores the previous progress', () => {
    finished()
    startRewatch(1)
    setWatched(1, 1, true)

    cancelRewatch(1)

    expect(entryOf(1)?.rewatches).toBe(0)
    expect(currentEpisodes(1)).toEqual([1, 2, 3])
    expect(history(1)).toHaveLength(3)
    expect(entryOf(1)?.status).toBe('completed')
  })

  it('refuses when there is no rewatch to cancel', () => {
    finished()
    expect(cancelRewatch(1)).toBeNull()
    expect(currentEpisodes(1)).toEqual([1, 2, 3])
  })

  it('does nothing for an unknown series', () => {
    expect(cancelRewatch(999)).toBeNull()
  })
})

describe('clearWatched', () => {
  it('wipes every pass and resets the counter', () => {
    finished()
    startRewatch(1)
    setWatched(1, 1, true)

    clearWatched(1)

    expect(history(1)).toEqual([])
    expect(entryOf(1)?.rewatches).toBe(0)
    expect(entryOf(1)?.status).toBe('planned')
  })
})

describe('updateEvent', () => {
  it('corrects a watch date', () => {
    finished()
    const when = Date.parse('2021-06-01T20:00:00Z')
    expect(updateEvent({ animeId: 1, episode: 2, pass: 0 }, { at: when })).toBe(true)
    expect(history(1).find((h) => h.episode === 2)?.at).toBe(when)
  })

  it('lets a corrected import rejoin the day-based statistics', () => {
    // An import stamps the day the episode was ticked, not watched — which is
    // why those rows are excluded from streaks and the heatmap. Fixing the date
    // by hand makes it a real date again.
    importSnapshot(
      {
        version: 1,
        entries: [],
        media: [media(5, 12)],
        history: [{ animeId: 5, episode: 1, at: 1, minutes: 24, imported: true }],
        prefs: {} as never
      },
      'merge'
    )
    updateEvent({ animeId: 5, episode: 1, pass: 0 }, { at: Date.parse('2022-01-01T12:00:00Z') })
    expect(history(5)[0].imported).toBeUndefined()
  })

  it('edits the runtime', () => {
    finished()
    updateEvent({ animeId: 1, episode: 1, pass: 0 }, { minutes: 47 })
    expect(history(1).find((h) => h.episode === 1)?.minutes).toBe(47)
  })

  it('refuses a runtime that is not a number', () => {
    finished()
    updateEvent({ animeId: 1, episode: 1, pass: 0 }, { minutes: Number.NaN })
    expect(history(1).find((h) => h.episode === 1)?.minutes).toBe(24)
  })

  it('never stores a negative runtime', () => {
    finished()
    updateEvent({ animeId: 1, episode: 1, pass: 0 }, { minutes: -30 })
    expect(history(1).find((h) => h.episode === 1)?.minutes).toBe(0)
  })

  it('ignores an unparseable date', () => {
    finished()
    const before = history(1).find((h) => h.episode === 1)?.at
    updateEvent({ animeId: 1, episode: 1, pass: 0 }, { at: Number.NaN })
    expect(history(1).find((h) => h.episode === 1)?.at).toBe(before)
  })

  it('reports a miss rather than throwing', () => {
    finished()
    expect(updateEvent({ animeId: 1, episode: 99, pass: 0 }, { minutes: 1 })).toBe(false)
    expect(updateEvent({ animeId: 1, episode: 1, pass: 7 }, { minutes: 1 })).toBe(false)
  })

  it('targets one pass at a time', () => {
    finished()
    startRewatch(1)
    setWatched(1, 1, true)

    updateEvent({ animeId: 1, episode: 1, pass: 1 }, { minutes: 90 })

    const rows = history(1).filter((h) => h.episode === 1)
    expect(rows.find((h) => passOf(h) === 0)?.minutes).toBe(24)
    expect(rows.find((h) => passOf(h) === 1)?.minutes).toBe(90)
  })
})

describe('notes et ressentis par épisode', () => {
  it('stores a note and emotions on one episode', () => {
    finished()
    updateEvent({ animeId: 1, episode: 2, pass: 0 }, { note: 'le tournant', emotions: ['cry', 'mind'] })
    const ev = history(1).find((h) => h.episode === 2)
    expect(ev?.note).toBe('le tournant')
    expect(ev?.emotions).toEqual(['cry', 'mind'])
  })

  it('trims a note and drops an empty one', () => {
    finished()
    updateEvent({ animeId: 1, episode: 1, pass: 0 }, { note: '  espacé  ' })
    expect(history(1).find((h) => h.episode === 1)?.note).toBe('espacé')

    updateEvent({ animeId: 1, episode: 1, pass: 0 }, { note: '   ' })
    expect(history(1).find((h) => h.episode === 1)?.note).toBeUndefined()
  })

  it('drops an empty emotion list rather than storing it', () => {
    finished()
    updateEvent({ animeId: 1, episode: 1, pass: 0 }, { emotions: ['love'] })
    updateEvent({ animeId: 1, episode: 1, pass: 0 }, { emotions: [] })
    expect(history(1).find((h) => h.episode === 1)?.emotions).toBeUndefined()
  })

  it('keeps the note of an earlier viewing after a rewatch', () => {
    finished()
    updateEvent({ animeId: 1, episode: 1, pass: 0 }, { note: 'première fois' })
    startRewatch(1)
    setWatched(1, 1, true)
    updateEvent({ animeId: 1, episode: 1, pass: 1 }, { note: 'deuxième fois' })

    const rows = history(1).filter((h) => h.episode === 1)
    expect(rows.find((h) => passOf(h) === 0)?.note).toBe('première fois')
    expect(rows.find((h) => passOf(h) === 1)?.note).toBe('deuxième fois')
  })

  it('leaves the note alone when only the date is edited', () => {
    finished()
    updateEvent({ animeId: 1, episode: 1, pass: 0 }, { note: 'gardée' })
    updateEvent({ animeId: 1, episode: 1, pass: 0 }, { at: 999 })
    expect(history(1).find((h) => h.episode === 1)?.note).toBe('gardée')
  })
})

describe('removeEvent', () => {
  it('removes one episode and updates the status', () => {
    finished()
    expect(removeEvent({ animeId: 1, episode: 2, pass: 0 })).toBe(true)
    expect(currentEpisodes(1)).toEqual([1, 3])
    expect(entryOf(1)?.status).toBe('watching')
  })

  it('reports a miss', () => {
    finished()
    expect(removeEvent({ animeId: 1, episode: 42, pass: 0 })).toBe(false)
  })

  it('can delete from an earlier pass without touching the current one', () => {
    finished()
    startRewatch(1)
    setWatchedUpTo(1, 3)

    removeEvent({ animeId: 1, episode: 1, pass: 0 })

    expect(currentEpisodes(1)).toEqual([1, 2, 3])
    expect(history(1)).toHaveLength(5)
    // The current pass is still complete, so the series stays finished.
    expect(entryOf(1)?.status).toBe('completed')
  })
})

describe('importSnapshot', () => {
  it('keeps both viewings of the same episode', () => {
    // Deduplicating per episode instead of per viewing would silently drop the
    // rewatch and its note.
    importSnapshot(
      {
        version: 1,
        entries: [],
        media: [media(7, 12)],
        history: [
          { animeId: 7, episode: 1, at: 1, minutes: 24 },
          { animeId: 7, episode: 1, at: 2, minutes: 24, pass: 1 }
        ],
        prefs: {} as never
      },
      'merge'
    )
    expect(history(7)).toHaveLength(2)
  })

  it('still refuses a true duplicate', () => {
    const row = { animeId: 8, episode: 1, at: 1, minutes: 24 }
    const payload = { version: 1, entries: [], media: [media(8, 12)], history: [row], prefs: {} as never }
    importSnapshot(payload, 'merge')
    importSnapshot(payload, 'merge')
    expect(history(8)).toHaveLength(1)
  })
})
