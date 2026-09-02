import { app } from 'electron'
import { EventEmitter } from 'node:events'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { migrate, SCHEMA_VERSION, type MigrationReport, type StoredDb } from './migrations'
import { MAX_POSITIONS, prunePositions, worthRemembering, type Position } from '@shared/playback'
import {
  DEFAULT_PREFS,
  type CustomList,
  type Entry,
  type Follow,
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
  lists: CustomList[]
  /** Dossier de fichiers locaux choisi pour une série, par identifiant. */
  folders: Record<string, string>
  /**
   * Où en est la lecture d'un fichier local, par chemin.
   *
   * Ajout purement additif : un fichier écrit par une version plus ancienne
   * n'en a pas, et `sanitize` le remplace par un objet vide. Pas de migration,
   * donc pas de numéro de schéma à monter — le monter passerait la
   * bibliothèque en lecture seule sur toute version déjà installée, et une
   * position de lecture ne vaut pas ce prix.
   */
  positions: Record<string, Position>
  /** Personnes et studios suivis. Additif lui aussi, pour la même raison. */
  follows: Follow[]
}

const emptyDb = (): Db => ({
  version: SCHEMA_VERSION,
  media: {},
  entries: {},
  history: [],
  prefs: { ...DEFAULT_PREFS },
  lists: [],
  folders: {},
  positions: {},
  follows: []
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
    prefs: { ...DEFAULT_PREFS, ...(input.prefs ?? {}) },
    lists: Array.isArray(input.lists) ? input.lists : [],
    folders: input.folders && typeof input.folders === 'object' ? input.folders : {},
    positions: input.positions && typeof input.positions === 'object' ? prunePositions(input.positions) : {},
    follows: Array.isArray(input.follows) ? input.follows.filter((f) => f && typeof f.key === 'string') : []
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

      // From v5 the history lives in a journal beside the core file. When the
      // journal is missing the core still holds it — a file written before v5,
      // or a first run — and it has to be laid down.
      const journal = readJournal()
      if (journal !== null) db.history = journal
      else journalDirty = true

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
        coreDirty = true
        enqueueWrite()
      } else if (journalDirty) {
        // Nothing migrated, but the journal still has to be laid down.
        enqueueWrite()
      }

      // Rattrape les fiches laissées « en cours » par une promotion sautée.
      const settled = readOnly ? 0 : settleFinished()
      if (settled > 0) {
        console.warn(`[store] ${settled} série(s) terminée(s) restée(s) « en cours » — statut corrigé`)
        coreDirty = true
        enqueueWrite()
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

/**
 * Writes are split in two, because the two halves change at wildly different
 * rates.
 *
 * The **core** file holds media, entries, preferences and lists. It is small and
 * rewritten whole — that is fine, it only changes when the user edits something
 * about a series.
 *
 * The **history journal** holds one JSON object per line. Ticking an episode
 * appends a single line instead of re-serialising thousands of rows, which is
 * what the old single-file store did on every click. Only edits and deletions
 * force a full rewrite, and those are rare.
 *
 * A crash mid-append can leave a truncated last line; the reader skips lines it
 * cannot parse, so the cost is at most the one episode being written.
 */

/** The core file needs writing. */
let coreDirty = false
/** The journal must be rewritten from scratch (an event was edited or removed). */
let journalDirty = false
/** Events to append on the next save, when no rewrite is pending. */
let appendBuffer: WatchEvent[] = []

const historyPath = (): string => file.replace(/\.json$/, '-history.jsonl')

/**
 * Any change that is not a pure addition means the journal has to be redone.
 *
 * Call it *before* the mutation, so events pushed afterwards are not also queued
 * for an append that the rewrite would duplicate.
 */
function touchJournal(): void {
  journalDirty = true
  appendBuffer = []
}

/** Records a new event both in memory and in the next append. */
function pushEvent(ev: WatchEvent): void {
  db.history.push(ev)
  if (!journalDirty) appendBuffer.push(ev)
}

function readJournal(): WatchEvent[] | null {
  const path = historyPath()
  if (!existsSync(path)) return null

  const out: WatchEvent[] = []
  let skipped = 0
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const ev = JSON.parse(line) as WatchEvent
      if (typeof ev?.animeId === 'number' && typeof ev?.episode === 'number') out.push(ev)
      else skipped += 1
    } catch {
      // A torn final line from a crash during append: losing it costs one episode.
      skipped += 1
    }
  }
  if (skipped) console.warn(`[store] ${skipped} ligne(s) d'historique illisibles ignorées`)
  return out
}

