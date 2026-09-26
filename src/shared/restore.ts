/**
 * Restaurer une sauvegarde : ce que devient la bibliothèque, et ce qui change.
 *
 * Une seule fonction décide du résultat — `mergeSnapshot` —, et c'est elle
 * qu'appellent à la fois la restauration et son aperçu. Un aperçu calculé à
 * part finirait par annoncer autre chose que ce qui se passe, et un aperçu
 * faux est pire que pas d'aperçu : il rassure au moment d'écraser.
 *
 * Pur et testé : c'est le code qui décide de remplacer des années de
 * visionnages par le contenu d'un fichier.
 */

import type {
  CustomList,
  Entry,
  LibraryStatus,
  Manga,
  MangaEntry,
  Media,
  ReadEvent,
  Snapshot,
  WatchEvent
} from './types'

export type RestoreMode = 'merge' | 'replace'

/** Ce qu'une restauration touche. Les réglages et les commodités locales restent à part. */
export interface LibraryState {
  entries: Entry[]
  media: Media[]
  history: WatchEvent[]
  lists: CustomList[]
  mangaEntries: MangaEntry[]
  mangas: Manga[]
  reads: ReadEvent[]
}

const passOf = (ev: WatchEvent): number => ev.pass ?? 0

/**
 * Un visionnage, et non un épisode : revoir une série répète légitimement ses
 * épisodes, et fondre les deux passages perdrait une date et une note.
 */
export const eventKey = (ev: WatchEvent): string => `${ev.animeId}:${ev.episode}:${passOf(ev)}`

/** Une séance de lecture : deux séances identiques en tout sont la même. */
const readKey = (ev: ReadEvent): string => `${ev.mangaId}:${ev.pass ?? 0}:${ev.from}:${ev.to}:${ev.at}`

/** Garde la version la plus récente de chaque élément, par sa clé. */
function newest<T extends { updatedAt: number }>(base: T[], incoming: T[] | undefined, key: (t: T) => number): T[] {
  const held = new Map(base.map((t) => [key(t), t]))
  for (const t of incoming ?? []) {
    const was = held.get(key(t))
    if (!was || was.updatedAt <= t.updatedAt) held.set(key(t), t)
  }
  return [...held.values()]
}

/**
 * La bibliothèque après restauration.
 *
 * `replace` repart de rien. `merge` garde tout et n'ajoute que ce qui manque :
 * une série est reprise du fichier seulement si sa version y est plus récente,
 * un visionnage seulement s'il n'est pas déjà là, une liste s'unit à celle qui
 * porte le même identifiant plutôt que de la dédoubler.
 *
 * Rien n'est modifié en place : l'aperçu appelle cette fonction sur l'état
 * vivant de l'app.
 */
export function mergeSnapshot(current: LibraryState, incoming: Partial<Snapshot>, mode: RestoreMode): LibraryState {
  const base: LibraryState =
    mode === 'replace'
      ? { entries: [], media: [], history: [], lists: [], mangaEntries: [], mangas: [], reads: [] }
      : current

  const media = new Map(base.media.map((m) => [m.id, m]))
  for (const m of incoming.media ?? []) media.set(m.id, m)

  const entries = newest(base.entries, incoming.entries, (e) => e.animeId)

  const history = [...base.history]
  const known = new Set(history.map(eventKey))
  for (const ev of incoming.history ?? []) {
    const k = eventKey(ev)
    if (known.has(k)) continue
    history.push(ev)
    known.add(k)
  }

  const lists = base.lists.map((l) => ({ ...l, animeIds: [...l.animeIds] }))
  for (const list of incoming.lists ?? []) {
    const held = lists.find((l) => l.id === list.id)
    if (!held) {
      lists.push({ ...list, animeIds: [...list.animeIds] })
      continue
    }
    if (held.updatedAt < list.updatedAt) {
      held.name = list.name
      held.emoji = list.emoji
      held.updatedAt = list.updatedAt
    }
    held.animeIds = [...new Set([...held.animeIds, ...list.animeIds])]
  }

  // Les mangas suivent les mêmes règles que les séries. Une copie d'avant le
  // suivi de lecture n'en a pas : fusionner n'y perd rien, remplacer repart
  // d'une liste de lecture vide — c'est ce que la copie contenait.
  const mangas = new Map(base.mangas.map((m) => [m.id, m]))
  for (const m of incoming.mangas ?? []) mangas.set(m.id, m)
  const mangaEntries = newest(base.mangaEntries, incoming.mangaEntries, (e) => e.mangaId)

  /**
   * Le journal d'un manga suit sa fiche, il ne s'unit pas.
   *
   * Reculer rogne les séances : une copie d'avant la correction porte encore
   * « 0 → 20 » quand l'état vivant dit « 0 → 10 ». Les unir compterait trente
   * chapitres pour une fiche arrêtée au dixième. Le journal vient donc du côté
   * dont la fiche l'emporte ; à égalité, les deux disent la même lecture et
   * l'union ne fait que dédoublonner.
   */
  const stamp = (list: MangaEntry[] | undefined): Map<number, number> =>
    new Map((list ?? []).map((e) => [e.mangaId, e.updatedAt]))
  const held = stamp(base.mangaEntries)
  const came = stamp(incoming.mangaEntries)
  const side = (id: number): 'base' | 'incoming' | 'both' => {
    const a = held.get(id)
    const b = came.get(id)
    if (a === undefined && b === undefined) return 'both'
    if (b === undefined) return 'base'
    if (a === undefined) return 'incoming'
    return a === b ? 'both' : a > b ? 'base' : 'incoming'
  }
  const reads = base.reads.filter((ev) => side(ev.mangaId) !== 'incoming')
  const knownReads = new Set(reads.map(readKey))
  for (const ev of incoming.reads ?? []) {
    if (side(ev.mangaId) === 'base' || knownReads.has(readKey(ev))) continue
    reads.push(ev)
    knownReads.add(readKey(ev))
  }

  return {
    entries,
    media: [...media.values()],
    history,
    lists,
    mangaEntries,
    mangas: [...mangas.values()],
    reads
  }
}

