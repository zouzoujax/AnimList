/**
 * Les trois habillages du lecteur, en essai côte à côte.
 *
 * - Cinéma : noir, rien autour de la page ; la barre et la bande de vignettes
 *   n'apparaissent qu'au mouvement de la souris.
 * - Livre : le thème de l'app autour d'un livre ouvert — la reliure, le
 *   papier, et les tomes toujours en vue sur le côté.
 * - Épure : la page seule, un fil de progression, une pastille au besoin.
 *
 * Un seul restera ; le cœur (`useReader`) et les pages (`Stage`) sont communs,
 * pour que le choix porte sur l'interface et rien d'autre.
 */

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ChevronLeft, ChevronRight, Ellipsis, SkipBack, SkipForward, X } from 'lucide-react'
import Stage from './Stage'
import { DirSwitch, ModeSwitch, pageLabel, Scrubber, SkinSwitch, useIdle } from './Controls'
import { volumeLabel, type ReaderControl } from './useReader'

/** Les flèches suivent le sens de lecture : en manga, « suivant » est à gauche. */
function Arrows({ ctl, className = '' }: { ctl: ReaderControl; className?: string }): React.JSX.Element {
  const left = ctl.dir === 'rtl' ? ctl.next : ctl.prev
  const right = ctl.dir === 'rtl' ? ctl.prev : ctl.next
  return (
    <>
      <button
        className={className}
        aria-label={ctl.dir === 'rtl' ? 'Page suivante' : 'Page précédente'}
        onClick={(e) => {
          e.stopPropagation()
          left()
        }}
      >
        <ChevronLeft size={18} />
      </button>
      <span className="rd-count tabular-nums">{pageLabel(ctl)}</span>
      <button
        className={className}
        aria-label={ctl.dir === 'rtl' ? 'Page précédente' : 'Page suivante'}
        onClick={(e) => {
          e.stopPropagation()
          right()
        }}
      >
        <ChevronRight size={18} />
      </button>
    </>
  )
}

/* ─────────────────────────────── Cinéma ─────────────────────────────── */

