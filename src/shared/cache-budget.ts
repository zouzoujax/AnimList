/**
 * Ce qu'on garde d'un cache disque, et ce qu'on laisse tomber.
 *
 * Deux règles, dans cet ordre.
 *
 * **L'âge d'abord.** Une réponse périmée sert de secours quand le réseau
 * manque : mieux vaut un horaire d'hier que rien. Mais un horaire vieux de
 * trente-quatre jours, dont la fraîcheur était de trente minutes, n'est plus un
 * secours — c'est du remplissage. Au-delà d'un multiple de sa propre fraîcheur,
 * une entrée est jetée.
 *
 * **Le poids ensuite.** Compter les entrées ne veut rien dire quand l'une pèse
 * 292 Ko et l'autre 200 octets : c'est le défaut qui avait laissé le cache
 * AniList monter à 7,4 Mo sous un plafond de six cents entrées jamais atteint.
 * On garde donc les plus récentes jusqu'à épuisement d'un budget en octets.
 */

export interface Aged {
  /** Date de mise en cache. */
  at: number
  /** Fraîcheur de cette entrée, en millisecondes. Absente sur les vieux fichiers. */
  ttl?: number
}

export interface BudgetOptions {
  now: number
  maxBytes: number
  /** Multiple de la fraîcheur au-delà duquel une entrée cesse de servir. */
  staleFactor: number
  /** Pour les entrées écrites avant que la fraîcheur ne soit enregistrée. */
  defaultTtl: number
  /**
   * Durée en deçà de laquelle on ne jette jamais, quelle que soit la fraîcheur.
   *
   * Sans ce plancher, une recherche fraîche dix minutes disparaît au bout de
   * cinq heures et quelqu'un hors ligne se retrouve devant des écrans vides.
   * C'est le budget en octets qui borne la taille ; l'âge ne sert qu'à écarter
   * ce qui n'a plus aucune valeur.
   */
  minKeepMs: number
}

export interface BudgetResult<T> {
  kept: [string, T][]
  /** Ce qui est parti, pour pouvoir le dire. */
  droppedExpired: number
  droppedForSize: number
  bytes: number
}

export function applyBudget<T extends Aged>(
  rows: [string, T][],
  { now, maxBytes, staleFactor, defaultTtl, minKeepMs }: BudgetOptions
): BudgetResult<T> {
  const alive: [string, T][] = []
  let droppedExpired = 0

  for (const row of rows) {
    const ttl = row[1].ttl ?? defaultTtl
    const horizon = Math.max(ttl * staleFactor, minKeepMs)
    if (now - row[1].at >= horizon) droppedExpired += 1
    else alive.push(row)
  }

  // La plus récente d'abord : si le budget manque, c'est la plus vieille qui
  // saute, jamais celle qu'on vient d'obtenir.
  alive.sort((a, b) => b[1].at - a[1].at)

  const kept: [string, T][] = []
  let bytes = 0
  for (const row of alive) {
    const weight = JSON.stringify(row).length
    if (bytes + weight > maxBytes && kept.length > 0) break
    bytes += weight
    kept.push(row)
  }

  return { kept, droppedExpired, droppedForSize: alive.length - kept.length, bytes }
}
