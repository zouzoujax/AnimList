/**
 * Apparier les épisodes listés par les plateformes avec les nôtres.
 *
 * AniList renvoie une liste `streamingEpisodes` dont l'ordre n'est garanti par
 * rien : One Piece arrive en décroissant, en commençant à l'épisode 130 parce
 * que Crunchyroll n'en référence que soixante-neuf. Apparier par position
 * donnait donc à l'épisode 1 le titre, la vignette et le lien de l'épisode 130.
 *
 * Le numéro est écrit dans le libellé — « Episode 130 - Scent of Danger! ». On
 * s'en sert, et une entrée dont on ne peut pas lire le numéro n'est rattachée à
 * rien plutôt qu'au hasard.
 */

export interface StreamEpisode {
  title: string | null
  thumbnail: string | null
  url: string | null
}

export interface MatchedEpisode {
  number: number
  title: string | null
  thumbnail: string | null
  url: string | null
}

const LABEL = /^\s*(?:e|ep|[ée]p(?:isode)?)\s*\.?\s*(\d{1,4})\b/i

/** Le numéro écrit en tête du libellé, s'il y en a un. */
export function labelNumber(title: string | null): number | null {
  if (!title) return null
  const match = LABEL.exec(title)
  return match ? Number(match[1]) : null
}

/** Le libellé sans son « Episode N - » : la grille affiche déjà le numéro. */
export function stripLabel(title: string | null): string | null {
  if (!title) return null
  return title.replace(/^\s*(?:e|ep|[ée]p(?:isode)?)\s*\.?\s*\d{1,4}\s*[-–—:]?\s*/i, '').trim() || null
}

/**
 * AniList sert encore des URLs Crunchyroll d'un autre temps — `http://`, sans
 * segment de langue. Les remettre d'aplomb garde le navigateur sur le catalogue
 * français au lieu de le faire rebondir vers l'américain.
 */
export function normalizeStreamUrl(url: string | null): string | null {
  if (!url) return null
  return url
    .replace(/^http:/, 'https:')
    .replace(/^https:\/\/(?:www\.)?crunchyroll\.com\/(?![a-z]{2}\/)/, 'https://www.crunchyroll.com/fr/')
}

export function matchStreamEpisodes(listed: StreamEpisode[], total: number): MatchedEpisode[] {
  const byNumber = new Map<number, StreamEpisode>()
  for (const item of listed) {
    const n = labelNumber(item.title)
    // Le premier gagne : un doublon est une reprise, pas une correction.
    if (n !== null && !byNumber.has(n)) byNumber.set(n, item)
  }

  /**
   * Aucun libellé numéroté et une liste qui tombe pile sur le total : c'est le
   * seul cas où la position ne peut pas mentir sur le numéro. Partout ailleurs,
   * mieux vaut ne rien afficher qu'afficher l'épisode d'à côté.
   */
  const positional = byNumber.size === 0 && listed.length === total

  const out: MatchedEpisode[] = []
  for (let n = 1; n <= total; n += 1) {
    const src = byNumber.get(n) ?? (positional ? listed[n - 1] : undefined)
    out.push({
      number: n,
      title: stripLabel(src?.title ?? null),
      thumbnail: src?.thumbnail ?? null,
      url: normalizeStreamUrl(src?.url ?? null)
    })
  }
  return out
}
