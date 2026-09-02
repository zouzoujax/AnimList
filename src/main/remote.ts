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
import { canTick, isUnaired } from '@shared/airing'
import { searchTitles } from '@shared/titles'
import { resolve as resolveAnimeSama } from './animesama'
import { openTrailerWindow } from './trailer'
import { openAnimeSamaEpisode } from './watch-window'
import { playerCommand, playerState, type PlayerAction } from './playing'
import { setWatched, snapshot } from './store'
import { page } from './remote-page'

export interface RemoteStatus {
  on: boolean
  url: string | null
  token: string | null
  port: number
  error: string | null
}

/**
 * La série qu'on vient de lancer.
 *
 * Le titre d'une fenêtre ne dit pas grand-chose — celle d'Anime-Sama s'appelle
 * « Anime-Sama », rien de plus. Retenir ce qu'on a lancé permet à la
 * télécommande d'afficher la bonne jaquette et le bon épisode au lieu d'un
 * nom de fenêtre.
 */
let launched: { title: string; cover: string; episode: number | null } | null = null

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
async function remoteState(): Promise<unknown> {
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
      // La série reste dans la liste, mais sans bouton : savoir qu'il n'y a
      // rien à regarder ce soir est une réponse, la masquer n'en est pas une.
      unaired: isUnaired(found, episode),
      airingAt: found.nextAiring?.airingAt ?? null,
      // La bande-annonce se sait d'avance ; l'adresse de lecture demande une
      // résolution réseau, faite seulement au moment où on la réclame.
      trailer: !!found.trailer?.id,
      updatedAt: entry.updatedAt
    })
  }

  rows.sort((a, b) => b.updatedAt - a.updatedAt)
  // Ce qui joue en ce moment sur le PC, pour que le téléphone puisse le
  // piloter sans avoir à demander séparément.
  return { series: rows, player: await nowPlaying() }
}

/** L'état du lecteur, complété par ce qu'on sait de la série lancée. */
async function nowPlaying(): Promise<unknown> {
  const state = await playerState()
  if (!state) {
    launched = null
    return null
  }
  return launched ? { ...state, ...launched } : state
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

  if (route === 'state') return json(res, 200, await remoteState())

  /**
   * L'état du lecteur seul.
   *
   * Le téléphone le relit toutes les deux secondes pour faire avancer le
   * curseur : passer par `/api/state` relirait la bibliothèque entière —
   * entrées, fiches et journal — à ce rythme-là, pour trois nombres.
   */
  if (route === 'player') return json(res, 200, { player: await nowPlaying() })

  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode refusée.' })

  let body: { id?: number; episode?: number; action?: string; value?: number }
  try {
    body = JSON.parse((await readBody(req)) || '{}') as typeof body
  } catch {
    return json(res, 400, { error: 'Requête illisible.' })
  }

  if (route === 'control') {
    const action = String(body.action ?? '') as PlayerAction
    const allowed: PlayerAction[] = ['play', 'pause', 'seek', 'volume', 'fullscreen', 'windowed', 'close']
    if (!allowed.includes(action)) return json(res, 400, { error: 'Commande inconnue.' })

    const done = await playerCommand(action, Number(body.value))
    if (!done) return json(res, 409, { error: 'Rien à piloter, ou commande hors de portée de ce lecteur.' })
    return json(res, 200, { player: await nowPlaying() })
  }

  const id = Number(body.id)
  if (!Number.isInteger(id) || id <= 0) return json(res, 400, { error: 'Série inconnue.' })

  if (route === 'tick') {
    const episode = Number(body.episode)
    if (!Number.isInteger(episode) || episode <= 0) return json(res, 400, { error: 'Épisode inconnu.' })

    /**
     * Le refus est ici, pas seulement dans la page.
     *
     * Une page restée ouverte depuis hier propose encore l'épisode d'hier ; et
     * rien n'oblige quiconque sur le réseau à passer par notre page. Un écran
     * qui cache un bouton n'a jamais protégé une écriture.
     */
    const media = snapshot().media.find((m) => m.id === id)
    const already = snapshot().history.some((ev) => ev.animeId === id && ev.episode === episode)
    if (media && !canTick(media, episode, already)) {
      return json(res, 409, { error: `L’épisode ${episode} n’est pas encore sorti.` })
    }

    setWatched(id, episode, true)
    return json(res, 200, await remoteState())
  }

  // Les actions qui touchent la machine plutôt que les données. Toutes
  // passent par le mot de passe : ouvrir une fenêtre sur le PC de quelqu'un
  // est au moins aussi intrusif que lire sa liste.
  const win = BrowserWindow.getAllWindows()[0]
  if (!win || win.isDestroyed()) return json(res, 409, { error: 'Aucune fenêtre ouverte sur le PC.' })

  const media = snapshot().media.find((m) => m.id === id)
  if (!media) return json(res, 404, { error: 'Série inconnue.' })

  if (route === 'trailer') {
    const video = media.trailer?.id
    if (!video) return json(res, 404, { error: 'Pas de bande-annonce pour cette série.' })
    const opened = await openTrailerWindow(win, video, media.title.english ?? media.title.romaji)
    return opened ? json(res, 200, { ok: true }) : json(res, 502, { error: 'La bande-annonce n’a pas pu s’ouvrir.' })
  }

  if (route === 'watch') {
    /**
     * L'adresse est résolue ici, pas gardée dans l'état.
     *
     * La résolution interroge le site : la faire pour toute la liste à chaque
     * rafraîchissement coûterait une requête par série toutes les vingt
     * secondes, pour des adresses dont une seule sera ouverte.
     */
    const target = await resolveAnimeSama(id, searchTitles(media.title)).catch(() => null)
    if (!target?.url) return json(res, 404, { error: 'Série introuvable sur Anime-Sama.' })

    // Seule une adresse portant un menu d'épisodes peut être positionnée ;
    // ailleurs on ouvre la page telle quelle plutôt que de viser à côté.
    const episode = Number(body.episode)
    const at = target.episodes && Number.isInteger(episode) && episode > 0 ? episode : null
    const opened = openAnimeSamaEpisode(target.url, at)
    if (!opened) return json(res, 502, { error: 'Le lecteur n’a pas pu s’ouvrir.' })
    launched = { title: media.title.english ?? media.title.romaji, cover: media.cover.large, episode: at }
    return json(res, 200, { player: await nowPlaying() })
  }

  // `open` : la fiche, sur le PC.
  if (win.isMinimized()) win.restore()
  win.focus()
  win.webContents.send('nav:open-anime', id)
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