/** tmp + rename, so a reader never sees a half-written file. */
async function writeAtomic(path: string, payload: string): Promise<void> {
  const tmp = `${path}.tmp`
  await fs.writeFile(tmp, payload, 'utf8')
  try {
    await fs.copyFile(path, `${path}.bak`)
  } catch {
    // no previous file to back up
  }
  await fs.rename(tmp, path)
}

const journalLines = (events: WatchEvent[]): string =>
  events.length ? events.map((ev) => JSON.stringify(ev)).join('\n') + '\n' : ''

async function writeNow(): Promise<void> {
  if (coreDirty) {
    coreDirty = false
    // History is deliberately left out: it lives in the journal now.
    await writeAtomic(file, JSON.stringify({ ...db, history: [] }))
  }

  if (journalDirty) {
    journalDirty = false
    appendBuffer = []
    await writeAtomic(historyPath(), journalLines(db.history))
  } else if (appendBuffer.length) {
    const batch = appendBuffer
    appendBuffer = []
    await fs.appendFile(historyPath(), journalLines(batch), 'utf8')
  }
}

/**
 * Every write goes through this one chain.
 *
 * Two saves must never overlap: they share the same `.tmp` paths, and a rename
 * landing out of order would publish stale content. Chaining also means `flush`
 * can await a write that was started elsewhere — the one `initStore` fires after
 * a migration, in particular.
 */
function enqueueWrite(): void {
  saving = saving.then(writeNow).catch((err) => console.error('[store] save failed', err))
}

function persist(): void {
  // A newer file must never be overwritten by an older build.
  if (readOnly) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    enqueueWrite()
  }, 400)
}

export async function flush(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
    enqueueWrite()
  }
  await saving.catch((err) => console.error('[store] flush failed', err))
}

/**
 * Marks the core file dirty and announces the change.
 *
 * Every mutation touches the core one way or another — even an episode tick
 * moves the entry's status and timestamp — so it is the default. Mutations that
 * also rewrite history call `touchJournal()` first.
 */
function changed(): void {
  coreDirty = true
  persist()
  store.emit('change')
}

