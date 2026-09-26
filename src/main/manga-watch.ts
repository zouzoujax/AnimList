/**
 * Les nouvelles des mangas suivis : une fin de parution, une adaptation animée.
 *
 * Un passage par jour, en file de fond, sur le modèle des suites. Ce qui
 * décide d'annoncer est dans `shared/manga-watch.ts` ; ici, on interroge
 * AniList, on garde le relevé et on fait sonner.
 *
 * Le passage rafraîchit aussi les fiches en cache : c'est lui qui apprend
 * qu'une série finie a désormais un total, et la jauge de « Ma lecture » le
 * suit sans qu'on ait à rouvrir la fiche.
 */

import { BrowserWindow, Notification } from 'electron'
import { mangaNews, type MangaNews, type MangaNow } from '@shared/manga-watch'
import type { Manga } from '@shared/types'
import { mangaWatch, refreshMedia } from './anilist'
import { cacheMangas, getPrefs, setEntry, setPrefs, snapshot } from './store'

export interface MangaSweep {
  news: MangaNews[]
  checked: number
}

/** Ne lève jamais : ça tourne sans personne devant, une panne ne doit rien casser. */
export async function sweepMangas(win: BrowserWindow | null): Promise<MangaSweep> {
  const data = snapshot()
  const entries = data.mangaEntries ?? []
  if (!entries.length) return { news: [], checked: 0 }

  let found: Awaited<ReturnType<typeof mangaWatch>>
  try {
    found = await mangaWatch(entries.map((e) => e.mangaId))
  } catch (err) {
    console.error('[mangas]', (err as Error).message)
    return { news: [], checked: entries.length }
  }

  cacheMangas([...found.values()].map((f) => f.manga))

  const now = new Map<number, MangaNow>(
    [...found].map(([id, f]) => [
      id,
      { status: f.manga.status, chapters: f.manga.chapters, adaptations: f.adaptations }
    ])
  )
  const own = new Set(data.entries.map((e) => e.animeId))
  const { news, seen } = mangaNews(entries, getPrefs().mangaSeen, now, own)
  setPrefs({ mangaSeen: seen, lastMangaSweep: Date.now() })

  if (win && !win.isDestroyed() && getPrefs().notifications && Notification.isSupported()) {
    const mangas = new Map([...found].map(([id, f]) => [id, f.manga]))
    for (const item of news.slice(0, 4)) announce(win, item, mangas.get(item.mangaId))
  }
  return { news, checked: entries.length }
}

function nameOf(manga: Manga | undefined): string {
  if (!manga) return 'Un manga que tu suis'
  const lang = getPrefs().titleLang
  if (lang === 'native' && manga.title.native) return manga.title.native
  if (lang === 'english' && manga.title.english) return manga.title.english
  return manga.title.romaji
}

function bring(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.focus()
}

function announce(win: BrowserWindow, item: MangaNews, manga: Manga | undefined): void {
  if (item.kind === 'finished') {
    const reste = item.left === null ? '' : item.left === 0 ? ' Tu as tout lu.' : ` Il t’en reste ${item.left} à lire.`
    const note = new Notification({
      title: `${nameOf(manga)} est terminé`,
      body: `La série a fini de paraître${item.total ? ` : ${item.total} chapitres` : ''}.${reste}`
    })
    note.on('click', () => {
      bring(win)
      win.webContents.send('nav:goto', { name: 'manga' })
    })
    note.show()
    return
  }

  const { anime } = item
  const note = new Notification({
    title: 'Une adaptation animée',
    body: `${nameOf(manga)} devient un anime : ${anime.title}.`,
    actions: [{ type: 'button', text: 'Ajouter à ma liste' }]
  })
  // La fiche de l'anime n'est pas en cache : on la demande au moment d'ajouter,
  // plutôt que d'écrire une entrée sans titre ni jaquette.
  note.on('action', () => {
    void refreshMedia([anime.id])
      .then(([media]) => {
        if (media) setEntry(anime.id, { status: 'planned' }, media)
      })
      .catch((err: Error) => console.error('[mangas]', err.message))
  })
  note.on('click', () => {
    bring(win)
    win.webContents.send('nav:open-anime', anime.id)
  })
  note.show()
}

/** Une série ne finit pas deux fois dans l'après-midi : une fois par jour suffit. */
const EVERY_MS = 24 * 3600_000
/** Après les suites, qui partent à 90 s : les deux n'ont pas à se disputer le quota. */
const FIRST_DELAY_MS = 150_000

export function startMangaWatcher(win: BrowserWindow): () => void {
  const kick = (): void => {
    const prefs = getPrefs()
    if (!prefs.mangaAlerts) return
    if (Date.now() - prefs.lastMangaSweep < EVERY_MS) return
    void sweepMangas(win)
  }
  const first = setTimeout(kick, FIRST_DELAY_MS)
  const timer = setInterval(kick, 6 * 3600_000)
  return () => {
    clearTimeout(first)
    clearInterval(timer)
  }
}
