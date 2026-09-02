import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrowseQuery, FillerInfo, Media, MediaDetail, SeasonEntry } from '@shared/types'
import { searchTitles, type AnimeSamaTarget } from '@/lib/watch'
import { fingerprint } from '@shared/translate'
import { useApp } from '@/store/app'

/**
 * Une réponse qui appartient à une clé.
 *
 * Le réflexe est de vider l'état au début de l'effet puis de le remplir à
 * l'arrivée. Ça coûte un rendu de plus, et surtout ça laisse les données de la
 * fiche précédente à l'écran pendant l'image qui sépare le rendu de l'effet.
 *
 * Garder la clé **avec** la valeur permet de déduire le vide pendant le rendu :
 * dès que la clé change, la valeur d'avant n'est plus la bonne réponse, sans
 * que personne ait eu à l'effacer. Une clé vide veut dire « rien à demander ».
 */
function useKeyed<T>(key: string, empty: T, run: () => Promise<T>): T {
  const [held, setHeld] = useState<{ key: string; value: T }>({ key: '', value: empty })
  // Le lanceur est recréé à chaque rendu ; le mettre en dépendance relancerait
  // la requête sans fin. Seule la clé décide qu'il faut repartir.
  const latest = useRef(run)
  useEffect(() => {
    latest.current = run
  })

  useEffect(() => {
    if (!key) return
    let alive = true
    latest
      .current()
      .then((res) => alive && setHeld({ key, value: res }))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [key])

  return held.key === key ? held.value : empty
}

/**
 * Anime-Sama slugs are unguessable, so the main process reads them from the
 * site's own catalogue. Until it answers, callers fall back to a search link.
 */
export function useAnimeSama(media: Media | null): AnimeSamaTarget | null {
  const id = media?.id ?? null
  const titles = media ? searchTitles(media).join('|') : ''
  return useKeyed<AnimeSamaTarget | null>(id === null || !titles ? '' : `${id}|${titles}`, null, () =>
    window.api.watch.animeSama(id as number, titles.split('|'))
  )
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
  const [loadingMore, setLoadingMore] = useState(false)
  const [nonce, setNonce] = useState(0)
  const pageRef = useRef(1)
  const key = query ? `${JSON.stringify(query)}:${nonce}` : ''

  // Une seule poche d'état, estampillée par la requête à laquelle elle répond.
  // Tant que l'estampille ne correspond pas, on sait qu'on est en train de
  // charger — sans avoir eu à l'écrire nulle part.
  const [held, setHeld] = useState<{
    key: string
    items: Media[]
    stale: boolean
    hasMore: boolean
    error: string | null
  }>({ key: '', items: [], stale: false, hasMore: false, error: null })

  // L'objet requête est recréé à chaque rendu : en dépendance, il relancerait
  // la recherche sans fin. Sa forme est déjà dans la clé, seule la clé décide.
  const latestQuery = useRef(query)
  useEffect(() => {
    latestQuery.current = query
  })

  useEffect(() => {
    const current = latestQuery.current
    if (!current || !key) return
    let alive = true
    pageRef.current = 1

    window.api.anime
      .browse({ ...current, page: 1 })
      .then((res) => {
        if (!alive) return
        setHeld({ key, items: res.items, stale: res.stale, hasMore: res.pageInfo.hasNextPage, error: null })
      })
      .catch((err: Error) => {
        if (alive) setHeld({ key, items: [], stale: false, hasMore: false, error: err.message })
      })

    return () => {
      alive = false
    }
  }, [key])

  const fresh = held.key === key
  const items = fresh ? held.items : []
  const loading = key !== '' && !fresh
  const error = fresh ? held.error : null
  const stale = fresh && held.stale
  const hasMore = fresh && held.hasMore

  const loadMore = useCallback(() => {
    if (!query || loadingMore || loading || !hasMore) return
    const page = pageRef.current + 1
    setLoadingMore(true)
    window.api.anime
      .browse({ ...query, page })
      .then((res) => {
        pageRef.current = page
        // La page suivante s'ajoute à celle qui est là, et seulement si c'est
        // toujours la même requête : sinon elle appartient à un écran quitté.
        setHeld((prev) => {
          if (prev.key !== key) return prev
          const seen = new Set(prev.items.map((m) => m.id))
          return {
            ...prev,
            items: [...prev.items, ...res.items.filter((m) => !seen.has(m.id))],
            hasMore: res.pageInfo.hasNextPage
          }
        })
      })
      .catch((err: Error) => setHeld((prev) => (prev.key === key ? { ...prev, error: err.message } : prev)))
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
  const [nonce, setNonce] = useState(0)
  // Le nonce entre dans la clé : réessayer, c'est repartir sur une autre clé.
  const key = id === null ? '' : `${id}:${nonce}`
  const [held, setHeld] = useState<{ key: string; data: MediaDetail | null; error: string | null }>({
    key: '',
    data: null,
    error: null
  })

  useEffect(() => {
    if (!key) return
    let alive = true
    window.api.anime
      .detail(id as number)
      .then((res) => alive && setHeld({ key, data: res, error: null }))
      .catch((err: Error) => alive && setHeld({ key, data: null, error: err.message }))
    return () => {
      alive = false
    }
  }, [key, id])

  const fresh = held.key === key
  return {
    data: fresh ? held.data : null,
    loading: key !== '' && !fresh,
    error: fresh ? held.error : null,
    retry: () => setNonce((n) => n + 1)
  }
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

const NO_FILMS: Media[] = []
const NO_SEASONS: SeasonEntry[] = []

/** Films of the whole franchise, not just the ones linked to this entry. */
export function useFranchiseFilms(media: Media | null): Media[] {
  const title = media ? (media.title.english ?? media.title.romaji) : ''
  return useKeyed(title, NO_FILMS, () => window.api.anime.films(title))
}

/**
 * Filler and recap episodes for a series, from MyAnimeList.
 *
 * Returns null until the answer arrives, and stays null for a series MAL has no
 * episode list for — the caller must render the grid regardless.
 */
export function useFiller(malId: number | null | undefined): FillerInfo | null {
  const id = malId ?? null
  return useKeyed<FillerInfo | null>(id ? String(id) : '', null, () => window.api.anime.filler(id))
}

/**
 * Every season of this anime's franchise, in broadcast order.
 *
 * Empty until it arrives, and empty for a standalone series — the caller shows
 * nothing rather than a strip of one.
 */
export function useSeasons(animeId: number | null): SeasonEntry[] {
  return useKeyed(animeId ? String(animeId) : '', NO_SEASONS, () => window.api.anime.seasons(animeId as number))
}

/**
 * Les mêmes textes, en français quand c'est possible.
 *
 * Rend les originaux tant que la traduction n'est pas là — et pour toujours
 * s'il n'y a pas de clé, si le service tombe, ou si le réglage est coupé. La
 * page n'a donc jamais de trou à gérer : elle affiche ce qu'on lui donne.
 *
 * La clé est l'empreinte des textes réunis : un synopsis fait plusieurs
 * milliers de caractères, et s'en servir tel quel comme clé de comparaison
 * coûterait à chaque rendu.
 */
export function useTranslated(texts: string[]): string[] {
  const enabled = useApp((s) => s.prefs.translate)
  const key = enabled && texts.length ? fingerprint(texts.join(' ')) : ''
  return useKeyed(key, texts, () => window.api.translate.texts(texts))
}

export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
