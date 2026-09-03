/**
 * Un épisode est-il sorti ?
 *
 * Une ligne, mais elle vivait dans la fenêtre seule — et la télécommande,
 * servie par le processus principal, laissait donc cocher un épisode qui
 * n'existe pas encore. Une règle appliquée à un seul des deux endroits par
 * lesquels on peut écrire n'est pas une règle.
 *
 * `nextAiringEpisode` d'AniList désigne le **prochain** épisode à paraître.
 * Tout ce qui porte un numéro supérieur reste à venir, et sans date annoncée —
 * série terminée, ou calendrier muet — rien n'est retenu : mieux vaut laisser
 * cocher que bloquer une série finie sur un doute.
 *
 * **L'épisode annoncé lui-même se juge à l'heure, pas au numéro.** Ce champ ne
 * bascule pas au moment de la diffusion : il reste sur l'épisode qui vient de
 * sortir tant qu'AniList n'a pas avancé sa grille, ce qui prend parfois des
 * heures. Vu sur Tomb Raider King, épisode 9 : disponible partout, annoncé pour
 * la veille à 18h15, et toujours donné comme « prochain » huit heures plus
 * tard. Ne regarder que le numéro le verrouillait alors qu'il était sorti.
 *
 * L'heure est déjà dans la fiche, donc la correction ne demande aucun appel
 * réseau — ce qui compte le jour où leur API tombe, puisque la fiche ne peut
 * alors plus se rafraîchir et resterait bloquée indéfiniment.
 */

export interface AiringOf {
  nextAiring: { episode: number; airingAt: number } | null
}

export function isUnaired(media: AiringOf, episode: number, now: number = Date.now()): boolean {
  const next = media.nextAiring
  if (next === null) return false
  // Au-delà de l'épisode annoncé, rien n'est sorti : on ne sait même pas quand.
  if (episode > next.episode) return true
  if (episode < next.episode) return false
  // Celui qui est annoncé : à venir jusqu'à son heure, sorti une fois passée.
  return next.airingAt * 1000 > now
}

/**
 * Cocher est-il permis ?
 *
 * Interdire de cocher un épisode à venir, oui ; interdire de le **décocher**
 * enfermerait la coche qui a réussi à passer — par un import, ou par une date
 * de diffusion repoussée après coup. La porte doit s'ouvrir dans les deux
 * sens.
 */
export function canTick(media: AiringOf, episode: number, alreadySeen: boolean, now: number = Date.now()): boolean {
  return alreadySeen || !isUnaired(media, episode, now)
}
