import { describe, expect, it } from 'vitest'
import {
  MIN_DURATION_S,
  OFFER_RATIO,
  playable,
  SEEN_RATIO,
  shouldAdvance,
  shouldOfferNext,
  shouldTick,
  watchedRatio,
  type Playing
} from './binge'

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

describe('watchedRatio', () => {
  const lit = (position: number, duration = 1440): Playing => ({ position, duration, playing: true })

  it('rend la fraction lue', () => {
    expect(watchedRatio(lit(720))).toBeCloseTo(0.5)
    expect(watchedRatio(lit(0))).toBe(0)
  })

  // La même mesure que la coche : à 90 %, les deux doivent basculer ensemble.
  it('s’accorde avec le seuil de la coche', () => {
    const juste = lit(1440 * SEEN_RATIO)
    expect(watchedRatio(juste)).toBeCloseTo(SEEN_RATIO)
    expect(shouldTick(juste, false)).toBe(true)
  })

  it('ne dépasse jamais un', () => {
    expect(watchedRatio(lit(1441))).toBe(1)
  })

  // Mieux vaut ne rien montrer qu'un remplissage inventé.
  it('rend zéro quand rien n’est mesurable', () => {
    expect(watchedRatio(lit(60, 30))).toBe(0)
    expect(watchedRatio({ position: NaN, duration: 1440, playing: true })).toBe(0)

    expect(watchedRatio(lit(700, 0))).toBe(0)
  })
})

/**
 * Proposer n'est ni cocher ni enchaîner : le bouton se montre plus tard que la
 * coche, et bien plus tôt que le départ automatique. Trois seuils pour trois
 * questions, et c'est ce que ce bloc tient en place.
 */
describe('shouldOfferNext', () => {
  // Quatre-vingt-douze pour cent de vingt-quatre minutes : 1324,8 secondes.
  it('attend que le générique de fin soit bien engagé', () => {
    expect(shouldOfferNext(at(1324))).toBe(false)
    expect(shouldOfferNext(at(1325))).toBe(true)
  })

  it('se montre après la coche, et bien avant le départ automatique', () => {
    expect(OFFER_RATIO).toBeGreaterThan(SEEN_RATIO)
    // L'épisode est déjà coché depuis une demi-minute quand le bouton paraît,
    // et le départ automatique attendra encore près de deux minutes.
    const juste = at(1325)
    expect(shouldTick(juste, false)).toBe(true)
    expect(shouldOfferNext(juste)).toBe(true)
    expect(shouldAdvance(juste)).toBe(false)
  })

  it('se propose aussi sur un épisode en pause', () => {
    // Mis en pause dans le générique : c'est justement le moment où on prend
    // son téléphone. La suite se propose, contrairement au départ automatique.
    const pause = at(1400, { playing: false })
    expect(shouldOfferNext(pause)).toBe(true)
    expect(shouldAdvance(pause)).toBe(false)
  })

  it('ne propose rien sur ce qui n’est pas un épisode', () => {
    expect(shouldOfferNext(at(110, { duration: MIN_DURATION_S - 1 }))).toBe(false)
    expect(shouldOfferNext(at(0, { duration: 0 }))).toBe(false)
  })
})
