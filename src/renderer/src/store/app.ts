import { create } from 'zustand'
import {
  DEFAULT_PREFS,
  THEMES,
  type CustomList,
  type Entry,
  type EntryPatch,
  type Media,
  type Prefs,
  type Snapshot,
  type WatchEvent,
  type WatchProgress,
  type WatchEventPatch,
  type WatchEventRef
} from '@shared/types'
import { secondaryFor } from '@/lib/color'
import { rememberScroll } from '@/lib/scroll'
import { airingLabel, titleOf } from '@/lib/format'

export type Route =
  | { name: 'home' }
  | { name: 'discover'; search?: string }
  | { name: 'library'; genre?: string }
  | { name: 'manga'; tab?: 'local' | 'catalogue' }
  | { name: 'calendar' }
  | { name: 'season' }
  | { name: 'journal' }
  | { name: 'stats' }
  | { name: 'badges' }
  | { name: 'settings'; section?: string }
  | { name: 'anime'; id: number }
  | { name: 'studio'; studio: string }
  | { name: 'person'; kind: 'character' | 'staff'; id: number }

/** L'identité d'une page : deux routes de même clé montrent la même chose. */
export function routeKeyOf(route: Route): string {
  switch (route.name) {
    case 'person':
      return `person-${route.kind}-${route.id}`
    case 'anime':
      return `anime-${route.id}`
    case 'studio':
      return `studio-${route.studio}`
    case 'library':
      return `library-${route.genre ?? ''}`
    case 'manga':
      return `manga-${route.tab ?? ''}`
    default:
      return route.name
  }
}

export interface Toast {
  id: number
  message: string
  kind: 'ok' | 'error' | 'info'
  /** Un bouton dans la notification, « Annuler » le plus souvent. */
  action?: { label: string; run: () => void }
}

type Undoable = { label: string; run: () => Promise<void> }

interface AppState {
  ready: boolean
  route: Route
  stack: Route[]
  /** Les pages quittées par « Retour », que « Suivant » rouvre. */
  forwardStack: Route[]
  /** Arrivé par « Retour » ou « Suivant » : la page reprend sa position. */
  returning: boolean
  prefs: Prefs
  entries: Map<number, Entry>
  media: Map<number, Media>
  watched: Map<number, Set<number>>
  /**
   * Où en est l'épisode qui joue, quel que soit le lecteur.
   *
   * Poussé par le processus principal : lui seul voit la vidéo, qui vit dans
   * une autre fenêtre. `null` quand rien ne joue.
   */
  progress: WatchProgress | null
  /**
   * La série qu'on vient de terminer, le temps de proposer la suite.
   *
   * Repérée ici, au retour de chaque écriture, plutôt que dans chaque bouton :
   * une série se termine depuis la fiche, la grille, une carte, la coche
   * automatique d'Anime-Sama ou la télécommande, et un seul endroit voit
   * passer tous ces chemins.
   */
  finished: number | null
  events: WatchEvent[]
  lists: CustomList[]
  toasts: Toast[]
  paletteOpen: boolean
  /** L'aide des raccourcis, ouvrable par `?` comme depuis les Réglages. */
  helpOpen: boolean

  init: () => Promise<void>
  navigate: (route: Route) => void
  back: () => void
  forward: () => void
  setPrefs: (patch: Partial<Prefs>) => Promise<void>
  setPalette: (open: boolean) => void
  setHelp: (open: boolean) => void
  toast: (message: string, kind?: Toast['kind'], action?: Toast['action']) => void
  /**
   * Annonce un geste qu'on peut défaire, avec « Annuler » à portée de clic.
   * `Ctrl+Z` existait déjà, mais un raccourci qu'on ne voit nulle part ne
   * rattrape pas le clic de travers de quelqu'un qui ne le connaît pas.
   */
  offerUndo: (message: string, held: Undoable) => void
  dismissToast: (id: number) => void
  dismissFinished: () => void

