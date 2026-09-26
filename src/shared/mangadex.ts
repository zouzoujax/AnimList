/**
 * Les chapitres parus, d'après MangaDex.
 *
 * AniList ne date aucun chapitre : MangaDex, lui, sait quand chaque chapitre
 * est devenu lisible, et dans quelle langue. On y retient le français et
 * l'anglais.
 *
 * Deux règles tiennent la lecture juste :
 * - **l'association est exacte** : une série MangaDex porte l'identifiant
 *   AniList dans ses liens (`links.al`). Un titre qui se ressemble ne suffit
 *   pas — sans ce lien, pas de série ;
 * - **un chapitre date de sa première apparition** : MangaDex remet parfois en
 *   ligne de vieux chapitres (Kagurabachi 1 à 3, remis le 9 septembre 2026).
 *   Chaque numéro garde la plus ancienne de ses dates.
 *
 * Pur et testé ; le réseau est dans `main/mangadex.ts`.
 */

export type ChapterLang = 'fr' | 'en'
export const CHAPTER_LANGS: ChapterLang[] = ['fr', 'en']

/** Un chapitre paru : son numéro, le moment où il est devenu lisible, et en quelles langues. */
export interface ChapterRelease {
  chapter: number
  at: number
  langs: ChapterLang[]
}

/** Une série telle que la recherche de MangaDex la renvoie. */
export interface MdSeries {
  id: string
  attributes: { links?: Record<string, string> | null }
}

/** Un chapitre tel que le fil d'une série le renvoie. */
export interface MdChapter {
  attributes: { chapter: string | null; translatedLanguage: string; readableAt: string | null }
}

/**
 * La série MangaDex d'un manga AniList, ou `null`.
 *
 * Les résultats arrivent du plus suivi au moins suivi : la version en couleur
 * d'un fan porte parfois le même lien que l'originale, mais passe après elle.
 */
export function pickSeries(results: MdSeries[], anilistId: number): string | null {
  const al = String(anilistId)
  return results.find((s) => s.attributes.links?.al === al)?.id ?? null
}

/** Les chapitres parus, du plus récent numéro au plus ancien. Un « oneshot » sans numéro n'en est pas. */
export function releasesOf(rows: MdChapter[]): ChapterRelease[] {
  const byNumber = new Map<number, ChapterRelease>()
  for (const { attributes: a } of rows) {
    const chapter = Number.parseFloat(a.chapter ?? '')
    const at = a.readableAt ? Date.parse(a.readableAt) : Number.NaN
    const lang = a.translatedLanguage as ChapterLang
    if (!Number.isFinite(chapter) || !Number.isFinite(at) || !CHAPTER_LANGS.includes(lang)) continue
    const held = byNumber.get(chapter)
    if (!held) {
      byNumber.set(chapter, { chapter, at, langs: [lang] })
      continue
    }
    held.at = Math.min(held.at, at)
    if (!held.langs.includes(lang)) held.langs.push(lang)
  }
  for (const r of byNumber.values()) r.langs.sort((x, y) => CHAPTER_LANGS.indexOf(x) - CHAPTER_LANGS.indexOf(y))
  return [...byNumber.values()].sort((x, y) => y.chapter - x.chapter)
}

/** Le dernier chapitre lisible, entier : un « 130.5 » ne fait pas un chapitre de plus à lire. */
export function latestChapter(releases: ChapterRelease[]): number | null {
  const whole = releases.map((r) => Math.floor(r.chapter))
  return whole.length ? Math.max(...whole) : null
}

/** Combien de chapitres parus attendent d'être lus. */
export function unreadCount(releases: ChapterRelease[], read: number): number {
  const latest = latestChapter(releases)
  return latest === null ? 0 : Math.max(0, latest - read)
}
