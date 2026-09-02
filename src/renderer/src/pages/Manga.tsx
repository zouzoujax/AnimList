/**
 * Le catalogue manga.
 *
 * En lecture seule, et c'est délibéré. Suivre un manga voudrait dire des
 * chapitres cochés, un historique, des statistiques et cent badges bâtis sur
 * des épisodes et des durées — un chapitre n'a ni l'un ni l'autre. Parcourir
 * répond déjà à la question qu'on se pose le plus souvent : « ça continue en
 * manga, et où j'en serais ? »
 *
 * Manga, manhwa et manhua sont séparés, parce qu'AniList ne les sépare pas :
 * il les range tous sous le même format, et sept des huit titres en tendance
 * sont en réalité coréens. Ce ne sont pourtant ni les mêmes objets ni le même
 * sens de lecture — l'annoncer évite d'ouvrir autre chose que ce qu'on croyait.
 *
 * Rien n'est écrit dans la bibliothèque depuis cette page.
 */

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Flame, Search, Star, TrendingUp, X } from 'lucide-react'
import type { Manga, MangaKind } from '@shared/types'
import { ORIGIN_FILTERS, ORIGIN_HINTS, ORIGIN_LABELS, type MangaOrigin } from '@shared/origin'
import { MANGA_STATUS, MangaSheet } from '@/components/MangaSheet'
import { ErrorBox, Modal, Poster, PosterSkeletons, Spinner } from '@/components/ui'
import { rgba, toneAccent } from '@/lib/color'
import { useDebounced, useInView } from '@/lib/hooks'

const TABS: { kind: MangaKind; label: string; icon: typeof Flame }[] = [
  { kind: 'trending', label: 'Tendances', icon: Flame },
  { kind: 'popular', label: 'Populaires', icon: TrendingUp },
  { kind: 'top', label: 'Mieux notés', icon: Star }
]

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
      <p className="mt-0.5 text-[0.7rem] text-faint" title={ORIGIN_HINTS[manga.origin]}>
        <span style={{ color: 'var(--accent-2)' }}>{ORIGIN_LABELS[manga.origin]}</span>
        {/* Le nombre de chapitres quand il est connu, le statut sinon : une
            série en cours n'en annonce aucun, et la ligne resterait vide. */}
        {manga.chapters
          ? ` · ${manga.chapters} ch.`
          : MANGA_STATUS[manga.status ?? '']
            ? ` · ${MANGA_STATUS[manga.status ?? '']}`
            : ''}
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
  // `null` : les trois traditions mélangées, comme AniList les sert.
  const [origin, setOrigin] = useState<MangaOrigin | null>(null)
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
      .catch((err: Error) => alive && setHeld({ key, items: [], hasMore: false, page: 1, error: err.message }))
    return () => {
      alive = false
    }
    // La clé porte la requête entière ; le reste n'est là que pour la composer.
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
        Le catalogue AniList, pour lire ce qui prolonge une série. Manga, manhwa et manhua sont distingués — AniList les
        mélange. Rien n’est suivi ici : cette page se consulte.
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

        {/* La distinction qu'AniList ne fait pas. Survolez pour savoir ce que
            chaque mot recouvre : le sens de lecture n'est pas le même. */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <button data-on={origin === null} className="chip" onClick={() => setOrigin(null)}>
            Tout
          </button>
          {ORIGIN_FILTERS.map((filter) => (
            <button
              key={filter.id}
              data-on={origin === filter.id}
              className="chip"
              title={ORIGIN_HINTS[filter.id]}
              onClick={() => setOrigin(origin === filter.id ? null : filter.id)}
            >
              {ORIGIN_LABELS[filter.id]}
            </button>
          ))}
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
        {open && <MangaSheet manga={open} onClose={() => setOpen(null)} />}
      </Modal>
    </div>
  )
}
