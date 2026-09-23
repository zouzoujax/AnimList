/**
 * Le son d'un badge, fabriqué à la volée.
 *
 * Aucun fichier : trois notes et une enveloppe tiennent en quelques lignes, ne
 * pèsent rien dans le paquet, et ne posent aucune question de licence — ce
 * qu'un son tout fait trouvé sur le web poserait, même « gratuit ».
 *
 * Un accord majeur monté en arpège, très court, avec une note grave qui le
 * pose. C'est un applaudissement, pas une alarme : il doit pouvoir arriver
 * pendant un épisode sans faire sursauter.
 */

/** La, do dièse, mi — un accord majeur, deux octaves au-dessus du la du diapason. */
const NOTES = [880, 1108.73, 1318.51]

/** L'écart entre deux notes de l'arpège. */
const STEP_S = 0.075

/** Assez court pour ne pas couvrir la scène qui joue derrière. */
const DECAY_S = 0.42

/** Bas : c'est une confirmation, pas une notification système. */
const PEAK = 0.16

/**
 * Créé une seule fois et gardé : un contexte par son finit par se faire
 * refuser par le navigateur, qui en limite le nombre.
 */
let context: AudioContext | null = null

function audio(): AudioContext | null {
  if (context) return context
  try {
    context = new AudioContext()
    return context
  } catch {
    // Pas de sortie audio, ou un navigateur qui refuse : le badge se fête en
    // silence. Une victoire muette vaut mieux qu'une erreur.
    return null
  }
}

/**
 * Joue le son, si on peut.
 *
 * Ne rejette jamais : l'appelant est une animation, et un son manquant ne doit
 * rien interrompre. Le contexte démarre parfois suspendu — quand rien n'a
 * encore été cliqué, par exemple si le badge tombe sur une coche automatique —
 * et `resume()` échoue alors sans conséquence.
 */
export async function playBadgeChime(): Promise<void> {
  const ctx = audio()
  if (!ctx) return

  try {
    if (ctx.state === 'suspended') await ctx.resume()

    const start = ctx.currentTime + 0.01
    for (const [i, note] of NOTES.entries()) {
      const at = start + i * STEP_S
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      // Une sinusoïde seule sonne creux, une dent de scie sonne dure : le
      // triangle a juste ce qu'il faut d'harmoniques pour s'entendre.
      osc.type = 'triangle'
      osc.frequency.value = note

      // Une attaque franche puis une décroissance exponentielle : c'est la
      // forme d'une corde pincée. Jamais zéro, que `exponentialRamp` refuse.
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(PEAK, at + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + DECAY_S)

      osc.connect(gain).connect(ctx.destination)
      osc.start(at)
      osc.stop(at + DECAY_S + 0.02)
    }
  } catch {
    // Contexte fermé entre-temps, sortie audio débranchée : on laisse tomber.
  }
}
