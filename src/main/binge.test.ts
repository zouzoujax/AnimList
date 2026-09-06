/**
 * Les deux textes injectés dans la page d'Anime-Sama.
 *
 * Ils ne sont pas compilés avec le reste : ce sont des chaînes, qu'aucun
 * typeur ne relit. Une virgule mal placée n'y provoque aucune erreur visible —
 * le carton ne s'affiche simplement pas, et l'épisode s'enchaîne sans que
 * personne ait pu dire non. D'où ces tests, qui font au moins analyser le code
 * par le moteur avant qu'il ne parte chez eux.
 *
 * `vm.Script` compile sans exécuter : ni DOM ni fenêtre nécessaires, et pas
 * d'`eval` déguisé que la règle du projet interdirait à juste titre.
 */

import { Script } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { countdownScript, noticeScript } from './binge'

const parses = (code: string): boolean => {
  new Script(code)
  return true
}

describe('countdownScript', () => {
  it('produit du JavaScript analysable', () => {
    expect(parses(countdownScript(8, 'Épisode 4'))).toBe(true)
  })

  it('porte le libellé et le compte', () => {
    const code = countdownScript(8, 'Épisode 4')
    expect(code).toContain('"Épisode 4"')
    expect(code).toContain('var left = 8')
  })

  // Un titre de série arrive tel quel du catalogue : apostrophes, guillemets,
  // barres obliques, sauts de ligne. Concaténé sans échappement, il casserait
  // le script — et le carton disparaîtrait sans rien dire.
  //
  // Rien à craindre d'un `</script>` en revanche : ce texte est remis au moteur
  // JavaScript par `executeJavaScript`, il n'est jamais posé dans du HTML.
  it('échappe un titre hostile sans l’abîmer', () => {
    const label = 'L\'"Ère" des \\ héros\n(2e partie) — épisode 1'
    const code = countdownScript(8, label)
    expect(parses(code)).toBe(true)

    // Le littéral inséré doit relire exactement le libellé d'origine.
    const from = code.indexOf('text.textContent = ') + 'text.textContent = '.length
    expect(JSON.parse(code.slice(from, code.indexOf(" + ' dans '", from)))).toBe(label)
  })

  it('garde un bouton pour dire non', () => {
    expect(countdownScript(8, 'Épisode 2')).toContain('Annuler')
  })
})

describe('noticeScript', () => {
  it('produit du JavaScript analysable', () => {
    expect(parses(noticeScript('Soirée terminée'))).toBe(true)
  })

  it('échappe son texte', () => {
    expect(parses(noticeScript('Fin \\ de "la" soirée'))).toBe(true)
  })

  // Rien à décider : il annonce, il ne demande pas.
  it('n’offre aucun bouton', () => {
    expect(noticeScript('Soirée terminée')).not.toContain('Annuler')
  })
})
