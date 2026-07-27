import { describe, expect, it, vi } from 'vitest'
import { buildChain, type ImportCandidate } from './chain'
import { candidate, library } from './fixtures'

const ids = (chain: ImportCandidate[]): number[] => chain.map((c) => c.media.id)

const noSearch = (): Promise<ImportCandidate[]> => Promise.resolve([])

describe('marche par relations SEQUEL', () => {
  it('stops at the root when it already holds everything', async () => {
    const root = candidate({ id: 1, episodes: 12 })
    const fetchById = vi.fn(library([]))
    const chain = await buildChain(root, 12, { fetchById, searchFranchise: noSearch })
    expect(ids(chain)).toEqual([1])
    expect(fetchById).not.toHaveBeenCalled()
  })

  it('follows sequels until the episodes fit', async () => {
    const root = candidate({ id: 1, episodes: 12 }, { sequels: [{ id: 2, format: 'TV', episodes: 12 }] })
    const second = candidate({ id: 2, episodes: 12 }, { sequels: [{ id: 3, format: 'TV', episodes: 12 }] })
    const third = candidate({ id: 3, episodes: 12 })

    const chain = await buildChain(root, 30, {
      fetchById: library([second, third]),
      searchFranchise: noSearch
    })
    expect(ids(chain)).toEqual([1, 2, 3])
  })

  it('stops as soon as the chain is long enough', async () => {
    const root = candidate({ id: 1, episodes: 12 }, { sequels: [{ id: 2, format: 'TV', episodes: 12 }] })
    const second = candidate({ id: 2, episodes: 12 }, { sequels: [{ id: 3, format: 'TV', episodes: 12 }] })
    const fetchById = vi.fn(library([second, candidate({ id: 3 })]))

    await buildChain(root, 24, { fetchById, searchFranchise: noSearch })
    expect(fetchById).toHaveBeenCalledTimes(1)
  })

  it('skips a sequel that is not a broadcast format', async () => {
    // A recap film shares the SEQUEL edge with the real continuation.
    const root = candidate(
      { id: 1, episodes: 12 },
      {
        sequels: [
          { id: 9, format: 'MOVIE', episodes: 1 },
          { id: 2, format: 'TV', episodes: 12 }
        ]
      }
    )
    const chain = await buildChain(root, 24, {
      fetchById: library([candidate({ id: 2, episodes: 12 }), candidate({ id: 9, episodes: 1 })]),
      searchFranchise: noSearch
    })
    expect(ids(chain)).toEqual([1, 2])
  })

  it('prefers the longest sequel among several', async () => {
    const root = candidate(
      { id: 1, episodes: 12 },
      {
        sequels: [
          { id: 8, format: 'TV', episodes: 2 },
          { id: 2, format: 'TV', episodes: 24 }
        ]
      }
    )
    const chain = await buildChain(root, 30, {
      fetchById: library([candidate({ id: 2, episodes: 24 }), candidate({ id: 8, episodes: 2 })]),
      searchFranchise: noSearch
    })
    expect(ids(chain)).toEqual([1, 2])
  })

  it('never revisits an entry', async () => {
    // A cycle in the relation graph must not loop forever.
    const root = candidate({ id: 1, episodes: 1 }, { sequels: [{ id: 2, format: 'TV', episodes: 1 }] })
    const second = candidate({ id: 2, episodes: 1 }, { sequels: [{ id: 1, format: 'TV', episodes: 1 }] })
    const chain = await buildChain(root, 999, {
      fetchById: library([second, root]),
      searchFranchise: noSearch
    })
    expect(ids(chain)).toEqual([1, 2])
  })

  it('gives up rather than walking forever', async () => {
    // Every entry points to a fresh sequel and none of them is long enough.
    const fetchById = vi.fn((id: number) =>
      Promise.resolve(candidate({ id, episodes: 1 }, { sequels: [{ id: id + 1, format: 'TV', episodes: 1 }] }))
    )
    const root = candidate({ id: 1, episodes: 1 }, { sequels: [{ id: 2, format: 'TV', episodes: 1 }] })
    const chain = await buildChain(root, 10_000, { fetchById, searchFranchise: noSearch })
    expect(chain.length).toBeLessThanOrEqual(12)
  })

  it('stops when a sequel cannot be fetched', async () => {
    const root = candidate({ id: 1, episodes: 12 }, { sequels: [{ id: 2, format: 'TV', episodes: 12 }] })
    const chain = await buildChain(root, 99, {
      fetchById: () => Promise.resolve(null),
      searchFranchise: noSearch
    })
    expect(ids(chain)).toEqual([1])
  })
})

describe('repli par recherche de franchise', () => {
  const root = candidate({ id: 1, episodes: 12, title: { romaji: 'Dr. STONE', english: null, native: null } })

  it('fills the gap with same-franchise siblings, oldest first', async () => {
    const s2 = candidate({
      id: 3,
      episodes: 11,
      title: { romaji: 'Dr. STONE: Stone Wars', english: null, native: null },
      startDate: { year: 2021, month: 1, day: 14 }
    })
    const s3 = candidate({
      id: 2,
      episodes: 11,
      title: { romaji: 'Dr. STONE: New World', english: null, native: null },
      startDate: { year: 2023, month: 4, day: 6 }
    })

    const chain = await buildChain(root, 34, {
      fetchById: library([]),
      // Deliberately returned newest first: the sort must fix the order.
      searchFranchise: () => Promise.resolve([s3, s2])
    })
    expect(ids(chain)).toEqual([1, 3, 2])
  })

  it('ignores a search result from another franchise', async () => {
    const chain = await buildChain(root, 99, {
      fetchById: library([]),
      searchFranchise: () =>
        Promise.resolve([candidate({ id: 5, title: { romaji: 'Berserk', english: null, native: null } })])
    })
    expect(ids(chain)).toEqual([1])
  })

  it('matches a sibling through its synonyms', async () => {
    const sibling = candidate(
      { id: 4, episodes: 12, title: { romaji: 'Stone Wars', english: null, native: null } },
      { synonyms: ['Dr. STONE 2'] }
    )
    const chain = await buildChain(root, 24, {
      fetchById: library([]),
      searchFranchise: () => Promise.resolve([sibling])
    })
    expect(ids(chain)).toEqual([1, 4])
  })

  it('takes no more siblings than needed', async () => {
    const sibling = (id: number): ImportCandidate =>
      candidate({ id, episodes: 12, title: { romaji: 'Dr. STONE X', english: null, native: null } })
    const chain = await buildChain(root, 24, {
      fetchById: library([]),
      searchFranchise: () => Promise.resolve([sibling(2), sibling(3), sibling(4)])
    })
    expect(chain).toHaveLength(2)
  })

  it('keeps the walk result when the search fails', async () => {
    // Offline or rate limited: a partial chain beats losing the whole series.
    const chain = await buildChain(root, 99, {
      fetchById: library([]),
      searchFranchise: () => Promise.reject(new Error('offline'))
    })
    expect(ids(chain)).toEqual([1])
  })

  it('does not search when the root has no usable title', async () => {
    const searchFranchise = vi.fn(noSearch)
    const nameless = candidate({ id: 7, episodes: 1, title: { romaji: '!!!', english: null, native: null } })
    await buildChain(nameless, 99, { fetchById: library([]), searchFranchise })
    expect(searchFranchise).not.toHaveBeenCalled()
  })
})