  /**
   * La dernière action sur la progression, et de quoi la défaire.
   *
   * Seuls les gestes qui peuvent effacer du visionnage sont réversibles :
   * cocher, cocher jusqu'ici, tout réinitialiser. Ce sont les seuls qu'un clic
   * de travers rend coûteux, et l'historique est ce que ce projet promet de ne
   * jamais perdre.
   */
  undoable: Undoable | null
  runUndo: () => Promise<void>

  saveEntry: (animeId: number, patch: EntryPatch, media?: Media) => Promise<void>
  removeEntry: (animeId: number) => Promise<void>
  /**
   * `media` : la fiche de la série, à transmettre quand on coche depuis un
   * écran qui l'a sous la main. Sans elle, une série absente de la
   * bibliothèque y entre sans son nombre d'épisodes — et ne peut alors jamais
   * passer « Terminé », ni savoir qu'il n'y a pas d'épisode suivant.
   */
  toggleEpisode: (animeId: number, episode: number, media?: Media) => Promise<void>
  markUpTo: (animeId: number, episode: number, media?: Media) => Promise<void>
  clearProgress: (animeId: number) => Promise<void>
  startRewatch: (animeId: number) => Promise<void>
  cancelRewatch: (animeId: number) => Promise<void>
  updateEvent: (ref: WatchEventRef, patch: WatchEventPatch) => Promise<void>
  removeEvent: (ref: WatchEventRef) => Promise<void>

  createList: (name: string, emoji?: string) => Promise<CustomList | null>
  updateList: (id: string, patch: { name?: string; emoji?: string }) => Promise<void>
  deleteList: (id: string) => Promise<void>
  setListMembership: (id: string, animeIds: number[], member: boolean) => Promise<void>

  bulkPatch: (animeIds: number[], patch: EntryPatch) => Promise<number>
  bulkRemove: (animeIds: number[]) => Promise<number>
  bulkMarkWatched: (animeIds: number[]) => Promise<number>
}

function applyTheme(prefs: Prefs): void {
  const root = document.documentElement
  const theme = THEMES.find((t) => t.id === prefs.theme)
  root.dataset.theme = prefs.theme
  root.dataset.tone = theme?.light ? 'light' : 'dark'
  root.dataset.layout = prefs.layout
  // La couleur du thème n'est qu'un point de départ : choisir un thème la copie
  // dans les réglages (voir Settings), et l'utilisateur peut ensuite la changer.
  root.style.setProperty('--accent', prefs.accent)
  root.style.setProperty('--accent-2', secondaryFor(prefs.accent))
  document.body.classList.toggle('mica', prefs.mica)
  document.body.classList.toggle('reduce-motion', prefs.reduceMotion)
}

function indexSnapshot(snapshot: Snapshot): Pick<AppState, 'entries' | 'media' | 'watched' | 'events' | 'lists'> {
  const entries = new Map(snapshot.entries.map((e) => [e.animeId, e]))
  const watched = new Map<number, Set<number>>()

  for (const ev of snapshot.history) {
    // Only the pass being watched shows as ticked; earlier viewings stay in the
    // history for watch time and notes without filling the grid again.
    if ((ev.pass ?? 0) !== (entries.get(ev.animeId)?.rewatches ?? 0)) continue
    let set = watched.get(ev.animeId)
    if (!set) watched.set(ev.animeId, (set = new Set()))
    set.add(ev.episode)
  }

  return {
    entries,
    media: new Map(snapshot.media.map((m) => [m.id, m])),
    watched,
    events: snapshot.history,
    lists: snapshot.lists ?? []
  }
}

/**
 * « À jour » : la coche vient de rattraper la diffusion.
 *
 * Le moment où l'on se demande « et le prochain, c'est quand ? ». La réponse
 * est dans la fiche, mais on n'y est pas forcément : une carte de l'accueil,
 * la grille du calendrier. Dit une fois, à la coche qui rattrape, pas à
 * chacune.
 */
