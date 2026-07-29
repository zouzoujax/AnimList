const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 }

export function deaccent(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function slugify(text: string): string {
  return deaccent(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Streaming sites drop apostrophes and colons outright instead of turning them
 * into separators: "Re:ZERO" is `rezero`, not `re-zero`, and "The Aristocrat's"
 * is `the-aristocrats`. Verified against every known-good URL.
 */
export function siteSlug(text: string): string {
  return deaccent(text)
    .replace(/['’ʼ:]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Comparison form: lowercase letters and digits only, so punctuation never decides a match. */
export function compact(text: string): string {
  return deaccent(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * Streaming sites file every cour of a show under one entry, so "One-Punch Man
 * Season 2" has to become "One-Punch Man" + season 2 before it can be looked up.
 */
export function baseAndSeason(title: string): { base: string; season: number } {
  let base = title.trim()
  let season = 1

  // "Final Season" carries no number. Returning 1 would point a season-specific
  // lookup at the wrong URL, so 0 is used to mean "unknown" and callers fall
  // back to the series page.
  const final = base.match(/[\s:,-]+(?:the\s+)?final\s+season.*$/i)
  if (final && final.index !== undefined) {
    return { base: base.slice(0, final.index).trim(), season: 0 }
  }

  const patterns: RegExp[] = [
    /[\s:,-]+season\s+(\d+).*$/i,
    /[\s:,-]+(\d+)(?:st|nd|rd|th)\s+season.*$/i,
    /[\s:,-]+part\s+(\d+)\s*$/i,
    /\s+([IVX]{1,4})\s*$/,
    /\s+(\d)\s*$/
  ]
  for (const pattern of patterns) {
    const match = base.match(pattern)
    if (!match || match.index === undefined) continue
    if (match[1]) season = ROMAN[match[1].toLowerCase()] ?? Number(match[1])
    base = base.slice(0, match.index).trim()
    break
  }
  return { base, season }
}

/** Search terms sites actually index: no punctuation, no leading article. */
export function searchVariants(base: string): string[] {
  const out: string[] = []
  const push = (value: string): void => {
    const clean = value
      .replace(/[:!?‼|·–—_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    // "Re:Zero kara…" splits down to "Re"; a two-letter query matches anything.
    if (clean.length >= 3 && !out.includes(clean)) out.push(clean)
  }
  push(base)
  push(base.replace(/^the\s+/i, ''))
  push(base.split(/[:–—]|\s-\s|\s-(?=\S)/)[0])
  push(base.split(/[:–—]|\s-\s|\s-(?=\S)/)[0].replace(/^the\s+/i, ''))
  return out
}

/**
 * Substring match that ignores punctuation, spacing and accents, so "rezero"
 * and "re zero" both find "Re:Zero kara Hajimeru Isekai Seikatsu".
 */
export function titleMatches(needle: string, titles: (string | null | undefined)[]): boolean {
  const flat = compact(needle)
  if (!flat) return true
  return titles.some((title) => title && compact(title).includes(flat))
}

/** Levenshtein similarity in [0,1]. */
export function similarity(a: string, b: string): number {
  if (!a.length || !b.length) return 0
  if (a === b) return 1
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return 1 - row[b.length] / Math.max(a.length, b.length)
}

/** « … Part 2 » en fin de titre : un cour, pas une saison de plus. */
const PART = /[\s:,-]+part\s*(\d+)\s*$/i

/**
 * Numérote une suite de saisons comme un spectateur les compte.
 *
 * La position dans la liste ne suffit pas : AniList range les cours d'une saison
 * scindée comme des entrées à part, si bien que « Slime 4th Season » arrivait
 * cinquième. Le titre sait mieux quand il porte un numéro ; « Final Season »
 * n'en porte aucun et prend simplement le suivant, et « Part 2 » prolonge la
 * saison précédente au lieu d'en ouvrir une.
 *
 * Les titres doivent arriver dans l'ordre de diffusion.
 */
export function seasonNumbers(titles: string[]): { number: number; part: number | null }[] {
  const out: { number: number; part: number | null }[] = []
  let n = 0

  for (const title of titles) {
    const part = PART.exec(title)
    const claimed = baseAndSeason(title).season

    if (part && n > 0) {
      // Le numéro ne bouge pas : c'est la suite de la même saison.
    } else if (claimed > n) n = claimed
    else n += 1

    out.push({ number: n, part: part ? Number(part[1]) : null })
  }

  return out
}
