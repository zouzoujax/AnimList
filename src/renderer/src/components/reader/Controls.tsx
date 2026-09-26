/**
 * Les réglages du lecteur, partagés par les trois habillages : disposition,
 * sens de lecture et — le temps de choisir — l'habillage lui-même.
 */

import { BookOpen, Columns2, File, MoveLeft, MoveRight, Rows3 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReaderDir, ReaderMode, ReaderSkin } from '@shared/types'
import type { ReaderControl } from './useReader'

const MODES: { id: ReaderMode; label: string; hint: string; icon: typeof File }[] = [
  { id: 'single', label: 'Simple', hint: 'Une page à la fois', icon: File },
  { id: 'double', label: 'Double', hint: 'Deux pages côte à côte, comme un livre ouvert', icon: Columns2 },
  { id: 'scroll', label: 'Défilement', hint: 'Les pages à la suite, pour les webtoons', icon: Rows3 }
]

const DIRS: { id: ReaderDir; label: string; hint: string; icon: typeof File }[] = [
  { id: 'rtl', label: 'Manga', hint: 'De droite à gauche', icon: MoveLeft },
  { id: 'ltr', label: 'BD', hint: 'De gauche à droite', icon: MoveRight }
]

export const SKINS: { id: ReaderSkin; label: string }[] = [
  { id: 'cinema', label: 'Cinéma' },
  { id: 'livre', label: 'Livre' },
  { id: 'epure', label: 'Épure' }
]

/** Un groupe de boutons dont un seul est allumé. */
function Segmented<T extends string>({
  items,
  value,
  onChange,
  attr,
  iconOnly = false
}: {
  items: { id: T; label: string; hint?: string; icon?: typeof File }[]
  value: T
  onChange: (id: T) => void
  /** Attribut posé sur chaque bouton, pour les captures (`data-mode`…). */
  attr: string
  iconOnly?: boolean
}): React.JSX.Element {
  return (
    <div className="rd-seg" role="radiogroup">
      {items.map(({ id, label, hint, icon: Icon }) => (
        <button
          key={id}
          role="radio"
          aria-checked={value === id}
          data-on={value === id}
          title={hint ? `${label} — ${hint}` : label}
          aria-label={label}
          {...{ [`data-${attr}`]: id }}
          onClick={(e) => {
            e.stopPropagation()
            onChange(id)
          }}
        >
          {Icon && <Icon size={14} />}
          {!iconOnly && <span>{label}</span>}
        </button>
      ))}
    </div>
  )
}

export function ModeSwitch({ ctl, iconOnly }: { ctl: ReaderControl; iconOnly?: boolean }): React.JSX.Element {
  return <Segmented items={MODES} value={ctl.mode} onChange={ctl.setMode} attr="mode" iconOnly={iconOnly} />
}

export function DirSwitch({ ctl, iconOnly }: { ctl: ReaderControl; iconOnly?: boolean }): React.JSX.Element {
  return <Segmented items={DIRS} value={ctl.dir} onChange={ctl.setDir} attr="dir" iconOnly={iconOnly} />
}

export function SkinSwitch({ ctl }: { ctl: ReaderControl }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <BookOpen size={13} className="opacity-60" />
      <Segmented items={SKINS} value={ctl.skin} onChange={ctl.setSkin} attr="skin" />
    </div>
  )
}

/**
 * Montre l'habillage, puis le cache après un moment sans bouger la souris.
 *
 * Rend aussi de quoi le forcer : un clic au milieu de la page bascule, et
 * l'habillage reste tant que la souris est posée dessus.
 */
export function useIdle(delay = 2600): {
  visible: boolean
  toggle: () => void
  hold: (on: boolean) => void
} {
  const [visible, setVisible] = useState(true)
  const [held, setHeld] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const wake = (): void => {
      setVisible(true)
      setTick((t) => t + 1)
    }
    window.addEventListener('mousemove', wake)
    return () => window.removeEventListener('mousemove', wake)
  }, [])

  useEffect(() => {
    if (held || !visible) return
    const timer = setTimeout(() => setVisible(false), delay)
    return () => clearTimeout(timer)
  }, [visible, held, tick, delay])

  return { visible: visible || held, toggle: () => setVisible((v) => !v), hold: setHeld }
}

/** « 12 / 186 », ou « 12-13 / 186 » en double page. */
export function pageLabel(ctl: ReaderControl): string {
  if (!ctl.pages.length) return '…'
  const first = ctl.shown[0] ?? ctl.page
  const last = ctl.shown[ctl.shown.length - 1] ?? first
  const span = first === last ? `${first + 1}` : `${first + 1}-${last + 1}`
  return `${span} / ${ctl.pages.length}`
}

/** Une barre de progression cliquable, dans le sens de lecture. */
export function Scrubber({ ctl, className = '' }: { ctl: ReaderControl; className?: string }): React.JSX.Element {
  const count = ctl.pages.length
  const ratio = count > 1 ? ctl.page / (count - 1) : 0
  return (
    <input
      type="range"
      className={`rd-range ${className}`}
      min={0}
      max={Math.max(0, count - 1)}
      value={ctl.page}
      aria-label="Page"
      // En sens manga, la barre part de la droite, comme le livre.
      dir={ctl.dir}
      style={{ '--p': `${ratio * 100}%` } as React.CSSProperties}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => ctl.goPage(Number(e.target.value))}
    />
  )
}
