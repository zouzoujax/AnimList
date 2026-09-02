/**
 * Reconnaître un anime depuis une image.
 *
 * trace.moe compare l'image à un index de toutes les scènes et rend jusqu'à
 * dix candidats, du plus proche au plus lointain. Le piège est que la liste
 * n'est **jamais vide** : une image sans le moindre rapport reçoit quand même
 * dix réponses, avec des similarités autour de 0,5. Afficher la première venue
 * reviendrait à affirmer n'importe quoi avec aplomb.
 *
 * D'où le seuil, et d'où le fait qu'il soit ici, isolé et testé : c'est la
 * seule chose qui sépare « c'est cette scène-là » de « je n'en sais rien ».
 */

/**
 * Au-dessus, la correspondance est sûre — c'est le seuil que trace.moe
 * recommande lui-même. En dessous, on montre le résultat mais on prévient.
 */
export const RELIABLE_SIMILARITY = 0.87

/** Sous ce niveau, il n'y a rien à montrer du tout : ce serait du bruit. */
export const FLOOR_SIMILARITY = 0.6

export interface RawMatch {
  /** Identifiant AniList de la série reconnue. */
  anilist: number
  /** Numéro d'épisode. Absent pour un film, ou quand l'index l'ignore. */
  episode: number | null
  /** Bornes de la scène, en secondes. */
  from: number
  to: number
  /** De 0 à 1. */
  similarity: number
  /** Vignette de la scène trouvée, servie par trace.moe. */
  image: string
}

export function isReliable(similarity: number): boolean {
  return similarity >= RELIABLE_SIMILARITY
}

/**
 * Réduit la réponse brute à ce qui mérite d'être montré.
 *
 * Une même série revient souvent plusieurs fois, sur des scènes voisines :
 * seule la meilleure est gardée, sinon la liste répète trois fois le même
 * titre et cache les autres candidats.
 */
export function bestMatches(raw: RawMatch[], limit = 6): RawMatch[] {
  const best = new Map<number, RawMatch>()

  for (const match of raw) {
    if (!Number.isFinite(match.similarity) || match.similarity < FLOOR_SIMILARITY) continue
    const held = best.get(match.anilist)
    if (!held || match.similarity > held.similarity) best.set(match.anilist, match)
  }

  return [...best.values()].sort((a, b) => b.similarity - a.similarity).slice(0, limit)
}

/**
 * Ce que l'écran doit dire de l'ensemble.
 *
 * Trois cas seulement, et le troisième compte autant que les deux autres :
 * ne rien avoir trouvé est une réponse, pas une erreur.
 */
export type Verdict = 'sure' | 'unsure' | 'none'

export function verdictOf(matches: RawMatch[]): Verdict {
  if (!matches.length) return 'none'
  return isReliable(matches[0].similarity) ? 'sure' : 'unsure'
}
