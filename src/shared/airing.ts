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

/**
 * Ce qu'il faut savoir d'une série pour dire si elle a fini de sortir.
 *
 * Le statut d'AniList et la grille : ni l'un ni l'autre ne suffit seul, pour
 * la raison expliquée plus haut — leur grille met des heures à avancer après
 * une diffusion, et leur statut des jours à passer à « terminé ».
 */
export interface AiredOf extends AiringOf {
  status: string | null
  episodes: number | null
}

/**
 * La série a-t-elle fini de sortir ?
 *
 * On ne peut pas terminer ce qui n'est pas fini de paraître. La question n'a
 * rien à voir avec ce qu'on a vu : quelqu'un peut avoir regardé une série
 * entière ailleurs et la marquer terminée sans cocher un épisode. Ce qui est
 * absurde, c'est de déclarer finie une série dont le prochain épisode a une
 * date.
 *
 * « Annulée » compte comme finie : il n'en sortira plus rien, et laisser une
 * série annulée bloquée en « en cours » pour toujours serait pire.
 *
 * Le cas limite est celui du dernier épisode : AniList garde son annonce
 * plusieurs heures après sa diffusion, si bien que la série reste « en cours »
 * chez eux alors que tout est sorti. L'heure tranche, comme pour `isUnaired`.
 */
export function isFullyAired(media: AiredOf, now: number = Date.now()): boolean {
  if (media.status === 'FINISHED' || media.status === 'CANCELLED') return true
  if (media.status === 'NOT_YET_RELEASED') return false

  const next = media.nextAiring
  // Aucune date annoncée : sans autre signe, on s'en remet au statut, et
  // « en cours de diffusion » veut dire qu'il reste quelque chose à venir.
  if (next === null) return media.status !== 'RELEASING' && media.status !== 'HIATUS'

  // Le dernier épisode annoncé, et son heure est passée : tout est sorti,
  // même si leur fiche ne l'a pas encore enregistré.
  if (media.episodes !== null && next.episode >= media.episodes) return next.airingAt * 1000 <= now

  return false
}

/**
 * Peut-on marquer cette série comme terminée ?
 *
 * Jamais un piège : une série déjà marquée terminée — par un import, ou parce
 * qu'elle l'était à l'époque — le reste, et on peut toujours en sortir. La
 * règle n'interdit que d'y **entrer** trop tôt.
 */
export function canComplete(media: AiredOf, alreadyCompleted: boolean, now: number = Date.now()): boolean {
  return alreadyCompleted || isFullyAired(media, now)
}
