/**
 * La soirée en cours, côté processus principal.
 *
 * La liste est composée dans la fenêtre, mais c'est le surveillant de lecture
 * qui en a besoin — et lui tourne même quand aucune fenêtre n'est ouverte. Elle
 * vit donc ici, pas dans le magasin de la fenêtre.
 *
 * Rien n'est écrit sur le disque : une soirée ne survit pas à la fermeture de
 * l'app. C'est voulu — reprendre trois jours plus tard une liste composée pour
 * « ce soir » n'aurait aucun sens, et il faudrait alors décider quand l'oublier.
 */

import { nextInSession, type NextStep, type Slot } from '@shared/soiree'

let slots: Slot[] = []

/** Remplace la soirée en cours. Une liste vide l'annule. */
export function startSoiree(next: Slot[]): void {
  slots = Array.isArray(next) ? next.filter((s) => s && s.animeId > 0 && s.episode > 0) : []
}

export function stopSoiree(): void {
  slots = []
}

export function soireeSlots(): Slot[] {
  return slots
}

/** Ce qui suit l'épisode qui vient de finir, si une soirée le gouverne. */
export function soireeNext(animeId: number, episode: number): NextStep {
  return nextInSession(slots, animeId, episode)
}
