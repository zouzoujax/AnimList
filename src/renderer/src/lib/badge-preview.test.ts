import { describe, expect, it } from 'vitest'
import { endBadgePreview, isPreviewingBadge, previewBadge, subscribeBadgePreview } from './badge-preview'

/**
 * Le bouton des Réglages et le carton ne se connaissent que par ce fichier :
 * si l'abonnement ne prévient pas, le bouton ne fait rien et rien ne le dit.
 */
describe('l’aperçu du carton de badge', () => {
  it('commence éteint', () => {
    expect(isPreviewingBadge()).toBe(false)
  })

  it('s’allume, prévient, puis s’éteint', () => {
    const vus: boolean[] = []
    const stop = subscribeBadgePreview(() => vus.push(isPreviewingBadge()))

    previewBadge()
    expect(isPreviewingBadge()).toBe(true)

    endBadgePreview()
    expect(isPreviewingBadge()).toBe(false)
    expect(vus).toEqual([true, false])

    stop()
  })

  it('ne prévient plus après désabonnement', () => {
    let appels = 0
    const stop = subscribeBadgePreview(() => {
      appels += 1
    })
    stop()

    previewBadge()
    endBadgePreview()
    expect(appels).toBe(0)
  })
})
