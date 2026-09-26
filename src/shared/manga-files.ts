/**
 * Les fichiers d'un manga posé sur le disque.
 *
 * Deux formes coexistent chez à peu près tout le monde :
 *
 *     Mangas/Frieren/Frieren T01.cbz          une archive par tome
 *     Mangas/Frieren/Tome 02/001.jpg          un dossier d'images par tome
 *
 * et parfois un dossier d'images directement sous la série, pour un one-shot.
 * On ne devine rien de plus : un nom de tome se lit tel qu'il est écrit, et le
 * numéro n'est tiré que pour ranger.
 */

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp', '.svg']
export const ARCHIVE_EXTENSIONS = ['.cbz', '.zip']

export function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

export function isImage(name: string): boolean {
  // Les vignettes que macOS glisse dans les archives (`__MACOSX/._001.jpg`)
  // ont la bonne extension et ne sont pas des pages.
  const base = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1)
  if (base.startsWith('._') || name.includes('__MACOSX')) return false
  return IMAGE_EXTENSIONS.includes(extOf(name))
}

export function isArchive(name: string): boolean {
  return ARCHIVE_EXTENSIONS.includes(extOf(name))
}

/**
 * Le tri naturel : « page 2 » avant « page 10 ».
 *
 * Un tri alphabétique met la dixième page en deuxième position dès que les
 * numéros ne sont pas complétés par des zéros — ce qui arrive souvent.
 */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' })
}

/**
 * Le numéro d'un tome ou d'un chapitre, lu dans son nom.
 *
 * Du plus explicite au plus vague. Rend `null` plutôt qu'un chiffre au hasard :
 * un tome sans numéro se range par son nom, ce qui vaut mieux qu'une place
 * inventée.
 */
export function volumeNumber(name: string): number | null {
  // Le soulignement compte comme une lettre pour `\b` : « Tome_03 » ne se
  // lirait pas. L'extension doit commencer par une lettre, sinon « Vol.105 »
  // perdrait son numéro.
  const stem = name.replace(/\.[a-z][a-z0-9]{1,3}$/i, '').replace(/_+/g, ' ')
  const explicit =
    /\b(?:tome|t|vol(?:ume)?|v|chap(?:itre|ter)?|ch|c|#)\.?\s*(\d+(?:[.,]\d+)?)/i.exec(stem) ??
    /(?:^|[\s_-])(\d{1,4}(?:[.,]\d+)?)\s*$/.exec(stem)
  if (!explicit) return null
  return Number(explicit[1].replace(',', '.'))
}

/** Un chapitre plutôt qu'un tome, pour le dire juste à l'écran. */
export function isChapter(name: string): boolean {
  return /\b(?:chap(?:itre|ter)?|ch|c)\.?\s*\d/i.test(name)
}

/**
 * Le titre d'une série tiré du nom d'une archive posée seule à la racine :
 * « Frieren T01 [FR].cbz » donne « Frieren ».
 */
export function seriesTitleOf(name: string): string {
  return (
    name
      .replace(/\.[a-z][a-z0-9]{1,3}$/i, '')
      .replace(/_+/g, ' ')
      .replace(/[[(][^\])]*[\])]/g, ' ')
      .replace(/\b(?:tome|t|vol(?:ume)?|v|chap(?:itre|ter)?|ch|c)\.?\s*\d+.*$/i, '')
      .replace(/[\s_-]+\d{1,4}\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim() || name
  )
}

/** Range des tomes : par numéro quand il existe, par nom sinon. */
export function sortVolumes<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const na = volumeNumber(a.name)
    const nb = volumeNumber(b.name)
    if (na !== null && nb !== null && na !== nb) return na - nb
    if (na !== null && nb === null) return -1
    if (na === null && nb !== null) return 1
    return naturalCompare(a.name, b.name)
  })
}

/**
 * Où reprendre un tome.
 *
 * Arrivé à la dernière page, le tome est lu : on ne propose pas d'y revenir,
 * on propose le suivant.
 */
export function isFinished(page: number, pages: number): boolean {
  return pages > 0 && page >= pages - 1
}

/**
 * Les paires d'une lecture en double page.
 *
 * La première page reste seule : c'est la couverture, et c'est ce qui aligne
 * les doubles pages dessinées pour s'ouvrir côte à côte (2-3, 4-5…). Une
 * page plus large que haute reste seule elle aussi — c'est déjà une double.
 */
export function spreads(count: number, wide: ReadonlySet<number> = new Set()): number[][] {
  const out: number[][] = []
  let i = 0
  while (i < count) {
    if (i === 0 || wide.has(i) || wide.has(i + 1) || i + 1 >= count) {
      out.push([i])
      i += 1
    } else {
      out.push([i, i + 1])
      i += 2
    }
  }
  return out
}
