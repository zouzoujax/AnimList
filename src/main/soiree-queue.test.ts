import { beforeEach, describe, expect, it } from 'vitest'
import { soireeNext, soireeSlots, startSoiree, stopSoiree } from './soiree-queue'
import type { Slot } from '@shared/soiree'

const slot = (animeId: number, episode: number): Slot => ({
  animeId,
  episode,
  title: `Série ${animeId}`,
  minutes: 24,
  reason: 'suite'
})

beforeEach(() => stopSoiree())

describe('startSoiree', () => {
  it('retient la liste et la fait suivre', () => {
    startSoiree([slot(1, 3), slot(2, 1)])
    expect(soireeSlots()).toHaveLength(2)
    expect(soireeNext(1, 3)).toEqual({ next: slot(2, 1), inSession: true })
  })

  // La liste traverse le pont : elle peut arriver abîmée, et une entrée sans
  // numéro ferait ouvrir une page d'épisode inexistant.
  it('écarte les entrées inutilisables', () => {
    startSoiree([slot(1, 3), slot(0, 2), slot(2, 0), null as unknown as Slot])
    expect(soireeSlots()).toEqual([slot(1, 3)])
  })

  it('accepte n’importe quoi sans casser', () => {
    startSoiree(undefined as unknown as Slot[])
    expect(soireeSlots()).toEqual([])
  })

  it('remplace la soirée précédente au lieu de s’y ajouter', () => {
    startSoiree([slot(1, 1), slot(1, 2)])
    startSoiree([slot(5, 9)])
    expect(soireeSlots()).toEqual([slot(5, 9)])
  })
})

describe('stopSoiree', () => {
  it('rend la main à l’enchaînement ordinaire', () => {
    startSoiree([slot(1, 3), slot(1, 4)])
    stopSoiree()
    expect(soireeNext(1, 3)).toEqual({ next: null, inSession: false })
  })
})
