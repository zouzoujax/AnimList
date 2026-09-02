/**
 * Le catalogue manga.
 *
 * En lecture seule, et c'est délibéré. Suivre un manga voudrait dire des
 * chapitres cochés, un historique, des statistiques et cent badges bâtis sur
 * des épisodes et des durées — un chapitre n'a ni l'un ni l'autre. Parcourir
 * répond déjà à la question qu'on se pose le plus souvent : « ça continue en
 * manga, et où j'en serais ? »
 *
 * Rien n'est écrit dans la bibliothèque depuis cette page.
 */

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { BookOpen, ExternalLink, Flame, Search, Star, TrendingUp, X } from 'lucide-react'
import type { Manga, MangaKind } from '@shared/types'
import { ErrorBox, Modal, Poster, PosterSkeletons, Spinner } from '@/components/ui'
import { rgba, toneAccent } from '@/lib/color'
import { useDebounced, useInView } from '@/lib/hooks'

const TABS: { kind: MangaKind; label: string; icon: typeof Flame }[] = [
  { kind: 'trending', label: 'Tendances', icon: Flame },
  { kind: 'popular', label: 'Populaires', icon: TrendingUp },
  { kind: 'top', label: 'Mieux notés', icon: Star }
]

const STATUS: Record<string, string> = {
  FINISHED: 'Terminé',
  RELEASING: 'En cours',
  NOT_YET_RELEASED: 'À paraître',
  CANCELLED: 'Annulé',
  HIATUS: 'En pause'
}

function Card({ manga, index, onOpen }: { manga: Manga; index: number; onOpen: () => void }): React.JSX.Element {
  const glow = toneAccent(manga.cover.color)
  return (
    <motion.button
      onClick={onOpen}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.25) }}
      whileHover={{ y: -4 }}
      className="text-left"
    >
      <Poster src={manga.cover.large} alt="" className="aspect-[2/3] w-full" />
      <p className="clamp-2 mt-2 text-[0.815rem] font-semibold leading-snug">
        {manga.title.english ?? manga.title.romaji}
      </p>
      <p className="mt-0.5 text-[0.7rem] text-faint">
        {manga.chapters ? `${manga.chapters} chapitres` : (STATUS[manga.status ?? ''] ?? '—')}
        {manga.startYear ? ` · ${manga.startYear}` : ''}
      </p>
      {manga.averageScore !== null && (
        <p className="text-[0.7rem] font-semibold" style={{ color: rgba(glow, 1) }}>
          {manga.averageScore}%
        </p>
      )}
    </motion.button>
  )
}

