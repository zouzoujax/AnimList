import { ArrowLeft, ChevronLeft, ChevronRight, FolderPlus, Heart, Play, Plus, Search } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import {
  STATUS_LABELS,
  type BrowseKind,
  type LibraryStatus,
  type Manga,
  type MangaKind,
  type Media
} from '@shared/types'
import { MangaSheet } from '@/components/MangaSheet'
import { Modal } from '@/components/ui'
import { formatLabel, formatTime, titleOf } from '@/lib/format'
import { useApp } from '@/store/app'
import { useCatalogue, useForYou, useMangaList, useWeek } from './pages-data'
import type { DetailHeroProps } from '.'

/*
 * CONSOLE — le reste du système : une boutique à la une tournante, un agenda
 * en frise, une bibliothèque de mangas en tuiles et une fiche « hub de jeu ».
 */

function SquareTile({ media, badge }: { media: Media; badge?: string }): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  return (
    <motion.button
      className="xc-game text-left"
      whileHover={{ y: -6 }}
      onClick={() => navigate({ name: 'anime', id: media.id })}
    >
      <span className="xc-tile relative block aspect-square overflow-hidden">
        <img src={media.cover.large} alt="" className="h-full w-full object-cover" loading="lazy" />
        {badge && <span className="xc-trophy">{badge}</span>}
      </span>
      <span className="clamp-2 mt-2 block text-[0.86rem] font-medium">{titleOf(media, lang)}</span>
    </motion.button>
  )
}

const TABS: { kind: BrowseKind; label: string }[] = [
  { kind: 'trending', label: 'À la une' },
  { kind: 'season', label: 'Nouveautés' },
  { kind: 'popular', label: 'Meilleures ventes' },
  { kind: 'top', label: 'Mieux notés' },
  { kind: 'upcoming', label: 'Précommandes' }
]

