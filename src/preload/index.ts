import { contextBridge, ipcRenderer } from 'electron'
import type {
  AiringEntry,
  AiringItem,
  BrowseQuery,
  CustomList,
  Entry,
  EntryPatch,
  FillerInfo,
  ForYou,
  Follow,
  FollowKind,
  FollowNews,
  HealthReport,
  ImportReport,
  LocalFolder,
  Manga,
  MangaKind,
  Media,
  MediaDetail,
  Paged,
  PersonWorks,
  Prefs,
  SeasonEntry,
  SeasonName,
  Snapshot,
  StudioWorks,
  Suggestion,
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
    cancelRewatch: (animeId: number): Promise<Entry | null> => ipcRenderer.invoke('lib:cancel-rewatch', animeId),
    updateEvent: (ref: WatchEventRef, patch: WatchEventPatch): Promise<boolean> =>
      ipcRenderer.invoke('lib:update-event', ref, patch),
    removeEvent: (ref: WatchEventRef): Promise<boolean> => ipcRenderer.invoke('lib:remove-event', ref),
    setEntries: (animeIds: number[], patch: EntryPatch): Promise<number> =>
      ipcRenderer.invoke('lib:set-entries', animeIds, patch),
    removeEntries: (animeIds: number[]): Promise<number> => ipcRenderer.invoke('lib:remove-entries', animeIds),
    markAllWatched: (animeIds: number[]): Promise<number> => ipcRenderer.invoke('lib:mark-all-watched', animeIds),
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
    /**
     * Ce qu'AniList conseille à partir des séries passées en graine, moins ce
     * qui est déjà suivi.
     */
    /** Le profil de goût et ce qu'il conseille, raisons comprises. */
    forYou: (): Promise<ForYou> => ipcRenderer.invoke('anime:for-you'),
    recommended: (seeds: number[], exclude: number[]): Promise<Suggestion[]> =>
      ipcRenderer.invoke('anime:recommended', seeds, exclude),
    /** Les autres rôles d'un personnage ou d'un doubleur. */
    person: (kind: 'character' | 'staff', id: number): Promise<PersonWorks | null> =>
      ipcRenderer.invoke('anime:person', kind, id),
    currentSeason: (): Promise<{ season: SeasonName; year: number }> => ipcRenderer.invoke('anime:season'),
    returning: (): Promise<Media[]> => ipcRenderer.invoke('anime:returning'),
    films: (title: string): Promise<Media[]> => ipcRenderer.invoke('anime:films', title),
    studio: (name: string, page: number): Promise<StudioWorks> => ipcRenderer.invoke('anime:studio', name, page),
    /** Filler and recap episodes from MyAnimeList; null when it has no list. */
    filler: (malId: number | null): Promise<FillerInfo | null> => ipcRenderer.invoke('anime:filler', malId),
    /** Every season of this anime's franchise, in broadcast order. */
    seasons: (id: number): Promise<SeasonEntry[]> => ipcRenderer.invoke('anime:seasons', id),
    /** Looks for aired sequels of followed series and adds the new ones. */
    sweepSequels: (): Promise<{ added: Media[]; checked: number }> => ipcRenderer.invoke('anime:sweep-sequels'),
    onSequelsAdded: (cb: (added: Media[]) => void): (() => void) => {
      const handler = (_e: unknown, added: Media[]): void => cb(added)
      ipcRenderer.on('sequels:added', handler)
      return () => ipcRenderer.off('sequels:added', handler)
    }
  },
  manga: {
    /** Le catalogue manga d'AniList. Lecture seule : rien n'est suivi. */
    browse: (kind: MangaKind, page: number, search: string, genre?: string): Promise<Paged<Manga>> =>
      ipcRenderer.invoke('manga:browse', kind, page, search, genre),
    /** La fiche d'un manga seul, quand on arrive depuis la relation d'un anime. */
    detail: (id: number): Promise<Manga> => ipcRenderer.invoke('manga:detail', id)
  },

  watch: {
    animeSama: (
      animeId: number,
      titles: string[]
    ): Promise<{ url: string; direct: boolean; absent?: boolean; episodes?: boolean }> =>
      ipcRenderer.invoke('watch:anime-sama', animeId, titles),
    /**
     * Ouvre un épisode d'Anime-Sama dans une fenêtre de l'app, positionnée sur
     * le bon épisode — leur site n'ayant pas d'adresse par épisode. Faux si
     * l'URL ne vient pas de chez eux.
     */
    openEpisode: (url: string, episode: number | null): Promise<boolean> =>
      ipcRenderer.invoke('watch:open-episode', url, episode)
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
    importTvTime: (folder?: string | null): Promise<TvTimeReport> => ipcRenderer.invoke('data:import-tvtime', folder),
    cancelTvTime: (): Promise<void> => ipcRenderer.invoke('data:cancel-tvtime'),
    onTvTimeProgress: (cb: (progress: TvTimeProgress) => void): (() => void) => {
      const handler = (_e: unknown, progress: TvTimeProgress): void => cb(progress)
      ipcRenderer.on('tvtime:progress', handler)
      return () => ipcRenderer.off('tvtime:progress', handler)
    },
    reset: (): Promise<void> => ipcRenderer.invoke('data:reset'),
    reveal: (): Promise<void> => ipcRenderer.invoke('data:reveal')
  },
  health: {
    /** Ce qui cloche dans la bibliothèque, sans rien réparer. */
    report: (): Promise<HealthReport> => ipcRenderer.invoke('health:report'),
    /** Efface les visionnages dont la série n'existe plus. Renvoie le nombre. */
    cleanOrphans: (): Promise<number> => ipcRenderer.invoke('health:clean-orphans'),
    removeStray: (name: string): Promise<boolean> => ipcRenderer.invoke('health:remove-stray', name)
  },

  cache: {
    /** Poids du cache AniList sur le disque, tel qu'il serait écrit. */
    stats: (): Promise<{ entries: number; bytes: number }> => ipcRenderer.invoke('cache:stats'),
    /** Rien n'est perdu : tout se retélécharge à la demande. */
    purge: (): Promise<void> => ipcRenderer.invoke('cache:purge')
  },

  follows: {
    list: (): Promise<Follow[]> => ipcRenderer.invoke('follows:list'),
    /** Rend `null` si AniList ne connaît pas la personne ou le studio. */
    add: (kind: FollowKind, ref: number | string, name: string): Promise<Follow | null> =>
      ipcRenderer.invoke('follows:add', kind, ref, name),
    remove: (key: string): Promise<boolean> => ipcRenderer.invoke('follows:remove', key),
    /** Les nouveautés en attente, avec leurs fiches. */
    news: (): Promise<FollowNews[]> => ipcRenderer.invoke('follows:news'),
    /** Marque les nouveautés comme vues — d'un suivi, ou de tous. */
    seen: (key?: string): Promise<void> => ipcRenderer.invoke('follows:seen', key),
    /** Force un balayage, sans attendre les douze heures. */
    sweep: (): Promise<Media[]> => ipcRenderer.invoke('follows:sweep')
  },

  videos: {
    /** Fichiers du dossier associé, ou null si aucun dossier n'a été choisi. */
    scan: (animeId: number): Promise<LocalFolder | null> => ipcRenderer.invoke('videos:scan', animeId),
    /** Ouvre le sélecteur de dossier, puis rescanne. */
    choose: (animeId: number): Promise<LocalFolder | null> => ipcRenderer.invoke('videos:choose', animeId),
    forget: (animeId: number): Promise<void> => ipcRenderer.invoke('videos:forget', animeId),
    /** Pour ce que Chromium ne décode pas. Faux si le chemin est refusé. */
    openExternal: (path: string): Promise<boolean> => ipcRenderer.invoke('videos:open-external', path),
    /** Retient où en est la lecture, pour rouvrir le fichier au bon endroit. */
    remember: (path: string, at: number, duration: number): Promise<boolean> =>
      ipcRenderer.invoke('videos:remember', path, at, duration),
    /** Oublie la reprise : l'épisode est fini, ou on repart du début. */
    forgetPosition: (path: string): Promise<boolean> => ipcRenderer.invoke('videos:forget-position', path)
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
    /**
     * Enregistre en PNG la zone de la fenêtre décrite par `rect`.
     *
     * La zone doit être visible à l'écran : la fenêtre capture ce qu'elle
     * affiche. Renvoie le nom du fichier écrit, ou null si l'utilisateur a
     * renoncé.
     */
    saveCard: (rect: { x: number; y: number; width: number; height: number }, name: string): Promise<string | null> =>
      ipcRenderer.invoke('card:save', rect, name),
    /**
     * Loopback URL to put in an iframe, or null when the trailer cannot be
     * served. See src/main/trailer.ts for why an iframe on file:// needs this.
     */
    trailerUrl: (videoId: string, title: string): Promise<string | null> =>
      ipcRenderer.invoke('trailer:url', videoId, title),
    /** Same player, in its own window, for a bigger view. */
    popoutTrailer: (videoId: string, title: string): Promise<boolean> =>
      ipcRenderer.invoke('trailer:popout', videoId, title),
    closeTrailer: (): Promise<void> => ipcRenderer.invoke('trailer:close'),
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
    },
    /**
     * Lets the main process drive navigation to any route, not just a series.
     * Used by the screenshot run to walk the app page by page.
     */
    onGoto: (cb: (route: unknown) => void): (() => void) => {
      const handler = (_e: unknown, route: unknown): void => cb(route)
      ipcRenderer.on('nav:goto', handler)
      return () => ipcRenderer.off('nav:goto', handler)
    }
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
