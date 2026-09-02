import { describe, expect, it } from 'vitest'
import { canTick, isUnaired } from './airing'

const airing = (episode: number): { nextAiring: { episode: number; airingAt: number } } => ({
  nextAiring: { episode, airingAt: 0 }
})

describe('isUnaired', () => {
  it('retient le prochain épisode et tous ceux d’après', () => {
    expect(isUnaired(airing(12), 12)).toBe(true)
    expect(isUnaired(airing(12), 13)).toBe(true)
  })

  it('laisse passer ceux qui sont sortis', () => {
    expect(isUnaired(airing(12), 11)).toBe(false)
    expect(isUnaired(airing(12), 1)).toBe(false)
  })

  // Une série finie n'annonce plus rien : bloquer sur ce silence empêcherait
  // de cocher quoi que ce soit.
  it('ne retient rien sans date annoncée', () => {
    expect(isUnaired({ nextAiring: null }, 999)).toBe(false)
  })
})

describe('canTick', () => {
  it('refuse de cocher un épisode à venir', () => {
    expect(canTick(airing(9), 9, false)).toBe(false)
    expect(canTick(airing(9), 12, false)).toBe(false)
  })

  it('laisse cocher ce qui est sorti', () => {
    expect(canTick(airing(9), 8, false)).toBe(true)
  })

  // Sinon une coche arrivée par un import, ou par une diffusion repoussée
  // après coup, resterait impossible à retirer.
  it('laisse toujours décocher, même un épisode à venir', () => {
    expect(canTick(airing(9), 9, true)).toBe(true)
  })
})
