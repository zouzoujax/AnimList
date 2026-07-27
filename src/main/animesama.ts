import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { baseAndSeason, compact, searchVariants, similarity } from '@shared/titles'
import { overrideFor } from '@shared/watch-overrides'

/**
 * Anime-Sama slugs cannot be derived from a title — "Kaiju No. 8" lives at
 * `kaiju-n8`. So the slug is read from the site's own catalogue search, then the
 * season URL is confirmed with a real request before being offered as a direct
 * link. Anything unresolved degrades to the search page, which always works.
 */

export const ORIGIN = 'https://anime-sama.to'
const TTL = 30 * 24 * 3600_000
const MIN_SIMILARITY = 0.62

export interface WatchTarget {
  url: string
  direct: boolean
  /** Hand-checked as not present on the site — don't offer a pointless search. */
  absent?: boolean
}

interface Row extends WatchTarget {
  at: number
}

let cache = new Map<number, Row>()
let file = ''
let timer: NodeJS.Timeout | null = null

export function initAnimeSama(): void {
  file = join(app.getPath('userData'), 'anime-sama-cache.json')
  if (!existsSync(file)) return
  try {
    cache = new Map(JSON.parse(readFileSync(file, 'utf8')) as [number, Row][])
  } catch {
    cache = new Map()
  }
}

function persist(): void {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    fs.writeFile(file, JSON.stringify([...cache.entries()]), 'utf8').catch(() => {})
  }, 3000)
}

export function searchUrl(term: string): string {
  return `${ORIGIN}/catalogue/?search=${encodeURIComponent(term)}`
}

async function text(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url, { redirect: 'follow' })
  return { status: res.status, body: res.status === 200 ? await res.text() : '' }
}

/** Catalogue links appear in the search page markup as /catalogue/<slug>/. */
function slugsIn(html: string): string[] {
  const found = new Set<string>()
  for (const m of html.matchAll(/href="(?:https?:\/\/anime-sama\.to)?\/catalogue\/([a-z0-9-]+)\/?"/gi)) {
    found.add(m[1])
  }
  return [...found]
}

/**
 * Scored against every title variant, not just the long form: the site files
 * "Demon Slayer: Kimetsu no Yaiba" under `demon-slayer`, and comparing the full
 * title to that slug scores 0.44 — below threshold, so the right answer loses.
 */
function bestSlug(slugs: string[], variants: string[]): string | null {
  const needles = variants.map(compact).filter(Boolean)
  let best: { slug: string; score: number } | null = null
  for (const slug of slugs) {
    const candidate = compact(slug)
    for (const needle of needles) {
      const score = similarity(needle, candidate)
      if (!best || score > best.score) best = { slug, score }
    }
  }
  return best && best.score >= MIN_SIMILARITY ? best.slug : null
}

export async function resolve(animeId: number, titles: string[]): Promise<WatchTarget> {
  // A hand-checked answer always wins, and costs no request.
  const override = overrideFor(animeId)
  if (override && 'animeSama' in override) {
    return override.animeSama ? { url: override.animeSama, direct: true } : { url: '', direct: false, absent: true }
  }

  const hit = cache.get(animeId)
  if (hit && Date.now() - hit.at < TTL) return { url: hit.url, direct: hit.direct }

  const primary = titles[0] ?? ''
  const { base, season } = baseAndSeason(primary)
  const fallback: WatchTarget = { url: searchUrl(searchVariants(base)[0] ?? primary), direct: false }

  const queries: string[] = []
  for (const title of titles) {
    for (const variant of searchVariants(baseAndSeason(title).base)) {
      if (!queries.includes(variant)) queries.push(variant)
    }
  }

  let slug: string | null = null
  for (const query of queries.slice(0, 3)) {
    let page: { status: number; body: string }
    try {
      page = await text(searchUrl(query))
    } catch {
      return fallback
    }
    if (page.status !== 200) continue
    slug = bestSlug(slugsIn(page.body), queries)
    if (slug) break
  }

  if (!slug) {
    cache.set(animeId, { ...fallback, at: Date.now() })
    persist()
    return fallback
  }

  // Prefer the episode list for the right season; fall back to the show page.
  // Season 0 means the title gave no usable number ("Final Season") — going
  // straight to the series page beats guessing.
  const paths = season > 0 ? [`/catalogue/${slug}/saison${season}/`, `/catalogue/${slug}/`] : [`/catalogue/${slug}/`]
  for (const path of paths) {
    try {
      const probe = await text(ORIGIN + path)
      if (probe.status !== 200) continue
    } catch {
      break
    }
    const target: WatchTarget = { url: ORIGIN + path, direct: true }
    cache.set(animeId, { ...target, at: Date.now() })
    persist()
    return target
  }

  cache.set(animeId, { ...fallback, at: Date.now() })
  persist()
  return fallback
}
