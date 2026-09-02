import { describe, expect, it } from 'vitest'
import {
  cleanUsername,
  fuzzyDate,
  isoDate,
  scoreFromTwenty,
  scoreOutOfTen,
  statusFromAniList,
  statusFromKitsu,
  watchedCount
} from './import-list'

describe('statusFromAniList', () => {
  it('traduit les cinq listes', () => {
    expect(statusFromAniList('CURRENT')).toBe('watching')
    expect(statusFromAniList('PLANNING')).toBe('planned')
    expect(statusFromAniList('COMPLETED')).toBe('completed')
    expect(statusFromAniList('PAUSED')).toBe('paused')
    expect(statusFromAniList('DROPPED')).toBe('dropped')
  })

  // Un revisionnage en cours est un visionnage en cours : le ranger ailleurs
  // sortirait la série de « Continuer » alors qu'on est en train de la revoir.
  it('traite un revisionnage comme une série en cours', () => {
    expect(statusFromAniList('REPEATING')).toBe('watching')
  })

  it('n’invente rien pour une valeur inconnue', () => {
    expect(statusFromAniList('MYSTERE')).toBe(null)
    expect(statusFromAniList('')).toBe(null)
    expect(statusFromAniList(null)).toBe(null)
  })
})

describe('statusFromKitsu', () => {
  it('traduit les cinq listes, avec leurs mots à eux', () => {
    expect(statusFromKitsu('current')).toBe('watching')
    expect(statusFromKitsu('planned')).toBe('planned')
    expect(statusFromKitsu('completed')).toBe('completed')
    expect(statusFromKitsu('on_hold')).toBe('paused')
    expect(statusFromKitsu('dropped')).toBe('dropped')
  })

  it('n’invente rien non plus', () => {
    expect(statusFromKitsu('en_cours')).toBe(null)
  })
})

describe('fuzzyDate', () => {
  it('assemble ce qui est connu', () => {
    expect(fuzzyDate({ year: 2024, month: 3, day: 15 })).toBe(Date.UTC(2024, 2, 15))
  })

  it('complète une date partielle par son premier jour', () => {
    expect(fuzzyDate({ year: 2019, month: null, day: null })).toBe(Date.UTC(2019, 0, 1))
    expect(fuzzyDate({ year: 2019, month: 6, day: null })).toBe(Date.UTC(2019, 5, 1))
  })

  it('rend null sans année', () => {
    expect(fuzzyDate({ year: null, month: 6, day: 2 })).toBe(null)
    expect(fuzzyDate(null)).toBe(null)
  })
})

describe('isoDate', () => {
  it('lit une date ISO et refuse le reste', () => {
    expect(isoDate('2017-09-15T16:07:56.861Z')).toBe(Date.parse('2017-09-15T16:07:56.861Z'))
    expect(isoDate('pas une date')).toBe(null)
    expect(isoDate(null)).toBe(null)
  })
})

describe('les notes', () => {
  it('ramène le vingt de Kitsu sur dix, sans tirer vers le bas', () => {
    expect(scoreFromTwenty(20)).toBe(10)
    expect(scoreFromTwenty(15)).toBe(8)
    expect(scoreFromTwenty(2)).toBe(1)
  })

  it('traite une absence de note comme une absence', () => {
    expect(scoreFromTwenty(null)).toBe(null)
    expect(scoreFromTwenty(0)).toBe(null)
    expect(scoreOutOfTen(0)).toBe(null)
  })

  it('garde une note sur dix telle quelle', () => {
    expect(scoreOutOfTen(8)).toBe(8)
    expect(scoreOutOfTen(11)).toBe(10)
  })
})

describe('watchedCount', () => {
  it('compte ce qui a été vu', () => {
    expect(watchedCount(12, 12)).toBe(12)
    expect(watchedCount(0, 12)).toBe(0)
  })

  // Sinon l'import fabrique des épisodes qui n'existent pas, et le temps de
  // visionnage reste faux pour toujours.
  it('ne dépasse jamais le nombre réel d’épisodes', () => {
    expect(watchedCount(30, 24)).toBe(24)
  })

  it('fait confiance à la progression quand le total est inconnu', () => {
    expect(watchedCount(30, null)).toBe(30)
    expect(watchedCount(30, 0)).toBe(30)
  })
})

describe('cleanUsername', () => {
  it('accepte un pseudo, et aussi l’adresse collée à sa place', () => {
    expect(cleanUsername('  Migoto ')).toBe('Migoto')
    expect(cleanUsername('https://anilist.co/user/Migoto/')).toBe('Migoto')
    expect(cleanUsername('https://kitsu.app/users/vikhyat')).toBe('vikhyat')
  })
})
