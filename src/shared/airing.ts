/**
 * Un épisode est-il sorti ?
 *
 * Une ligne, mais elle vivait dans la fenêtre seule — et la télécommande,
 * servie par le processus principal, laissait donc cocher un épisode qui
 * n'existe pas encore. Une règle appliquée à un seul des deux endroits par
 * lesquels on peut écrire n'est pas une règle.
 *
 * `nextAiringEpisode` d'AniList désigne le **prochain** épisode à paraître :
 * tout ce qui porte ce numéro ou un numéro supérieur reste à venir. Sans date
 * annoncée — série terminée, ou calendrier muet — rien n'est retenu : mieux
 * vaut laisser cocher que bloquer une série finie sur un doute.
 */

export interface AiringOf {
  nextAiring: { episode: number; airingAt: number } | null
}

export function isUnaired(media: AiringOf, episode: number): boolean {
  return media.nextAiring !== null && episode >= media.nextAiring.episode
}

/**
 * Cocher est-il permis ?
 *
 * Interdire de cocher un épisode à venir, oui ; interdire de le **décocher**
 * enfermerait la coche qui a réussi à passer — par un import, ou par une date
 * de diffusion repoussée après coup. La porte doit s'ouvrir dans les deux
 * sens.
 */
export function canTick(media: AiringOf, episode: number, alreadySeen: boolean): boolean {
  return alreadySeen || !isUnaired(media, episode)
}
