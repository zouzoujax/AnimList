import { describe, expect, it } from 'vitest'
import { MAX_PLAYERS, parsePlayers, playerIndex } from './as-players'

describe('parsePlayers', () => {
  // La forme que produit leur page : « Lecteur 1 » à « Lecteur N », relevée
  // sur Tomb Raider King saison 1 le 22 septembre 2026.
  it('lit leur menu tel quel', () => {
    expect(parsePlayers({ labels: ['Lecteur 1', 'Lecteur 2', 'Lecteur 3'], current: 1 })).toEqual({
      labels: ['Lecteur 1', 'Lecteur 2', 'Lecteur 3'],
      current: 1
    })
  })

  it('ne propose rien sous deux lecteurs', () => {
    expect(parsePlayers({ labels: ['Lecteur 1'], current: 0 })).toBeNull()
    expect(parsePlayers({ labels: [], current: -1 })).toBeNull()
  })

  it('se tait sur une page sans menu, ou une réponse étrange', () => {
    expect(parsePlayers(null)).toBeNull()
    expect(parsePlayers('Lecteur 1')).toBeNull()
    expect(parsePlayers({ labels: 'Lecteur 1, Lecteur 2' })).toBeNull()
  })

  it('garde leur ordre, et un nom par défaut pour un libellé vide', () => {
    expect(parsePlayers({ labels: ['  Lecteur 1 ', '', 42], current: 0 })?.labels).toEqual([
      'Lecteur 1',
      'Lecteur 2',
      'Lecteur 3'
    ])
  })

  it('ne dépasse pas huit lecteurs', () => {
    const labels = Array.from({ length: 12 }, (_, i) => `Lecteur ${i + 1}`)
    expect(parsePlayers({ labels, current: 0 })?.labels).toHaveLength(MAX_PLAYERS)
  })

  // Aucune option choisie : leur menu répond -1, ou un index hors liste.
  it('ne désigne aucun lecteur quand leur menu ne le dit pas', () => {
    expect(parsePlayers({ labels: ['Lecteur 1', 'Lecteur 2'], current: -1 })?.current).toBe(-1)
    expect(parsePlayers({ labels: ['Lecteur 1', 'Lecteur 2'], current: 5 })?.current).toBe(-1)
    expect(parsePlayers({ labels: ['Lecteur 1', 'Lecteur 2'], current: 0.5 })?.current).toBe(-1)
  })
})

describe('playerIndex', () => {
  it('accepte un entier dans leur menu', () => {
    expect(playerIndex(0)).toBe(0)
    expect(playerIndex(MAX_PLAYERS - 1)).toBe(MAX_PLAYERS - 1)
  })

  // Il finit dans un script exécuté chez eux : rien d'autre qu'un entier borné.
  it('refuse tout le reste', () => {
    expect(playerIndex(MAX_PLAYERS)).toBeNull()
    expect(playerIndex(-1)).toBeNull()
    expect(playerIndex(1.5)).toBeNull()
    expect(playerIndex('1')).toBeNull()
    expect(playerIndex('0); alert(1')).toBeNull()
    expect(playerIndex(undefined)).toBeNull()
  })
})
