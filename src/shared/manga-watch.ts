/**
 * Ce qui mérite d'être dit sur les mangas suivis : une fin de parution, une
 * adaptation animée.
 *
 * AniList n'annonce pas les chapitres d'une série qui paraît — son total reste
 * vide jusqu'à la fin —, si bien qu'un « nouveau chapitre » ne se voit pas
 * d'ici. Deux choses, elles, se voient : le jour où la série se termine, et
 * celui où un anime tiré d'elle apparaît dans ses relations.
 *
 * Pur et testé, comme `badge-log.ts` : c'est ce qui décide de faire sonner une
 * notification, et une alerte répétée ou fausse lasse plus vite qu'aucune.
 *
 * La règle qui tient tout : **on ne signale qu'un changement**. Un manga vu
 * pour la première fois est relevé en silence — il était déjà fini, ou déjà
 * adapté, quand on l'a ajouté, et ce n'est pas une nouvelle.
 */

import type { LibraryStatus, MangaEntry, MangaSeen } from './types'

/** Un anime tiré d'un manga, tel que la relation d'AniList le décrit. */
export interface Adaptation {
  id: number
  title: string
  format: string | null
  status: string | null
}

/** Ce qu'AniList dit aujourd'hui d'un manga suivi. */
export interface MangaNow {
  status: string | null
  chapters: number | null
  adaptations: Adaptation[]
}

export type MangaNews =
  | {
      kind: 'finished'
      mangaId: number
      /** Le nombre de chapitres, une fois la série finie. */
      total: number | null
      /** Ce qu'il reste à lire. `null` si le total n'est pas donné. */
      left: number | null
    }
  | { kind: 'adaptation'; mangaId: number; anime: Adaptation }

/** Une série qu'on a lue en entier ou laissée : sa fin ne change rien à la lecture. */
const DONE_WITH: LibraryStatus[] = ['completed', 'dropped']

/**
 * Les nouvelles de ce passage, et le relevé à garder pour le suivant.
 *
 * `own` : les animes déjà dans la bibliothèque. Une adaptation qu'on suit déjà
 * — ajoutée à la main, ou par un passage précédent — n'est pas une nouvelle.
 * Un manga abandonné n'annonce pas son adaptation : on ne voulait plus de
 * l'histoire. Un manga qu'on ne trouve pas dans la réponse garde son relevé :
 * une panne ne doit pas faire tout redécouvrir au passage suivant.
 */
export function mangaNews(
  entries: MangaEntry[],
  seen: Record<string, MangaSeen>,
  found: Map<number, MangaNow>,
  own: Set<number>
): { news: MangaNews[]; seen: Record<string, MangaSeen> } {
  const news: MangaNews[] = []
  const next: Record<string, MangaSeen> = {}

  for (const entry of entries) {
    const key = String(entry.mangaId)
    const now = found.get(entry.mangaId)
    const before = seen[key]
    if (!now) {
      if (before) next[key] = before
      continue
    }

    const finished = now.status === 'FINISHED'
    const anime = now.adaptations.map((a) => a.id)
    next[key] = { finished, anime }
    if (!before) continue

    if (finished && !before.finished && !DONE_WITH.includes(entry.status)) {
      news.push({
        kind: 'finished',
        mangaId: entry.mangaId,
        total: now.chapters,
        left: now.chapters ? Math.max(0, now.chapters - entry.chapter) : null
      })
    }

    if (entry.status === 'dropped') continue
    const known = new Set(before.anime)
    for (const a of now.adaptations) {
      if (known.has(a.id) || own.has(a.id)) continue
      news.push({ kind: 'adaptation', mangaId: entry.mangaId, anime: a })
    }
  }

  return { news, seen: next }
}
