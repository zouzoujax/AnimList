/**
 * The split between the core file and the append-only history journal.
 *
 * What matters here is what actually lands on disk: an episode tick must append
 * one line rather than rewrite thousands, and nothing may be lost when the
 * journal has to be rebuilt.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { Media } from '@shared/types'
import {
  clearWatched,
  dbPath,
  flush,
  initStore,
  removeEvent,
  resetAll,
  setEntry,
  setWatched,
  setWatchedUpTo,
  snapshot,
  updateEvent
} from './store'

function media(id: number, episodes: number | null = 12): Media {
  return {
    id,
    idMal: null,
    title: { romaji: `Anime ${id}`, english: null, native: null },
    cover: { large: '', xl: '', color: null },
    banner: null,
    format: 'TV',
    status: 'FINISHED',
    episodes,
    duration: 24,
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
    cachedAt: 0
  }
}

const journalPath = (): string => dbPath().replace(/\.json$/, '-history.jsonl')

const journalLines = (): string[] =>
  existsSync(journalPath())
    ? readFileSync(journalPath(), 'utf8')
        .split('\n')
        .filter((l) => l.trim())
    : []

const core = (): Record<string, unknown> => JSON.parse(readFileSync(dbPath(), 'utf8')) as Record<string, unknown>

beforeAll(() => initStore())
beforeEach(async () => {
  resetAll()
  await flush()
})
afterAll(() => flush())

describe('séparation des deux fichiers', () => {
  it('keeps the history out of the core file', async () => {
    setEntry(1, { status: 'planned' }, media(1))
    setWatchedUpTo(1, 3)
    await flush()

    // The whole point: the core no longer carries the history.
    expect(core().history).toEqual([])
    expect(journalLines()).toHaveLength(3)
  })

  it('still keeps entries and lists in the core', async () => {
    setEntry(1, { status: 'watching', score: 8 }, media(1))
    await flush()

    const written = core()
    expect(written.entries).toBeTypeOf('object')
    expect(written.media).toBeTypeOf('object')
    expect(written.prefs).toBeTypeOf('object')
    expect(written.lists).toEqual([])
  })

  it('writes one line per episode, as parseable JSON', async () => {
    setEntry(1, { status: 'planned' }, media(1))
    setWatchedUpTo(1, 2)
    await flush()

    const rows = journalLines().map((l) => JSON.parse(l) as { animeId: number; episode: number })
    expect(rows.map((r) => r.episode)).toEqual([1, 2])
    expect(rows.every((r) => r.animeId === 1)).toBe(true)
  })
})

describe('ajouts', () => {
  it('appends rather than rewriting', async () => {
    setEntry(1, { status: 'planned' }, media(1))
    setWatchedUpTo(1, 3)
    await flush()
    const first = readFileSync(journalPath(), 'utf8')

    setWatched(1, 4, true)
    await flush()
    const second = readFileSync(journalPath(), 'utf8')

    // An append leaves everything before it byte-for-byte identical.
    expect(second.startsWith(first)).toBe(true)
    expect(journalLines()).toHaveLength(4)
  })

  it('batches several ticks into one write', async () => {
    setEntry(1, { status: 'planned' }, media(1))
    setWatched(1, 1, true)
    setWatched(1, 2, true)
    setWatched(1, 3, true)
    await flush()
    expect(journalLines()).toHaveLength(3)
  })
})

describe('réécritures', () => {
  it('rewrites the journal when an episode is unticked', async () => {
    setEntry(1, { status: 'planned' }, media(1))
    setWatchedUpTo(1, 3)
    await flush()

    setWatched(1, 2, false)
    await flush()

    const rows = journalLines().map((l) => JSON.parse(l) as { episode: number })
    expect(rows.map((r) => r.episode)).toEqual([1, 3])
  })

  it('rewrites when an event is edited', async () => {
    setEntry(1, { status: 'planned' }, media(1))
    setWatchedUpTo(1, 2)
    await flush()

    updateEvent({ animeId: 1, episode: 1, pass: 0 }, { note: 'ma note' })
    await flush()

    const rows = journalLines().map((l) => JSON.parse(l) as { note?: string })
    expect(rows[0].note).toBe('ma note')
    expect(rows).toHaveLength(2)
  })

  it('rewrites when an event is removed', async () => {
    setEntry(1, { status: 'planned' }, media(1))
    setWatchedUpTo(1, 3)
    await flush()

    removeEvent({ animeId: 1, episode: 3, pass: 0 })
    await flush()

    expect(journalLines()).toHaveLength(2)
  })

  it('empties the journal when a series is reset', async () => {
    setEntry(1, { status: 'planned' }, media(1))
    setWatchedUpTo(1, 3)
    await flush()

    clearWatched(1)
    await flush()

    expect(journalLines()).toEqual([])
  })

  it('does not duplicate rows when a rewrite follows queued appends', async () => {
    // Both happen before a single save: the rewrite must win outright, otherwise
    // the appended lines would be written on top of it.
    setEntry(1, { status: 'planned' }, media(1))
    setWatchedUpTo(1, 3)
    setWatched(1, 2, false)
    await flush()

    expect(journalLines()).toHaveLength(2)
  })
})

describe('relecture', () => {
  it('reads the journal back on the next start', async () => {
    setEntry(1, { status: 'planned' }, media(1))
    setWatchedUpTo(1, 3)
    await flush()

    initStore()

    expect(snapshot().history).toHaveLength(3)
    expect(snapshot().entries.find((e) => e.animeId === 1)?.status).toBe('watching')
  })

  it('skips a torn line instead of losing the file', async () => {
    setEntry(1, { status: 'planned' }, media(1))
    setWatchedUpTo(1, 2)
    await flush()

    // What a crash mid-append leaves behind.
    writeFileSync(journalPath(), readFileSync(journalPath(), 'utf8') + '{"animeId":1,"epis', 'utf8')
    initStore()

    expect(snapshot().history).toHaveLength(2)
  })

  it('ignores a line that is valid JSON but not an event', async () => {
    setEntry(1, { status: 'planned' }, media(1))
    setWatched(1, 1, true)
    await flush()

    writeFileSync(journalPath(), readFileSync(journalPath(), 'utf8') + '{"rien":1}\n', 'utf8')
    initStore()

    expect(snapshot().history).toHaveLength(1)
  })

  it('recovers a history still stored inline by an older version', async () => {
    setEntry(1, { status: 'planned' }, media(1))
    await flush()

    // A pre-v5 file: history inside the core, no journal beside it.
    const legacy = { ...core(), version: 4, history: [{ animeId: 1, episode: 1, at: 1, minutes: 24 }] }
    writeFileSync(dbPath(), JSON.stringify(legacy), 'utf8')
    writeFileSync(journalPath(), '', 'utf8')
    const { unlinkSync } = await import('node:fs')
    unlinkSync(journalPath())

    initStore()
    await flush()

    expect(snapshot().history).toHaveLength(1)
    // And it is moved out of the core on the way.
    expect(core().history).toEqual([])
    expect(journalLines()).toHaveLength(1)
  })
})
