import { useEffect, useState } from 'react'
import type { ChapterRelease } from '@shared/mangadex'
import { useApp } from '@/store/app'

const EMPTY: Record<number, ChapterRelease[]> = {}

/**
 * Les chapitres parus des mangas suivis, d'après MangaDex.
 *
 * Vide tant que la réponse n'est pas là : la page se dessine sans attendre, et
 * les chapitres s'y ajoutent. Redemandé quand la liste de lecture change de
 * composition, pas à chaque chapitre lu — le processus principal garde tout
 * six heures.
 */
export function useMangaChapters(): Record<number, ChapterRelease[]> {
  const key = useApp((s) => [...s.mangaEntries.keys()].sort((a, b) => a - b).join())
  const [held, setHeld] = useState<{ key: string; data: Record<number, ChapterRelease[]> }>({ key: '', data: EMPTY })
  useEffect(() => {
    if (!key) return
    let alive = true
    window.api.manga
      .chapters()
      .then((data) => alive && setHeld({ key, data }))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [key])
  return held.key === key ? held.data : EMPTY
}
