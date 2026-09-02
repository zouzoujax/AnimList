/**
 * Ce que l'app sait de ce qu'on regarde, à cet instant.
 *
 * Trois lecteurs coexistent et aucun ne se ressemble : le lecteur intégré pour
 * un fichier du disque, la fenêtre Anime-Sama, la bande-annonce. Deux
 * fonctions ont besoin de la réponse — la télécommande, pour afficher la bonne
 * jaquette sur le téléphone, et le statut Discord. Sans ce module elles
 * garderaient chacune leur version, qui divergeraient au premier changement.
 *
 * Rien n'est écrit sur le disque. C'est de l'état vivant : à la fermeture de
 * l'app, il n'y a plus rien à regarder, et le retenir n'aurait aucun sens.
 *
 * **Deux natures, et c'est voulu.** Le lecteur intégré *pousse* ce qu'il fait,
 * parce qu'il est seul à connaître sa pause et sa position à la seconde. Les
 * fenêtres extérieures, elles, se laissent *interroger* : ce qu'on a lancé est
 * noté ici, l'état réel se demande à la page au moment où on en a besoin.
 */

import type { LocalWatching } from '@shared/discord'
import { getMedia } from './store'

/** Ce qu'on a lancé dans une fenêtre extérieure, que son titre ne dit pas. */
export interface Launched {
  title: string
  cover: string
  episode: number | null
  /** Quand ce n'est pas un épisode : « Bande-annonce ». */
  note?: string
}

let launched: Launched | null = null
let local: LocalWatching | null = null

/**
 * Retient ce qu'on vient d'ouvrir chez eux.
 *
 * Le titre d'une fenêtre ne dit pas grand-chose — celle d'Anime-Sama s'appelle
 * « Anime-Sama », rien de plus.
 */
export function setLaunched(value: Launched | null): void {
  launched = value
}

export function getLaunched(): Launched | null {
  return launched
}

export type { LocalWatching }

export function setLocalWatching(value: LocalWatching | null): void {
  local = value
}

export function getLocalWatching(): LocalWatching | null {
  return local
}

/**
 * Note ce qu'on vient d'ouvrir, d'après la fiche déjà en cache.
 *
 * Une fiche inconnue efface la note au lieu de la laisser : garder la
 * précédente ferait annoncer la mauvaise série, ce qui est pire que de n'en
 * annoncer aucune.
 */
export function rememberLaunch(animeId: number | undefined, episode: number | null, note?: string): void {
  const media = animeId === undefined ? undefined : getMedia(animeId)
  if (!media) return setLaunched(null)
  setLaunched({ title: media.title.english ?? media.title.romaji, cover: media.cover.large, episode, note })
}
