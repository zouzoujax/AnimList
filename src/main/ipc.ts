import { BrowserWindow, app, ipcMain, shell } from 'electron'
import type { BrowseQuery, EntryPatch, Media, Prefs, WatchEventPatch, WatchEventRef } from '@shared/types'
import * as anilist from './anilist'
import { resolve as resolveAnimeSama } from './animesama'
import { chromeFor } from '@shared/types'
import { exportData, importData, importMal, revealDataFolder } from './backup'
import { cancelImport, importTvTime } from './tvtime/service'
import {
  cacheMedia,
  cancelRewatch,
  clearWatched,
  dbPath,
  getPrefs,
  removeEntry,
  removeEvent,
  resetAll,
  schemaInfo,
  setEntry,
  setPrefs,
  setWatched,
  setWatchedUpTo,
  snapshot,
  startRewatch,
  store,
  updateEvent
} from './store'

function ownerOf(event: Electron.IpcMainInvokeEvent): BrowserWindow {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) throw new Error('Fenêtre introuvable')
  return win
}

export function registerIpc(): void {
  // ---- window chrome -------------------------------------------------
  ipcMain.handle('win:minimize', (e) => ownerOf(e).minimize())
  ipcMain.handle('win:maximize', (e) => {
    const win = ownerOf(e)
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })
  ipcMain.handle('win:close', (e) => ownerOf(e).close())
  ipcMain.handle('win:is-maximized', (e) => ownerOf(e).isMaximized())

  // ---- library -------------------------------------------------------
  ipcMain.handle('lib:snapshot', () => snapshot())
  ipcMain.handle('lib:set-entry', (_e, animeId: number, patch: EntryPatch, media?: Media) =>
    setEntry(animeId, patch, media)
  )
  ipcMain.handle('lib:remove-entry', (_e, animeId: number) => removeEntry(animeId))
  ipcMain.handle('lib:set-watched', (_e, animeId: number, episode: number, watched: boolean) =>
    setWatched(animeId, episode, watched)
  )
  ipcMain.handle('lib:set-watched-up-to', (_e, animeId: number, episode: number) => setWatchedUpTo(animeId, episode))
  ipcMain.handle('lib:clear-watched', (_e, animeId: number) => clearWatched(animeId))
  ipcMain.handle('lib:start-rewatch', (_e, animeId: number) => startRewatch(animeId))
  ipcMain.handle('lib:cancel-rewatch', (_e, animeId: number) => cancelRewatch(animeId))
  ipcMain.handle('lib:update-event', (_e, ref: WatchEventRef, patch: WatchEventPatch) =>
    updateEvent(ref, patch)
  )
  ipcMain.handle('lib:remove-event', (_e, ref: WatchEventRef) => removeEvent(ref))

  // ---- preferences ---------------------------------------------------
  ipcMain.handle('prefs:get', () => getPrefs())
  ipcMain.handle('prefs:set', (e, patch: Partial<Prefs>) => {
    const prefs = setPrefs(patch)
    const chrome = chromeFor(prefs.theme)
    if (patch.theme !== undefined) {
      ownerOf(e).setTitleBarOverlay({ ...chrome, height: 44 })
    }
    if (patch.mica !== undefined || patch.theme !== undefined) {
      const win = ownerOf(e)
      win.setBackgroundMaterial(prefs.mica ? 'mica' : 'none')
      if (!prefs.mica) win.setBackgroundColor(chrome.color)
    }
    return prefs
  })

  // ---- AniList -------------------------------------------------------
  ipcMain.handle('anime:browse', (_e, query: BrowseQuery) => anilist.browse(query, getPrefs().showAdult))
  ipcMain.handle('anime:detail', async (_e, id: number) => {
    const media = await anilist.detail(id)
    cacheMedia([media], true)
    return media
  })
  ipcMain.handle('anime:airing', (_e, ids: number[], from: number, to: number) => anilist.airing(ids, from, to))
  ipcMain.handle('anime:airing-all', (_e, from: number, to: number) =>
    anilist.airingWindow(from, to, getPrefs().showAdult)
  )
  ipcMain.handle('anime:refresh', async (_e, ids: number[]) => {
    const fresh = await anilist.refreshMedia(ids)
    cacheMedia(fresh, true)
    return fresh
  })
  ipcMain.handle('anime:season', () => anilist.currentSeason())
  ipcMain.handle('anime:returning', () => anilist.returningSoon(getPrefs().showAdult))
  ipcMain.handle('anime:films', (_e, title: string) => anilist.franchiseFilms(title, getPrefs().showAdult))
  ipcMain.handle('anime:studio', (_e, name: string, page: number) => anilist.studioWorks(name, page))
  ipcMain.handle('watch:anime-sama', (_e, animeId: number, titles: string[]) => resolveAnimeSama(animeId, titles))

  // ---- data ----------------------------------------------------------
  ipcMain.handle('data:export', (e) => exportData(ownerOf(e)))
  ipcMain.handle('data:import', (e, mode: 'merge' | 'replace') => importData(ownerOf(e), mode))
  ipcMain.handle('data:import-mal', (e) => importMal(ownerOf(e)))
  ipcMain.handle('data:import-tvtime', (e, folder?: string | null) => importTvTime(ownerOf(e), folder))
  ipcMain.handle('data:cancel-tvtime', () => cancelImport())
  ipcMain.handle('data:reset', () => resetAll())
  ipcMain.handle('data:reveal', () => revealDataFolder())

  // ---- app -----------------------------------------------------------
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    dbPath: dbPath(),
    schema: schemaInfo()
  }))
  ipcMain.handle('app:open-external', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
    return undefined
  })

  store.on('change', () => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('store:change')
  })
}
