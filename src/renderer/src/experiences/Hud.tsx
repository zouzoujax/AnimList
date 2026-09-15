import { Search } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState, type ReactNode } from 'react'
import { STATUS_LABELS, type Media } from '@shared/types'
import { countdown, isUnaired, minutesToHuman, titleOf } from '@/lib/format'
import { useBrowse, useNow } from '@/lib/hooks'
import { nextEpisodeOf, useApp, type Route } from '@/store/app'
import { useBehind, useContinue, useShelf, useTotals, useUpcoming } from './data'
import { WEEKDAYS, useStats } from './stats'
import { HudCalendar, HudDetailHero, HudDiscover, HudManga } from './hud-pages'
import { HudBadges } from './badges-pages'
import type { Experience } from '.'

/*
 * COCKPIT — un tableau de bord de vaisseau : rail de commande à gauche, écran
 * découpé en panneaux à crochets, jauges, télémétrie et bandeau défilant. La
 * bibliothèque devient un registre en tableau.
 */

const NAV: { route: Route; code: string; label: string }[] = [
  { route: { name: 'home' }, code: '01', label: 'Pont' },
  { route: { name: 'library' }, code: '02', label: 'Registre' },
  { route: { name: 'discover' }, code: '03', label: 'Scanner' },
  { route: { name: 'calendar' }, code: '04', label: 'Orbites' },
  { route: { name: 'manga' }, code: '05', label: 'Archives' },
  { route: { name: 'stats' }, code: '06', label: 'Télémétrie' },
  { route: { name: 'badges' }, code: '07', label: 'Décorations' },
  { route: { name: 'settings' }, code: '08', label: 'Système' }
]

function Nav(): React.JSX.Element {
  const route = useApp((s) => s.route)
  const navigate = useApp((s) => s.navigate)
  const setPalette = useApp((s) => s.setPalette)
  const totals = useTotals()
  const now = useNow()

  return (
    <nav aria-label="Navigation principale" className="xh-rail flex w-[212px] shrink-0 flex-col px-4 py-5">
      <p className="xh-code">SYS // ANIMELIST</p>
      <p className="xh-clock mt-1">
        {new Date(now).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </p>
      <button className="xh-cmd mt-5" onClick={() => setPalette(true)}>
        <Search size={13} /> RECHERCHE
      </button>
      <div className="mt-5 flex flex-col gap-1">
        {NAV.map(({ route: target, code, label }) => (
          <button
            key={target.name}
            onClick={() => navigate(target)}
            aria-current={route.name === target.name ? 'page' : undefined}
            className="xh-nav-item"
          >
            <span className="xh-code">{code}</span>
            {label}
          </button>
        ))}
      </div>
      <div className="xh-panel mt-auto p-3">
        <p className="xh-code">SÉRIE ACTIVE</p>
        <p className="xh-value mt-1">{totals.streak} J</p>
        <div className="xh-segments mt-2">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} data-on={i < Math.min(14, totals.streak)} />
          ))}
        </div>
      </div>
    </nav>
  )
}

function Panel({
  code,
  title,
  className = '',
  children
}: {
  code: string
  title: string
  className?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <section className={`xh-panel relative p-4 ${className}`}>
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="xh-title">{title}</h2>
        <span className="xh-code">{code}</span>
      </header>
      {children}
    </section>
  )
}

function Gauge({ value, label }: { value: number; label: string }): React.JSX.Element {
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <div className="relative grid h-[132px] w-[132px] place-items-center">
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
        <circle cx="60" cy="60" r={r} className="xh-gauge-track" />
        <motion.circle
          cx="60"
          cy="60"
          r={r}
          className="xh-gauge-fill"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value) }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="text-center">
        <p className="xh-value">{Math.round(value * 100)}%</p>
        <p className="xh-code">{label}</p>
      </div>
    </div>
  )
}

