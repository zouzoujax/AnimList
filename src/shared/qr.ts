/**
 * Le dessin d'un QR code, une fois que la bibliothèque a fait l'encodage.
 *
 * Séparé et testé, parce qu'un QR mal dessiné ne se voit pas : il ressemble à
 * un QR, et ne se scanne simplement pas. Deux choses le décident, et aucune
 * n'est esthétique.
 *
 * **La zone de silence.** La norme exige quatre modules vides tout autour.
 * Sans eux, un lecteur ne trouve pas les bords et abandonne — c'est la cause
 * la plus fréquente d'un code qui « ne marche pas », et elle est invisible à
 * l'œil.
 *
 * **Le contraste.** Modules sombres sur fond clair, jamais l'inverse, et
 * jamais teintés par le thème de l'app : un lecteur cherche du noir sur du
 * blanc. Un QR violet sur fond sombre est joli et illisible.
 */

/** Ce que la norme impose autour du code, en modules. */
export const QUIET_ZONE = 4

/**
 * Le chemin SVG des modules sombres.
 *
 * Un seul `path` plutôt que des milliers de `rect` : un code de taille
 * moyenne compte un millier de modules, et autant d'éléments dans le document
 * coûte plus cher à dessiner que la page entière.
 */
export function qrPath(isDark: (row: number, col: number) => boolean, count: number): string {
  const parts: string[] = []
  for (let row = 0; row < count; row += 1) {
    let start = -1
    for (let col = 0; col <= count; col += 1) {
      const dark = col < count && isDark(row, col)
      if (dark && start < 0) start = col
      if (!dark && start >= 0) {
        // Les modules voisins d'une même ligne sont fondus en un rectangle :
        // moins de commandes, même dessin.
        parts.push(`M${start + QUIET_ZONE} ${row + QUIET_ZONE}h${col - start}v1h-${col - start}z`)
        start = -1
      }
    }
  }
  return parts.join('')
}

/** Le côté du dessin, zone de silence comprise. */
export function qrSize(count: number): number {
  return count + QUIET_ZONE * 2
}
