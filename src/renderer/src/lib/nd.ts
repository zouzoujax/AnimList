import type { NewDesignPage } from '@shared/types'
import { useApp } from '@/store/app'

/**
 * Cette page prend-elle le nouveau design ?
 *
 * Il faut l'interrupteur général et celui de la page. Une page absente du
 * réglage enregistré — ajoutée après coup — suit l'interrupteur général.
 */
export function useNewDesign(page: NewDesignPage): boolean {
  return useApp((s) => s.prefs.newDesign && s.prefs.newDesignPages?.[page] !== false)
}
