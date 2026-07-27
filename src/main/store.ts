import { app } from 'electron'
import { EventEmitter } from 'node:events'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { migrate, SCHEMA_VERSION, type MigrationReport, type StoredDb } from './migrations'
import {
  DEFAULT_PREFS,
  type Entry,
  type EntryPatch,
  type Media,
  type Prefs,
  type Snapshot,
  type WatchEvent,
  type WatchEventPatch,
  type WatchEventRef
} from '@shared/types'

interface Db {
  version: number
  media: Record<string, Media>
  entries: Record<string, Entry>
  history: WatchEvent[]
  prefs: Prefs
}

const emptyDb = (): Db => ({
  version: SCHEMA_VERSION,
  media: {},
  entries: {},
  history: [],
  prefs: { ...DEFAULT_PREFS }
})

export const store = new EventEmitter()

let db: Db = emptyDb()
let file = ''
let saveTimer: NodeJS.Timeout | null = null
let saving: Promise<void> = Promise.resolve()

/** Set when the file on disk was written by a newer build than this one. */
let readOnly = false
let lastReport: MigrationReport | null = null

/**
 * `${animeId}:${episode}` for every episode seen *in the current pass*.
 *
 * Earlier passes stay in `db.history` — they still count towards watch time and
 * keep their notes — but they must not make an episode look ticked after the
 * user has started watching a series again.
 */
let watchedIndex = new Set<string>()

const key = (animeId: number, episode: number): string => `${animeId}:${episode}`

/** Viewing an event belongs to; files written before rewatches have no `pass`. */
const passOf = (ev: WatchEvent): number => ev.pass ?? 0

/** The pass currently being watched for a series. */
function currentPass(animeId: number): number {
  return db.entries[String(animeId)]?.rewatches ?? 0
}

function rebuildIndex(): void {
  watchedIndex = new Set()
  for (const ev of db.history) {
    if (passOf(ev) === currentPass(ev.animeId)) watchedIndex.add(key(ev.animeId, ev.episode))
  }
}

function sanitize(raw: unknown): Db {
  const base = emptyDb()
  if (!raw || typeof raw !== 'object') return base
  const input = raw as Partial<Db>
  return {
    version: typeof input.version === 'number' ? input.version : SCHEMA_VERSION,
    media: input.media && typeof input.media === 'object' ? input.media : {},
    entries: input.entries && typeof input.entries === 'object' ? input.entries : {},
    history: Array.isArray(input.history) ? input.history : [],
    prefs: { ...DEFAULT_PREFS, ...(input.prefs ?? {}) }
  }
}

export function initStore(): MigrationReport | null {
  file = join(app.getPath('userData'), 'animelist.json')

  for (const candidate of [file, `${file}.bak`]) {
    if (!existsSync(candidate)) continue
    try {
      const raw = JSON.parse(readFileSync(candidate, 'utf8')) as StoredDb
      raw.media ??= {}
      raw.entries ??= {}
      raw.history ??= []
      raw.prefs ??= {}

      lastReport = migrate(raw)
      readOnly = lastReport.ahead
      db = sanitize(raw)
      rebuildIndex()

      if (readOnly) {
        console.error(
          `[store] fichier en schéma v${lastReport.from}, ce build gère v${SCHEMA_VERSION} — lecture seule pour ne rien perdre`
        )
      } else if (lastReport.applied.length) {
        // Snapshot the pre-migration file: a faulty migration must stay undoable.
        try {
          copyFileSync(candidate, `${file}.v${lastReport.from}-backup`)
        } catch (err) {
          console.error('[store] sauvegarde avant migration impossible', err)
        }
        for (const line of lastReport.applied) console.warn('[store] migration', line)
        void writeNow()
      }

      return lastReport
    } catch (err) {
      console.error('[store] fichier illisible, tentative suivante', candidate, err)
    }
  }

  db = emptyDb()
  rebuildIndex()
  return null
}

/** Surfaced through `app:info` so the UI can warn about a read-only store. */
export function schemaInfo(): { version: number; expected: number; readOnly: boolean; applied: string[] } {
  return {
    version: db.version,
    expected: SCHEMA_VERSION,
    readOnly,
    applied: lastReport?.applied ?? []
  }
}

export function dbPath(): string {
  return file
}

async function writeNow(): Promise<void> {
  const tmp = `${file}.tmp`
  const payload = JSON.stringify(db)
  await fs.writeFile(tmp, payload, 'utf8')
  try {
    await fs.copyFile(file, `${file}.bak`)
  } catch {
    // no previous file to back up
  }
  await fs.rename(tmp, file)
}

