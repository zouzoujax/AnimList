import { describe, expect, it } from 'vitest'
import { CSV_BOM, exportName, ofYear, spokenHours, toCsv, toMarkdown, yearsOf, type ExportRow } from './journal-export'

const at = (y: number, mo: number, d: number, hh = 21, mm = 30): number => new Date(y, mo - 1, d, hh, mm).getTime()

const row = (over: Partial<ExportRow> = {}): ExportRow => ({
  at: at(2026, 9, 24),
  title: 'Jujutsu Kaisen',
  episode: 12,
  minutes: 24,
  ...over
})

describe('spokenHours', () => {
  it('parle en heures dès qu’il y en a une', () => {
    expect(spokenHours(48)).toBe('48 min')
    expect(spokenHours(60)).toBe('1 h 00')
    expect(spokenHours(3380)).toBe('56 h 20')
  })
})

describe('yearsOf / ofYear', () => {
  it('liste les années, la plus récente d’abord', () => {
    const rows = [row({ at: at(2024, 3, 1) }), row(), row({ at: at(2025, 1, 1) })]
    expect(yearsOf(rows)).toEqual([2026, 2025, 2024])
  })

  it('découpe par année, ou rend tout', () => {
    const rows = [row({ at: at(2024, 3, 1) }), row()]
    expect(ofYear(rows, 2024)).toHaveLength(1)
    expect(ofYear(rows, null)).toHaveLength(2)
  })
})

describe('toMarkdown', () => {
  it('annonce le total en tête', () => {
    const md = toMarkdown([row(), row({ episode: 13, minutes: 36 })])
    expect(md).toContain('# Journal')
    expect(md).toContain('_2 épisodes, 1 h 00 de visionnage._')
  })

  it('titre chaque journée une seule fois', () => {
    const md = toMarkdown([row(), row({ episode: 13, at: at(2026, 9, 24, 22, 0) })])
    expect(md.match(/## Jeudi 24 septembre 2026/g)).toHaveLength(1)
  })

  it('met une ligne par épisode, avec l’heure', () => {
    expect(toMarkdown([row()])).toContain('- 21:30 — **Jujutsu Kaisen** · épisode 12 · 24 min')
  })

  it('cite la note sous son épisode, ligne à ligne', () => {
    const md = toMarkdown([row({ note: 'Deux lignes\nde suite' })])
    expect(md).toContain('  > Deux lignes')
    expect(md).toContain('  > de suite')
  })

  it('dit les ressentis et les repasses', () => {
    const md = toMarkdown([row({ emotions: ['😍'], pass: 1 })])
    expect(md).toContain('2ᵉ visionnage')
    expect(md).toContain('😍')
  })

  it('range du plus récent au plus ancien', () => {
    const md = toMarkdown([row({ at: at(2026, 9, 20), title: 'Vieux' }), row({ title: 'Récent' })])
    expect(md.indexOf('Récent')).toBeLessThan(md.indexOf('Vieux'))
  })

  it('reste lisible quand il n’y a rien', () => {
    expect(toMarkdown([])).toContain('_Rien à montrer._')
  })
})

describe('toCsv', () => {
  const lines = (text: string): string[] => text.replace(CSV_BOM, '').trimEnd().split('\r\n')

  it('commence par un BOM, pour les tableurs', () => {
    expect(toCsv([row()]).startsWith(CSV_BOM)).toBe(true)
  })

  it('pose l’en-tête puis une ligne par épisode', () => {
    const out = lines(toCsv([row()]))
    expect(out[0]).toBe('date,heure,serie,episode,minutes,visionnage,emotions,note')
    expect(out[1]).toBe('2026-09-24,21:30,Jujutsu Kaisen,12,24,1,,')
  })

  it('protège une virgule et des guillemets dans un titre', () => {
    const out = lines(toCsv([row({ title: 'Fate/stay night, "UBW"' })]))
    expect(out[1]).toContain('"Fate/stay night, ""UBW"""')
  })

  it('aplatit une note sur plusieurs lignes', () => {
    const out = lines(toCsv([row({ note: 'une\nnote' })]))
    expect(out).toHaveLength(2)
    expect(out[1].endsWith('une note')).toBe(true)
  })

  it('compte les visionnages à partir de 1', () => {
    const out = lines(toCsv([row({ pass: 1 })]))
    expect(out[1].split(',')[5]).toBe('2')
  })
})

describe('exportName', () => {
  it('propose un nom qui dit ce qu’il contient', () => {
    expect(exportName(2026, 'md')).toBe('journal-2026.md')
    expect(exportName(null, 'csv')).toBe('journal-tout.csv')
  })
})
