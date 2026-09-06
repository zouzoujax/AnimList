import { describe, expect, it } from 'vitest'
import { buildSession, DEFAULT_EVENING, MAX_EVENING, MIN_EVENING, rank, usualEvening, type Candidate } from './soiree'

const DAY = 86_400_000
const now = new Date(2026, 8, 6, 21, 0, 0).getTime()

function serie(over: Partial<Candidate> & { animeId: number }): Candidate {
  return {
    title: `Série ${over.animeId}`,
    episodes: [1, 2, 3, 4, 5, 6],
    minutes: 24,
    airing: false,
    lastWatchedAt: 0,
    ...over
  }
}

const numbers = (c: ReturnType<typeof buildSession>): string[] => c.slots.map((s) => `${s.animeId}:${s.episode}`)

describe('usualEvening', () => {
  it('rend la valeur par défaut sans historique', () => {
    expect(usualEvening([], now)).toBe(DEFAULT_EVENING)
  })

  // La médiane, pas la moyenne : un week-end de douze heures ne décide pas des mardis.
  it('prend la médiane des journées, pas leur moyenne', () => {
    const events = [
      { at: now - 1 * DAY, minutes: 48 },
      { at: now - 2 * DAY, minutes: 48 },
      { at: now - 3 * DAY, minutes: 720 }
    ]
    expect(usualEvening(events, now)).toBe(48)
  })

  it('additionne les épisodes d’une même journée', () => {
    const jour = new Date(2026, 8, 4, 20, 0, 0).getTime()
    const events = [
      { at: jour, minutes: 24 },
      { at: jour + 3600_000, minutes: 24 },
      { at: jour + 7200_000, minutes: 24 }
    ]
    expect(usualEvening(events, now)).toBe(72)
  })

  // Elles portent la date d'une coche dans une autre app, pas celle d'un visionnage.
  it('écarte les lignes importées', () => {
    const events = [
      { at: now - 1 * DAY, minutes: 24 },
      { at: now - 1 * DAY, minutes: 600, imported: true }
    ]
    expect(usualEvening(events, now)).toBe(24)
  })

  it('ignore ce qui sort de la fenêtre', () => {
    const events = [
      { at: now - 1 * DAY, minutes: 50 },
      { at: now - 400 * DAY, minutes: 600 }
    ]
    expect(usualEvening(events, now)).toBe(50)
  })

  it('borne des deux côtés', () => {
    expect(usualEvening([{ at: now - DAY, minutes: 4 }], now)).toBe(MIN_EVENING)
    expect(usualEvening([{ at: now - DAY, minutes: 900 }], now)).toBe(MAX_EVENING)
  })
})

describe('rank', () => {
  // Ce sont les seules qui grossissent pendant qu'on regarde ailleurs.
  it('met devant ce qui est en diffusion et en retard', () => {
    const binge = serie({ animeId: 1, lastWatchedAt: now - 3600_000 })
    const weekly = serie({ animeId: 2, airing: true, episodes: [7], lastWatchedAt: now - 30 * DAY })
    expect(rank([binge, weekly]).map((c) => c.animeId)).toEqual([2, 1])
  })

  it('classe ensuite par fraîcheur', () => {
    const vieux = serie({ animeId: 1, lastWatchedAt: now - 90 * DAY })
    const frais = serie({ animeId: 2, lastWatchedAt: now - DAY })
    expect(rank([vieux, frais]).map((c) => c.animeId)).toEqual([2, 1])
  })

  it('écarte ce qui n’a rien à proposer', () => {
    const vide = serie({ animeId: 1, episodes: [] })
    const sansDuree = serie({ animeId: 2, minutes: 0 })
    const bon = serie({ animeId: 3 })
    expect(rank([vide, sansDuree, bon]).map((c) => c.animeId)).toEqual([3])
  })

  // Commencer une série est un engagement : elle ne double pas celles qu'on suit.
  it('laisse derrière une série en diffusion jamais ouverte', () => {
    const jamais = serie({ animeId: 1, airing: true, lastWatchedAt: 0 })
    const suivie = serie({ animeId: 2, airing: false, lastWatchedAt: now - 30 * DAY })
    expect(rank([jamais, suivie]).map((c) => c.animeId)).toEqual([2, 1])
  })

  it('ne modifie pas la liste reçue', () => {
    const list = [serie({ animeId: 1, lastWatchedAt: 0 }), serie({ animeId: 2, lastWatchedAt: now })]
    rank(list)
    expect(list.map((c) => c.animeId)).toEqual([1, 2])
  })
})