export function ConsoleDiscover({ initialSearch }: { initialSearch?: string }): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const [tab, setTab] = useState<BrowseKind>('trending')
  const [search, setSearch] = useState(initialSearch ?? '')
  const { items, loading, hasMore, loadMore, searching, error } = useCatalogue(tab, search)
  const rec = useForYou()
  const featured = !searching ? items[0] : undefined

  return (
    <div className="px-12 pb-16 pt-28">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="title-xl mr-4 text-[2.4rem]">Store</h1>
        {!searching &&
          TABS.map((t) => (
            <button key={t.kind} className="xc-filter" data-on={tab === t.kind} onClick={() => setTab(t.kind)}>
              {t.label}
            </button>
          ))}
        <label className="xc-search ml-auto">
          <Search size={17} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher dans le Store" />
        </label>
      </div>

      {featured && (
        <motion.button
          key={featured.id}
          className="xc-feature on-art relative block w-full overflow-hidden text-left"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => navigate({ name: 'anime', id: featured.id })}
        >
          <img
            src={featured.banner ?? featured.cover.xl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <span className="xc-shade absolute inset-0" />
          <span className="relative flex h-full flex-col justify-end p-10">
            <span className="xc-card-kicker">En vedette</span>
            <span className="title-xl clamp-2 mt-2 max-w-[640px] text-[2.8rem] leading-[1.02]">
              {titleOf(featured, lang)}
            </span>
            <span className="xc-primary mt-6 w-fit">
              <Play size={18} fill="currentColor" strokeWidth={0} /> Découvrir
            </span>
          </span>
        </motion.button>
      )}

      {!searching && rec && rec.picks.length > 0 && (
        <>
          <h2 className="title-xl mb-4 mt-10 text-[1.5rem]">Recommandé pour toi</h2>
          <div className="scroll-x flex gap-4 pb-2">
            {rec.picks.slice(0, 12).map((pick) => (
              <div key={pick.media.id} className="w-[176px] shrink-0">
                <SquareTile media={pick.media} />
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="title-xl mb-4 mt-10 text-[1.5rem]">{searching ? 'Résultats' : 'Parcourir'}</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-5">
        {items.slice(featured ? 1 : 0).map((media) => (
          <SquareTile
            key={media.id}
            media={media}
            badge={media.averageScore !== null ? `${media.averageScore}%` : undefined}
          />
        ))}
      </div>
      {loading && items.length === 0 && <p className="text-faint">Chargement du Store…</p>}
      {error && <p className="text-faint">{error}</p>}
      {hasMore && !loading && (
        <div className="mt-10 flex justify-center">
          <button className="xc-secondary" onClick={loadMore}>
            Charger plus
          </button>
        </div>
      )}
    </div>
  )
}

const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' })
const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' })

export function ConsoleCalendar(): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const [scope, setScope] = useState<'library' | 'all'>('library')
  const [offset, setOffset] = useState(0)
  const week = useWeek(scope, offset)
  const today = new Date().setHours(0, 0, 0, 0)

  return (
    <div className="px-12 pb-16 pt-28">
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <h1 className="title-xl mr-4 text-[2.4rem]">Agenda</h1>
        <button className="xc-filter" data-on={scope === 'library'} onClick={() => setScope('library')}>
          Ma collection
        </button>
        <button className="xc-filter" data-on={scope === 'all'} onClick={() => setScope('all')}>
          Tout le catalogue
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button className="xc-round" onClick={() => setOffset((o) => o - 1)} aria-label="Semaine précédente">
            <ChevronLeft size={19} />
          </button>
          <button className="xc-filter" data-on={offset === 0} onClick={() => setOffset(0)}>
            Cette semaine
          </button>
          <button className="xc-round" onClick={() => setOffset((o) => o + 1)} aria-label="Semaine suivante">
            <ChevronRight size={19} />
          </button>
        </div>
      </div>
      {week.error && <p className="mb-4 text-faint">{week.error}</p>}

      <div className="flex flex-col gap-3">
        {week.days.map((day, i) => (
          <motion.section
            key={day.date}
            className="xc-card flex items-center gap-6"
            data-today={day.date === today}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <div className="w-[150px] shrink-0">
              <p className="text-[1.3rem] font-semibold capitalize">{weekday.format(day.date)}</p>
              <p className="text-[0.85rem] text-faint">{dayMonth.format(day.date)}</p>
            </div>
            <div className="scroll-x flex min-h-[96px] flex-1 items-center gap-3">
              {day.items.map((slot) => (
                <motion.button
                  key={`${slot.mediaId}-${slot.episode}`}
                  className="xc-slot shrink-0 text-left"
                  whileHover={{ scale: 1.06 }}
                  onClick={() => navigate({ name: 'anime', id: slot.media.id })}
                  title={titleOf(slot.media, lang)}
                >
                  <span className="xc-tile relative block h-[88px] w-[88px] overflow-hidden">
                    <img src={slot.media.cover.large} alt="" className="h-full w-full object-cover" />
                  </span>
                  <span className="mt-1 block text-center text-[0.72rem] font-semibold">
                    {formatTime(slot.airingAt * 1000)} · ép. {slot.episode}
                  </span>
                </motion.button>
              ))}
              {day.items.length === 0 && (
                <p className="text-[0.9rem] text-faint">{week.loading ? 'Chargement…' : 'Aucune sortie'}</p>
              )}
            </div>
          </motion.section>
        ))}
      </div>
    </div>
  )
}

const MANGA_TABS: { kind: MangaKind; label: string }[] = [
  { kind: 'trending', label: 'Tendances' },
  { kind: 'popular', label: 'Populaires' },
  { kind: 'top', label: 'Mieux notés' }
]

export function ConsoleManga(): React.JSX.Element {
  const [tab, setTab] = useState<MangaKind>('trending')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<Manga | null>(null)
  const { items, loading, error } = useMangaList(tab, search)

  return (
    <div className="px-12 pb-16 pt-28">
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <h1 className="title-xl mr-4 text-[2.4rem]">Manga</h1>
        {MANGA_TABS.map((t) => (
          <button key={t.kind} className="xc-filter" data-on={tab === t.kind} onClick={() => setTab(t.kind)}>
            {t.label}
          </button>
        ))}
        <label className="xc-search ml-auto">
          <Search size={17} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un manga" />
        </label>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-5">
        {items.map((manga, i) => (
          <motion.button
            key={manga.id}
            className="xc-game text-left"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.02, 0.4) }}
            whileHover={{ y: -6 }}
            onClick={() => setOpen(manga)}
          >
            <span className="xc-tile relative block aspect-square overflow-hidden">
              <img src={manga.cover.large} alt="" className="h-full w-full object-cover" loading="lazy" />
              {manga.chapters && <span className="xc-trophy">{manga.chapters} ch.</span>}
            </span>
            <span className="clamp-2 mt-2 block text-[0.86rem] font-medium">
              {manga.title.english ?? manga.title.romaji}
            </span>
          </motion.button>
        ))}
      </div>
      {loading && <p className="mt-6 text-faint">Chargement…</p>}
      {error && <p className="mt-6 text-faint">{error}</p>}
      <Modal open={open !== null} onClose={() => setOpen(null)} width={640}>
        {open && <MangaSheet manga={open} onClose={() => setOpen(null)} />}
      </Modal>
    </div>
  )
}

