/**
 * Fichiers vidéo locaux.
 *
 * On associe un dossier à une série, on y cherche les épisodes, et on les sert
 * à la fenêtre par un protocole maison.
 *
 * Pourquoi pas `file://` : la fenêtre est en CSP stricte et n'a aucune raison
 * de pouvoir lire n'importe quel fichier du disque. Le protocole
 * `animelist-media` ne sert que ce qui se trouve **sous un dossier choisi à la
 * main par l'utilisateur** ; tout le reste répond 403, y compris si une URL
 * remonte l'arborescence avec des `..`.
 *
 * Ce que Chromium ne sait pas décoder — HEVC, AVI, et les pistes de sous-titres
 * embarquées dans un MKV — part vers le lecteur du système. Mieux vaut une
 * délégation franche qu'un lecteur qui affiche un carré noir.
 */

import { createReadStream, existsSync, statSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { BrowserWindow, dialog, protocol, shell } from 'electron'
import type { LocalEpisode, LocalFolder } from '@shared/types'
import {
  episodeFromName,
  extensionOf,
  isVideo,
  PLAYABLE_EXTENSIONS,
  srtToVtt,
  subtitleTwin
} from '@shared/episode-files'
import { resumePoint } from '@shared/playback'
import { allFolders, clearPosition, getFolder, positionsFor, setPosition, setFolder } from './store'

export const MEDIA_SCHEME = 'animelist-media'

/** Un seul sous-dossier de profondeur : « Saison 1 », « VOSTFR », et c'est tout. */
const MAX_DEPTH = 1

const MIME: Record<string, string> = {
  '.mkv': 'video/x-matroska',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.vtt': 'text/vtt',
  '.srt': 'text/vtt'
}

function mediaUrl(path: string, subtitle = false): string {
  return `${MEDIA_SCHEME}://serve/?p=${encodeURIComponent(path)}${subtitle ? '&sub=1' : ''}`
}

/**
 * Le seul contrôle qui compte : le chemin demandé doit être sous un dossier que
 * l'utilisateur a lui-même désigné. `relative` répond aux `..` mieux qu'un
 * `startsWith`, qui laisserait passer `/photos-prive` pour `/photos`.
 */
function isAllowed(path: string): boolean {
  const target = resolve(path)
  return allFolders().some((folder) => {
    const rel = relative(resolve(folder), target)
    return rel !== '' && !rel.startsWith('..') && !rel.startsWith(`..${sep}`)
  })
}

async function filesUnder(folder: string, depth = 0): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])
  const found: string[] = []
  for (const entry of entries) {
    const full = join(folder, entry.name)
    if (entry.isDirectory()) {
      if (depth < MAX_DEPTH) found.push(...(await filesUnder(full, depth + 1)))
    } else {
      found.push(full)
    }
  }
  return found
}

export async function scanFolder(animeId: number): Promise<LocalFolder | null> {
  const folder = getFolder(animeId)
  if (!folder) return null
  if (!existsSync(folder)) return { path: folder, missing: true, episodes: [] }

  const paths = await filesUnder(folder)
  const names = paths.map((p) => p.slice(p.lastIndexOf(sep) + 1))
  const held = positionsFor(paths)

  const episodes: LocalEpisode[] = paths
    .filter((p) => isVideo(p))
    .map((path) => {
      const name = path.slice(path.lastIndexOf(sep) + 1)
      // Les sous-titres voisins se cherchent dans le même dossier que la vidéo,
      // pas dans tout l'arbre : deux saisons peuvent avoir un « 01.srt ».
      const sameDir = names.filter(
        (_, i) => paths[i].slice(0, paths[i].lastIndexOf(sep)) === path.slice(0, path.lastIndexOf(sep))
      )
      const twin = subtitleTwin(name, sameDir)
      const dir = path.slice(0, path.lastIndexOf(sep))
      const pos = held[path]
      return {
        episode: episodeFromName(name),
        name,
        path,
        url: mediaUrl(path),
        playable: PLAYABLE_EXTENSIONS.includes(extensionOf(name)),
        subtitleUrl: twin ? mediaUrl(join(dir, twin), true) : null,
        size: statSync(path).size,
        resumeAt: resumePoint(pos),
        duration: pos?.duration ?? null
      }
    })
    .sort((a, b) => (a.episode ?? 1e9) - (b.episode ?? 1e9) || a.name.localeCompare(b.name))

  return { path: folder, missing: false, episodes }
}

export async function chooseFolder(animeId: number): Promise<LocalFolder | null> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const picked = await dialog.showOpenDialog(win, {
    title: 'Dossier des épisodes',
    properties: ['openDirectory'],
    defaultPath: getFolder(animeId) ?? undefined
  })
  if (picked.canceled || !picked.filePaths[0]) return scanFolder(animeId)
  setFolder(animeId, picked.filePaths[0])
  return scanFolder(animeId)
}

export function forgetFolder(animeId: number): void {
  setFolder(animeId, null)
}

/**
 * Retient où en est la lecture d'un fichier.
 *
 * Le chemin passe par le même contrôle que la lecture elle-même : la fenêtre
 * ne doit pas pouvoir faire écrire une ligne pour un fichier qu'elle n'a pas
 * le droit de lire.
 */
export function rememberPosition(path: string, at: number, duration: number): boolean {
  if (!isAllowed(path)) return false
  setPosition(path, at, duration)
  return true
}

/** Oublie la reprise : l'épisode est fini, ou on veut le reprendre du début. */
export function forgetPosition(path: string): boolean {
  if (!isAllowed(path)) return false
  clearPosition(path)
  return true
}

/** Pour ce que Chromium ne sait pas lire : on passe la main au système. */
export async function openInSystemPlayer(path: string): Promise<boolean> {
  if (!isAllowed(path)) return false
  const error = await shell.openPath(path)
  return error === ''
}

/**
 * Doit être appelé avant `app.whenReady`, sinon le protocole n'est pas
 * considéré comme sûr et le lecteur refuse d'y chercher un flux.
 */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false }
    }
  ])
}

export function serveMedia(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const url = new URL(request.url)
    const path = url.searchParams.get('p')
    if (!path || !isAllowed(path) || !existsSync(path)) return new Response('', { status: 403 })

    const ext = extname(path).toLowerCase()

    // Le SubRip se convertit à la volée : la balise <track> ne lit que du WebVTT.
    if (url.searchParams.get('sub')) {
      const raw = await readFile(path, 'utf8').catch(() => null)
      if (raw === null) return new Response('', { status: 404 })
      const vtt = ext === '.srt' ? srtToVtt(raw) : raw
      return new Response(vtt, { headers: { 'Content-Type': 'text/vtt; charset=utf-8' } })
    }

    const type = MIME[ext] ?? 'application/octet-stream'
    const size = statSync(path).size
    const range = request.headers.get('Range')

    // Sans les requêtes par plage, déplacer le curseur dans un fichier de deux
    // gigaoctets obligerait à le relire depuis le début.
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range)
      const start = match?.[1] ? Number(match[1]) : 0
      const end = match?.[2] ? Number(match[2]) : size - 1
      if (start >= size) return new Response('', { status: 416 })
      const stream = createReadStream(path, { start, end })
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          'Content-Type': type,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes'
        }
      })
    }

    return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
      headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' }
    })
  })
}
