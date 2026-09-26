import { describe, expect, it } from 'vitest'
import { logProgress, newMangaEntry, readingStats, settleStatus } from './reading'
import type { MangaEntry, ReadEvent } from './types'

const at = (y: number, m: number, d: number): number => new Date(y, m, d, 20).getTime()

describe('logProgress', () => {
  it('avancer ajoute une séance', () => {
    const out = logProgress([], 7, 0, 10, 14, 1)
    expect(out).toEqual([{ mangaId: 7, from: 10, to: 14, at: 1 }])
  })

  it('un rattrapage est marqué, une relecture porte sa passe', () => {
    expect(logProgress([], 7, 2, 0, 50, 1, true)).toEqual([
      { mangaId: 7, from: 0, to: 50, at: 1, pass: 2, imported: true }
    ])
  })

  it('reculer rogne et retire les séances qui dépassent', () => {
    const reads: ReadEvent[] = [
      { mangaId: 7, from: 0, to: 10, at: 1 },
      { mangaId: 7, from: 10, to: 20, at: 2 },
      { mangaId: 7, from: 20, to: 30, at: 3 },
      { mangaId: 8, from: 0, to: 30, at: 3 }
    ]
    const out = logProgress(reads, 7, 0, 30, 15, 4)
    expect(out).toEqual([
      { mangaId: 7, from: 0, to: 10, at: 1 },
      { mangaId: 7, from: 10, to: 15, at: 2 },
      { mangaId: 8, from: 0, to: 30, at: 3 }
    ])
  })

  it('reculer ne touche pas aux lectures précédentes', () => {
    const reads: ReadEvent[] = [{ mangaId: 7, from: 0, to: 30, at: 1 }]
    expect(logProgress(reads, 7, 1, 5, 0, 2)).toEqual(reads)
  })
})

describe('settleStatus', () => {
  const base = (patch: Partial<MangaEntry>): MangaEntry => ({ ...newMangaEntry(7, 0), ...patch })

  it('commencer à lire passe en lecture', () => {
    const e = settleStatus(base({ chapter: 3 }), 100, 5)
    expect(e.status).toBe('watching')
    expect(e.startedAt).toBe(5)
  })

  it('le dernier chapitre d’une série finie la termine', () => {
    const e = settleStatus(base({ status: 'watching', chapter: 100, startedAt: 1 }), 100, 5)
    expect(e.status).toBe('completed')
    expect(e.finishedAt).toBe(5)
  })

  it('sans total, rien ne se termine seul', () => {
    expect(settleStatus(base({ status: 'watching', chapter: 900 }), null, 5).status).toBe('watching')
  })

  it('abandonné et en pause restent des choix', () => {
    expect(settleStatus(base({ status: 'dropped', chapter: 100 }), 100, 5).status).toBe('dropped')
    expect(settleStatus(base({ status: 'paused', chapter: 40 }), 100, 5).status).toBe('paused')
  })

  it('revenir à zéro repasse à lire', () => {
    const e = settleStatus(base({ status: 'completed', chapter: 0, startedAt: 1, finishedAt: 2 }), 100, 5)
    expect(e).toMatchObject({ status: 'planned', startedAt: null, finishedAt: null })
  })
})

describe('readingStats', () => {
  it('les rattrapages comptent au total, pas au mois', () => {
    const now = at(2026, 8, 26)
    const reads: ReadEvent[] = [
      { mangaId: 1, from: 0, to: 200, at: at(2026, 8, 1), imported: true },
      { mangaId: 1, from: 200, to: 203, at: at(2026, 8, 20) },
      { mangaId: 2, from: 0, to: 5, at: at(2026, 7, 3) },
      { mangaId: 2, from: 5, to: 6, at: at(2026, 7, 3) }
    ]
    const entries = [
      { ...newMangaEntry(1, 0), status: 'watching' as const, chapter: 203, volume: 20 },
      { ...newMangaEntry(2, 0), status: 'paused' as const, chapter: 6 }
    ]
    const s = readingStats(entries, reads, now)
    expect(s.chapters).toBe(209)
    expect(s.thisMonth).toBe(3)
    expect(s.months[10].chapters).toBe(6)
    expect(s.activeDays).toBe(2)
    expect(s.volumes).toBe(20)
    expect(s.byStatus).toMatchObject({ watching: 1, paused: 1 })
  })
})
