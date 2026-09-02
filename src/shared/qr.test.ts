import { describe, expect, it } from 'vitest'
import { QUIET_ZONE, qrPath, qrSize } from './qr'

/** Une grille écrite à la main, `#` pour un module sombre. */
const grid =
  (rows: string[]) =>
  (row: number, col: number): boolean =>
    rows[row]?.[col] === '#'

describe('qrSize', () => {
  // Sans la zone de silence, un lecteur ne trouve pas les bords et abandonne.
  it('ajoute la zone de silence des deux côtés', () => {
    expect(qrSize(21)).toBe(21 + QUIET_ZONE * 2)
    expect(QUIET_ZONE).toBe(4)
  })
})

describe('qrPath', () => {
  it('ne dessine rien pour une grille vide', () => {
    expect(qrPath(grid(['...', '...', '...']), 3)).toBe('')
  })

  it('dessine un module isolé au bon endroit, décalé de la zone de silence', () => {
    expect(qrPath(grid(['...', '.#.', '...']), 3)).toBe('M5 5h1v1h-1z')
  })

  // Un code de taille moyenne compte un millier de modules : autant
  // d'éléments coûterait plus cher à dessiner que la page entière.
  it('fond les modules voisins d’une ligne en un seul rectangle', () => {
    expect(qrPath(grid(['###']), 3)).toBe('M4 4h3v1h-3z')
  })

  it('sépare deux groupes de la même ligne', () => {
    expect(qrPath(grid(['##.#']), 4)).toBe('M4 4h2v1h-2zM7 4h1v1h-1z')
  })

  it('ferme un groupe qui touche le bord droit', () => {
    expect(qrPath(grid(['.##']), 3)).toBe('M5 4h2v1h-2z')
  })

  it('traite chaque ligne pour elle-même', () => {
    expect(qrPath(grid(['#.', '.#']), 2)).toBe('M4 4h1v1h-1zM5 5h1v1h-1z')
  })
})
