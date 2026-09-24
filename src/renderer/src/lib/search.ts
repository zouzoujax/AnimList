import { useCallback } from 'react'
import { aliasesOf, matchScore } from '@shared/search'
import type { Media } from '@shared/types'
import { useApp } from '@/store/app'

/**
 * « Est-ce que cette série répond à ce que j'ai tapé ? », avec les surnoms.
 *
 * Un seul endroit pour les trois recherches de la fenêtre — la bibliothèque,
 * sa version du nouveau design et la palette. Elles partageaient déjà le même
 * `titleMatches` ; leur laisser chacune son appariement tolérant aurait voulu
 * dire trois tolérances différentes selon l'endroit où l'on tape.
 *
 * Rend un score : zéro si ça ne correspond pas, plus c'est haut plus la
 * réponse est franche. Voir `shared/search.ts` pour les paliers.
 */
export function useMatcher(): (needle: string, media: Media) => number {
  const aliases = useApp((s) => s.prefs.aliases)
  return useCallback(
    (needle: string, media: Media) =>
      matchScore(needle, {
        titles: [media.title.romaji, media.title.english, media.title.native],
        aliases: aliasesOf(aliases, media.id)
      }),
    [aliases]
  )
}
