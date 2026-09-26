/**
 * MangaDex : les chapitres parus des mangas suivis, en français et en anglais.
 *
 * Ce qui décide est dans `shared/mangadex.ts` ; ici, le réseau et le cache.
 *
 * - **Poli** : MangaDex demande un User-Agent qui dise qui l'on est, et tient
 *   environ cinq requêtes par seconde. On en fait une toutes les 250 ms, une
 *   à la fois.
 * - **Gardé sur disque** : l'association AniList → MangaDex ne change pas, on
 *   la garde pour de bon ; un manga introuvable est recherché de nouveau une
 *   semaine plus tard ; les chapitres, six heures. Rouvrir le calendrier ne
 *   coûte donc rien.
 * - **Jamais bloquant** : une panne rend ce qu'on savait déjà, ou rien. Les
 *   dates d'AniList, elles, ne dépendent pas d'ici.
 */

import { app } from 'electron'
import { existsSync, readFileSync, promises as fs } from 'node:fs'
import { join } from 'node:path'
import {
  CHAPTER_LANGS,
  pickSeries,
  releasesOf,
  type ChapterRelease,
  type MdChapter,
  type MdSeries
} from '@shared/mangadex'

const API = 'https://api.mangadex.org'
const USER_AGENT = 'AnimeList (application de bureau personnelle ; suivi de lecture)'
const RATINGS = ['safe', 'suggestive', 'erotica', 'pornographic']
const GAP_MS = 250
const CHAPTERS_TTL = 6 * 3600_000
const MISS_TTL = 7 * 86_400_000

interface Row {
  /** L'identifiant MangaDex, ou `null` : cherché, pas trouvé. */
  md: string | null
  resolvedAt: number
  releases: ChapterRelease[]
  fetchedAt: number
}

let cache: Map<number, Row> | null = null
let file = ''
let timer: NodeJS.Timeout | null = null

function rows(): Map<number, Row> {
  if (cache) return cache
  file = join(app.getPath('userData'), 'mangadex-cache.json')
  cache = new Map()
  if (existsSync(file)) {
    try {
      cache = new Map(JSON.parse(readFileSync(file, 'utf8')) as [number, Row][])
    } catch {
      cache = new Map()
    }
  }
  return cache
}

function persist(): void {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    fs.writeFile(file, JSON.stringify([...rows().entries()]), 'utf8').catch(() => {})
  }, 3000)
}

/** Une requête à la fois, espacées : la file tient le rythme pour tout le monde. */
let turn: Promise<unknown> = Promise.resolve()

function get<T>(path: string, params: [string, string][]): Promise<T> {
  const url = `${API}${path}?${new URLSearchParams(params).toString()}`
  const run = async (): Promise<T> => {
    let res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (res.status === 429) {
      // Trop vite malgré tout : on attend ce qu'ils demandent, une fois.
      const wait = Number(res.headers.get('retry-after') ?? '') || 2
      await new Promise((r) => setTimeout(r, Math.min(wait, 10) * 1000))
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    }
    if (!res.ok) throw new Error(`MangaDex ${res.status}`)
    return (await res.json()) as T
  }
  const mine = turn.then(run)
  turn = mine.catch(() => {}).then(() => new Promise((r) => setTimeout(r, GAP_MS)))
  return mine
}

async function resolve(anilistId: number, titles: string[]): Promise<string | null> {
  for (const title of titles) {
    const res = await get<{ data: MdSeries[] }>('/manga', [
      ['title', title],
      ['limit', '10'],
      ['order[followedCount]', 'desc'],
      ...RATINGS.map((r): [string, string] => ['contentRating[]', r])
    ])
    const found = pickSeries(res.data, anilistId)
    if (found) return found
  }
  return null
}

async function chaptersOf(md: string): Promise<ChapterRelease[]> {
  // Surtout pas `includeExternalUrl=1` : il ne garde QUE les chapitres
  // hébergés ailleurs (MangaPlus…), et vidait toutes les séries lues sur
  // MangaDex même. Sans lui, les deux sortes viennent.
  const res = await get<{ data: MdChapter[] }>('/chapter', [
    ['manga', md],
    ...CHAPTER_LANGS.map((l): [string, string] => ['translatedLanguage[]', l]),
    ['order[chapter]', 'desc'],
    // Le maximum permis : plusieurs équipes font plusieurs lignes par
    // chapitre et par langue.
    ['limit', '100'],
    ...RATINGS.map((r): [string, string] => ['contentRating[]', r])
  ])
  return releasesOf(res.data)
}

/** Ce qu'il faut savoir d'un manga suivi pour le retrouver. */
export interface Tracked {
  id: number
  titles: string[]
}

const pending = new Map<number, Promise<ChapterRelease[]>>()

async function refresh(manga: Tracked): Promise<ChapterRelease[]> {
  const held = rows().get(manga.id)
  const now = Date.now()
  let md = held?.md ?? null
  try {
    if (!held || (held.md === null && now - held.resolvedAt > MISS_TTL)) {
      md = await resolve(manga.id, manga.titles)
      rows().set(manga.id, { md, resolvedAt: now, releases: [], fetchedAt: 0 })
      persist()
    }
    if (!md) return []
    const row = rows().get(manga.id)!
    if (now - row.fetchedAt < CHAPTERS_TTL) return row.releases
    const releases = await chaptersOf(md)
    rows().set(manga.id, { ...row, releases, fetchedAt: now })
    persist()
    return releases
  } catch (err) {
    console.error('[mangadex]', (err as Error).message)
    return rows().get(manga.id)?.releases ?? []
  }
}

/**
 * Les chapitres parus de chaque manga suivi, par identifiant AniList.
 *
 * Deux appels qui se croisent — le calendrier et « Ma lecture » ouverts de
 * suite — attendent la même réponse au lieu de tout redemander.
 */
export async function mangaChapters(mangas: Tracked[]): Promise<Record<number, ChapterRelease[]>> {
  const out: Record<number, ChapterRelease[]> = {}
  for (const manga of mangas) {
    let job = pending.get(manga.id)
    if (!job) {
      job = refresh(manga).finally(() => pending.delete(manga.id))
      pending.set(manga.id, job)
    }
    out[manga.id] = await job
  }
  return out
}
