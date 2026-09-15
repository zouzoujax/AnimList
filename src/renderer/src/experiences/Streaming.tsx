import { ChevronLeft, ChevronRight, Info, Play, Search } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { STATUS_LABELS, type LibraryStatus, type Media } from '@shared/types'
import { isUnaired, titleOf } from '@/lib/format'
import { useBrowse } from '@/lib/hooks'
import { nextEpisodeOf, useApp, type Route } from '@/store/app'
import { useBehind, useContinue, useShelf } from './data'
import type { Experience } from '.'

/*
 * STREAMING — la grammaire des plateformes : une bannière qui occupe l'écran et
 * tourne toute seule, un menu posé par-dessus qui se fonce en défilant, et des
 * rangées de vignettes paysage qui s'agrandissent au survol.
 */

const NAV: { route: Route; label: string }[] = [
  { route: { name: 'home' }, label: 'Accueil' },
  { route: { name: 'discover' }, label: 'Découvrir' },
  { route: { name: 'library' }, label: 'Ma liste' },
  { route: { name: 'calendar' }, label: 'Calendrier' },
  { route: { name: 'manga' }, label: 'Manga' },
  { route: { name: 'stats' }, label: 'Statistiques' },
  { route: { name: 'settings' }, label: 'Réglages' }
]

function Nav(): React.JSX.Element {
  const route = useApp((s) => s.route)
  const navigate = useApp((s) => s.navigate)
  const setPalette = useApp((s) => s.setPalette)
  const [solid, setSolid] = useState(false)

  // Transparent sur la bannière, plein dès qu'on descend : le menu ne doit
  // jamais se lire par-dessus une affiche.
  useEffect(() => {
    const box = document.getElementById('contenu')
    if (!box) return
    const onScroll = (): void => setSolid(box.scrollTop > 40)
    box.addEventListener('scroll', onScroll, { passive: true })
    return () => box.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      aria-label="Navigation principale"
      className="xs-nav absolute inset-x-0 top-0 z-30 flex h-16 items-center gap-7 px-10 transition-colors duration-500"
      data-solid={solid || route.name !== 'home'}
    >
      <span className="xs-logo select-none">ANIMELIST</span>
      {NAV.map(({ route: target, label }) => (
        <button
          key={target.name}
          onClick={() => navigate(target)}
          aria-current={route.name === target.name ? 'page' : undefined}
          className="xs-link text-[0.86rem]"
        >
          {label}
        </button>
      ))}
      <button className="xs-link ml-auto" onClick={() => setPalette(true)} aria-label="Rechercher">
        <Search size={19} />
      </button>
    </nav>
  )
}

/** Lecture ou fiche : le bouton blanc fait toujours la chose la plus probable. */
function usePlay(media: Media | undefined): { label: string; run: () => void } {
  const state = useApp()
  if (!media) return { label: 'Lecture', run: () => {} }
  const tracked = state.entries.get(media.id)?.status === 'watching'
  const next = tracked ? nextEpisodeOf(state, media.id, media.episodes) : null
  if (next !== null && !isUnaired(media, next)) {
    return {
      label: `Épisode ${next}`,
      run: () => {
        void state.toggleEpisode(media.id, next, media)
        state.toast(`Épisode ${next} coché · ${titleOf(media, state.prefs.titleLang)}`)
      }
    }
  }
  return { label: 'Voir', run: () => state.navigate({ name: 'anime', id: media.id }) }
}

function Billboard({ items }: { items: Media[] }): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const reduceMotion = useApp((s) => s.prefs.reduceMotion)
  const [index, setIndex] = useState(0)
  const media = items[index % Math.max(1, items.length)]
  const play = usePlay(media)

  useEffect(() => {
    if (reduceMotion || items.length < 2) return
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), 9000)
    return () => clearInterval(t)
  }, [items.length, reduceMotion])

  if (!media) return <div className="skeleton h-[78vh]" />

  return (
    <section className="on-art relative h-[78vh] min-h-[520px] overflow-hidden">
      <AnimatePresence mode="popLayout">
        <motion.img
          key={media.id}
          src={media.banner ?? media.cover.xl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          initial={{ opacity: 0, scale: 1.08 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ opacity: { duration: 1.1 }, scale: { duration: 9, ease: 'linear' } }}
        />
      </AnimatePresence>
      <div className="xs-vignette absolute inset-0" />

      <div className="absolute bottom-[18%] left-10 max-w-[620px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={media.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="xs-kicker mb-3">
              <span className="xs-badge">A</span> SÉRIE
            </p>
            <h1 className="title-xl clamp-2 text-[3.4rem] leading-[0.98]">{titleOf(media, lang)}</h1>
            <div className="mt-4 flex items-center gap-3 text-[0.9rem]">
              {media.averageScore !== null && (
                <span className="font-bold text-[#46d369]">{media.averageScore}% d’appréciation</span>
              )}
              {media.seasonYear && <span className="text-muted">{media.seasonYear}</span>}
              {media.episodes && <span className="xs-outline">{media.episodes} ép.</span>}
            </div>
            {media.description && (
              <p className="clamp-3 mt-4 text-[1rem] leading-relaxed text-muted">{media.description}</p>
            )}
            <div className="mt-6 flex gap-3">
              <button className="xs-play" onClick={play.run}>
                <Play size={20} fill="currentColor" strokeWidth={0} />
                {play.label}
              </button>
              <button className="xs-more" onClick={() => navigate({ name: 'anime', id: media.id })}>
                <Info size={20} />
                Plus d’infos
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="absolute bottom-[18%] right-10 flex gap-1.5">
        {items.map((m, i) => (
          <button
            key={m.id}
            aria-label={`Afficher ${titleOf(m, lang)}`}
            onClick={() => setIndex(i)}
            className="xs-dot"
            data-on={i === index % items.length}
          />
        ))}
      </div>
    </section>
  )
}

