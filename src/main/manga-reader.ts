/**
 * Les mangas posés sur le disque, et leur lecture.
 *
 * On choisit un dossier une fois ; chaque sous-dossier est une série, chaque
 * archive (CBZ, ZIP) ou dossier d'images qu'il contient est un tome. Les pages
 * arrivent à la fenêtre par un protocole maison, sur le modèle des vidéos :
 * `animelist-manga` ne sert que ce qui se trouve sous le dossier choisi, tout
 * le reste répond 403.
 *
 * Pourquoi pas izneo ou un autre site : les boutiques légales protègent leurs
 * pages (DRM, lecteur maison) et n'ouvrent aucune API ; les sites qui en
 * servent sans protection sont ceux qui les diffusent sans droits. Lire ses
 * propres fichiers — achetés sans DRM, numérisés, ou exportés — est le seul
 * chemin qui ne dépende de personne.
 *
 * La progression vit dans son propre fichier, à côté de la bibliothèque : elle
 * n'a rien à faire dans les sauvegardes d'animes, et y toucher demanderait une
 * migration pour une donnée qu'on peut perdre sans drame.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, relative, resolve, sep } from 'node:path'
import { app, BrowserWindow, dialog, protocol } from 'electron'
import type { LocalSeries, LocalVolume, MangaShelf } from '@shared/types'
import {
  extOf,
  isArchive,
  isChapter,
  isImage,
  naturalCompare,
  seriesTitleOf,
  sortVolumes,
  volumeNumber
} from '@shared/manga-files'
import { listZip, readZipEntry, type ZipEntry } from './zip'

export const MANGA_SCHEME = 'animelist-manga'

interface Progress {
  page: number
  pages: number
  updatedAt: number
}

interface MangaDb {
  root: string | null
  progress: Record<string, Progress>
}

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml'
}

let db: MangaDb = { root: null, progress: {} }
let file = ''
let loaded = false

function load(): void {
  if (loaded) return
  loaded = true
  file = join(app.getPath('userData'), 'animelist-manga.json')
  if (!existsSync(file)) return
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<MangaDb>
    db = {
      root: typeof raw.root === 'string' ? raw.root : null,
      progress: raw.progress && typeof raw.progress === 'object' ? raw.progress : {}
    }
  } catch {
    // Un fichier illisible ne coûte que des marque-pages : on repart de zéro
    // plutôt que de bloquer la lecture.
  }
}

let saving: Promise<void> = Promise.resolve()
function save(): void {
  const snapshot = JSON.stringify(db)
  // À la file : deux pages tournées vite ne doivent pas écrire en même temps.
  saving = saving.then(() => writeFile(file, snapshot, 'utf8').catch(() => undefined))
}

/** Même contrôle que pour les vidéos : `relative` plutôt qu'un `startsWith`. */
function isAllowed(path: string): boolean {
  if (!db.root) return false
  const rel = relative(resolve(db.root), resolve(path))
  return rel !== '' && !rel.startsWith('..') && !rel.startsWith(`..${sep}`)
}

/**
 * Les pages d'un tome, dans l'ordre de lecture.
 *
 * Gardées en mémoire tant que le fichier ne bouge pas : tourner une page
 * redemande la liste, et relire le répertoire central d'une archive à chaque
 * fois serait du gaspillage.
 */
type PageRef = { kind: 'file'; path: string } | { kind: 'zip'; entry: ZipEntry }
const pageCache = new Map<string, { mtime: number; pages: PageRef[] }>()

async function pagesOf(volume: string): Promise<PageRef[]> {
  const mtime = statSync(volume).mtimeMs
  const held = pageCache.get(volume)
  if (held && held.mtime === mtime) return held.pages

  let pages: PageRef[]
  if (isArchive(volume)) {
    const entries = await listZip(volume)
    pages = entries
      .filter((e) => isImage(e.name))
      .sort((a, b) => naturalCompare(a.name, b.name))
      .map((entry) => ({ kind: 'zip', entry }))
  } else {
    pages = (await imagesIn(volume)).map((path) => ({ kind: 'file', path }))
  }
  pageCache.set(volume, { mtime, pages })
  return pages
}

/**
 * Les images d'un dossier de tome. Un niveau de plus est accepté : un tome
 * découpé en chapitres (`Tome 01/Chapitre 001/001.jpg`) se lit d'une traite.
 */
async function imagesIn(folder: string, depth = 0): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])
  entries.sort((a, b) => naturalCompare(a.name, b.name))
  const out: string[] = []
  for (const entry of entries) {
    const full = join(folder, entry.name)
    if (entry.isDirectory() && depth < 1) out.push(...(await imagesIn(full, depth + 1)))
    else if (entry.isFile() && isImage(entry.name)) out.push(full)
  }
  return out
}

function pageUrl(volume: string, index: number): string {
  return `${MANGA_SCHEME}://page/?v=${encodeURIComponent(volume)}&i=${index}`
}

async function volumeOf(path: string, name: string): Promise<LocalVolume | null> {
  const pages = await pagesOf(path).catch(() => [])
  if (!pages.length) return null
  const held = db.progress[path]
  return {
    id: path,
    name,
    number: volumeNumber(name),
    chapter: isChapter(name),
    pages: pages.length,
    page: held ? Math.min(held.page, pages.length - 1) : 0,
    readAt: held?.updatedAt ?? null,
    cover: pageUrl(path, 0)
  }
}

