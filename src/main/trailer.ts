/**
 * Serves trailers to the app.
 *
 * ## Why a local server at all
 *
 * YouTube's embedded player refuses to start when the page embedding it sends no
 * `Referer` — it answers *error 153*. The renderer is loaded from `file://`,
 * which sends none. Measured, not assumed: loading the embed URL as a top-level
 * page fails identically, because that sends no referrer either.
 *
 * So the player is wrapped in a one-page document served from
 * `http://127.0.0.1:<port>`. The renderer frames *that*, the browser sends a
 * truthful `Referer` for a page which genuinely is embedding the video, and the
 * player runs — inline on the anime's page, no separate window needed.
 *
 * Nothing is spoofed. The alternative, forcing an `httpReferrer` of
 * `youtube.com`, would be claiming an origin that is not ours.
 *
 * ## What keeps this narrow
 *
 * - Bound to `127.0.0.1` on an ephemeral port, behind a random path segment.
 * - Serves exactly one kind of page and nothing from disk.
 * - The video id is validated against YouTube's alphabet before it is ever
 *   interpolated, and the title is HTML-escaped.
 * - The page ships its own CSP: it may frame YouTube and nothing else, and runs
 *   no script of its own.
 * - `src/main/index.ts` allows `frame-src http://127.0.0.1:*` for the app
 *   document, and scopes its CSP injection to the main frame — forcing the app's
 *   `script-src 'self'` onto YouTube's own document silently broke the player,
 *   which is what made the first attempt render black.
 *
 * Some uploaders disable embedding. The player then shows its own message with a
 * link, which opens in the real browser.
 */

import { BrowserWindow, app, shell } from 'electron'
import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'

/** YouTube ids are 11 characters of a fixed alphabet; anything else is refused. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

const ALLOWED_HOSTS = new Set([
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  'm.youtube.com'
])

let server: Server | null = null
let port = 0
let secret = ''
let popout: BrowserWindow | null = null

/** Escapes what could break out of an HTML attribute. */
const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`).slice(0, 160)

/**
 * Le pont entre la télécommande et le lecteur de YouTube.
 *
 * `enablejsapi=1` ouvre un dialogue par `postMessage` avec le lecteur : on lui
 * envoie des commandes, il renvoie sa position, sa durée et son volume. C'est
 * ce qui permet à un téléphone de piloter une vidéo qui joue sur le PC.
 *
 * Rien n'est chargé de chez YouTube pour autant : leur bibliothèque
 * `iframe_api` ferait exactement le même dialogue, en imposant un script tiers
 * dans une page dont la politique de sécurité n'en autorise aucun.
 *
 * L'état est relevé au passage plutôt que demandé : le lecteur émet sa
 * position en continu dès qu'on s'est déclaré à l'écoute, et le curseur du
 * téléphone n'a qu'à lire la dernière valeur connue.
 */
function page(videoId: string, title: string, nonce: string): string {
  const src = `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&autoplay=1&rel=0&modestbranding=1&iv_load_policy=3`
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src https://www.youtube-nocookie.com; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'">
<title>${title}</title>
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden }
  iframe { display: block; border: 0; width: 100%; height: 100% }
</style>
</head>
<body>
<iframe id="p" src="${src}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen title="${title}"></iframe>
<script nonce="${nonce}">
  var frame = document.getElementById('p')
  var state = { position: 0, duration: 0, volume: 100, muted: false, playing: true }

  function send(func, args) {
    frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: args || [] }), '*')
  }

  // Se déclarer à l'écoute : sans ça le lecteur n'émet rien, et la position
  // resterait inconnue.
  frame.addEventListener('load', function () {
    frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*')
  })

  window.addEventListener('message', function (e) {
    if (typeof e.data !== 'string') return
    var msg
    try { msg = JSON.parse(e.data) } catch (err) { return }
    var info = msg && msg.info
    if (!info) return
    if (typeof info.currentTime === 'number') state.position = info.currentTime
    if (typeof info.duration === 'number' && info.duration > 0) state.duration = info.duration
    if (typeof info.volume === 'number') state.volume = info.volume
    if (typeof info.muted === 'boolean') state.muted = info.muted
    // 1 = en lecture, 2 = en pause. Le reste — mise en mémoire tampon, fin —
    // ne dit rien de l'intention de l'utilisateur.
    if (info.playerState === 1) state.playing = true
    if (info.playerState === 2) state.playing = false
  })

  window.__player = function () { return state }
  window.__cmd = function (action, value) {
    if (action === 'play') { send('playVideo'); state.playing = true }
    else if (action === 'pause') { send('pauseVideo'); state.playing = false }
    else if (action === 'seek') { send('seekTo', [value, true]); state.position = value }
    else if (action === 'volume') { send('setVolume', [value]); state.volume = value; if (value > 0) send('unMute') }
    else return false
    return true
  }
</script>
</body>
</html>`
}

