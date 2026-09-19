import { describe, expect, it } from 'vitest'
import { TICK_ARG, tickTargetFrom } from './quick-tick'

describe('tickTargetFrom', () => {
  it('lit la série et l’épisode', () => {
    expect(tickTargetFrom(['app.exe', `${TICK_ARG}154587:12`])).toEqual({ animeId: 154587, episode: 12 })
  })

  it('ignore une ligne de commande sans coche', () => {
    expect(tickTargetFrom(['app.exe', '--animelist-open=154587'])).toBeNull()
  })

  it('refuse un épisode manquant ou invalide', () => {
    expect(tickTargetFrom([`${TICK_ARG}154587`])).toBeNull()
    expect(tickTargetFrom([`${TICK_ARG}154587:0`])).toBeNull()
    expect(tickTargetFrom([`${TICK_ARG}abc:3`])).toBeNull()
  })
})
