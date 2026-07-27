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

describe('v4 — listes personnalisées', () => {
  it('creates the field on a file that has none', () => {
    const file = db()
    migrate(file)
    expect(file.lists).toEqual([])
  })

  it('leaves a valid list untouched', () => {
    const list = { id: 'a', name: 'Été', emoji: '☀️', animeIds: [1, 2], createdAt: 5, updatedAt: 6 }
    const file = db({ lists: [{ ...list }] })
    migrate(file)
    expect(file.lists).toEqual([list])
  })

  it('fills the fields a list is missing', () => {
    const file = db({ lists: [{ name: 'Minimale' }] })
    migrate(file)
    expect(file.lists?.[0]).toMatchObject({ name: 'Minimale', emoji: '📁', animeIds: [] })
    expect(file.lists?.[0].id).toBeTypeOf('string')
  })

  it('drops a list with no usable name', () => {
    const file = db({ lists: [{ id: 'a', name: '   ' }, { id: 'b' }, { id: 'c', name: 'Vraie' }] })
    migrate(file)
    expect(file.lists?.map((l) => l.name)).toEqual(['Vraie'])
  })

  it('drops a duplicate id', () => {
    // Two lists sharing an id would edit each other.
    const file = db({
      lists: [
        { id: 'same', name: 'Première' },
        { id: 'same', name: 'Seconde' }
      ]
    })
    migrate(file)
    expect(file.lists).toHaveLength(1)
    expect(file.lists?.[0].name).toBe('Première')
  })

  it('deduplicates memberships and drops non-numeric ids', () => {
    const file = db({ lists: [{ id: 'a', name: 'A', animeIds: [1, 1, 2, 'x', null] }] })
    migrate(file)
    expect(file.lists?.[0].animeIds).toEqual([1, 2])
  })

  it('replaces a lists field that is not an array', () => {
    const file = db({ lists: 'nope' as never })
    migrate(file)
    expect(file.lists).toEqual([])
  })

  it('trims the name', () => {
    const file = db({ lists: [{ id: 'a', name: '  Espacé  ' }] })
    migrate(file)
    expect(file.lists?.[0].name).toBe('Espacé')
  })
})

describe('v5 — dédoublonnage de l’historique', () => {
  const row = (episode: number, over: Record<string, unknown> = {}): Record<string, unknown> => ({
    animeId: 1,
    episode,
    at: 1_700_000_000_000,
    minutes: 24,
    ...over
  })

  it('collapses two identical rows into one', () => {
    // The append-only journal makes this newly possible: an append interrupted
    // and retried can land the same row twice.
    const file = db({ entries: { '1': { animeId: 1 } }, history: [row(1), row(1)] })
    migrate(file)
    expect(file.history).toHaveLength(1)
  })

  it('keeps two viewings of the same episode', () => {
    // Different passes are different viewings, each with its own note.
    const file = db({
      entries: { '1': { animeId: 1 } },
      history: [row(1, { note: 'première' }), row(1, { pass: 1, note: 'seconde' })]
    })
    migrate(file)
    expect(file.history).toHaveLength(2)
    expect(file.history.map((h) => h.note)).toEqual(['première', 'seconde'])
  })

  it('keeps the first of a duplicate pair', () => {
    const file = db({
      entries: { '1': { animeId: 1 } },
      history: [row(1, { note: 'gardée' }), row(1, { note: 'jetée' })]
    })
    migrate(file)
    expect(file.history[0].note).toBe('gardée')
  })

  it('leaves distinct episodes alone', () => {
    const file = db({ entries: { '1': { animeId: 1 } }, history: [row(1), row(2), row(3)] })
    migrate(file)
    expect(file.history).toHaveLength(3)
  })

  it('treats an absent pass as pass 0', () => {
    const file = db({ entries: { '1': { animeId: 1 } }, history: [row(1), row(1, { pass: 0 })] })
    migrate(file)
    expect(file.history).toHaveLength(1)
  })
})
