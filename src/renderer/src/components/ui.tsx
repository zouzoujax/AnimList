import { ChevronLeft, ChevronRight, LoaderCircle, TriangleAlert } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

export function Section({
  title,
  subtitle,
  action,
  children
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  return (
    <section className="mb-9">
      <header className="mb-3.5 flex items-end justify-between gap-4 px-1">
        <div>
          <h2 className="title-xl text-[1.32rem] leading-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[0.8rem] text-muted">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

/** Horizontal rail with edge fades and hover arrows. */
export function RowScroller({ children }: { children: ReactNode }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const measure = (): void => {
    const el = ref.current
    if (!el) return
    setEdges({
      left: el.scrollLeft > 8,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 8
    })
  }

  useEffect(() => {
    measure()
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [children])

  const scrollBy = (dir: number): void =>
    ref.current?.scrollBy({ left: dir * Math.max(320, ref.current.clientWidth * 0.8), behavior: 'smooth' })

  return (
    <div className="group/row relative">
      <div ref={ref} onScroll={measure} className="scroll-x flex gap-3.5 px-1 pb-2 pt-1">
        {children}
      </div>
      {(['left', 'right'] as const).map((side) =>
        edges[side] ? (
          <button
            key={side}
            onClick={() => scrollBy(side === 'left' ? -1 : 1)}
            aria-label={side === 'left' ? 'Précédent' : 'Suivant'}
            className="glass-blur absolute top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full opacity-0 transition group-hover/row:opacity-100 hover:!bg-white/12"
            style={{ [side]: '-6px' }}
          >
            {side === 'left' ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        ) : null
      )}
    </div>
  )
}

export function Poster({
  src,
  alt,
  className = '',
  rounded = 'rounded-[14px]'
}: {
  src: string
  alt: string
  className?: string
  rounded?: string
}): React.JSX.Element {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className={`relative overflow-hidden bg-white/4 ${rounded} ${className}`}>
      {!loaded && <div className="skeleton absolute inset-0" />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className="h-full w-full object-cover transition-[opacity,transform] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]"
        style={{ opacity: loaded ? 1 : 0 }}
      />
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }): React.JSX.Element {
  return <div className={`skeleton rounded-[14px] ${className}`} />
}

export function PosterSkeletons({ count = 8 }: { count?: number }): React.JSX.Element {
  return (
    <div className="flex gap-3.5 px-1">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="w-[168px] shrink-0">
          <Skeleton className="aspect-[2/3] w-full" />
          <Skeleton className="mt-2.5 h-3 w-4/5 rounded-md" />
          <Skeleton className="mt-1.5 h-2.5 w-1/2 rounded-md" />
        </div>
      ))}
    </div>
  )
}

export function Spinner({ label }: { label?: string }): React.JSX.Element {
  return (
    <div className="flex items-center justify-center gap-2.5 py-10 text-sm text-muted">
      <LoaderCircle size={17} className="animate-spin" />
      {label ?? 'Chargement…'}
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }): React.JSX.Element {
  return (
    <div className="glass flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-sm">
      <TriangleAlert size={18} className="shrink-0 text-amber-300" />
      <span className="flex-1 text-muted">{message}</span>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  hint,
  action
}: {
  icon: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}): React.JSX.Element {
  return (
    <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-14 text-center">
      <div
        className="grid h-14 w-14 place-items-center rounded-2xl text-white/80"
        style={{ background: 'color-mix(in oklab, var(--accent) 18%, transparent)' }}
      >
        {icon}
      </div>
      <h3 className="title-xl text-[1.05rem]">{title}</h3>
      {hint && <p className="max-w-sm text-[0.83rem] leading-relaxed text-faint">{hint}</p>}
      {action}
    </div>
  )
}

export function ProgressRing({
  value,
  size = 44,
  stroke = 3.5,
  children
}: {
  value: number
  size?: number
  stroke?: number
  children?: ReactNode
}): React.JSX.Element {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const id = `ring-${size}-${stroke}`
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
          style={{ transition: 'stroke-dashoffset .55s cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

export function Modal({
  open,
  onClose,
  children,
  width = 620
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  width?: number
}): React.JSX.Element {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-start justify-center pt-[14vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[3px]" onClick={onClose} />
          <motion.div
            className="glass-blur relative w-[92vw] overflow-hidden rounded-[22px] shadow-2xl"
            style={{ maxWidth: width }}
            initial={{ y: 14, scale: 0.985, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 8, scale: 0.99, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
