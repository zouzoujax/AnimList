import { BrowserWindow, Notification } from 'electron'
import { airing } from './anilist'
import { getPrefs, setPrefs, snapshot } from './store'

const CHECK_INTERVAL = 30 * 60_000
const MAX_TOASTS = 4

/** Shows a toast for every episode of a followed show that aired since the last check. */
async function check(win: BrowserWindow): Promise<void> {
  const prefs = getPrefs()
  if (!prefs.notifications || !Notification.isSupported()) return

  const data = snapshot()
  const followed = data.entries.filter((e) => e.status === 'watching' || e.status === 'planned').map((e) => e.animeId)
  if (!followed.length) return

  const now = Math.floor(Date.now() / 1000)
  const since = prefs.lastAiringCheck || now - 24 * 3600
  if (now - since < 300) return

  let fresh: Awaited<ReturnType<typeof airing>>
  try {
    fresh = await airing(followed.slice(0, 200), since, now)
  } catch {
    return
  }
  setPrefs({ lastAiringCheck: now })
  if (!fresh.length) return

  const byId = new Map(data.media.map((m) => [m.id, m]))
  const lang = prefs.titleLang

  for (const item of fresh.slice(0, MAX_TOASTS)) {
    const media = byId.get(item.mediaId)
    if (!media) continue
    const title =
      (lang === 'english' && media.title.english) || (lang === 'native' && media.title.native) || media.title.romaji

    const toast = new Notification({
      title: `Épisode ${item.episode} disponible`,
      body: title,
      silent: false
    })
    toast.on('click', () => {
      if (win.isDestroyed()) return
      if (win.isMinimized()) win.restore()
      win.focus()
      win.webContents.send('nav:open-anime', item.mediaId)
    })
    toast.show()
  }

  if (fresh.length > MAX_TOASTS) {
    new Notification({
      title: 'AnimeList',
      body: `${fresh.length - MAX_TOASTS} autres épisodes sont sortis depuis ta dernière visite.`
    }).show()
  }
}

export function startAiringWatcher(win: BrowserWindow): () => void {
  const kick = (): void => {
    check(win).catch((err) => console.error('[airing]', err))
  }
  const first = setTimeout(kick, 20_000)
  const timer = setInterval(kick, CHECK_INTERVAL)
  return () => {
    clearTimeout(first)
    clearInterval(timer)
  }
}
