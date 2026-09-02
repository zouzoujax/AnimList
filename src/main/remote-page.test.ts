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
  const script = /<script>([\s\S]*)<\/script>/.exec(html)![1]

  // Le vrai risque : ajouter un bouton et oublier de le traiter. Il ne
  // planterait pas, il ne ferait simplement rien — et rien ne le dirait.
  it('traite toutes les actions que ses boutons portent', () => {
    const posed = [...script.matchAll(/data-act="(\w+)/g)].map((m) => m[1])
    const dynamic = [...script.matchAll(/data-act="' \+ \(?p\.\w+ \? '(\w+)' : '(\w+)'/g)].flatMap((m) => [m[1], m[2]])
    const actions = [...new Set([...posed, ...dynamic])]
    expect(actions.length).toBeGreaterThan(4)

    // La liste des commandes de lecture est lue une fois, sans expression
    // rationnelle : les échappements d'une regex écrite dans un gabarit sont
    // exactement le piège que ce fichier existe pour attraper.
    const controls = /CONTROLS = \[([^\]]*)\]/.exec(script)?.[1] ?? ''

    for (const action of actions) {
      const handled = script.includes(`action === '${action}'`) || controls.includes(`'${action}'`)
      expect(handled, `action « ${action} » sans gestionnaire`).toBe(true)
    }
  })

  // Toute la raison d'être de la délégation : un gestionnaire en ligne oblige
  // à imbriquer des guillemets dans un gabarit qui les mange.
  it('n’utilise aucun gestionnaire en ligne', () => {
    expect(html).not.toContain('onclick=')
    expect(html).not.toContain('event.currentTarget')
  })

  // Un seul écouteur délégué pour toutes les actions. Les écouteurs posés sur
  // un élément précis — le pavé tactile, les curseurs — ne comptent pas : ils
  // ont besoin de la position ou de la valeur, qu'un bouton ne porte pas.
  it('délègue toutes les actions à un écouteur unique', () => {
    expect(script.match(/document\.addEventListener\('click'/g)).toHaveLength(1)
  })
})
