import { describe, expect, it } from 'vitest'
import { isSnapshot, mergeSnapshot, previewRestore, type LibraryState } from './restore'
import type { Entry, LibraryStatus, Media, WatchEvent } from './types'

const entry = (animeId: number, status: LibraryStatus, updatedAt = 1): Entry =>
  ({ animeId, status, addedAt: 0, updatedAt }) as Entry
const media = (id: number, title: string): Media => ({ id, title: { romaji: title, english: null } }) as Media
const ev = (animeId: number, episode: number, pass?: number): WatchEvent => ({
  animeId,
  episode,
  at: 1,
  minutes: 24,
  ...(pass ? { pass } : {})
})

const current: LibraryState = {
  entries: [entry(1, 'watching', 10), entry(2, 'completed', 10)],
  media: [media(1, 'Frieren'), media(2, 'Mob Psycho')],
  history: [ev(1, 1), ev(1, 2), ev(2, 1)],
  lists: [{ id: 'l1', name: 'Favoris', emoji: '⭐', animeIds: [1], createdAt: 0, updatedAt: 5 }],
  mangaEntries: [],
  mangas: [],
  reads: []
}

const backup = {
  entries: [entry(1, 'paused', 5), entry(3, 'planned', 5)],
  media: [media(1, 'Frieren'), media(3, 'Dandadan')],
  history: [ev(1, 1), ev(3, 1)],
  lists: [{ id: 'l1', name: 'Anciens favoris', emoji: '⭐', animeIds: [3], createdAt: 0, updatedAt: 1 }]
}

describe('mergeSnapshot', () => {
  it('fusionner garde tout et n’ajoute que ce qui manque', () => {
    const after = mergeSnapshot(current, backup, 'merge')
    // La version en cours de Frieren est plus récente : elle reste.
    expect(after.entries.find((e) => e.animeId === 1)?.status).toBe('watching')
    expect(after.entries.map((e) => e.animeId).sort()).toEqual([1, 2, 3])
    expect(after.history).toHaveLength(4)
    expect(after.lists[0].animeIds.sort()).toEqual([1, 3])
    // Le nom le plus récent l'emporte.
    expect(after.lists[0].name).toBe('Favoris')
  })

  it('remplacer repart de la copie seule', () => {
    const after = mergeSnapshot(current, backup, 'replace')
    expect(after.entries.map((e) => e.animeId).sort()).toEqual([1, 3])
    expect(after.history).toHaveLength(2)
  })

  it('ne touche pas à l’état qu’on lui passe', () => {
    const copy = JSON.parse(JSON.stringify(current)) as LibraryState
    mergeSnapshot(current, backup, 'merge')
    expect(current).toEqual(copy)
  })

  it('fusionner reprend une série plus récente dans la copie', () => {
    const newer = { entries: [entry(2, 'dropped', 20)], lists: [{ ...backup.lists[0], updatedAt: 9 }] }
    const after = mergeSnapshot(current, newer, 'merge')
    expect(after.entries.find((e) => e.animeId === 2)?.status).toBe('dropped')
    expect(after.lists[0].name).toBe('Anciens favoris')
    // Le nom change, les séries de la liste s'additionnent toujours.
    expect(after.lists[0].animeIds.sort()).toEqual([1, 3])
  })

  it('remplacer par une copie sans journal efface le journal, et l’aperçu le dit', () => {
    const after = mergeSnapshot(current, { entries: current.entries }, 'replace')
    expect(after.history).toEqual([])
    expect(previewRestore(current, after, 'replace').episodes).toMatchObject({ lost: 3, gained: 0 })
  })

  it('fusionne les mangas suivis et leurs séances de lecture', () => {
    const reading = {
      ...current,
      mangaEntries: [{ mangaId: 9, status: 'watching', updatedAt: 10 } as LibraryState['mangaEntries'][number]],
      reads: [{ mangaId: 9, from: 0, to: 12, at: 1 }]
    }
    const copy = {
      entries: [],
      mangaEntries: [
        { mangaId: 9, status: 'paused', updatedAt: 5 } as LibraryState['mangaEntries'][number],
        { mangaId: 10, status: 'planned', updatedAt: 5 } as LibraryState['mangaEntries'][number]
      ],
      reads: [
        { mangaId: 9, from: 0, to: 12, at: 1 },
        { mangaId: 10, from: 0, to: 3, at: 2 }
      ]
    }
    const merged = mergeSnapshot(reading, copy, 'merge')
    expect(merged.mangaEntries.find((e) => e.mangaId === 9)?.status).toBe('watching')
    expect(merged.mangaEntries).toHaveLength(2)
    expect(merged.reads).toHaveLength(2)
    // Une copie d'avant le suivi de lecture ne touche pas aux mangas en fusion…
    expect(mergeSnapshot(reading, { entries: [] }, 'merge').mangaEntries).toHaveLength(1)
    // …et l'aperçu d'un remplacement dit qu'ils partent.
    const p = previewRestore(reading, mergeSnapshot(reading, { entries: [] }, 'replace'), 'replace')
    expect(p.mangas).toEqual({ before: 1, after: 0 })
  })

  it('garde deux passages du même épisode', () => {
    const after = mergeSnapshot(current, { entries: [], history: [ev(1, 1, 1)] }, 'merge')
    expect(after.history).toHaveLength(4)
  })
})

describe('previewRestore', () => {
  it('annonce ce que la fusion apporte', () => {
    const p = previewRestore(current, mergeSnapshot(current, backup, 'merge'), 'merge')
    expect(p.added.map((s) => s.title)).toEqual(['Dandadan'])
    expect(p.removed).toEqual([])
    expect(p.changed).toEqual([])
    expect(p.episodes).toMatchObject({ before: 3, after: 4, gained: 1, lost: 0 })
    expect(p.identical).toBe(false)
  })

  it('annonce ce que le remplacement retire', () => {
    const p = previewRestore(current, mergeSnapshot(current, backup, 'replace'), 'replace')
    expect(p.removed.map((s) => s.title)).toEqual(['Mob Psycho'])
    expect(p.changed).toEqual([{ id: 1, title: 'Frieren', from: 'watching', to: 'paused' }])
    expect(p.episodes).toMatchObject({ gained: 1, lost: 2 })
  })

  it('dit quand la copie n’apporte rien', () => {
    const p = previewRestore(current, mergeSnapshot(current, current, 'merge'), 'merge')
    expect(p.identical).toBe(true)
  })
})

describe('isSnapshot', () => {
  it('reconnaît une sauvegarde et refuse le reste', () => {
    expect(isSnapshot({ entries: [], history: [] })).toBe(true)
    expect(isSnapshot({ entries: {} })).toBe(false)
    expect(isSnapshot(null)).toBe(false)
    expect(isSnapshot({ entries: [], history: 'x' })).toBe(false)
  })
})