export default function MangaPage(): React.JSX.Element {
  const [tab, setTab] = useState<MangaKind>('trending')
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search.trim(), 380)
  const [open, setOpen] = useState<Manga | null>(null)

  const searching = debounced.length >= 2
  const kind: MangaKind = searching ? 'search' : tab
  const key = `${kind}:${searching ? debounced : ''}`

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
      .browse(kind, 1, searching ? debounced : '')
      .then(
        (res) => alive && setHeld({ key, items: res.items, hasMore: res.pageInfo.hasNextPage, page: 1, error: null })
      )
      .catch((err: Error) => alive && setHeld({ key, items: [], hasMore: false, page: 1, error: err.message }))
    return () => {
      alive = false
    }
    // La clé porte la requête entière ; le reste n'est là que pour la composer.
  }, [key, kind, debounced, searching])

  const fresh = held.key === key
  const items = fresh ? held.items : []
  const loading = !fresh
  const hasMore = fresh && held.hasMore

  const loadMore = (): void => {
    if (loading || loadingMore || !hasMore) return
    const next = held.page + 1
    setLoadingMore(true)
    void window.api.manga
      .browse(kind, next, searching ? debounced : '')
      .then((res) => {
        // La page suivante n'appartient qu'à la requête qui l'a demandée : un
        // onglet changé entre-temps la rendrait absurde.
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
      .catch((err: Error) => setHeld((prev) => (prev.key === key ? { ...prev, error: err.message } : prev)))
      .finally(() => setLoadingMore(false))
  }
  const sentinel = useInView(loadMore)

  return (
    <div className="page">
      <h1 className="title-xl mb-1 text-[1.85rem]">Manga</h1>
      <p className="mb-6 text-[0.85rem] text-muted">
        Le catalogue AniList, pour lire ce qui prolonge une série. Rien n’est suivi ici : cette page se consulte.
      </p>

      <div className="glass sticky top-0 z-20 mb-7 rounded-[20px] p-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[240px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un manga…"
              className="field w-full !pl-9 !pr-9"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Effacer"
                className="icon-btn absolute right-1 top-1/2 !h-7 !w-7 -translate-y-1/2"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {TABS.map(({ kind: k, label, icon: Icon }) => (
              <button
                key={k}
                data-on={!searching && tab === k}
                className="chip"
                onClick={() => {
                  setSearch('')
                  setTab(k)
                }}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <PosterSkeletons count={12} />
      ) : held.error ? (
        <ErrorBox message={held.error} />
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-faint">Aucun manga ne correspond.</p>
      ) : (
        <>
          <div className="card-grid">
            {items.map((manga, i) => (
              <Card key={manga.id} manga={manga} index={i} onOpen={() => setOpen(manga)} />
            ))}
          </div>
          {hasMore && <div ref={sentinel} className="h-4" />}
          {loadingMore && <Spinner label="Chargement de la suite…" />}
        </>
      )}

      <Modal open={open !== null} onClose={() => setOpen(null)} width={640}>
        {open && <Sheet manga={open} onClose={() => setOpen(null)} />}
      </Modal>
    </div>
  )
}

function Sheet({ manga, onClose }: { manga: Manga; onClose: () => void }): React.JSX.Element {
  const glow = toneAccent(manga.cover.color)
  return (
    <>
      <div className="flex gap-4 border-b p-5" style={{ borderColor: 'var(--line)' }}>
        <Poster src={manga.cover.xl} alt="" className="h-[168px] w-[116px] shrink-0" rounded="rounded-[14px]" />
        <div className="min-w-0 flex-1">
          <p className="label" style={{ color: rgba(glow, 1) }}>
            {STATUS[manga.status ?? ''] ?? 'Manga'}
          </p>
          <h2 className="title-xl mt-1 text-[1.3rem] leading-tight">{manga.title.english ?? manga.title.romaji}</h2>
          {manga.title.native && <p className="mt-0.5 text-[0.78rem] text-faint">{manga.title.native}</p>}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.76rem] text-muted">
            {manga.averageScore !== null && (
              <span className="font-semibold" style={{ color: rgba(glow, 1) }}>
                {manga.averageScore}%
              </span>
            )}
            {manga.chapters && <span>{manga.chapters} chapitres</span>}
            {manga.volumes && <span>{manga.volumes} tomes</span>}
            {manga.startYear && <span>{manga.startYear}</span>}
          </div>

          {manga.staff.length > 0 && <p className="mt-1.5 text-[0.76rem] text-faint">{manga.staff.join(' · ')}</p>}
        </div>
      </div>

      <div className="max-h-[36vh] overflow-y-auto px-5 py-4">
        {manga.genres.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {manga.genres.map((genre) => (
              <span key={genre} className="chip !h-6 !cursor-default !text-[0.65rem]">
                {genre}
              </span>
            ))}
          </div>
        )}
        <p className="whitespace-pre-line text-[0.83rem] leading-relaxed text-muted">
          {manga.description ?? 'Aucun résumé sur AniList.'}
        </p>
      </div>

      <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--line)' }}>
        <button className="btn" onClick={onClose}>
          Fermer
        </button>
        <button className="btn btn-primary" onClick={() => void window.api.app.openExternal(manga.siteUrl)}>
          <BookOpen size={14} />
          Voir sur AniList
          <ExternalLink size={13} />
        </button>
      </div>
    </>
  )
}
