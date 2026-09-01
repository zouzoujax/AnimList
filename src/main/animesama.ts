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
  /**
   * L'adresse porte la liste des épisodes, et pas seulement la fiche de la
   * série. Seules ces pages-là ont un menu à positionner.
   */
  episodes?: boolean
}

interface Row extends WatchTarget {
  at: number
  /**
   * Version de la règle qui a produit cette réponse. Jusqu'à la 2, on s'arrêtait
   * au hub de la série — `/catalogue/<slug>/` — qui répond 200 sans contenir le
   * moindre épisode ; jusqu'à la 3, une saison inexistante suffisait pourvu
   * qu'elle réponde 200. Les réponses d'avant doivent être refaites, pas
   * attendues trente jours.
   */
  v?: number
}

const RULE_VERSION = 3

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

/**
 * Une vraie page d'épisodes déclare ses lecteurs : `var eps1 = ['https://…']`.
 *
 * Une saison qui n'existe pas répond 200 elle aussi, avec `//` pour tout
 * contenu — le code seul ne prouve donc rien. C'est ainsi que « Kaiju No. 8 »
 * ouvrait une huitième saison vide au lieu de la première.
 */
export function listsEpisodes(body: string): boolean {
  return /var\s+eps\w*\s*=\s*\[\s*["']https?:/i.test(body)
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
  if (hit && hit.v === RULE_VERSION && Date.now() - hit.at < TTL) {
    return { url: hit.url, direct: hit.direct, episodes: hit.episodes }
  }

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

  /**
   * Les épisodes vivent sous `saison<N>/<langue>/`, jamais au-dessus : le hub
   * `/catalogue/<slug>/` et la saison nue répondent 200 tous les deux, sans
   * contenir un seul épisode. Un simple code 200 ne prouvait donc rien — d'où
   * des liens qui tombaient sur la fiche de la série.
   *
   * `episodes.js` tranche, à condition de le lire : il manque au hub, et il est
   * vide sur une saison qui n'existe pas.
   *
   * VOSTFR d'abord, VF ensuite. Saison 0 veut dire que le titre n'a pas donné
   * de numéro exploitable (« Final Season ») : on tente la première saison,
   * qui est le cas de très loin le plus courant.
   */
  const seasons = season > 0 ? [season, 1] : [1]
  const paths: string[] = []
  for (const n of seasons) {
    for (const lang of ['vostfr', 'vf']) {
      const path = `/catalogue/${slug}/saison${n}/${lang}/`
      if (!paths.includes(path)) paths.push(path)
    }
  }

  for (const path of paths) {
    try {
      const probe = await text(`${ORIGIN}${path}episodes.js`)
      if (probe.status !== 200 || !listsEpisodes(probe.body)) continue
    } catch {
      break
    }
    const target: WatchTarget = { url: ORIGIN + path, direct: true, episodes: true }
    cache.set(animeId, { ...target, at: Date.now(), v: RULE_VERSION })
    persist()
    return target
  }

  // Aucune page d'épisodes trouvée : la fiche de la série reste utile, mais
  // elle n'a pas de menu, et il ne faut pas laisser croire le contraire.
  try {
    const hub = `/catalogue/${slug}/`
    const probe = await text(ORIGIN + hub)
    if (probe.status === 200) {
      const target: WatchTarget = { url: ORIGIN + hub, direct: true, episodes: false }
      cache.set(animeId, { ...target, at: Date.now(), v: RULE_VERSION })
      persist()
      return target
    }
  } catch {
    // Réseau muet : on retombe sur la recherche, comme partout ailleurs.
  }

  cache.set(animeId, { ...fallback, at: Date.now(), v: RULE_VERSION })
  persist()
  return fallback
}
