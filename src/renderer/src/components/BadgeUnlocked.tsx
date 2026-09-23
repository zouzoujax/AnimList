/**
 * Le carton d'un badge qui vient de tomber.
 *
 * Les badges se recalculent depuis l'historique à chaque affichage : rien ne
 * disait qu'un seuil venait d'être franchi, et on découvrait ses victoires en
 * ouvrant les statistiques, sans savoir de quand elles dataient. Le registre de
 * `@shared/badge-log` répare ça ; ce composant en est la voix.
 *
 * **Monté pour toute l'app, pas pour la page des statistiques.** On coche un
 * épisode depuis la fiche, une carte, le lecteur ou le téléphone : le badge
 * doit tomber là où on est.
 *
 * **La file d'attente, c'est le registre.** Le carton montre le premier badge
 * gagné que le registre ne connaît pas encore, et l'inscrit quand il s'efface —
 * le suivant prend alors sa place tout seul. Rien à tenir à côté : pas d'état
 * en double, et fermer l'app au milieu ne perd que l'annonce, jamais la
 * victoire.
 *
 * **Silencieux au premier inventaire.** Une bibliothèque d'avant a déjà cent
 * badges gagnés ; les annoncer à la file serait une avalanche pour des
 * victoires vieilles de plusieurs mois.
 *
 * Le carton passe par un portail : `position: fixed` ne tient pas sous un
 * parent transformé, et les expériences en transforment.
 */

import { PartyPopper } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { firstInventory, freshBadges, MAX_CHEERS, withUnlocked } from '@shared/badge-log'
import { endBadgePreview, isPreviewingBadge, subscribeBadgePreview } from '@/lib/badge-preview'
import { useBadgeWall, type Badge } from '@/lib/badges'
import { playBadgeChime } from '@/lib/chime'
import { rgba } from '@/lib/color'
import { useApp } from '@/store/app'

/** Le temps d'un carton : assez pour lire trois lignes, pas pour gêner. */
const SHOWN_MS = 4600

/**
 * Le badge du bouton d'essai.
 *
 * Un badge inventé plutôt qu'un vrai pris au hasard : voir passer « Centurion »
 * ferait croire qu'on vient de le gagner. Celui-ci ne peut être confondu avec
 * rien, et n'entre jamais au registre.
 */
const TEST_BADGE: Badge = {
  id: '__essai',
  label: 'Badge d’essai',
  hint: 'Voilà ce que fait un badge quand il tombe',
  icon: PartyPopper,
  progress: 1,
  group: 'Volume',
  unlockedAt: null
}

export function BadgeUnlocked(): React.JSX.Element | null {
  const ready = useApp((s) => s.ready)
  const log = useApp((s) => s.prefs.badgesAt)
  const sound = useApp((s) => s.prefs.badgeSound)
  const calm = useApp((s) => s.prefs.reduceMotion)
  const accent = useApp((s) => s.prefs.accent)
  const setPrefs = useApp((s) => s.setPrefs)
  const { badges } = useBadgeWall()

  const previewing = useSyncExternalStore(subscribeBadgePreview, isPreviewingBadge)

  const unlocked = badges.filter((b) => b.progress >= 1)
  const fresh = freshBadges(
    unlocked.map((b) => b.id),
    log
  )
  // Le premier non inscrit, et seulement une fois la bibliothèque chargée :
  // avant, le mur est vide et l'inventaire porterait sur rien.
  const gagne = ready ? (unlocked.find((b) => b.id === fresh[0]) ?? null) : null
  // L'essai passe devant : on vient d'appuyer sur le bouton, et un vrai badge
  // qui attend son tour attendra quatre secondes de plus.
  const current = previewing ? TEST_BADGE : gagne

  /**
   * L'écriture du registre est asynchrone : tant qu'elle n'est pas revenue, le
   * magasin porte encore l'ancien registre, et le même badge serait refêté.
   */
  const writing = useRef(false)

  /** Combien ont déjà défilé d'affilée, pour ne pas en faire passer vingt. */
  const shown = useRef(0)

  // L'inventaire d'ouverture : il inscrit ce qui est déjà gagné, sans rien
  // annoncer. Une seule fois dans la vie d'une bibliothèque.
  useEffect(() => {
    if (!ready || log !== null || writing.current) return
    writing.current = true
    const inventaire = firstInventory(badges.filter((b) => b.progress >= 1).map((b) => b.id))
    void setPrefs({ badgesAt: inventaire }).finally(() => {
      writing.current = false
    })
  }, [ready, log, badges, setPrefs])

  const id = current?.id ?? null

  /**
   * De quoi écrire, relu après chaque rendu.
   *
   * Ni `fresh` ni `log` ne peuvent être des dépendances du minuteur : le
   * premier est un tableau neuf à chaque rendu, et le carton repartirait de
   * zéro au moindre réaffichage — il ne s'effacerait jamais.
   */
  const latest = useRef({ fresh, log })
  useEffect(() => {
    latest.current = { fresh, log }
  })

  // Le carton vit le temps qu'il faut, puis son badge entre au registre — ce
  // qui fait apparaître le suivant, s'il y en a un. L'essai, lui, ne laisse
  // aucune trace : il se contente de s'en aller.
  useEffect(() => {
    if (id === null) return
    if (sound) void playBadgeChime()

    const timer = setTimeout(() => {
      if (previewing) return endBadgePreview()
      if (writing.current) return
      writing.current = true
      shown.current += 1
      // Passé le troisième, le reste s'inscrit d'un coup : c'était un import,
      // pas une soirée.
      const ids = shown.current >= MAX_CHEERS ? latest.current.fresh : [id]
      void setPrefs({ badgesAt: withUnlocked(latest.current.log, ids, Date.now()) }).finally(() => {
        writing.current = false
      })
    }, SHOWN_MS)

    return () => clearTimeout(timer)
  }, [id, sound, previewing, setPrefs])

  if (!current) return null
  const Icon = current.icon
  // L'essai ne parle que de lui : compter les vrais badges qui attendent leur
  // tour derrière lui donnerait un « et 3 autres » que rien ne vient expliquer.
  const others = previewing ? 0 : fresh.length - 1

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-7 z-[70] flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          initial={calm ? { opacity: 0 } : { opacity: 0, y: 26, scale: 0.94 }}
          animate={calm ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={calm ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
          transition={calm ? { duration: 0.18 } : { type: 'spring', stiffness: 420, damping: 26 }}
          className="glass-blur flex items-center gap-3.5 rounded-2xl px-4 py-3 shadow-2xl"
          style={{ border: `1px solid ${rgba(accent, 0.45)}` }}
        >
          <motion.span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
            style={{ background: rgba(accent, 0.18) }}
            // La médaille arrive un cran après la carte, et se pose : c'est ce
            // geste-là qu'on regarde.
            initial={calm ? false : { scale: 0.4, rotate: -25 }}
            animate={calm ? false : { scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 14, delay: 0.08 }}
          >
            <Icon size={22} />
          </motion.span>

          <span className="min-w-0">
            <span className="block text-[0.64rem] font-bold uppercase tracking-[0.09em] text-muted">Badge obtenu</span>
            <span className="block text-[0.95rem] font-semibold leading-tight">{current.label}</span>
            <span className="block text-[0.74rem] leading-snug text-faint">
              {current.hint}
              {others > 0 ? ` · et ${others} autre${others > 1 ? 's' : ''}` : ''}
            </span>
          </span>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body
  )
}
