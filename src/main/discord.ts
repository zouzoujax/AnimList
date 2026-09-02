/**
 * Le statut Discord : annoncer l'anime qu'on est en train de regarder.
 *
 * Discord ne s'atteint pas par le réseau. Le client ouvre un **tube nommé** sur
 * la machine — `\\?\pipe\discord-ipc-0` sous Windows — et écoute un protocole
 * binaire minuscule : quatre octets pour l'opération, quatre pour la longueur,
 * puis du JSON. Aucune bibliothèque n'est nécessaire, et aucune n'est
 * installée : la moitié de celles qui existent embarquent un binaire natif pour
 * faire ces douze lignes.
 *
 * **Éteint par défaut, et sans identifiant embarqué par obligation.** Le statut
 * est la seule chose de cette app qui sorte du PC de sa propre initiative :
 * tous ceux qui voient ton profil verront le titre. Ça se décide, ça ne
 * s'hérite pas d'une installation.
 *
 * Trois points mesurés contre le vrai client, pas supposés :
 *
 * - une poignée de main avec un identifiant invalide se solde par
 *   `{"code":4000,"message":"Invalid Client ID"}` sur l'opération 2 — c'est
 *   ce qui permet de dire *pourquoi* ça ne marche pas plutôt que de rester
 *   muet ;
 * - `type: 3` est conservé tel quel, et c'est lui qui affiche « Regarde »
 *   devant le nom de l'application, dans la langue du lecteur ;
 * - une jaquette AniList passée en `large_image` revient réécrite en
 *   `mp:external/…`, donc Discord la relaie lui-même : rien à téléverser dans
 *   leur portail, et une nouvelle série ne demande aucun réglage.
 *
 * Quand Discord n'est pas lancé, il n'y a pas de tube et la connexion échoue
 * immédiatement. Ce n'est pas une panne — c'est le cas courant. On repasse
 * toutes les quinze secondes, en silence.
 */

import { connect, type Socket } from 'node:net'
import { randomUUID } from 'node:crypto'
import {
  activityOf,
  looksLikeAppId,
  sameActivity,
  OP_CLOSE,
  OP_FRAME,
  OP_HANDSHAKE,
  OP_PING,
  OP_PONG,
  PIPE_COUNT,
  type Activity,
  type DiscordStatus,
  type Watching
} from '@shared/discord'
import { getLaunched, getLocalWatching } from './now'
import { playerState } from './playing'
import { getMedia, getPrefs } from './store'

/** Assez souvent pour suivre une pause, assez rare pour ne rien coûter. */
const POLL_MS = 5000

/**
 * Discord limite les changements d'activité à cinq par vingt secondes. Le
 * plancher garde une marge : dépasser ferait ignorer l'envoi, pas ralentir.
 */
const MIN_GAP_MS = 4500

/** Discord fermé est le cas courant, pas une erreur : on repasse sans bruit. */
const RETRY_MS = 15_000

let sock: Socket | null = null
let ready = false
let wanted = false
let appId = ''
let rest = Buffer.alloc(0)
let poll: NodeJS.Timeout | null = null
let retry: NodeJS.Timeout | null = null
let sent: Activity | null = null
let sentAt = 0
let error: string | null = null

/**
 * Le chemin du tube.
 *
 * Windows préfixe ses tubes ; ailleurs c'est un fichier de socket dans le
 * dossier d'exécution de la session. L'app ne vise que Windows, mais la
 * poignée de lignes que coûte l'autre cas évite un plantage si elle est
 * lancée en développement sur autre chose.
 */
function pipePath(index: number): string {
  if (process.platform === 'win32') return `\\\\?\\pipe\\discord-ipc-${index}`
  const dir = process.env.XDG_RUNTIME_DIR ?? process.env.TMPDIR ?? '/tmp'
  return `${dir}/discord-ipc-${index}`
}

/** Une trame : l'opération, la longueur, puis le corps. Tout en petit-boutiste. */
function encode(op: number, payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  const head = Buffer.alloc(8)
  head.writeInt32LE(op, 0)
  head.writeInt32LE(body.length, 4)
  return Buffer.concat([head, body])
}

function send(op: number, payload: unknown): void {
  if (!sock || sock.destroyed) return
  // Une écriture peut échouer entre deux tours — le client vient de se fermer.
  // L'événement `error` fera le ménage ; ici on ne veut pas jeter.
  try {
    sock.write(encode(op, payload))
  } catch {
    /* la fermeture est traitée par `close` */
  }
}

/** Coupe proprement et repasse plus tard, tant que le réglage est allumé. */
function drop(message: string | null): void {
  if (sock) {
    sock.removeAllListeners()
    sock.destroy()
    sock = null
  }
  ready = false
  rest = Buffer.alloc(0)
  sent = null
  if (message) error = message
  if (!wanted || retry) return
  retry = setTimeout(() => {
    retry = null
    if (wanted) open(0)
  }, RETRY_MS)
}

function onFrame(op: number, body: string): void {
  if (op === OP_PING) return send(OP_PONG, body ? safeParse(body) : {})
  if (op === OP_CLOSE) {
    const payload = safeParse(body) as { message?: string } | null
    // Le message vient de chez eux et vaut mieux que le nôtre : « Invalid
    // Client ID » dit exactement quoi corriger dans les réglages.
    return drop(payload?.message ?? 'Discord a fermé la connexion.')
  }
  if (op !== OP_FRAME) return

  const payload = safeParse(body) as { evt?: string; data?: { message?: string } } | null
  if (!payload) return
  if (payload.evt === 'READY') {
    ready = true
    error = null
    // L'activité précédente appartenait à une connexion morte : Discord ne
    // l'a plus, il faut la renvoyer.
    sent = null
    void tick()
    return
  }
  if (payload.evt === 'ERROR') error = payload.data?.message ?? 'Discord a refusé la commande.'
}

