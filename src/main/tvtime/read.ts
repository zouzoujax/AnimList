/**
 * Turns the raw TV Time / OpenTV export into the shape the importer works on.
 *
 * The export is a folder of CSVs plus, for OpenTV, a JSON side-file. Only three
 * pieces matter: the list of followed series, the per-episode tracking records,
 * and the date a series was added. Everything else in the export is account
 * data the importer has no business reading.
 *
 * Pure on purpose — it takes file *contents*, so the whole shape of a real
 * export can be exercised in tests without touching a disk.
 */

import { parseCsv } from './csv'

/** One followed series, with its watched episodes grouped by source season. */
export interface SourceShow {
  /** TheTVDB id, as written in the export. */
  id: string
  name: string
  favorite: boolean
  addedAt: number | null
  /** Watch timestamps, one array per season, both sorted by number. */
  seasons: number[][]
  /** Total watched episodes across every season. */
  watched: number
}

export interface ExportFiles {
  /** `user_tv_show_data.csv` — the followed series. */
  shows: string
  /** `tracking-prod-records-v2.csv` — one row per watched episode. */
  tracking: string
  /** `_opentv_extras.json` — OpenTV's own additions. Absent in a TV Time export. */
  extras?: string | null
}

/** The files the importer needs, by the names the exports use. */
export const REQUIRED_FILES = ['user_tv_show_data.csv', 'tracking-prod-records-v2.csv'] as const
export const OPTIONAL_FILES = ['_opentv_extras.json'] as const

/**
 * Reads an export timestamp.
 *
 * The exports use `YYYY-MM-DD HH:MM:SS`, which is not what `Date.parse` expects;
 * the space has to become a `T`. An unreadable date returns null so the caller
 * can decide on a fallback rather than silently getting today.
 */
export function parseStamp(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Date.parse(value.trim().replace(' ', 'T'))
  return Number.isNaN(parsed) ? null : parsed
}

/** `{ tvdbId: addedAt }` from OpenTV's side-file; empty when it is absent. */
function readExtras(raw: string | null | undefined): Map<string, number> {
  const out = new Map<string, number>()
  if (!raw) return out
  try {
    const parsed = JSON.parse(raw) as { shows?: { tvdbId?: unknown; addedAt?: unknown }[] }
    for (const show of parsed.shows ?? []) {
      const id = show?.tvdbId
      const at = parseStamp(typeof show?.addedAt === 'string' ? show.addedAt : null)
      if ((typeof id === 'string' || typeof id === 'number') && at !== null) out.set(String(id), at)
    }
  } catch {
    // A corrupt side-file only costs the "added on" dates; the import still works.
  }
  return out
}

/**
 * Groups tracking rows into `showId -> season -> episode -> watched at`.
 *
 * Nested maps rather than arrays because seasons are not contiguous — specials
 * live in season 0, and a partially watched show has gaps everywhere.
 */
type SeasonMap = Map<number, Map<number, number>>

function groupTracking(csv: string): Map<string, SeasonMap> {
  const byShow = new Map<string, SeasonMap>()

  for (const row of parseCsv(csv)) {
    const showId = row.s_id
    const episode = Number(row.episode_number)
    // Season 0 is legitimate (specials); episode 0 is not.
    const season = Number(row.season_number) || 0
    if (!showId || !Number.isFinite(episode) || episode <= 0) continue

    let seasons = byShow.get(showId)
    if (!seasons) {
      seasons = new Map<number, Map<number, number>>()
      byShow.set(showId, seasons)
    }

    let episodes = seasons.get(season)
    if (!episodes) {
      episodes = new Map<number, number>()
      seasons.set(season, episodes)
    }

    // Re-watching stamps the same episode twice; the last row wins, matching
    // what the source app shows.
    episodes.set(episode, parseStamp(row.created_at) ?? 0)
  }

  return byShow
}

/**
 * Builds the followed-series list, each with its episodes flattened into
 * broadcast order.
 */
export function parseExport(files: ExportFiles): SourceShow[] {
  const extras = readExtras(files.extras)
  const tracking = groupTracking(files.tracking)
  const shows: SourceShow[] = []

  for (const row of parseCsv(files.shows)) {
    const id = row.tv_show_id
    const name = row.tv_show_name?.trim()
    if (!id || !name) continue

    const grouped = tracking.get(id) ?? new Map<number, Map<number, number>>()
    const seasons = [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, episodes]) => [...episodes.entries()].sort((a, b) => a[0] - b[0]).map(([, at]) => at))
      .filter((season) => season.length > 0)

    shows.push({
      id,
      name,
      favorite: row.is_favorited === '1' || row.is_favorited?.toLowerCase() === 'true',
      addedAt: extras.get(id) ?? null,
      seasons,
      watched: seasons.reduce((sum, season) => sum + season.length, 0)
    })
  }

  return shows
}
