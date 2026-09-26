/**
 * Le suivi de lecture des mangas : ce que devient une fiche quand on avance.
 *
 * Pur et testé, comme `restore.ts` : c'est ce qui écrit le journal de
 * lecture, et le processus principal comme la fenêtre en tirent leurs
 * chiffres.
 *
 * Deux gestes, deux sens. « +1 » est une lecture : elle se date d'aujourd'hui
 * et nourrit le mois en cours. Taper un numéro est un rattrapage : il compte
 * dans les totaux mais reste hors de ce qui se mesure au jour — un manga lu
 * depuis des années n'a pas été lu cet après-midi.
 */

import type { LibraryStatus, MangaEntry, ReadEvent } from './types'

export const readPass = (ev: ReadEvent): number => ev.pass ?? 0

export function newMangaEntry(mangaId: number, now: number): MangaEntry {
  return {
    mangaId,
    status: 'planned',
    addedAt: now,
    updatedAt: now,
    chapter: 0,
    volume: 0,
    favorite: false,
    notes: '',
    rereads: 0,
    startedAt: null,
    finishedAt: null
  }
}

/**
 * Le journal après une avancée — ou un recul — de `from` à `to`.
 *
 * Avancer ajoute une séance. Reculer est une correction : les séances qui
 * dépassent le nouveau point sont rognées ou retirées, pour que le total lu
 * ne compte jamais un chapitre qu'on dit ne pas avoir lu. Seule la lecture en
 * cours est touchée ; les précédentes gardent leurs lignes.
 */
export function logProgress(
  reads: ReadEvent[],
  mangaId: number,
  pass: number,
  from: number,
  to: number,
  at: number,
  imported = false
): ReadEvent[] {
  if (to === from) return reads
  if (to > from) {
    const ev: ReadEvent = { mangaId, from, to, at }
    if (pass > 0) ev.pass = pass
    if (imported) ev.imported = true
    return [...reads, ev]
  }
  const out: ReadEvent[] = []
  for (const ev of reads) {
    if (ev.mangaId !== mangaId || readPass(ev) !== pass || ev.to <= to) out.push(ev)
    else if (ev.from < to) out.push({ ...ev, to })
  }
  return out
}

/**
 * Le statut qui suit la progression.
 *
 * Le même mouvement que pour une série : on commence à lire, on passe « en
 * lecture » ; on atteint le dernier chapitre d'une série finie, on passe
 * « lu ». Une série qui paraît encore n'annonce pas de total, et ne se
 * termine donc jamais toute seule. « Abandonné » et « en pause » sont des
 * choix : rien ici ne les défait, sauf revenir à zéro.
 */
export function settleStatus(entry: MangaEntry, total: number | null, now: number): MangaEntry {
  const next = { ...entry }
  if (next.chapter <= 0) {
    next.chapter = 0
    if (next.status === 'watching' || next.status === 'completed') next.status = 'planned'
    next.startedAt = null
    next.finishedAt = null
    return next
  }
  next.startedAt ??= now
  if (total && next.chapter >= total) {
    if (next.status !== 'dropped') next.status = 'completed'
    next.finishedAt ??= now
  } else if (next.status === 'completed' || next.status === 'planned') {
    next.status = 'watching'
    next.finishedAt = null
  }
  return next
}

/** Chapitres lus dans une séance. */
export const chaptersOf = (ev: ReadEvent): number => Math.max(0, ev.to - ev.from)

export interface ReadingStats {
  /** Mangas suivis, par statut. */
  byStatus: Record<LibraryStatus, number>
  total: number
  /** Chapitres lus, toutes lectures confondues, rattrapages compris. */
  chapters: number
  /** Tomes lus, d'après les fiches. */
  volumes: number
  /** Chapitres lus ce mois-ci, hors rattrapages. */
  thisMonth: number
  /** Journées où l'on a lu, hors rattrapages. */
  activeDays: number
  /** Les douze derniers mois, du plus ancien au plus récent. */
  months: { year: number; month: number; chapters: number }[]
}

export function readingStats(entries: MangaEntry[], reads: ReadEvent[], now: number): ReadingStats {
  const byStatus: Record<LibraryStatus, number> = { watching: 0, planned: 0, completed: 0, paused: 0, dropped: 0 }
  let volumes = 0
  for (const e of entries) {
    byStatus[e.status] += 1
    volumes += e.volume
  }

  const today = new Date(now)
  const months: ReadingStats['months'] = []
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    months.push({ year: d.getFullYear(), month: d.getMonth(), chapters: 0 })
  }
  const slot = new Map(months.map((m, i) => [m.year * 12 + m.month, i]))

  let chapters = 0
  const days = new Set<string>()
  for (const ev of reads) {
    const n = chaptersOf(ev)
    chapters += n
    if (ev.imported) continue
    const d = new Date(ev.at)
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
    const i = slot.get(d.getFullYear() * 12 + d.getMonth())
    if (i !== undefined) months[i].chapters += n
  }

  return {
    byStatus,
    total: entries.length,
    chapters,
    volumes,
    thisMonth: months[months.length - 1].chapters,
    activeDays: days.size,
    months
  }
}