function safeParse(body: string): unknown {
  try {
    return JSON.parse(body) as unknown
  } catch {
    return null
  }
}

function onData(chunk: Buffer): void {
  rest = Buffer.concat([rest, chunk])
  // Une trame peut arriver coupée en deux, ou deux trames d'un coup : on ne
  // traite que ce qui est complet, et on garde le reste pour le tour suivant.
  while (rest.length >= 8) {
    const op = rest.readInt32LE(0)
    const length = rest.readInt32LE(4)
    if (rest.length < 8 + length) break
    const body = rest.subarray(8, 8 + length).toString('utf8')
    rest = rest.subarray(8 + length)
    onFrame(op, body)
  }
}

/**
 * Ouvre le premier tube qui répond.
 *
 * Le premier client lancé prend `discord-ipc-0`, le suivant `-1` : quelqu'un
 * qui fait tourner la version stable et Canary côte à côte n'a pas forcément
 * la première libre. On les essaie dans l'ordre, et l'échec du dernier signifie
 * simplement que Discord n'est pas ouvert.
 */
function open(index: number): void {
  if (!wanted) return
  if (index >= PIPE_COUNT) return drop('Discord n’a pas l’air ouvert.')

  const socket = connect(pipePath(index))

  socket.once('error', () => {
    socket.removeAllListeners()
    socket.destroy()
    open(index + 1)
  })

  socket.once('connect', () => {
    socket.removeAllListeners()
    sock = socket
    rest = Buffer.alloc(0)
    socket.on('data', onData)
    socket.on('error', (err: Error) => drop(err.message))
    socket.on('close', () => drop(null))
    send(OP_HANDSHAKE, { v: 1, client_id: appId })
  })
}

/**
 * Ce qu'on regarde, quel qu'en soit le lecteur.
 *
 * Le lecteur intégré passe devant : il est le seul à connaître sa pause et sa
 * position sans qu'on ait à interroger une page. Les fenêtres extérieures
 * viennent ensuite, et il faut leur demander.
 */
async function whatIsPlaying(): Promise<Watching | null> {
  const local = getLocalWatching()
  if (local) {
    const media = getMedia(local.animeId)
    return {
      title: local.title,
      episode: local.episode,
      total: media?.episodes ?? null,
      cover: media?.cover.large ?? null,
      position: local.position,
      duration: local.duration,
      paused: local.paused
    }
  }

  const state = await playerState()
  if (!state) return null

  // Le titre d'une fenêtre ne dit rien — celle d'Anime-Sama s'appelle
  // « Anime-Sama ». Ce qu'on a lancé, si.
  const launched = getLaunched()
  return {
    title: launched?.title ?? state.title,
    episode: launched?.episode ?? null,
    total: null,
    cover: launched?.cover ?? null,
    position: state.position,
    duration: state.duration,
    paused: !state.playing,
    note: launched?.note
  }
}

async function tick(): Promise<void> {
  if (!ready || !sock) return

  const activity = activityOf(await whatIsPlaying(), { hideTitle: getPrefs().discordHideTitle })
  if (sameActivity(activity, sent)) return
  // Trop tôt : on ne force pas, le tour suivant reverra la même différence.
  if (Date.now() - sentAt < MIN_GAP_MS) return

  sent = activity
  sentAt = Date.now()
  send(OP_FRAME, { cmd: 'SET_ACTIVITY', nonce: randomUUID(), args: { pid: process.pid, activity } })
}

/**
 * Aligne le statut sur les réglages.
 *
 * Appelée au démarrage et à chaque changement, elle est la seule porte : rien
 * d'autre n'allume ni n'éteint, et l'état ne peut donc pas diverger de ce qui
 * est coché.
 */
export function applyDiscord(): void {
  const prefs = getPrefs()
  const id = prefs.discordAppId.trim()
  if (!prefs.discord || !looksLikeAppId(id)) return stopDiscord()

  // Déjà en route sur le bon identifiant : ne rien casser. Un décochage suivi
  // d'un recochage passerait par `stopDiscord`, donc par un vrai redémarrage.
  if (wanted && id === appId) return void tick()

  stopDiscord()
  wanted = true
  appId = id
  error = null
  open(0)
  poll = setInterval(() => void tick(), POLL_MS)
}

/** Éteint, en retirant d'abord le statut : sinon il resterait affiché. */
export function stopDiscord(): void {
  wanted = false
  if (poll) {
    clearInterval(poll)
    poll = null
  }
  if (retry) {
    clearTimeout(retry)
    retry = null
  }
  if (sock && ready) {
    send(OP_FRAME, { cmd: 'SET_ACTIVITY', nonce: randomUUID(), args: { pid: process.pid, activity: null } })
    // `end` écoule ce qui est en attente avant de fermer : l'effacement part.
    sock.end()
    sock.removeAllListeners()
    sock = null
  }
  ready = false
  sent = null
  error = null
  drop(null)
}

export function discordStatus(): DiscordStatus {
  return { on: wanted, connected: ready, error }
}
