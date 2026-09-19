import { humanMessage } from '@shared/api-outage'
import { useEffect, useMemo, useState } from 'react'
import type { Media, StudioWorks } from '@shared/types'
import { AnimeCard } from '@/components/AnimeCard'
import { FollowButton } from '@/components/FollowButton'
import { NdHeader, SeriesRow, plural } from '@/components/nd'
import { ErrorBox, PosterSkeletons, Spinner } from '@/components/ui'
import { useInView } from '@/lib/hooks'
import { useApp } from '@/store/app'

const EMPTY_ITEMS: Media[] = []

/**
 * Un studio, dans le nouveau design.
 *
 * Ce que tu as déjà vu d'un studio est une question de progression : une
 * ligne par série, avec sa frise. Le reste de son catalogue est une question
 * de choix : des affiches.
 */
export default function NdStudioPage({ studio }: { studio: string }): React.JSX.Element {
  const entries = useApp((s) => s.entries)
  const watched = useApp((s) => s.watched)
  const back = useApp((s) => s.back)

  const [loadingMore, setLoadingMore] = useState(false)
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
        setHeld({ studio, name: res.studio, items: res.items, hasMore: res.pageInfo.hasNextPage, page: 1, error: null })
      })
      .catch(
        (err: Error) =>
          alive &&
          setHeld({ studio, name: studio, items: [], hasMore: false, page: 1, error: humanMessage(err.message) })
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
      .catch((err: Error) =>
        setHeld((prev) => (prev.studio === studio ? { ...prev, error: humanMessage(err.message) } : prev))
      )
      .finally(() => setLoadingMore(false))
  }
  const sentinel = useInView(loadMore)

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

  const loaded = plural(items.length, 'titre chargé', 'titres chargés')

  return (
    <div className="page">
      <NdHeader
        back={back}
        title={name}
        sub={
          loading
            ? 'Chargement du catalogue…'
            : seen.length > 0
              ? `${plural(seen.length, 'de ses séries est', 'de ses séries sont')} dans ta bibliothèque, sur ${loaded}.`
              : `Aucune de ses séries dans ta bibliothèque pour l’instant, sur ${loaded}.`
        }
        actions={<FollowButton kind="studio" target={studio} name={name} />}
      />

      {loading ? (
        <PosterSkeletons count={12} />
      ) : error ? (
        <ErrorBox message={error} />
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">AniList ne connaît aucun titre à ce studio.</p>
      ) : (
        <>
          {seen.length > 0 && (
            <section className="mb-10">
              <h2 className="title-xl mb-3.5 px-1 text-[1.32rem]">Ce que tu en as vu</h2>
              <ul className="home-queue">
                {seen.map((media) => (
                  <SeriesRow key={media.id} media={media} />
                ))}
              </ul>
            </section>
          )}

          {rest.length > 0 && (
            <section>
              <h2 className="title-xl px-1 text-[1.32rem]">
                {seen.length > 0 ? 'Le reste de son catalogue' : 'Son catalogue'}
              </h2>
              <p className="mb-3.5 mt-0.5 px-1 text-[0.8rem] text-muted">Du plus populaire au moins connu.</p>
              <div className="card-grid">
                {rest.map((media, i) => (
                  <AnimeCard key={media.id} media={media} width="100%" index={i % 24} />
                ))}
              </div>
            </section>
          )}

          {hasMore && <div ref={sentinel} className="h-4" />}
          {loadingMore && <Spinner label="Chargement de la suite…" />}
        </>
      )}
    </div>
  )
}
