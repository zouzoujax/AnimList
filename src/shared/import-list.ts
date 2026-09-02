/**
 * Traduire la liste de quelqu'un d'autre dans la nôtre.
 *
 * Chaque service a ses mots pour la même chose — « CURRENT » chez AniList,
 * « current » chez Kitsu, « Watching » chez MyAnimeList — et sa propre échelle
 * de notes. Les conversions vivent ici, seules et testées : une erreur de
 * correspondance ne se voit pas à l'import, elle se découvre des semaines plus
 * tard devant une série rangée dans « abandonnées ».
 *
 * Une valeur inconnue rend `null` plutôt qu'un statut par défaut. Ranger dans
 * « prévu » ce qu'on n'a pas su lire inventerait une intention que personne
 * n'a exprimée ; mieux vaut ignorer la ligne et le compter.
 */

import type { LibraryStatus } from './types'

/** AniList. `REPEATING` est un revisionnage en cours : on la regarde. */
const ANILIST_STATUS: Record<string, LibraryStatus> = {
  CURRENT: 'watching',
  REPEATING: 'watching',
  PLANNING: 'planned',
  COMPLETED: 'completed',
  PAUSED: 'paused',
  DROPPED: 'dropped'
}

/** Kitsu. Mêmes idées, autres mots. */
const KITSU_STATUS: Record<string, LibraryStatus> = {
  current: 'watching',
  planned: 'planned',
  completed: 'completed',
  on_hold: 'paused',
  dropped: 'dropped'
}

export function statusFromAniList(raw: string | null | undefined): LibraryStatus | null {
  return raw ? (ANILIST_STATUS[raw.toUpperCase()] ?? null) : null
}

export function statusFromKitsu(raw: string | null | undefined): LibraryStatus | null {
  return raw ? (KITSU_STATUS[raw.toLowerCase()] ?? null) : null
}

/**
 * Une date « floue » AniList : l'année seule, parfois le mois, parfois rien.
 *
 * Ce qui manque est ramené au premier jour plutôt qu'écarté — savoir qu'une
 * série a été finie en 2019 vaut mieux que de ne rien savoir, et les
 * statistiques qui comptent par jour ignorent déjà les lignes importées.
 */
export function fuzzyDate(
  date: { year?: number | null; month?: number | null; day?: number | null } | null
): number | null {
  if (!date?.year) return null
  return Date.UTC(date.year, (date.month ?? 1) - 1, date.day ?? 1)
}

/** Une date ISO, ou `null` si elle est absente ou illisible. */
export function isoDate(value: string | null | undefined): number | null {
  if (!value) return null
  const at = Date.parse(value)
  return Number.isFinite(at) ? at : null
}

/**
 * Kitsu note sur vingt, l'app sur dix.
 *
 * Arrondi vers le haut à partir de la demie : un 15/20 devient 8, pas 7. Sur
 * une échelle où chaque point se voit, tirer systématiquement vers le bas
 * déplacerait toute la bibliothèque.
 */
export function scoreFromTwenty(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || value <= 0) return null
  return Math.min(10, Math.max(1, Math.round(value / 2)))
}

/** Une note sur dix venue telle quelle : gardée si elle a un sens. */
export function scoreOutOfTen(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || value <= 0) return null
  return Math.min(10, Math.max(1, Math.round(value)))
}

/**
 * Combien d'épisodes compter comme vus.
 *
 * La progression annoncée dépasse parfois le total connu — une série
 * renumérotée, un service qui compte les récapitulatifs. Fabriquer des
 * épisodes qui n'existent pas fausserait le temps de visionnage et la
 * progression pour toujours.
 */
export function watchedCount(progress: number | null | undefined, episodes: number | null): number {
  const seen = typeof progress === 'number' && progress > 0 ? Math.floor(progress) : 0
  if (!episodes || episodes <= 0) return seen
  return Math.min(seen, episodes)
}

/** Un pseudo utilisable : ni vide, ni une adresse collée par mégarde. */
export function cleanUsername(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/[^/]+\/(?:user|users)\//i, '')
    .replace(/\/.*$/, '')
    .trim()
}
