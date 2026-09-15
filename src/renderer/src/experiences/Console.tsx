import {
  BookOpen,
  CalendarDays,
  ChartColumn,
  Compass,
  Gamepad2,
  House,
  LibraryBig,
  Play,
  Search,
  Settings
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { STATUS_LABELS, type LibraryStatus, type Media } from '@shared/types'
import { countdown, isUnaired, minutesToHuman, titleOf } from '@/lib/format'
import { useBrowse, useNow } from '@/lib/hooks'
import { nextEpisodeOf, useApp, type Route } from '@/store/app'
import { useBehind, useContinue, useShelf, useTotals, useUpcoming } from './data'
import { WEEKDAYS, useStats } from './stats'
import { ConsoleCalendar, ConsoleDetailHero, ConsoleDiscover, ConsoleManga } from './console-pages'
import { ConsoleBadges } from './badges-pages'
import { ConsoleDetailBody } from './detail-bodies'
import type { Experience } from '.'

/*
 * CONSOLE — l'écran d'accueil d'une console de salon : une barre de tuiles
 * carrées où la tuile choisie s'élargit, tout l'écran repeint par sa jaquette,
 * et une navigation au clavier (flèches, Entrée) comme à la manette.
 */

const NAV: { route: Route; label: string; icon: typeof House }[] = [
  { route: { name: 'home' }, label: 'Accueil', icon: House },
  { route: { name: 'library' }, label: 'Collection', icon: LibraryBig },
  { route: { name: 'discover' }, label: 'Store', icon: Compass },
  { route: { name: 'calendar' }, label: 'Agenda', icon: CalendarDays },
  { route: { name: 'manga' }, label: 'Manga', icon: BookOpen },
  { route: { name: 'stats' }, label: 'Statistiques', icon: ChartColumn },
  { route: { name: 'badges' }, label: 'Trophées', icon: Gamepad2 },
  { route: { name: 'settings' }, label: 'Paramètres', icon: Settings }
]

function Nav(): React.JSX.Element {
  const route = useApp((s) => s.route)
  const navigate = useApp((s) => s.navigate)
  const setPalette = useApp((s) => s.setPalette)
  const totals = useTotals()
  const now = useNow()

  return (
    <nav
      aria-label="Navigation principale"
      className="xc-nav absolute inset-x-0 top-0 z-30 flex h-20 items-center px-12"
    >
      <div className="flex items-center gap-1.5">
        {NAV.map(({ route: target, label, icon: Icon }) => {
          const active = route.name === target.name
          return (
            <button
              key={target.name}
              onClick={() => navigate(target)}
              aria-current={active ? 'page' : undefined}
              className="xc-tab relative flex h-11 items-center gap-2 rounded-full px-4 text-[0.95rem] font-medium"
            >
              {active && (
                <motion.span
                  layoutId="xc-tab"
                  className="xc-tab-on absolute inset-0 rounded-full"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <Icon size={18} className="relative" />
              <span className="relative">{label}</span>
            </button>
          )
        })}
      </div>
      <div className="ml-auto flex items-center gap-5">
        <button className="xc-round" onClick={() => setPalette(true)} aria-label="Rechercher">
          <Search size={19} />
        </button>
        <div className="flex items-center gap-2.5">
          <span className="xc-avatar" aria-hidden>
            <Gamepad2 size={18} />
          </span>
          <span className="text-[0.8rem] leading-tight">
            <span className="block font-semibold">{totals.week} ép. cette semaine</span>
            <span className="text-faint">série de {totals.streak} j</span>
          </span>
        </div>
        <span className="text-[1.15rem] font-light tabular-nums">
          {new Date(now).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </nav>
  )
}

function Home(): React.JSX.Element {
  const state = useApp()
  const lang = state.prefs.titleLang
  const continuing = useContinue()
  const behind = useBehind()
  const upcoming = useUpcoming()
  const totals = useTotals()
  const trending = useBrowse({ kind: 'trending', perPage: 12 })
  const bar = [...continuing, ...trending.items.filter((m) => !continuing.some((c) => c.id === m.id))].slice(0, 14)
  const [index, setIndex] = useState(0)
  const media: Media | undefined = bar[Math.min(index, bar.length - 1)]

  // Flèches et Entrée, comme à la manette. Seulement sur l'accueil et hors
  // d'un champ : ailleurs les flèches servent au défilement et à la saisie.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(bar.length - 1, i + 1))
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
      else if (e.key === 'Enter' && media) state.navigate({ name: 'anime', id: media.id })
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bar.length, media, state])

  const tracked = media ? state.entries.get(media.id) : undefined
  const next = media && tracked ? nextEpisodeOf(state, media.id, media.episodes) : null
  const canPlay = media && next !== null && !isUnaired(media, next)
  const seen = media ? (state.watched.get(media.id)?.size ?? 0) : 0

  return (
    <div className="xc-home relative min-h-full overflow-hidden px-12 pb-16 pt-28">
      <AnimatePresence>
        {media && (
          <motion.div
            key={media.id}
            className="xc-backdrop absolute inset-0"
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <img src={media.banner ?? media.cover.xl} alt="" className="h-full w-full object-cover" />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="xc-shade absolute inset-0" />

      <div className="relative">
        <div className="scroll-x flex items-start gap-3 py-4" role="listbox" aria-label="Séries">
          {bar.map((m, i) => {
            const on = i === index
            return (
              <motion.button
                key={m.id}
                role="option"
                aria-selected={on}
                onMouseEnter={() => setIndex(i)}
                onFocus={() => setIndex(i)}
                onClick={() => (on ? state.navigate({ name: 'anime', id: m.id }) : setIndex(i))}
                className="xc-tile relative shrink-0 overflow-hidden"
                animate={{ width: on ? 236 : 132, height: on ? 236 : 132 }}
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                data-on={on}
              >
                <img src={m.cover.large} alt="" className="h-full w-full object-cover" />
              </motion.button>
            )
          })}
        </div>

        <AnimatePresence mode="wait">
          {media && (
            <motion.div
              key={media.id}
              className="on-art mt-6 max-w-[720px]"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.35 }}
            >
              <h1 className="title-xl clamp-2 text-[3rem] leading-[1.02]">{titleOf(media, lang)}</h1>
              <p className="mt-3 text-[0.95rem] text-muted">
                {tracked
                  ? `${seen} / ${media.episodes ?? '?'} épisodes · ${STATUS_LABELS[tracked.status]}`
                  : 'Pas encore dans ta collection'}
                {media.nextAiring && ` · épisode ${media.nextAiring.episode} ${countdown(media.nextAiring.airingAt)}`}
              </p>
              {media.episodes && tracked && (
                <div className="xc-meter mt-4">
                  <span style={{ width: `${Math.min(100, (seen / media.episodes) * 100)}%` }} />
                </div>
              )}
              <div className="mt-7 flex gap-3">
                {canPlay ? (
                  <button
                    className="xc-primary"
                    onClick={() => {
                      void state.toggleEpisode(media.id, next, media)
                      state.toast(`Épisode ${next} coché · ${titleOf(media, lang)}`)
                    }}
                  >
                    <Play size={20} fill="currentColor" strokeWidth={0} />
                    Épisode {next}
                  </button>
                ) : (
                  <button className="xc-primary" onClick={() => state.navigate({ name: 'anime', id: media.id })}>
                    <Play size={20} fill="currentColor" strokeWidth={0} />
                    Ouvrir
                  </button>
                )}
                <button className="xc-secondary" onClick={() => state.navigate({ name: 'anime', id: media.id })}>
                  Fiche
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-14 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
          <div className="xc-card">
            <p className="xc-card-kicker">Temps de jeu</p>
            <p className="mt-2 text-[2rem] font-semibold">{minutesToHuman(totals.minutes)}</p>
            <p className="text-[0.85rem] text-faint">{totals.episodes} épisodes au total</p>
          </div>
          <div className="xc-card">
            <p className="xc-card-kicker">À rattraper</p>
            {behind.slice(0, 3).map(({ media: m, behind: n }) => (
              <button
                key={m.id}
                className="mt-2 flex w-full items-center gap-3 text-left"
                onClick={() => state.navigate({ name: 'anime', id: m.id })}
              >
                <img src={m.cover.large} alt="" className="h-10 w-10 rounded-lg object-cover" />
                <span className="min-w-0 flex-1 truncate text-[0.88rem]">{titleOf(m, lang)}</span>
                <span className="text-[0.8rem] font-semibold text-[var(--accent)]">+{n}</span>
              </button>
            ))}
            {behind.length === 0 && <p className="mt-2 text-[0.88rem] text-faint">Tout est à jour.</p>}
          </div>
          <div className="xc-card">
            <p className="xc-card-kicker">Prochaines sorties</p>
            {upcoming.slice(0, 3).map((m) => (
              <p key={m.id} className="mt-2 flex justify-between gap-3 text-[0.88rem]">
                <span className="truncate">{titleOf(m, lang)}</span>
                <span className="shrink-0 text-faint">{countdown(m.nextAiring!.airingAt)}</span>
              </p>
            ))}
            {upcoming.length === 0 && <p className="mt-2 text-[0.88rem] text-faint">Rien cette semaine.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

const FILTERS: (LibraryStatus | 'all')[] = ['all', 'watching', 'planned', 'completed', 'paused', 'dropped']

function Library(): React.JSX.Element {
  const shelf = useShelf()
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const watched = useApp((s) => s.watched)
  const [filter, setFilter] = useState<LibraryStatus | 'all'>('all')
  const rows = filter === 'all' ? shelf : shelf.filter((r) => r.entry.status === filter)

  return (
    <div className="px-12 pb-16 pt-28">
      <div className="mb-8 flex items-end justify-between">
        <h1 className="title-xl text-[2.6rem]">Ta collection</h1>
        <p className="text-[0.95rem] text-faint">{rows.length} titres</p>
      </div>
      <div className="mb-8 flex flex-wrap gap-2">
        {FILTERS.map((id) => (
          <button key={id} className="xc-filter" data-on={filter === id} onClick={() => setFilter(id)}>
            {id === 'all' ? 'Tout' : STATUS_LABELS[id]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-5">
        {rows.map(({ media, entry }, i) => {
          const seen = watched.get(media.id)?.size ?? 0
          return (
            <motion.button
              key={media.id}
              onClick={() => navigate({ name: 'anime', id: media.id })}
              className="xc-game text-left"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.4) }}
              whileHover={{ y: -6 }}
            >
              <div className="xc-tile relative aspect-square overflow-hidden">
                <img src={media.cover.large} alt="" className="h-full w-full object-cover" loading="lazy" />
                {media.episodes && seen > 0 && (
                  <span className="xc-trophy">{Math.round((seen / media.episodes) * 100)}%</span>
                )}
              </div>
              <p className="clamp-2 mt-2.5 text-[0.88rem] font-medium">{titleOf(media, lang)}</p>
              <p className="text-[0.75rem] text-faint">{STATUS_LABELS[entry.status]}</p>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

type Tier = 'platinum' | 'gold' | 'silver' | 'bronze'

/** La salle des trophées : un niveau de joueur, des trophées à débloquer, les jeux les plus joués. */
function Stats(): React.JSX.Element {
  const s = useStats()
  const navigate = useApp((st) => st.navigate)
  const lang = useApp((st) => st.prefs.titleLang)
  const hours = s.minutes / 60
  // Chaque niveau demande un peu plus que le précédent, comme sur console.
  const level = Math.floor(Math.sqrt(hours)) + 1
  const into = (hours - (level - 1) ** 2) / (level ** 2 - (level - 1) ** 2)
  const peakDay = Math.max(1, ...s.weekdays)

  const trophies: { name: string; hint: string; tier: Tier; got: boolean }[] = [
    { name: 'Premier pas', hint: 'Voir un épisode', tier: 'bronze', got: s.episodes >= 1 },
    { name: 'Centurion', hint: '100 épisodes vus', tier: 'bronze', got: s.episodes >= 100 },
    { name: 'Finisseur', hint: '10 séries terminées', tier: 'silver', got: s.completed >= 10 },
    { name: 'Régulier', hint: '7 jours d’affilée', tier: 'silver', got: s.bestStreak >= 7 },
    { name: 'Marathon', hint: '10 épisodes en un jour', tier: 'gold', got: (s.record?.episodes ?? 0) >= 10 },
    { name: 'Éclectique', hint: '8 genres différents', tier: 'gold', got: s.genres.length >= 8 },
    { name: 'Vétéran', hint: '500 heures de visionnage', tier: 'gold', got: hours >= 500 },
    { name: 'Platine', hint: '1000 épisodes vus', tier: 'platinum', got: s.episodes >= 1000 }
  ]
  const count = (tier: Tier): number => trophies.filter((t) => t.tier === tier && t.got).length

  return (
    <div className="px-12 pb-16 pt-28">
      <section className="xc-card flex items-center gap-8 !p-7">
        <span className="xc-level">{level}</span>
        <div className="min-w-0 flex-1">
          <p className="xc-card-kicker">Niveau de spectateur</p>
          <p className="title-xl mt-1 text-[2.2rem]">{Math.round(hours)} heures de jeu</p>
          <div className="xc-meter mt-3 !max-w-none">
            <motion.span initial={{ width: 0 }} animate={{ width: `${into * 100}%` }} transition={{ duration: 1 }} />
          </div>
          <p className="mt-1.5 text-[0.85rem] text-faint">
            {Math.round(into * 100)} % vers le niveau {level + 1}
          </p>
        </div>
        <div className="flex gap-5">
          {(['platinum', 'gold', 'silver', 'bronze'] as const).map((tier) => (
            <div key={tier} className="text-center">
              <span className={`xc-cup xc-${tier}`} aria-hidden />
              <p className="mt-1 text-[1.2rem] font-semibold">{count(tier)}</p>
            </div>
          ))}
        </div>
      </section>

      <h2 className="title-xl mb-4 mt-10 text-[1.5rem]">Trophées</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
        {trophies.map((t, i) => (
          <motion.div
            key={t.name}
            className="xc-card flex items-center gap-4"
            data-locked={!t.got}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: t.got ? 1 : 0.45, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <span className={`xc-cup xc-${t.tier}`} aria-hidden />
            <div>
              <p className="font-semibold">{t.name}</p>
              <p className="text-[0.8rem] text-faint">{t.got ? t.hint : `Verrouillé · ${t.hint}`}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <h2 className="title-xl mb-4 mt-10 text-[1.5rem]">Les plus joués</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
        {s.topSeries.slice(0, 6).map(({ media, episodes, minutes }) => (
          <button
            key={media.id}
            className="xc-card xc-game flex items-center gap-4 text-left"
            onClick={() => navigate({ name: 'anime', id: media.id })}
          >
            <span className="xc-tile block h-[72px] w-[72px] shrink-0 overflow-hidden">
              <img src={media.cover.large} alt="" className="h-full w-full object-cover" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{titleOf(media, lang)}</span>
              <span className="block text-[0.8rem] text-faint">
                {minutesToHuman(minutes)} · {episodes} ép.
              </span>
              {media.episodes && (
                <span className="xc-meter mt-2 block">
                  <span style={{ width: `${Math.min(100, (episodes / media.episodes) * 100)}%` }} />
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      <section className="xc-card mt-10">
        <p className="xc-card-kicker">Tes jours de jeu</p>
        <div className="mt-4 flex h-[120px] items-end gap-3">
          {s.weekdays.map((n, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <motion.span
                className="w-full rounded-t-lg bg-white/80"
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(3, (n / peakDay) * 100)}%` }}
                transition={{ delay: i * 0.05 }}
              />
              <span className="text-[0.8rem] text-faint">{WEEKDAYS[i]}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export const gameConsole: Experience = {
  Nav,
  Home,
  Library,
  Stats,
  Discover: ConsoleDiscover,
  Calendar: ConsoleCalendar,
  Manga: ConsoleManga,
  DetailHero: ConsoleDetailHero,
  Badges: ConsoleBadges,
  DetailBody: ConsoleDetailBody,
  motion: {
    initial: { opacity: 0, x: 48, filter: 'blur(6px)' },
    animate: { opacity: 1, x: 0, filter: 'blur(0px)' },
    exit: { opacity: 0, x: -32, filter: 'blur(4px)' },
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
  }
}
