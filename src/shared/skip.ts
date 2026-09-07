/**
 * Passer un générique.
 *
 * Les minutages viennent d'AniSkip, une base participative indexée par
 * identifiant MyAnimeList — celui-là même que l'app connaît déjà pour repérer
 * les épisodes hors intrigue. Mesuré sur vingt-quatre séries tirées de la
 * bibliothèque : vingt-deux ont un minutage, soit 92 %.
 *
 * Rien n'est extrait ni contourné. On sait où commence le générique, et on
 * demande au lecteur d'avancer — le même geste que faire glisser la barre de
 * progression, décidé par un chiffre plutôt qu'à l'œil.
 *
 * Deux garde-fous portent tout le reste, et ils tiennent à la nature de la
 * donnée : elle est relevée par des inconnus, sur une copie qui n'est pas
 * forcément celle qu'on regarde.
 *
 * **La durée de référence doit correspondre.** AniSkip joint la durée de
 * l'épisode sur lequel le minutage a été pris. Une version recadrée, un
 * épisode double, une rediffusion sans le récapitulatif : les secondes ne
 * tombent plus au même endroit, et sauter à l'aveugle envoie au milieu d'une
 * scène. Trop d'écart, on ne propose rien.
 *
 * **Un saut trop court ne vaut pas d'être proposé.** Un bouton qui fait gagner
 * trois secondes coûte plus d'attention qu'il n'en épargne.
 */

export type SkipKind = 'op' | 'ed'

export interface SkipRange {
  kind: SkipKind
  /** Secondes depuis le début de l'épisode. */
  start: number
  end: number
  /** Durée de l'épisode sur lequel le minutage a été relevé. */
  reference: number
}

export const SKIP_LABELS: Record<SkipKind, string> = {
  op: 'Passer l’opening',
  ed: 'Passer le générique de fin'
}

/** Écart toléré entre la durée de référence et celle du lecteur. */
export const LENGTH_TOLERANCE_S = 60

/** En deçà, le bouton coûte plus d'attention qu'il n'en fait gagner. */
export const MIN_SKIP_S = 5

/**
 * Ce qui peut rester après un générique de fin sans que l'épisode soit fini.
 *
 * Beaucoup de séries collent un aperçu du prochain épisode après le générique,
 * et certains le regardent. Au-delà de ce seuil on suppose qu'il y a quelque
 * chose à voir ; en deçà, il n'y a plus que du noir.
 */
export const TAIL_S = 15

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : NaN)

/**
 * Lit la réponse d'AniSkip, en se méfiant de tout.
 *
 * Une base ouverte contient ce qu'on y a mis : des bornes inversées, des
 * négatives, des types inconnus. Une ligne douteuse est écartée, pas corrigée —
 * deviner ce qu'un contributeur voulait dire reviendrait à inventer le
 * minutage soi-même.
 */
export function parseSkipTimes(raw: unknown): SkipRange[] {
  const body = raw as { found?: unknown; results?: unknown }
  if (!Array.isArray(body?.results)) return []

  const out: SkipRange[] = []
  for (const item of body.results as Record<string, unknown>[]) {
    const kind = item?.skipType
    if (kind !== 'op' && kind !== 'ed') continue

    const interval = item.interval as Record<string, unknown> | undefined
    const start = num(interval?.startTime)
    const end = num(interval?.endTime)
    const reference = num(item.episodeLength)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    if (start < 0 || end <= start) continue

    out.push({ kind, start, end, reference: Number.isFinite(reference) ? reference : 0 })
  }
  return out
}

/**
 * Ce minutage est-il utilisable sur la copie qu'on regarde ?
 *
 * Une référence à zéro veut dire qu'AniSkip n'en donne pas : on l'accepte,
 * faute de mieux, plutôt que de tout refuser sur une donnée manquante.
 */
export function usable(range: SkipRange, duration: number): boolean {
  if (!Number.isFinite(duration) || duration <= 0) return false
  if (range.end - range.start < MIN_SKIP_S) return false
  // Un générique qui déborde de l'épisode désigne une autre copie que celle-ci.
  if (range.end > duration + 1) return false
  if (range.reference > 0 && Math.abs(range.reference - duration) > LENGTH_TOLERANCE_S) return false
  return true
}

/**
 * Le générique en train de passer, s'il y en a un.
 *
 * La borne de fin est exclue d'une seconde : proposer de sauter à l'endroit où
 * l'on se trouve déjà ferait clignoter un bouton sans effet.
 */
export function activeSkip(ranges: SkipRange[], position: number, duration: number): SkipRange | null {
  if (!Number.isFinite(position)) return null
  for (const range of ranges) {
    if (!usable(range, duration)) continue
    if (position >= range.start && position < range.end - 1) return range
  }
  return null
}

/**
 * Ce générique de fin termine-t-il l'épisode ?
 *
 * La question change ce que le bouton doit faire. Quand rien ne suit, sauter
 * le générique dépose sur du noir, et il faut encore attendre le compte à
 * rebours de l'enchaînement : on a remplacé une attente par une autre. Mieux
 * vaut alors passer directement à l'épisode suivant.
 */
export function endsTheEpisode(range: SkipRange, duration: number): boolean {
  if (range.kind !== 'ed') return false
  if (!Number.isFinite(duration) || duration <= 0) return false
  return duration - range.end <= TAIL_S
}