function persist(): void {
  // A newer file must never be overwritten by an older build.
  if (readOnly) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    saving = saving.then(writeNow).catch((err) => console.error('[store] save failed', err))
  }, 400)
}

export async function flush(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
    saving = saving.then(writeNow)
  }
  await saving.catch((err) => console.error('[store] flush failed', err))
}

function changed(): void {
  persist()
  store.emit('change')
}

export function snapshot(): Snapshot {
  return {
    version: db.version,
    entries: Object.values(db.entries),
    media: Object.values(db.media),
    history: db.history,
    prefs: db.prefs
  }
}

export function getPrefs(): Prefs {
  return db.prefs
}

export function setPrefs(patch: Partial<Prefs>): Prefs {
  db.prefs = { ...db.prefs, ...patch }
  changed()
  return db.prefs
}

export function getMedia(id: number): Media | undefined {
  return db.media[String(id)]
}

/** Caches media rows for anything in the library so the app still works offline. */
export function cacheMedia(list: Media[], onlyIfTracked = false): void {
  let touched = false
  for (const media of list) {
    const id = String(media.id)
    if (onlyIfTracked && !db.entries[id]) continue
    db.media[id] = media
    touched = true
  }
  if (touched) changed()
}

function runtimeOf(animeId: number): number {
  return db.media[String(animeId)]?.duration || db.prefs.defaultRuntime
}

/** Episodes seen in the current pass — what drives the entry's status. */
function watchedCount(animeId: number): number {
  const pass = currentPass(animeId)
  let n = 0
  for (const ev of db.history) if (ev.animeId === animeId && passOf(ev) === pass) n += 1
  return n
}

function newEntry(animeId: number): Entry {
  const now = Date.now()
  return {
    animeId,
    status: 'planned',
    addedAt: now,
    updatedAt: now,
    score: null,
    emotions: [],
    favorite: false,
    notes: '',
    rewatches: 0,
    startedAt: null,
    finishedAt: null
  }
}

export function setEntry(animeId: number, patch: EntryPatch, media?: Media): Entry {
  if (media) db.media[String(animeId)] = media
  const existing = db.entries[String(animeId)]
  const entry: Entry = { ...(existing ?? newEntry(animeId)), ...patch, updatedAt: Date.now() }
  if (patch.status === 'watching' && !entry.startedAt) entry.startedAt = Date.now()
  if (patch.status === 'completed' && !entry.finishedAt) entry.finishedAt = Date.now()
  db.entries[String(animeId)] = entry
  changed()
  return entry
}

export function removeEntry(animeId: number): void {
  delete db.entries[String(animeId)]
  db.history = db.history.filter((h) => h.animeId !== animeId)
  rebuildIndex()
  changed()
}

/** A new event for the pass being watched. `pass: 0` stays implicit. */
function newEvent(animeId: number, episode: number, at: number): WatchEvent {
  const pass = currentPass(animeId)
  const ev: WatchEvent = { animeId, episode, at, minutes: runtimeOf(animeId) }
  if (pass > 0) ev.pass = pass
  return ev
}

/** Marks or unmarks a single episode, keeping the entry status in sync. */
export function setWatched(animeId: number, episode: number, watched: boolean): void {
  const k = key(animeId, episode)
  const already = watchedIndex.has(k)
  if (watched === already) return

  if (watched) {
    db.history.push(newEvent(animeId, episode, Date.now()))
    watchedIndex.add(k)
  } else {
    // Only the current pass is undone; earlier viewings keep their rows.
    const pass = currentPass(animeId)
    db.history = db.history.filter(
      (h) => !(h.animeId === animeId && h.episode === episode && passOf(h) === pass)
    )
    watchedIndex.delete(k)
  }
  syncProgress(animeId)
  changed()
}

export function setWatchedUpTo(animeId: number, episode: number): void {
  const now = Date.now()
  for (let ep = 1; ep <= episode; ep += 1) {
    const k = key(animeId, ep)
    if (watchedIndex.has(k)) continue
    db.history.push(newEvent(animeId, ep, now))
    watchedIndex.add(k)
  }
  syncProgress(animeId)
  changed()
}

/** Wipes a series' progress — every pass, not just the current one. */
export function clearWatched(animeId: number): void {
  db.history = db.history.filter((h) => h.animeId !== animeId)
  const entry = db.entries[String(animeId)]
  if (entry) entry.rewatches = 0
  rebuildIndex()
  syncProgress(animeId)
  changed()
}

// ---------------------------------------------------------------- rewatching

/**
 * Starts watching a series again.
 *
 * The previous pass is left untouched in the history — its watch time still
 * counts and its per-episode notes survive — but the grid comes back empty so
 * progress can be ticked afresh.
 */
