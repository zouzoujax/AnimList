/**
 * Cocher un épisode sans ouvrir l'app.
 *
 * Deux portes : le bouton « Marquer vu » d'une notification de sortie, et
 * l'entrée « Vu : … » du clic droit sur l'icône de la barre des tâches. Les
 * deux arrivent ici, et passent par la même garde que la télécommande : un
 * épisode pas encore diffusé ne se coche pas, quel que soit le chemin.
 */

import { Notification } from 'electron'
import { canTick } from '@shared/airing'
import { isWatched, setWatched, snapshot } from './store'

/** L'argument qui porte l'épisode à cocher, quand un raccourci relance l'app. */
export const TICK_ARG = '--animelist-tick='

/** `{ animeId, episode }` lu dans une ligne de commande, s'il y en a un. */
export function tickTargetFrom(argv: string[]): { animeId: number; episode: number } | null {
  for (const arg of argv) {
    if (!arg.startsWith(TICK_ARG)) continue
    const [id, ep] = arg.slice(TICK_ARG.length).split(':').map(Number)
    if (Number.isInteger(id) && id > 0 && Number.isInteger(ep) && ep > 0) return { animeId: id, episode: ep }
  }
  return null
}

/**
 * Coche, puis le dit par une notification discrète : le geste a eu lieu hors
 * de la fenêtre, c'est là qu'il faut en voir le résultat.
 */
export function quickTick(animeId: number, episode: number): boolean {
  const data = snapshot()
  const media = data.media.find((m) => m.id === animeId)
  const already = isWatched(animeId, episode)
  const title = media ? (media.title.english ?? media.title.romaji) : 'Cette série'

  const ok = !already && (!media || canTick(media, episode, false))
  if (ok) setWatched(animeId, episode, true)

  if (Notification.isSupported()) {
    new Notification({
      title: ok ? `Épisode ${episode} coché` : already ? `Épisode ${episode} déjà coché` : 'Pas encore sorti',
      body: ok || already ? title : `${title} — l'épisode ${episode} n'est pas encore diffusé.`,
      silent: true
    }).show()
  }
  return ok
}
