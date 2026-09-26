import { describe, expect, it } from 'vitest'
import { planCatchUp, type CatchUpSeries } from './catch-up'

// Un mercredi à 18 h, heure locale.
const NOW = new Date(2026, 8, 23, 18, 0).getTime()
const DAY = 86_400_000
const at = (days: number, hour = 17): number => new Date(2026, 8, 23 + days, hour, 0).getTime()
const midnight = (days: number): number => new Date(2026, 8, 23 + days).getTime()

const series = (animeId: number, over: Partial<CatchUpSeries> = {}): CatchUpSeries => ({
  animeId,
  title: `Série ${animeId}`,
  behind: [],
  minutes: 24,
  lastWatchedAt: NOW - DAY,
  // Au-delà de la semaine : n'entre pas dans le plan, sauf test contraire.
  next: { episode: 99, at: at(9) },
  ...over
})

const plan = (list: CatchUpSeries[], budget = 48, watchedToday = 0) =>
  planCatchUp(list, { budget, now: NOW, watchedToday })

describe('planCatchUp', () => {
  it('répartit le retard sur les soirs, à la cadence habituelle', () => {
    const p = plan([series(1, { behind: [4, 5, 6, 7, 8] })])
    expect(p.days.map((d) => d.items[0].episodes)).toEqual([[4, 5], [6, 7], [8]])
    expect(p.days[0].day).toBe(midnight(0))
    expect(p.behind).toEqual({ episodes: 5, minutes: 120 })
  })

  it('commence par la série dont le prochain épisode sort le plus tôt', () => {
    const p = plan([
      series(1, { behind: [3, 4], next: { episode: 5, at: at(5) } }),
      series(2, { behind: [7, 8], next: { episode: 9, at: at(1) } })
    ])
    expect(p.days[0].items).toEqual([{ animeId: 2, title: 'Série 2', episodes: [7, 8], minutes: 48 }])
  })

  it('fait entrer un épisode annoncé le jour de sa sortie, pas avant', () => {
    const p = plan([series(1, { behind: [4], next: { episode: 5, at: at(2, 20) } })], 120)
    expect(p.days).toHaveLength(2)
    expect(p.days[0].items[0].episodes).toEqual([4])
    expect(p.days[1]).toMatchObject({ day: midnight(2), items: [{ episodes: [5] }] })
    // À jour vendredi : sortie de la semaine comprise.
    expect(p.doneOn).toBe(midnight(2))
  })

  it('retire de ce soir ce qui a déjà été regardé aujourd’hui', () => {
    const p = plan([series(1, { behind: [4, 5, 6] })], 48, 48)
    expect(p.days[0].day).toBe(midnight(1))
  })

  it('déborde d’un épisode s’il remplit plus qu’il ne dépasse', () => {
    // 64 min de soirée, épisodes de 24 min : deux tiennent, le troisième
    // comble 16 min pour 8 de trop — il passe. À 60 min, il comblerait
    // autant qu'il dépasse : il reste pour le lendemain.
    expect(plan([series(1, { behind: [1, 2, 3, 4] })], 64).days[0].items[0].episodes).toEqual([1, 2, 3])
    expect(plan([series(1, { behind: [1, 2, 3, 4] })], 60).days[0].items[0].episodes).toEqual([1, 2])
  })

  it('dit ce qui ne tient pas dans la semaine', () => {
    const p = plan([series(1, { behind: Array.from({ length: 13 }, (_, i) => i + 1) })], 24)
    expect(p.doneOn).toBeNull()
    expect(p.days).toHaveLength(7)
    expect(p.left).toEqual({ episodes: 6, minutes: 144 })
  })

  it('laisse de côté une série avec plus d’une saison de retard', () => {
    const p = plan([series(1, { behind: Array.from({ length: 14 }, (_, i) => i + 1) }), series(2, { behind: [1] })])
    expect(p.days.flatMap((d) => d.items.map((i) => i.animeId))).toEqual([2])
  })

  it('laisse de côté les séries finies et celles jamais commencées', () => {
    const p = plan([series(1, { behind: [1, 2, 3], next: null }), series(2, { behind: [1, 2, 3], lastWatchedAt: 0 })])
    expect(p.days).toEqual([])
    expect(p.behind.episodes).toBe(0)
  })

  it('ne compte pas deux fois un épisode annoncé qui figure déjà dans le retard', () => {
    // Une fiche pas encore rafraîchie : l'épisode « à venir » est déjà sorti.
    const p = plan([series(1, { behind: [4, 5], next: { episode: 5, at: at(1) } })], 120)
    expect(p.days.flatMap((d) => d.items.flatMap((i) => i.episodes))).toEqual([4, 5])
  })

  it('regroupe les épisodes qui se suivent, et eux seuls', () => {
    const p = plan([series(1, { behind: [2, 3, 5] })], 120)
    expect(p.days[0].items.map((i) => i.episodes)).toEqual([[2, 3], [5]])
  })
})
