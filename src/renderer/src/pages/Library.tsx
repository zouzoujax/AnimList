import { ArrowUpDown, Heart, LayoutGrid, LibraryBig, Plus, Rows3, Search, Star, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { GENRE_LABELS, STATUS_LABELS, type Entry, type LibraryStatus, type Media } from '@shared/types'
import { titleMatches } from '@shared/titles'
import { AnimeCard } from '@/components/AnimeCard'
import { EmptyState, Poster } from '@/components/ui'
import { rgba, toneAccent } from '@/lib/color'
import { titleOf } from '@/lib/format'
import { nextEpisodeOf, useApp } from '@/store/app'

type Filter = LibraryStatus | 'all' | 'favorites'
type Sort = 'recent' | 'title' | 'score' | 'progress' | 'added'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'watching', label: STATUS_LABELS.watching },
  { id: 'planned', label: STATUS_LABELS.planned },
  { id: 'completed', label: STATUS_LABELS.completed },
  { id: 'paused', label: STATUS_LABELS.paused },
  { id: 'dropped', label: STATUS_LABELS.dropped },
  { id: 'favorites', label: 'Favoris' }
]

const SORTS: { id: Sort; label: string }[] = [
  { id: 'recent', label: 'Activité récente' },
  { id: 'added', label: "Date d'ajout" },
  { id: 'title', label: 'Titre A→Z' },
  { id: 'score', label: 'Ma note' },
  { id: 'progress', label: 'Progression' }
]

function ListRow({ media, entry, index }: { media: Media; entry: Entry; index: number }): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const seen = useApp((s) => s.watched.get(media.id)?.size ?? 0)
  const next = useApp((s) => nextEpisodeOf(s, media.id, media.episodes))
  const toggleEpisode = useApp((s) => s.toggleEpisode)
  const toast = useApp((s) => s.toast)

  const glow = toneAccent(media.cover.color)
  const total = media.episodes
  const ratio = total ? Math.min(1, seen / total) : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.015, 0.25) }}
      className="glass group flex items-center gap-3.5 rounded-[16px] p-2.5 transition hover:!border-white/18"
    >
      <button onClick={() => navigate({ name: 'anime', id: media.id })} className="shrink-0">
        <Poster src={media.cover.large} alt="" className="h-[62px] w-[42px]" rounded="rounded-[9px]" />
      </button>

      <button onClick={() => navigate({ name: 'anime', id: media.id })} className="min-w-0 flex-1 text-left">
        <p className="truncate text-[0.86rem] font-semibold">{titleOf(media, lang)}</p>
        <div className="mt-1.5 flex items-center gap-2.5">
          <div className="h-1 w-full max-w-[280px] overflow-hidden rounded-full bg-white/12">
            <div
              className="h-full rounded-full"
              style={{ width: `${ratio * 100}%`, background: `linear-gradient(90deg, ${glow}, var(--accent-2))` }}
            />
          </div>
          <span className="shrink-0 text-[0.7rem] tabular-nums text-faint">
            {seen} / {total ?? '?'}
          </span>
        </div>
      </button>

      {entry.favorite && <Heart size={14} className="shrink-0 text-rose-400" fill="currentColor" strokeWidth={0} />}

      {entry.score !== null && (
        <span className="flex shrink-0 items-center gap-1 text-[0.78rem] font-semibold tabular-nums">
          <Star size={12} className="text-amber-300" fill="currentColor" strokeWidth={0} />
          {entry.score}
        </span>
      )}

      <span
        className="hidden shrink-0 rounded-full px-2.5 py-1 text-[0.68rem] font-semibold sm:block"
        style={{ background: rgba(glow, 0.16), color: rgba(glow, 1) }}
      >
        {STATUS_LABELS[entry.status]}
      </span>

      {next && (
        <button
          onClick={async () => {
            await toggleEpisode(media.id, next)
            toast(`Épisode ${next} coché · ${titleOf(media, lang)}`)
          }}
          title={`Marquer l'épisode ${next}`}
          className="btn !h-8 shrink-0 !px-2.5 opacity-0 transition group-hover:opacity-100"
        >
          <Plus size={13} />
          EP {next}
        </button>
      )}
    </motion.div>
  )
}

