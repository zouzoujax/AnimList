import { describe, expect, it } from 'vitest'
import { firstInventory, freshBadges, UNKNOWN_DATE, unlockedAt, withUnlocked } from './badge-log'

const NOW = 1790000000000

describe('firstInventory', () => {
  // Une bibliothèque d'avant : tout est déjà gagné, à une date que personne
  // n'a notée.
  it('inscrit tout à la date inconnue', () => {
    expect(firstInventory(['first', 'c10'])).toEqual({ first: UNKNOWN_DATE, c10: UNKNOWN_DATE })
  })

  it('ouvre un registre vide sur une bibliothèque neuve', () => {
    expect(firstInventory([])).toEqual({})
  })
})

describe('freshBadges', () => {
  // Avant l'inventaire, « gagné et pas inscrit » veut dire « gagné il y a
  // longtemps » : rien à fêter, sinon ce serait l'avalanche.
  it('ne trouve rien tant que le registre n’a pas été ouvert', () => {
    expect(freshBadges(['first', 'c10'], null)).toEqual([])
  })

  it('trouve ce qui vient de tomber', () => {
    expect(freshBadges(['first', 'c10'], { first: UNKNOWN_DATE })).toEqual(['c10'])
  })

  it('fête le tout premier badge d’une bibliothèque neuve', () => {
    expect(freshBadges(['first'], {})).toEqual(['first'])
  })

  it('n’a rien à dire quand tout est déjà inscrit', () => {
    expect(freshBadges(['first'], { first: NOW })).toEqual([])
    expect(freshBadges([], {})).toEqual([])
  })

  // Décocher un épisode par erreur ne doit pas effacer une victoire, ni la
  // faire refêter au recochage.
  it('n’oublie jamais un badge repassé sous la barre', () => {
    const log = { first: NOW, c10: NOW }
    expect(freshBadges(['first'], log)).toEqual([])
    expect(freshBadges(['first', 'c10'], log)).toEqual([])
  })
})

describe('withUnlocked', () => {
  it('inscrit à la date du jour', () => {
    expect(withUnlocked({}, ['c10'], NOW)).toEqual({ c10: NOW })
  })

  it('garde la date du premier passage', () => {
    const avant = { first: 1780000000000 }
    expect(withUnlocked(avant, ['first'], NOW)).toEqual(avant)
  })

  it('complète un registre sans toucher au reste', () => {
    expect(withUnlocked({ first: UNKNOWN_DATE }, ['c10', 'c100'], NOW)).toEqual({
      first: UNKNOWN_DATE,
      c10: NOW,
      c100: NOW
    })
  })

  it('retombe sur la date inconnue quand l’horloge ne dit rien', () => {
    expect(withUnlocked({}, ['a'], Number.NaN).a).toBe(UNKNOWN_DATE)
    expect(withUnlocked({}, ['a'], 0).a).toBe(UNKNOWN_DATE)
  })

  it('part d’un registre absent sans se plaindre', () => {
    expect(withUnlocked(null, ['a'], NOW)).toEqual({ a: NOW })
  })
})

describe('unlockedAt', () => {
  it('dit la date, l’inconnue, ou rien', () => {
    expect(unlockedAt('a', { a: NOW })).toBe(NOW)
    expect(unlockedAt('a', { a: UNKNOWN_DATE })).toBe(UNKNOWN_DATE)
    expect(unlockedAt('a', {})).toBeNull()
    expect(unlockedAt('a', null)).toBeNull()
  })
})