export function startRewatch(animeId: number): Entry | null {
  const entry = db.entries[String(animeId)]
  if (!entry) return null

  entry.rewatches += 1
  entry.status = 'watching'
  entry.startedAt = Date.now()
  entry.finishedAt = null
  entry.updatedAt = Date.now()

  rebuildIndex()
  changed()
  return entry
}

/** Undoes a rewatch started by mistake, discarding only that pass. */
export function cancelRewatch(animeId: number): Entry | null {
  const entry = db.entries[String(animeId)]
  if (!entry || entry.rewatches <= 0) return null

  const pass = entry.rewatches
  db.history = db.history.filter((h) => !(h.animeId === animeId && passOf(h) === pass))
  entry.rewatches -= 1
  entry.updatedAt = Date.now()

  rebuildIndex()
  syncProgress(animeId)
  changed()
  return entry
}

// ---------------------------------------------------------------- history

function findEvent(ref: WatchEventRef): WatchEvent | undefined {
  return db.history.find(
    (h) => h.animeId === ref.animeId && h.episode === ref.episode && passOf(h) === ref.pass
  )
}

/**
 * Corrects one watch event: its date, its runtime, its note, its emotions.
 *
 * Editing a date is the main use — an import stamps every episode with the day
 * it was ticked, not the day it was watched.
 */
export function updateEvent(ref: WatchEventRef, patch: WatchEventPatch): boolean {
  const ev = findEvent(ref)
  if (!ev) return false

  if (patch.at !== undefined && Number.isFinite(patch.at)) {
    ev.at = patch.at
    // A hand-set date is a real date, so it stops being import noise and
    // rejoins the day-based statistics.
    delete ev.imported
  }
  if (patch.minutes !== undefined && Number.isFinite(patch.minutes)) {
    ev.minutes = Math.max(0, Math.round(patch.minutes))
  }
  if (patch.note !== undefined) {
    const note = patch.note.trim()
    if (note) ev.note = note
    else delete ev.note
  }
  if (patch.emotions !== undefined) {
    if (patch.emotions.length) ev.emotions = patch.emotions
    else delete ev.emotions
  }

  changed()
  return true
}

/** Removes a single watch event, from any pass. */
export function removeEvent(ref: WatchEventRef): boolean {
  const before = db.history.length
  db.history = db.history.filter(
    (h) => !(h.animeId === ref.animeId && h.episode === ref.episode && passOf(h) === ref.pass)
  )
  if (db.history.length === before) return false

  rebuildIndex()
  syncProgress(ref.animeId)
  changed()
  return true
}

/** Moves an entry between planned → watching → completed as episodes get ticked. */
function syncProgress(animeId: number): void {
  const id = String(animeId)
  const seen = watchedCount(animeId)
  const entry = db.entries[id] ?? (seen > 0 ? newEntry(animeId) : undefined)
  if (!entry) return

  const total = db.media[id]?.episodes ?? null
  if (seen === 0) {
    if (entry.status === 'watching' || entry.status === 'completed') entry.status = 'planned'
    entry.startedAt = null
    entry.finishedAt = null
  } else {
    if (!entry.startedAt) entry.startedAt = Date.now()
    if (total && seen >= total) {
      if (entry.status !== 'dropped') entry.status = 'completed'
      if (!entry.finishedAt) entry.finishedAt = Date.now()
    } else if (entry.status === 'completed' || entry.status === 'planned') {
      entry.status = 'watching'
      entry.finishedAt = null
    }
  }
  entry.updatedAt = Date.now()
  db.entries[id] = entry
}

export function importSnapshot(incoming: Snapshot, mode: 'merge' | 'replace'): void {
  if (mode === 'replace') {
    db = emptyDb()
    db.prefs = { ...DEFAULT_PREFS, ...incoming.prefs }
  }
  for (const media of incoming.media ?? []) db.media[String(media.id)] = media
  for (const entry of incoming.entries ?? []) {
    const current = db.entries[String(entry.animeId)]
    if (!current || current.updatedAt <= entry.updatedAt) db.entries[String(entry.animeId)] = entry
  }
  // Deduplicated per viewing, not per episode: a rewatch legitimately repeats
  // an episode, and dropping it would lose both its date and its note.
  const eventKey = (ev: WatchEvent): string => `${ev.animeId}:${ev.episode}:${passOf(ev)}`
  const known = new Set(db.history.map(eventKey))
  for (const ev of incoming.history ?? []) {
    const k = eventKey(ev)
    if (known.has(k)) continue
    db.history.push(ev)
    known.add(k)
  }

  rebuildIndex()
  changed()
}

export function resetAll(): void {
  const prefs = db.prefs
  db = emptyDb()
  db.prefs = prefs
  rebuildIndex()
  changed()
}
