import { ArrowLeft, Check, ChevronLeft, ChevronRight, FolderPlus, Heart, Play, Plus, Search } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import {
  FORMAT_LABELS,
  STATUS_LABELS,
  type BrowseKind,
  type LibraryStatus,
  type Manga,
  type MangaKind
} from '@shared/types'
import { MangaSheet } from '@/components/MangaSheet'
import { Modal } from '@/components/ui'
import { formatTime, titleOf } from '@/lib/format'
import { statusBlocked } from '@/lib/status'
import { useApp } from '@/store/app'
import { useCatalogue, useForYou, useMangaList, useWeek } from './pages-data'
import { Row, Tile } from './Streaming'
import type { DetailHeroProps } from '.'

/*
 * STREAMING — les autres écrans de la plateforme : un catalogue par rayons,
 * un programme de la semaine en colonnes, un rayon manga et une fiche qui
 * s'ouvre sur une bannière plein écran.
 */

const TABS: { kind: BrowseKind; label: string }[] = [
  { kind: 'trending', label: 'Tendances' },
  { kind: 'season', label: 'Cette saison' },
  { kind: 'popular', label: 'Populaires' },
  { kind: 'top', label: 'Mieux notés' },
  { kind: 'upcoming', label: 'Prochainement' }
]

export function StreamingDiscover({ initialSearch }: { initialSearch?: string }): React.JSX.Element {
  const [tab, setTab] = useState<BrowseKind>('trending')
  const [search, setSearch] = useState(initialSearch ?? '')
  const { items, loading, hasMore, loadMore, searching, error } = useCatalogue(tab, search)
  const rec = useForYou()

  return (
    <div className="xs-page pb-16 pt-24">
      <div className="flex flex-wrap items-center gap-4 px-10">
        <h1 className="title-xl text-[2.4rem]">{searching ? 'Résultats' : 'Parcourir'}</h1>
        <label className="xs-search ml-auto">
          <Search size={18} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Titres, personnages…" />
        </label>
      </div>
      {!searching && (
        <div className="mt-5 flex flex-wrap gap-2 px-10">
          {TABS.map((t) => (
            <button key={t.kind} className="xs-tab" data-on={tab === t.kind} onClick={() => setTab(t.kind)}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {!searching && rec && rec.picks.length > 0 && (
        <div className="mt-8">
          <Row title="Recommandé pour toi">
            {rec.picks.slice(0, 12).map((pick) => (
              <Tile
                key={pick.media.id}
                media={pick.media}
                note={pick.from[0] ? `Parce que tu as aimé ${pick.from[0]}` : undefined}
              />
            ))}
          </Row>
        </div>
      )}

      <div className="xs-grid mt-6 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-2 gap-y-8 px-10">
        {items.map((media) => (
          <Tile key={media.id} media={media} />
        ))}
      </div>
      {loading && items.length === 0 && <p className="px-10 text-faint">Chargement du catalogue…</p>}
      {error && <p className="px-10 text-faint">{error}</p>}
      {hasMore && !loading && (
        <div className="mt-10 flex justify-center">
          <button className="xs-more" onClick={loadMore}>
            Voir plus
          </button>
        </div>
      )}
    </div>
  )
}

const dayName = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' })
const dayNum = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

export function StreamingCalendar(): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const [scope, setScope] = useState<'library' | 'all'>('library')
  const [offset, setOffset] = useState(0)
  const week = useWeek(scope, offset)
  const today = new Date().setHours(0, 0, 0, 0)

  return (
    <div className="xs-page pb-16 pt-24">
      <div className="flex flex-wrap items-center gap-4 px-10">
        <h1 className="title-xl text-[2.4rem]">Programme</h1>
        <div className="flex gap-2">
          <button className="xs-tab" data-on={scope === 'library'} onClick={() => setScope('library')}>
            Ma liste
          </button>
          <button className="xs-tab" data-on={scope === 'all'} onClick={() => setScope('all')}>
            Tout
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="xs-round" onClick={() => setOffset((o) => o - 1)} aria-label="Semaine précédente">
            <ChevronLeft size={20} />
          </button>
          <button className="xs-tab" onClick={() => setOffset(0)} data-on={offset === 0}>
            Cette semaine
          </button>
          <button className="xs-round" onClick={() => setOffset((o) => o + 1)} aria-label="Semaine suivante">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
      <p className="mt-2 px-10 text-faint">
        {week.loading ? 'Chargement…' : `${week.total} épisode${week.total > 1 ? 's' : ''} cette semaine`}
        {week.error ? ` · ${week.error}` : ''}
      </p>

      <div className="mt-8 grid grid-cols-7 gap-2 px-10">
        {week.days.map((day) => (
          <section key={day.date} className="xs-day" data-today={day.date === today}>
            <header className="mb-3">
              <p className="text-[0.95rem] font-bold capitalize">{dayName.format(day.date)}</p>
              <p className="text-[0.75rem] text-faint">{dayNum.format(day.date)}</p>
            </header>
            <div className="flex flex-col gap-2">
              {day.items.map((slot) => (
                <motion.button
                  key={`${slot.mediaId}-${slot.episode}`}
                  className="xs-slot text-left"
                  whileHover={{ scale: 1.04 }}
                  onClick={() => navigate({ name: 'anime', id: slot.media.id })}
                >
                  <img
                    src={slot.media.banner ?? slot.media.cover.large}
                    alt=""
                    className="aspect-video w-full object-cover"
                  />
                  <span className="block p-2">
                    <span className="text-[0.7rem] font-bold text-[var(--accent)]">
                      {formatTime(slot.airingAt * 1000)} · ÉP. {slot.episode}
                    </span>
                    <span className="clamp-2 block text-[0.78rem] font-semibold">{titleOf(slot.media, lang)}</span>
                  </span>
                </motion.button>
              ))}
              {day.items.length === 0 && !week.loading && <p className="text-[0.75rem] text-faint">Rien ce jour-là.</p>}
            </div>
          </section>
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

export function StreamingManga(): React.JSX.Element {
  const [tab, setTab] = useState<MangaKind>('trending')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<Manga | null>(null)
  const { items, loading, error } = useMangaList(tab, search)

  return (
    <div className="xs-page pb-16 pt-24">
      <div className="flex flex-wrap items-center gap-4 px-10">
        <h1 className="title-xl text-[2.4rem]">Manga</h1>
        <div className="flex gap-2">
          {MANGA_TABS.map((t) => (
            <button key={t.kind} className="xs-tab" data-on={tab === t.kind} onClick={() => setTab(t.kind)}>
              {t.label}
            </button>
          ))}
        </div>
        <label className="xs-search ml-auto">
          <Search size={18} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Chercher un manga…" />
        </label>
      </div>

      {items.length > 0 && (
        <div className="mt-6">
          <Row title="Top 10 manga">
            {items.slice(0, 10).map((manga, i) => (
              <motion.button
                key={manga.id}
                onClick={() => setOpen(manga)}
                className="relative flex h-[210px] w-[250px] shrink-0 items-end"
                whileHover={{ scale: 1.06 }}
              >
                <span className="xs-rank" aria-hidden>
                  {i + 1}
                </span>
                <img
                  src={manga.cover.large}
                  alt=""
                  className="relative ml-auto h-full w-[140px] rounded-[4px] object-cover"
                />
              </motion.button>
            ))}
          </Row>
        </div>
      )}

      <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-2 gap-y-6 px-10">
        {items.map((manga) => (
          <motion.button
            key={manga.id}
            className="text-left"
            whileHover={{ scale: 1.08, zIndex: 5 }}
            onClick={() => setOpen(manga)}
          >
            <img src={manga.cover.large} alt="" className="aspect-[2/3] w-full rounded-[4px] object-cover" />
            <span className="clamp-2 mt-1.5 block text-[0.8rem] font-semibold">
              {manga.title.english ?? manga.title.romaji}
            </span>
          </motion.button>
        ))}
      </div>
      {loading && <p className="px-10 text-faint">Chargement…</p>}
      {error && <p className="px-10 text-faint">{error}</p>}

      <Modal open={open !== null} onClose={() => setOpen(null)} width={640}>
        {open && <MangaSheet manga={open} onClose={() => setOpen(null)} />}
      </Modal>
    </div>
  )
}

const STATUSES: LibraryStatus[] = ['watching', 'planned', 'completed', 'paused', 'dropped']

export function StreamingDetailHero(props: DetailHeroProps): React.JSX.Element {
  const { media, entry, next, seen, total } = props
  const lang = useApp((s) => s.prefs.titleLang)

  return (
    <section className="on-art relative min-h-[82vh] overflow-hidden">
      <img src={media.banner ?? media.cover.xl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="xs-vignette absolute inset-0" />
      <button className="xs-back absolute left-10 top-20 z-10" onClick={props.onBack}>
        <ArrowLeft size={18} /> Retour
      </button>

      <motion.div
        className="absolute bottom-[12%] left-10 max-w-[680px]"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="xs-kicker mb-3">
          <span className="xs-badge">A</span> {media.format ? (FORMAT_LABELS[media.format] ?? media.format) : 'SÉRIE'}
        </p>
        <h1 className="title-xl clamp-2 text-[3.6rem] leading-[0.98]">{titleOf(media, lang)}</h1>
        {props.alsoKnownAs.length > 0 && <p className="mt-2 text-[0.95rem] text-muted">{props.alsoKnownAs[0]}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-[0.95rem]">
          {media.averageScore !== null && (
            <span className="font-bold text-[#46d369]">{media.averageScore}% d’appréciation</span>
          )}
          {media.seasonYear && <span className="text-muted">{media.seasonYear}</span>}
          {total && <span className="xs-outline">{total} ép.</span>}
          {media.studios[0] && <span className="text-muted">{media.studios[0]}</span>}
        </div>
        {entry && total ? (
          <div className="mt-4 flex max-w-[420px] items-center gap-3">
            <div className="xs-progress flex-1">
              <span style={{ width: `${Math.min(100, (seen / total) * 100)}%` }} />
            </div>
            <span className="text-[0.85rem] text-muted">
              {seen} / {total}
            </span>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {next !== null ? (
            <button className="xs-play" onClick={props.onMark}>
              <Play size={20} fill="currentColor" strokeWidth={0} /> Épisode {next}
            </button>
          ) : null}
          {!entry ? (
            <button className="xs-more" onClick={props.onAdd}>
              <Plus size={20} /> Ma liste
            </button>
          ) : (
            <span className="xs-more !cursor-default">
              <Check size={20} /> {STATUS_LABELS[entry.status]}
            </span>
          )}
          <button className="xs-round" onClick={props.onFavorite} aria-label="Favori" data-on={!!entry?.favorite}>
            <Heart size={18} fill={entry?.favorite ? 'currentColor' : 'none'} />
          </button>
          {entry && (
            <button className="xs-round" onClick={props.onLists} aria-label="Listes" data-on={props.inLists > 0}>
              <FolderPlus size={18} />
            </button>
          )}
        </div>
        {entry && (
          <div className="mt-4 flex flex-wrap gap-2">
            {STATUSES.map((status) => {
              const blocked = statusBlocked(status, media, entry)
              return (
                <button
                  key={status}
                  className="xs-tab"
                  data-on={entry.status === status}
                  disabled={!!blocked}
                  title={blocked ?? undefined}
                  onClick={() => props.onStatus(status)}
                >
                  {STATUS_LABELS[status]}
                </button>
              )
            })}
          </div>
        )}
      </motion.div>
    </section>
  )
}
