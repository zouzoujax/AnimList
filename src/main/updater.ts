/**
 * Application updates, from GitHub Releases.
 *
 * `electron-updater` is the app's only runtime dependency, and it is here on
 * purpose: doing this by hand means downloading a binary, verifying its
 * signature and handing it to the NSIS installer, and getting any of that wrong
 * is a way to ship malware to yourself.
 *
 * Le cycle est automatique : l'app cherche une version toutes les six heures,
 * la télécharge seule et l'installe en silence à la fermeture. Ce qu'elle ne
 * fait pas, c'est se fermer d'elle-même pour installer — arracher l'app à
 * quelqu'un au milieu d'un épisode n'est pas une décision à prendre pour lui.
 * Une notification propose le redémarrage immédiat pour ceux qui le veulent.
 *
 * Le tout est désactivable depuis les Réglages ; chaque étape redevient alors
 * manuelle.
 */

import { BrowserWindow, Notification, app } from 'electron'
import type { UpdateStatus } from '@shared/types'
import { getPrefs } from './store'

let state: UpdateStatus = { phase: 'idle', version: null, percent: 0, message: null }
let started = false

/** Loaded lazily: importing it in dev would look for an update-config that isn't there. */
type Updater = typeof import('electron-updater').autoUpdater

async function updater(): Promise<Updater | null> {
  // A dev run is not a packaged app; there is nothing to replace.
  if (!app.isPackaged) return null
  const { autoUpdater } = await import('electron-updater')
  return autoUpdater
}

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('update:status', state)
  }
}

function set(next: Partial<UpdateStatus>): void {
  state = { ...state, ...next }
  broadcast()
}

export function updateStatus(): UpdateStatus {
  return state
}

/** Wires the events once, on the first check. */
async function attach(): Promise<Updater | null> {
  const auto = await updater()
  if (!auto) return null
  if (started) return auto
  started = true

  // Installed at the next quit, silently: electron-updater passes /S to the
  // NSIS installer itself, so no wizard appears behind the user's back.
  auto.autoInstallOnAppQuit = true

  auto.on('update-available', (info) => set({ phase: 'available', version: info.version, message: null }))
  auto.on('update-not-available', () => set({ phase: 'current', version: null, message: null }))
  auto.on('download-progress', (progress) => set({ phase: 'downloading', percent: Math.round(progress.percent) }))
  auto.on('update-downloaded', (info) => {
    set({ phase: 'ready', version: info.version, percent: 100 })
    announceReady(info.version)
  })
  auto.on('error', (err) => set({ phase: 'error', message: err.message }))

  return auto
}

/**
 * Dit que la version est là, une seule fois par version téléchargée.
 *
 * Sans ça une mise à jour entièrement automatique serait invisible : elle
 * s'installerait à la fermeture sans que personne n'ait rien vu passer.
 */
let announced: string | null = null

function announceReady(version: string): void {
  if (announced === version) return
  announced = version
  if (!Notification.isSupported() || !getPrefs().notifications) return

  const note = new Notification({
    title: `AnimeList ${version} est prête`,
    body: 'Elle s’installera à la fermeture de l’app. Clique pour redémarrer maintenant.'
  })
  note.on('click', () => void installUpdate())
  note.show()
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  const auto = await attach()
  if (!auto) {
    set({ phase: 'unsupported', message: 'Les mises à jour ne concernent que la version installée.' })
    return state
  }

  // Relu à chaque passage : couper le réglage doit prendre effet tout de suite,
  // sans relancer l'app.
  auto.autoDownload = getPrefs().autoUpdate

  set({ phase: 'checking', message: null, percent: 0 })
  try {
    await auto.checkForUpdates()
  } catch (err) {
    set({ phase: 'error', message: (err as Error).message })
  }
  return state
}

export async function downloadUpdate(): Promise<UpdateStatus> {
  const auto = await attach()
  if (!auto || state.phase !== 'available') return state

  set({ phase: 'downloading', percent: 0, message: null })
  try {
    await auto.downloadUpdate()
  } catch (err) {
    set({ phase: 'error', message: (err as Error).message })
  }
  return state
}

/** Quits and runs the installer. Only valid once the download has finished. */
export async function installUpdate(): Promise<void> {
  const auto = await attach()
  if (!auto || state.phase !== 'ready') return
  // `isSilent: false` keeps the installer visible: it is unsigned, so a silent
  // run that trips SmartScreen would look like the app simply failed to restart.
  auto.quitAndInstall(false, true)
}

/** Une session ouverte plusieurs jours doit voir passer une version. */
const EVERY_MS = 6 * 3600_000
/** Assez tard pour ne concurrencer ni le premier rendu ni le balayage des diffusions. */
const FIRST_DELAY_MS = 45_000

/**
 * Cherche peu après le lancement, puis toutes les six heures.
 *
 * Silencieux en cas d'échec : être hors ligne n'est pas une raison d'interrompre
 * qui que ce soit. Une fois la version prête, on arrête de chercher — il n'y a
 * plus rien à trouver avant le redémarrage.
 */
export function startUpdateWatcher(): () => void {
  const kick = (): void => {
    if (state.phase === 'ready' || state.phase === 'downloading') return
    void checkForUpdates()
  }

  const first = setTimeout(kick, FIRST_DELAY_MS)
  const timer = setInterval(kick, EVERY_MS)
  return () => {
    clearTimeout(first)
    clearInterval(timer)
  }
}
