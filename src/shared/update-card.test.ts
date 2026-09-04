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
   * C'est ce qui referme la carte : le cycle retombe — à jour, ou en panne —
   * et il n'y a plus rien à suivre. Sans ce `null`, la fenêtre resterait
   * ouverte sur un état périmé, sans bouton pour s'en débarrasser.
   */
  it('ne montre rien quand il n’y a plus rien à suivre', () => {
    for (const phase of ['idle', 'checking', 'current', 'error'] as const) {
      expect(updateCard(status({ phase }))).toBeNull()
    }
  })

  it('annonce la version trouvée avant le premier octet', () => {
    const card = updateCard(status({ phase: 'available', version: '0.4.1' }))
    expect(card).toEqual({
      title: 'AnimeList 0.4.1',
      line: 'Nouvelle version disponible',
      percent: 0,
      bar: 'value'
    })
  })

  /**
   * Aucun bouton, nulle part : la carte rend compte d'une décision déjà prise
   * dans les réglages. La reposer par-dessus reviendrait à demander deux fois.
   */
  it('ne propose jamais rien à cliquer', () => {
    for (const phase of ['available', 'downloading', 'ready'] as const) {
      expect(Object.keys(updateCard(status({ phase, version: '0.4.1' })) ?? {}).sort()).toEqual([
        'bar',
        'line',
        'percent',
        'title'
      ])
    }
  })

  it('montre le pourcentage pendant le téléchargement', () => {
    const card = updateCard(status({ phase: 'downloading', version: '0.4.1', percent: 42 }))
    expect(card).toMatchObject({ line: 'Téléchargement… 42 %', percent: 42, bar: 'value' })
  })

  it('dit que la version est prête, sans rien demander', () => {
    const card = updateCard(status({ phase: 'ready', version: '0.4.1', percent: 100 }))
    expect(card).toMatchObject({ line: 'Prête à installer', percent: 100, bar: 'value' })
  })

  /**
   * L'installeur tourne après la fermeture de l'app et ne rend aucune
   * progression : la dernière étape n'a pas de nombre, et prétendre le
   * contraire reviendrait à afficher un chiffre inventé.
   */
  it('n’invente pas de pourcentage pour l’installation', () => {
    const card = updateCard(status({ phase: 'ready', version: '0.4.1', percent: 100 }), true)
    expect(card).toMatchObject({ line: 'Installation…', percent: null, bar: 'sweep' })
  })

  it('se passe du numéro de version quand il n’est pas connu', () => {
    expect(updateCard(status({ phase: 'downloading', version: null, percent: 5 }))?.title).toBe('AnimeList')
  })
})
