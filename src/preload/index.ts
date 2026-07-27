import { contextBridge, ipcRenderer } from 'electron'
import type {
  AiringEntry,
  AiringItem,
  BrowseQuery,
  CustomList,
  Entry,
  EntryPatch,
  ImportReport,
  Media,
  MediaDetail,
  Paged,
  Prefs,
  SeasonName,
  Snapshot,
  StudioWorks,
  TvTimeProgress,
  TvTimeReport,
  UpdateStatus,
  WatchEventPatch,
  WatchEventRef
} from '@shared/types'

const api = {
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('win:minimize'),
    toggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('win:maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('win:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('win:is-maximized'),
    onMaximizedChange: (cb: (value: boolean) => void): (() => void) => {
      const handler = (_e: unknown, value: boolean): void => cb(value)
      ipcRenderer.on('win:maximized', handler)
      return () => ipcRenderer.off('win:maximized', handler)
    }
  },
  library: {
    snapshot: (): Promise<Snapshot> => ipcRenderer.invoke('lib:snapshot'),
    setEntry: (animeId: number, patch: EntryPatch, media?: Media): Promise<Entry> =>
      ipcRenderer.invoke('lib:set-entry', animeId, patch, media),
    removeEntry: (animeId: number): Promise<void> => ipcRenderer.invoke('lib:remove-entry', animeId),
    setWatched: (animeId: number, episode: number, watched: boolean): Promise<void> =>
      ipcRenderer.invoke('lib:set-watched', animeId, episode, watched),
    setWatchedUpTo: (animeId: number, episode: number): Promise<void> =>
      ipcRenderer.invoke('lib:set-watched-up-to', animeId, episode),
    clearWatched: (animeId: number): Promise<void> => ipcRenderer.invoke('lib:clear-watched', animeId),
    startRewatch: (animeId: number): Promise<Entry | null> => ipcRenderer.invoke('lib:start-rewatch', animeId),
    cancelRewatch: (animeId: number): Promise<Entry | null> =>
      ipcRenderer.invoke('lib:cancel-rewatch', animeId),
    updateEvent: (ref: WatchEventRef, patch: WatchEventPatch): Promise<boolean> =>
      ipcRenderer.invoke('lib:update-event', ref, patch),
    removeEvent: (ref: WatchEventRef): Promise<boolean> => ipcRenderer.invoke('lib:remove-event', ref),
    setEntries: (animeIds: number[], patch: EntryPatch): Promise<number> =>
      ipcRenderer.invoke('lib:set-entries', animeIds, patch),
    removeEntries: (animeIds: number[]): Promise<number> => ipcRenderer.invoke('lib:remove-entries', animeIds),
    markAllWatched: (animeIds: number[]): Promise<number> =>
      ipcRenderer.invoke('lib:mark-all-watched', animeIds),
    onChange: (cb: () => void): (() => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('store:change', handler)
      return () => ipcRenderer.off('store:change', handler)
    }
  },
  anime: {
    browse: (query: BrowseQuery): Promise<Paged<Media>> => ipcRenderer.invoke('anime:browse', query),
    detail: (id: number): Promise<MediaDetail & { stale: boolean }> => ipcRenderer.invoke('anime:detail', id),
    airing: (ids: number[], from: number, to: number): Promise<AiringItem[]> =>
      ipcRenderer.invoke('anime:airing', ids, from, to),
    airingAll: (from: number, to: number): Promise<AiringEntry[]> => ipcRenderer.invoke('anime:airing-all', from, to),
    refresh: (ids: number[]): Promise<Media[]> => ipcRenderer.invoke('anime:refresh', ids),
    currentSeason: (): Promise<{ season: SeasonName; year: number }> => ipcRenderer.invoke('anime:season'),
    returning: (): Promise<Media[]> => ipcRenderer.invoke('anime:returning'),
    films: (title: string): Promise<Media[]> => ipcRenderer.invoke('anime:films', title),
    studio: (name: string, page: number): Promise<StudioWorks> => ipcRenderer.invoke('anime:studio', name, page)
  },
  watch: {
    animeSama: (animeId: number, titles: string[]): Promise<{ url: string; direct: boolean; absent?: boolean }> =>
      ipcRenderer.invoke('watch:anime-sama', animeId, titles)
  },
  lists: {
    create: (name: string, emoji?: string): Promise<CustomList | null> =>
      ipcRenderer.invoke('lists:create', name, emoji),
    update: (id: string, patch: { name?: string; emoji?: string }): Promise<CustomList | null> =>
      ipcRenderer.invoke('lists:update', id, patch),
    remove: (id: string): Promise<boolean> => ipcRenderer.invoke('lists:delete', id),
    membership: (id: string, animeIds: number[], member: boolean): Promise<CustomList | null> =>
      ipcRenderer.invoke('lists:membership', id, animeIds, member)
  },
  prefs: {
    get: (): Promise<Prefs> => ipcRenderer.invoke('prefs:get'),
    set: (patch: Partial<Prefs>): Promise<Prefs> => ipcRenderer.invoke('prefs:set', patch)
  },
  data: {
    export: (): Promise<ImportReport> => ipcRenderer.invoke('data:export'),
    import: (mode: 'merge' | 'replace'): Promise<ImportReport> => ipcRenderer.invoke('data:import', mode),
    importMal: (): Promise<ImportReport> => ipcRenderer.invoke('data:import-mal'),
    importTvTime: (folder?: string | null): Promise<TvTimeReport> =>
      ipcRenderer.invoke('data:import-tvtime', folder),
    cancelTvTime: (): Promise<void> => ipcRenderer.invoke('data:cancel-tvtime'),
    onTvTimeProgress: (cb: (progress: TvTimeProgress) => void): (() => void) => {
      const handler = (_e: unknown, progress: TvTimeProgress): void => cb(progress)
      ipcRenderer.on('tvtime:progress', handler)
      return () => ipcRenderer.off('tvtime:progress', handler)
    },
    reset: (): Promise<void> => ipcRenderer.invoke('data:reset'),
    reveal: (): Promise<void> => ipcRenderer.invoke('data:reveal')
  },
  app: {
    info: (): Promise<{
      version: string
      electron: string
      chrome: string
      dbPath: string
      schema: { version: number; expected: number; readOnly: boolean; applied: string[] }
    }> => ipcRenderer.invoke('app:info'),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:open-external', url),
    updateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:status'),
    checkUpdate: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:check'),
    downloadUpdate: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:download'),
    installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install'),
    onUpdateStatus: (cb: (status: UpdateStatus) => void): (() => void) => {
      const handler = (_e: unknown, status: UpdateStatus): void => cb(status)
      ipcRenderer.on('update:status', handler)
      return () => ipcRenderer.off('update:status', handler)
    },
    onOpenAnime: (cb: (id: number) => void): (() => void) => {
      const handler = (_e: unknown, id: number): void => cb(id)
      ipcRenderer.on('nav:open-anime', handler)
      return () => ipcRenderer.off('nav:open-anime', handler)
    }
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
