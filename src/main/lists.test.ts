/** Custom lists and the bulk actions that feed them. */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Media } from '@shared/types'
import {
  createList,
  deleteList,
  flush,
  importSnapshot,
  initStore,
  markAllWatched,
  removeEntries,
  removeEntry,
  resetAll,
  setEntries,
  setEntry,
  setListMembership,
  snapshot,
  updateList
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

const lists = () => snapshot().lists ?? []
const listById = (id: string) => lists().find((l) => l.id === id)
const entryOf = (animeId: number) => snapshot().entries.find((e) => e.animeId === animeId)
const history = (animeId: number) => snapshot().history.filter((h) => h.animeId === animeId)

/** Three tracked series. */
function library(): void {
  for (const id of [1, 2, 3]) setEntry(id, { status: 'planned' }, media(id))
}

beforeAll(() => initStore())
beforeEach(() => resetAll())
afterAll(() => flush())

describe('createList', () => {
  it('creates a list with sane defaults', () => {
    const list = createList('À rattraper')
    expect(list).toMatchObject({ name: 'À rattraper', emoji: '📁', animeIds: [] })
    expect(lists()).toHaveLength(1)
  })

  it('trims the name', () => {
    expect(createList('  Été  ')?.name).toBe('Été')
  })

  it('refuses an empty name', () => {
    // A nameless list could not be told apart in the UI.
    expect(createList('   ')).toBeNull()
    expect(lists()).toEqual([])
  })

  it('gives each list its own id', () => {
    const a = createList('A')
    const b = createList('B')
    expect(a?.id).not.toBe(b?.id)
  })

  it('accepts a custom emoji', () => {
    expect(createList('Films', '🎬')?.emoji).toBe('🎬')
  })
})

describe('updateList', () => {
  it('renames and re-emojis', () => {
    const list = createList('Ancien')
    updateList(list?.id ?? '', { name: 'Nouveau', emoji: '🔥' })
    expect(listById(list?.id ?? '')).toMatchObject({ name: 'Nouveau', emoji: '🔥' })
  })

  it('keeps the old name when the new one is blank', () => {
    const list = createList('Gardé')
    updateList(list?.id ?? '', { name: '  ' })
    expect(listById(list?.id ?? '')?.name).toBe('Gardé')
  })

  it('reports an unknown list', () => {
    expect(updateList('absent', { name: 'X' })).toBeNull()
  })
})

describe('deleteList', () => {
  it('removes it', () => {
    const list = createList('Jetable')
    expect(deleteList(list?.id ?? '')).toBe(true)
    expect(lists()).toEqual([])
  })

  it('reports an unknown list', () => {
    expect(deleteList('absent')).toBe(false)
  })
})

describe('setListMembership', () => {
  it('adds several anime at once', () => {
    library()
    const list = createList('Été')
    setListMembership(list?.id ?? '', [1, 2, 3], true)
    expect(listById(list?.id ?? '')?.animeIds).toEqual([1, 2, 3])
  })

  it('never adds the same anime twice', () => {
    library()
    const list = createList('Été')
    setListMembership(list?.id ?? '', [1, 2], true)
    setListMembership(list?.id ?? '', [2, 3], true)
    expect(listById(list?.id ?? '')?.animeIds).toEqual([1, 2, 3])
  })

  it('keeps the order things were added in', () => {
    library()
    const list = createList('Ordre')
    setListMembership(list?.id ?? '', [3, 1], true)
    setListMembership(list?.id ?? '', [2], true)
    expect(listById(list?.id ?? '')?.animeIds).toEqual([3, 1, 2])
  })

  it('removes several at once', () => {
    library()
    const list = createList('Été')
    setListMembership(list?.id ?? '', [1, 2, 3], true)
    setListMembership(list?.id ?? '', [1, 3], false)
    expect(listById(list?.id ?? '')?.animeIds).toEqual([2])
  })

  it('reports an unknown list', () => {
    expect(setListMembership('absent', [1], true)).toBeNull()
  })
})

describe('cohérence des listes', () => {
  it('drops a membership when the series is removed', () => {
    library()
    const list = createList('Été')
    setListMembership(list?.id ?? '', [1, 2], true)

    removeEntry(1)

    // A list pointing at a series that no longer exists would render as a hole.
    expect(listById(list?.id ?? '')?.animeIds).toEqual([2])
  })

  it('drops memberships on a bulk removal', () => {
    library()
    const list = createList('Été')
    setListMembership(list?.id ?? '', [1, 2, 3], true)

    removeEntries([1, 3])

    expect(listById(list?.id ?? '')?.animeIds).toEqual([2])
  })
})

describe('setEntries', () => {
  it('applies one patch to many series', () => {
    library()
    expect(setEntries([1, 2, 3], { status: 'completed' })).toBe(3)
    expect([1, 2, 3].map((id) => entryOf(id)?.status)).toEqual(['completed', 'completed', 'completed'])
  })

  it('sets the dates a status implies', () => {
    library()
    setEntries([1], { status: 'watching' })
    expect(entryOf(1)?.startedAt).toBeTypeOf('number')
    setEntries([2], { status: 'completed' })
    expect(entryOf(2)?.finishedAt).toBeTypeOf('number')
  })

  it('skips anime that are not in the library', () => {
    library()
    expect(setEntries([1, 999], { favorite: true })).toBe(1)
  })

  it('does nothing for an empty selection', () => {
    library()
    expect(setEntries([], { favorite: true })).toBe(0)
  })
})

describe('removeEntries', () => {
  it('removes the entries and their history', () => {
    library()
    markAllWatched([1, 2])
    expect(removeEntries([1, 2])).toBe(2)
    expect(entryOf(1)).toBeUndefined()
    expect(history(1)).toEqual([])
  })

  it('ignores unknown ids', () => {
    library()
    expect(removeEntries([1, 999])).toBe(1)
  })
})

describe('markAllWatched', () => {
  it('ticks every episode of each series', () => {
    library()
    expect(markAllWatched([1, 2])).toBe(24)
    expect(entryOf(1)?.status).toBe('completed')
    expect(history(1)).toHaveLength(12)
  })

  it('does not re-tick what is already seen', () => {
    library()
    markAllWatched([1])
    expect(markAllWatched([1])).toBe(0)
    expect(history(1)).toHaveLength(12)
  })

  it('skips a series whose episode count is unknown', () => {
    // Inventing a count would create episodes that do not exist.
    setEntry(9, { status: 'planned' }, media(9, null))
    expect(markAllWatched([9])).toBe(0)
    expect(history(9)).toEqual([])
  })
})

describe('importSnapshot et listes', () => {
  it('brings across a list that is not there yet', () => {
    importSnapshot(
      {
        version: 4,
        entries: [],
        media: [],
        history: [],
        prefs: {} as never,
        lists: [{ id: 'x', name: 'Importée', emoji: '📦', animeIds: [7], createdAt: 1, updatedAt: 1 }]
      },
      'merge'
    )
    expect(lists()).toHaveLength(1)
  })

  it('merges memberships instead of duplicating the list', () => {
    const list = createList('Locale')
    setListMembership(list?.id ?? '', [1], true)

    importSnapshot(
      {
        version: 4,
        entries: [],
        media: [],
        history: [],
        prefs: {} as never,
        lists: [{ id: list?.id ?? '', name: 'Locale', emoji: '📁', animeIds: [2], createdAt: 1, updatedAt: 1 }]
      },
      'merge'
    )

    expect(lists()).toHaveLength(1)
    expect(listById(list?.id ?? '')?.animeIds.sort()).toEqual([1, 2])
  })

  it('takes the newer name', () => {
    const list = createList('Ancien nom')
    importSnapshot(
      {
        version: 4,
        entries: [],
        media: [],
        history: [],
        prefs: {} as never,
        lists: [
          {
            id: list?.id ?? '',
            name: 'Nom récent',
            emoji: '✨',
            animeIds: [],
            createdAt: 1,
            updatedAt: Date.now() + 10_000
          }
        ]
      },
      'merge'
    )
    expect(listById(list?.id ?? '')?.name).toBe('Nom récent')
  })

  it('survives a backup written before lists existed', () => {
    importSnapshot({ version: 3, entries: [], media: [], history: [], prefs: {} as never }, 'merge')
    expect(lists()).toEqual([])
  })
})
