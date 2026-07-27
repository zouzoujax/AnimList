/**
 * Tells the user when an episode of a followed series airs.
 *
 * Two mechanisms, because AniList gives two kinds of information:
 *
 * 1. **Scheduled** — for episodes with a known airing time, a timer fires at
 *    the moment the user asked for (possibly ahead of broadcast). This is what
 *    makes a lead time possible at all.
 * 2. **Catch-up** — a periodic sweep of what aired since the last check, for
 *    everything the schedule missed: the app was closed, the series had no
 *    `nextAiringEpisode`, or the time moved.
 *
 * Muting is per series (`entry.notify === false`) and the poll interval is a
 * preference, so nothing here is a fixed 30 minutes any more.
 */

import { BrowserWindow, Notification } from 'electron'
import type { Media, Prefs } from '@shared/types'
import { airing } from './anilist'
import { getPrefs, setPrefs, snapshot } from './store'

const MAX_TOASTS = 4
/** Beyond this a setTimeout is pointless — the sweep will pick it up instead. */
const MAX_SCHEDULE_AHEAD_MS = 26 * 3600_000
const MIN_POLL_MINUTES = 5

/** Series the user is following and has not muted. */
function followedIds(): number[] {
  return snapshot()
    .entries.filter((e) => (e.status === 'watching' || e.status === 'planned') && e.notify !== false)
    .map((e) => e.animeId)
}

function titleFor(media: Media, lang: Prefs['titleLang']): string {
  if (lang === 'english' && media.title.english) return media.title.english
  if (lang === 'native' && media.title.native) return media.title.native
  return media.title.romaji
}

/** Shows one toast, clicking it opens the series. */
function toast(win: BrowserWindow, animeId: number, title: string, body: string): void {
  if (!Notification.isSupported()) return
  const note = new Notification({ title, body, silent: false })
  note.on('click', () => {
    if (win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.focus()
    win.webContents.send('nav:open-anime', animeId)
  })
  note.show()
}

// ---------------------------------------------------------------- catch-up

/** Announces everything that aired since the previous check. */
async function sweep(win: BrowserWindow): Promise<void> {
  const prefs = getPrefs()
  if (!prefs.notifications || !Notification.isSupported()) return

  const followed = followedIds()
  if (!followed.length) return

  const now = Math.floor(Date.now() / 1000)
  const since = prefs.lastAiringCheck || now - 24 * 3600
  // Two checks in quick succession would announce the same episode twice.
  if (now - since < 300) return

  let fresh: Awaited<ReturnType<typeof airing>>
  try {
    fresh = await airing(followed.slice(0, 200), since, now)
  } catch {
    // Offline: leave `lastAiringCheck` alone so nothing is missed.
    return
  }
  setPrefs({ lastAiringCheck: now })
  if (!fresh.length) return

  const byId = new Map(snapshot().media.map((m) => [m.id, m]))

  for (const item of fresh.slice(0, MAX_TOASTS)) {
    const media = byId.get(item.mediaId)
    if (!media) continue
    toast(win, item.mediaId, `Épisode ${item.episode} disponible`, titleFor(media, prefs.titleLang))
  }

  if (fresh.length > MAX_TOASTS) {
    new Notification({
      title: 'AnimeList',
      body: `${fresh.length - MAX_TOASTS} autres épisodes sont sortis depuis ta dernière visite.`
    }).show()
  }
}

// ---------------------------------------------------------------- scheduled

/** `animeId:episode` already scheduled, so a re-plan does not double up. */
const planned = new Map<string, NodeJS.Timeout>()

function clearPlanned(): void {
  for (const timer of planned.values()) clearTimeout(timer)
  planned.clear()
}

/**
 * Arms a timer for every upcoming episode already known from the media cache.
 *
 * Called again after every store change, so muting a series or adding one takes
 * effect without waiting for the next sweep.
 */
export function planUpcoming(win: BrowserWindow): void {
  clearPlanned()

  const prefs = getPrefs()
  if (!prefs.notifications || !Notification.isSupported()) return

  const lead = Math.max(0, prefs.notifyLeadMinutes) * 60_000
  const allowed = new Set(followedIds())
  const now = Date.now()

  for (const media of snapshot().media) {
    if (!allowed.has(media.id) || !media.nextAiring) continue

    const airsAt = media.nextAiring.airingAt * 1000
    const fireAt = airsAt - lead
    const delay = fireAt - now
    // Already past: the sweep announces it. Too far off: re-planned later.
    if (delay <= 0 || delay > MAX_SCHEDULE_AHEAD_MS) continue

    const episode = media.nextAiring.episode
    const k = `${media.id}:${episode}`
    if (planned.has(k)) continue

    planned.set(
      k,
      setTimeout(() => {
        planned.delete(k)
        const title = titleFor(media, getPrefs().titleLang)
        const body =
          lead > 0 ? `${title} — épisode ${episode} dans ${prefs.notifyLeadMinutes} min` : title
        toast(win, media.id, lead > 0 ? 'Bientôt' : `Épisode ${episode} disponible`, body)
      }, delay)
    )
  }
}

// ---------------------------------------------------------------- lifecycle

export function startAiringWatcher(win: BrowserWindow): () => void {
  let timer: NodeJS.Timeout | null = null

  const kick = (): void => {
    sweep(win)
      .catch((err) => console.error('[airing]', err))
      .finally(() => planUpcoming(win))
  }

  /** Re-armed each time so a change to the interval takes effect immediately. */
  const schedule = (): void => {
    if (timer) clearInterval(timer)
    const minutes = Math.max(MIN_POLL_MINUTES, getPrefs().notifyEveryMinutes || MIN_POLL_MINUTES)
    timer = setInterval(() => {
      kick()
      schedule()
    }, minutes * 60_000)
  }

  const first = setTimeout(kick, 20_000)
  schedule()

  return () => {
    clearTimeout(first)
    if (timer) clearInterval(timer)
    clearPlanned()
  }
}
