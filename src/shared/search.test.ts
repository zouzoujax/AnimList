import { describe, expect, it } from 'vitest'
import { aliasesOf, matchScore, parseAliases } from './search'

const jjk = { titles: ['Jujutsu Kaisen', 'Jujutsu Kaisen', null] }
const snk = { titles: ['Shingeki no Kyojin', 'Attack on Titan', null] }
const frieren = { titles: ['Sousou no Frieren', 'Frieren: Beyond Journey’s End', null] }
const rezero = { titles: ['Re:Zero kara Hajimeru Isekai Seikatsu', null, null] }

const catalogue = [jjk, snk, frieren, rezero]
/** Ce que la bibliothèque remonterait pour cette recherche, la meilleure d'abord. */
const found = (needle: string): number[] =>
  catalogue
    .map((c, i) => ({ i, score: matchScore(needle, c) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.i)

describe('matchScore', () => {
  it('ne dit rien sur une recherche vide', () => {
    expect(matchScore('', jjk)).toBe(0)
    expect(matchScore('   ', jjk)).toBe(0)
  })

  it('garde ce qui marchait : accents et ponctuation', () => {
    expect(matchScore('jujutsu kaïsen', jjk)).toBeGreaterThan(0)
    expect(matchScore('rezero', rezero)).toBeGreaterThan(0)
    expect(matchScore('re zero', rezero)).toBeGreaterThan(0)
  })

  it('trouve une abréviation', () => {
    expect(matchScore('jjk', jjk)).toBeGreaterThan(0)
    expect(matchScore('snk', snk)).toBeGreaterThan(0)
    expect(matchScore('fmab', { titles: ['Fullmetal Alchemist: Brotherhood', null, null] })).toBeGreaterThan(0)
  })

  it('ne prend pas trois lettres éparpillées pour une abréviation', () => {
    // « ken » traverse « Jujutsu Kaisen » sans ouvrir un seul mot après le k.
    expect(matchScore('ken', jjk)).toBe(0)
  })

  it('accepte les mots dans le désordre', () => {
    expect(matchScore('kaisen jujutsu', jjk)).toBeGreaterThan(0)
  })

  it('pardonne une faute de frappe', () => {
    expect(matchScore('jujutsu kaisan', jjk)).toBeGreaterThan(0)
    expect(matchScore('frieran', frieren)).toBeGreaterThan(0)
  })

  it('refuse ce qui n’a rien à voir', () => {
    expect(matchScore('pokemon', jjk)).toBe(0)
    expect(matchScore('naruto', frieren)).toBe(0)
  })

  it('range le franc devant l’approximatif', () => {
    // « kaisen » est dans le titre de l'un et une faute de frappe pour personne.
    expect(found('kaisen')[0]).toBe(0)
    expect(matchScore('jujutsu kaisen', jjk)).toBeGreaterThan(matchScore('jujutsu kaisan', jjk))
  })

  it('met le titre exact au-dessus du titre qui contient', () => {
    const exact = matchScore('jujutsu kaisen', jjk)
    const partiel = matchScore('jujutsu', jjk)
    expect(exact).toBeGreaterThan(partiel)
  })

  it('fait passer un surnom devant tout', () => {
    const avec = { ...jjk, aliases: ['JJK'] }
    expect(matchScore('jjk', avec)).toBe(100)
    expect(matchScore('jjk', avec)).toBeGreaterThan(matchScore('jjk', jjk))
  })

  it('un surnom ne déteint pas sur les autres séries', () => {
    expect(matchScore('mon truc', { ...snk, aliases: ['mon truc'] })).toBe(100)
    expect(matchScore('mon truc', jjk)).toBe(0)
  })

  it('ne prend pas deux lettres pour une abréviation', () => {
    // Trop court : la moitié du catalogue y répondrait.
    expect(matchScore('jk', jjk)).toBe(0)
  })
})

describe('parseAliases', () => {
  it('découpe sur les virgules et nettoie', () => {
    expect(parseAliases(' jjk , Jujutsu ,, ')).toEqual(['jjk', 'Jujutsu'])
  })

  it('refuse deux fois le même, quelle que soit la casse', () => {
    expect(parseAliases('jjk, JJK')).toEqual(['jjk'])
  })

  it('borne le nombre et la longueur', () => {
    expect(parseAliases('a,b,c,d,e,f,g,h,i,j')).toHaveLength(8)
    expect(parseAliases('x'.repeat(80))[0]).toHaveLength(40)
  })
})

describe('aliasesOf', () => {
  it('rend une liste vide quand il n’y en a pas', () => {
    expect(aliasesOf(undefined, 1)).toEqual([])
    expect(aliasesOf({}, 1)).toEqual([])
    expect(aliasesOf({ '1': ['jjk'] }, 1)).toEqual(['jjk'])
  })
})
