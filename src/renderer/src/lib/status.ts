import { canComplete } from '@shared/airing'
import type { Entry, LibraryStatus, Media } from '@shared/types'

/**
 * Pourquoi ce statut est refusé, ou `null` s'il est permis.
 *
 * Un seul cas aujourd'hui : on ne termine pas une série qui n'a pas fini de
 * sortir. Le texte est ici et non dans chaque page — sept endroits proposent
 * les cinq statuts (la fiche, celle du nouveau design, les cinq expériences),
 * et sept formulations de la même règle auraient fini par diverger.
 *
 * La règle elle-même est dans `shared/airing.ts`, avec ses tests : c'est elle
 * qui sait démêler le statut d'AniList de sa grille de diffusion.
 */
export function statusBlocked(status: LibraryStatus, media: Media, entry?: Entry | null): string | null {
  if (status !== 'completed') return null
  if (canComplete(media, entry?.status === 'completed')) return null
  return media.nextAiring
    ? `Elle n’a pas fini de sortir : l’épisode ${media.nextAiring.episode} est annoncé.`
    : 'Elle n’a pas fini de sortir.'
}
