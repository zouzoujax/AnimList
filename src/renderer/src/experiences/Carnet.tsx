import { Search } from 'lucide-react'
import { motion } from 'motion/react'
import { STATUS_LABELS, type LibraryStatus, type Media } from '@shared/types'
import { formatLabel, minutesToHuman, titleOf } from '@/lib/format'
import { useBrowse } from '@/lib/hooks'
import { nextEpisodeOf, useApp, type Route } from '@/store/app'
import { useBehind, useContinue, useShelf, useTotals } from './data'
import { WEEKDAYS, useStats } from './stats'
import { CarnetCalendar, CarnetDetailHero, CarnetDiscover, CarnetManga } from './carnet-pages'
import type { Experience } from '.'

/*
 * CARNET — un carnet de collectionneur posé sur du cuir : onglets en ruban sur
 * le bord, jaquettes scotchées comme des photos, retards sur des post-it,
 * séries terminées en timbres, et une bibliothèque rangée sur des étagères de
 * cartes qui se retournent au survol.
 */

const TABS: { route: Route; label: string; color: string }[] = [
  { route: { name: 'home' }, label: 'Carnet', color: '#c8553d' },
  { route: { name: 'library' }, label: 'Étagères', color: '#e0a458' },
  { route: { name: 'discover' }, label: 'Trouvailles', color: '#588b8b' },
  { route: { name: 'calendar' }, label: 'Agenda', color: '#8f5d9a' },
  { route: { name: 'manga' }, label: 'Manga', color: '#6b8f4e' },
  { route: { name: 'stats' }, label: 'Bilan', color: '#3f6c9e' },
  { route: { name: 'settings' }, label: 'Réglages', color: '#7a6a58' }
]

/** Une inclinaison qui a l'air laissée au hasard, mais qui ne bouge pas d'un rendu à l'autre. */
const tilt = (i: number): number => ((i * 37) % 7) - 3

function Nav(): React.JSX.Element {
  const route = useApp((s) => s.route)
  const navigate = useApp((s) => s.navigate)
  const setPalette = useApp((s) => s.setPalette)

  return (
    <nav
      aria-label="Navigation principale"
      className="xk-tabs flex w-[64px] shrink-0 flex-col items-start gap-1.5 py-8"
    >
      <button className="xk-tab xk-tab-search" onClick={() => setPalette(true)} aria-label="Rechercher">
        <Search size={16} />
      </button>
      {TABS.map(({ route: target, label, color }) => {
        const active = route.name === target.name
        return (
          <motion.button
            key={target.name}
            onClick={() => navigate(target)}
            aria-current={active ? 'page' : undefined}
            className="xk-tab"
            style={{ background: color }}
            animate={{ x: active ? -10 : 0 }}
            whileHover={{ x: -6 }}
          >
            <span className="xk-tab-label">{label}</span>
          </motion.button>
        )
      })}
    </nav>
  )
}

function Polaroid({ media, index }: { media: Media; index: number }): React.JSX.Element {
  const state = useApp()
  const seen = state.watched.get(media.id)?.size ?? 0
  const next = nextEpisodeOf(state, media.id, media.episodes)
  return (
    <motion.button
      className="xk-polaroid text-left"
      style={{ rotate: tilt(index) }}
      whileHover={{ rotate: 0, scale: 1.06, y: -6 }}
      onClick={() => state.navigate({ name: 'anime', id: media.id })}
    >
      <span className="xk-tape" aria-hidden />
      <img src={media.cover.large} alt="" className="aspect-[3/4] w-full object-cover" />
      <span className="xk-hand mt-2 block clamp-2">{titleOf(media, state.prefs.titleLang)}</span>
      <span className="xk-note block">
        ép. {seen}/{media.episodes ?? '?'}
        {next ? ` · prochain : ${next}` : ''}
      </span>
    </motion.button>
  )
}

function TradingCard({ media, index }: { media: Media; index: number }): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  return (
    <button
      className="xk-card group"
      style={{ '--fan': `${(index - 2) * 6}deg` } as React.CSSProperties}
      onClick={() => navigate({ name: 'anime', id: media.id })}
    >
      <span className="xk-card-inner">
        <span className="xk-card-face">
          <img src={media.cover.large} alt="" className="h-full w-full object-cover" />
          <span className="xk-card-name">{titleOf(media, lang)}</span>
        </span>
        <span className="xk-card-face xk-card-back">
          <span className="xk-hand">{titleOf(media, lang)}</span>
          <span className="xk-note mt-2 block">{formatLabel(media.format)}</span>
          <span className="xk-note block">{media.episodes ?? '?'} épisodes</span>
          <span className="xk-note block">{media.averageScore ?? '—'} / 100</span>
          <span className="xk-note block">{media.studios[0] ?? ''}</span>
        </span>
      </span>
    </button>
  )
}

