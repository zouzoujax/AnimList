import { describe, expect, it } from 'vitest'
import { INTRO_MS, INTRO_REDUCED_MS, MOTE_COUNT, motes } from './intro'

describe('les durées', () => {
  it('restent en dessous de trois secondes', () => {
    // Un péage traversé à chaque lancement : au-delà, on le subit.
    expect(INTRO_MS).toBeLessThanOrEqual(3000)
    expect(INTRO_REDUCED_MS).toBeLessThan(INTRO_MS)
  })

  // Zéro voudrait dire que la marque n'a pas le droit de se présenter.
  it('laissent sa place à la version sans mouvement', () => {
    expect(INTRO_REDUCED_MS).toBeGreaterThan(400)
  })
})

describe('motes', () => {
  it('rend le nombre demandé', () => {
    expect(motes()).toHaveLength(MOTE_COUNT)
    expect(motes(5)).toHaveLength(5)
    expect(motes(0)).toEqual([])
  })

  // Tout l'intérêt d'une graine : un ciel qui ne se réarrange pas à chaque
  // redessin de React.
  it('rend la même poussière pour la même graine', () => {
    expect(motes(12, 42)).toEqual(motes(12, 42))
  })

  it('en rend une autre pour une autre graine', () => {
    expect(motes(12, 42)).not.toEqual(motes(12, 43))
  })

  // Un grain derrière la marque ne se voit pas et brouille le halo.
  it('laisse le centre libre', () => {
    for (const m of motes(80, 3)) {
      const d = Math.hypot(m.x - 0.5, m.y - 0.5)
      expect(d).toBeGreaterThanOrEqual(0.32)
    }
  })

  it('reste dans l’écran', () => {
    for (const m of motes(80, 3)) {
      expect(m.x).toBeGreaterThan(0)
      expect(m.x).toBeLessThan(1)
      expect(m.y).toBeGreaterThan(0)
      expect(m.y).toBeLessThan(1)
    }
  })

  it('donne des grains visibles et des retards courts', () => {
    for (const m of motes(40, 9)) {
      expect(m.size).toBeGreaterThanOrEqual(2)
      expect(m.size).toBeLessThanOrEqual(6)
      // Un grain qui arrive après la sortie n'aurait jamais été vu.
      expect(m.delay * 1000).toBeLessThan(INTRO_MS)
      expect(m.drift).toBeGreaterThan(0)
    }
  })
})
