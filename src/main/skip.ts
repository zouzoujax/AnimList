/**
 * Va chercher les minutages de générique chez AniSkip.
 *
 * Leur base est indexée par identifiant MyAnimeList, que l'app connaît déjà —
 * c'est la même clé que pour les épisodes hors intrigue. Aucune inscription,
 * aucune clé, et rien de nous ne part là-bas : la requête ne contient qu'un
 * numéro de série et un numéro d'épisode.
 *
 * La longueur d'épisode envoyée vaut zéro, c'est-à-dire « n'importe laquelle ».
 * Filtrer chez eux nous priverait d'une réponse dès que leur relevé s'écarte
 * d'une seconde de notre copie ; on préfère tout recevoir et décider nous-mêmes
 * avec `usable`, qui est testé.
 */

import { parseSkipTimes, type SkipRange } from '@shared/skip'

const ENDPOINT = 'https://api.aniskip.com/v2/skip-times'

/** Deux secondes : au-delà, la lecture est déjà passée devant le générique. */
const TIMEOUT_MS = 2000

/**
 * Gardé en mémoire, pas sur le disque.
 *
 * Un minutage pèse quelques octets et ne change presque jamais ; le relire au
 * prochain lancement coûte une requête, ce qui est moins cher qu'un fichier de
 * plus à écrire, à purger et à migrer.
 */
const cache = new Map<string, SkipRange[]>()

export async function skipRangesFor(malId: number | null, episode: number): Promise<SkipRange[]> {
  if (!malId || malId <= 0 || !Number.isInteger(episode) || episode < 1) return []

  const key = `${malId}:${episode}`
  const hit = cache.get(key)
  if (hit) return hit

  const url = `${ENDPOINT}/${malId}/${episode}?types=op&types=ed&episodeLength=0`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    // 404 est leur réponse normale pour « on n'a rien sur cet épisode » : ce
    // n'est pas une panne, et la retenir évite de redemander à chaque tour.
    const ranges = res.ok ? parseSkipTimes(await res.json()) : []
    cache.set(key, ranges)
    return ranges
  } catch {
    // Réseau coupé ou trop lent : on ne retient rien, la prochaine lecture
    // retentera. Un générique non proposé n'a jamais cassé une soirée.
    return []
  }
}

/** Vide le cache — utile quand la bibliothèque change d'identifiants. */
export function forgetSkipTimes(): void {
  cache.clear()
}