function seriesOf(id: string, title: string, volumes: LocalVolume[]): LocalSeries {
  const sorted = sortVolumes(volumes)
  const readAt = sorted.reduce<number | null>((max, v) => (v.readAt && (!max || v.readAt > max) ? v.readAt : max), null)
  return { id, title, volumes: sorted, cover: sorted[0]?.cover ?? null, readAt }
}

async function scanSeries(folder: string): Promise<LocalSeries | null> {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])
  const volumes: LocalVolume[] = []
  let looseImages = false

  for (const entry of entries) {
    const full = join(folder, entry.name)
    if (entry.isFile() && isArchive(entry.name)) {
      const volume = await volumeOf(full, entry.name.replace(/\.[^.]+$/, ''))
      if (volume) volumes.push(volume)
    } else if (entry.isDirectory()) {
      const volume = await volumeOf(full, entry.name)
      if (volume) volumes.push(volume)
    } else if (entry.isFile() && isImage(entry.name)) {
      looseImages = true
    }
  }

  // Des images posées directement sous la série : un one-shot, un seul tome.
  if (looseImages && !volumes.length) {
    const direct = await volumeOf(folder, basename(folder))
    if (direct) volumes.push(direct)
  }

  return volumes.length ? seriesOf(folder, basename(folder), volumes) : null
}

export async function scanShelf(): Promise<MangaShelf> {
  load()
  const root = db.root
  if (!root) return { root: null, missing: false, series: [] }
  if (!existsSync(root)) return { root, missing: true, series: [] }

  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const series: LocalSeries[] = []
  // Les archives posées seules à la racine se regroupent par titre :
  // « Frieren T01.cbz » et « Frieren T02.cbz » font une seule série.
  const loose = new Map<string, LocalVolume[]>()

  for (const entry of entries) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      const found = await scanSeries(full)
      if (found) series.push(found)
    } else if (entry.isFile() && isArchive(entry.name)) {
      const volume = await volumeOf(full, entry.name.replace(/\.[^.]+$/, ''))
      if (!volume) continue
      const title = seriesTitleOf(entry.name)
      loose.set(title, [...(loose.get(title) ?? []), volume])
    }
  }
  for (const [title, volumes] of loose) series.push(seriesOf(join(root, `#${title}`), title, volumes))

  series.sort((a, b) => (b.readAt ?? 0) - (a.readAt ?? 0) || naturalCompare(a.title, b.title))
  return { root, missing: false, series }
}

export async function chooseRoot(): Promise<MangaShelf> {
  load()
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const picked = await dialog.showOpenDialog(win, {
    title: 'Dossier de tes mangas',
    properties: ['openDirectory'],
    defaultPath: db.root ?? undefined
  })
  if (!picked.canceled && picked.filePaths[0]) {
    db.root = picked.filePaths[0]
    pageCache.clear()
    save()
  }
  return scanShelf()
}

export function forgetRoot(): void {
  load()
  db.root = null
  pageCache.clear()
  save()
}

/** Les adresses des pages d'un tome, dans l'ordre. */
export async function volumePages(volume: string): Promise<string[]> {
  load()
  if (!isAllowed(volume)) return []
  const pages = await pagesOf(volume).catch(() => [])
  return pages.map((_, i) => pageUrl(volume, i))
}

/** Retient la page où l'on s'est arrêté. Refusé hors du dossier choisi. */
export function rememberPage(volume: string, page: number, pages: number): boolean {
  load()
  if (!isAllowed(volume)) return false
  db.progress[volume] = { page: Math.max(0, Math.floor(page)), pages, updatedAt: Date.now() }
  save()
  return true
}

/**
 * Doit être appelé avant `app.whenReady`, avec celui des vidéos : un protocole
 * déclaré après n'est pas tenu pour sûr.
 */
export const MANGA_SCHEME_PRIVILEGES = {
  scheme: MANGA_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: false }
}

export function serveManga(): void {
  protocol.handle(MANGA_SCHEME, async (request) => {
    load()
    const url = new URL(request.url)
    const volume = url.searchParams.get('v')
    const index = Number(url.searchParams.get('i'))
    if (!volume || !Number.isInteger(index) || index < 0) return new Response('', { status: 400 })
    if (!isAllowed(volume) || !existsSync(volume)) return new Response('', { status: 403 })

    const pages = await pagesOf(volume).catch(() => [])
    const page = pages[index]
    if (!page) return new Response('', { status: 404 })

    try {
      const name = page.kind === 'zip' ? page.entry.name : page.path
      const body = page.kind === 'zip' ? await readZipEntry(volume, page.entry) : await readFile(page.path)
      return new Response(new Uint8Array(body), {
        headers: {
          'Content-Type': MIME[extOf(name)] ?? 'application/octet-stream',
          // Une page ne change pas sous nos yeux : la revoir en revenant en
          // arrière ne doit pas la relire du disque.
          'Cache-Control': 'max-age=3600'
        }
      })
    } catch {
      return new Response('', { status: 500 })
    }
  })
}
