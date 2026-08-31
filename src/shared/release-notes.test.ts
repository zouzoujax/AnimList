import { describe, expect, it } from 'vitest'
import { changelogSection, parseReleaseNote } from './release-notes'

describe('parseReleaseNote', () => {
  it('groups the bullets under the headings it knows', () => {
    const sections = parseReleaseNote(`### Ajouts
- Un filtre sur les badges
- Les notes de version

### Corrections
- Les épisodes non diffusés`)

    expect(sections.map((s) => s.kind)).toEqual(['add', 'fix'])
    expect(sections[0].items).toEqual(['Un filtre sur les badges', 'Les notes de version'])
    expect(sections[1].label).toBe('Corrections')
  })

  it('always lists additions first, whatever the order in the file', () => {
    const sections = parseReleaseNote(`### Corrections
- b
### Ajouts
- a`)
    expect(sections.map((s) => s.kind)).toEqual(['add', 'fix'])
  })

  it('accepts the English and singular spellings', () => {
    expect(parseReleaseNote('## Fixed\n- a')[0].kind).toBe('fix')
    expect(parseReleaseNote('## Ajout\n- a')[0].kind).toBe('add')
    expect(parseReleaseNote('## Retraits\n- a')[0].kind).toBe('remove')
  })

  it('strips the markdown a hand-written body carries', () => {
    const items = parseReleaseNote('### Ajouts\n- **Gras**, `code` et un [lien](https://x.dev)')[0].items
    expect(items).toEqual(['Gras, code et un lien'])
  })

  it('keeps stray bullets rather than dropping them', () => {
    const sections = parseReleaseNote('- une ligne sans rubrique')
    expect(sections).toEqual([{ kind: 'other', label: 'Notes', items: ['une ligne sans rubrique'] }])
  })

  it('ignores an introduction that is not a change', () => {
    expect(parseReleaseNote('Cette version répare les mises à jour.')).toEqual([])
  })

  it('returns nothing for an empty body', () => {
    expect(parseReleaseNote('')).toEqual([])
  })
})

describe('changelogSection', () => {
  const file = `# Journal

## 0.3.3 — 31 août 2026

### Ajouts
- Les notes de version

## 0.3.2

### Corrections
- Les épisodes non diffusés
`

  it('cuts the section out at the next version', () => {
    expect(changelogSection(file, '0.3.3')).toBe('### Ajouts\n- Les notes de version')
  })

  it('reads the last section down to the end of the file', () => {
    expect(changelogSection(file, '0.3.2')).toBe('### Corrections\n- Les épisodes non diffusés')
  })

  it('returns null for a version it does not know', () => {
    expect(changelogSection(file, '9.9.9')).toBeNull()
  })
})