function Home(): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const continuing = useContinue()
  const behind = useBehind()
  const totals = useTotals()
  const shelf = useShelf()
  const trending = useBrowse({ kind: 'trending', perPage: 5 })
  const completed = shelf.filter((r) => r.entry.status === 'completed')

  return (
    <div className="px-8 py-8">
      <div className="xk-page relative mx-auto max-w-[1180px] px-16 py-12">
        <span className="xk-rings" aria-hidden />
        <header className="flex items-end justify-between">
          <div>
            <p className="xk-note">
              {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <h1 className="xk-title">Mon carnet</h1>
          </div>
          <p className="xk-hand text-right">
            {minutesToHuman(totals.minutes)} de visionnage
            <br />
            {totals.completed} séries au complet
          </p>
        </header>

        <h2 className="xk-heading mt-10">En cours</h2>
        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-7">
          {continuing.slice(0, 10).map((m, i) => (
            <Polaroid key={m.id} media={m} index={i} />
          ))}
        </div>

        <div className="mt-12 grid grid-cols-[1fr_1.2fr] gap-12">
          <section>
            <h2 className="xk-heading">À rattraper</h2>
            <div className="mt-4 flex flex-wrap gap-4">
              {behind.slice(0, 6).map(({ media, behind: n }, i) => (
                <motion.button
                  key={media.id}
                  className="xk-postit text-left"
                  style={{ rotate: tilt(i + 3) }}
                  whileHover={{ rotate: 0, y: -4 }}
                  onClick={() => navigate({ name: 'anime', id: media.id })}
                >
                  <span className="xk-hand clamp-3 block">{titleOf(media, lang)}</span>
                  <span className="xk-postit-count">+{n}</span>
                </motion.button>
              ))}
              {behind.length === 0 && <p className="xk-hand">Rien en retard. Bravo.</p>}
            </div>
          </section>
          <section>
            <h2 className="xk-heading">Pioche du jour</h2>
            <p className="xk-note">Survole une carte pour la retourner.</p>
            <div className="xk-fan mt-6">
              {trending.items.slice(0, 5).map((m, i) => (
                <TradingCard key={m.id} media={m} index={i} />
              ))}
            </div>
          </section>
        </div>

        {completed.length > 0 && (
          <>
            <h2 className="xk-heading mt-12">Timbres de la collection</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {completed.map(({ media }, i) => (
                <motion.button
                  key={media.id}
                  className="xk-stamp"
                  style={{ rotate: tilt(i) / 2 }}
                  whileHover={{ scale: 1.12, rotate: 0 }}
                  title={titleOf(media, lang)}
                  onClick={() => navigate({ name: 'anime', id: media.id })}
                >
                  <img src={media.cover.large} alt="" className="h-full w-full object-cover" />
                </motion.button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const SHELVES: LibraryStatus[] = ['watching', 'planned', 'paused', 'completed', 'dropped']

function Library(): React.JSX.Element {
  const shelf = useShelf()

  return (
    <div className="px-10 py-10">
      <h1 className="xk-title xk-title-light">Étagères</h1>
      {SHELVES.map((status) => {
        const rows = shelf.filter((r) => r.entry.status === status)
        if (rows.length === 0) return null
        return (
          <section key={status} className="mt-10">
            <p className="xk-label">
              {STATUS_LABELS[status]} · {rows.length}
            </p>
            <div className="xk-shelf scroll-x flex gap-5 px-6 pb-5 pt-8">
              {/* Rang 2 : le milieu de l'éventail, donc une carte droite sur l'étagère. */}
              {rows.map(({ media }) => (
                <TradingCard key={media.id} media={media} index={2} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

const INKS = ['#c8553d', '#e0a458', '#588b8b', '#8f5d9a', '#6b8f4e', '#3f6c9e', '#b5838d', '#7a6a58']

/** « Mon bilan » écrit dans le carnet : chiffres à la main, anneau des genres, podium de photos. */
function Stats(): React.JSX.Element {
  const s = useStats()
  const navigate = useApp((st) => st.navigate)
  const lang = useApp((st) => st.prefs.titleLang)
  const total = s.genres.reduce((sum, g) => sum + g.minutes, 0) || 1
  const peakDay = Math.max(1, ...s.weekdays)
  const peakMonth = Math.max(1, ...s.months.map((m) => m.episodes))

  // Anneau : chaque genre prend sa part de la circonférence, à la suite du précédent.
  const circumference = 2 * Math.PI * 70
  const lengths = s.genres.map((g) => (g.minutes / total) * circumference)
  const arcs = s.genres.map((g, i) => ({
    ...g,
    color: INKS[i % INKS.length],
    dash: `${lengths[i]} ${circumference - lengths[i]}`,
    // Commence là où les arcs précédents s'arrêtent.
    offset: -lengths.slice(0, i).reduce((sum, l) => sum + l, 0)
  }))

  return (
    <div className="px-8 py-8">
      <div className="xk-page relative mx-auto max-w-[1180px] px-16 py-12">
        <span className="xk-rings" aria-hidden />
        <p className="xk-note">
          Bilan arrêté au {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <h1 className="xk-title">Mon bilan</h1>

        <div className="mt-8 grid grid-cols-4 gap-6">
          {[
            [Math.round(s.minutes / 60), 'heures'],
            [s.episodes, 'épisodes'],
            [s.completed, 'séries finies'],
            [s.bestStreak, 'jours d’affilée']
          ].map(([value, label], i) => (
            <motion.div
              key={label}
              className="xk-scribble"
              style={{ rotate: tilt(i + 1) / 2 }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1, type: 'spring', stiffness: 200, damping: 16 }}
            >
              <span className="xk-scribble-num">{value}</span>
              <span className="xk-hand">{label}</span>
            </motion.div>
          ))}
        </div>

        <div className="mt-12 grid grid-cols-[320px_1fr] gap-12">
          <section>
            <h2 className="xk-heading">Mes genres</h2>
            <svg viewBox="0 0 200 200" className="mt-4 w-[240px]">
              {arcs.map((a) => (
                <motion.circle
                  key={a.name}
                  cx="100"
                  cy="100"
                  r="70"
                  fill="none"
                  stroke={a.color}
                  strokeWidth="34"
                  strokeDasharray={a.dash}
                  strokeDashoffset={a.offset}
                  transform="rotate(-90 100 100)"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                />
              ))}
              <circle cx="100" cy="100" r="52" fill="#f3e6cf" />
              <text x="100" y="104" textAnchor="middle" className="xk-donut-label">
                {s.genres.length} genres
              </text>
            </svg>
            <ul className="mt-4 flex flex-col gap-1">
              {arcs.map((a) => (
                <li key={a.name} className="flex items-center gap-2 text-[0.85rem]">
                  <span className="h-3 w-3 rounded-full" style={{ background: a.color }} />
                  {a.name}
                  <span className="xk-note ml-auto">{Math.round((a.minutes / total) * 100)} %</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="xk-heading">Mon podium</h2>
            <div className="mt-6 flex items-end gap-6">
              {s.topSeries.slice(0, 3).map(({ media, minutes }, i) => (
                <motion.button
                  key={media.id}
                  className="xk-polaroid w-[170px] text-left"
                  style={{ rotate: tilt(i + 2), marginBottom: i === 0 ? 40 : i === 1 ? 20 : 0 }}
                  whileHover={{ rotate: 0, y: -6 }}
                  onClick={() => navigate({ name: 'anime', id: media.id })}
                >
                  <span className="xk-tape" aria-hidden />
                  <span className="xk-medal">n°{i + 1}</span>
                  <img src={media.cover.large} alt="" className="aspect-[3/4] w-full object-cover" />
                  <span className="xk-hand clamp-2 mt-2 block">{titleOf(media, lang)}</span>
                  <span className="xk-note block">{Math.round(minutes / 60)} h</span>
                </motion.button>
              ))}
            </div>

            <h2 className="xk-heading mt-10">Ma semaine type</h2>
            <div className="mt-4 flex h-[120px] items-end gap-4">
              {s.weekdays.map((n, i) => (
                <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <motion.span
                    className="xk-hatch w-full"
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(4, (n / peakDay) * 100)}%` }}
                    transition={{ delay: i * 0.05 }}
                  />
                  <span className="xk-note">{WEEKDAYS[i]}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <h2 className="xk-heading mt-12">Mes mois en timbres</h2>
        <div className="mt-4 grid grid-cols-6 gap-4">
          {s.months.map((m, i) => (
            <div
              key={i}
              className="xk-month-stamp"
              style={{ rotate: `${tilt(i) / 2}deg`, opacity: 0.4 + 0.6 * (m.episodes / peakMonth) }}
            >
              <span className="xk-hand block">{m.label}</span>
              <span className="xk-scribble-num !text-[2rem]">{m.episodes}</span>
              <span className="xk-note block">épisodes</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export const carnet: Experience = {
  Nav,
  Home,
  Library,
  Stats,
  Discover: CarnetDiscover,
  Calendar: CarnetCalendar,
  Manga: CarnetManga,
  DetailHero: CarnetDetailHero,
  motion: {
    initial: { opacity: 0, y: 36, rotate: -1.2 },
    animate: { opacity: 1, y: 0, rotate: 0 },
    exit: { opacity: 0, y: -18, rotate: 0.6 },
    transition: { type: 'spring', stiffness: 170, damping: 22 }
  }
}