function Target({ media }: { media: Media }): React.JSX.Element {
  const state = useApp()
  const lang = state.prefs.titleLang
  const seen = state.watched.get(media.id)?.size ?? 0
  const next = nextEpisodeOf(state, media.id, media.episodes)
  const ready = next !== null && !isUnaired(media, next)

  return (
    <div className="flex gap-5">
      <img src={media.cover.large} alt="" className="xh-frame h-[176px] w-[120px] object-cover" />
      <div className="min-w-0 flex-1">
        <p className="xh-code">CIBLE VERROUILLÉE</p>
        <button className="block text-left" onClick={() => state.navigate({ name: 'anime', id: media.id })}>
          <h1 className="title-xl clamp-2 mt-1 text-[1.7rem] leading-tight">{titleOf(media, lang)}</h1>
        </button>
        <p className="mt-2 text-[0.8rem] text-muted">
          {seen} / {media.episodes ?? '?'} ÉP · {media.studios[0] ?? '—'}
        </p>
        {ready && (
          <button
            className="xh-cmd xh-cmd-hot mt-4"
            onClick={() => {
              void state.toggleEpisode(media.id, next, media)
              state.toast(`Épisode ${next} coché · ${titleOf(media, lang)}`)
            }}
          >
            ▶ ENGAGER ÉP. {next}
          </button>
        )}
      </div>
      <Gauge value={media.episodes ? Math.min(1, seen / media.episodes) : 0} label="PROGRESSION" />
    </div>
  )
}

