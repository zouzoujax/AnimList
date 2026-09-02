import { describe, expect, it } from 'vitest'
import { makeToken, needsToken, remoteUrl, routeOf, safeEqual, tokenFrom, TOKEN_LENGTH } from './remote'

describe('makeToken', () => {
  it('a la longueur annoncée', () => {
    expect(makeToken(new Uint8Array(32).fill(7))).toHaveLength(TOKEN_LENGTH)
  })

  // Un mot de passe qu'on recopie à la main sur un téléphone : « l » et « 1 »
  // confondus, c'est une tentative ratée qu'on ne comprend pas.
  it('évite les caractères qui se confondent à l’œil', () => {
    const token = makeToken(Uint8Array.from({ length: 32 }, (_, i) => i * 7))
    expect(token).not.toMatch(/[01lioIO]/)
    expect(token).toMatch(/^[a-z2-9]+$/)
  })

  it('change avec la source d’aléa', () => {
    const a = makeToken(Uint8Array.from({ length: 32 }, (_, i) => i))
    const b = makeToken(Uint8Array.from({ length: 32 }, (_, i) => i + 1))
    expect(a).not.toBe(b)
  })

  it('ne casse pas sur une source trop courte', () => {
    expect(makeToken(new Uint8Array(2))).toHaveLength(TOKEN_LENGTH)
  })
})

describe('safeEqual', () => {
  it('reconnaît l’égalité', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
  })

  it('refuse tout le reste', () => {
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'ab')).toBe(false)
    expect(safeEqual('', 'a')).toBe(false)
  })

  it('accepte deux vides', () => {
    expect(safeEqual('', '')).toBe(true)
  })
})

describe('tokenFrom', () => {
  it('lit le paramètre d’adresse', () => {
    expect(tokenFrom('/api/state?t=abc123', null)).toBe('abc123')
  })

  it('préfère l’en-tête, qui ne traîne pas dans l’historique', () => {
    expect(tokenFrom('/api/state?t=abc', 'Bearer xyz')).toBe('xyz')
    expect(tokenFrom('/api/state', 'bearer xyz')).toBe('xyz')
  })

  it('rend null quand il n’y en a pas', () => {
    expect(tokenFrom('/api/state', null)).toBe(null)
    expect(tokenFrom('/api/state?autre=1', null)).toBe(null)
    expect(tokenFrom('/api/state', 'Basic zzz')).toBe(null)
  })
})

describe('routeOf', () => {
  it('reconnaît les adresses prévues', () => {
    expect(routeOf('/')).toBe('page')
    expect(routeOf('/api/state')).toBe('state')
    expect(routeOf('/api/tick')).toBe('tick')
    expect(routeOf('/api/open')).toBe('open')
    expect(routeOf('/api/watch')).toBe('watch')
    expect(routeOf('/api/trailer')).toBe('trailer')
  })

  it('tolère une barre en trop', () => {
    expect(routeOf('/api/state/')).toBe('state')
    expect(routeOf('//')).toBe('page')
  })

  // Une liste fermée, jamais un chemin traduit en fichier : c'est ce qui rend
  // impossible de faire servir autre chose que les réponses prévues.
  it('refuse tout le reste, remontées d’arborescence comprises', () => {
    expect(routeOf('/../../etc/passwd')).toBe('unknown')
    expect(routeOf('/api/state/../../secret')).toBe('unknown')
    expect(routeOf('/index.html')).toBe('unknown')
  })
})

describe('needsToken', () => {
  it('protège tout ce qui touche à la bibliothèque ou à la machine', () => {
    expect(needsToken('state')).toBe(true)
    expect(needsToken('tick')).toBe(true)
    expect(needsToken('open')).toBe(true)
    // Ouvrir une fenêtre sur le PC de quelqu'un d'autre est au moins aussi
    // intrusif que lire sa liste.
    expect(needsToken('watch')).toBe(true)
    expect(needsToken('trailer')).toBe(true)
  })

  it('laisse la page se charger : c’est elle qui demande le mot de passe', () => {
    expect(needsToken('page')).toBe(false)
  })
})

describe('remoteUrl', () => {
  it('donne une adresse recopiable', () => {
    expect(remoteUrl('192.168.1.20', 8787, 'abc')).toBe('http://192.168.1.20:8787/?t=abc')
  })
})
