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

  /**
   * Les deux groupes de l'accueil et les intertitres du calendrier vivent dans
   * le script, hors de portée du compilateur. Ces deux lignes ne prouvent pas
   * qu'ils s'affichent bien — seulement qu'on ne les a pas perdus en chemin.
   */
  it('range l’accueil par retard et le calendrier par jour', () => {
    expect(html).toContain('À rattraper')
    expect(html).toContain('class="late"')
    expect(html).toContain("Aujourd'hui")
    expect(html).toContain('function jour(')
  })

  it('emporte l’arbre des franchises et ses libellés de branches', () => {
    expect(html).toContain('function renderTree(')
    expect(html).toContain('data-act="tree"')
    // Les noms des branches viennent de l'app : s'ils manquent, la page les
    // aurait redéfinis dans son coin.
    expect(html).toContain('OVA et spéciaux')
  })

  /**
   * Hors ligne, la page ressert ce qu'elle a déjà lu. Comme le reste du
   * script, rien ne le vérifie à la compilation : on s'assure au moins que le
   * bandeau, la mise en mémoire et les deux refus en clair sont là.
   */
  it('garde ses lectures pour quand le PC ne répond plus', () => {
    expect(html).toContain('id="offline"')
    expect(html).toContain('function remember(')
    expect(html).toContain('Hors ligne : le PC ne répond pas.')
    expect(html).toContain('rien n’a été envoyé')
    // Jamais le lecteur ni Découvrir : l'un ne vaut que pour l'instant, l'autre vient d'AniList.
    expect(html).toContain("path.indexOf('/api/player') !== 0")
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
  /**
   * Un onglet déclaré sans branche dans le chargeur retomberait silencieusement
   * sur l'accueil : le bouton s'allume, le contenu ne change pas.
   */
  it('sait charger chacun de ses onglets', () => {
    const script = /<script>([\s\S]*)<\/script>/.exec(html)![1]
    const ids = [...script.matchAll(/\{ id: '([a-z]+)', label:/g)].map((m) => m[1])

    expect(ids).toEqual(['home', 'library', 'calendar', 'stats', 'discover'])
    for (const id of ids) {
      // L'accueil est le cas par défaut, il n'a pas de branche à lui.
      if (id === 'home') continue
      expect(script).toContain(`tab === '${id}'`)
    }
  })

  it('demande au serveur des adresses qu’il connaît', () => {
    const script = /<script>([\s\S]*)<\/script>/.exec(html)![1]
    for (const chemin of ['/api/state', '/api/library', '/api/calendar', '/api/stats', '/api/discover']) {
      expect(script).toContain(chemin)
    }
  })

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
