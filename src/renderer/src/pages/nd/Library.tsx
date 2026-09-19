import { Check, Heart, LibraryBig, Pencil, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { GENRE_LABELS, STATUS_LABELS, type Entry, type LibraryStatus, type Media } from '@shared/types'
import { titleMatches } from '@shared/titles'
import { AnimeCard } from '@/components/AnimeCard'
import BulkBar from '@/components/BulkBar'
import ListPicker from '@/components/ListPicker'
import { NdHeader, NdTabs, SeriesRow, behindOf, plural } from '@/components/nd'
import { EmptyState, Poster } from '@/components/ui'
import { titleOf } from '@/lib/format'
import { useSessionState } from '@/lib/hooks'
import { useApp } from '@/store/app'

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
  { id: 'recent', label: 'Regardées récemment' },
  { id: 'added', label: 'Ajoutées récemment' },
  { id: 'title', label: 'Par titre' },
  { id: 'score', label: 'Par note' },
  { id: 'progress', label: 'Par progression' }
]

/** Case à cocher lisible sans la couleur : la coche dit l'état. */
function Tick({ on }: { on: boolean }): React.JSX.Element {
  return (
    <span aria-hidden className="nd-tick" data-on={on}>
      {on && <Check size={13} strokeWidth={3} />}
    </span>
  )
}

/**
 * La bibliothèque.
 *
 * L'ancienne page ouvrait sur une grille d'affiches toutes pareilles : on y
 * voyait ce qu'on possède, pas où on en est. Ici, la vue par défaut est une
 * ligne par série avec sa frise — les affiches restent à un clic, pour choisir
 * quoi commencer.
 */