export interface SeriesChange {
  id: number
  title: string
  from?: LibraryStatus
  to?: LibraryStatus
}

export interface RestorePreview {
  mode: RestoreMode
  /** Séries, avant et après. */
  series: { before: number; after: number }
  /** Visionnages, avant et après. */
  episodes: { before: number; after: number; gained: number; lost: number }
  lists: { before: number; after: number }
  /** Mangas suivis, avant et après. */
  mangas: { before: number; after: number }
  added: SeriesChange[]
  removed: SeriesChange[]
  /** Même série, autre statut. */
  changed: SeriesChange[]
  /** Rien ne bouge : la copie ne contient rien qu'on n'ait déjà. */
  identical: boolean
}

function titleOf(media: Map<number, Media>, id: number): string {
  const m = media.get(id)
  return m ? (m.title.english ?? m.title.romaji ?? `#${id}`) : `#${id}`
}

/** Ce qui identifie l'état de la liste de lecture : chaque manga et sa dernière retouche. */
const mangaStamp = (state: LibraryState): string =>
  state.mangaEntries
    .map((e) => `${e.mangaId}:${e.updatedAt}`)
    .sort()
    .join(',')

/** Ce qui sépare deux états, dans les mots qu'un aperçu affiche. */
export function previewRestore(before: LibraryState, after: LibraryState, mode: RestoreMode): RestorePreview {
  const media = new Map([...before.media, ...after.media].map((m) => [m.id, m]))
  const was = new Map(before.entries.map((e) => [e.animeId, e]))
  const now = new Map(after.entries.map((e) => [e.animeId, e]))

  const added: SeriesChange[] = []
  const changed: SeriesChange[] = []
  for (const [id, entry] of now) {
    const held = was.get(id)
    if (!held) added.push({ id, title: titleOf(media, id), to: entry.status })
    else if (held.status !== entry.status)
      changed.push({ id, title: titleOf(media, id), from: held.status, to: entry.status })
  }
  const removed: SeriesChange[] = []
  for (const [id, entry] of was) {
    if (!now.has(id)) removed.push({ id, title: titleOf(media, id), from: entry.status })
  }

  const beforeKeys = new Set(before.history.map(eventKey))
  const afterKeys = new Set(after.history.map(eventKey))
  let gained = 0
  for (const k of afterKeys) if (!beforeKeys.has(k)) gained += 1
  let lost = 0
  for (const k of beforeKeys) if (!afterKeys.has(k)) lost += 1

  const byTitle = (a: SeriesChange, b: SeriesChange): number => a.title.localeCompare(b.title, 'fr')
  return {
    mode,
    series: { before: was.size, after: now.size },
    episodes: { before: before.history.length, after: after.history.length, gained, lost },
    lists: { before: before.lists.length, after: after.lists.length },
    mangas: { before: before.mangaEntries.length, after: after.mangaEntries.length },
    added: added.sort(byTitle),
    removed: removed.sort(byTitle),
    changed: changed.sort(byTitle),
    identical:
      !added.length &&
      !removed.length &&
      !changed.length &&
      !gained &&
      !lost &&
      mangaStamp(before) === mangaStamp(after) &&
      before.reads.length === after.reads.length
  }
}

/**
 * Un fichier qui se donne pour une sauvegarde l'est-il ?
 *
 * Le minimum pour ne pas remplacer une bibliothèque par du vide : un tableau
 * de séries, et un journal s'il y en a un.
 */
export function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<Snapshot>
  return Array.isArray(v.entries) && (v.history === undefined || Array.isArray(v.history))
}