function caughtUpNotice(state: AppState, animeId: number, media: Media | undefined): string | null {
  const next = media?.nextAiring
  if (!media || !next || next.episode <= 1) return null
  const seen = state.watched.get(animeId)
  for (let ep = 1; ep < next.episode; ep += 1) if (!seen?.has(ep)) return null
  const when = airingLabel(next.airingAt)
  const warned = state.prefs.notifications && state.entries.get(animeId)?.notify !== false
  return `À jour sur ${titleOf(media, state.prefs.titleLang)}. Épisode ${next.episode} ${when.charAt(0).toLowerCase()}${when.slice(1)}${warned ? ' : tu seras prévenu.' : '.'}`
}

let toastSeq = 0
let refreshTimer: ReturnType<typeof setTimeout> | null = null

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  route: { name: 'home' },
  stack: [],
  forwardStack: [],
  returning: false,
  prefs: DEFAULT_PREFS,
  entries: new Map(),
  media: new Map(),
  watched: new Map(),
  progress: null,
  finished: null,
  events: [],
  lists: [],
  toasts: [],
  paletteOpen: false,
  helpOpen: false,
  undoable: null,

  init: async () => {
    const [snapshot, prefs] = await Promise.all([window.api.library.snapshot(), window.api.prefs.get()])
    applyTheme(prefs)
    set({ ...indexSnapshot(snapshot), prefs, ready: true })

    // The main process owns the data; every mutation echoes back here.
    window.api.library.onChange(() => {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(async () => {
        refreshTimer = null
        const before = get().entries
        const fresh = indexSnapshot(await window.api.library.snapshot())
        // Passée « terminée » dans cette écriture — y compris un film jamais
        // ajouté, terminé d'une seule coche. Une seule à la fois : un import ou
        // un « tout marquer » groupé en termine vingt, et vingt modales
        // n'aideraient personne.
        const done = [...fresh.entries.values()].filter(
          (e) => e.status === 'completed' && before.get(e.animeId)?.status !== 'completed'
        )
        set(done.length === 1 ? { ...fresh, finished: done[0].animeId } : fresh)
      }, 120)
    })

    // Demandé une fois puis écouté : une fiche ouverte au milieu d'un épisode
    // doit montrer le remplissage tout de suite, sans attendre le tour suivant.
    void window.api.videos.progress().then((p) => set({ progress: p }))
    window.api.videos.onProgress((p) => set({ progress: p }))

    window.api.app.onOpenAnime((id) => get().navigate({ name: 'anime', id }))
    window.api.app.onGoto((route) => get().navigate(route as Route))

    // The sweep runs unattended, so it has to say what it did.
    window.api.anime.onSequelsAdded((added) => {
      if (!added.length) return
      get().toast(
        added.length === 1
          ? `Nouvelle saison ajoutée : ${added[0].title.romaji}`
          : `${added.length} nouvelles saisons ajoutées à ta bibliothèque`,
        'ok'
      )
    })
  },

  navigate: (route) => {
    const current = get().route
    if (current.name === route.name && JSON.stringify(current) === JSON.stringify(route)) return
    rememberScroll(routeKeyOf(current))
    set({
      route,
      stack: [...get().stack, current].slice(-30),
      // Comme un navigateur : un nouveau chemin efface l'avenir de l'ancien.
      forwardStack: [],
      returning: false,
      paletteOpen: false
    })
  },

  back: () => {
    const { stack, route: current } = get()
    rememberScroll(routeKeyOf(current))
    if (!stack.length) {
      if (current.name === 'home') return
      return set({ route: { name: 'home' }, forwardStack: [current, ...get().forwardStack], returning: false })
    }
    set({
      route: stack[stack.length - 1],
      stack: stack.slice(0, -1),
      forwardStack: [current, ...get().forwardStack].slice(0, 30),
      returning: true
    })
  },

  forward: () => {
    const { forwardStack, route: current } = get()
    if (!forwardStack.length) return
    rememberScroll(routeKeyOf(current))
    set({
      route: forwardStack[0],
      forwardStack: forwardStack.slice(1),
      stack: [...get().stack, current].slice(-30),
      returning: true
    })
  },

  setPrefs: async (patch) => {
    const prefs = await window.api.prefs.set(patch)
    applyTheme(prefs)
    set({ prefs })
  },

  setPalette: (paletteOpen) => set({ paletteOpen }),
  setHelp: (helpOpen) => set({ helpOpen }),

  toast: (message, kind = 'ok', action) => {
    const id = (toastSeq += 1)
    set({ toasts: [...get().toasts, { id, message, kind, action }] })
    // Plus longtemps quand il y a un bouton : le temps de lire, puis de viser.
    setTimeout(() => get().dismissToast(id), action ? 8000 : 4200)
  },

  offerUndo: (message, held) => {
    set({ undoable: held })
    get().toast(message, 'ok', {
      label: 'Annuler',
      run: () => {
        // Un geste plus récent a pris la place : ce bouton ne défait plus rien.
        if (get().undoable !== held) return get().toast('Plus rien à annuler ici.', 'info')
        void get().runUndo()
      }
    })
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  saveEntry: async (animeId, patch, media) => {
    await window.api.library.setEntry(animeId, patch, media)
  },

  dismissFinished: () => set({ finished: null }),

  removeEntry: async (animeId) => {
    await window.api.library.removeEntry(animeId)
  },

  runUndo: async () => {
    const held = get().undoable
    if (!held) {
      get().toast('Rien à annuler.', 'info')
      return
    }
    set({ undoable: null })
    await held.run()
    get().toast(`Annulé : ${held.label}`, 'ok')
  },

  // Optimistic: ticking an episode must feel instant, the echo reconciles it.
  toggleEpisode: async (animeId, episode, media) => {
    const watched = new Map(get().watched)
    const set0 = new Set(watched.get(animeId) ?? [])
    const next = !set0.has(episode)
    if (next) set0.add(episode)
    else set0.delete(episode)
    watched.set(animeId, set0)
    set({
      watched,
      undoable: {
        label: next ? `épisode ${episode} coché` : `épisode ${episode} décoché`,
        run: async () => {
          await get().toggleEpisode(animeId, episode)
          // Défaire ne doit pas devenir l'action à défaire.
          set({ undoable: null })
        }
      }
    })
    // Avant la coche, pas après : c'est au moment de l'écrire que la
    // bibliothèque décide du statut, et il lui faut le total pour ça.
    if (next && media && !get().media.has(animeId)) await window.api.library.setEntry(animeId, {}, media)
    await window.api.library.setWatched(animeId, episode, next)
    // Seulement à la coche qui rattrape : l'épisode juste avant celui à venir.
    const known = media ?? get().media.get(animeId)
    if (next && known?.nextAiring?.episode === episode + 1) {
      const notice = caughtUpNotice(get(), animeId, known)
      if (notice) get().toast(notice, 'info')
    }
  },

  markUpTo: async (animeId, episode, media) => {
    const watched = new Map(get().watched)
    const set0 = new Set(watched.get(animeId) ?? [])
    // Ceux qui n'y étaient pas : ce sont les seuls à retirer si on annule.
    const added: number[] = []
    for (let ep = 1; ep <= episode; ep += 1) {
      if (!set0.has(ep)) added.push(ep)
      set0.add(ep)
    }
    watched.set(animeId, set0)
    const label = `${added.length} épisode${added.length > 1 ? 's' : ''} coché${added.length > 1 ? 's' : ''}`
    const held: Undoable = {
      label,
      run: async () => {
        for (const ep of added) await window.api.library.setWatched(animeId, ep, false)
        set({ undoable: null })
      }
    }
    set({ watched, undoable: added.length ? held : null })
    // Un seul épisode se voit et se décoche d'un clic ; plusieurs, non.
    if (added.length > 1) get().offerUndo(label.charAt(0).toUpperCase() + label.slice(1), held)
    if (media && !get().media.has(animeId)) await window.api.library.setEntry(animeId, {}, media)
    await window.api.library.setWatchedUpTo(animeId, episode)
    const known = media ?? get().media.get(animeId)
    if (known?.nextAiring?.episode === episode + 1) {
      const notice = caughtUpNotice(get(), animeId, known)
      if (notice) get().toast(notice, 'info')
    }
  },

  clearProgress: async (animeId) => {
    const watched = new Map(get().watched)
    // La liste effacée est le seul moyen de la remettre : le disque, lui, ne
    // la connaît déjà plus.
    const lost = [...(watched.get(animeId) ?? [])]
    watched.set(animeId, new Set())
    const held: Undoable = {
      label: `progression effacée (${lost.length} épisode${lost.length > 1 ? 's' : ''})`,
      run: async () => {
        for (const ep of lost) await window.api.library.setWatched(animeId, ep, true)
        set({ undoable: null })
      }
    }
    set({ watched })
    if (lost.length) get().offerUndo(`Progression effacée (${lost.length} épisode${lost.length > 1 ? 's' : ''})`, held)
    else set({ undoable: null })
    await window.api.library.clearWatched(animeId)
  },

  // The grid empties at once; the echo brings back the new pass number.
  startRewatch: async (animeId) => {
    const watched = new Map(get().watched)
    watched.set(animeId, new Set())
    set({ watched })
    await window.api.library.startRewatch(animeId)
  },

  cancelRewatch: async (animeId) => {
    await window.api.library.cancelRewatch(animeId)
  },

  updateEvent: async (ref, patch) => {
    await window.api.library.updateEvent(ref, patch)
  },

  removeEvent: async (ref) => {
    await window.api.library.removeEvent(ref)
  },

  createList: (name, emoji) => window.api.lists.create(name, emoji),

  updateList: async (id, patch) => {
    await window.api.lists.update(id, patch)
  },

  deleteList: async (id) => {
    await window.api.lists.remove(id)
  },

  setListMembership: async (id, animeIds, member) => {
    await window.api.lists.membership(id, animeIds, member)
  },

  bulkPatch: async (animeIds, patch) => {
    // Les seuls champs touchés, tels qu'ils étaient, série par série.
    const keys = Object.keys(patch) as (keyof EntryPatch)[]
    const before = animeIds.map((id) => {
      const entry = get().entries.get(id)
      return { id, values: Object.fromEntries(keys.map((k) => [k, entry?.[k]])) }
    })
    const n = await window.api.library.setEntries(animeIds, patch)
    set({
      undoable: {
        label: `modification de ${n} série${n > 1 ? 's' : ''}`,
        run: async () => {
          for (const { id, values } of before) await window.api.library.setEntry(id, values)
          set({ undoable: null })
        }
      }
    })
    return n
  },
  bulkRemove: (animeIds) => window.api.library.removeEntries(animeIds),
  bulkMarkWatched: async (animeIds) => {
    const before = new Map(animeIds.map((id) => [id, new Set(get().watched.get(id) ?? [])]))
    const n = await window.api.library.markAllWatched(animeIds)
    set({
      undoable: {
        label: `épisodes cochés sur ${n} série${n > 1 ? 's' : ''}`,
        // Lu au moment d'annuler : l'écho de l'écriture a eu le temps d'arriver.
        run: async () => {
          for (const [id, had] of before) {
            for (const ep of get().watched.get(id) ?? []) {
              if (!had.has(ep)) await window.api.library.setWatched(id, ep, false)
            }
          }
          set({ undoable: null })
        }
      }
    })
    return n
  }
}))

// ---------------------------------------------------------------- selectors

export function progressOf(state: AppState, animeId: number): number {
  return state.watched.get(animeId)?.size ?? 0
}

/** First unseen episode, capped at the known episode count (null when finished). */
export function nextEpisodeOf(state: AppState, animeId: number, total: number | null): number | null {
  const seen = state.watched.get(animeId)
  const limit = total ?? Number.MAX_SAFE_INTEGER
  for (let ep = 1; ep <= limit; ep += 1) {
    if (!seen?.has(ep)) return ep
  }
  return null
}

export function isTracked(state: AppState, animeId: number): boolean {
  return state.entries.has(animeId)
}
