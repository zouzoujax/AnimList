/**
 * Application updates, from GitHub Releases.
 *
 * `electron-updater` is the app's only runtime dependency, and it is here on
 * purpose: doing this by hand means downloading a binary, verifying its
 * signature and handing it to the NSIS installer, and getting any of that wrong
 * is a way to ship malware to yourself.
 *
 * Nothing is installed without being asked. The check runs on its own, the
 * download and the restart are both explicit, because replacing a running
 * application under the user is not a decision to take for them.
 */

import { BrowserWindow, app } from 'electron'
import type { UpdateStatus } from '@shared/types'

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

  // Downloading is the user's call, so the automatic part stops at "found".
  auto.autoDownload = false
  auto.autoInstallOnAppQuit = true

  auto.on('update-available', (info) => set({ phase: 'available', version: info.version, message: null }))
  auto.on('update-not-available', () => set({ phase: 'current', version: null, message: null }))
  auto.on('download-progress', (progress) => set({ phase: 'downloading', percent: Math.round(progress.percent) }))
  auto.on('update-downloaded', (info) => set({ phase: 'ready', version: info.version, percent: 100 }))
  auto.on('error', (err) => set({ phase: 'error', message: err.message }))

  return auto
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  const auto = await attach()
  if (!auto) {
    set({ phase: 'unsupported', message: 'Les mises à jour ne concernent que la version installée.' })
    return state
  }

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

/**
 * Checks once, shortly after launch.
 *
 * Delayed so it never competes with the first paint or the airing sweep, and
 * silent about failures — being offline is not something to interrupt for.
 */
export function scheduleStartupCheck(): () => void {
  const timer = setTimeout(() => {
    void checkForUpdates()
  }, 45_000)
  return () => clearTimeout(timer)
}
