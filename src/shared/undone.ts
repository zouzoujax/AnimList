/**
 * Ce qu'on retient d'un épisode décoché, pour ne pas mentir en le recochant.
 *
 * Décocher efface la ligne d'historique ; recocher en écrit une neuve, datée de
 * l'instant. Les deux gestes pris séparément sont justes, mais enchaînés ils
 * réécrivent le passé : huit épisodes vus en août reviennent datés d'aujourd'hui
 * et « Ces 7 jours » les compte comme neufs. Le compteur ne mesure alors plus le
 * visionnage, il mesure les corrections.
 *
 * D'où cette mémoire : la ligne effacée est mise de côté, et un recochage la
 * remet telle quelle — même date, même durée, même note. Décocher redevient ce
 * qu'on croyait que c'était, un geste annulable.
 *
 * Elle ne prétend pas être éternelle. Un bac de correction se borne, sinon il
 * grossit indéfiniment dans le fichier de données pour des épisodes que
 * personne ne recochera jamais.
 */

import type { WatchEvent } from './types'

export interface Undone {
  /** La ligne retirée de l'historique, intacte. */
  event: WatchEvent
  /** Quand on l'a décochée. Sert uniquement à borner la mémoire. */
  undoneAt: number
}

/** Assez pour une saison décochée par erreur, pas de quoi peser. */
export const MAX_UNDONE = 500

/**
 * Passé un an, un épisode décoché ne sera pas recoché « par erreur » : s'il
 * revient, c'est un nouveau visionnage, et il mérite sa date d'aujourd'hui.
 */
export const MAX_UNDONE_AGE_DAYS = 365

/** La passe fait partie de la clé : deux visionnages ne se confondent pas. */
export const undoneKey = (animeId: number, episode: number, pass: number): string =>
  `${animeId}:${episode}:${pass}`

export function pruneUndone(
  memo: Record<string, Undone>,
  now = Date.now(),
  max = MAX_UNDONE,
  maxAgeDays = MAX_UNDONE_AGE_DAYS
): Record<string, Undone> {
  const cutoff = now - maxAgeDays * 86_400_000
  const kept = Object.entries(memo)
    .filter(([, u]) => u?.event && typeof u.undoneAt === 'number' && u.undoneAt >= cutoff)
    // Les plus récemment décochés gagnent : ce sont ceux qu'on peut encore vouloir reprendre.
    .sort((a, b) => b[1].undoneAt - a[1].undoneAt)
    .slice(0, max)
  return Object.fromEntries(kept)
}
