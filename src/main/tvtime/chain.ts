/**
 * Builds the chain of AniList entries that a single TheTVDB series spans.
 *
 * A show followed as one series in TV Time is often a dozen AniList entries.
 * The chain is walked through `SEQUEL` relations, which is exact when the data
 * is complete — and it usually is for long-running shounen.
 *
 * AniList's relation graph has holes, though: several franchises (Dr. STONE,
 * Tensei Shitara Slime Datta Ken) do not expose a `SEQUEL` edge for every cour.
 * When the walk comes up short, a franchise search fills the rest by title
 * prefix and broadcast date.
 *
 * Network access is injected, so the whole traversal is testable offline.
 */

import type { Media } from '@shared/types'
import { normalizeTitle } from './match'

/** A sequel edge, reduced to what the walk needs to choose one. */
export interface SequelRef {
  id: number
  format: string | null
  episodes: number | null
}

/** An AniList entry, mapped, plus what is needed to keep walking. */
export interface ImportCandidate {
  media: Media
  synonyms: string[]
  sequels: SequelRef[]
}

export interface ChainDeps {
  fetchById: (id: number) => Promise<ImportCandidate | null>
  searchFranchise: (title: string) => Promise<ImportCandidate[]>
}

/** Only formats that air as a series can hold a followed season's episodes. */
const BROADCAST = new Set(['TV', 'ONA', 'TV_SHORT'])

/**
 * A runaway walk would hammer the API for nothing; no franchise in the library
 * is anywhere near this long.
 */
const MAX_LINKS = 12

const episodesOf = (c: ImportCandidate): number => c.media.episodes ?? 0

/** Sort key that orders entries by first broadcast. */
function airedOn(c: ImportCandidate): number {
  const d = c.media.startDate
  return (d?.year ?? 0) * 10_000 + (d?.month ?? 0) * 100 + (d?.day ?? 0)
}

/**
 * Returns the entries that together can hold `needed` episodes, starting at
 * `root`. The chain may come back shorter than asked when AniList simply has
 * no more entries — the caller reports the leftover rather than inventing one.
 */
export async function buildChain(
  root: ImportCandidate,
  needed: number,
  deps: ChainDeps
): Promise<ImportCandidate[]> {
  const chain = [root]
  const seen = new Set([root.media.id])
  let total = episodesOf(root)
  let current = root

  while (total < needed && chain.length < MAX_LINKS) {
    const next = current.sequels
      .filter((s) => BROADCAST.has(s.format ?? '') && !seen.has(s.id))
      // Prefer the longest sequel: recaps and shorts share the SEQUEL edge with
      // the real continuation, and they carry far fewer episodes.
      .sort((a, b) => (b.episodes ?? 0) - (a.episodes ?? 0))[0]
    if (!next) break

    const fetched = await deps.fetchById(next.id)
    if (!fetched) break

    seen.add(fetched.media.id)
    chain.push(fetched)
    total += episodesOf(fetched)
    current = fetched
  }

  if (total >= needed) return chain

  // Fallback: siblings sharing the franchise name, oldest first.
  const key = normalizeTitle(root.media.title.romaji).split(' ').slice(0, 2).join(' ')
  if (!key) return chain

  let siblings: ImportCandidate[]
  try {
    siblings = await deps.searchFranchise(root.media.title.romaji)
  } catch {
    // Offline or rate limited: keep what the walk found rather than failing the
    // whole show.
    return chain
  }

  const usable = siblings
    .filter((c) => !seen.has(c.media.id))
    .filter((c) => BROADCAST.has(c.media.format ?? ''))
    .filter((c) =>
      [c.media.title.romaji, c.media.title.english, ...c.synonyms].some(
        (t) => t && normalizeTitle(t).startsWith(key)
      )
    )
    .sort((a, b) => airedOn(a) - airedOn(b))

  for (const sibling of usable) {
    if (total >= needed || chain.length >= MAX_LINKS) break
    chain.push(sibling)
    seen.add(sibling.media.id)
    total += episodesOf(sibling)
  }

  return chain
}
