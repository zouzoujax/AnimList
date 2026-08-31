import { ArrowLeft, Boxes } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Media, StudioWorks } from '@shared/types'
import { AnimeCard } from '@/components/AnimeCard'
import { ErrorBox, PosterSkeletons, Section, Spinner } from '@/components/ui'
import { num } from '@/lib/format'
import { useInView } from '@/lib/hooks'
import { useApp } from '@/store/app'

const EMPTY_ITEMS: Media[] = []

export default function StudioPage({ studio }: { studio: string }): React.JSX.Element {
  const entries = useApp((s) => s.entries)
  const watched = useApp((s) => s.watched)
  const back = useApp((s) => s.back)

  const [loadingMore, setLoadingMore] = useState(false)
  // Tout ce qui vient du réseau tient dans une seule poche, estampillée du
  // studio auquel elle répond. Changer de studio la périme d'elle-même : plus
  // besoin de la vider avant de repartir, ni d'un drapeau de chargement.
  const [held, setHeld] = useState<{
    studio: string
    name: string
    items: Media[]
    hasMore: boolean
    page: number
    error: string | null
  }>({ studio: '', name: studio, items: [], hasMore: false, page: 1, error: null })

  useEffect(() => {
    let alive = true
    window.api.anime
      .studio(studio, 1)
      .then((res: StudioWorks) => {
        if (!alive) return
        setHeld({
          studio,
          name: res.studio,
          items: res.items,
          hasMore: res.pageInfo.hasNextPage,
          page: 1,
          error: null
        })
      })
      .catch(
        (err: Error) =>
          alive && setHeld({ studio, name: studio, items: [], hasMore: false, page: 1, error: err.message })
      )
    return () => {
      alive = false
    }
  }, [studio])

  const fresh = held.studio === studio
  const items = useMemo(() => (fresh ? held.items : EMPTY_ITEMS), [fresh, held.items])
  const name = fresh ? held.name : studio
  const loading = !fresh
  const hasMore = fresh && held.hasMore
  const error = fresh ? held.error : null

  const loadMore = (): void => {
    if (loading || loadingMore || !hasMore) return
    const next = held.page + 1
    setLoadingMore(true)
    window.api.anime
      .studio(studio, next)
      .then((res) => {
        // La page suivante n'a de sens que si on est resté sur le même studio.
        setHeld((prev) => {
          if (prev.studio !== studio) return prev
          const seen = new Set(prev.items.map((m) => m.id))
          return {
            ...prev,
            page: next,
            items: [...prev.items, ...res.items.filter((m) => !seen.has(m.id))],
            hasMore: res.pageInfo.hasNextPage
          }
        })
      })
      .catch((err: Error) => setHeld((prev) => (prev.studio === studio ? { ...prev, error: err.message } : prev)))
      .finally(() => setLoadingMore(false))
  }
  const sentinel = useInView(loadMore)

  // Titles you've already watched come first, then the rest of the catalogue.
  const { seen, rest } = useMemo(() => {
    const a: Media[] = []
    const b: Media[] = []
    for (const media of items) {
      if ((watched.get(media.id)?.size ?? 0) > 0 || entries.has(media.id)) a.push(media)
      else b.push(media)
    }
    a.sort((x, y) => (watched.get(y.id)?.size ?? 0) - (watched.get(x.id)?.size ?? 0))
    return { seen: a, rest: b }
  }, [items, entries, watched])

  return (
    <div className="page">
      <button className="btn btn-ghost mb-4 !px-2" onClick={back}>
        <ArrowLeft size={15} />
        Retour
      </button>

      <div className="mb-7 flex items-center gap-3.5">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
          style={{ background: 'color-mix(in oklab, var(--accent) 20%, transparent)' }}
        >
          <Boxes size={22} />
        </span>
        <div>
          <h1 className="title-xl text-[1.85rem] leading-tight">{name}</h1>
          <p className="mt-0.5 text-[0.85rem] text-muted">
            {loading ? 'Chargement…' : `${num(items.length)} titres chargés · ${num(seen.length)} dans ta bibliothèque`}
          </p>
        </div>
      </div>

      {loading ? (
        <PosterSkeletons count={12} />
      ) : error ? (
        <ErrorBox message={error} />
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-faint">Aucun titre trouvé pour ce studio.</p>
      ) : (
        <>
          {seen.length > 0 && (
            <Section title="Déjà dans ta bibliothèque" subtitle={`${num(seen.length)} titres`}>
              <div className="card-grid">
                {seen.map((media, i) => (
                  <AnimeCard key={media.id} media={media} width="100%" index={i % 24} />
                ))}
              </div>
            </Section>
          )}

          {rest.length > 0 && (
            <Section title={seen.length > 0 ? 'Le reste du catalogue' : 'Catalogue'} subtitle="Trié par popularité">
              <div className="card-grid">
                {rest.map((media, i) => (
                  <AnimeCard key={media.id} media={media} width="100%" index={i % 24} />
                ))}
              </div>
            </Section>
          )}

          {hasMore && <div ref={sentinel} className="h-4" />}
          {loadingMore && <Spinner label="Chargement de la suite…" />}
        </>
      )}
    </div>
  )
}
