import { describe, expect, it } from 'vitest'
import { bestMatches, isReliable, verdictOf, type RawMatch } from './identify'

const match = (anilist: number, similarity: number, episode: number | null = 1): RawMatch => ({
  anilist,
  episode,
  from: 100,
  to: 104,
  similarity,
  image: 'https://api.trace.moe/image/x'
})

describe('isReliable', () => {
  it('suit le seuil recommandé par trace.moe', () => {
    expect(isReliable(0.95)).toBe(true)
    expect(isReliable(0.87)).toBe(true)
    expect(isReliable(0.86)).toBe(false)
    expect(isReliable(0.52)).toBe(false)
  })
})

describe('bestMatches', () => {
  it('ne garde que la meilleure scène de chaque série', () => {
    const kept = bestMatches([match(1, 0.99), match(1, 0.91), match(2, 0.93)])
    expect(kept.map((m) => [m.anilist, m.similarity])).toEqual([
      [1, 0.99],
      [2, 0.93]
    ])
  })

  it('classe du plus proche au plus lointain', () => {
    expect(bestMatches([match(1, 0.7), match(2, 0.95), match(3, 0.8)]).map((m) => m.anilist)).toEqual([2, 3, 1])
  })

  // Le vrai comportement de l'API : une image quelconque reçoit quand même dix
  // réponses, toutes autour de 0,5. Les montrer serait affirmer n'importe quoi.
  it('jette le bruit que l’API rend toujours', () => {
    expect(bestMatches([match(1, 0.52), match(2, 0.48), match(3, 0.51)])).toEqual([])
  })

  it('borne la liste', () => {
    const many = Array.from({ length: 12 }, (_, i) => match(i, 0.9))
    expect(bestMatches(many)).toHaveLength(6)
    expect(bestMatches(many, 3)).toHaveLength(3)
  })

  it('ignore une similarité absurde', () => {
    expect(bestMatches([match(1, Number.NaN), match(2, 0.9)]).map((m) => m.anilist)).toEqual([2])
  })
})

describe('verdictOf', () => {
  it('distingue les trois seules réponses possibles', () => {
    expect(verdictOf([match(1, 0.98)])).toBe('sure')
    expect(verdictOf([match(1, 0.72)])).toBe('unsure')
    expect(verdictOf([])).toBe('none')
  })

  it('se prononce sur le meilleur candidat, pas sur la liste', () => {
    expect(verdictOf([match(1, 0.95), match(2, 0.61)])).toBe('sure')
  })
})
