/**
 * La télécommande : piloter l'app depuis un téléphone, sur le même réseau.
 *
 * Un petit serveur et une page unique. Depuis le canapé : voir ce qu'il y a à
 * reprendre, cocher un épisode, ou faire ouvrir une fiche sur le PC.
 *
 * **Éteint par défaut, et c'est délibéré.** Allumer, c'est exposer sa
 * bibliothèque à tout ce qui est branché sur la même box. Trois garde-fous,
 * dans cet ordre d'importance :
 *
 * 1. Un mot de passe tiré au hasard à chaque allumage, exigé sur tout ce qui
 *    touche à la bibliothèque, comparé à durée constante.
 * 2. Une liste fermée de quatre adresses. Aucun chemin n'est jamais traduit en
 *    fichier, donc rien du disque ne peut fuir par une remontée
 *    d'arborescence.
 * 3. Aucune permission d'écriture au-delà de « cocher un épisode ». Pas de
 *    suppression, pas de réglages, pas d'export.
 *
 * Il n'y a pas de chiffrement : c'est du HTTP en clair sur le réseau local. Ça
 * suffit chez soi et pas ailleurs — d'où le refus catégorique d'ouvrir ça sur
 * autre chose qu'une adresse privée.
 */

import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import { BrowserWindow } from 'electron'
import { makeToken, needsToken, REMOTE_PORT, remoteUrl, routeOf, safeEqual, tokenFrom } from '@shared/remote'
import { nextEpisode } from '@shared/resume'
import { setWatched, snapshot } from './store'
import { page } from './remote-page'

export interface RemoteStatus {
  on: boolean
  url: string | null
  token: string | null
  port: number
  error: string | null
}

let server: Server | null = null
let token = ''
let status: RemoteStatus = { on: false, url: null, token: null, port: REMOTE_PORT, error: null }

/** Le corps d'une requête, plafonné : rien ici n'a besoin d'être gros. */
async function readBody(req: IncomingMessage, max = 4096): Promise<string> {
  let out = ''
  for await (const chunk of req) {
    out += chunk
    if (out.length > max) throw new Error('corps trop gros')
  }
  return out
}

function json(res: ServerResponse, code: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    // La page ne parle qu'à son propre serveur : aucune raison qu'un site
    // ouvert à côté puisse l'interroger depuis le navigateur du téléphone.
    'Access-Control-Allow-Origin': 'null',
    'Cache-Control': 'no-store'
  })
  res.end(payload)
}

/** Ce que la télécommande montre : les séries en cours, et où on en est. */
function remoteState(): unknown {
  const data = snapshot()
  const media = new Map(data.media.map((m) => [m.id, m]))

  const seen = new Map<number, Set<number>>()
  for (const ev of data.history) {
    const held = seen.get(ev.animeId) ?? new Set<number>()
    held.add(ev.episode)
    seen.set(ev.animeId, held)
  }

  const rows = []
  for (const entry of data.entries) {
    if (entry.status !== 'watching') continue
    const found = media.get(entry.animeId)
    if (!found) continue
    const episode = nextEpisode(seen.get(entry.animeId), found.episodes)
    if (episode === null) continue
    rows.push({
      id: entry.animeId,
      title: found.title.english ?? found.title.romaji,
      cover: found.cover.large,
      episode,
      total: found.episodes,
      seen: seen.get(entry.animeId)?.size ?? 0,
      updatedAt: entry.updatedAt
    })
  }

  rows.sort((a, b) => b.updatedAt - a.updatedAt)
  return { series: rows }
}

/**
 * Les adresses privées de cette machine.
 *
 * Sert à afficher celle qu'il faut taper sur le téléphone — et à refuser de
 * démarrer si la machine n'en a aucune, auquel cas le serveur ne serait
 * joignable que depuis l'extérieur.
 */
export function localAddresses(): string[] {
  const out: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family !== 'IPv4' || net.internal) continue
      // Seulement les plages privées : 10/8, 172.16/12, 192.168/16.
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(net.address)) out.push(net.address)
    }
  }
  return out
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? '/'
  const pathname = url.split('?')[0]
  const route = routeOf(pathname)

  if (route === 'unknown') return json(res, 404, { error: 'Adresse inconnue.' })

  if (route === 'page') {
    const html = page()
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html),
      'Cache-Control': 'no-store'
    })
    res.end(html)
    return
  }

  if (needsToken(route)) {
    const given = tokenFrom(url, req.headers.authorization)
    if (!given || !safeEqual(given, token)) return json(res, 401, { error: 'Mot de passe incorrect.' })
  }

  if (route === 'state') return json(res, 200, remoteState())

  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode refusée.' })

  let body: { id?: number; episode?: number }
  try {
    body = JSON.parse((await readBody(req)) || '{}') as typeof body
  } catch {
    return json(res, 400, { error: 'Requête illisible.' })
  }

  const id = Number(body.id)
  if (!Number.isInteger(id) || id <= 0) return json(res, 400, { error: 'Série inconnue.' })

  if (route === 'tick') {
    const episode = Number(body.episode)
    if (!Number.isInteger(episode) || episode <= 0) return json(res, 400, { error: 'Épisode inconnu.' })
    setWatched(id, episode, true)
    return json(res, 200, remoteState())
  }

  // `open` : la seule action qui touche la fenêtre plutôt que les données.
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore()
    win.focus()
    win.webContents.send('nav:open-anime', id)
  }
  return json(res, 200, { ok: true })
}

export function remoteStatus(): RemoteStatus {
  return status
}

/** Allume le serveur. Un nouveau mot de passe à chaque fois. */
export function startRemote(port = REMOTE_PORT): Promise<RemoteStatus> {
  return new Promise((resolve) => {
    if (server) {
      resolve(status)
      return
    }

    const hosts = localAddresses()
    if (!hosts.length) {
      status = { on: false, url: null, token: null, port, error: 'Aucun réseau local détecté sur cette machine.' }
      resolve(status)
      return
    }

    token = makeToken(randomBytes(64))
    const next = createServer((req, res) => {
      void handle(req, res).catch(() => {
        if (!res.headersSent) json(res, 500, { error: 'Erreur interne.' })
      })
    })

    next.on('error', (err) => {
      server = null
      status = { on: false, url: null, token: null, port, error: err.message }
      resolve(status)
    })

    next.listen(port, '0.0.0.0', () => {
      server = next
      status = { on: true, url: remoteUrl(hosts[0], port, token), token, port, error: null }
      resolve(status)
    })
  })
}

export function stopRemote(): RemoteStatus {
  server?.close()
  server = null
  // Le mot de passe meurt avec le serveur : le rallumage en tire un neuf, si
  // bien qu'une adresse notée hier ne rouvre rien aujourd'hui.
  token = ''
  status = { on: false, url: null, token: null, port: status.port, error: null }
  return status
}
