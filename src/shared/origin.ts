/**
 * Manga, manhwa, manhua : d'où vient une bande dessinée.
 *
 * AniList range tout sous `type: MANGA` et `format: MANGA`, sans distinction.
 * Le résultat se voit à l'œil nu dans les tendances : sept des huit premiers
 * titres sont coréens, présentés comme des mangas. Or ce ne sont pas les mêmes
 * objets — un manhwa se lit en couleur, en défilement vertical, de gauche à
 * droite ; un manga se lit en noir et blanc, planche par planche, de droite à
 * gauche. Les confondre trompe sur ce qu'on va ouvrir.
 *
 * La seule information fiable est `countryOfOrigin`, un code à deux lettres.
 * Le format sert d'abord : un roman reste un roman, quel que soit son pays.
 */

export type MangaOrigin = 'manga' | 'manhwa' | 'manhua' | 'novel' | 'other'

/** Ce qu'on écrit à l'écran. Les trois mots sont d'usage courant en français. */
export const ORIGIN_LABELS: Record<MangaOrigin, string> = {
  manga: 'Manga',
  manhwa: 'Manhwa',
  manhua: 'Manhua',
  novel: 'Roman',
  other: 'BD'
}

/** Ce que chaque mot recouvre, en une phrase, pour l'infobulle. */
export const ORIGIN_HINTS: Record<MangaOrigin, string> = {
  manga: 'Japon · noir et blanc, lecture de droite à gauche',
  manhwa: 'Corée du Sud · souvent en couleur, défilement vertical',
  manhua: 'Chine, Taïwan ou Hong Kong · souvent en couleur',
  novel: 'Roman ou light novel, pas une bande dessinée',
  other: 'Origine hors des trois traditions'
}

/** Les pays de chaque tradition. Un code inconnu tombe dans « BD ». */
const BY_COUNTRY: Record<string, MangaOrigin> = {
  JP: 'manga',
  KR: 'manhwa',
  CN: 'manhua',
  TW: 'manhua',
  HK: 'manhua'
}

/** Les formats qui ne sont pas des bandes dessinées, quel que soit le pays. */
const NOVEL_FORMATS = new Set(['NOVEL', 'LIGHT_NOVEL'])

export function originOf(country: string | null | undefined, format?: string | null): MangaOrigin {
  // Le format tranche en premier : un light novel japonais n'est pas un manga,
  // et le classer comme tel serait la pire des deux erreurs possibles.
  if (format && NOVEL_FORMATS.has(format)) return 'novel'
  if (!country) return 'other'
  return BY_COUNTRY[country.toUpperCase()] ?? 'other'
}

/** Les onglets proposés, et le code pays qu'ils demandent à AniList. */
export const ORIGIN_FILTERS: { id: MangaOrigin; country: string }[] = [
  { id: 'manga', country: 'JP' },
  { id: 'manhwa', country: 'KR' },
  { id: 'manhua', country: 'CN' }
]
