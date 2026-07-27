import { BrowserWindow, app, session, shell } from 'electron'
import { chromeFor } from '@shared/types'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { initAniList } from './anilist'
import { initAnimeSama } from './animesama'
import { registerIpc } from './ipc'
import { startAiringWatcher } from './notifications'
import { scheduleStartupCheck } from './updater'
import { captureAll, screenshotRun } from './screenshots'
import { flush, getPrefs, initStore } from './store'

const isDev = !app.isPackaged

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.setAppUserModelId('dev.willi.animelist')

let mainWindow: BrowserWindow | null = null
let stopWatcher: (() => void) | null = null
let stopUpdateCheck: (() => void) | null = null

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://s4.anilist.co https://img.anili.st https://i.ytimg.com https://artworks.thetvdb.com",
  "media-src 'self'",
  "connect-src 'self'",
  "frame-src 'none'",
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
  registerIpc()

  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
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
  stopUpdateCheck = scheduleStartupCheck()

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
  event.preventDefault()
  await flush()
  app.exit(0)
})
