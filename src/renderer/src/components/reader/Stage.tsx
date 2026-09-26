/**
 * Les pages elles-mêmes, sans rien autour.
 *
 * Page seule, double page ou défilement vertical. En double page et en sens
 * manga, la première page de la paire se pose à droite : c'est l'ordre dans
 * lequel l'œil la cherche.
 */

import { useEffect, useRef } from 'react'
import type { ReaderControl } from './useReader'

export default function Stage({
  ctl,
  onToggleUi,
  pageClassName = '',
  gutter = false,
  padding = 0,
  scrollWidth = 860
}: {
  ctl: ReaderControl
  /** Un clic au milieu de l'écran : montrer ou cacher l'habillage. */
  onToggleUi?: () => void
  pageClassName?: string
  /** L'ombre de la reliure entre deux pages, pour l'habillage « Livre ». */
  gutter?: boolean
  padding?: number
  scrollWidth?: number
}): React.JSX.Element {
  if (ctl.mode === 'scroll') return <ScrollStage ctl={ctl} onToggleUi={onToggleUi} width={scrollWidth} />

  const onClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    const box = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - box.left) / box.width
    // Un tiers de chaque côté pour tourner, le milieu pour l'habillage.
    if (x < 1 / 3) (ctl.dir === 'rtl' ? ctl.next : ctl.prev)()
    else if (x > 2 / 3) (ctl.dir === 'rtl' ? ctl.prev : ctl.next)()
    else onToggleUi?.()
  }

  const pair = ctl.shown.length === 2

  return (
    <div
      className="relative flex h-full w-full cursor-pointer select-none items-center justify-center"
      style={{ padding, flexDirection: ctl.dir === 'rtl' ? 'row-reverse' : 'row' }}
      onClick={onClick}
    >
      {ctl.shown.map((index, i) => (
        <img
          key={ctl.pages[index]}
          src={ctl.pages[index]}
          alt={`Page ${index + 1}`}
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget
            if (img.naturalWidth > img.naturalHeight * 1.15) ctl.markWide(index)
          }}
          className={`reader-page block h-auto max-h-full w-auto object-contain ${pageClassName}`}
          style={{
            maxWidth: pair ? '50%' : '100%',
            // Les deux pages se touchent, comme dans un livre ouvert.
            objectPosition: pair ? ((i === 0) === (ctl.dir === 'ltr') ? 'right' : 'left') : 'center'
          }}
        />
      ))}
      {gutter && pair && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-[6%] left-1/2 w-16 -translate-x-1/2"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(0,0,0,0.16) 42%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.16) 58%, transparent)'
          }}
        />
      )}
    </div>
  )
}

function ScrollStage({
  ctl,
  onToggleUi,
  width
}: {
  ctl: ReaderControl
  onToggleUi?: () => void
  width: number
}): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const reported = useRef(-1)
  /**
   * La page visée, tant que l'utilisateur n'a pas bougé.
   *
   * Les images arrivent l'une après l'autre et chacune pousse les suivantes :
   * sans ancre, ouvrir un tome à la page 6 finissait à la page 5, et le
   * marque-page reculait d'autant. Tant qu'on n'a pas touché la molette, on
   * revient sur la page visée à chaque image chargée, et on ne signale rien.
   */
  const anchor = useRef<number | null>(null)
  const { page, pages, reportScrolled } = ctl

  // Suit la page qui passe au milieu de l'écran.
  useEffect(() => {
    const root = box.current
    if (!root || !pages.length) return
    const seen = new IntersectionObserver(
      (entries) => {
        if (anchor.current !== null) return
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const index = Number((entry.target as HTMLElement).dataset.index)
          reported.current = index
          reportScrolled(index)
        }
      },
      { root, rootMargin: '-50% 0px -50% 0px' }
    )
    root.querySelectorAll('[data-index]').forEach((el) => seen.observe(el))
    return () => seen.disconnect()
  }, [pages, reportScrolled])

  const toAnchor = (): void => {
    if (anchor.current === null) return
    box.current?.querySelector(`[data-index="${anchor.current}"]`)?.scrollIntoView({ block: 'start' })
  }

  // Un saut demandé d'ailleurs (la barre, un tome rouvert) : y aller. Une page
  // qu'on vient de signaler soi-même en défilant ne doit pas faire sauter.
  useEffect(() => {
    if (page === reported.current) return
    anchor.current = page
    box.current?.querySelector(`[data-index="${page}"]`)?.scrollIntoView({ block: 'start' })
  }, [page, pages])

  const release = (): void => {
    anchor.current = null
  }

  return (
    <div
      ref={box}
      className="h-full w-full overflow-y-auto"
      onClick={() => onToggleUi?.()}
      onWheel={release}
      onPointerDown={release}
      onKeyDown={release}
    >
      <div className="mx-auto" style={{ maxWidth: width }}>
        {pages.map((src, index) => (
          <img
            key={src}
            data-index={index}
            src={src}
            alt={`Page ${index + 1}`}
            loading="lazy"
            draggable={false}
            onLoad={toAnchor}
            className="reader-page block min-h-[40vh] w-full select-none object-contain"
          />
        ))}
      </div>
    </div>
  )
}
