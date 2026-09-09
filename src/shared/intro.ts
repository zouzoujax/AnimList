/**
 * L'ouverture de l'app : ses durées, et la poussière qui flotte au fond.
 *
 * Deux choses vivent ici plutôt que dans le composant.
 *
 * **Les durées**, parce qu'elles se lisent d'un coup d'œil et se règlent sans
 * relire une chorégraphie. Un écran d'ouverture est un péage : on le traverse
 * à chaque lancement, et cent lancements plus tard sa durée n'est plus une
 * question de goût.
 *
 * **Les positions des grains**, parce qu'elles doivent être *stables*. Tirées
 * au hasard pendant le rendu, elles sautent à chaque fois que React redessine
 * — un ciel qui se réarrange en pleine animation. Un générateur à graine rend
 * la même poussière pour la même graine, et la même ouverture à chaque
 * lancement.
 */

/** L'ouverture complète, du noir à l'app. */
export const INTRO_MS = 2800

/**
 * Quand le mouvement est réduit dans les réglages.
 *
 * Pas zéro : la marque a encore le droit de se présenter. Mais sans rien qui
 * bouge, et assez court pour ne pas ressembler à une attente.
 */
export const INTRO_REDUCED_MS = 900

export interface Mote {
  /** Fraction de la largeur et de la hauteur, entre 0 et 1. */
  x: number
  y: number
  /** Diamètre en pixels. */
  size: number
  /** Retard avant d'apparaître, en secondes. */
  delay: number
  /** Durée de sa dérive, en secondes. */
  drift: number
}

/** Assez pour un ciel, assez peu pour ne rien coûter à l'ouverture. */
export const MOTE_COUNT = 18

/**
 * Générateur à graine, algorithme mulberry32.
 *
 * Quatre lignes, aucune dépendance, et la même suite pour la même graine —
 * c'est tout ce qu'on demande à un hasard qui doit se reproduire.
 */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * La poussière du fond.
 *
 * Le centre est laissé libre : les grains y passeraient derrière la marque, où
 * ils ne se verraient pas et brouilleraient le halo. Ils naissent donc sur les
 * bords, ce qui creuse l'écran au lieu de l'encombrer.
 */
export function motes(count = MOTE_COUNT, seed = 7): Mote[] {
  const rnd = seeded(seed)
  const out: Mote[] = []

  for (let i = 0; i < count; i += 1) {
    // Un anneau plutôt qu'un disque, et borné à 0,46 : au-delà, un grain placé
    // dans un coin sortait de l'écran — vu en test, à x = -0,002.
    const angle = rnd() * Math.PI * 2
    const radius = 0.32 + rnd() * 0.14
    out.push({
      x: 0.5 + Math.cos(angle) * radius,
      y: 0.5 + Math.sin(angle) * radius,
      size: 2 + rnd() * 4,
      delay: rnd() * 0.9,
      drift: 3 + rnd() * 3
    })
  }

  return out
}
