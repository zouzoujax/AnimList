/**
 * Scores AniList candidates against a TheTVDB series name.
 *
 * The two databases romanise Japanese differently and disagree about
 * subtitles, so an exact string match finds barely half the library. This
 * module holds the pure part of the matching: normalisation, scoring, and the
 * ladder of progressively simpler search queries. Actually calling AniList is
 * the caller's job.
 */

import { similarity } from '../../shared/titles'

/** An AniList result, reduced to what scoring needs. */
export interface Candidate {
  /** Romaji, english, native, then synonyms — nulls are tolerated. */
  titles: (string | null | undefined)[]
  format?: string | null
  episodes?: number | null
}

/** Score below which a candidate is rejected outright as "no match". */
export const MATCH_FLOOR = 45
/** Score at or above which the search ladder stops early. */
export const MATCH_CONFIDENT = 84

/** `ii`, `iii`… as a whole word is a season number, not a long vowel. */
const ROMAN = /^[ivx]+$/

/**
 * Collapses romanisation noise so the same show written two ways compares equal:
 * `Shippūden` / `Shippuuden`, `Ōkami` / `Ookami`.
 *
 * Doubled vowels are squeezed *after* macrons are expanded, which is what makes
 * both spellings converge. This is lossy on purpose — it is a comparison key,
 * never something to display.
 *
 * Roman numerals are exempt from the squeeze. Without that, `Mushoku Tensei II`
 * and `Mushoku Tensei I` normalise to the same string and a sequel scores a
 * perfect match against its own first season — which silently pours a whole
 * library's episodes into the wrong entries.
 */
export function normalizeTitle(text: string | null | undefined): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/[āàáâ]/g, 'a')
    .replace(/[ūùúû]/g, 'u')
    .replace(/[ōòóô]/g, 'o')
    .replace(/[ēèéê]/g, 'e')
    .replace(/[īìíî]/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => (ROMAN.test(word) ? word : word.replace(/([aeiou])\1+/g, '$1')))
    .join(' ')
}

/**
 * How well `candidate` answers to `name`, roughly on a 0–100 scale.
 *
 * Exact beats prefix beats substring beats edit distance, then the format
 * adjusts the result: TheTVDB series are broadcast shows, so a film or a music
 * video carrying a similar name is almost always the wrong pick.
 */
export function scoreCandidate(name: string, candidate: Candidate): number {
  const needle = normalizeTitle(name)
  if (!needle) return 0

  let best = 0
  for (const raw of candidate.titles) {
    const title = normalizeTitle(raw)
    if (!title) continue

    if (title === needle) best = Math.max(best, 100)
    else if (title.startsWith(needle) || needle.startsWith(title)) best = Math.max(best, 84)
    else if (title.includes(needle) || needle.includes(title)) best = Math.max(best, 66)
    // Capped below the substring tier: a good edit distance on two different
    // shows is far weaker evidence than one title containing the other.
    else best = Math.max(best, Math.round(similarity(needle, title) * 78))
  }

  const format = candidate.format ?? ''
  if (format === 'TV' || format === 'ONA') best += 6
  if (format === 'MOVIE' || format === 'MUSIC' || format === 'SPECIAL') best -= 30
  // A one-episode result matching a followed series is usually an OVA or a
  // recap sharing the franchise name.
  if (candidate.episodes === 1) best -= 12

  return best
}

/**
 * The queries to try, in order, for a series name.
 *
 * AniList's search is literal enough that `Shippūden` never reaches an entry
 * stored as `Shippuuden`, and a long subtitle can push the real match off the
 * page — so each rung strips one more thing. Duplicates are removed, and the
 * original name always comes first.
 */
export function searchQueries(name: string): string[] {
  const queries = [name]
  const add = (q: string): void => {
    const trimmed = q.trim()
    if (trimmed && !queries.includes(trimmed)) queries.push(trimmed)
  }

  add(name.normalize('NFD').replace(/[̀-ͯ]/g, ''))
  add(name.split(/[:–—]/)[0])
  add(name.replace(/-(kun|chan|san|sama|senpai)\b/gi, ''))

  return queries
}

/** Picks the best-scoring candidate, or `null` when none clears the floor. */
export function bestMatch<T extends Candidate>(
  name: string,
  candidates: T[]
): { candidate: T; score: number } | null {
  let best: { candidate: T; score: number } | null = null
  for (const candidate of candidates) {
    const score = scoreCandidate(name, candidate)
    if (!best || score > best.score) best = { candidate, score }
  }
  return best && best.score >= MATCH_FLOOR ? best : null
}