export default function LibraryPage({ initialGenre }: { initialGenre?: string }): React.JSX.Element {
  const entries = useApp((s) => s.entries)
  const mediaMap = useApp((s) => s.media)
  const events = useApp((s) => s.events)
  const watched = useApp((s) => s.watched)
  const lang = useApp((s) => s.prefs.titleLang)
  const navigate = useApp((s) => s.navigate)

  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('recent')
  const [search, setSearch] = useState('')
  const [genre, setGenre] = useState<string | null>(initialGenre ?? null)
  const [view, setView] = useState<'grid' | 'list'>('grid')

  const lastWatchAt = useMemo(() => {
    const map = new Map<number, number>()
    for (const ev of events) map.set(ev.animeId, Math.max(map.get(ev.animeId) ?? 0, ev.at))
    return map
  }, [events])

  const rows = useMemo(() => {
    return [...entries.values()]
      .map((entry) => ({ entry, media: mediaMap.get(entry.animeId) }))
      .filter((row): row is { entry: Entry; media: Media } => !!row.media)
  }, [entries, mediaMap])

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: rows.length, favorites: 0 }
    for (const { entry } of rows) {
      out[entry.status] = (out[entry.status] ?? 0) + 1
      if (entry.favorite) out.favorites += 1
    }
    return out
  }, [rows])

  const genres = useMemo(() => {
    const tally = new Map<string, number>()
    for (const { media } of rows) for (const g of media.genres) tally.set(g, (tally.get(g) ?? 0) + 1)
    return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  }, [rows])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const filtered = rows.filter(({ entry, media }) => {
      if (filter === 'favorites' ? !entry.favorite : filter !== 'all' && entry.status !== filter) return false
      if (genre && !media.genres.includes(genre)) return false
      if (!needle) return true
      return titleMatches(needle, [media.title.romaji, media.title.english, media.title.native])
    })

    const progress = (id: number, total: number | null): number =>
      total ? (watched.get(id)?.size ?? 0) / total : (watched.get(id)?.size ?? 0) / 100

    return filtered.sort((a, b) => {
      switch (sort) {
        case 'title':
          return titleOf(a.media, lang).localeCompare(titleOf(b.media, lang), 'fr')
        case 'score':
          return (b.entry.score ?? -1) - (a.entry.score ?? -1)
        case 'added':
          return b.entry.addedAt - a.entry.addedAt
        case 'progress':
          return progress(b.media.id, b.media.episodes) - progress(a.media.id, a.media.episodes)
        default:
          return (
            Math.max(lastWatchAt.get(b.media.id) ?? 0, b.entry.updatedAt) -
            Math.max(lastWatchAt.get(a.media.id) ?? 0, a.entry.updatedAt)
          )
      }
    })
  }, [rows, filter, genre, search, sort, lang, lastWatchAt, watched])

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-[900px] px-7 py-16">
        <EmptyState
          icon={<LibraryBig size={24} />}
          title="Rien à suivre pour l'instant"
          hint="Ajoute des animes depuis Découvrir, ou importe ta liste MyAnimeList en un clic."
          action={
            <div className="mt-1 flex gap-2">
              <button className="btn btn-primary" onClick={() => navigate({ name: 'discover' })}>
                Explorer le catalogue
              </button>
              <button className="btn" onClick={() => navigate({ name: 'settings' })}>
                Importer
              </button>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="title-xl text-[1.85rem]">Bibliothèque</h1>
          <p className="mt-1 text-[0.85rem] text-muted">
            {visible.length} sur {rows.length} animes
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            className="icon-btn"
            data-on={view === 'grid'}
            onClick={() => setView('grid')}
            aria-label="Vue grille"
            style={view === 'grid' ? { background: 'var(--panel-2)', color: '#fff' } : undefined}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            className="icon-btn"
            onClick={() => setView('list')}
            aria-label="Vue liste"
            style={view === 'list' ? { background: 'var(--panel-2)', color: '#fff' } : undefined}
          >
            <Rows3 size={16} />
          </button>
        </div>
      </div>

      <div className="glass sticky top-0 z-20 mb-7 rounded-[20px] p-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer ma bibliothèque…"
              className="field w-full !pl-9 !pr-9"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="icon-btn absolute right-1 top-1/2 !h-7 !w-7 -translate-y-1/2"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <label className="relative flex items-center">
            <ArrowUpDown size={14} className="pointer-events-none absolute left-3 text-faint" />
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="field !pl-8 !pr-3">
              {SORTS.map((s) => (
                <option key={s.id} value={s.id} style={{ background: '#0b0e1a' }}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button key={f.id} data-on={filter === f.id} className="chip" onClick={() => setFilter(f.id)}>
              {f.label}
              <span className="tabular-nums opacity-60">{counts[f.id] ?? 0}</span>
            </button>
          ))}
          {genres.length > 0 && <span className="mx-1 h-4 w-px" style={{ background: 'var(--line-2)' }} />}
          {genres.map(([g, n]) => (
            <button key={g} data-on={genre === g} className="chip" onClick={() => setGenre(genre === g ? null : g)}>
              {GENRE_LABELS[g] ?? g}
              <span className="tabular-nums opacity-60">{n}</span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-faint">Aucun anime ne correspond à ces filtres.</p>
      ) : view === 'grid' ? (
        <div className="card-grid">
          {visible.map(({ media }, i) => (
            <AnimeCard key={media.id} media={media} width="100%" index={i % 30} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map(({ media, entry }, i) => (
            <ListRow key={media.id} media={media} entry={entry} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}
