import { BrowserWindow, app, ipcMain, shell } from 'electron'
import type {
  BrowseQuery,
  EntryPatch,
  FollowKind,
  MangaKind,
  Media,
  Prefs,
  WatchEventPatch,
  WatchEventRef
} from '@shared/types'
import * as anilist from './anilist'
import { resolve as resolveAnimeSama } from './animesama'
import { chromeFor } from '@shared/types'
import { exportData, importData, importMal, revealDataFolder } from './backup'
import { cancelImport, importTvTime } from './tvtime/service'
import { planUpcoming } from './notifications'
import { checkForUpdates, downloadUpdate, installUpdate, updateStatus } from './updater'
import { closeUpdateWindow, dismissUpdateWindow, previewUpdateWindow } from './update-window'
import { closeTrailerWindow, openTrailerWindow, trailerUrl } from './trailer'
import { fillerFor } from './filler'
import { chooseFolder, forgetFolder, forgetPosition, openInSystemPlayer, rememberPosition, scanFolder } from './videos'
import { openAnimeSamaEpisode } from './watch-window'
import { cleanOrphans, health, removeStray } from './health'
import { saveCard, type CardRect } from './card'
import { sweepSequels } from './sequels'
import { addFollow, followNews, markSeen, removeFollow, sweepFollows } from './follows'
import { forYou } from './foryou'
import { identifyImage } from './identify'
import { importAniList, importKitsu } from './import-list'
import { setPlayerActive } from './taskbar'
import { canTranslate, purgeTranslations, translate } from './translate'
import { remoteStatus, startRemote, stopRemote } from './remote'
import { applyDiscord, discordStatus } from './discord'
import { rememberLaunch, setLocalWatching, type LocalWatching } from './now'
import {
  cacheMedia,
  cancelRewatch,
  clearWatched,
  createList,
  dbPath,
  deleteList,
  getFollows,
  getPrefs,
  markAllWatched,
  removeEntries,
  removeEntry,
  removeEvent,
  resetAll,
  schemaInfo,
  setEntries,
  setEntry,
  setListMembership,
  setPrefs,
  setWatched,
  setWatchedUpTo,
  snapshot,
  startRewatch,
  store,
  updateEvent,
  updateList
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
  ipcMain.handle('lib:update-event', (_e, ref: WatchEventRef, patch: WatchEventPatch) => updateEvent(ref, patch))
  ipcMain.handle('lib:remove-event', (_e, ref: WatchEventRef) => removeEvent(ref))

  // ---- bulk actions --------------------------------------------------
  ipcMain.handle('lib:set-entries', (_e, animeIds: number[], patch: EntryPatch) => setEntries(animeIds, patch))
  ipcMain.handle('lib:remove-entries', (_e, animeIds: number[]) => removeEntries(animeIds))
  ipcMain.handle('lib:mark-all-watched', (_e, animeIds: number[]) => markAllWatched(animeIds))

  // ---- custom lists --------------------------------------------------
  ipcMain.handle('lists:create', (_e, name: string, emoji?: string) => createList(name, emoji))
  ipcMain.handle('lists:update', (_e, id: string, patch: { name?: string; emoji?: string }) => updateList(id, patch))
  ipcMain.handle('lists:delete', (_e, id: string) => deleteList(id))
  ipcMain.handle('lists:membership', (_e, id: string, animeIds: number[], member: boolean) =>
    setListMembership(id, animeIds, member)
  )

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
    // Le statut Discord se réaligne sur les réglages, quelle que soit la
    // case touchée : allumage, identifiant, mode discret.
    if (patch.discord !== undefined || patch.discordAppId !== undefined || patch.discordHideTitle !== undefined) {
      applyDiscord()
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
  ipcMain.handle('anime:recommended', (_e, seeds: number[], exclude: number[]) =>
    anilist.recommended(seeds, exclude, getPrefs().showAdult)
  )
  ipcMain.handle('anime:for-you', () => forYou())

  // ---- traduction ------------------------------------------------------
  ipcMain.handle('translate:texts', (_e, texts: string[]) => translate(texts))
  ipcMain.handle('translate:ready', () => canTranslate())
  ipcMain.handle('translate:purge', () => purgeTranslations())

  // ---- télécommande ----------------------------------------------------
  // Éteinte par défaut, et à chaque démarrage : allumer expose la
  // bibliothèque à tout ce qui est branché sur la même box, et ça se décide
  // à chaque fois plutôt qu'une fois pour toutes.
  ipcMain.handle('remote:status', () => remoteStatus())
  ipcMain.handle('remote:start', () => startRemote())
  ipcMain.handle('remote:stop', () => stopRemote())

  // ---- reconnaissance d'une image ------------------------------------
  // L'image ne sort d'ici que sur un geste explicite : coller, déposer,
  // choisir un fichier. Rien n'est envoyé de soi-même.
  ipcMain.handle('anime:identify', (_e, bytes: Uint8Array, mime: string) => identifyImage(bytes, mime))
  ipcMain.handle(
    'manga:browse',
    (_e, kind: MangaKind, page: number, search: string, genre?: string, country?: string) =>
      anilist.mangas(kind, page, search, genre, getPrefs().showAdult, country)
  )
  ipcMain.handle('manga:detail', (_e, id: number) => anilist.mangaById(id))
  ipcMain.handle('anime:person', (_e, kind: 'character' | 'staff', id: number) => anilist.personWorks(kind, id))
  ipcMain.handle('anime:season', () => anilist.currentSeason())
  ipcMain.handle('anime:returning', () => anilist.returningSoon(getPrefs().showAdult))
  ipcMain.handle('anime:films', (_e, title: string) => anilist.franchiseFilms(title, getPrefs().showAdult))
  ipcMain.handle('anime:studio', (_e, name: string, page: number) => anilist.studioWorks(name, page))
  ipcMain.handle('watch:anime-sama', (_e, animeId: number, titles: string[]) => resolveAnimeSama(animeId, titles))
  ipcMain.handle('anime:filler', (_e, malId: number | null) => fillerFor(malId))
  ipcMain.handle('anime:sweep-sequels', (e) => sweepSequels(ownerOf(e)))
  ipcMain.handle('anime:seasons', (_e, id: number) => anilist.seasonChain(id))

  // ---- suivis : personnes et studios ---------------------------------
  ipcMain.handle('follows:list', () => getFollows())
  ipcMain.handle('follows:add', (_e, kind: FollowKind, ref: number | string, name: string) =>
    addFollow(kind, ref, name)
  )
  ipcMain.handle('follows:remove', (_e, key: string) => removeFollow(key))
  ipcMain.handle('follows:news', () => followNews())
  ipcMain.handle('follows:seen', (_e, key?: string) => markSeen(key))
  ipcMain.handle('follows:sweep', (e) => sweepFollows(ownerOf(e), true))

  // ---- data ----------------------------------------------------------
  ipcMain.handle('data:export', (e) => exportData(ownerOf(e)))
  ipcMain.handle('data:import', (e, mode: 'merge' | 'replace') => importData(ownerOf(e), mode))
  ipcMain.handle('data:import-mal', (e) => importMal(ownerOf(e)))
  ipcMain.handle('data:import-anilist', (_e, user: string) => importAniList(user))
  ipcMain.handle('data:import-kitsu', (_e, user: string) => importKitsu(user))
  ipcMain.handle('data:import-tvtime', (e, folder?: string | null) => importTvTime(ownerOf(e), folder))
  ipcMain.handle('data:cancel-tvtime', () => cancelImport())
  ipcMain.handle('data:reset', () => resetAll())
  ipcMain.handle('data:reveal', () => revealDataFolder())

  // ---- lecture chez une plateforme -------------------------------------
  ipcMain.handle('watch:open-episode', (_e, url: string, episode: number | null, animeId?: number) => {
    // Le titre de leur fenêtre est « Anime-Sama », rien de plus : sans cette
    // note, la télécommande et le statut Discord n'auraient rien à montrer.
    rememberLaunch(animeId, episode)
    return openAnimeSamaEpisode(url, episode)
  })

  // ---- image d'une carte -----------------------------------------------
  ipcMain.handle('card:save', (_e, rect: CardRect, name: string) => saveCard(rect, name))

  // ---- santé de la bibliothèque ----------------------------------------
  ipcMain.handle('health:report', () => health())
  ipcMain.handle('health:clean-orphans', () => cleanOrphans())
  ipcMain.handle('health:remove-stray', (_e, name: string) => removeStray(name))

  // ---- caches disque ---------------------------------------------------
  ipcMain.handle('cache:stats', () => anilist.cacheStats())
  ipcMain.handle('cache:purge', () => anilist.purgeCache())

  // ---- fichiers locaux ------------------------------------------------
  ipcMain.handle('videos:scan', (_e, animeId: number) => scanFolder(animeId))
  ipcMain.handle('videos:choose', (_e, animeId: number) => chooseFolder(animeId))
  ipcMain.handle('videos:forget', (_e, animeId: number) => forgetFolder(animeId))
  ipcMain.handle('videos:open-external', (_e, path: string) => openInSystemPlayer(path))
  ipcMain.handle('videos:remember', (_e, path: string, at: number, duration: number) =>
    rememberPosition(path, at, duration)
  )
  ipcMain.handle('videos:forget-position', (_e, path: string) => forgetPosition(path))

  // Les touches multimédia ne sont prises que pendant une lecture : un
  // raccourci global posé en permanence volerait la touche « lecture » à tous
  // les autres lecteurs de la machine.
  ipcMain.handle('videos:playing', (e, active: boolean) => setPlayerActive(ownerOf(e), active))
  /**
   * Le lecteur intégré est le seul à connaître sa pause et sa position sans
   * qu'on ait à interroger une page : il les pousse plutôt qu'on ne les
   * demande. Rien n'est écrit sur le disque — c'est de l'état vivant.
   */
  ipcMain.handle('now:watching', (_e, info: LocalWatching | null) => setLocalWatching(info))

  // ---- statut Discord --------------------------------------------------
  ipcMain.handle('discord:status', () => discordStatus())

  // ---- app -----------------------------------------------------------
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    dbPath: dbPath(),
    schema: schemaInfo()
  }))
  ipcMain.handle('trailer:url', (_e, videoId: string, title: string) => trailerUrl(videoId, title))
  ipcMain.handle('trailer:popout', (e, videoId: string, title: string, animeId?: number) => {
    rememberLaunch(animeId, null, 'Bande-annonce')
    return openTrailerWindow(ownerOf(e), videoId, title)
  })
  ipcMain.handle('trailer:close', () => closeTrailerWindow())
  ipcMain.handle('update:status', () => updateStatus())
  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.handle('update:download', () => downloadUpdate())
  ipcMain.handle('update:install', () => installUpdate())
  // La petite fenêtre se ferme d'elle-même. « Plus tard » vaut pour toute la
  // version ; refermer un aperçu ne fait taire personne.
  ipcMain.on('update:dismiss', (_, remember: boolean) =>
    remember ? dismissUpdateWindow(updateStatus().version) : closeUpdateWindow()
  )
  ipcMain.handle('update:preview', () => previewUpdateWindow(app.getVersion()))
  ipcMain.handle('app:open-external', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
    return undefined
  })

  // Re-planning walks the whole media cache, so it is coalesced: a bulk action
  // fires many changes and only the last one needs to be acted on.
  let replanTimer: NodeJS.Timeout | null = null

  store.on('change', () => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('store:change')

    if (replanTimer) clearTimeout(replanTimer)
    replanTimer = setTimeout(() => {
      replanTimer = null
      const [win] = BrowserWindow.getAllWindows()
      if (win) planUpcoming(win)
    }, 1500)
  })
}
