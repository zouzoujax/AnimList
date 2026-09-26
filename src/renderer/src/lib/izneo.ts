/**
 * izneo vend des mangas en toute légalité, mais ne les laisse lire que chez
 * lui (DRM, lecteur maison, aucune API). L'app y mène ; elle ne les en sort pas.
 */

export const IZNEO_MANGA = 'https://www.izneo.com/fr/manga-et-simultrad'

/** izneo n'a pas de recherche adressable : on passe par une recherche web limitée à son site. */
export function izneoSearch(title: string): string {
  return `https://duckduckgo.com/?q=${encodeURIComponent(`site:izneo.com ${title}`)}`
}
