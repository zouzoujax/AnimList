import { describe, expect, it } from 'vitest'
import { batches, deeplHost, fingerprint, worthTranslating } from './translate'

describe('deeplHost', () => {
  // Le suffixe est le seul indice, et une clé gratuite envoyée à l'hôte payant
  // reçoit une erreur d'authentification qui n'explique rien.
  it('envoie une clé gratuite sur l’hôte gratuit', () => {
    expect(deeplHost('abcdef-1234:fx')).toBe('https://api-free.deepl.com')
    expect(deeplHost('  abcdef-1234:fx  ')).toBe('https://api-free.deepl.com')
  })

  it('envoie une clé payante sur l’hôte payant', () => {
    expect(deeplHost('abcdef-1234')).toBe('https://api.deepl.com')
  })
})

describe('worthTranslating', () => {
  it('accepte un vrai texte', () => {
    expect(worthTranslating('A young hero sets out.')).toBe(true)
  })

  it('écarte ce qui n’a rien à traduire', () => {
    expect(worthTranslating('')).toBe(false)
    expect(worthTranslating('   ')).toBe(false)
    expect(worthTranslating('—')).toBe(false)
    expect(worthTranslating(null)).toBe(false)
    expect(worthTranslating(undefined)).toBe(false)
  })
})

describe('batches', () => {
  it('regroupe tant que ça tient', () => {
    expect(batches(['aa', 'bb', 'cc'], 100, 50)).toEqual([['aa', 'bb', 'cc']])
  })

  it('coupe quand le poids dépasse', () => {
    expect(batches(['aaaa', 'bbbb', 'cccc'], 8, 50)).toEqual([['aaaa', 'bbbb'], ['cccc']])
  })

  it('coupe aussi sur le nombre, que l’API impose', () => {
    expect(batches(['a', 'b', 'c'], 1000, 2)).toEqual([['a', 'b'], ['c']])
  })

  // Le tronquer rendrait une phrase coupée en plein milieu.
  it('laisse partir seul un texte plus gros que le plafond', () => {
    const huge = 'x'.repeat(50)
    expect(batches(['aa', huge], 10, 50)).toEqual([['aa'], [huge]])
  })

  it('ne rend rien pour rien', () => {
    expect(batches([])).toEqual([])
  })
})

describe('fingerprint', () => {
  it('rend la même clé pour le même texte', () => {
    expect(fingerprint('Bonjour')).toBe(fingerprint('Bonjour'))
  })

  it('sépare deux textes différents', () => {
    expect(fingerprint('Bonjour')).not.toBe(fingerprint('Bonsoir'))
    expect(fingerprint('ab')).not.toBe(fingerprint('ba'))
  })

  // Un résumé corrigé chez AniList doit se retraduire tout seul.
  it('change dès que le texte change, même d’un caractère', () => {
    expect(fingerprint('Un texte.')).not.toBe(fingerprint('Un texte'))
  })

  it('reste court', () => {
    expect(fingerprint('x'.repeat(5000)).length).toBeLessThan(32)
  })
})