function Home(): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const continuing = useContinue()
  const behind = useBehind()
  const upcoming = useUpcoming()
  const totals = useTotals()
  const trending = useBrowse({ kind: 'trending', perPage: 16 })
  const peak = Math.max(1, ...totals.days)
  const done = totals.completed + totals.watching + totals.planned

  return (
    <div className="xh-screen grid grid-cols-12 gap-3 p-5">
      <Panel code="A-01" title="Cible active" className="col-span-7">
        {continuing[0] ? <Target media={continuing[0]} /> : <p className="text-faint">Aucune série en cours.</p>}
      </Panel>

      <Panel code="A-02" title="Télémétrie" className="col-span-5">
        <div className="grid grid-cols-2 gap-3">
          {[
            ['TEMPS TOTAL', minutesToHuman(totals.minutes)],
            ['ÉPISODES', String(totals.episodes)],
            ['7 DERNIERS JOURS', `${totals.week} ép.`],
            ['TERMINÉES', `${totals.completed}/${done}`]
          ].map(([k, v]) => (
            <div key={k} className="xh-readout">
              <p className="xh-code">{k}</p>
              <p className="xh-value mt-1">{v}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel code="B-01" title="Activité 14 jours" className="col-span-7">
        <div className="flex h-[120px] items-end gap-1.5">
          {totals.days.map((n, i) => (
            <motion.span
              key={i}
              className="xh-bar flex-1"
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(3, (n / peak) * 100)}%` }}
              transition={{ delay: i * 0.03, duration: 0.6 }}
              title={`${n} épisode${n > 1 ? 's' : ''}`}
            />
          ))}
        </div>
        <div className="xh-code mt-1.5 flex justify-between">
          <span>J-13</span>
          <span>AUJOURD’HUI</span>
        </div>
      </Panel>

      <Panel code="B-02" title="Radar des sorties" className="col-span-5">
        <ul className="flex flex-col gap-2">
          {upcoming.slice(0, 5).map((m) => (
            <li key={m.id}>
              <button
                className="flex w-full justify-between gap-3 text-left text-[0.8rem]"
                onClick={() => navigate({ name: 'anime', id: m.id })}
              >
                <span className="truncate">{titleOf(m, lang)}</span>
                <span className="xh-hot shrink-0">T-{countdown(m.nextAiring!.airingAt)}</span>
              </button>
            </li>
          ))}
          {upcoming.length === 0 && <li className="text-faint">Aucun contact.</li>}
        </ul>
      </Panel>

      <Panel code="C-01" title="Alertes · retard" className="col-span-12">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2">
          {behind.slice(0, 8).map(({ media, behind: n }) => (
            <button key={media.id} className="xh-alert" onClick={() => navigate({ name: 'anime', id: media.id })}>
              <span className="xh-alert-count">+{n}</span>
              <span className="truncate">{titleOf(media, lang)}</span>
            </button>
          ))}
          {behind.length === 0 && <p className="text-faint">Nominal. Aucun retard.</p>}
        </div>
      </Panel>

      <div className="xh-ticker col-span-12" aria-label="Tendances">
        <div className="xh-ticker-track">
          {[...trending.items, ...trending.items].map((m, i) => (
            <button key={`${m.id}-${i}`} onClick={() => navigate({ name: 'anime', id: m.id })}>
              ◆ {titleOf(m, lang)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Library(): React.JSX.Element {
  const shelf = useShelf()
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const watched = useApp((s) => s.watched)
  const [query, setQuery] = useState('')
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle ? shelf.filter((r) => titleOf(r.media, lang).toLowerCase().includes(needle)) : shelf
  }, [shelf, query, lang])

  return (
    <div className="xh-screen p-5">
      <Panel code="R-00" title={`Registre · ${rows.length} entrées`}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="FILTRER > titre"
          className="field mb-3 w-full"
        />
        <table className="xh-table w-full">
          <thead>
            <tr>
              <th>ID</th>
              <th>Titre</th>
              <th>Statut</th>
              <th>Progression</th>
              <th>Ép.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ media, entry }) => {
              const seen = watched.get(media.id)?.size ?? 0
              const ratio = media.episodes ? Math.min(1, seen / media.episodes) : 0
              return (
                <tr key={media.id} onClick={() => navigate({ name: 'anime', id: media.id })}>
                  <td className="xh-code">{String(media.id).padStart(6, '0')}</td>
                  <td className="font-semibold">{titleOf(media, lang)}</td>
                  <td>{STATUS_LABELS[entry.status]}</td>
                  <td>
                    <span className="xh-meter">
                      <span style={{ width: `${ratio * 100}%` }} />
                    </span>
                  </td>
                  <td className="tabular-nums">
                    {seen}/{media.episodes ?? '?'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}

/** Écran de télémétrie : radar des genres, cadran des heures, courbe des mois, lectures chiffrées. */
function Stats(): React.JSX.Element {
  const s = useStats()
  const navigate = useApp((st) => st.navigate)
  const lang = useApp((st) => st.prefs.titleLang)
  const peakGenre = Math.max(1, ...s.genres.map((g) => g.minutes))
  const peakHour = Math.max(1, ...s.hours)
  const peakMonth = Math.max(1, ...s.months.map((m) => m.episodes))
  const peakDay = Math.max(1, ...s.weekdays)
  const peakSeries = Math.max(1, ...s.topSeries.map((t) => t.minutes))

  const radar = s.genres.map((g, i) => {
    const angle = (i / Math.max(1, s.genres.length)) * Math.PI * 2 - Math.PI / 2
    const r = 20 + 80 * (g.minutes / peakGenre)
    return {
      ...g,
      x: 120 + Math.cos(angle) * r,
      y: 120 + Math.sin(angle) * r,
      lx: 120 + Math.cos(angle) * 112,
      ly: 120 + Math.sin(angle) * 112
    }
  })
  const curve = s.months.map((m, i) => `${(i / 11) * 600},${140 - (m.episodes / peakMonth) * 120}`).join(' ')

  return (
    <div className="xh-screen grid grid-cols-12 gap-3 p-5">
      <div className="col-span-12 grid grid-cols-5 gap-3">
        {[
          ['TEMPS CUMULÉ', `${Math.round(s.minutes / 60)} H`],
          ['ÉPISODES', String(s.episodes)],
          ['SÉRIES', String(s.series)],
          ['SÉRIE RECORD', `${s.bestStreak} J`],
          ['NOTE MOY.', s.avgScore === null ? '—' : s.avgScore.toFixed(1)]
        ].map(([k, v]) => (
          <div key={k} className="xh-panel relative p-4">
            <p className="xh-code">{k}</p>
            <p className="xh-value xh-value-big mt-1">{v}</p>
          </div>
        ))}
      </div>

      <Panel code="T-01" title="Radar des genres" className="col-span-4">
        {/* Marges autour du radar : à 240 px pile, les noms de genres étaient rognés sur les bords. */}
        <svg viewBox="-44 -12 328 264" className="mx-auto w-full max-w-[340px]">
          {[40, 70, 100].map((r) => (
            <circle key={r} cx="120" cy="120" r={r} className="xh-grid-line" />
          ))}
          {radar.map((p) => (
            <line key={p.name} x1="120" y1="120" x2={p.lx} y2={p.ly} className="xh-grid-line" />
          ))}
          <motion.polygon
            points={radar.map((p) => `${p.x},${p.y}`).join(' ')}
            className="xh-radar"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ transformOrigin: '120px 120px' }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          />
          {radar.map((p) => (
            <text
              key={p.name}
              x={p.lx}
              y={p.ly}
              className="xh-radar-label"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {p.name.slice(0, 10).toUpperCase()}
            </text>
          ))}
        </svg>
      </Panel>

      <Panel code="T-02" title="Cadran horaire" className="col-span-4">
        <svg viewBox="0 0 240 240" className="mx-auto w-full max-w-[300px]">
          {s.hours.map((n, h) => (
            <motion.rect
              key={h}
              x="116"
              y="16"
              width="8"
              height="34"
              transform={`rotate(${h * 15} 120 120)`}
              className="xh-hour"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.12 + 0.88 * (n / peakHour) }}
              transition={{ delay: h * 0.02 }}
            />
          ))}
          {[0, 6, 12, 18].map((h) => (
            <text
              key={h}
              x={120 + Math.sin((h / 24) * Math.PI * 2) * 60}
              y={120 - Math.cos((h / 24) * Math.PI * 2) * 60}
              className="xh-radar-label"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {String(h).padStart(2, '0')}H
            </text>
          ))}
          <text x="120" y="122" className="xh-dial" textAnchor="middle" dominantBaseline="middle">
            {String(s.hours.indexOf(peakHour)).padStart(2, '0')}H
          </text>
        </svg>
      </Panel>

      <Panel code="T-03" title="Cycle hebdo" className="col-span-4">
        <div className="flex flex-col gap-2.5">
          {s.weekdays.map((n, i) => (
            <div key={i} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3">
              <span className="xh-code">{WEEKDAYS[i].toUpperCase()}</span>
              <span className="xh-meter !w-full">
                <motion.span
                  initial={{ width: 0 }}
                  animate={{ width: `${(n / peakDay) * 100}%` }}
                  transition={{ delay: i * 0.05 }}
                />
              </span>
              <span className="text-right text-[0.8rem] tabular-nums">{n}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel code="T-04" title="Trajectoire 12 mois" className="col-span-7">
        <svg viewBox="-10 -10 620 170" className="w-full">
          {[0, 40, 80, 120].map((y) => (
            <line key={y} x1="0" x2="600" y1={20 + y} y2={20 + y} className="xh-grid-line" />
          ))}
          <motion.polyline
            points={curve}
            className="xh-curve"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.4, ease: 'easeInOut' }}
          />
          {s.months.map((m, i) => (
            <text key={i} x={(i / 11) * 600} y="160" className="xh-radar-label" textAnchor="middle">
              {m.label.toUpperCase()}
            </text>
          ))}
        </svg>
      </Panel>

      <Panel code="T-05" title="Cibles les plus suivies" className="col-span-5">
        <ul className="flex flex-col gap-2">
          {s.topSeries.slice(0, 7).map(({ media, minutes }, i) => (
            <li key={media.id}>
              <button className="w-full text-left" onClick={() => navigate({ name: 'anime', id: media.id })}>
                <span className="flex justify-between gap-3 text-[0.78rem]">
                  <span className="truncate">
                    <span className="xh-code mr-2">{String(i + 1).padStart(2, '0')}</span>
                    {titleOf(media, lang)}
                  </span>
                  <span className="xh-hot shrink-0">{Math.round(minutes / 60)} H</span>
                </span>
                <span className="xh-meter mt-1 !w-full">
                  <span style={{ width: `${(minutes / peakSeries) * 100}%` }} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}

export const hud: Experience = {
  Nav,
  Home,
  Library,
  Stats,
  Discover: HudDiscover,
  Calendar: HudCalendar,
  Manga: HudManga,
  DetailHero: HudDetailHero,
  Badges: HudBadges,
  motion: {
    initial: { opacity: 0, clipPath: 'inset(0 0 100% 0)' },
    animate: { opacity: 1, clipPath: 'inset(0 0 0% 0)' },
    exit: { opacity: 0 },
    transition: { duration: 0.45, ease: [0.65, 0, 0.35, 1] }
  }
}
