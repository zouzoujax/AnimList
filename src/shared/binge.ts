/**
 * Quand un épisode est vu, et quand le suivant peut partir.
 *
 * Deux décisions, prises à partir de ce que le lecteur raconte : la position,
 * la durée, et s'il joue. Ce module ne coche rien et n'ouvre rien — c'est ce
 * qui permet de vérifier ses limites sans lancer d'épisode.
 *
 * Les deux seuils ne se ressemblent pas, parce qu'ils ne répondent pas à la
 * même question :
 *
 * - **vu** se décide aux neuf dixièmes, la convention partout. Ce qui reste
 *   après, c'est le générique de fin : personne ne considère avoir manqué un
 *   épisode parce qu'il a coupé pendant le générique ;
 * - **fini** se décide au temps restant, pas à une fraction. Vingt secondes
 *   d'un épisode de vingt-quatre minutes, c'est 98,6 % ; d'un film de deux
 *   heures, c'est 99,7 %. Une fraction unique enchaînerait trop tôt sur l'un
 *   ou trop tard sur l'autre.
 */

/** Ce que le lecteur rapporte, réduit à ce qui sert ici. */
export interface Playing {
  /** Secondes. */
  position: number
  duration: number
  playing: boolean
}

/**
 * En dessous, ce n'est pas un épisode.
 *
 * Une publicité de trente secondes porte elle aussi une position et une durée,
 * et sa fin arrive vite. Sans ce plancher, elle cocherait l'épisode et
 * lancerait le suivant avant que le générique de début ne commence.
 */
export const MIN_DURATION_S = 120

/** Neuf dixièmes : au-delà, ce qui reste est le générique de fin. */
export const SEEN_RATIO = 0.9

/** Le temps restant en dessous duquel l'épisode est fini. */
export const OVER_LEFT_S = 20

/** Une lecture dont on peut tirer quelque chose. */
export function playable(now: Playing): boolean {
  if (!Number.isFinite(now.duration) || !Number.isFinite(now.position)) return false
  if (now.duration < MIN_DURATION_S) return false
  // Une position au-delà de la durée trahit un lecteur qui change de source :
  // les deux valeurs ne décrivent alors pas la même vidéo.
  return now.position >= 0 && now.position <= now.duration + 1
}

/** Vrai quand l'épisode mérite d'être coché, et ne l'est pas déjà. */
/**
 * Où en est la lecture, entre 0 et 1.
 *
 * La même mesure que celle qui décide de cocher, exprès : le remplissage d'une
 * case et la coche automatique doivent raconter la même chose. Une case pleine
 * aux neuf dixièmes qui ne se coche pas — ou l'inverse — se lirait comme un
 * bug, et il faudrait aller vérifier laquelle des deux ment.
 *
 * Zéro quand la lecture n'est pas mesurable : mieux vaut ne rien montrer qu'un
 * remplissage inventé.
 */
export function watchedRatio(now: Playing): number {
  if (!playable(now)) return 0
  return Math.min(1, Math.max(0, now.position / now.duration))
}

export function shouldTick(now: Playing, alreadySeen: boolean): boolean {
  if (alreadySeen || !playable(now)) return false
  return now.position / now.duration >= SEEN_RATIO
}

/**
 * Vrai quand le suivant peut partir.
 *
 * La pause compte : quelqu'un qui arrête volontairement sa lecture dans le
 * générique ne demande pas la suite. Un lecteur arrivé au bout se met en pause
 * tout seul, lui — d'où la seconde qui reste, qu'on n'obtient qu'en laissant
 * l'épisode finir.
 */
export function shouldAdvance(now: Playing): boolean {
  if (!playable(now)) return false
  const left = now.duration - now.position
  if (left > OVER_LEFT_S) return false
  return now.playing || left <= 1
}
