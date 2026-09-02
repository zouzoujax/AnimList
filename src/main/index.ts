import { BrowserWindow, app, session, shell } from 'electron'
import { chromeFor } from '@shared/types'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { initAniList } from './anilist'
import { initAnimeSama } from './animesama'
import { initFiller } from './filler'
import { registerMediaScheme, serveMedia } from './videos'
import { registerIpc } from './ipc'
import { startAiringWatcher } from './notifications'
import { startFollowWatcher } from './follows'
import { startUpdateWatcher } from './updater'
import { startSequelWatcher } from './sequels'
import { captureAll, screenshotRun } from './screenshots'
import { flush, getPrefs, initStore } from './store'

const isDev = !app.isPackaged

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.setAppUserModelId('dev.willi.animelist')

// Avant `whenReady`, sans quoi le protocole n'est pas tenu pour sûr et le
// lecteur refuse d'y chercher un flux.
registerMediaScheme()

let mainWindow: BrowserWindow | null = null
let stopWatcher: (() => void) | null = null
let stopFollows: (() => void) | null = null
let stopUpdateCheck: (() => void) | null = null
let stopSequelWatcher: (() => void) | null = null

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  // Les vignettes d'épisodes viennent toutes du CDN de Crunchyroll, à qui
  // AniList les emprunte. Sans cette entrée elles s'affichent en développement
  // et restent noires une fois l'app installée.
  "img-src 'self' data: blob: https://s4.anilist.co https://img.anili.st https://i.ytimg.com https://artworks.thetvdb.com https://img1.ak.crunchyroll.com",
  // Les fichiers vidéo locaux, servis par src/main/videos.ts. Ce protocole ne
  // donne accès qu'aux dossiers choisis à la main dans l'app.
  "media-src 'self' animelist-media:",
  "connect-src 'self'",
  // The only thing this document may frame is the trailer page served by
  // src/main/trailer.ts on the loopback address.
  'frame-src http://127.0.0.1:*',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

function resolveIcon(): string | undefined {
  const candidates = [
    join(__dirname, '../../build/icon.ico'),
    join(__dirname, '../../build/icon.png'),
    join(process.resourcesPath, 'icon.ico')
  ]
  return candidates.find((p) => existsSync(p))
}

function createWindow(): BrowserWindow {
  const prefs = getPrefs()
  const useMica = process.platform === 'win32' && prefs.mica
  const chrome = chromeFor(prefs.theme)

  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 660,
    show: false,
    autoHideMenuBar: true,
    icon: resolveIcon(),
    backgroundColor: useMica ? '#00000000' : chrome.color,
    backgroundMaterial: useMica ? 'mica' : 'none',
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...chrome, height: 44 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Nothing in this app should ever navigate away from the bundled renderer.
  win.webContents.on('will-navigate', (event, url) => {
    const dev = process.env['ELECTRON_RENDERER_URL']
    if (dev && url.startsWith(dev)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  const sendMaximized = (): void => win.webContents.send('win:maximized', win.isMaximized())
  win.on('maximize', sendMaximized)
  win.on('unmaximize', sendMaximized)

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDev && devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))

  return win
}

void app.whenReady().then(() => {
  initStore()
  initAniList()
  initAnimeSama()
  initFiller()
  registerIpc()
  serveMedia()

  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      // Notre document, et lui seul.
      //
      // Le type « mainFrame » ne suffit pas : la fenêtre qui ouvre un épisode
      // chez Anime-Sama en est un aussi, et elle recevait donc notre politique.
      // Résultat en version installée — invisible en développement, où cette
      // règle n'est pas posée : images cassées, publicités bloquées, et pas de
      // lecteur du tout, `frame-src` n'autorisant que la boucle locale.
      //
      // Une politique stricte n'a de sens que sur du code qu'on écrit. Imposée
      // à la page d'autrui, elle ne protège de rien et casse tout.
      const own = details.url.startsWith('file://')
      if (details.resourceType !== 'mainFrame' || !own) {
        callback({})
        return
      }
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP] } })
    })
  }

  mainWindow = createWindow()

  // A screenshot run drives the window itself and quits; the airing sweep and
  // the update check would only add noise and network traffic to it.
  const shots = screenshotRun()
  if (shots) {
    void captureAll(mainWindow, shots.outDir, shots.plan).catch((err) => {
      console.error('[screenshots]', err)
      app.exit(1)
    })
    return
  }

  stopWatcher = startAiringWatcher(mainWindow)
  stopFollows = startFollowWatcher(mainWindow)
  stopUpdateCheck = startUpdateWatcher()
  stopSequelWatcher = startSequelWatcher(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async (event) => {
  stopWatcher?.()
  stopWatcher = null
  stopUpdateCheck?.()
  stopUpdateCheck = null
  stopSequelWatcher?.()
  stopSequelWatcher = null
  stopFollows?.()
  stopFollows = null
  event.preventDefault()
  await flush()
  app.exit(0)
})
