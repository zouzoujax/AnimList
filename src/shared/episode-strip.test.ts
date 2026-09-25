import { describe, expect, it } from 'vitest'
import { episodeStrip, STRIP_MAX } from './episode-strip'

describe('episodeStrip', () => {
  it('dit vu, sorti sans toi, à venir', () => {
    expect(episodeStrip(new Set([1, 2, 4]), 6, 5)).toBe('ssasau')
  })

  it('sans total, va jusqu’au prochain épisode programmé', () => {
    expect(episodeStrip(new Set([1]), null, 3)).toBe('saau')
  })

  it('garde un épisode vu au-delà de ce qu’on croyait diffusé', () => {
    expect(episodeStrip(new Set([1, 2, 3, 4]), null, 2)).toBe('ssss')
  })

  it('reste bornée', () => {
    expect(episodeStrip(new Set(), 1200, 1200)).toHaveLength(STRIP_MAX)
  })

  it('sans rien savoir, annonce au moins un épisode à venir', () => {
    expect(episodeStrip(undefined, null, 0)).toBe('u')
  })
})
