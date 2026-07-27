/**
 * Drives a full TV Time / OpenTV import.
 *
 * Takes the parsed export and turns it into the entries, media and history the
 * store expects, reporting what happened to every single series. Network access
 * arrives through `deps`, so an entire import can be replayed in tests.
 */

import type { Entry, Media, TvTimeShowResult, WatchEvent } from '@shared/types'
import { allocate, statusFor, type Slot } from './allocate'
import { buildChain, type ChainDeps, type ImportCandidate } from './chain'
import { bestMatch, MATCH_CONFIDENT, searchQueries } from './match'
import type { SourceShow } from './read'

/** What became of one source series — the shape the renderer displays. */
export type ShowResult = TvTimeShowResult

export interface ImportOutcome {
  entries: Entry[]
  media: Media[]
  history: WatchEvent[]
  shows: ShowResult[]
}

export interface ImportDeps extends ChainDeps {
  search: (query: string) => Promise<ImportCandidate[]>
  /**
   * Forced decisions, keyed by source series id: a positive AniList id pins the
   * match, `0` skips the series entirely.
   */
  overrides?: Record<string, number>
  onProgress?: (done: number, total: number, label: string) => void
  /** Polled between series so a long import can be stopped from the UI. */
  isCancelled?: () => boolean
}

/**
 * Finds the AniList entry a source name refers to.
 *
 * Queries are tried from most to least specific and the best result across all
 * of them wins; a confident match stops the ladder early to save requests.
 */
async function findRoot(
  name: string,
  deps: ImportDeps
): Promise<{ candidate: ImportCandidate; score: number } | null> {
  let best: { candidate: ImportCandidate; score: number } | null = null

  for (const query of searchQueries(name)) {
    let candidates: ImportCandidate[]
    try {
      candidates = await deps.search(query)
    } catch {
      // One failed query must not sink the series: a later, simpler one may work.
      continue
    }

    const found = bestMatch(
      name,
      candidates.map((c) => ({
        titles: [c.media.title.romaji, c.media.title.english, c.media.title.native, ...c.synonyms],
        format: c.media.format,
        episodes: c.media.episodes,
        candidate: c
      }))
    )
    if (found && (!best || found.score > best.score)) {
      best = { candidate: found.candidate.candidate, score: found.score }
    }
    if (best && best.score >= MATCH_CONFIDENT) break
  }

  return best
}

export async function runImport(shows: SourceShow[], deps: ImportDeps): Promise<ImportOutcome> {
  const overrides = deps.overrides ?? {}
  const entries = new Map<number, Entry>()
  const media = new Map<number, Media>()
  const history: WatchEvent[] = []
  const results: ShowResult[] = []
  const now = Date.now()

  for (const [index, show] of shows.entries()) {
    if (deps.isCancelled?.()) break
    deps.onProgress?.(index, shows.length, show.name)

    const forced = overrides[show.id]
    if (forced === 0) {
      results.push({ ...blank(show), status: 'skipped' })
      continue
    }

    let root: ImportCandidate | null = null
    let score: number | null = null

    if (forced !== undefined && forced > 0) {
      root = await deps.fetchById(forced)
    } else {
      const found = await findRoot(show.name, deps)
      if (found) {
        root = found.candidate
        score = found.score
      }
    }

    if (!root) {
      results.push({ ...blank(show), status: 'unmatched' })
      continue
    }

    // Only pay for a chain walk when one entry cannot hold everything.
    const chain =
      show.watched > (root.media.episodes ?? 0)
        ? await buildChain(root, show.watched, deps)
        : [root]

    const slots: Slot[] = chain.map((c) => ({
      animeId: c.media.id,
      cap: c.media.episodes,
      minutes: c.media.duration
    }))
    const allocation = allocate(show.seasons, slots)

    for (const placement of allocation.placements) {
      // Marked as imported: the timestamp is when the episode was *ticked* in
      // the source app, not when it was watched, so day-based statistics must
      // leave these out.
      history.push({ ...placement, imported: true })
    }

    // Every entry of the chain joins the library, including a tail that received
    // nothing — that is what makes the next season show up as "to watch".
    for (const [slotIndex, candidate] of chain.entries()) {
      const fill = allocation.slots[slotIndex]
      const status = statusFor(fill)
      media.set(candidate.media.id, candidate.media)
      entries.set(candidate.media.id, {
        animeId: candidate.media.id,
        status,
        addedAt: show.addedAt ?? now,
        updatedAt: now,
        score: null,
        emotions: [],
        favorite: show.favorite,
        notes: '',
        rewatches: 0,
        startedAt: fill.firstAt,
        finishedAt: status === 'completed' ? fill.lastAt : null
      })
    }

    const placed = allocation.placements.length
    results.push({
      sourceId: show.id,
      sourceName: show.name,
      watched: show.watched,
      placed,
      score,
      status: placed === show.watched ? 'ok' : 'partial',
      chain: chain
        .map((c, i) => ({
          id: c.media.id,
          title: c.media.title.romaji,
          took: allocation.slots[i].used,
          of: c.media.episodes
        }))
        .filter((c) => c.took > 0)
    })
  }

  deps.onProgress?.(shows.length, shows.length, '')

  return {
    entries: [...entries.values()],
    media: [...media.values()],
    history,
    shows: results
  }
}

function blank(show: SourceShow): Omit<ShowResult, 'status'> {
  return {
    sourceId: show.id,
    sourceName: show.name,
    watched: show.watched,
    placed: 0,
    score: null,
    chain: []
  }
}
