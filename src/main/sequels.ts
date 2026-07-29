/**
 * Adds a series' sequels to the library once they have aired.
 *
 * The rules are deliberately conservative, because writing into someone's
 * library on their behalf is easy to get wrong:
 *
 * - Only series the user actually watched. A sequel to something they dropped,
 *   or to something they merely planned and never started, is not wanted.
 * - Only sequels that have started airing. An announced-but-unaired sequel
 *   belongs in Discover, not in a library of things to watch.
 * - Only broadcast formats. A recap film sharing a `SEQUEL` edge is not a new
 *   season.
 * - Never twice. Every id offered is remembered, so a sequel the user deletes
 *   stays deleted instead of reappearing at the next sweep.
 */

import { BrowserWindow, Notification } from 'electron'
import type { Entry, LibraryStatus, Media } from '@shared/types'
import { sequelsOf } from './anilist'
import { getPrefs, setEntry, setPrefs, snapshot } from './store'

/** Statuses that mean "this person watched it", so a sequel is welcome. */
const FOLLOWED: LibraryStatus[] = ['watching', 'completed', 'paused']

/** A new season airs; a recap film or a special does not make one. */
const BROADCAST = new Set(['TV', 'ONA', 'TV_SHORT'])

/** Out already, or out right now — not merely announced. */
const RELEASED = new Set(['RELEASING', 'FINISHED'])

export interface SequelSweep {
  added: Media[]
  /** Series examined, for the report. */
  checked: number
}

const isWanted = (media: Media): boolean => BROADCAST.has(media.format ?? '') && RELEASED.has(media.status ?? '')

/**
 * Looks for aired sequels of everything the user follows and adds the new ones.
 *
 * Never throws: this runs unattended, and a network failure must not take the
 * app down or leave the library half-written.
 */
export async function sweepSequels(win: BrowserWindow | null): Promise<SequelSweep> {
  const prefs = getPrefs()
  const data = snapshot()

  const own = new Set(data.entries.map((e) => e.animeId))
  const offered = new Set(prefs.sequelsAdded)
  const sources = data.entries.filter((e: Entry) => FOLLOWED.includes(e.status)).map((e) => e.animeId)

  if (!sources.length) return { added: [], checked: 0 }

  let found: Map<number, Media[]>
  try {
    found = await sequelsOf(sources)
  } catch (err) {
    console.error('[sequels]', (err as Error).message)
    return { added: [], checked: sources.length }
  }

  const added: Media[] = []
  // Every relation seen is recorded, not only the ones added: the library folds
  // sequels behind their parent season, and that has to work for seasons the
  // user added by hand long before this sweep ever ran.
  const parentOf: Record<string, number> = { ...prefs.sequelOf }

  for (const [parent, sequels] of found) {
    for (const media of sequels) {
      if (isWanted(media) && media.id !== parent) parentOf[media.id] = parent
      if (own.has(media.id) || offered.has(media.id) || !isWanted(media)) continue
      // Marked as offered before it is added, so a failure halfway cannot cause
      // the same series to be proposed again on the next run.
      offered.add(media.id)
      own.add(media.id)
      setEntry(media.id, { status: 'planned' }, media)
      added.push(media)
    }
  }

  setPrefs({ sequelsAdded: [...offered], sequelOf: parentOf, lastSequelSweep: Date.now() })

  if (added.length && win && !win.isDestroyed()) {
    announce(win, added, prefs.titleLang)
  }
  return { added, checked: sources.length }
}

function announce(win: BrowserWindow, added: Media[], lang: 'romaji' | 'english' | 'native'): void {
  const name = (media: Media): string =>
    (lang === 'english' && media.title.english) || (lang === 'native' && media.title.native) || media.title.romaji

  win.webContents.send('sequels:added', added)

  if (!Notification.isSupported() || !getPrefs().notifications) return
  const note = new Notification({
    title: added.length === 1 ? 'Une suite est sortie' : `${added.length} suites sont sorties`,
    body:
      added.length === 1
        ? `${name(added[0])} a été ajoutée à ta bibliothèque.`
        : `${added.map(name).slice(0, 3).join(', ')}… ajoutées à ta bibliothèque.`
  })
  note.on('click', () => {
    if (win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.focus()
    win.webContents.send('nav:open-anime', added[0].id)
  })
  note.show()
}

/** Once a day is plenty: a season does not start twice in an afternoon. */
const EVERY_MS = 24 * 3600_000
/** Late enough not to compete with the first paint or the airing sweep. */
const FIRST_DELAY_MS = 90_000

export function startSequelWatcher(win: BrowserWindow): () => void {
  const kick = (): void => {
    const prefs = getPrefs()
    if (!prefs.autoSequels) return
    // The daily guard is skipped while no relation is known: the library needs
    // that map to fold seasons, and waiting a day for the first one is silly.
    const cold = Object.keys(prefs.sequelOf).length === 0
    if (!cold && Date.now() - prefs.lastSequelSweep < EVERY_MS) return
    void sweepSequels(win)
  }

  const first = setTimeout(kick, FIRST_DELAY_MS)
  const timer = setInterval(kick, 6 * 3600_000)
  return () => {
    clearTimeout(first)
    clearInterval(timer)
  }
}
