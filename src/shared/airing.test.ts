import { describe, expect, it } from 'vitest'
import { canTick, isUnaired } from './airing'

/** Le repère de temps des tests : tout se lit par rapport à lui. */
const NOW = 1_700_000_000_000
const HOUR = 3_600_000

/**
 * Une série dont le prochain épisode paraît dans une heure.
 *
 * L'heure compte autant que le numéro depuis qu'AniList a été pris à laisser
 * sa grille en retard : une date par défaut dans le passé rendrait chaque test
 * d'ici muet sur ce qu'il croit vérifier.
 */
const airing = (
  episode: number,
  airingAt = (NOW + HOUR) / 1000
): { nextAiring: { episode: number; airingAt: number } } => ({
  nextAiring: { episode, airingAt }
})

/** La même, mais l'épisode annoncé est sorti il y a huit heures. */
const late = (episode: number) => airing(episode, (NOW - 8 * HOUR) / 1000)

describe('isUnaired', () => {
  it('retient le prochain épisode et tous ceux d’après', () => {
    expect(isUnaired(airing(12), 12, NOW)).toBe(true)
    expect(isUnaired(airing(12), 13, NOW)).toBe(true)
  })

  it('laisse passer ceux qui sont sortis', () => {
    expect(isUnaired(airing(12), 11, NOW)).toBe(false)
    expect(isUnaired(airing(12), 1, NOW)).toBe(false)
  })

  /**
   * Le cas Tomb Raider King : l'épisode 9 était disponible partout, et AniList
   * le donnait encore comme « prochain » huit heures après son heure. Juger au
   * numéro seul le verrouillait alors qu'il était sorti.
   */
  it('libère l’épisode annoncé une fois son heure passée', () => {
    expect(isUnaired(late(9), 9, NOW)).toBe(false)
  })

  // Une grille en retard ne dit rien de la suite : l'épisode d'après garde sa
  // porte fermée, faute de la moindre date le concernant.
  it('retient quand même les suivants', () => {
    expect(isUnaired(late(9), 10, NOW)).toBe(true)
  })

  // Une série finie n'annonce plus rien : bloquer sur ce silence empêcherait
  // de cocher quoi que ce soit.
  it('ne retient rien sans date annoncée', () => {
    expect(isUnaired({ nextAiring: null }, 999)).toBe(false)
  })
})

describe('canTick', () => {
  it('refuse de cocher un épisode à venir', () => {
    expect(canTick(airing(9), 9, false, NOW)).toBe(false)
    expect(canTick(airing(9), 12, false, NOW)).toBe(false)
  })

  it('laisse cocher ce qui est sorti', () => {
    expect(canTick(airing(9), 8, false, NOW)).toBe(true)
    expect(canTick(late(9), 9, false, NOW)).toBe(true)
  })

  // Sinon une coche arrivée par un import, ou par une diffusion repoussée
  // après coup, resterait impossible à retirer.
  it('laisse toujours décocher, même un épisode à venir', () => {
    expect(canTick(airing(9), 9, true, NOW)).toBe(true)
  })
})