export default function NdLibraryPage({ initialGenre }: { initialGenre?: string }): React.JSX.Element {
  const entries = useApp((s) => s.entries)
  const mediaMap = useApp((s) => s.media)
  const events = useApp((s) => s.events)
  const watched = useApp((s) => s.watched)
  const lang = useApp((s) => s.prefs.titleLang)
  const navigate = useApp((s) => s.navigate)
  const sequelOf = useApp((s) => s.prefs.sequelOf)
  const lists = useApp((s) => s.lists)
  const setListMembership = useApp((s) => s.setListMembership)

  const [filter, setFilter] = useSessionState<Filter>('nd-library.filter', 'all')
  const [sort, setSort] = useSessionState<Sort>('nd-library.sort', 'recent')
  const [search, setSearch] = useSessionState<string>('nd-library.search', '')
  // Un genre passé par la route l'emporte : on arrive d'un clic sur ce genre.
  const [savedGenre, saveGenre] = useSessionState<string | null>('nd-library.genre', null)
  const [genre, keepGenre] = useState<string | null>(initialGenre ?? savedGenre)
  const setGenre = (next: string | null): void => {
    keepGenre(next)
    saveGenre(next)
  }
  const [view, setView] = useSessionState<'rows' | 'posters'>('nd-library.view', 'rows')
  const [listId, setListId] = useSessionState<string | null>('nd-library.listId', null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [showSequels, setShowSequels] = useSessionState<boolean>('nd-library.showSequels', false)
  const [managing, setManaging] = useState(false)

  const toggleSelected = (animeId: number): void => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(animeId)) next.delete(animeId)
      else next.add(animeId)
      return next
    })
  }

  const stopSelecting = (): void => {
    setSelecting(false)
    setSelected(new Set())
  }

  const activeList = lists.find((l) => l.id === listId) ?? null

  const lastWatchAt = useMemo(() => {
    const map = new Map<number, number>()
    for (const ev of events) map.set(ev.animeId, Math.max(map.get(ev.animeId) ?? 0, ev.at))
    return map
  }, [events])

  const rows = useMemo(
    () =>
      [...entries.values()]
        .map((entry) => ({ entry, media: mediaMap.get(entry.animeId) }))
        .filter((row): row is { entry: Entry; media: Media } => !!row.media),
    [entries, mediaMap]
  )

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
    return [...tally.entries()].sort((a, b) => b[1] - a[1])
  }, [rows])

  /**
   * Une saison suivante n'a rien à faire dans la liste tant qu'on n'y a pas
   * touché : la saison mère la représente.
   */
  const folded = useMemo(() => {
    const own = new Set(rows.map((r) => r.media.id))
    const out = new Set<number>()
    for (const { entry, media } of rows) {
      if (entry.status !== 'planned' && entry.status !== 'dropped') continue
      if ((watched.get(media.id)?.size ?? 0) > 0) continue
      const parent = sequelOf[String(media.id)]
      if (parent !== undefined && own.has(parent)) out.add(media.id)
    }
    return out
  }, [rows, watched, sequelOf])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const inList = activeList ? new Set(activeList.animeIds) : null
    const hide = !showSequels && !needle && folded.size > 0
    const filtered = rows.filter(({ entry, media }) => {
      if (hide && folded.has(media.id)) return false
      if (inList && !inList.has(media.id)) return false
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
  }, [rows, filter, genre, search, sort, lang, lastWatchAt, watched, activeList, folded, showSequels])

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-[900px] px-7 py-16">
        <EmptyState
          icon={<LibraryBig size={24} />}
          title="Ta bibliothèque est vide"
          hint="Ajoute des animes depuis Découvrir, ou importe ta liste MyAnimeList depuis les réglages."
          action={
            <div className="mt-1 flex gap-2">
              <button className="btn btn-primary" onClick={() => navigate({ name: 'discover' })}>
                Explorer le catalogue
              </button>
              <button className="btn" onClick={() => navigate({ name: 'settings' })}>
                Importer ma liste
              </button>
            </div>
          }
        />
      </div>
    )
  }

  // La phrase dit l'essentiel de la bibliothèque, dans l'ordre où on s'en sert.
  const summary = [
    counts.watching ? `${counts.watching} en cours` : null,
    counts.planned ? `${counts.planned} à voir` : null,
    counts.completed ? plural(counts.completed, 'terminée') : null
  ]
    .filter(Boolean)
    .join(', ')

  const narrowed = visible.length !== rows.length

  return (
    <div className="page">
      <NdHeader
        title={`${plural(rows.length, 'série')} dans ta bibliothèque`}
        sub={
          narrowed
            ? `${plural(visible.length, 'série correspond', 'séries correspondent')} à ce que tu as choisi.`
            : `${summary}.`
        }
        actions={
          <>
            <div className="nd-seg" role="group" aria-label="Affichage">
              <button aria-pressed={view === 'rows'} onClick={() => setView('rows')}>
                Lignes
              </button>
              <button aria-pressed={view === 'posters'} onClick={() => setView('posters')}>
                Affiches
              </button>
            </div>
            <button
              className="btn"
              onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
              style={selecting ? { borderColor: 'var(--accent)' } : undefined}
            >
              {selecting ? 'Terminer la sélection' : 'Sélectionner'}
            </button>
          </>
        }
      />

      <NdTabs
        label="Statut"
        size="sm"
        tabs={FILTERS.filter((f) => f.id === 'all' || (counts[f.id] ?? 0) > 0).map((f) => ({
          id: f.id,
          label: f.label,
          count: counts[f.id] ?? 0
        }))}
        value={filter}
        onChange={setFilter}
      />

      <div className="nd-toolbar">
        <label className="nd-search">
          <Search size={15} aria-hidden />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Chercher dans ta bibliothèque"
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Effacer la recherche">
              <X size={13} />
            </button>
          )}
        </label>

        <select
          className="field"
          value={genre ?? ''}
          onChange={(e) => setGenre(e.target.value || null)}
          aria-label="Genre"
        >
          <option value="">Tous les genres</option>
          {genres.map(([g, n]) => (
            <option key={g} value={g}>
              {GENRE_LABELS[g] ?? g} ({n})
            </option>
          ))}
        </select>

        <select className="field" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Tri">
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          className="field"
          value={listId ?? ''}
          onChange={(e) => setListId(e.target.value || null)}
          aria-label="Liste"
        >
          <option value="">Toutes les listes</option>
          {lists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.emoji} {list.name} ({list.animeIds.length})
            </option>
          ))}
        </select>
        <button className="btn btn-ghost" onClick={() => setManaging(true)}>
          <Pencil size={13} />
          {lists.length === 0 ? 'Créer une liste' : 'Gérer les listes'}
        </button>

        {folded.size > 0 && (
          <button
            className="chip"
            data-on={showSequels}
            onClick={() => setShowSequels(!showSequels)}
            title="Les saisons suivantes que tu n'as pas commencées sont rangées sous la première"
          >
            {showSequels ? 'Replier' : 'Montrer'} {plural(folded.size, 'saison suivante', 'saisons suivantes')}
          </button>
        )}

        {activeList && selecting && selected.size > 0 && (
          <button className="btn" onClick={() => void setListMembership(activeList.id, [...selected], false)}>
            Retirer de « {activeList.name} »
          </button>
        )}
        {selecting && visible.length > 0 && (
          <button
            className="btn btn-ghost"
            onClick={() =>
              setSelected(selected.size === visible.length ? new Set() : new Set(visible.map((r) => r.media.id)))
            }
          >
            {selected.size === visible.length ? 'Tout désélectionner' : 'Tout sélectionner'}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          Aucune série ne correspond. Change d’onglet ou efface la recherche.
        </p>
      ) : view === 'posters' ? (
        <div className="card-grid">
          {visible.map(({ media }, i) =>
            selecting ? (
              <button
                key={media.id}
                className="nd-pick relative text-left"
                data-on={selected.has(media.id)}
                aria-pressed={selected.has(media.id)}
                onClick={() => toggleSelected(media.id)}
              >
                <span className="pointer-events-none block">
                  <AnimeCard media={media} width="100%" index={i % 30} />
                </span>
                <span className="absolute left-2 top-2">
                  <Tick on={selected.has(media.id)} />
                </span>
              </button>
            ) : (
              <AnimeCard key={media.id} media={media} width="100%" index={i % 30} />
            )
          )}
        </div>
      ) : selecting ? (
        <ul className="home-queue">
          {visible.map(({ media }) => (
            <li key={media.id}>
              <button
                className="nd-pick-row"
                aria-pressed={selected.has(media.id)}
                onClick={() => toggleSelected(media.id)}
              >
                <Tick on={selected.has(media.id)} />
                <Poster src={media.cover.large} alt="" className="h-[48px] w-[34px] shrink-0" rounded="rounded-[7px]" />
                <span className="min-w-0 flex-1 truncate text-[0.86rem] font-medium">{titleOf(media, lang)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="home-queue">
          {visible.map(({ media, entry }) => (
            <SeriesRow
              key={media.id}
              media={media}
              behind={entry.status === 'watching' ? behindOf(media, watched.get(media.id)) : 0}
              note={
                <>
                  {/* « Terminée » est déjà dit par la ligne quand tout est vu. */}
                  {filter === 'all' && entry.status !== 'completed' && <span>{STATUS_LABELS[entry.status]}</span>}
                  {entry.score !== null && <span>Noté {entry.score}/10</span>}
                  {entry.favorite && (
                    <span className="inline-flex items-center gap-1">
                      <Heart size={11} fill="currentColor" strokeWidth={0} aria-hidden />
                      Favori
                    </span>
                  )}
                </>
              }
            />
          ))}
        </ul>
      )}

      {selecting && <BulkBar selected={selected} onClear={() => setSelected(new Set())} />}
      <ListPicker open={managing} onClose={() => setManaging(false)} animeIds={[]} />
    </div>
  )
}
