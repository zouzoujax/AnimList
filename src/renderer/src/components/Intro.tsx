/**
 * L'ouverture de l'app.
 *
 * Une marque qui se dessine, un nom qui monte, un halo qui respire, puis
 * l'écran s'écarte. Rien d'emprunté : le carré arrondi et les deux chevrons
 * sont ceux de l'en-tête, le dégradé est celui de l'accent choisi dans les
 * réglages — l'ouverture change donc de couleur avec le reste de l'app.
 *
 * Trois décisions valent d'être dites.
 *
 * **Elle ne retarde rien.** L'app se monte derrière, charge sa bibliothèque et
 * ses réglages pendant que l'animation joue. Le voile couvre un travail qui
 * avait lieu de toute façon, il ne s'y ajoute pas.
 *
 * **Elle s'interrompt.** Un clic, une touche, et elle s'efface. Un écran
 * d'ouverture qu'on ne peut pas passer devient un péage, et cent lancements
 * plus tard sa durée n'est plus une question de goût.
 *
 * **Elle obéit au réglage de mouvement.** « Réduire le mouvement » n'est pas
 * une préférence esthétique : c'est ce que règlent les gens que le mouvement
 * incommode. La marque se présente alors sans rien qui bouge, et brièvement.
 */

import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { INTRO_MS, INTRO_REDUCED_MS, motes } from '@shared/intro'
import { useApp } from '@/store/app'

/** Une seule fois par lancement : un rechargement de la fenêtre n'est pas un lancement. */
const SEEN = 'animelist-intro'

function Mark({ still }: { still: boolean }): React.JSX.Element {
  const trace = still
    ? {}
    : { strokeDasharray: 116, initial: { strokeDashoffset: 116 }, animate: { strokeDashoffset: 0 } }

  return (
    <svg width="132" height="132" viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="intro-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>

      {/* Le contour se trace, comme une signature. */}
      <motion.rect
        x="1.5"
        y="1.5"
        width="29"
        height="29"
        rx="9"
        stroke="url(#intro-g)"
        strokeWidth="1.4"
        strokeLinecap="round"
        style={trace.strokeDasharray ? { strokeDasharray: trace.strokeDasharray } : undefined}
        initial={still ? { opacity: 0 } : { ...trace.initial, opacity: 0.9 }}
        animate={still ? { opacity: 0.85 } : { ...trace.animate, opacity: 0.85 }}
        transition={still ? { duration: 0.4 } : { duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Les deux chevrons arrivent ensuite, décalés : la marque se construit. */}
      <motion.path
        d="M11 9.5v13l5.2-3.2V12.7L11 9.5Z"
        fill="url(#intro-g)"
        initial={{ opacity: 0, x: still ? 0 : -3 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: still ? 0.4 : 0.5, delay: still ? 0 : 0.5 }}
      />
      <motion.path
        d="M18.2 12.9v10.2l4.6-2.8v-4.6l-4.6-2.8Z"
        fill="url(#intro-g)"
        initial={{ opacity: 0, x: still ? 0 : -3 }}
        animate={{ opacity: 0.55, x: 0 }}
        transition={{ duration: still ? 0.4 : 0.5, delay: still ? 0 : 0.66 }}
      />
    </svg>
  )
}

export function Intro(): React.JSX.Element | null {
  const reduce = useApp((s) => s.prefs.reduceMotion)

  /**
   * Le voile n'est monté que si ce lancement ne l'a pas déjà vu.
   *
   * `sessionStorage` est vide à l'ouverture de la fenêtre et survit à un
   * rechargement : l'ouverture joue une fois par lancement, et le rechargement
   * à chaud du développement ne la rejoue pas vingt fois par heure.
   */
  const [open, setOpen] = useState(() => {
    try {
      if (sessionStorage.getItem(SEEN)) return false
      sessionStorage.setItem(SEEN, '1')
      return true
    } catch {
      // Stockage refusé : mieux vaut la jouer que planter là-dessus.
      return true
    }
  })

  const grains = useMemo(() => (reduce ? [] : motes()), [reduce])
  const duree = reduce ? INTRO_REDUCED_MS : INTRO_MS

  useEffect(() => {
    if (!open) return
    const fin = setTimeout(() => setOpen(false), duree)
    const passer = (): void => setOpen(false)
    window.addEventListener('keydown', passer)
    window.addEventListener('pointerdown', passer)
    return () => {
      clearTimeout(fin)
      window.removeEventListener('keydown', passer)
      window.removeEventListener('pointerdown', passer)
    }
  }, [open, duree])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] grid place-items-center overflow-hidden"
          style={{ background: 'var(--color-bg, #07080f)' }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: reduce ? 1 : 1.03 }}
          transition={{ duration: reduce ? 0.25 : 0.55, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* Le halo respire une fois, sous la marque. */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute h-[420px] w-[420px] rounded-full"
            style={{
              background:
                'radial-gradient(circle, color-mix(in oklab, var(--accent) 26%, transparent) 0%, transparent 68%)'
            }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={reduce ? { opacity: 0.7, scale: 1 } : { opacity: [0, 0.9, 0.55], scale: [0.7, 1.06, 1] }}
            transition={{ duration: reduce ? 0.4 : 2.2, ease: 'easeOut' }}
          />

          {grains.map((m, i) => (
            <motion.span
              key={i}
              aria-hidden
              className="pointer-events-none absolute rounded-full"
              style={{
                left: `${m.x * 100}%`,
                top: `${m.y * 100}%`,
                width: m.size,
                height: m.size,
                background: 'var(--accent)',
                boxShadow: '0 0 8px 1px color-mix(in oklab, var(--accent) 60%, transparent)'
              }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: [0, 0.7, 0], y: -18 }}
              transition={{ duration: m.drift, delay: m.delay, ease: 'easeOut' }}
            />
          ))}

          <div className="relative flex flex-col items-center gap-6">
            <Mark still={reduce} />

            <motion.p
              className="title-xl text-[1.6rem] tracking-tight"
              initial={{ opacity: 0, y: reduce ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0.35 : 0.7, delay: reduce ? 0.1 : 0.95, ease: [0.16, 1, 0.3, 1] }}
            >
              Anime<span className="text-muted">List</span>
            </motion.p>

            {/* Un trait qui s'ouvre sous le nom, et rien d'autre : pas de
                pourcentage inventé pour un chargement qu'on ne mesure pas. */}
            {!reduce && (
              <motion.span
                aria-hidden
                className="h-px rounded-full"
                style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 168, opacity: 1 }}
                transition={{ duration: 1, delay: 1.15, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
