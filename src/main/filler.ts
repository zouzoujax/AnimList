/**
 * Which episodes are filler.
 *
 * AniList has no such notion, so this comes from MyAnimeList through Jikan, its
 * open read-only API — no key, no account. Every media row already carries the
 * MAL id, so no extra matching is needed.
 *
 * Jikan asks for at most three requests a second, and a long series takes
 * several pages, so calls go through their own serial queue rather than the
 * AniList one: the two services have unrelated budgets and must not throttle
 * each other.
 *
 * Results are cached on disk. A finished series' filler list never changes, and
 * an airing one only grows, so a stale answer costs at most a few unlabelled
 * recent episodes — never a wrong label.
 */

import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { FillerInfo } from '@shared/types'
import { createQueue } from './queue'

const ENDPOINT = 'https://api.jikan.moe/v4'
/** Comfortably under Jikan's three-per-second ceiling. */
const MIN_GAP_MS = 1100
/** Jikan pages episodes by 100; nothing in a library needs more than this. */
const MAX_PAGES = 12
const TTL = 7 * 24 * 3600_000

interface CacheRow extends FillerInfo {
  at: number
}

interface JikanEpisode {
  mal_id?: number
  filler?: boolean
  recap?: boolean
}

const gate = createQueue({ minGapMs: MIN_GAP_MS })

let cache = new Map<number, CacheRow>()
let cacheFile = ''
let writeTimer: NodeJS.Timeout | null = null

export function initFiller(): void {
  cacheFile = join(app.getPath('userData'), 'filler-cache.json')
  if (!existsSync(cacheFile)) return
  try {
    const rows = JSON.parse(readFileSync(cacheFile, 'utf8')) as [number, CacheRow][]
    cache = new Map(rows)
  } catch {
    // A corrupt cache only costs one refetch.
    cache = new Map()
  }
}

function persist(): void {
  if (!cacheFile) return
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    writeTimer = null
    void fs
      .writeFile(cacheFile, JSON.stringify([...cache.entries()]), 'utf8')
      .catch((err) => console.error('[filler] écriture du cache impossible', err))
  }, 800)
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * One page of episodes.
 *
 * Each page is its own queued job, so the queue's gap applies *between pages*.
 * Running the whole pagination inside a single job put five requests back to
 * back and Jikan refused them: a 500-episode series came back empty while a
 * 220-episode one squeaked through.
 */
function fetchPage(malId: number, page: number): Promise<{ episodes: JikanEpisode[]; more: boolean }> {
  return gate.run('background', `filler:${malId}:${page}`, async () => {
    // `?page=1` answers 200 with an empty list — reproducible on several series,
    // while the same URL without the parameter returns the first hundred. Pages
    // 2 and up behave normally, so the parameter starts at the second.
    const url = page <= 1 ? `${ENDPOINT}/anime/${malId}/episodes` : `${ENDPOINT}/anime/${malId}/episodes?page=${page}`

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = await fetch(url, { headers: { Accept: 'application/json' } })

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) || 2
        await sleep(Math.min(retryAfter, 10) * 1000)
        continue
      }
      if (!res.ok) throw new Error(`Jikan HTTP ${res.status}`)

      const body = (await res.json()) as {
        data?: JikanEpisode[]
        pagination?: { has_next_page?: boolean }
      }
      return { episodes: body.data ?? [], more: body.pagination?.has_next_page === true }
    }
    throw new Error('Jikan : trop de requêtes')
  })
}

/**
 * Filler and recap episode numbers for a MAL id, or `null` when MyAnimeList has
 * nothing for it.
 *
 * Never throws: a missing label is a cosmetic loss, and the episode grid has to
 * render either way.
 */
export async function fillerFor(malId: number | null): Promise<FillerInfo | null> {
  if (!malId || malId <= 0) return null

  const hit = cache.get(malId)
  if (hit && Date.now() - hit.at < TTL) return { filler: hit.filler, recap: hit.recap, total: hit.total }

  try {
    // Deliberately *not* wrapped in a queue job: each page already takes one,
    // and an outer job would hold the serial queue while its own pages waited
    // in it — a deadlock.
    const filler: number[] = []
    const recap: number[] = []
    let total = 0

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { episodes, more } = await fetchPage(malId, page)
      for (const episode of episodes) {
        const number = episode.mal_id
        if (typeof number !== 'number' || number <= 0) continue
        total += 1
        if (episode.filler) filler.push(number)
        if (episode.recap) recap.push(number)
      }
      if (!more || !episodes.length) break
    }

    const info: FillerInfo = { filler, recap, total }

    // An empty answer is still an answer: caching it stops a pointless refetch
    // on every visit to a series MyAnimeList does not label.
    cache.set(malId, { ...info, at: Date.now() })
    persist()
    return info
  } catch (err) {
    console.error('[filler]', (err as Error).message)
    // Serve a stale entry rather than nothing.
    return hit ? { filler: hit.filler, recap: hit.recap, total: hit.total } : null
  }
}