export function Cinema({ ctl }: { ctl: ReaderControl }): React.JSX.Element {
  const ui = useIdle()
  const strip = useRef<HTMLDivElement>(null)

  // La vignette courante reste dans le champ de la bande.
  useEffect(() => {
    strip.current
      ?.querySelector(`[data-thumb="${ctl.page}"]`)
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [ctl.page, ui.visible])

  return (
    <div className="rd-cinema absolute inset-0">
      <Stage ctl={ctl} onToggleUi={ui.toggle} />

      <div
        className="rd-fade rd-fade-top"
        data-on={ui.visible}
        onMouseEnter={() => ui.hold(true)}
        onMouseLeave={() => ui.hold(false)}
      >
        <header className="flex items-center gap-3 py-3 pl-4 pr-[152px]">
          <button className="rd-icon" onClick={ctl.close} aria-label="Fermer le lecteur">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <p className="truncate text-[0.95rem] font-semibold">{ctl.series.title}</p>
            <p className="text-[0.72rem] opacity-60">{volumeLabel(ctl.volume)}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ModeSwitch ctl={ctl} iconOnly />
            <DirSwitch ctl={ctl} iconOnly />
          </div>
        </header>
      </div>

      <div
        className="rd-fade rd-fade-bottom"
        data-on={ui.visible}
        onMouseEnter={() => ui.hold(true)}
        onMouseLeave={() => ui.hold(false)}
      >
        {ctl.mode !== 'scroll' && (
          <div ref={strip} className="rd-strip" dir={ctl.dir}>
            {ctl.pages.map((src, i) => (
              <button
                key={src}
                data-thumb={i}
                data-on={ctl.shown.includes(i)}
                aria-label={`Page ${i + 1}`}
                onClick={(e) => {
                  e.stopPropagation()
                  ctl.goPage(i)
                }}
              >
                <img src={src} alt="" loading="lazy" draggable={false} />
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-4 px-6 pb-4 pt-2">
          <SkinSwitch ctl={ctl} />
          <Scrubber ctl={ctl} className="flex-1" />
          <span className="rd-count tabular-nums">{pageLabel(ctl)}</span>
          <div className="flex items-center gap-1">
            <button
              className="rd-icon"
              disabled={!ctl.hasPrevVolume}
              onClick={() => ctl.openVolume(ctl.volumeIndex - 1)}
              title="Tome précédent"
              aria-label="Tome précédent"
            >
              <SkipBack size={15} />
            </button>
            <button
              className="rd-icon"
              disabled={!ctl.hasNextVolume}
              onClick={() => ctl.openVolume(ctl.volumeIndex + 1)}
              title="Tome suivant"
              aria-label="Tome suivant"
            >
              <SkipForward size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────── Livre ─────────────────────────────── */

export function Livre({ ctl }: { ctl: ReaderControl }): React.JSX.Element {
  const current = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    current.current?.scrollIntoView({ block: 'nearest' })
  }, [ctl.volumeIndex])

  return (
    <div className="rd-livre absolute inset-0 grid grid-cols-[300px_1fr]">
      <aside className="rd-side flex min-h-0 flex-col">
        <div className="flex items-center gap-2 px-4 pb-2 pt-3">
          <button className="btn btn-ghost !h-8 !px-2.5" onClick={ctl.close}>
            <ArrowLeft size={15} />
            Retour
          </button>
        </div>
        <div className="flex gap-3 px-5 pb-4 pt-2">
          {ctl.series.cover && (
            <img src={ctl.series.cover} alt="" className="rd-cover h-[104px] w-[72px] shrink-0 object-cover" />
          )}
          <div className="min-w-0">
            <p className="label">Tu lis</p>
            <h2 className="title-xl mt-1 text-[1.15rem] leading-tight">{ctl.series.title}</h2>
            <p className="mt-1 text-[0.75rem] text-muted">
              {ctl.series.volumes.length} {ctl.series.volumes.every((v) => v.chapter) ? 'chapitres' : 'tomes'}
            </p>
          </div>
        </div>

        <div className="rd-volumes min-h-0 flex-1 overflow-y-auto px-3">
          {ctl.series.volumes.map((v, i) => {
            const on = i === ctl.volumeIndex
            const done = on ? ctl.page : v.page
            const pages = on ? ctl.pages.length || v.pages : v.pages
            return (
              <button
                key={v.id}
                ref={on ? current : undefined}
                data-on={on}
                className="rd-vol"
                onClick={() => ctl.openVolume(i)}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold">{volumeLabel(v)}</span>
                  <span className="shrink-0 text-[0.7rem] tabular-nums text-faint">
                    {done > 0 ? `${done + 1}/${pages}` : `${pages} p.`}
                  </span>
                </span>
                <span className="rd-bar">
                  <span style={{ width: `${pages > 1 ? ((done + (done > 0 ? 1 : 0)) / pages) * 100 : 0}%` }} />
                </span>
              </button>
            )
          })}
        </div>

        <div className="space-y-3 border-t px-5 py-4" style={{ borderColor: 'var(--line)' }}>
          <div>
            <p className="label mb-1.5">Disposition</p>
            <ModeSwitch ctl={ctl} />
          </div>
          <div>
            <p className="label mb-1.5">Sens de lecture</p>
            <DirSwitch ctl={ctl} />
          </div>
          <div>
            <p className="label mb-1.5">Habillage (essai)</p>
            <SkinSwitch ctl={ctl} />
          </div>
        </div>
      </aside>

      <main className="rd-desk relative min-h-0 min-w-0">
        <div className="absolute inset-0 pb-[76px] pt-[44px]">
          <Stage ctl={ctl} pageClassName="rd-paper" gutter padding={20} scrollWidth={780} />
        </div>
        <div className="absolute inset-x-0 bottom-0 flex justify-center pb-4">
          <div className="rd-pill glass-blur flex items-center gap-3 px-2 py-1.5">
            <Arrows ctl={ctl} className="rd-icon" />
            <Scrubber ctl={ctl} className="w-[min(38vw,420px)]" />
          </div>
        </div>
      </main>
    </div>
  )
}

/* ─────────────────────────────── Épure ─────────────────────────────── */

export function Epure({ ctl }: { ctl: ReaderControl }): React.JSX.Element {
  const ui = useIdle(1800)
  const [menu, setMenu] = useState(false)
  const count = ctl.pages.length
  const last = ctl.shown[ctl.shown.length - 1] ?? ctl.page
  const ratio = count ? (last + 1) / count : 0

  return (
    <div className="rd-epure absolute inset-0">
      {/* Le fil de progression, seule chose qui reste toujours à l'écran. */}
      <div className="rd-thread" dir={ctl.dir}>
        <span style={{ width: `${ratio * 100}%` }} />
      </div>

      <div className="absolute inset-0 pt-[3px]">
        <Stage ctl={ctl} onToggleUi={ui.toggle} />
      </div>

      <div className="rd-fade absolute left-4 top-3 flex items-center gap-2" data-on={ui.visible || menu}>
        <button className="rd-icon rd-icon-soft" onClick={ctl.close} aria-label="Fermer le lecteur">
          <X size={16} />
        </button>
        <span className="text-[0.78rem] opacity-70">
          {ctl.series.title} · {volumeLabel(ctl.volume)}
        </span>
      </div>

      <div
        className="rd-fade absolute inset-x-0 bottom-5 flex justify-center"
        data-on={ui.visible || menu}
        onMouseEnter={() => ui.hold(true)}
        onMouseLeave={() => ui.hold(false)}
      >
        <div className="relative">
          <AnimatePresence>
            {menu && (
              <motion.div
                className="rd-menu glass-blur absolute bottom-[calc(100%+10px)] left-1/2 w-[340px] -translate-x-1/2 p-4"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.16 }}
              >
                <p className="label mb-1.5">Tome</p>
                <div className="mb-3 flex max-h-[150px] flex-wrap gap-1.5 overflow-y-auto">
                  {ctl.series.volumes.map((v, i) => (
                    <button
                      key={v.id}
                      className="chip"
                      data-on={i === ctl.volumeIndex}
                      onClick={() => ctl.openVolume(i)}
                    >
                      {volumeLabel(v)}
                    </button>
                  ))}
                </div>
                <p className="label mb-1.5">Disposition</p>
                <div className="mb-3">
                  <ModeSwitch ctl={ctl} />
                </div>
                <p className="label mb-1.5">Sens de lecture</p>
                <div className="mb-3">
                  <DirSwitch ctl={ctl} />
                </div>
                <p className="label mb-1.5">Habillage (essai)</p>
                <SkinSwitch ctl={ctl} />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="rd-pill glass-blur flex items-center gap-1 px-1.5 py-1">
            <Arrows ctl={ctl} className="rd-icon rd-icon-soft" />
            <span className="mx-1 h-5 w-px" style={{ background: 'var(--line-2)' }} />
            <button
              className="rd-icon rd-icon-soft"
              data-on={menu}
              data-menu
              aria-label="Réglages de lecture"
              onClick={(e) => {
                e.stopPropagation()
                setMenu(!menu)
              }}
            >
              <Ellipsis size={17} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
