import { describe, expect, it } from 'vitest'
import { playable, shouldAdvance, shouldTick, MIN_DURATION_S } from './binge'

/** Un épisode de vingt-quatre minutes, en cours de lecture. */
const at = (
  position: number,
  patch: { duration?: number; playing?: boolean } = {}
): Parameters<typeof shouldTick>[0] => ({
  position,
  duration: 1440,
  playing: true,
  ...patch
})

describe('playable', () => {
  /**
   * Une publicité porte une position et une durée comme un épisode, et sa fin
   * arrive en trente secondes : sans plancher, elle cocherait l'épisode et
   * lancerait le suivant avant même le générique de début.
   */
  it('refuse ce qui est trop court pour être un épisode', () => {
    expect(playable(at(28, { duration: 30 }))).toBe(false)
    expect(playable(at(10, { duration: MIN_DURATION_S }))).toBe(true)
  })

  // Les deux valeurs ne décrivent alors pas la même vidéo : le lecteur vient
  // de changer de source, et la position appartient encore à l'ancienne.
  it('refuse une position au-delà de la durée', () => {
    expect(playable(at(2000))).toBe(false)
  })

  it('refuse ce qui n’est pas un nombre', () => {
    expect(playable(at(Number.NaN))).toBe(false)
    expect(playable(at(100, { duration: Number.POSITIVE_INFINITY }))).toBe(false)
  })
})

describe('shouldTick', () => {
  it('coche aux neuf dixièmes', () => {
    expect(shouldTick(at(1295), false)).toBe(false)
    expect(shouldTick(at(1296), false)).toBe(true)
  })

  it('ne coche pas ce qui l’est déjà', () => {
    expect(shouldTick(at(1400), true)).toBe(false)
  })

  // Le début d'un épisode ne dit rien : ni qu'on le regarde, ni qu'on l'a vu.
  it('ne coche pas sur une lecture à peine commencée', () => {
    expect(shouldTick(at(30), false)).toBe(false)
  })

  it('coche même en pause : la position suffit', () => {
    expect(shouldTick(at(1400, { playing: false }), false)).toBe(true)
  })
})

describe('shouldAdvance', () => {
  it('attend la fin, pas les neuf dixièmes', () => {
    expect(shouldAdvance(at(1300))).toBe(false)
    expect(shouldAdvance(at(1425))).toBe(true)
  })

  /**
   * Le seuil est un temps, pas une fraction : vingt secondes d'un film de deux
   * heures ne représentent que trois millièmes, et une fraction unique
   * enchaînerait un quart d'heure avant la fin.
   */
  it('vaut pareil sur un film que sur un épisode', () => {
    const film = { duration: 7200, playing: true }
    expect(shouldAdvance({ position: 7100, ...film })).toBe(false)
    expect(shouldAdvance({ position: 7185, ...film })).toBe(true)
  })

  // Quelqu'un qui arrête sa lecture dans le générique ne demande pas la suite.
  it('ne prend pas la main sur une pause volontaire', () => {
    expect(shouldAdvance(at(1425, { playing: false }))).toBe(false)
  })

  // Mais un lecteur arrivé au bout se met en pause tout seul, et cet état-là
  // ne s'obtient qu'en ayant laissé l'épisode finir.
  it('enchaîne sur un lecteur arrivé au bout', () => {
    expect(shouldAdvance(at(1440, { playing: false }))).toBe(true)
  })
})
