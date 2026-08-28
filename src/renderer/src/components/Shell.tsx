import { CalendarDays, ChartColumn, ChevronLeft, Compass, House, LibraryBig, Search, Settings } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { minutesToHuman } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import { useApp, type Route } from '@/store/app'

const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E\")"

/**
 * Ambient background. Every layer is driven by theme tokens, so a theme can dim
 * the aurora to nothing, swap the scrim, or switch on its own effect layer.
 *
 * The three halos take their hue from `--lume-*`, which the home page pulls
 * from the cover art of whatever it is currently about. Off the home page those
 * tokens resolve straight back to the accent, so nothing else changes.
 */
export function Aurora(): React.JSX.Element {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'var(--scrim)' }} />
      <div
        className="absolute -left-[18%] -top-[28%] h-[68vmax] w-[68vmax] rounded-full"
        style={{
          background: 'radial-gradient(circle, var(--lume), transparent 62%)',
          filter: 'blur(90px)',
          opacity: 'calc(0.26 * var(--aurora))',
          animation: 'drift-a 30s ease-in-out infinite'
        }}
      />
      <div
        className="absolute -right-[22%] top-[6%] h-[58vmax] w-[58vmax] rounded-full"
        style={{
          background: 'radial-gradient(circle, var(--lume-2), transparent 64%)',
          filter: 'blur(96px)',
          opacity: 'calc(0.2 * var(--aurora))',
          animation: 'drift-b 38s ease-in-out infinite'
        }}
      />
      <div
        className="absolute -bottom-[32%] left-[26%] h-[56vmax] w-[56vmax] rounded-full"
        style={{
          background: 'radial-gradient(circle, var(--lume-3), transparent 66%)',
          filter: 'blur(100px)',
          opacity: 'calc(0.14 * var(--aurora))',
          animation: 'drift-c 44s ease-in-out infinite'
        }}
      />
      <div className="fx-grid absolute inset-x-0" />
      <div className="fx-scanlines absolute inset-0" />
      <div
        className="absolute inset-0 mix-blend-overlay"
        style={{ backgroundImage: NOISE, backgroundRepeat: 'repeat', opacity: 'var(--noise)' }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 0%, transparent 42%, color-mix(in oklab, var(--bg) 78%, transparent) 100%)'
        }}
      />
    </div>
  )
}

function Logo(): React.JSX.Element {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="29" height="29" rx="9" stroke="url(#logo-g)" strokeWidth="1.6" opacity=".85" />
      <path d="M11 9.5v13l5.2-3.2V12.7L11 9.5Z" fill="url(#logo-g)" />
      <path d="M18.2 12.9v10.2l4.6-2.8v-4.6l-4.6-2.8Z" fill="url(#logo-g)" opacity=".55" />
    </svg>
  )
}

