import type { HTMLMotionProps } from 'motion/react'
import type { ReactNode } from 'react'
import { THEMES, type Entry, type ExperienceId, type LibraryStatus, type Media } from '@shared/types'
import { useApp } from '@/store/app'
import { carnet } from './Carnet'
import { gameConsole } from './Console'
import { hud } from './Hud'
import { magazine } from './Magazine'
import { streaming } from './Streaming'

/**
 * Ce qu'une expérience remplace.
 *
 * La navigation, l'accueil et la bibliothèque sont les trois écrans qu'on voit
 * en premier et qui disent « c'est une autre app » ; les transitions changent la
 * façon dont on passe de l'un à l'autre. Les pages profondes (fiche,
 * statistiques, réglages) restent celles de l'app, habillées par les jetons du
 * thème : les refaire cinq fois multiplierait les bugs sans rien apprendre de
 * plus sur le goût.
 */
export interface Experience {
  Nav: () => React.JSX.Element
  Home: () => React.JSX.Element
  Library: () => React.JSX.Element
  Stats?: () => React.JSX.Element
  /** Le mur des badges : dans les thèmes classiques, il vit au bas des Statistiques. */
  Badges?: () => React.JSX.Element
  Discover?: (props: { initialSearch?: string }) => React.JSX.Element
  Calendar?: () => React.JSX.Element
  Manga?: () => React.JSX.Element
  motion: Pick<HTMLMotionProps<'div'>, 'initial' | 'animate' | 'exit' | 'transition'>
  /** Remplace l'en-tête de la fiche ; `DetailBody` s'occupe du reste. */
  DetailHero?: (props: DetailHeroProps) => React.JSX.Element
  /** Dispose les blocs du corps de la fiche ; sans lui, les deux colonnes classiques. */
  DetailBody?: (props: { media: Media; parts: DetailParts }) => React.JSX.Element
}

/** Tout ce que l'en-tête d'une fiche affiche ou déclenche, calculé par la fiche elle-même. */
export interface DetailHeroProps {
  media: Media
  entry: Entry | undefined
  /** L'épisode qu'on peut cocher maintenant, ou `null` s'il n'est pas encore sorti. */
  next: number | null
  seen: number
  total: number | null
  alsoKnownAs: string[]
  inLists: number
  onBack: () => void
  onMark: () => void
  onAdd: () => void
  onStatus: (status: LibraryStatus) => void
  onFavorite: () => void
  onLists: () => void
}

/** Les blocs du corps d'une fiche, déjà rendus par la fiche ; `null` quand il n'y a rien à montrer. */
export type DetailPartKey =
  | 'synopsis'
  | 'trailer'
  | 'language'
  | 'franchise'
  | 'episodes'
  | 'files'
  | 'cast'
  | 'relations'
  | 'manga'
  | 'films'
  | 'recommendations'
  | 'progress'
  | 'rating'
  | 'info'
  | 'watch'
  | 'error'

export type DetailParts = Record<DetailPartKey, ReactNode>

export const PAGE_MOTION: Experience['motion'] = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.22, ease: [0.22, 0.8, 0.24, 1] }
}

const EXPERIENCES: Partial<Record<ExperienceId, Experience>> = {
  streaming,
  console: gameConsole,
  magazine,
  hud,
  carnet
}

export function useExperience(): Experience | null {
  const theme = useApp((s) => s.prefs.theme)
  const id = THEMES.find((t) => t.id === theme)?.experience
  return id ? (EXPERIENCES[id] ?? null) : null
}
