/**
 * Le journal, hors de l'app.
 *
 * « Local et inspectable » ne suffit pas tant que la seule façon de relire son
 * journal est d'ouvrir l'app : un fichier JSON de sauvegarde se restaure, il
 * ne se lit pas. Deux formats, pour les deux usages qu'on en a — du Markdown
 * qui se lit tel quel et se colle dans n'importe quel carnet, du CSV qui
 * s'ouvre dans un tableur pour compter autre chose que ce que l'app compte.
 *
 * Pur et testé : ce qui sort d'ici part chez d'autres logiciels, et une
 * virgule mal échappée ne se voit qu'au moment où le tableur décale une
 * colonne.
 */

export interface ExportRow {
  /** Millisecondes. */
  at: number
  title: string
  episode: number
  minutes: number
  note?: string
  /** Les émojis des ressentis, déjà choisis par l'appelant. */
  emotions?: string[]
  /** 0 = premier visionnage, 1 = deuxième passe… */
  pass?: number
}

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre'
]

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

const two = (n: number): string => String(n).padStart(2, '0')

/** « Jeudi 24 septembre 2026 » : l'intitulé d'une journée. */
function dayTitle(at: number): string {
  const d = new Date(at)
  const jour = JOURS[d.getDay()]
  return `${jour.charAt(0).toUpperCase()}${jour.slice(1)} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`
}

const dayKey = (at: number): string => {
  const d = new Date(at)
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}

const clock = (at: number): string => {
  const d = new Date(at)
  return `${two(d.getHours())}:${two(d.getMinutes())}`
}

/** « 56 h 20 », « 48 min ». */
export function spokenHours(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  return h ? `${h} h ${two(total % 60)}` : `${total} min`
}

/** Les années présentes, de la plus récente à la plus ancienne. */
export function yearsOf(rows: ExportRow[]): number[] {
  const years = new Set<number>()
  for (const row of rows) years.add(new Date(row.at).getFullYear())
  return [...years].sort((a, b) => b - a)
}

/** Les lignes d'une année, ou toutes quand aucune n'est demandée. */
export function ofYear(rows: ExportRow[], year: number | null): ExportRow[] {
  if (year === null) return rows
  return rows.filter((row) => new Date(row.at).getFullYear() === year)
}

/**
 * Le journal en Markdown : un titre par journée, une ligne par épisode.
 *
 * Par journée et non par mois : c'est le grain auquel on se souvient d'avoir
 * regardé quelque chose, et celui qu'emploie déjà la page. Les notes sont
 * citées sous leur épisode, seule forme qui survive à une relecture six mois
 * plus tard.
 */
export function toMarkdown(rows: ExportRow[], title = 'Journal'): string {
  const sorted = [...rows].sort((a, b) => b.at - a.at)
  const minutes = sorted.reduce((sum, row) => sum + (row.minutes || 0), 0)

  const out: string[] = [`# ${title}`, '']
  out.push(
    sorted.length === 0
      ? '_Rien à montrer._'
      : `_${sorted.length} épisode${sorted.length > 1 ? 's' : ''}, ${spokenHours(minutes)} de visionnage._`
  )

  let day = ''
  for (const row of sorted) {
    const key = dayKey(row.at)
    if (key !== day) {
      day = key
      out.push('', `## ${dayTitle(row.at)}`, '')
    }
    const parts = [`**${row.title}**`, `épisode ${row.episode}`]
    if (row.minutes > 0) parts.push(`${row.minutes} min`)
    if (row.pass) parts.push(`${row.pass + 1}ᵉ visionnage`)
    if (row.emotions?.length) parts.push(row.emotions.join(' '))
    out.push(`- ${clock(row.at)} — ${parts.join(' · ')}`)
    // La note sur sa propre ligne, en citation : une note de trois phrases
    // rendait la liste illisible quand elle tenait sur la même.
    if (row.note?.trim()) {
      for (const line of row.note.trim().split(/\r?\n/)) out.push(`  > ${line}`)
    }
  }

  return out.join('\n') + '\n'
}

/**
 * Le début d'un CSV destiné à un tableur.
 *
 * Sans lui, Excel lit le fichier dans le codage de la machine et rend « Frï¿½ren ».
 * C'est la seule concession du format à un logiciel en particulier, et elle ne
 * gêne aucun des autres.
 */
export const CSV_BOM = '﻿'

/** Une valeur de CSV : guillemets seulement quand il le faut, doublés à l'intérieur. */
function cell(value: string | number): string {
  const text = String(value)
  if (!/[",;\n\r]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

/**
 * Le journal en CSV, une ligne par épisode.
 *
 * Séparé par des virgules et non par des points-virgules : c'est la norme, et
 * les tableurs francophones savent le demander à l'ouverture. La date et
 * l'heure sont en colonnes séparées, sans quoi tout tri par heure demande de
 * redécouper la chaîne.
 */
export function toCsv(rows: ExportRow[]): string {
  const head = ['date', 'heure', 'serie', 'episode', 'minutes', 'visionnage', 'emotions', 'note']
  const lines = [head.join(',')]

  for (const row of [...rows].sort((a, b) => b.at - a.at)) {
    lines.push(
      [
        cell(dayKey(row.at)),
        cell(clock(row.at)),
        cell(row.title),
        cell(row.episode),
        cell(row.minutes || 0),
        cell((row.pass ?? 0) + 1),
        cell((row.emotions ?? []).join(' ')),
        cell((row.note ?? '').replace(/\r?\n/g, ' '))
      ].join(',')
    )
  }

  return CSV_BOM + lines.join('\r\n') + '\r\n'
}

/** `journal-2026.md` — le nom proposé à l'enregistrement. */
export function exportName(year: number | null, format: 'md' | 'csv'): string {
  return `journal-${year ?? 'tout'}.${format}`
}
