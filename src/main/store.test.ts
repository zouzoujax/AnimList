import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Media, Snapshot } from '@shared/types'
import {
  cacheMedia,
  clearWatched,
  flush,
  getFolder,
  getPrefs,
  getWatchLang,
  importSnapshot,
  initStore,
  removeEntry,
  resetAll,
  setEntry,
  setPrefs,
  setFolder,
  setWatchLang,
  setWatched,
  setWatchedUpTo,
  snapshot,
  startRewatch,
  updateEvent,
  isTracked,
  cacheMangas,
  removeMangaEntry,
  setMangaChapter,
  advanceManga,
  setMangaEntry,
  startReread
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

  // Le défaut qui faussait « Ces 7 jours » : décocher puis recocher redatait
  // d'aujourd'hui un épisode vu le mois dernier, et le compteur le comptait neuf.
  it('rend sa date à un épisode recoché', () => {
    cacheMedia([media(1, 12)])
    setWatched(1, 3, true)
    const veille = Date.now() - 30 * 86_400_000
    updateEvent({ animeId: 1, episode: 3, pass: 0 }, { at: veille, note: 'la scène du train' })

    setWatched(1, 3, false)
    setWatched(1, 3, true)

    const back = snapshot().history.find((h) => h.animeId === 1 && h.episode === 3)
    expect(back?.at).toBe(veille)
    expect(back?.note).toBe('la scène du train')
  })

  it('date d’aujourd’hui un épisode jamais coché', () => {
    cacheMedia([media(1, 12)])
    setWatched(1, 4, true)
    expect(snapshot().history[0].at).toBeGreaterThan(Date.now() - 5000)
  })

  // Sinon un vrai second visionnage hériterait de la date du premier.
  it('ne rend rien à une autre passe', () => {
    cacheMedia([media(1, 1)])
    setWatched(1, 1, true)
    updateEvent({ animeId: 1, episode: 1, pass: 0 }, { at: Date.now() - 30 * 86_400_000 })
    setWatched(1, 1, false)

    // Le souvenir du décochage porte sur la passe 0 ; la passe 1 ne doit pas y toucher.
    startRewatch(1)
    setWatched(1, 1, true)

    const seconde = snapshot().history.find((h) => h.animeId === 1 && h.pass === 1)
    expect(seconde?.at).toBeGreaterThan(Date.now() - 5000)
  })

  it('rend leurs dates après un effacement complet', () => {
    cacheMedia([media(1, 12)])
    setWatchedUpTo(1, 3)
    const vieux = Date.now() - 60 * 86_400_000
    for (const episode of [1, 2, 3]) updateEvent({ animeId: 1, episode, pass: 0 }, { at: vieux })

    clearWatched(1)
    setWatchedUpTo(1, 3)

    expect(snapshot().history.filter((h) => h.animeId === 1 && h.at === vieux)).toHaveLength(3)
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

// Une série cochée jusqu'au bout avant que son total soit connu restait « en
// cours » à vie : la décision n'était prise qu'au moment de cocher.
describe('a total arriving late still finishes the series', () => {
  it('completes the entry when the episode count shows up', () => {
    setEntry(1, { status: 'planned' }, media(1, null))
    setWatchedUpTo(1, 25)
    expect(entryOf(1)?.status).toBe('watching')

    cacheMedia([media(1, 25)])
    expect(entryOf(1)?.status).toBe('completed')
  })

  it('dates the end on the last episode, not on the catch-up', () => {
    setEntry(1, { status: 'planned' }, media(1, null))
    setWatchedUpTo(1, 25)
    const seen = snapshot().history.filter((h) => h.animeId === 1)
    const last = Math.max(...seen.map((h) => h.at))

    cacheMedia([media(1, 25)])
    expect(entryOf(1)?.finishedAt).toBe(last)
  })

  it('leaves a shorter total alone', () => {
    setEntry(1, { status: 'planned' }, media(1, null))
    setWatchedUpTo(1, 10)
    cacheMedia([media(1, 25)])
    expect(entryOf(1)?.status).toBe('watching')
  })

  it('still respects a dropped status', () => {
    setEntry(1, { status: 'dropped' }, media(1, null))
    setWatchedUpTo(1, 25)
    cacheMedia([media(1, 25)])
    expect(entryOf(1)?.status).toBe('dropped')
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

  it('remplacer garde ce qu’aucune copie ne contient', () => {
    // Dossiers d'épisodes, langues, positions, suivis : propres à ce PC, et
    // absents de toute sauvegarde. Les effacer serait sans retour possible,
    // la copie de sécurité prise avant ne les portant pas non plus.
    setEntry(1, { status: 'watching' }, media(1, 12))
    setFolder(1, 'D:/Animes/Anime 1')
    setWatchLang(1, 'vf')
    importSnapshot(incoming({ entries: [], media: [media(2, 12)] }), 'replace')
    expect(getFolder(1)).toBe('D:/Animes/Anime 1')
    expect(getWatchLang(1)).toBe('vf')
    setFolder(1, null)
    setWatchLang(1, null)
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

describe('une série cochée avant d’être dans la bibliothèque', () => {
  // Le cas qui a mordu : un film d'un épisode, ouvert depuis l'arbre d'une
  // franchise. Coché sans sa fiche, il restait « en cours » pour toujours.
  it('se termine quand sa fiche accompagne la coche', () => {
    setEntry(1, {}, media(1, 1))
    setWatched(1, 1, true)
    expect(entryOf(1)?.status).toBe('completed')
  })

  it('reste en cours sans fiche, faute de connaître son total', () => {
    setWatched(1, 1, true)
    expect(entryOf(1)?.status).toBe('watching')
  })
})

describe('isTracked', () => {
  // Le cas qui a mordu dans l'arbre des franchises : un spin-off ajouté puis
  // retiré restait coloré, parce que sa fiche, elle, reste en cache.
  it('ne compte plus une série retirée, même si sa fiche reste en cache', () => {
    setEntry(1, { status: 'planned' }, media(1, 12))
    expect(isTracked(1)).toBe(true)

    removeEntry(1)
    expect(isTracked(1)).toBe(false)
  })

  it('ne compte pas une fiche jamais ajoutée', () => {
    cacheMedia([media(2, 12)])
    expect(isTracked(2)).toBe(false)
  })
})

describe('lecture des mangas', () => {
  const manga = (id: number, chapters: number | null) =>
    ({ id, title: { romaji: `Manga ${id}`, english: null, native: null }, chapters, volumes: null }) as never

  it('avance, se termine au dernier chapitre et garde un rattrapage hors du jour', () => {
    setMangaEntry(50, { status: 'watching' }, manga(50, 10))
    setMangaChapter(50, 8, true)
    setMangaChapter(50, 10, false)
    const snap = snapshot()
    expect(snap.mangaEntries?.[0]).toMatchObject({ chapter: 10, status: 'completed' })
    expect(snap.reads?.map((r) => [r.from, r.to, r.imported ?? false])).toEqual([
      [0, 8, true],
      [8, 10, false]
    ])
  })

  it('deux appuis rapides sur +1 font deux chapitres', () => {
    setMangaEntry(52, { status: 'watching' }, manga(52, null))
    advanceManga(52, 1)
    advanceManga(52, 1)
    expect(snapshot().mangaEntries?.[0].chapter).toBe(2)
    expect(snapshot().reads).toHaveLength(2)
  })

  it('une relecture repart de zéro sans effacer la précédente, retirer efface tout', () => {
    setMangaEntry(51, { status: 'completed' }, manga(51, 20))
    expect(snapshot().mangaEntries?.[0].chapter).toBe(20)
    startReread(51)
    setMangaChapter(51, 3, false)
    expect(snapshot().mangaEntries?.[0]).toMatchObject({ chapter: 3, rereads: 1, status: 'watching' })
    expect(snapshot().reads).toHaveLength(2)
    removeMangaEntry(51)
    expect(snapshot().mangaEntries).toEqual([])
    expect(snapshot().reads).toEqual([])
  })

  it('une série qui finit de paraître passe « Lu » si on en est au dernier chapitre', () => {
    setMangaEntry(53, { status: 'watching' }, manga(53, null))
    setMangaChapter(53, 120, true)
    setMangaEntry(54, { status: 'dropped' }, manga(54, null))
    setMangaChapter(54, 120, true)
    cacheMangas([manga(53, 120), manga(54, 120)])
    const byId = new Map(snapshot().mangaEntries?.map((e) => [e.mangaId, e]))
    expect(byId.get(53)).toMatchObject({ chapter: 120, status: 'completed' })
    expect(byId.get(53)?.finishedAt).not.toBeNull()
    // Un abandon reste un abandon, même lu jusqu'au bout.
    expect(byId.get(54)?.status).toBe('dropped')
  })
})
