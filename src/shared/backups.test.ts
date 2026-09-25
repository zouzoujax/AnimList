import { describe, expect, it } from 'vitest'
import { KEEP_RECENT, backupName, freshName, isDue, listBackups, stampOf, toDelete } from './backups'

const at = (y: number, mo: number, d: number, hh = 12, mm = 0): number => new Date(y, mo - 1, d, hh, mm).getTime()
const nom = (y: number, mo: number, d: number, hh = 12, mm = 0): string => backupName(at(y, mo, d, hh, mm))

describe('backupName', () => {
  it('écrit la date et l’heure locales', () => {
    expect(nom(2026, 9, 24, 14, 32)).toBe('animelist-2026-09-24-1432.json')
  })

  it('se relit lui-même', () => {
    const stamp = stampOf(nom(2026, 1, 5, 8, 7))
    expect(stamp?.at).toBe(at(2026, 1, 5, 8, 7))
    expect(stamp?.month).toBe('2026-01')
    expect(stamp?.day).toBe('2026-01-05')
  })
})

describe('listBackups', () => {
  it('ignore ce qui n’est pas à nous', () => {
    const names = ['notes.txt', 'animelist.json', 'animelist-2026-09-24-1432.json', 'animelist-2026-09-24.json']
    expect(listBackups(names).map((s) => s.name)).toEqual(['animelist-2026-09-24-1432.json'])
  })

  it('range du plus récent au plus ancien', () => {
    const names = [nom(2025, 3, 1), nom(2026, 9, 24), nom(2026, 2, 2)]
    expect(listBackups(names).map((s) => s.name)).toEqual([nom(2026, 9, 24), nom(2026, 2, 2), nom(2025, 3, 1)])
  })
})

describe('toDelete', () => {
  it('ne touche à rien tant qu’il y en a peu', () => {
    const names = Array.from({ length: KEEP_RECENT }, (_, i) => nom(2026, 9, i + 1))
    expect(toDelete(names)).toEqual([])
  })

  it('garde les sept dernières', () => {
    const names = Array.from({ length: 20 }, (_, i) => nom(2026, 9, i + 1))
    const gardés = names.filter((n) => !toDelete(names).includes(n))
    // Les sept derniers jours, plus la plus récente du mois parmi les autres —
    // ici le même mois, donc une seule de plus.
    expect(gardés).toContain(nom(2026, 9, 20))
    expect(gardés).toContain(nom(2026, 9, 14))
    expect(gardés).not.toContain(nom(2026, 9, 12))
  })

  it('laisse une copie par mois passé', () => {
    const names = [
      ...Array.from({ length: KEEP_RECENT }, (_, i) => nom(2026, 9, i + 10)),
      nom(2026, 8, 3),
      nom(2026, 8, 28),
      nom(2026, 7, 5),
      nom(2026, 7, 19)
    ]
    const drop = toDelete(names)
    expect(drop).toContain(nom(2026, 8, 3))
    expect(drop).toContain(nom(2026, 7, 5))
    expect(drop).not.toContain(nom(2026, 8, 28))
    expect(drop).not.toContain(nom(2026, 7, 19))
  })

  it('n’efface jamais par vieillesse', () => {
    const names = [...Array.from({ length: KEEP_RECENT }, (_, i) => nom(2026, 9, i + 1)), nom(2019, 4, 2)]
    expect(toDelete(names)).toEqual([])
  })
})

describe('isDue', () => {
  it('oui quand le dossier est vide', () => {
    expect(isDue([], at(2026, 9, 24))).toBe(true)
  })

  it('non quand celle du jour est déjà là', () => {
    expect(isDue([nom(2026, 9, 24, 9, 0)], at(2026, 9, 24, 22, 0))).toBe(false)
  })

  it('oui le lendemain', () => {
    expect(isDue([nom(2026, 9, 24, 23, 59)], at(2026, 9, 25, 0, 1))).toBe(true)
  })
})

describe('freshName', () => {
  it('ne réutilise jamais le nom d’une copie de la même minute', () => {
    const t = at(2026, 9, 26, 1, 15) + 7_000
    const first = freshName([], t)
    expect(first).toBe('animelist-2026-09-26-0115.json')
    const second = freshName([first], t)
    expect(second).toBe('animelist-2026-09-26-011507.json')
    // Relue à la seconde près, et rangée devant la première.
    expect(stampOf(second)?.at).toBe(t)
    expect(listBackups([first, second]).map((s) => s.name)).toEqual([second, first])
  })
})
