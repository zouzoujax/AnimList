import { describe, expect, it } from 'vitest'
import { originOf, originTitle, ORIGIN_FILTERS, ORIGIN_HINTS, ORIGIN_LABELS } from './origin'

describe('originOf', () => {
  it('reconnaît les trois traditions', () => {
    expect(originOf('JP')).toBe('manga')
    expect(originOf('KR')).toBe('manhwa')
    expect(originOf('CN')).toBe('manhua')
  })

  // Taïwan et Hong Kong publient du manhua : les ranger ailleurs séparerait
  // des séries qui appartiennent à la même tradition.
  it('range Taïwan et Hong Kong avec la Chine', () => {
    expect(originOf('TW')).toBe('manhua')
    expect(originOf('HK')).toBe('manhua')
  })

  // La confusion la plus coûteuse : un light novel japonais annoncé « manga ».
  it('sort les romans avant de regarder le pays', () => {
    expect(originOf('JP', 'LIGHT_NOVEL')).toBe('novel')
    expect(originOf('KR', 'NOVEL')).toBe('novel')
    expect(originOf('JP', 'MANGA')).toBe('manga')
  })

  it('ne prétend rien quand le pays est absent ou inconnu', () => {
    expect(originOf(null)).toBe('other')
    expect(originOf(undefined)).toBe('other')
    expect(originOf('')).toBe('other')
    expect(originOf('US')).toBe('other')
  })

  it('accepte un code en minuscules', () => {
    expect(originOf('kr')).toBe('manhwa')
  })
})

describe('les libellés', () => {
  it('couvrent toutes les origines, étiquette et explication', () => {
    for (const origin of ['manga', 'manhwa', 'manhua', 'novel', 'other'] as const) {
      expect(ORIGIN_LABELS[origin]).toBeTruthy()
      expect(ORIGIN_HINTS[origin]).toBeTruthy()
    }
  })

  it('n’offrent en filtre que ce qu’AniList sait filtrer par pays', () => {
    for (const filter of ORIGIN_FILTERS) expect(originOf(filter.country)).toBe(filter.id)
  })
})

describe('originTitle', () => {
  it('nomme juste quand toutes les œuvres s’accordent', () => {
    expect(originTitle(['manhwa'])).toBe('Le manhwa')
    expect(originTitle(['manga', 'manga'])).toBe('Le manga')
    expect(originTitle(['manhua'])).toBe('Le manhua')
    expect(originTitle(['novel'])).toBe('Le roman')
  })

  // Le cas Solo Leveling : la section s’intitulait « Le manga » sous une série
  // tirée d’un manhwa coréen.
  it('ne dit « manga » que si c’en est un', () => {
    expect(originTitle(['manhwa'])).not.toContain('manga')
  })

  it('reste générique dès que les origines divergent, ou qu’il n’y en a pas', () => {
    expect(originTitle(['manga', 'novel'])).toBe('L’œuvre d’origine')
    expect(originTitle([])).toBe('L’œuvre d’origine')
    expect(originTitle(['other'])).toBe('L’œuvre d’origine')
  })
})
