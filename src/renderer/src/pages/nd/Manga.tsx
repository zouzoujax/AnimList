/**
 * Le catalogue manga, dans le nouveau design.
 *
 * En lecture seule, comme la page d'origine : rien n'est écrit dans la
 * bibliothèque depuis ici. Ce qui change, c'est l'ordre des questions. On
 * choisit d'abord une tradition — manga, manhwa, manhua ne se lisent pas dans
 * le même sens —, et la page dit ce que ce choix implique avant de montrer
 * les couvertures.
 */

import { humanMessage } from '@shared/api-outage'
import { Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Manga, MangaKind } from '@shared/types'
import { ORIGIN_FILTERS, ORIGIN_HINTS, ORIGIN_LABELS, type MangaOrigin } from '@shared/origin'
import { MANGA_STATUS, MangaSheet } from '@/components/MangaSheet'
import { NdHeader, NdTabs } from '@/components/nd'
import { ErrorBox, Modal, Poster, PosterSkeletons, Spinner } from '@/components/ui'
import { toneAccent } from '@/lib/color'
import { useDebounced, useInView } from '@/lib/hooks'

const KINDS: { id: MangaKind; label: string }[] = [
  { id: 'trending', label: 'Tendances' },
  { id: 'popular', label: 'Populaires' },
  { id: 'top', label: 'Mieux notés' }
]

type OriginTab = MangaOrigin | 'all'

const ORIGIN_LINES: Record<OriginTab, string> = {
  all: 'Les trois traditions mélangées, comme AniList les range. Chaque couverture dit de laquelle elle vient.',
  manga: 'Japon. En noir et blanc, et on lit de droite à gauche.',
  manhwa: 'Corée du Sud. Souvent en couleur, pensé pour défiler de haut en bas sur un téléphone.',
  manhua: 'Chine, Taïwan ou Hong Kong. Souvent en couleur.',
  novel: ORIGIN_HINTS.novel,
  other: ORIGIN_HINTS.other
}

/** « Manhwa, 120 chapitres, depuis 2019 » : une phrase courte plutôt qu'une ligne de puces. */
function captionOf(manga: Manga): string {
  const parts = [ORIGIN_LABELS[manga.origin]]
  if (manga.chapters) parts.push(`${manga.chapters} chapitres`)
  else if (MANGA_STATUS[manga.status ?? '']) parts.push(MANGA_STATUS[manga.status ?? ''].toLowerCase())
  if (manga.startYear) parts.push(`depuis ${manga.startYear}`)
  return parts.join(', ')
}

function Cover({ manga, onOpen }: { manga: Manga; onOpen: () => void }): React.JSX.Element {
  return (
    <button
      onClick={onOpen}
      className="nd-cover text-left"
      style={{ '--tone': toneAccent(manga.cover.color) } as React.CSSProperties}
    >
      <Poster src={manga.cover.large} alt="" className="aspect-[2/3] w-full" />
      <span className="clamp-2 mt-2 text-[0.84rem] font-semibold leading-snug">
        {manga.title.english ?? manga.title.romaji}
      </span>
      <span className="mt-0.5 block text-[0.72rem] text-muted">{captionOf(manga)}</span>
      {manga.averageScore !== null && (
        <span className="mt-0.5 block text-[0.72rem] font-semibold text-[var(--tone)]">
          Apprécié à {manga.averageScore} %
        </span>
      )}
    </button>
  )
}

export default function NdMangaPage(): React.JSX.Element {
  const [tab, setTab] = useState<MangaKind>('trending')
  const [origin, setOrigin] = useState<OriginTab>('all')
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search.trim(), 380)
  const [open, setOpen] = useState<Manga | null>(null)

  const searching = debounced.length >= 2
  const kind: MangaKind = searching ? 'search' : tab
  const country = ORIGIN_FILTERS.find((f) => f.id === origin)?.country
  const key = `${kind}:${searching ? debounced : ''}:${country ?? ''}`

  const [loadingMore, setLoadingMore] = useState(false)
  const [held, setHeld] = useState<{
    key: string
    items: Manga[]
    hasMore: boolean
    page: number
    error: string | null
  }>({ key: '', items: [], hasMore: false, page: 1, error: null })

  useEffect(() => {
    let alive = true
    void window.api.manga
      .browse(kind, 1, searching ? debounced : '', undefined, country)
      .then(
        (res) => alive && setHeld({ key, items: res.items, hasMore: res.pageInfo.hasNextPage, page: 1, error: null })
      )
      .catch(
        (err: Error) => alive && setHeld({ key, items: [], hasMore: false, page: 1, error: humanMessage(err.message) })
      )
    return () => {
      alive = false
    }
  }, [key, kind, debounced, searching, country])

  const fresh = held.key === key
  const items = fresh ? held.items : []
  const loading = !fresh
  const hasMore = fresh && held.hasMore

  const loadMore = (): void => {
    if (loading || loadingMore || !hasMore) return
    const next = held.page + 1
    setLoadingMore(true)
    void window.api.manga
      .browse(kind, next, searching ? debounced : '', undefined, country)
      .then((res) => {
        setHeld((prev) => {
          if (prev.key !== key) return prev
          const seen = new Set(prev.items.map((m) => m.id))
          return {
            ...prev,
            page: next,
            items: [...prev.items, ...res.items.filter((m) => !seen.has(m.id))],
            hasMore: res.pageInfo.hasNextPage
          }
        })
      })
      .catch((err: Error) =>
        setHeld((prev) => (prev.key === key ? { ...prev, error: humanMessage(err.message) } : prev))
      )
      .finally(() => setLoadingMore(false))
  }
  const sentinel = useInView(loadMore)

  return (
    <div className="page">
      <NdHeader
        title="Que lire après l’anime ?"
        sub="Le catalogue AniList, à consulter : rien de ce que tu ouvres ici n’est ajouté à ta bibliothèque."
        actions={
          <label className="nd-search !w-[280px]">
            <Search size={15} aria-hidden />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Chercher un titre" />
            {search && (
              <button onClick={() => setSearch('')} aria-label="Effacer la recherche">
                <X size={13} />
              </button>
            )}
          </label>
        }
      />

      <NdTabs
        label="Tradition"
        tabs={[{ id: 'all', label: 'Tout' }, ...ORIGIN_FILTERS.map((f) => ({ id: f.id, label: ORIGIN_LABELS[f.id] }))]}
        value={origin}
        onChange={setOrigin}
      />
      <p className="mb-5 mt-1.5 max-w-[70ch] px-1 text-[0.82rem] text-muted">{ORIGIN_LINES[origin]}</p>

      {!searching && (
        <div className="nd-seg mb-6" role="group" aria-label="Classement">
          {KINDS.map((k) => (
            <button key={k.id} aria-pressed={tab === k.id} onClick={() => setTab(k.id)}>
              {k.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <PosterSkeletons count={12} />
      ) : held.error ? (
        <ErrorBox message={held.error} />
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">Aucun titre ne correspond. Essaie une autre tradition.</p>
      ) : (
        <>
          <div className="card-grid">
            {items.map((manga) => (
              <Cover key={manga.id} manga={manga} onOpen={() => setOpen(manga)} />
            ))}
          </div>
          {hasMore && <div ref={sentinel} className="h-4" />}
          {loadingMore && <Spinner label="Chargement de la suite…" />}
        </>
      )}

      <Modal open={open !== null} onClose={() => setOpen(null)} width={640}>
        {open && <MangaSheet manga={open} onClose={() => setOpen(null)} />}
      </Modal>
    </div>
  )
}