export function snapshot(): Snapshot {
  return {
    version: db.version,
    entries: Object.values(db.entries),
    media: Object.values(db.media),
    history: db.history,
    prefs: db.prefs,
    lists: db.lists
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

/** Dossier de fichiers locaux d'une série, s'il en a un. */
export function getFolder(animeId: number): string | null {
  return db.folders[String(animeId)] ?? null
}

export function setFolder(animeId: number, folder: string | null): void {
  if (folder) db.folders[String(animeId)] = folder
  else delete db.folders[String(animeId)]
  changed()
}

/** Les dossiers autorisés : le protocole media ne sert rien en dehors d'eux. */
export function allFolders(): string[] {
  return Object.values(db.folders)
}

/** Où en était la lecture de ces fichiers. Les autres n'ont rien à reprendre. */
export function positionsFor(paths: string[]): Record<string, Position> {
  const out: Record<string, Position> = {}
  for (const path of paths) {
    const held = db.positions[path]
    if (held) out[path] = held
  }
  return out
}

/**
 * Retient — ou oublie — où en est un fichier.
 *
 * Une position qui ne vaut plus d'être reprise est effacée plutôt que gardée
 * à zéro : c'est la même chose pour l'utilisateur, et la liste reste courte
 * sans attendre le prochain élagage.
 */
export function setPosition(path: string, at: number, duration: number): void {
  const keep = worthRemembering(at, duration)
  if (!keep && !db.positions[path]) return

  if (keep) db.positions[path] = { at, duration, updatedAt: Date.now() }
  else delete db.positions[path]

  if (Object.keys(db.positions).length > MAX_POSITIONS) db.positions = prunePositions(db.positions)

  // Pas de `changed()` : la position bouge toutes les cinq secondes pendant
  // qu'on regarde, et prévenir la fenêtre à chaque fois lui ferait recalculer
  // toute la bibliothèque pour rien.
  coreDirty = true
  persist()
}

export function clearPosition(path: string): void {
  if (!db.positions[path]) return
  delete db.positions[path]
  coreDirty = true
  persist()
}

// ---------------------------------------------------------------- suivis

export function getFollows(): Follow[] {
  return db.follows
}

/**
 * Ajoute un suivi, ou remplace celui qui portait déjà la même clé.
 *
 * Resuivre quelqu'un repart d'une liste de connues à jour : les sorties
 * arrivées pendant qu'on ne suivait plus ne sont pas des nouveautés.
 */
export function putFollow(follow: Follow): Follow {
  db.follows = [...db.follows.filter((f) => f.key !== follow.key), follow]
  changed()
  return follow
}

export function dropFollow(key: string): boolean {
  const before = db.follows.length
  db.follows = db.follows.filter((f) => f.key !== key)
  if (db.follows.length === before) return false
  changed()
  return true
}

/** Applique un correctif à un suivi, sans toucher aux autres. */
export function patchFollow(key: string, patch: Partial<Follow>): Follow | null {
  const held = db.follows.find((f) => f.key === key)
  if (!held) return null
  const next = { ...held, ...patch }
  db.follows = db.follows.map((f) => (f.key === key ? next : f))
  changed()
  return next
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
    // Le total arrive parfois après les épisodes : c'est le moment où l'on
    // peut enfin trancher.
    if (db.entries[id]) promoteIfFinished(media.id)
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
  touchJournal()
  delete db.entries[String(animeId)]
  db.history = db.history.filter((h) => h.animeId !== animeId)
  // A list must never point at a series that is gone.
  for (const list of db.lists) {
    if (!list.animeIds.includes(animeId)) continue
    list.animeIds = list.animeIds.filter((id) => id !== animeId)
    list.updatedAt = Date.now()
  }
  delete db.folders[String(animeId)]
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
    pushEvent(newEvent(animeId, episode, Date.now()))
    watchedIndex.add(k)
  } else {
    // Only the current pass is undone; earlier viewings keep their rows.
    touchJournal()
    const pass = currentPass(animeId)
    db.history = db.history.filter((h) => !(h.animeId === animeId && h.episode === episode && passOf(h) === pass))
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
    pushEvent(newEvent(animeId, ep, now))
    watchedIndex.add(k)
  }
  syncProgress(animeId)
  changed()
}

/** Wipes a series' progress — every pass, not just the current one. */
export function clearWatched(animeId: number): void {
  touchJournal()
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

  touchJournal()
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
  return db.history.find((h) => h.animeId === ref.animeId && h.episode === ref.episode && passOf(h) === ref.pass)
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
  touchJournal()

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
  // Absent plutôt que `false` : le journal est réécrit en entier à chaque
  // correction, et une clé posée sur trois mille lignes pour rien les alourdit.
  if (patch.pinned !== undefined) {
    if (patch.pinned) ev.pinned = true
    else delete ev.pinned
  }

  changed()
  return true
}

/**
 * Retire les visionnages dont la série n'est plus dans la bibliothèque.
 *
 * Supprimer une entrée ne touchait pas son historique : les lignes restaient,
 * invisibles, et continuaient de peser dans le temps total. Le bilan de santé
 * les débusque, cette fonction les efface — sur décision, jamais toute seule.
 */
export function dropOrphanEvents(): number {
  const known = new Set(Object.keys(db.entries).map(Number))
  const before = db.history.length
  const kept = db.history.filter((h) => known.has(h.animeId))
  if (kept.length === before) return 0

  touchJournal()
  db.history = kept
  rebuildIndex()
  changed()
  return before - kept.length
}

/** Removes a single watch event, from any pass. */
export function removeEvent(ref: WatchEventRef): boolean {
  touchJournal()
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

/**
 * Termine une série dont tous les épisodes sont cochés.
 *
 * `syncProgress` ne s'exécute qu'au moment où l'on coche. Si le nombre
 * d'épisodes n'est pas connu à cet instant précis — la fiche AniList n'est pas
 * encore en cache, ou la série n'annonçait pas de total — la promotion est
 * sautée, et plus rien ne repasse jamais dessus : la série reste « en cours »
 * pour toujours, affichée dans « Continuer » alors qu'elle est finie. On rejoue
 * donc la décision dès que le total se présente.
 *
 * Seul « en cours » est concerné. « Abandonné » et « prévu » sont des choix, et
 * rien ici ne les défait.
 */
function promoteIfFinished(animeId: number): boolean {
  const id = String(animeId)
  const entry = db.entries[id]
  if (!entry || entry.status !== 'watching') return false

  const total = db.media[id]?.episodes ?? null
  if (!total || watchedCount(animeId) < total) return false

  entry.status = 'completed'
  // La date du dernier épisode vu, pas celle du rattrapage : sinon une série
  // finie en août atterrirait dans le bilan de septembre.
  entry.finishedAt ??= lastWatchAt(animeId) ?? Date.now()
  entry.updatedAt = Date.now()
  return true
}

function lastWatchAt(animeId: number): number | null {
  const pass = currentPass(animeId)
  let at = 0
  for (const ev of db.history) {
    if (ev.animeId === animeId && passOf(ev) === pass && ev.at > at) at = ev.at
  }
  return at || null
}

/** Rejoue la promotion sur toute la bibliothèque, au chargement. */
function settleFinished(): number {
  let n = 0
  for (const id of Object.keys(db.entries)) if (promoteIfFinished(Number(id))) n += 1
  return n
}

export function importSnapshot(incoming: Snapshot, mode: 'merge' | 'replace'): void {
  touchJournal()
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

  // Lists merge by id: a restore must not duplicate a list the user already
  // has, but it should bring across memberships recorded elsewhere.
  for (const incomingList of incoming.lists ?? []) {
    const current = db.lists.find((l) => l.id === incomingList.id)
    if (!current) {
      db.lists.push(incomingList)
      continue
    }
    if (current.updatedAt < incomingList.updatedAt) {
      current.name = incomingList.name
      current.emoji = incomingList.emoji
      current.updatedAt = incomingList.updatedAt
    }
    current.animeIds = [...new Set([...current.animeIds, ...incomingList.animeIds])]
  }

  rebuildIndex()
  changed()
}

// ---------------------------------------------------------------- lists

/** Short, readable and collision-free enough for a local file. */
function newListId(): string {
  return `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function createList(name: string, emoji = '📁'): CustomList | null {
  const trimmed = name.trim()
  if (!trimmed) return null

  const now = Date.now()
  const list: CustomList = { id: newListId(), name: trimmed, emoji, animeIds: [], createdAt: now, updatedAt: now }
  db.lists.push(list)
  changed()
  return list
}

export function updateList(id: string, patch: { name?: string; emoji?: string }): CustomList | null {
  const list = db.lists.find((l) => l.id === id)
  if (!list) return null

  if (patch.name !== undefined) {
    const trimmed = patch.name.trim()
    // Refusing an empty rename beats leaving a list the user cannot identify.
    if (trimmed) list.name = trimmed
  }
  if (patch.emoji !== undefined) list.emoji = patch.emoji
  list.updatedAt = Date.now()
  changed()
  return list
}

export function deleteList(id: string): boolean {
  const before = db.lists.length
  db.lists = db.lists.filter((l) => l.id !== id)
  if (db.lists.length === before) return false
  changed()
  return true
}

/** Adds or removes several anime at once; returns the resulting membership. */
export function setListMembership(id: string, animeIds: number[], member: boolean): CustomList | null {
  const list = db.lists.find((l) => l.id === id)
  if (!list) return null

  if (member) {
    const known = new Set(list.animeIds)
    for (const animeId of animeIds) {
      if (known.has(animeId)) continue
      list.animeIds.push(animeId)
      known.add(animeId)
    }
  } else {
    const drop = new Set(animeIds)
    list.animeIds = list.animeIds.filter((animeId) => !drop.has(animeId))
  }

  list.updatedAt = Date.now()
  changed()
  return list
}

// ---------------------------------------------------------------- bulk actions

/** Applies one patch to many entries in a single write and a single echo. */
export function setEntries(animeIds: number[], patch: EntryPatch): number {
  let touched = 0
  for (const animeId of animeIds) {
    const existing = db.entries[String(animeId)]
    if (!existing) continue
    const entry: Entry = { ...existing, ...patch, updatedAt: Date.now() }
    if (patch.status === 'watching' && !entry.startedAt) entry.startedAt = Date.now()
    if (patch.status === 'completed' && !entry.finishedAt) entry.finishedAt = Date.now()
    db.entries[String(animeId)] = entry
    touched += 1
  }
  if (touched) changed()
  return touched
}

/** Removes many entries, and every list membership that pointed at them. */
export function removeEntries(animeIds: number[]): number {
  const drop = new Set(animeIds)
  let touched = 0
  for (const animeId of drop) {
    if (!db.entries[String(animeId)]) continue
    delete db.entries[String(animeId)]
    touched += 1
  }
  if (!touched) return 0

  touchJournal()
  db.history = db.history.filter((h) => !drop.has(h.animeId))
  for (const list of db.lists) {
    const before = list.animeIds.length
    list.animeIds = list.animeIds.filter((id) => !drop.has(id))
    if (list.animeIds.length !== before) list.updatedAt = Date.now()
  }

  rebuildIndex()
  changed()
  return touched
}

/** Marks every known episode of each series as seen, in one write. */
export function markAllWatched(animeIds: number[]): number {
  const now = Date.now()
  let added = 0
  for (const animeId of animeIds) {
    const total = db.media[String(animeId)]?.episodes
    if (!total || total <= 0) continue
    for (let ep = 1; ep <= total; ep += 1) {
      const k = key(animeId, ep)
      if (watchedIndex.has(k)) continue
      pushEvent(newEvent(animeId, ep, now))
      watchedIndex.add(k)
      added += 1
    }
    syncProgress(animeId)
  }
  if (added) changed()
  return added
}

export function resetAll(): void {
  touchJournal()
  const prefs = db.prefs
  db = emptyDb()
  db.prefs = prefs
  rebuildIndex()
  changed()
}
