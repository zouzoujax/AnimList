/**
 * Schema migrations for the on-disk store.
 *
 * Deliberately pure and free of `electron`/`fs` imports so it can be unit
 * tested: this is the one piece of code that rewrites the user's data, and a
 * mistake here is unrecoverable without a backup.
 *
 * Adding a migration:
 *   1. bump SCHEMA_VERSION
 *   2. append an entry to `migrations` with the matching `to`
 *   3. cover it in migrations.test.ts
 * Never edit a released migration — write a new one on top.
 */

export const SCHEMA_VERSION = 5

/** The raw file shape. Fields are `unknown` because old files are untrusted. */
export interface StoredDb {
  version?: number
  media: Record<string, Record<string, unknown>>
  entries: Record<string, Record<string, unknown>>
  history: Record<string, unknown>[]
  prefs: Record<string, unknown>
  lists?: Record<string, unknown>[]
}

export interface MigrationReport {
  from: number
  to: number
  applied: string[]
  /** The file was written by a newer build: writing to it would lose data. */
  ahead: boolean
}

interface Migration {
  to: number
  describe: string
  run: (db: StoredDb) => void
}

const DEFAULT_RUNTIME = 24

const migrations: Migration[] = [
  {
    to: 2,
    describe: 'Complète les champs absents des entrées et de l’historique',
    run(db) {
      const now = Date.now()

      for (const [id, entry] of Object.entries(db.entries)) {
        // Fields added after the first release; filling them here is what lets
        // the reading code stop guarding every access.
        entry.animeId ??= Number(id)
        entry.status ??= 'planned'
        entry.addedAt ??= now
        entry.updatedAt ??= now
        entry.favorite ??= false
        entry.notes ??= ''
        entry.rewatches ??= 0
        if (!('score' in entry)) entry.score = null
        if (!('startedAt' in entry)) entry.startedAt = null
        if (!('finishedAt' in entry)) entry.finishedAt = null
        if (!Array.isArray(entry.emotions)) entry.emotions = []
      }

      // Rows without an anime or an episode number cannot be shown or counted,
      // so they are dropped rather than carried forward forever.
      db.history = db.history.filter(
        (row) => row && typeof row.animeId === 'number' && typeof row.episode === 'number' && row.episode > 0
      )

      for (const row of db.history) {
        if (typeof row.at !== 'number' || !Number.isFinite(row.at)) row.at = now
        if (typeof row.minutes !== 'number' || row.minutes <= 0) row.minutes = DEFAULT_RUNTIME
      }
    }
  },
  {
    to: 3,
    describe: 'Purge les fiches en cache qui ne sont plus référencées',
    run(db) {
      // Media is a cache: anything not backing an entry or a watched episode can
      // be refetched from AniList, so it is safe to drop.
      const referenced = new Set(Object.keys(db.entries))
      for (const row of db.history) referenced.add(String(row.animeId))

      for (const id of Object.keys(db.media)) {
        if (!referenced.has(id)) delete db.media[id]
      }
    }
  },
  {
    to: 4,
    describe: 'Ajoute les listes personnalisées',
    run(db) {
      if (!Array.isArray(db.lists)) {
        db.lists = []
        return
      }

      const now = Date.now()
      const seen = new Set<string>()
      db.lists = db.lists.filter((list) => {
        if (!list || typeof list !== 'object') return false

        // A list without a usable name could never be told apart in the UI.
        const name = typeof list.name === 'string' ? list.name.trim() : ''
        if (!name) return false
        list.name = name

        // Ids must be unique: two lists sharing one would edit each other.
        const id = typeof list.id === 'string' && list.id ? list.id : `list-${now}-${seen.size}`
        if (seen.has(id)) return false
        seen.add(id)
        list.id = id

        list.emoji = typeof list.emoji === 'string' ? list.emoji : '📁'
        list.createdAt = typeof list.createdAt === 'number' ? list.createdAt : now
        list.updatedAt = typeof list.updatedAt === 'number' ? list.updatedAt : now
        list.animeIds = Array.isArray(list.animeIds)
          ? [...new Set(list.animeIds.filter((v): v is number => typeof v === 'number'))]
          : []
        return true
      })
    }
  },
  {
    to: 5,
    describe: 'Dédoublonne l’historique par visionnage',
    run(db) {
      // From v5 the history lives in an append-only journal
      // (`animelist-history.jsonl`), which is what this version number is really
      // for: an older build must refuse to write to a store whose history it
      // cannot see. The journal makes duplicates newly possible — an append
      // interrupted and retried can land the same row twice — so this is also
      // where they get removed.
      //
      // Identity is (anime, episode, pass): a rewatch legitimately repeats an
      // episode, and collapsing those would erase a viewing and its note.
      // Fields are `unknown` here, so the key is built from numbers only —
      // stringifying an unexpected object would collapse unrelated rows.
      const num = (value: unknown): number => (typeof value === 'number' ? value : Number.NaN)

      const seen = new Set<string>()
      db.history = db.history.filter((row) => {
        const k = `${num(row.animeId)}:${num(row.episode)}:${typeof row.pass === 'number' ? row.pass : 0}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    }
  }
]

/**
 * Brings `db` up to SCHEMA_VERSION in place. A file from a newer build is left
 * untouched and flagged, so the caller can refuse to write to it.
 */
export function migrate(db: StoredDb): MigrationReport {
  const from = typeof db.version === 'number' && db.version > 0 ? db.version : 1

  if (from > SCHEMA_VERSION) {
    return { from, to: from, applied: [], ahead: true }
  }

  const applied: string[] = []
  for (const migration of migrations) {
    if (migration.to <= from) continue
    migration.run(db)
    db.version = migration.to
    applied.push(`v${migration.to} — ${migration.describe}`)
  }

  db.version = SCHEMA_VERSION
  return { from, to: SCHEMA_VERSION, applied, ahead: false }
}

export function pendingMigrations(version: number): number {
  return migrations.filter((m) => m.to > version).length
}
