import { describe, expect, it } from 'vitest'
import {
  AIRING_DAYS,
  summarise,
  TOP_GENRES,
  upcoming,
  type SummaryEntry,
  type SummaryEvent,
  type SummaryMedia
} from './summary'

const DAY = 86_400_000
const now = Date.UTC(2026, 8, 8, 20, 0, 0)

const ev = (animeId: number, at: number, minutes = 24, imported?: boolean): SummaryEvent => ({
  animeId,
  at,
  minutes,
  ...(imported ? { imported } : {})
})

const media = (id: number, over: Partial<SummaryMedia> = {}): SummaryMedia => ({
  id,
  title: `Série ${id}`,
  cover: null,
  episodes: 12,
  genres: [],
  nextAiring: null,
  ...over
})

const carte = (...list: SummaryMedia[]): Map<number, SummaryMedia> => new Map(list.map((m) => [m.id, m]))

describe('summarise', () => {
  it('additionne tout l’historique', () => {
    const s = summarise([ev(1, now - 400 * DAY), ev(1, now - DAY, 47)], [], carte(), now)
    expect(s.episodes).toBe(2)
    expect(s.minutes).toBe(71)
  })

  it('borne la semaine à sept jours', () => {
    const s = summarise([ev(1, now - 8 * DAY), ev(1, now - 6 * DAY), ev(1, now)], [], carte(), now)
    expect(s.episodes).toBe(3)
    expect(s.week.episodes).toBe(2)
    expect(s.week.minutes).toBe(48)
  })

  // Elles portent la date d'une coche dans une autre app, pas d'un visionnage.
  it('écarte les lignes importées de la semaine, sans les perdre du total', () => {
    const s = summarise([ev(1, now, 24), ev(1, now, 600, true)], [], carte(), now)
    expect(s.episodes).toBe(2)
    expect(s.week.episodes).toBe(1)
    expect(s.week.minutes).toBe(24)
  })

  it('compte les fiches par statut', () => {
    const entries: SummaryEntry[] = [
      { animeId: 1, status: 'completed' },
      { animeId: 2, status: 'watching' },
      { animeId: 3, status: 'planned' }
    ]
    const s = summarise([], entries, carte(), now)
    expect(s).toMatchObject({ series: 3, finished: 1, watching: 1 })
  })

  // Trois cents épisodes d'action pèsent plus qu'une comédie lâchée au deuxième.
  it('pèse les genres par épisodes vus, pas par séries', () => {
    const events = [...Array(10)].map(() => ev(1, now)).concat([ev(2, now)])
    const s = summarise(events, [], carte(media(1, { genres: ['Action'] }), media(2, { genres: ['Comédie'] })), now)
    expect(s.genres).toEqual([
      { name: 'Action', count: 10 },
      { name: 'Comédie', count: 1 }
    ])
  })

  it('ne garde qu’une poignée de genres', () => {
    const noms = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const s = summarise([ev(1, now)], [], carte(media(1, { genres: noms })), now)
    expect(s.genres).toHaveLength(TOP_GENRES)
  })

  it('ignore un épisode dont la fiche manque', () => {
    const s = summarise([ev(99, now)], [], carte(), now)
    expect(s.episodes).toBe(1)
    expect(s.genres).toEqual([])
  })

  it('survit à une bibliothèque vide', () => {
    expect(summarise([], [], carte(), now)).toMatchObject({ episodes: 0, minutes: 0, series: 0, genres: [] })
  })
})

describe('upcoming', () => {
  const dans = (jours: number): number => Math.round((now + jours * DAY) / 1000)

  it('range du plus proche au plus lointain', () => {
    const entries: SummaryEntry[] = [
      { animeId: 1, status: 'watching' },
      { animeId: 2, status: 'watching' }
    ]
    const m = carte(
      media(1, { nextAiring: { episode: 5, airingAt: dans(6) } }),
      media(2, { nextAiring: { episode: 2, airingAt: dans(1) } })
    )
    expect(upcoming(entries, m, now).map((a) => a.animeId)).toEqual([2, 1])
  })

  // Le calendrier répond à « qu'est-ce qui sort pour moi ».
  it('ne retient que ce qu’on suit ou qu’on prévoit', () => {
    const entries: SummaryEntry[] = [
      { animeId: 1, status: 'completed' },
      { animeId: 2, status: 'dropped' },
      { animeId: 3, status: 'planned' }
    ]
    const m = carte(
      media(1, { nextAiring: { episode: 1, airingAt: dans(1) } }),
      media(2, { nextAiring: { episode: 1, airingAt: dans(1) } }),
      media(3, { nextAiring: { episode: 1, airingAt: dans(1) } })
    )
    expect(upcoming(entries, m, now).map((a) => a.animeId)).toEqual([3])
  })

  it('laisse dehors ce qui est déjà sorti', () => {
    const entries: SummaryEntry[] = [{ animeId: 1, status: 'watching' }]
    const m = carte(media(1, { nextAiring: { episode: 1, airingAt: dans(-1) } }))
    expect(upcoming(entries, m, now)).toEqual([])
  })

  it('s’arrête au bout de la fenêtre', () => {
    const entries: SummaryEntry[] = [{ animeId: 1, status: 'watching' }]
    const m = carte(media(1, { nextAiring: { episode: 1, airingAt: dans(AIRING_DAYS + 1) } }))
    expect(upcoming(entries, m, now)).toEqual([])
    expect(upcoming(entries, m, now, AIRING_DAYS + 2)).toHaveLength(1)
  })

  it('rend les millisecondes, pas les secondes', () => {
    const entries: SummaryEntry[] = [{ animeId: 1, status: 'watching' }]
    const m = carte(media(1, { nextAiring: { episode: 3, airingAt: dans(2) } }))
    expect(upcoming(entries, m, now)[0].airingAt).toBe(dans(2) * 1000)
  })

  it('ignore une série sans date annoncée', () => {
    const entries: SummaryEntry[] = [{ animeId: 1, status: 'watching' }]
    expect(upcoming(entries, carte(media(1)), now)).toEqual([])
  })
})
