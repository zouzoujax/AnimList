import { describe, expect, it } from 'vitest'
import { activeSkip, LENGTH_TOLERANCE_S, MIN_SKIP_S, parseSkipTimes, usable, type SkipRange } from './skip'

/** La vraie réponse d'AniSkip pour Naruto épisode 1, relevée le 7 septembre 2026. */
const NARUTO = {
  found: true,
  results: [
    { interval: { startTime: 1, endTime: 102 }, skipType: 'op', skipId: 'd400', episodeLength: 1429.2 },
    { interval: { startTime: 1295.974, endTime: 1386.724 }, skipType: 'ed', skipId: '5486', episodeLength: 1416.19 }
  ],
  statusCode: 200
}

const range = (over: Partial<SkipRange> = {}): SkipRange => ({
  kind: 'op',
  start: 30,
  end: 120,
  reference: 1440,
  ...over
})

describe('parseSkipTimes', () => {
  it('lit une vraie réponse', () => {
    expect(parseSkipTimes(NARUTO)).toEqual([
      { kind: 'op', start: 1, end: 102, reference: 1429.2 },
      { kind: 'ed', start: 1295.974, end: 1386.724, reference: 1416.19 }
    ])
  })

  it('ne s’étrangle sur rien', () => {
    for (const rien of [null, undefined, {}, { results: null }, { results: 'non' }, 42]) {
      expect(parseSkipTimes(rien)).toEqual([])
    }
  })

  // Une base ouverte contient ce qu'on y a mis.
  it('écarte les lignes douteuses plutôt que de les corriger', () => {
    const sale = {
      results: [
        { interval: { startTime: 90, endTime: 30 }, skipType: 'op', episodeLength: 1440 },
        { interval: { startTime: -5, endTime: 60 }, skipType: 'op', episodeLength: 1440 },
        { interval: { startTime: 0, endTime: 90 }, skipType: 'mixed-ed', episodeLength: 1440 },
        { interval: {}, skipType: 'op', episodeLength: 1440 },
        { skipType: 'ed', episodeLength: 1440 },
        { interval: { startTime: 10, endTime: 100 }, skipType: 'op', episodeLength: 1440 }
      ]
    }
    expect(parseSkipTimes(sale)).toEqual([{ kind: 'op', start: 10, end: 100, reference: 1440 }])
  })

  it('accepte une durée de référence absente', () => {
    const sans = { results: [{ interval: { startTime: 10, endTime: 100 }, skipType: 'op' }] }
    expect(parseSkipTimes(sans)[0].reference).toBe(0)
  })
})

describe('usable', () => {
  it('accepte un minutage cohérent', () => {
    expect(usable(range(), 1440)).toBe(true)
  })

  // Une autre copie : les secondes ne tombent plus au même endroit.
  it('refuse une durée de référence trop éloignée', () => {
    expect(usable(range({ reference: 1440 }), 1440 - LENGTH_TOLERANCE_S - 1)).toBe(false)
    expect(usable(range({ reference: 1440 }), 1440 - LENGTH_TOLERANCE_S + 1)).toBe(true)
  })

  it('accepte faute de mieux quand la référence manque', () => {
    expect(usable(range({ reference: 0 }), 600)).toBe(true)
  })

  it('refuse un saut trop court pour valoir un bouton', () => {
    expect(usable(range({ start: 30, end: 30 + MIN_SKIP_S - 1 }), 1440)).toBe(false)
    expect(usable(range({ start: 30, end: 30 + MIN_SKIP_S }), 1440)).toBe(true)
  })

  // Un générique qui déborde de l'épisode désigne une autre copie.
  it('refuse un générique plus long que l’épisode', () => {
    expect(usable(range({ start: 10, end: 700 }), 600)).toBe(false)
  })

  it('refuse une durée inconnue', () => {
    expect(usable(range(), 0)).toBe(false)
    expect(usable(range(), NaN)).toBe(false)
  })
})

describe('activeSkip', () => {
  const ranges = parseSkipTimes(NARUTO)

  it('reconnaît l’opening en train de passer', () => {
    expect(activeSkip(ranges, 40, 1440)?.kind).toBe('op')
  })

  it('reconnaît le générique de fin', () => {
    expect(activeSkip(ranges, 1300, 1440)?.kind).toBe('ed')
  })

  it('ne propose rien en dehors', () => {
    expect(activeSkip(ranges, 300, 1440)).toBeNull()
    expect(activeSkip(ranges, 0.5, 1440)).toBeNull()
  })

  // Proposer de sauter là où l'on est déjà ferait clignoter un bouton inutile.
  it('se tait sur la dernière seconde', () => {
    expect(activeSkip(ranges, 101.5, 1440)).toBeNull()
    expect(activeSkip(ranges, 100, 1440)?.kind).toBe('op')
  })

  it('se tait quand la copie ne correspond pas', () => {
    expect(activeSkip(ranges, 40, 3000)).toBeNull()
  })

  it('se tait sans minutage', () => {
    expect(activeSkip([], 40, 1440)).toBeNull()
    expect(activeSkip(ranges, NaN, 1440)).toBeNull()
  })
})
