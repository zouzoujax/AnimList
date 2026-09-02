import { describe, expect, it } from 'vitest'
import type { Media } from '@shared/types'
import { followKey, newcomers } from './follows'

const media = (id: number): Media => ({ id, title: { romaji: `S${id}`, english: null, native: null } }) as Media

describe('followKey', () => {
  it('distingue une personne d’un studio portant le même nom', () => {
    expect(followKey('staff', 97042)).toBe('staff:97042')
    expect(followKey('studio', 'Bones')).toBe('studio:Bones')
  })
})

describe('newcomers', () => {
  it('ne retient que ce qui n’était pas connu', () => {
    expect(newcomers([1, 2], [media(1), media(2), media(3)]).map((m) => m.id)).toEqual([3])
  })

  // Le cas qui compte : poser un suivi ne doit annoncer strictement rien.
  it('ne trouve rien quand tout était déjà là', () => {
    expect(newcomers([1, 2, 3], [media(1), media(2), media(3)])).toEqual([])
  })

  it('traite une liste vide de connus comme un tout nouveau suivi', () => {
    expect(newcomers([], [media(1)]).map((m) => m.id)).toEqual([1])
  })

  // Une série retirée du catalogue ne doit pas faire réapparaître les autres.
  it('ignore ce qui a disparu de la liste', () => {
    expect(newcomers([1, 2, 3], [media(2)])).toEqual([])
  })
})
