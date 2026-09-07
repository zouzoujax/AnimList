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
import { countdownScript, noticeScript, skipScript } from './binge'

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

describe('skipScript', () => {
  it('produit du JavaScript analysable', () => {
    expect(parses(skipScript(102, 'Passer l’opening', 90))).toBe(true)
  })

  it('porte la seconde où sauter et le libellé', () => {
    const code = skipScript(102.5, 'Passer l’opening', 90)
    expect(code).toContain('v.currentTime = 102.5')
    expect(code).toContain('"Passer l’opening"')
  })

  // Il se retire seul : sinon il proposerait un saut vers une seconde franchie.
  it('se pose une échéance', () => {
    expect(skipScript(102, 'x', 90)).toContain('setTimeout(partir, 90 * 1000)')
  })

  it('ne demande jamais moins d’une seconde', () => {
    expect(skipScript(102, 'x', 0.2)).toContain('setTimeout(partir, 1 * 1000)')
  })

  // Quand rien ne suit le générique, le bouton ne saute pas : il demande la
  // suite, et le processus principal relit ce drapeau dix fois par seconde.
  it('pose un drapeau plutôt que d’avancer quand la destination est nulle', () => {
    const code = skipScript(null, 'Épisode suivant', 60)
    expect(parses(code)).toBe(true)
    expect(code).toContain('__animelistSkipNext = true')
    expect(code).not.toContain('currentTime')
  })

  it('échappe un libellé hostile', () => {
    expect(parses(skipScript(10, 'L\'"opening" \\ ici', 30))).toBe(true)
  })
})
