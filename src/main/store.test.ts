import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Media, Snapshot } from '@shared/types'
import {
  cacheMedia,
  clearWatched,
  flush,
  getPrefs,
  importSnapshot,
  initStore,
  removeEntry,
  resetAll,
  setEntry,
  setPrefs,
  setWatched,
  setWatchedUpTo,
  snapshot
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
const watchedCount = (animeId: number) => snapshot().history.filter((h) => h.animeId === animeId).length

beforeAll(() => initStore())
beforeEach(() => resetAll())
afterAll(() => flush())

describe('setEntry', () => {
  it('creates an entry with sane defaults', () => {
    setEntry(1, { status: 'planned' }, media(1, 12))
    expect(entryOf(1)).toMatchObject({
      animeId: 1,
      status: 'planned',
      score: null,
      emotions: [],
      favorite: false,
      notes: '',
      rewatches: 0,
      finishedAt: null
    })
  })

  it('stamps startedAt the first time it goes to watching', () => {
    setEntry(1, { status: 'watching' }, media(1, 12))
    const started = entryOf(1)?.startedAt
    expect(started).toBeTypeOf('number')

    setEntry(1, { score: 8 })
    expect(entryOf(1)?.startedAt).toBe(started)
  })

  it('merges a patch without dropping other fields', () => {
    setEntry(1, { status: 'watching', score: 7 }, media(1, 12))
    setEntry(1, { favorite: true })
    expect(entryOf(1)).toMatchObject({ status: 'watching', score: 7, favorite: true })
  })
})

describe('setWatched', () => {
  it('records and removes a single episode', () => {
    cacheMedia([media(1, 12)])
    setWatched(1, 3, true)
    expect(watchedCount(1)).toBe(1)

    setWatched(1, 3, false)
    expect(watchedCount(1)).toBe(0)
  })

  it('ignores a redundant call', () => {
    cacheMedia([media(1, 12)])
    setWatched(1, 1, true)
    setWatched(1, 1, true)
    expect(watchedCount(1)).toBe(1)
  })

  it('takes the runtime from the media', () => {
    cacheMedia([media(1, 12, 47)])
    setWatched(1, 1, true)
    expect(snapshot().history[0].minutes).toBe(47)
  })

  it('falls back to the configured runtime when the duration is unknown', () => {
    setPrefs({ defaultRuntime: 31 })
    cacheMedia([media(1, 12, null)])
    setWatched(1, 1, true)
    expect(snapshot().history[0].minutes).toBe(31)
    setPrefs({ defaultRuntime: 24 })
  })

  it('creates an entry even when the episode is ticked before adding the show', () => {
    cacheMedia([media(1, 12)])
    setWatched(1, 1, true)
    expect(entryOf(1)?.status).toBe('watching')
  })
})

describe('setWatchedUpTo', () => {
  it('fills every episode up to the target', () => {
    cacheMedia([media(1, 26)])
    setWatchedUpTo(1, 5)
    expect(watchedCount(1)).toBe(5)
    expect(
      snapshot()
        .history.map((h) => h.episode)
        .sort((a, b) => a - b)
    ).toEqual([1, 2, 3, 4, 5])
  })

  it('does not duplicate what is already watched', () => {
    cacheMedia([media(1, 26)])
    setWatched(1, 2, true)
    setWatchedUpTo(1, 4)
    expect(watchedCount(1)).toBe(4)
  })
})

describe('progress keeps the status in sync', () => {
  it('goes planned -> watching -> completed', () => {
    setEntry(1, { status: 'planned' }, media(1, 3))
    expect(entryOf(1)?.status).toBe('planned')

    setWatched(1, 1, true)
    expect(entryOf(1)?.status).toBe('watching')

    setWatchedUpTo(1, 3)
    expect(entryOf(1)?.status).toBe('completed')
    expect(entryOf(1)?.finishedAt).toBeTypeOf('number')
  })

  it('drops back to watching when an episode is un-ticked', () => {
    setEntry(1, { status: 'planned' }, media(1, 3))
    setWatchedUpTo(1, 3)
    setWatched(1, 3, false)
    expect(entryOf(1)?.status).toBe('watching')
    expect(entryOf(1)?.finishedAt).toBeNull()
  })

  it('returns to planned once nothing is watched', () => {
    setEntry(1, { status: 'planned' }, media(1, 3))
    setWatchedUpTo(1, 3)
    clearWatched(1)
    expect(entryOf(1)?.status).toBe('planned')
    expect(entryOf(1)?.startedAt).toBeNull()
  })

  // Finishing every episode of something you dropped should not silently
  // reclassify it as completed.
  it('respects a dropped status', () => {
    setEntry(1, { status: 'dropped' }, media(1, 3))
    setWatchedUpTo(1, 3)
    expect(entryOf(1)?.status).toBe('dropped')
  })

  it('stays watching when the episode count is unknown', () => {
    setEntry(1, { status: 'planned' }, media(1, null))
    setWatchedUpTo(1, 40)
    expect(entryOf(1)?.status).toBe('watching')
  })
})

describe('removeEntry', () => {
  it('takes the history with it', () => {
    setEntry(1, { status: 'watching' }, media(1, 12))
    setWatchedUpTo(1, 4)
    removeEntry(1)
    expect(entryOf(1)).toBeUndefined()
    expect(watchedCount(1)).toBe(0)
  })

  it('leaves other shows alone', () => {
    setEntry(1, { status: 'watching' }, media(1, 12))
    setEntry(2, { status: 'watching' }, media(2, 12))
    setWatchedUpTo(1, 2)
    setWatchedUpTo(2, 3)
    removeEntry(1)
    expect(watchedCount(2)).toBe(3)
  })
})

describe('importSnapshot', () => {
  const incoming = (over: Partial<Snapshot> = {}): Snapshot => ({
    version: 1,
    entries: [],
    media: [],
    history: [],
    prefs: getPrefs(),
    ...over
  })

  it('dedupes history by anime and episode', () => {
    cacheMedia([media(1, 12)])
    setWatched(1, 1, true)

    importSnapshot(
      incoming({
        media: [media(1, 12)],
        history: [
          { animeId: 1, episode: 1, at: 1, minutes: 24, imported: true },
          { animeId: 1, episode: 2, at: 2, minutes: 24, imported: true }
        ]
      }),
      'merge'
    )

    expect(watchedCount(1)).toBe(2)
  })

  it('keeps the newer entry when both sides have one', () => {
    setEntry(1, { status: 'watching', score: 5 }, media(1, 12))
    const older = { ...entryOf(1)!, score: 9, updatedAt: 1 }
    importSnapshot(incoming({ entries: [older], media: [media(1, 12)] }), 'merge')
    expect(entryOf(1)?.score).toBe(5)
  })

  it('takes the incoming entry when it is newer', () => {
    setEntry(1, { status: 'watching', score: 5 }, media(1, 12))
    const newer = { ...entryOf(1)!, score: 9, updatedAt: Date.now() + 10_000 }
    importSnapshot(incoming({ entries: [newer], media: [media(1, 12)] }), 'merge')
    expect(entryOf(1)?.score).toBe(9)
  })

  it('wipes everything in replace mode', () => {
    setEntry(1, { status: 'watching' }, media(1, 12))
    setWatchedUpTo(1, 3)
    importSnapshot(incoming({ entries: [], media: [media(2, 12)] }), 'replace')
    expect(snapshot().entries).toHaveLength(0)
    expect(snapshot().history).toHaveLength(0)
  })

  it('preserves the imported flag so stats can exclude those rows', () => {
    importSnapshot(
      incoming({
        media: [media(1, 12)],
        history: [{ animeId: 1, episode: 1, at: 1, minutes: 24, imported: true }]
      }),
      'merge'
    )
    expect(snapshot().history[0].imported).toBe(true)
  })
})

describe('prefs', () => {
  it('merges a patch', () => {
    setPrefs({ theme: 'terminal' })
    setPrefs({ layout: 'rail' })
    expect(getPrefs()).toMatchObject({ theme: 'terminal', layout: 'rail' })
    setPrefs({ theme: 'nebula', layout: 'classic' })
  })
})
