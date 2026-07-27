/**
 * Finds the useful files inside an export folder.
 *
 * TV Time and OpenTV both hand out a zip whose layout varies: sometimes the
 * CSVs sit at the root, sometimes one level down in a `… Backup` directory, and
 * unzipping tools often add a wrapper folder of their own. Rather than demand
 * an exact path, the picker accepts anything near the export and looks around.
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

export interface ExportLocation {
  /** Directory the files were found in. */
  folder: string
  shows: string
  tracking: string
  extras: string | null
}

const SHOWS_FILE = 'user_tv_show_data.csv'
const TRACKING_FILE = 'tracking-prod-records-v2.csv'
const EXTRAS_FILE = '_opentv_extras.json'

/** Deep enough for a wrapper folder plus the export's own subfolder. */
const MAX_DEPTH = 3

/** Skipping these keeps a mistakenly picked home directory from taking minutes. */
const SKIP = new Set(['node_modules', '.git', 'AppData', 'Windows', '$Recycle.Bin'])

async function findFolder(dir: string, depth: number): Promise<string | null> {
  let items: import('node:fs').Dirent[]
  try {
    items = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return null
  }

  const names = new Set(items.filter((i) => i.isFile()).map((i) => i.name))
  if (names.has(SHOWS_FILE) && names.has(TRACKING_FILE)) return dir
  if (depth >= MAX_DEPTH) return null

  for (const item of items) {
    if (!item.isDirectory() || SKIP.has(item.name) || item.name.startsWith('.')) continue
    const found = await findFolder(join(dir, item.name), depth + 1)
    if (found) return found
  }
  return null
}

/** Reads a file that may legitimately be absent. */
async function readOptional(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, 'utf8')
  } catch {
    return null
  }
}

/**
 * Locates and reads an export under `root`.
 *
 * Returns `null` when the two required files are nowhere to be found, which the
 * caller turns into an explanation naming the files it expected.
 */
export async function locateExport(root: string): Promise<ExportLocation | null> {
  const folder = await findFolder(root, 0)
  if (!folder) return null

  const [shows, tracking, extras] = await Promise.all([
    fs.readFile(join(folder, SHOWS_FILE), 'utf8'),
    fs.readFile(join(folder, TRACKING_FILE), 'utf8'),
    readOptional(join(folder, EXTRAS_FILE))
  ])

  return { folder, shows, tracking, extras }
}

export const EXPECTED_FILES = [SHOWS_FILE, TRACKING_FILE]