/** Starts the server on first use; later calls reuse it. */
async function ensureServer(): Promise<boolean> {
  if (server && port) return true

  secret = randomUUID()
  server = createServer((req, res) => {
    // `/<secret>/<videoId>?t=<title>`
    const [, path = '', query = ''] = /^\/([^?]*)\??(.*)$/.exec(req.url ?? '') ?? []
    const [givenSecret, videoId] = path.split('/')

    if (givenSecret !== secret || !VIDEO_ID.test(videoId ?? '')) {
      res.writeHead(404).end()
      return
    }

    const title = escapeHtml(new URLSearchParams(query).get('t') ?? 'Bande-annonce')
    // Un nonce par page : le script est le nôtre, et lui seul peut s'exécuter.
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(page(videoId, title, randomUUID()))
  })

  port = await new Promise<number>((resolve, reject) => {
    server?.once('error', reject)
    server?.listen(0, '127.0.0.1', () => {
      const address = server?.address()
      resolve(typeof address === 'object' && address ? address.port : 0)
    })
  }).catch(() => 0)

  if (!port) {
    server?.close()
    server = null
    return false
  }
  return true
}

/**
 * The URL the renderer can put in an iframe, or `null` when the id is unusable
 * or the port would not bind.
 */
export async function trailerUrl(videoId: string, title: string): Promise<string | null> {
  if (!VIDEO_ID.test(videoId)) return null
  if (!(await ensureServer())) return null
  return `http://127.0.0.1:${port}/${secret}/${videoId}?t=${encodeURIComponent(title || 'Bande-annonce')}`
}

/** Opens the same player in its own window, for a bigger view. */
export async function openTrailerWindow(parent: BrowserWindow, videoId: string, title: string): Promise<boolean> {
  const url = await trailerUrl(videoId, title)
  if (!url) return false

  popout?.destroy()
  popout = new BrowserWindow({
    parent,
    width: 1120,
    // 16:9 plus the title bar.
    height: 660,
    show: false,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: title || 'Bande-annonce',
    webPreferences: { partition: 'trailer', contextIsolation: true, nodeIntegration: false, sandbox: true }
  })

  popout.setMenuBarVisibility(false)

  popout.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//i.test(target)) void shell.openExternal(target)
    return { action: 'deny' }
  })

  popout.webContents.on('will-navigate', (event, target) => {
    let host: string
    try {
      host = new URL(target).host
    } catch {
      host = ''
    }
    if (host === `127.0.0.1:${port}` || ALLOWED_HOSTS.has(host)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(target)) void shell.openExternal(target)
  })

  popout.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault()
      popout?.close()
    }
  })

  popout.once('ready-to-show', () => popout?.show())
  popout.on('closed', () => (popout = null))

  await popout.loadURL(url)
  return true
}

export function closeTrailerWindow(): void {
  popout?.close()
}

/** La fenêtre de bande-annonce, pour qui doit la piloter. `null` si fermée. */
export function trailerWindow(): BrowserWindow | null {
  return popout && !popout.isDestroyed() ? popout : null
}

/** Releases the port when the app quits. */
app.on('before-quit', () => {
  server?.close()
  server = null
  port = 0
})
