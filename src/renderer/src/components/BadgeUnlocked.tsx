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
 * **Au milieu de l'écran, et sans rien bloquer.** Le badge paraît en fondu au
 * centre, son nom dessous, entouré d'auréoles qui tournent, le reste de la
 * page assombri pour le temps de l'annonce. Le voile ne prend pas les clics —
 * ce n'est pas une modale, rien n'attend de réponse, et on continue de cocher
 * derrière. Il s'en va comme il est venu, en fondu.
 *
 * Le tout passe par un portail : `position: fixed` ne tient pas sous un parent
 * transformé, et les expériences en transforment.
 */

import { PartyPopper } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { firstInventory, freshBadges, MAX_CHEERS, withUnlocked } from '@shared/badge-log'
import { endBadgePreview, isPreviewingBadge, subscribeBadgePreview } from '@/lib/badge-preview'
import { useBadgeWall, type Badge } from '@/lib/badges'
import { playBadgeChime } from '@/lib/chime'
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

  const Icon = current?.icon
  // L'essai ne parle que de lui : compter les vrais badges qui attendent leur
  // tour derrière lui donnerait un « et 3 autres » que rien ne vient expliquer.
  const others = previewing ? 0 : fresh.length - 1

  /**
   * Le portail reste monté, vide.
   *
   * `AnimatePresence` ne peut animer une sortie que s'il survit à ce qui s'en
   * va : rendre `null` plus haut arrachait le carton d'un coup, et le fondu de
   * disparition n'avait jamais lieu.
   */
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center" role="status" aria-live="polite">
      <AnimatePresence>
        {current && Icon && (
          <motion.div
            key={current.id}
            /*
             * L'habillage vit dans la feuille de style, pas ici.
             *
             * Vingt thèmes, et chacun sa langue : Papier est plat et éditorial,
             * Terminal n'a ni ombre ni rondeur, Arcade est en marches de pixels.
             * Des couleurs écrites dans le composant les auraient tous habillés
             * en Nébuleuse. Le composant pose donc des classes et l'accent, et
             * `styles.css` fait le reste — comme pour le reste de l'app.
             *
             * Le voile couvre la fenêtre et s'efface avec le badge ; il ne prend
             * pas les clics : rien n'attend de réponse, on coche derrière.
             */
            className="badge-cheer"
            style={{ '--badge-accent': accent } as React.CSSProperties}
            // Un fondu, et rien d'autre : l'entrée et la sortie ne bougent pas
            // de place. Ce qui tourne, ce sont les auréoles, dessous.
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: calm ? 0.2 : 0.55, ease: 'easeOut' }}
          >
            {/* Les auréoles tournent en CSS, pas par `motion` : rien de ce qui
                tourne sans fin ne doit retenir `AnimatePresence`, qui attend
                les animations dont il a la charge avant de démonter ce qui s'en
                va. La règle `.reduce-motion` les arrête toute seule.

                Elles vivent dans un carré centré sur la médaille : posées
                autour du bloc entier, elles se centraient entre l'image et le
                texte, et les rayons barraient le nom. */}
            <div className="badge-stage">
              <div aria-hidden className="badge-glow" />
              <div aria-hidden className="badge-halo" />
              <div aria-hidden className="badge-rays" />

              {/* Trois étincelles en orbite. */}
              <div aria-hidden className="badge-orbit">
                {[0, 120, 240].map((angle) => (
                  <span key={angle} className="badge-spark" style={{ '--badge-angle': `${angle}deg` } as React.CSSProperties} />
                ))}
              </div>

              <span className="badge-medal">
                <Icon size={52} strokeWidth={1.5} />
              </span>

              {/*
                Le nom, suspendu sous les auréoles et hors du flux.

                Dans le flux, il comptait dans la hauteur du bloc : c'est
                l'ensemble « badge + nom » qui se centrait, et la médaille se
                retrouvait au-dessus du milieu de l'écran. Ce qu'on veut voir
                centré, c'est elle.
              */}
              <div className="badge-name">
                <span className="badge-kicker">Badge obtenu</span>
                <span className="badge-label">{current.label}</span>
                <span className="badge-hint">
                  {current.hint}
                  {others > 0 ? ` · et ${others} autre${others > 1 ? 's' : ''}` : ''}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  )
}
