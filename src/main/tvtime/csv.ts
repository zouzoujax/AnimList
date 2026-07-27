/**
 * Minimal RFC 4180 CSV reader for the TV Time / OpenTV export.
 *
 * The export is machine-written, so the exotic corners of the format never show
 * up — but series titles regularly carry commas ("Kaguya-sama: Love Is War"),
 * quotes, and the occasional embedded newline in a synopsis, which rules out a
 * `split(',')`. Anything more capable would be a dependency, and this project
 * ships none at runtime.
 */

export type CsvRow = Record<string, string>

/**
 * Splits `text` into rows of raw fields, honouring quoted sections.
 *
 * A field is quoted when it *starts* with a quote; inside one, `""` is a literal
 * quote and separators lose their meaning.
 */
function splitRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  // Distinguishes an empty unquoted field from `""`, which is also empty but
  // must still produce a field rather than being skipped.
  let touched = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]

    if (quoted) {
      if (c !== '"') {
        field += c
      } else if (text[i + 1] === '"') {
        field += '"'
        i++
      } else {
        quoted = false
      }
      continue
    }

    if (c === '"' && field === '') {
      quoted = true
      touched = true
    } else if (c === ',') {
      row.push(field)
      field = ''
      touched = false
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      touched = false
    } else if (c !== '\r') {
      field += c
      touched = true
    }
  }

  // A file that does not end with a newline still has a last row to flush.
  if (field !== '' || touched || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/**
 * Parses `text` into objects keyed by the header row.
 *
 * Blank lines are dropped. A row shorter than the header gets empty strings for
 * the missing columns rather than `undefined`, so callers never have to guard.
 */
export function parseCsv(text: string): CsvRow[] {
  // Excel and several exporters prefix a byte-order mark, which would otherwise
  // end up glued to the first column name and break every lookup on it.
  const rows = splitRows(text.replace(/^\uFEFF/, ''))
  const header = rows.shift()
  if (!header) return []

  const out: CsvRow[] = []
  for (const row of rows) {
    // A trailing newline yields a single empty field; that is not a record.
    if (row.length <= 1 && (row[0] ?? '') === '') continue
    const record: CsvRow = {}
    for (let i = 0; i < header.length; i++) record[header[i]] = row[i] ?? ''
    out.push(record)
  }
  return out
}
