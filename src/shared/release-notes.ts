/**
 * Release notes, from the GitHub release body to something the app can draw.
 *
 * Les notes voyagent avec la release, jamais avec l'app : une version installée
 * doit pouvoir décrire une version qui n'existait pas quand elle a été
 * compilée. Le corps de la release GitHub est donc la source, et il est écrit
 * dans un format assez strict pour être relu ici — `CHANGELOG.md` en est la
 * copie lisible, et le script de publication en extrait la section.
 *
 * Le format toléré :
 *
 *     ### Ajouts
 *     - Un filtre sur le mur des badges
 *     ### Corrections
 *     - Les épisodes non diffusés ne peuvent plus être cochés
 *
 * Tout ce qui n'entre pas dans une rubrique connue atterrit dans « Notes »
 * plutôt que d'être perdu : mieux vaut afficher une ligne mal rangée que rien.
 */

export type NoteKind = 'add' | 'change' | 'fix' | 'remove' | 'other'

export interface NoteSection {
  kind: NoteKind
  label: string
  items: string[]
}

export interface ReleaseNote {
  version: string
  sections: NoteSection[]
}

const HEADINGS: { kind: NoteKind; label: string; match: RegExp }[] = [
  { kind: 'add', label: 'Ajouts', match: /^(ajouts?|nouveaut[ée]s?|added)$/i },
  { kind: 'change', label: 'Modifications', match: /^(modifications?|changements?|changed)$/i },
  { kind: 'fix', label: 'Corrections', match: /^(corrections?|correctifs?|fixed?)$/i },
  { kind: 'remove', label: 'Suppressions', match: /^(suppressions?|retraits?|removed?)$/i }
]

const ORDER: NoteKind[] = ['add', 'change', 'fix', 'remove', 'other']

/**
 * Le fournisseur GitHub ne renvoie pas le Markdown qu'on a écrit : il lit le
 * flux atom, où le corps de la release arrive **déjà converti en HTML**. Les
 * deux formes doivent donc être comprises — le Markdown parce que c'est ce que
 * `CHANGELOG.md` contient, le HTML parce que c'est ce que l'app reçoit.
 */
function fromHtml(html: string): string {
  return (
    html
      .replace(/<h[1-6][^>]*>/gi, '\n## ')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(h[1-6]|li|p|div|ul|ol)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
      // En dernier : décoder plus tôt fabriquerait de fausses entités.
      .replace(/&amp;/g, '&')
  )
}

const LOOKS_LIKE_HTML = /<(h[1-6]|li|ul|ol|p|br|div)\b/i

/** Le corps d'une release est du Markdown écrit à la main : il faut le nettoyer. */
function clean(line: string): string {
  return line
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim()
}

export function parseReleaseNote(body: string): NoteSection[] {
  const found = new Map<NoteKind, NoteSection>()
  let current: NoteKind = 'other'
  const text = LOOKS_LIKE_HTML.test(body) ? fromHtml(body) : body

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    const heading = line.match(/^#{1,6}\s*(.+?)\s*:?\s*$/)
    if (heading) {
      const title = clean(heading[1])
      const known = HEADINGS.find((h) => h.match.test(title))
      current = known?.kind ?? 'other'
      continue
    }

    // Hors rubrique, seules les puces comptent : le corps d'une release
    // contient souvent une phrase d'introduction qui n'est pas un changement.
    const isBullet = /^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line)
    if (!isBullet && current === 'other') continue

    const text = clean(line)
    if (!text) continue

    const label = HEADINGS.find((h) => h.kind === current)?.label ?? 'Notes'
    const section = found.get(current) ?? { kind: current, label, items: [] }
    section.items.push(text)
    found.set(current, section)
  }

  return ORDER.map((kind) => found.get(kind)).filter((s): s is NoteSection => s !== undefined && s.items.length > 0)
}

/**
 * Extrait d'un `CHANGELOG.md` la section d'une version.
 *
 * Un titre de niveau deux par version, le numéro quelque part dedans : le reste
 * du titre (une date, un nom) est libre.
 */
export function changelogSection(markdown: string, version: string): string | null {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex((l) => /^##\s/.test(l) && l.includes(version))
  if (start === -1) return null

  const rest = lines.slice(start + 1)
  const end = rest.findIndex((l) => /^##\s/.test(l))
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()
  return body || null
}
