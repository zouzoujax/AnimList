/**
 * Les séries en pause qu'on a oubliées.
 *
 * Cinq statuts, et « en pause » est le seul dont rien ne parle jamais : ni
 * l'accueil, ni les notifications, ni la file « à rattraper », qui ne regarde
 * que ce qu'on suit. Une série mise en pause un soir y reste des années, et
 * c'est précisément ce qu'une bibliothèque accumule.
 *
 * Le but n'est pas de faire reprendre : c'est de faire trancher. Reprendre,
 * abandonner pour de bon, ou constater qu'elle est finie — les trois referment
 * la série, et n'importe laquelle vaut mieux que la laisser dormir.
 */

const DAY_MS = 86_400_000

/**
 * Le délai avant qu'une pause devienne un oubli.
 *
 * Deux mois : en dessous, c'est une pause — on attend la suite, on a autre
 * chose en cours, on y revient. Rappeler à quelqu'un au bout d'une semaine
 * qu'il a mis une série en pause, c'est lui reprocher un choix qu'il vient de
 * faire.
 */
export const DORMANT_DAYS = 60

export interface PausedRow {
  animeId: number
  /** Dernier signe de vie : le dernier épisode coché, ou la mise en pause. */
  lastAt: number
  seen: number
  /** Épisodes diffusés à ce jour ; `null` quand la fiche ne le dit pas. */
  aired: number | null
}

export interface DormantSeries {
  animeId: number
  lastAt: number
  days: number
  seen: number
  /** Ce qui reste à voir ; `null` quand on ne peut pas le savoir. */
  remaining: number | null
}

/**
 * Celles qui dorment depuis assez longtemps, la plus ancienne d'abord.
 *
 * L'ancienneté prime sur le nombre d'épisodes restants : la question posée est
 * « celle-ci, tu la reprends ou pas ? », et c'est la plus enfouie qu'on a le
 * plus de chances d'avoir oubliée.
 */
export function dormantSeries(rows: PausedRow[], now: number, minDays = DORMANT_DAYS): DormantSeries[] {
  const out: DormantSeries[] = []
  for (const row of rows) {
    const days = Math.floor((now - row.lastAt) / DAY_MS)
    if (days < minDays) continue
    out.push({
      animeId: row.animeId,
      lastAt: row.lastAt,
      days,
      seen: row.seen,
      remaining: row.aired === null ? null : Math.max(0, row.aired - row.seen)
    })
  }
  return out.sort((a, b) => a.lastAt - b.lastAt)
}

/**
 * « 7 mois », « un an », « 2 ans ».
 *
 * Arrondi vers le bas et jamais au jour près : ce qui compte est l'ordre de
 * grandeur de l'oubli, pas sa date. « Dort depuis 213 jours » demande un
 * calcul mental pour dire ce que « sept mois » dit tout de suite.
 */
export function sleepLabel(days: number): string {
  const years = Math.floor(days / 365)
  if (years >= 2) return `${years} ans`
  if (years === 1) return 'un an'
  const months = Math.floor(days / 30)
  if (months >= 2) return `${months} mois`
  if (months === 1) return 'un mois'
  const weeks = Math.floor(days / 7)
  if (weeks >= 2) return `${weeks} semaines`
  return 'une semaine'
}

/**
 * Ce qu'on propose de faire, qui dépend de ce qu'il reste.
 *
 * Une série en pause dont tout est vu n'attend pas qu'on la reprenne : elle
 * attend qu'on la déclare finie. Confondre les deux, c'est proposer de
 * reprendre une série qui n'a plus un seul épisode à voir.
 */
export function dormantVerdict(series: DormantSeries): 'finish' | 'resume' {
  return series.remaining === 0 ? 'finish' : 'resume'
}