const STATUSES: LibraryStatus[] = ['watching', 'planned', 'completed', 'paused', 'dropped']

export function ConsoleDetailHero(props: DetailHeroProps): React.JSX.Element {
  const { media, entry, next, seen, total } = props
  const lang = useApp((s) => s.prefs.titleLang)
  const ratio = total ? Math.min(1, seen / total) : 0

  return (
    <section className="on-art relative overflow-hidden px-12 pb-12 pt-28">
      <img src={media.banner ?? media.cover.xl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="xc-shade absolute inset-0" />
      <button className="xc-secondary relative mb-8 !h-10 !px-4" onClick={props.onBack}>
        <ArrowLeft size={16} /> Retour
      </button>

      <div className="relative flex items-end gap-10">
        <motion.span
          className="xc-tile block h-[260px] w-[260px] shrink-0 overflow-hidden"
          data-on
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        >
          <img src={media.cover.xl} alt="" className="h-full w-full object-cover" />
        </motion.span>

        <div className="min-w-0 flex-1">
          <p className="xc-card-kicker">
            {formatLabel(media.format)}
            {media.seasonYear ? ` · ${media.seasonYear}` : ''}
            {media.studios[0] ? ` · ${media.studios[0]}` : ''}
          </p>
          <h1 className="title-xl clamp-2 mt-2 text-[3.2rem] leading-[1.02]">{titleOf(media, lang)}</h1>
          {media.averageScore !== null && (
            <p className="mt-2 text-[1rem] text-muted">{media.averageScore}% des joueurs ont aimé</p>
          )}

          {entry && total ? (
            <div className="mt-4 flex max-w-[480px] items-center gap-3">
              <span className="xc-cup xc-gold !h-7 !w-7" aria-hidden />
              <div className="xc-meter flex-1 !max-w-none">
                <span style={{ width: `${ratio * 100}%` }} />
              </div>
              <span className="text-[0.9rem] font-semibold">{Math.round(ratio * 100)} %</span>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {next !== null && (
              <button className="xc-primary" onClick={props.onMark}>
                <Play size={20} fill="currentColor" strokeWidth={0} /> Épisode {next}
              </button>
            )}
            {!entry && (
              <button className="xc-primary" onClick={props.onAdd}>
                <Plus size={20} /> Ajouter à la collection
              </button>
            )}
            <button className="xc-round" onClick={props.onFavorite} aria-label="Favori" data-on={!!entry?.favorite}>
              <Heart size={18} fill={entry?.favorite ? 'currentColor' : 'none'} />
            </button>
            {entry && (
              <button className="xc-round" onClick={props.onLists} aria-label="Listes" data-on={props.inLists > 0}>
                <FolderPlus size={18} />
              </button>
            )}
          </div>
          {entry && (
            <div className="mt-4 flex flex-wrap gap-2">
              {STATUSES.map((status) => (
                <button
                  key={status}
                  className="xc-filter"
                  data-on={entry.status === status}
                  onClick={() => props.onStatus(status)}
                >
                  {STATUS_LABELS[status]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