/** Horizontal navigation, used only by the "barre haute" layout. */
function TopNav(): React.JSX.Element {
  const route = useApp((s) => s.route)
  const navigate = useApp((s) => s.navigate)

  return (
    <div className="top-nav no-drag ml-2 hidden items-center gap-0.5">
      {NAV.map(({ route: target, label, icon: Icon }) => {
        const active = route.name === target.name
        return (
          <button
            key={target.name}
            onClick={() => navigate(target)}
            className="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[0.76rem] font-medium transition"
            style={
              active
                ? {
                    background: 'color-mix(in oklab, var(--accent) 24%, transparent)',
                    color: 'var(--on-accent)'
                  }
                : { color: 'var(--color-muted)' }
            }
          >
            <Icon size={14} strokeWidth={active ? 2.2 : 1.8} />
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function TitleBar(): React.JSX.Element {
  const { stack, back, setPalette } = useApp()

  return (
    <header
      className="drag relative z-30 flex h-11 shrink-0 items-center gap-2 border-b pl-2.5 pr-[152px]"
      style={{ borderColor: 'var(--line)', background: 'color-mix(in oklab, var(--chrome) 82%, transparent)' }}
    >
      <button
        onClick={back}
        disabled={!stack.length}
        aria-label="Retour"
        className="no-drag icon-btn !h-7 !w-7 disabled:opacity-25"
      >
        <ChevronLeft size={17} />
      </button>

      <div className="flex select-none items-center gap-2 pl-0.5">
        <Logo />
        <span className="title-xl text-[0.92rem] tracking-tight">
          Anime<span className="text-muted">List</span>
        </span>
      </div>

      <TopNav />

      <div className="flex flex-1 justify-center">
        <button
          onClick={() => setPalette(true)}
          className="no-drag group flex h-7 w-full max-w-[420px] items-center gap-2 rounded-full border px-3 text-[0.78rem] transition"
          style={{ borderColor: 'var(--line)', background: 'rgba(0,0,0,.28)' }}
        >
          <Search size={13} className="text-faint transition group-hover:text-[var(--accent-2)]" />
          <span className="text-faint">Rechercher un anime…</span>
          <kbd
            className="ml-auto rounded px-1.5 py-0.5 text-[0.62rem] font-semibold tracking-wide text-faint"
            style={{ background: 'rgba(255,255,255,.06)' }}
          >
            Ctrl K
          </kbd>
        </button>
      </div>
    </header>
  )
}

const NAV: { route: Route; label: string; icon: typeof House }[] = [
  { route: { name: 'home' }, label: 'Accueil', icon: House },
  { route: { name: 'discover' }, label: 'Découvrir', icon: Compass },
  { route: { name: 'library' }, label: 'Bibliothèque', icon: LibraryBig },
  { route: { name: 'calendar' }, label: 'Calendrier', icon: CalendarDays },
  { route: { name: 'stats' }, label: 'Statistiques', icon: ChartColumn },
  { route: { name: 'settings' }, label: 'Réglages', icon: Settings }
]

export function Sidebar(): React.JSX.Element {
  const route = useApp((s) => s.route)
  const navigate = useApp((s) => s.navigate)
  const events = useApp((s) => s.events)

  const now = useNow()

  const week = useMemo(() => {
    const since = now - 7 * 86_400_000
    // Imported rows carry their tick date, not a real viewing date.
    const recent = events.filter((e) => !e.imported && e.at >= since)
    return { episodes: recent.length, minutes: recent.reduce((sum, e) => sum + e.minutes, 0) }
  }, [events, now])

  return (
    <nav
      aria-label="Navigation principale"
      className="nav-shell flex w-[228px] shrink-0 flex-col gap-1 border-r px-3 py-4"
      style={{ borderColor: 'var(--line)', background: 'color-mix(in oklab, var(--bg) 55%, transparent)' }}
    >
      {NAV.map(({ route: target, label, icon: Icon }) => {
        const active = route.name === target.name
        return (
          <button
            key={target.name}
            onClick={() => navigate(target)}
            title={label}
            // The rail layout hides the labels, so the accessible name has to
            // come from somewhere other than the text.
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            className="nav-item relative flex h-[42px] items-center gap-3 rounded-xl px-3 text-[0.855rem] font-medium transition-colors"
            style={{ color: active ? 'var(--on-accent)' : 'var(--color-muted)' }}
          >
            {active && (
              <motion.span
                layoutId="nav-active"
                className="absolute inset-0 rounded-xl"
                style={{
                  background: 'color-mix(in oklab, var(--accent) 20%, transparent)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.12), 0 8px 26px -14px var(--glow)',
                  border: '1px solid color-mix(in oklab, var(--accent) 38%, transparent)'
                }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <Icon size={17.5} className="relative z-10 shrink-0" strokeWidth={active ? 2.2 : 1.8} />
            <span className="nav-label relative z-10">{label}</span>
          </button>
        )
      })}

      <div className="nav-widget mt-auto">
        <div className="hairline mb-3.5" />
        <div className="glass rounded-2xl px-3.5 py-3">
          <p className="label mb-2">Ces 7 jours</p>
          <div className="flex items-baseline gap-1.5">
            <span className="stat-num text-[1.6rem] leading-none">{week.episodes}</span>
            <span className="text-[0.74rem] text-faint">épisodes</span>
          </div>
          <p className="mt-1.5 text-[0.74rem] text-faint">{minutesToHuman(week.minutes)} de visionnage</p>
        </div>
      </div>
    </nav>
  )
}
