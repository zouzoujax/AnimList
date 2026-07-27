/**
 * Plays a trailer inside the app.
 *
 * ## Why this is not just an iframe
 *
 * YouTube's embedded player refuses to start when the embedding page sends no
 * `Referer` — it answers *error 153*. The renderer is loaded from `file://`,
 * which sends none, so an in-page iframe cannot work. Measured, not assumed:
 * loading the embed as a top-level page fails the same way, because that sends
 * no referrer either.
 *
 * So the trailer opens in its own window whose document is served from
 * `http://127.0.0.1:<port>`. That page holds the iframe, the browser sends a
 * truthful `Referer` for a page that genuinely is embedding the video, and the
 * player runs. Nothing is spoofed — the alternative, forcing a fake
 * `httpReferrer` of `youtube.com`, would be claiming an origin we are not.
 *
 * ## Constraints this respects
 *
 * - The server binds to `127.0.0.1` on an ephemeral port, serves exactly one
 *   page behind a random path, and shuts down with the window.
 * - The window uses its own session partition, so the app's global CSP hook —
 *   which sets `frame-src 'none'` — does not apply to it, and no cookie from
 *   YouTube is written into the app's own session.
 * - No preload, no node integration, sandboxed: this window runs third-party
 *   web content and gets none of the app's bridge.
 * - Some uploaders disable embedding. The player then shows its own error with a
 *   "watch on YouTube" link, which opens in the real browser.
 */

import { BrowserWindow, shell } from 'electron'
import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'

/** YouTube ids are 11 characters of a fixed alphabet; anything else is rejected. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

const ALLOWED_HOSTS = new Set([
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  'm.youtube.com'
])

let win: BrowserWindow | null = null
let server: Server | null = null

function shutdown(): void {
  server?.close()
  server = null
}

function page(videoId: string, title: string): string {
  const src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3`
  // The page's own CSP: it may frame YouTube and nothing else, and it runs no
  // script of its own.
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src https://www.youtube-nocookie.com; style-src 'unsafe-inline'">
<title>${title}</title>
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden }
  iframe { display: block; border: 0; width: 100%; height: 100% }
</style>
</head>
<body>
<iframe src="${src}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen title="${title}"></iframe>
</body>
</html>`
}

/** Escapes the few characters that could break out of the title attribute. */
const safeTitle = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`).slice(0, 120)

export async function openTrailer(parent: BrowserWindow, videoId: string, title: string): Promise<boolean> {
  if (!VIDEO_ID.test(videoId)) return false

  // One trailer at a time: a second click replaces the first.
  win?.destroy()
  shutdown()

  const secret = randomUUID()
  const html = page(videoId, safeTitle(title || 'Bande-annonce'))

  server = createServer((req, res) => {
    if (req.url !== `/${secret}`) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    })
    res.end(html)
  })

  const port = await new Promise<number>((resolve, reject) => {
    server?.once('error', reject)
    server?.listen(0, '127.0.0.1', () => {
      const address = server?.address()
      resolve(typeof address === 'object' && address ? address.port : 0)
    })
  }).catch(() => 0)

  if (!port) {
    shutdown()
    return false
  }

  win = new BrowserWindow({
    parent,
    width: 1000,
    // 16:9 plus the title bar.
    height: 594,
    show: false,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: title || 'Bande-annonce',
    webPreferences: {
      // A separate session: keeps the app's CSP hook off this window, and keeps
      // YouTube's cookies out of the app's own session.
      partition: 'trailer',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  win.setMenuBarVisibility(false)

  // "Watch on YouTube" and any other link goes to the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // The window may move around YouTube, never anywhere else.
  win.webContents.on('will-navigate', (event, url) => {
    let host: string
    try {
      host = new URL(url).host
    } catch {
      host = ''
    }
    if (host === `127.0.0.1:${port}` || ALLOWED_HOSTS.has(host)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  // Escape closes it, which is what a video overlay is expected to do.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault()
      win?.close()
    }
  })

  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => {
    win = null
    shutdown()
  })

  await win.loadURL(`http://127.0.0.1:${port}/${secret}`)
  return true
}

export function closeTrailer(): void {
  win?.close()
}
