import { describe, expect, it, vi } from 'vitest'
import { runImport, type ImportDeps } from './run'
import type { SourceShow } from './read'
import { candidate, library } from './fixtures'
import type { ImportCandidate } from './chain'

const days = (n: number, from = 1_600_000_000_000): number[] =>
  Array.from({ length: n }, (_, i) => from + i * 86_400_000)

function show(over: Partial<SourceShow> = {}): SourceShow {
  const seasons = over.seasons ?? [days(12)]
  return {
    id: '1',
    name: 'Bleach',
    favorite: false,
    addedAt: null,
    seasons,
    watched: seasons.reduce((n, s) => n + s.length, 0),
    ...over,
    ...(over.watched !== undefined ? { watched: over.watched } : {})
  }
}

/** Deps whose search returns `pool`, and whose fetches resolve from it. */
function deps(pool: ImportCandidate[], over: Partial<ImportDeps> = {}): ImportDeps {
  return {
    search: () => Promise.resolve(pool),
    fetchById: library(pool),
    searchFranchise: () => Promise.resolve(pool),
    ...over
  }
}

const bleach = candidate({ id: 100, episodes: 12, title: { romaji: 'Bleach', english: null, native: null } })

describe('import nominal', () => {
  it('produces an entry, its media and its history', async () => {
    const out = await runImport([show()], deps([bleach]))
    expect(out.entries).toHaveLength(1)
    expect(out.media).toHaveLength(1)
    expect(out.history).toHaveLength(12)
    expect(out.shows[0]).toMatchObject({ status: 'ok', placed: 12, watched: 12 })
  })

  it('marks every imported episode', async () => {
    // Without this flag the tick dates pollute streaks, the heatmap and the
    // "best day" statistic.
    const out = await runImport([show()], deps([bleach]))
    expect(out.history.every((h) => h.imported === true)).toBe(true)
  })

  it('completes an entry that received all its episodes', async () => {
    const out = await runImport([show()], deps([bleach]))
    expect(out.entries[0].status).toBe('completed')
    expect(out.entries[0].finishedAt).toBe(days(12)[11])
  })

  it('leaves a partly watched entry in progress', async () => {
    const out = await runImport([show({ seasons: [days(5)] })], deps([bleach]))
    expect(out.entries[0]).toMatchObject({ status: 'watching', finishedAt: null })
    expect(out.entries[0].startedAt).toBe(days(5)[0])
  })

  it('carries the favourite flag and the date added', async () => {
    const out = await runImport([show({ favorite: true, addedAt: 123 })], deps([bleach]))
    expect(out.entries[0]).toMatchObject({ favorite: true, addedAt: 123 })
  })

  it('falls back to now when the export has no date added', async () => {
    const before = Date.now()
    const out = await runImport([show()], deps([bleach]))
    expect(out.entries[0].addedAt).toBeGreaterThanOrEqual(before)
  })

  it('uses the runtime of each entry', async () => {
    const long = candidate({ id: 100, episodes: 12, duration: 47, title: { romaji: 'Bleach', english: null, native: null } })
    const out = await runImport([show()], deps([long]))
    expect(out.history.every((h) => h.minutes === 47)).toBe(true)
  })
})

describe('séries longues', () => {
  const s1 = candidate(
    { id: 1, episodes: 12, title: { romaji: 'Attack on Titan', english: null, native: null } },
    { sequels: [{ id: 2, format: 'TV', episodes: 12 }] }
  )
  const s2 = candidate({ id: 2, episodes: 12, title: { romaji: 'Attack on Titan S2', english: null, native: null } })

  it('spreads a long series over the chain', async () => {
    const out = await runImport(
      [show({ name: 'Attack on Titan', seasons: [days(12), days(12, 2_000_000_000_000)] })],
      deps([s1, s2])
    )
    expect(out.entries).toHaveLength(2)
    expect(out.history).toHaveLength(24)
    expect(out.shows[0].chain).toHaveLength(2)
  })

  it('adds the untouched tail of the chain to the library', async () => {
    // 13 watched episodes reach into the second entry, which stays unfinished —
    // and that is exactly what makes it show up as "to watch".
    const out = await runImport([show({ name: 'Attack on Titan', seasons: [days(13)] })], deps([s1, s2]))
    const statuses = out.entries.map((e) => e.status).sort()
    expect(statuses).toEqual(['completed', 'watching'])
  })

  it('reports episodes the chain could not hold', async () => {
    const out = await runImport([show({ seasons: [days(40)] })], deps([bleach]))
    expect(out.shows[0]).toMatchObject({ status: 'partial', placed: 12, watched: 40 })
  })
})

describe('appariement introuvable', () => {
  it('reports a series with no match rather than failing', async () => {
    const out = await runImport([show({ name: 'Série inconnue' })], deps([candidate({ id: 9, title: { romaji: 'Berserk', english: null, native: null } })]))
    expect(out.shows[0].status).toBe('unmatched')
    expect(out.entries).toEqual([])
  })

  it('keeps going after an unmatched series', async () => {
    const out = await runImport([show({ id: '1', name: 'Inconnu' }), show({ id: '2', name: 'Bleach' })], deps([bleach]))
    expect(out.shows.map((s) => s.status)).toEqual(['unmatched', 'ok'])
    expect(out.entries).toHaveLength(1)
  })

  it('survives a search that throws', async () => {
    const out = await runImport([show()], deps([bleach], { search: () => Promise.reject(new Error('offline')) }))
    expect(out.shows[0].status).toBe('unmatched')
  })
})

describe('corrections manuelles', () => {
  it('pins a series to a chosen AniList id', async () => {
    const forced = candidate({ id: 555, episodes: 12, title: { romaji: 'Autre chose', english: null, native: null } })
    const search = vi.fn(() => Promise.resolve([bleach]))
    const out = await runImport([show()], deps([bleach, forced], { overrides: { '1': 555 }, search }))
    expect(out.entries[0].animeId).toBe(555)
    // A pinned series must not cost a search.
    expect(search).not.toHaveBeenCalled()
    expect(out.shows[0].score).toBeNull()
  })

  it('skips a series set to zero', async () => {
    const out = await runImport([show()], deps([bleach], { overrides: { '1': 0 } }))
    expect(out.shows[0].status).toBe('skipped')
    expect(out.entries).toEqual([])
  })

  it('reports a pinned id that does not resolve', async () => {
    const out = await runImport([show()], deps([bleach], { overrides: { '1': 404 } }))
    expect(out.shows[0].status).toBe('unmatched')
  })
})

describe('progression et annulation', () => {
  it('announces each series and ends at the total', async () => {
    const onProgress = vi.fn()
    await runImport([show({ id: '1' }), show({ id: '2' })], deps([bleach], { onProgress }))
    expect(onProgress).toHaveBeenCalledWith(0, 2, 'Bleach')
    expect(onProgress).toHaveBeenLastCalledWith(2, 2, '')
  })

  it('stops when cancelled and keeps what it already has', async () => {
    let seen = 0
    const out = await runImport([show({ id: '1' }), show({ id: '2' }), show({ id: '3' })], deps([bleach], {
      isCancelled: () => seen++ >= 1
    }))
    expect(out.shows).toHaveLength(1)
    expect(out.entries).toHaveLength(1)
  })
})

describe('déduplication', () => {
  it('does not duplicate an entry two source series both point at', async () => {
    // Both halves of a split cour can resolve to the same AniList entry.
    const out = await runImport([show({ id: '1' }), show({ id: '2' })], deps([bleach]))
    expect(out.entries).toHaveLength(1)
    expect(out.media).toHaveLength(1)
  })
})
