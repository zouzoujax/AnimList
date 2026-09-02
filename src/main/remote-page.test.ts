import { Script } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { page } from './remote-page'

/**
 * La page du téléphone est une chaîne de caractères assemblée en TypeScript :
 * ni le compilateur ni le linteur ne regardent le JavaScript qu'elle contient.
 *
 * Une faute y est donc invisible jusqu'au téléphone — et elle ne casse pas un
 * bouton, elle empêche le script entier de se parser : la page reste sur
 * « Chargement… » et ne tente jamais rien. C'est exactement ce qui est arrivé
 * en renommant une variable en `body`, alors que c'était déjà le nom d'un
 * paramètre.
 */
describe('la page de la télécommande', () => {
  const html = page()

  it('contient bien un script', () => {
    expect(html).toContain('<script>')
    expect(html).toContain('</script>')
  })

  it('a un script qui se parse', () => {
    const found = /<script>([\s\S]*)<\/script>/.exec(html)
    expect(found).not.toBeNull()
    // `new Script` compile sans exécuter : c'est la vérification de syntaxe,
    // sans avoir besoin d'un navigateur ni d'un DOM.
    expect(() => new Script(found![1])).not.toThrow()
  })

  it('a du style et les points d’ancrage que le script attend', () => {
    expect(html).toContain('<style>')
    expect(html).toContain('id="app"')
    expect(html).toContain('id="flash"')
  })

  it('reste en français et sans dépendance extérieure', () => {
    expect(html).toContain('lang="fr"')
    expect(html).not.toMatch(/src="https?:/)
  })
})

describe('les actions de la page', () => {
  const html = page()

  // Le bouton doit être passé explicitement : `window.event` est un vestige,
  // et sa cible n'est plus renseignée une fois la fonction reprise après
  // l'attente — le bouton serait rétabli sur `null`.
  it('passe le bouton à ses gestionnaires plutôt que de le deviner', () => {
    expect(html).toContain('onclick="watch(this,')
    expect(html).toContain('onclick="trailer(this,')
    expect(html).not.toContain('event.currentTarget')
  })

  it('déclare les gestionnaires que le balisage appelle', () => {
    for (const name of ['tick', 'watch', 'trailer', 'open_']) {
      expect(html).toContain(`window.${name} =`)
    }
  })
})
