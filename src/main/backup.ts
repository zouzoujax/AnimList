import { BrowserWindow, dialog, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { basename } from 'node:path'
import type { Entry, ImportReport, LibraryStatus, Snapshot, WatchEvent } from '@shared/types'
import { mediaByMalIds } from './anilist'
import { dbPath, importSnapshot, snapshot } from './store'

export async function exportData(win: BrowserWindow): Promise<ImportReport> {
  const stamp = new Date().toISOString().slice(0, 10)
  const res = await dialog.showSaveDialog(win, {
    title: 'Exporter ma bibliothèque',
    defaultPath: `animelist-${stamp}.json`,
    filters: [{ name: 'Sauvegarde AnimeList', extensions: ['json'] }]
  })
  if (res.canceled || !res.filePath) {
    return { ok: false, message: 'Export annulé', added: 0, updated: 0, episodes: 0, skipped: 0 }
  }
  const data = snapshot()
  await fs.writeFile(res.filePath, JSON.stringify(data, null, 2), 'utf8')
  return {
    ok: true,
    message: `Sauvegarde écrite dans ${basename(res.filePath)}`,
    added: data.entries.length,
    updated: 0,
    episodes: data.history.length,
    skipped: 0
  }
}

export async function importData(win: BrowserWindow, mode: 'merge' | 'replace'): Promise<ImportReport> {
  const res = await dialog.showOpenDialog(win, {
    title: 'Restaurer une sauvegarde',
    properties: ['openFile'],
    filters: [{ name: 'Sauvegarde AnimeList', extensions: ['json'] }]
  })
  if (res.canceled || !res.filePaths[0]) {
    return { ok: false, message: 'Import annulé', added: 0, updated: 0, episodes: 0, skipped: 0 }
  }
  try {
    const parsed = JSON.parse(await fs.readFile(res.filePaths[0], 'utf8')) as Snapshot
    if (!Array.isArray(parsed.entries)) throw new Error('Format inattendu')
    importSnapshot(parsed, mode)
    return {
      ok: true,
      message: mode === 'replace' ? 'Bibliothèque remplacée' : 'Sauvegarde fusionnée',
      added: parsed.entries.length,
      updated: 0,
      episodes: parsed.history?.length ?? 0,
      skipped: 0
    }
  } catch (err) {
    return {
      ok: false,
      message: `Fichier illisible : ${(err as Error).message}`,
      added: 0,
      updated: 0,
      episodes: 0,
      skipped: 0
    }
  }
}

// ---------------------------------------------------------------- MyAnimeList

const MAL_STATUS: Record<string, LibraryStatus> = {
  Watching: 'watching',
  Completed: 'completed',
  'On-Hold': 'paused',
  Dropped: 'dropped',
  'Plan to Watch': 'planned'
}

interface MalRow {
  malId: number
  watched: number
  score: number
  status: LibraryStatus
  start: number | null
  finish: number | null
  rewatches: number
}

function tagValue(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))
  if (!m) return null
  return m[1]
    .replace(/^\s*<!\[CDATA\[/, '')
    .replace(/\]\]>\s*$/, '')
    .trim()
}

function malDate(value: string | null): number | null {
  if (!value || value.startsWith('0000')) return null
  const t = Date.parse(`${value}T12:00:00`)
  return Number.isNaN(t) ? null : t
}

function parseMalXml(xml: string): MalRow[] {
  const rows: MalRow[] = []
  for (const match of xml.matchAll(/<anime>([\s\S]*?)<\/anime>/g)) {
    const block = match[1]
    const malId = Number(tagValue(block, 'series_animedb_id'))
    if (!malId) continue
    rows.push({
      malId,
      watched: Number(tagValue(block, 'my_watched_episodes') ?? 0) || 0,
      score: Number(tagValue(block, 'my_score') ?? 0) || 0,
      status: MAL_STATUS[tagValue(block, 'my_status') ?? ''] ?? 'planned',
      start: malDate(tagValue(block, 'my_start_date')),
      finish: malDate(tagValue(block, 'my_finish_date')),
      rewatches: Number(tagValue(block, 'my_times_watched') ?? 0) || 0
    })
  }
  return rows
}

