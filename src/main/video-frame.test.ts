import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { SKIP_CLICK, SKIP_PROBE } from './video-frame'

/**
 * Le script qui cherche le bouton « Passer l'intro » s'exécute chez eux, dans
 * le cadre de leur lecteur : ni le compilateur ni le linteur ne le regardent,
 * et une erreur y serait muette — le bouton n'apparaîtrait simplement jamais
 * sur le téléphone, sans que rien ne le dise.
 *
 * Ses règles s'éprouvent pourtant sans navigateur : il ne demande à la page
 * qu'une poignée de choses, et une page pour de faux les lui donne. Le
 * sélecteur CSS, lui, n'est pas vérifié ici — il ne fait que réduire la
 * recherche, et c'est le tri qui suit qui décide.
 */
interface FakeElement {
  text?: string
  attrs?: Record<string, string>
  id?: string
  /** Position à l'écran. Par défaut un bouton visible et de taille normale. */
  box?: { width: number; height: number; top: number; left: number }
  style?: { visibility?: string; display?: string; opacity?: string }
  clicked?: boolean
}

function run(script: string, elements: FakeElement[]): unknown {
  const nodes = elements.map((el) => ({
    textContent: el.text ?? '',
    id: el.id ?? '',
    style: { visibility: 'visible', display: 'block', opacity: '1', ...(el.style ?? {}) },
    getAttribute: (name: string) => el.attrs?.[name] ?? null,
    getBoundingClientRect: () => {
      const box = el.box ?? { width: 120, height: 40, top: 500, left: 800 }
      return { ...box, right: box.left + box.width, bottom: box.top + box.height }
    },
    click: () => {
      el.clicked = true
    }
  }))

  return runInNewContext(script, {
    innerWidth: 1920,
    innerHeight: 1080,
    document: { querySelectorAll: () => nodes },
    getComputedStyle: (node: (typeof nodes)[number]) => node.style
  })
}

describe('le bouton « Passer l’intro » de leur lecteur', () => {
  it('se reconnaît, en français comme en anglais', () => {
    expect(run(SKIP_PROBE, [{ text: 'Passer l’intro' }])).toBe('Passer l’intro')
    expect(run(SKIP_PROBE, [{ text: 'Skip Intro' }])).toBe('Skip Intro')
    expect(run(SKIP_PROBE, [{ text: 'Passer le générique' }])).toBe('Passer le générique')
    expect(run(SKIP_PROBE, [{ text: 'Skip Opening' }])).toBe('Skip Opening')
    expect(run(SKIP_PROBE, [{ text: 'Skip Ending' }])).toBe('Skip Ending')
  })

  it('accepte un bouton qui ne se nomme qu’à moitié, si l’élément le nomme', () => {
    expect(run(SKIP_PROBE, [{ text: 'Passer', attrs: { class: 'skip-intro-btn' } }])).toBe('Passer')
    expect(run(SKIP_PROBE, [{ text: 'Passer', id: 'skipButton' }])).toBe('Passer')
    // Sans rien pour dire *quoi* passer, on ne devine pas.
    expect(run(SKIP_PROBE, [{ text: 'Passer' }])).toBeNull()
  })

  it('lit le libellé d’un bouton qui n’a qu’une icône', () => {
    expect(run(SKIP_PROBE, [{ attrs: { 'aria-label': 'Passer l’introduction' } }])).toBe('Passer l’introduction')
  })

  /**
   * La limite qu'on se donne : leur lecteur propose de passer son générique,
   * pas sa régie. Relayer l'un n'est pas relayer l'autre.
   */
  it('ne relaie pas ce qui saute une publicité', () => {
    expect(run(SKIP_PROBE, [{ text: 'Passer la pub' }])).toBeNull()
    expect(run(SKIP_PROBE, [{ text: 'Skip Ad' }])).toBeNull()
    expect(run(SKIP_PROBE, [{ text: 'Passer l’annonce', attrs: { class: 'skip-ad' } }])).toBeNull()
  })

  it('ignore ce que l’écran ne montre pas', () => {
    const hors = { text: 'Passer l’intro', box: { width: 120, height: 40, top: -300, left: 800 } }
    expect(run(SKIP_PROBE, [hors])).toBeNull()
    expect(run(SKIP_PROBE, [{ text: 'Passer l’intro', box: { width: 0, height: 0, top: 500, left: 800 } }])).toBeNull()
    expect(run(SKIP_PROBE, [{ text: 'Passer l’intro', style: { opacity: '0' } }])).toBeNull()
    expect(run(SKIP_PROBE, [{ text: 'Passer l’intro', style: { visibility: 'hidden' } }])).toBeNull()
  })

  it('ne prend pas le texte d’un conteneur pour un bouton', () => {
    const long = 'Vous pouvez passer l’intro à tout moment en appuyant sur la touche entrée de votre clavier'
    expect(run(SKIP_PROBE, [{ text: long }])).toBeNull()
  })

  it('presse celui qu’il a trouvé, et lui seul', () => {
    const pub: FakeElement = { text: 'Passer la pub' }
    const vrai: FakeElement = { text: 'Passer l’intro' }
    expect(run(SKIP_CLICK, [pub, vrai])).toBe(true)
    expect(pub.clicked).toBeUndefined()
    expect(vrai.clicked).toBe(true)
  })

  it('dit qu’il n’y a rien à presser quand le bouton s’est effacé', () => {
    expect(run(SKIP_CLICK, [])).toBe(false)
    expect(run(SKIP_PROBE, [])).toBeNull()
  })
})