function Row({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const slide = (dir: number): void =>
    ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: 'smooth' })

  return (
    <section className="xs-row group/row relative mb-10">
      <h2 className="mb-3 px-10 text-[1.3rem] font-bold">{title}</h2>
      <div ref={ref} className="scroll-x flex gap-2 px-10 py-6">
        {children}
      </div>
      <button className="xs-arrow left-0" onClick={() => slide(-1)} aria-label="Précédent">
        <ChevronLeft size={34} />
      </button>
      <button className="xs-arrow right-0" onClick={() => slide(1)} aria-label="Suivant">
        <ChevronRight size={34} />
      </button>
    </section>
  )
}

function Tile({ media, progress, note }: { media: Media; progress?: number; note?: string }): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  return (
    <motion.button
      onClick={() => navigate({ name: 'anime', id: media.id })}
      className="xs-tile relative w-[300px] shrink-0 text-left"
      whileHover={{ scale: 1.14, zIndex: 10, transition: { delay: 0.25, duration: 0.3 } }}
    >
      <div className="relative aspect-video overflow-hidden rounded-[4px]">
        <img src={media.banner ?? media.cover.xl} alt="" className="h-full w-full object-cover" loading="lazy" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2.5 pt-8">
          <p className="clamp-2 text-[0.82rem] font-bold text-white">{titleOf(media, lang)}</p>
          {note && <p className="text-[0.7rem] font-semibold text-[#46d369]">{note}</p>}
        </div>
      </div>
      {progress !== undefined && (
        <div className="xs-progress mt-1.5">
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
    </motion.button>
  )
}

function Top10({ items }: { items: Media[] }): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  return (
    <Row title="Top 10 des tendances aujourd’hui">
      {items.slice(0, 10).map((media, i) => (
        <motion.button
          key={media.id}
          onClick={() => navigate({ name: 'anime', id: media.id })}
          className="relative flex h-[210px] w-[250px] shrink-0 items-end"
          whileHover={{ scale: 1.06 }}
        >
          <span className="xs-rank" aria-hidden>
            {i + 1}
          </span>
          <img
            src={media.cover.large}
            alt=""
            className="relative ml-auto h-full w-[140px] rounded-[4px] object-cover"
            loading="lazy"
          />
        </motion.button>
      ))}
    </Row>
  )
}

function Home(): React.JSX.Element {
  const watched = useApp((s) => s.watched)
  const continuing = useContinue()
  const behind = useBehind()
  const trending = useBrowse({ kind: 'trending', perPage: 20 })
  const season = useBrowse({ kind: 'season', perPage: 20 })
  const billboard = [...continuing.slice(0, 3), ...trending.items.slice(0, 3)].slice(0, 5)

  return (
    <div className="xs-page pb-16">
      <Billboard items={billboard} />
      <div className="relative -mt-[12vh]">
        {continuing.length > 0 && (
          <Row title="Reprendre la lecture">
            {continuing.map((m) => (
              <Tile key={m.id} media={m} progress={m.episodes ? (watched.get(m.id)?.size ?? 0) / m.episodes : 0} />
            ))}
          </Row>
        )}
        {trending.items.length > 0 && <Top10 items={trending.items} />}
        {behind.length > 0 && (
          <Row title="Nouveaux épisodes pour toi">
            {behind.map(({ media, behind: n }) => (
              <Tile key={media.id} media={media} note={`${n} nouvel${n > 1 ? 's' : ''} épisode${n > 1 ? 's' : ''}`} />
            ))}
          </Row>
        )}
        {season.items.length > 0 && (
          <Row title="Nouveautés de la saison">
            {season.items.map((m) => (
              <Tile key={m.id} media={m} />
            ))}
          </Row>
        )}
      </div>
    </div>
  )
}

const TABS: (LibraryStatus | 'all')[] = ['all', 'watching', 'planned', 'completed', 'paused', 'dropped']

function Library(): React.JSX.Element {
  const shelf = useShelf()
  const watched = useApp((s) => s.watched)
  const [tab, setTab] = useState<LibraryStatus | 'all'>('all')
  const rows = tab === 'all' ? shelf : shelf.filter((r) => r.entry.status === tab)

  return (
    <div className="xs-page px-10 pb-16 pt-24">
      <h1 className="title-xl mb-5 text-[2.4rem]">Ma liste</h1>
      <div className="mb-8 flex flex-wrap gap-2">
        {TABS.map((id) => (
          <button key={id} className="xs-tab" data-on={tab === id} onClick={() => setTab(id)}>
            {id === 'all' ? 'Tout' : STATUS_LABELS[id]}
          </button>
        ))}
      </div>
      <div className="xs-grid grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-2 gap-y-8">
        {rows.map(({ media }) => (
          <Tile
            key={media.id}
            media={media}
            progress={media.episodes ? (watched.get(media.id)?.size ?? 0) / media.episodes : undefined}
          />
        ))}
      </div>
    </div>
  )
}

export const streaming: Experience = {
  Nav,
  Home,
  Library,
  motion: {
    initial: { opacity: 0, scale: 1.015 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] }
  }
}