/**
 * MAL only records a start and a finish date, so episode timestamps are spread evenly
 * between them. That keeps the yearly charts and streaks meaningful instead of
 * collapsing an entire backlog onto the import date.
 */
function spreadWatchDates(row: MalRow, count: number, fallback: number): number[] {
  const end = row.finish ?? row.start ?? fallback
  const start = row.start ?? end
  if (count <= 1) return [end]
  const span = Math.max(end - start, 0)
  return Array.from({ length: count }, (_, i) => start + Math.round((span * i) / (count - 1)))
}

export async function importMal(win: BrowserWindow): Promise<ImportReport> {
  const res = await dialog.showOpenDialog(win, {
    title: 'Importer un export MyAnimeList',
    properties: ['openFile'],
    filters: [{ name: 'Export MyAnimeList', extensions: ['xml', 'gz'] }]
  })
  if (res.canceled || !res.filePaths[0]) {
    return { ok: false, message: 'Import annulé', added: 0, updated: 0, episodes: 0, skipped: 0 }
  }

  const path = res.filePaths[0]
  let xml: string
  try {
    const buf = await fs.readFile(path)
    xml = path.endsWith('.gz') ? gunzipSync(buf).toString('utf8') : buf.toString('utf8')
  } catch (err) {
    return {
      ok: false,
      message: `Lecture impossible : ${(err as Error).message}`,
      added: 0,
      updated: 0,
      episodes: 0,
      skipped: 0
    }
  }

  const rows = parseMalXml(xml)
  if (!rows.length) {
    return {
      ok: false,
      message: 'Aucune entrée trouvée — attends-toi à un fichier animelist_*.xml exporté depuis MyAnimeList.',
      added: 0,
      updated: 0,
      episodes: 0,
      skipped: 0
    }
  }

  let resolved: Map<number, import('@shared/types').Media>
  try {
    resolved = await mediaByMalIds(rows.map((r) => r.malId))
  } catch (err) {
    return {
      ok: false,
      message: `AniList injoignable : ${(err as Error).message}`,
      added: 0,
      updated: 0,
      episodes: 0,
      skipped: 0
    }
  }

  const now = Date.now()
  const entries: Entry[] = []
  const history: WatchEvent[] = []
  const media = [...resolved.values()]
  let skipped = 0

  for (const row of rows) {
    const found = resolved.get(row.malId)
    if (!found) {
      skipped += 1
      continue
    }
    entries.push({
      animeId: found.id,
      status: row.status,
      addedAt: row.start ?? now,
      updatedAt: now,
      score: row.score > 0 ? row.score : null,
      emotions: [],
      favorite: false,
      notes: '',
      rewatches: row.rewatches,
      startedAt: row.start,
      finishedAt: row.finish
    })

    const total = Math.min(row.watched, found.episodes ?? row.watched)
    if (total > 0) {
      const stamps = spreadWatchDates(row, total, now)
      const minutes = found.duration || 24
      for (let ep = 1; ep <= total; ep += 1) {
        history.push({ animeId: found.id, episode: ep, at: stamps[ep - 1] ?? now, minutes, imported: true })
      }
    }
  }

  importSnapshot({ version: 1, entries, media, history, prefs: {} as never }, 'merge')

  return {
    ok: true,
    message: skipped
      ? `${entries.length} animes importés. ${skipped} sans équivalent AniList ont été ignorés.`
      : `${entries.length} animes importés depuis MyAnimeList.`,
    added: entries.length,
    updated: 0,
    episodes: history.length,
    skipped
  }
}

export function revealDataFolder(): void {
  shell.showItemInFolder(dbPath())
}