describe('buildSession', () => {
  it('enchaîne les épisodes d’une même série', () => {
    const s = buildSession([serie({ animeId: 1 })], 120)
    expect(numbers(s)).toEqual(['1:1', '1:2', '1:3', '1:4', '1:5'])
    expect(s.minutes).toBe(120)
  })

  it('tient dans une demi-heure', () => {
    const s = buildSession([serie({ animeId: 1 })], 30)
    expect(numbers(s)).toEqual(['1:1'])
    expect(s.minutes).toBe(24)
  })

  // 48 est à 12 de la cible, 72 aussi : à égalité on reste en dessous.
  it('reste en dessous quand le débordement ne rapproche pas', () => {
    const s = buildSession([serie({ animeId: 1 })], 60)
    expect(s.minutes).toBe(48)
  })

  it('déborde d’un épisode quand il remplit plus qu’il ne dépasse', () => {
    const s = buildSession([serie({ animeId: 1 })], 70)
    expect(s.minutes).toBe(72)
    expect(s.slots).toHaveLength(3)
  })

  it('ne déborde jamais deux fois', () => {
    const s = buildSession([serie({ animeId: 1, minutes: 10 })], 26)
    expect(s.minutes).toBe(30)
    expect(s.slots).toHaveLength(3)
  })

  // 20 et 30 sont à 5 de la cible : l'égalité reste en dessous.
  it('refuse le débordement à égalité', () => {
    expect(buildSession([serie({ animeId: 1, minutes: 10 })], 25).minutes).toBe(20)
  })

  // Un film de deux heures n'a rien à faire dans une demi-heure ; une série courte, si.
  it('passe un format trop long pour prendre un format court', () => {
    const film = serie({ animeId: 1, minutes: 120, episodes: [1], lastWatchedAt: now })
    const court = serie({ animeId: 2, minutes: 24, lastWatchedAt: now - DAY })
    expect(numbers(buildSession([film, court], 30))).toEqual(['2:1'])
  })

  it('rend une soirée vide plutôt que d’imposer un film', () => {
    const film = serie({ animeId: 1, minutes: 120, episodes: [1] })
    const s = buildSession([film], 30)
    expect(s.slots).toEqual([])
    expect(s.minutes).toBe(0)
  })

  it('mélange deux séries quand la première est épuisée', () => {
    const une = serie({ animeId: 1, episodes: [5], airing: true, lastWatchedAt: now - 2 * DAY })
    const deux = serie({ animeId: 2, lastWatchedAt: now - 10 * DAY })
    expect(numbers(buildSession([une, deux], 96))).toEqual(['1:5', '2:1', '2:2', '2:3'])
  })

  it('dit pourquoi chaque épisode est là', () => {
    const late = serie({ animeId: 1, airing: true, episodes: [9, 10], lastWatchedAt: now - 7 * DAY })
    const reprise = serie({ animeId: 2, lastWatchedAt: now - DAY })
    const neuve = serie({ animeId: 3 })
    const s = buildSession([late, reprise, neuve], 250)
    const par = new Map(s.slots.map((x) => [`${x.animeId}:${x.episode}`, x.reason]))
    expect(par.get('1:9')).toBe('retard')
    expect(par.get('1:10')).toBe('suite')
    expect(par.get('2:1')).toBe('reprise')
    expect(par.get('3:1')).toBe('decouverte')
  })

  it('n’annonce pas un retard sur une série jamais ouverte', () => {
    const neuve = serie({ animeId: 1, airing: true, lastWatchedAt: 0 })
    expect(buildSession([neuve], 30).slots[0].reason).toBe('decouverte')
  })

  it('ne propose rien sans candidat', () => {
    expect(buildSession([], 120).slots).toEqual([])
  })

  it('garde le budget demandé dans sa réponse', () => {
    expect(buildSession([serie({ animeId: 1 })], 90).budget).toBe(90)
  })
})
