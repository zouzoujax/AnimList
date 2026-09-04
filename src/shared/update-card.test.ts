import { describe, expect, it } from 'vitest'
import { clampPercent, updateCard } from './update-card'
import type { UpdateStatus } from './types'

const status = (patch: Partial<UpdateStatus>): UpdateStatus => ({
  phase: 'idle',
  version: null,
  percent: 0,
  message: null,
  notes: [],
  ...patch
})

describe('clampPercent', () => {
  it('arrondit et garde dans les bornes', () => {
    expect(clampPercent(41.6)).toBe(42)
    expect(clampPercent(-3)).toBe(0)
    expect(clampPercent(140)).toBe(100)
  })

  // Une division par zéro en amont ferait une barre de largeur « NaN % », que
  // le navigateur ignore : la barre resterait figée sans que rien ne le dise.
  it('ne laisse pas passer un nombre qui n’en est pas un', () => {
    expect(clampPercent(Number.NaN)).toBe(0)
    expect(clampPercent(Number.POSITIVE_INFINITY)).toBe(100)
  })
})

describe('updateCard', () => {
  /**
   * Le cas le plus fréquent de très loin : l'app cherche une version toutes
   * les six heures et n'en trouve pas. Une fenêtre qui surgirait là serait
   * une fenêtre qui surgit pour rien, quatre fois par jour.
   */
  it('ne montre rien quand il n’y a rien à annoncer', () => {
    for (const phase of ['idle', 'checking', 'current', 'error'] as const) {
      expect(updateCard(status({ phase }))).toBeNull()
    }
  })

  it('annonce une version trouvée, et propose de la prendre', () => {
    const card = updateCard(status({ phase: 'available', version: '0.4.1' }))
    expect(card).toMatchObject({
      title: 'AnimeList 0.4.1',
      line: 'Nouvelle version disponible',
      bar: 'none',
      actions: ['download', 'later']
    })
  })

  it('montre le pourcentage pendant le téléchargement', () => {
    const card = updateCard(status({ phase: 'downloading', version: '0.4.1', percent: 42 }))
    expect(card).toMatchObject({ line: 'Téléchargement… 42 %', percent: 42, bar: 'value' })
    // Rien à valider pendant qu'elle descend : seulement de quoi s'en aller.
    expect(card?.actions).toEqual(['later'])
  })

  it('propose le redémarrage une fois la version prête', () => {
    const card = updateCard(status({ phase: 'ready', version: '0.4.1', percent: 100 }))
    expect(card).toMatchObject({ line: 'Prête à installer', percent: 100, actions: ['install', 'later'] })
  })

  /**
   * L'installeur tourne après la fermeture de l'app et ne rend aucune
   * progression : la dernière étape n'a pas de nombre, et prétendre le
   * contraire reviendrait à afficher un chiffre inventé.
   */
  it('n’invente pas de pourcentage pour l’installation', () => {
    const card = updateCard(status({ phase: 'ready', version: '0.4.1', percent: 100 }), true)
    expect(card).toMatchObject({ line: 'Installation…', percent: null, bar: 'sweep' })
    // Plus rien à cliquer : l'app se ferme dans la seconde.
    expect(card?.actions).toEqual([])
  })

  it('se passe du numéro de version quand il n’est pas connu', () => {
    expect(updateCard(status({ phase: 'downloading', version: null, percent: 5 }))?.title).toBe('AnimeList')
  })
})
