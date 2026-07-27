import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrowseQuery, Media, MediaDetail } from '@shared/types'
import { searchTitles, type AnimeSamaTarget } from '@/lib/watch'

/**
 * Anime-Sama slugs are unguessable, so the main process reads them from the
 * site's own catalogue. Until it answers, callers fall back to a search link.
 */
export function useAnimeSama(media: Media | null): AnimeSamaTarget | null {
  const [target, setTarget] = useState<AnimeSamaTarget | null>(null)
  const id = media?.id ?? null
  const titles = media ? searchTitles(media).join('|') : ''

  useEffect(() => {
    setTarget(null)
    if (id === null || !titles) return
    let alive = true
    window.api.watch
      .animeSama(id, titles.split('|'))
      .then((res) => alive && setTarget(res))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [id, titles])

  return target
}

export function useDebounced<T>(value: T, delay = 320): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

interface BrowseResult {
  items: Media[]
  loading: boolean
  loadingMore: boolean
  error: string | null
  stale: boolean
  hasMore: boolean
  loadMore: () => void
  retry: () => void
}

/** Paginated AniList browse with cancellation on query change. */
export function useBrowse(query: BrowseQuery | null): BrowseResult {
  const [items, setItems] = useState<Media[]>([])
  const [loading, setLoading] = useState(!!query)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [nonce, setNonce] = useState(0)
  const pageRef = useRef(1)
  const keyRef = useRef('')
  const key = query ? JSON.stringify(query) : ''

  useEffect(() => {
    if (!query) {
      setItems([])
      setLoading(false)
      return
    }
    let alive = true
    keyRef.current = key
    pageRef.current = 1
    setLoading(true)
    setError(null)

    window.api.anime
      .browse({ ...query, page: 1 })
      .then((res) => {
        if (!alive || keyRef.current !== key) return
        setItems(res.items)
        setStale(res.stale)
        setHasMore(res.pageInfo.hasNextPage)
      })
      .catch((err: Error) => {
        if (alive) setError(err.message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [key, nonce])

  const loadMore = useCallback(() => {
    if (!query || loadingMore || loading || !hasMore) return
    const page = pageRef.current + 1
    setLoadingMore(true)
    window.api.anime
      .browse({ ...query, page })
      .then((res) => {
        if (keyRef.current !== key) return
        pageRef.current = page
        setItems((prev) => {
          const seen = new Set(prev.map((m) => m.id))
          return [...prev, ...res.items.filter((m) => !seen.has(m.id))]
        })
        setHasMore(res.pageInfo.hasNextPage)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoadingMore(false))
  }, [key, query, loading, loadingMore, hasMore])

  return {
    items,
    loading,
    loadingMore,
    error,
    stale,
    hasMore,
    loadMore,
    retry: () => setNonce((n) => n + 1)
  }
}

export function useDetail(id: number | null): {
  data: MediaDetail | null
  loading: boolean
  error: string | null
  retry: () => void
} {
  const [data, setData] = useState<MediaDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (id === null) return
    let alive = true
    setLoading(true)
    setError(null)
    setData(null)
    window.api.anime
      .detail(id)
      .then((res) => alive && setData(res))
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [id, nonce])

  return { data, loading, error, retry: () => setNonce((n) => n + 1) }
}

/** Fires when the sentinel scrolls into view — used for infinite grids. */
export function useInView(onEnter: () => void): (node: HTMLElement | null) => void {
  const cb = useRef(onEnter)
  // Assigning during render is a React rule violation; refs are for effects.
  useEffect(() => {
    cb.current = onEnter
  }, [onEnter])

  return useCallback((node: HTMLElement | null) => {
    if (!node) return
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && cb.current(), {
      rootMargin: '600px 0px'
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
}

/** Films of the whole franchise, not just the ones linked to this entry. */
export function useFranchiseFilms(media: Media | null): Media[] {
  const [films, setFilms] = useState<Media[]>([])
  const title = media ? (media.title.english ?? media.title.romaji) : ''

  useEffect(() => {
    setFilms([])
    if (!title) return
    let alive = true
    window.api.anime
      .films(title)
      .then((res) => alive && setFilms(res))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [title])

  return films
}

export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
