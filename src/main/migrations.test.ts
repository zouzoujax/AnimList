import { describe, expect, it } from 'vitest'
import { migrate, pendingMigrations, SCHEMA_VERSION, type StoredDb } from './migrations'

function db(over: Partial<StoredDb> = {}): StoredDb {
  return { media: {}, entries: {}, history: [], prefs: {}, ...over }
}

describe('migrate', () => {
  it('brings a version-less file all the way up', () => {
    const file = db()
    const report = migrate(file)
    expect(report.from).toBe(1)
    expect(report.to).toBe(SCHEMA_VERSION)
    expect(file.version).toBe(SCHEMA_VERSION)
    expect(report.applied).toHaveLength(pendingMigrations(1))
  })

  it('is a no-op on an already current file', () => {
    const file = db({ version: SCHEMA_VERSION })
    const report = migrate(file)
    expect(report.applied).toEqual([])
    expect(report.ahead).toBe(false)
  })

  it('is idempotent', () => {
    const file = db({
      entries: { '1': { animeId: 1, status: 'watching' } },
      history: [{ animeId: 1, episode: 1 }]
    })
    migrate(file)
    const snapshot = JSON.stringify(file)
    migrate(file)
    expect(JSON.stringify(file)).toBe(snapshot)
  })

  // Reinstalling an older build must not let it rewrite a newer file.
  it('refuses a file written by a newer build', () => {
    const file = db({ version: SCHEMA_VERSION + 5, entries: { '1': {} } })
    const report = migrate(file)
    expect(report.ahead).toBe(true)
    expect(report.applied).toEqual([])
    expect(file.version).toBe(SCHEMA_VERSION + 5)
    expect(file.entries['1']).toEqual({})
  })
})

describe('v2 — champs manquants', () => {
  it('fills every field a current entry needs', () => {
    const file = db({ entries: { '42': { status: 'watching' } } })
    migrate(file)
    expect(file.entries['42']).toMatchObject({
      animeId: 42,
      status: 'watching',
      score: null,
      emotions: [],
      favorite: false,
      notes: '',
      rewatches: 0,
      startedAt: null,
      finishedAt: null
    })
    expect(file.entries['42'].addedAt).toBeTypeOf('number')
  })

  it('never overwrites a value that is already there', () => {
    const file = db({
      entries: { '1': { animeId: 1, status: 'completed', score: 9, notes: 'top', rewatches: 2, favorite: true } }
    })
    migrate(file)
    expect(file.entries['1']).toMatchObject({
      status: 'completed',
      score: 9,
      notes: 'top',
      rewatches: 2,
      favorite: true
    })
  })

  it('keeps a score of 0 rather than treating it as missing', () => {
    const file = db({ entries: { '1': { animeId: 1, score: 0 } } })
    migrate(file)
    expect(file.entries['1'].score).toBe(0)
  })

  it('repairs history rows with a bad runtime or timestamp', () => {
    const file = db({
      entries: { '1': { animeId: 1 } },
      history: [
        { animeId: 1, episode: 1, minutes: 0, at: Number.NaN },
        { animeId: 1, episode: 2, minutes: 47, at: 1_700_000_000_000 }
      ]
    })
    migrate(file)
    expect(file.history[0].minutes).toBe(24)
    expect(file.history[0].at).toBeTypeOf('number')
    expect(Number.isFinite(file.history[0].at as number)).toBe(true)
    // An intact row is left exactly as it was.
    expect(file.history[1]).toMatchObject({ minutes: 47, at: 1_700_000_000_000 })
  })

  it('drops rows that can never be displayed', () => {
    const file = db({
      entries: { '1': { animeId: 1 } },
      history: [{ animeId: 1, episode: 1 }, { episode: 3 }, { animeId: 1 }, { animeId: 1, episode: 0 }]
    })
    migrate(file)
    expect(file.history).toHaveLength(1)
  })

  it('preserves the imported flag', () => {
    const file = db({
      entries: { '1': { animeId: 1 } },
      history: [{ animeId: 1, episode: 1, minutes: 24, at: 1, imported: true }]
    })
    migrate(file)
    expect(file.history[0].imported).toBe(true)
  })
})

describe('v3 — purge du cache de fiches', () => {
  it('drops media backing nothing', () => {
    const file = db({
      media: { '1': { id: 1 }, '2': { id: 2 }, '3': { id: 3 } },
      entries: { '1': { animeId: 1 } },
      history: [{ animeId: 2, episode: 1, minutes: 24, at: 1 }]
    })
    migrate(file)
    expect(Object.keys(file.media).sort()).toEqual(['1', '2'])
  })

  it('leaves a fully referenced cache alone', () => {
    const file = db({
      media: { '1': { id: 1 } },
      entries: { '1': { animeId: 1 } }
    })
    migrate(file)
    expect(Object.keys(file.media)).toEqual(['1'])
  })

  // The purge must run after v2 has removed unusable rows, otherwise a broken
  // row could keep a media entry alive.
  it('does not keep media alive through a dropped history row', () => {
    const file = db({
      media: { '9': { id: 9 } },
      entries: {},
      history: [{ animeId: 9 }]
    })
    migrate(file)
    expect(file.media).toEqual({})
  })
})
