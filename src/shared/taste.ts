/**
 * Un profil de goût, construit à partir de ce qui a été regardé et noté.
 *
 * Ce que faisait l'app jusqu'ici — demander à AniList les voisins de huit
 * titres — est un conseil de la communauté, pas un conseil personnel : il
 * répond « les gens qui ont aimé ça ont aimé ceci », jamais « tu notes haut
 * les drames de Bones et bas les comédies scolaires ».
 *
 * Ici, chaque série regardée devient une appréciation entre -1 et 1, puis
 * chaque genre et chaque studio hérite de la moyenne des appréciations des
 * séries où il apparaît. Ce qui compte n'est pas cette moyenne mais son écart
 * à la moyenne générale : quelqu'un qui note tout entre 7 et 9 n'aime pas
 * *tout*, il note haut. L'écart, lui, dit ce qui sort du lot.
 *
 * Deux garde-fous, parce que les bibliothèques sont petites :
 *
 * - Un genre vu deux fois ne prouve rien. Chaque écart est ramené vers zéro
 *   d'autant plus fort qu'il repose sur peu de séries (`SHRINK`).
 * - Les séries « prévues » sont ignorées : une intention n'est pas un avis.
 *
 * Reste le cas qui n'a rien d'exceptionnel : **personne n'a rien noté**. Toutes
 * les appréciations valent alors la même chose, les écarts tombent à trois
 * millièmes et le classement ne dit plus rien. Une bibliothèque sans note
 * porte pourtant un goût très net — celui d'avoir choisi ces séries-là et pas
 * d'autres. D'où un second axe, la **fréquence** : la place qu'un genre occupe
 * dans ce qui a été regardé. Les deux sont mélangés à proportion de ce que
 * les notes apprennent réellement (`spread`) ; sans notes, la fréquence décide
 * seule, et la phrase affichée le dit — « tu regardes beaucoup de » plutôt que
 * « tu notes haut ».
 *
 * Tout est pur et sans réseau : c'est la seule façon de vérifier qu'un profil
 * dit bien ce qu'il prétend dire.
 */

/** Ce qu'on sait d'une série de la bibliothèque, réduit à ce qui pèse. */
export interface Rated {
  genres: string[]
  studios: string[]
  /** Note donnée par l'utilisateur, de 1 à 10. */
  score: number | null
  /** `completed`, `watching`, `paused`, `dropped`. Jamais `planned`. */
  status: string
  favorite: boolean
  rewatches: number
  /** Combien de ressentis ont été posés dessus. */
  emotions: number
}

export interface TasteFacet {
  name: string
  /** Écart d'appréciation à la moyenne. Positif : mieux aimé que le reste. */
  lift: number
  /**
   * Écart de fréquence : la part de la bibliothèque que cette facette occupe,
   * moins la part moyenne. Positif : plus regardé que le reste.
   */
  pull: number
  /** Sur combien de séries elle repose. Une facette rare ment plus facilement. */
  count: number
}

export interface TasteProfile {
  genres: TasteFacet[]
  studios: TasteFacet[]
  /** Séries qui ont servi à le construire. */
  sample: number
  /** Combien d'entre elles portent une note. Zéro n'a rien d'exceptionnel. */
  scored: number
  /** L'appréciation moyenne — la ligne de flottaison. */
  mean: number
  /**
   * L'écart-type des appréciations.
   *
   * C'est la mesure de ce que les notes apprennent : à zéro, tout a été jugé
   * pareil et l'axe de l'appréciation ne sert à rien.
   */
  spread: number
}

/**
 * Force du rappel vers la moyenne.
 *
 * Trois séries fictives et neutres s'ajoutent à chaque facette : un genre vu
 * une seule fois garde donc à peine un quart de son écart, un genre vu vingt
 * fois le garde presque entier.
 */
const SHRINK = 3

/** Ce qu'un statut dit à lui seul, quand aucune note n'a été donnée. */
const STATUS_WEIGHT: Record<string, number> = {
  completed: 0.4,
  watching: 0.2,
  paused: -0.2,
  dropped: -0.8
}

const clamp = (v: number, lo = -1, hi = 1): number => Math.min(hi, Math.max(lo, v))

/**
 * L'appréciation d'une série, entre -1 et 1.
 *
 * La note prime quand elle existe : c'est un avis explicite. Six sur dix est
 * le point neutre — c'est la note qu'on met à ce qu'on a fini sans plus.
 */
export function likingOf(row: Rated): number {
  const base = row.score !== null && row.score > 0 ? (row.score - 6) / 4 : (STATUS_WEIGHT[row.status] ?? 0)

  const bonus =
    (row.favorite ? 0.4 : 0) +
    // Revoir une série est l'avis le plus fort qui soit : on y est retourné.
    Math.min(0.5, row.rewatches * 0.25) +
    Math.min(0.15, row.emotions * 0.05)

  return clamp(base + bonus)
}

function facets(rows: { keys: string[]; liking: number }[], mean: number): TasteFacet[] {
  const tally = new Map<string, { sum: number; count: number }>()
  for (const row of rows) {
    for (const key of new Set(row.keys)) {
      const held = tally.get(key) ?? { sum: 0, count: 0 }
      held.sum += row.liking
      held.count += 1
      tally.set(key, held)
    }
  }
  if (!tally.size) return []

  // La part moyenne sert de ligne de flottaison à la fréquence : au-dessus,
  // la facette est plus regardée que les autres facettes de cette
  // bibliothèque — ce qui est la seule comparaison honnête sans catalogue de
  // référence sous la main.
  const shares = [...tally.values()].map((t) => t.count / rows.length)
  const meanShare = shares.reduce((n, v) => n + v, 0) / shares.length

  return [...tally.entries()]
    .map(([name, { sum, count }]) => ({
      name,
      lift: (sum + SHRINK * mean) / (count + SHRINK) - mean,
      pull: count / rows.length - meanShare,
      count
    }))
    .sort((a, b) => b.lift - a.lift)
}

/** Construit le profil. Une bibliothèque vide en rend un vide, pas une erreur. */
export function buildProfile(rows: Rated[]): TasteProfile {
  const usable = rows.filter((row) => row.status !== 'planned')
  if (!usable.length) return { genres: [], studios: [], sample: 0, scored: 0, mean: 0, spread: 0 }

  const rated = usable.map((row) => ({ ...row, liking: likingOf(row) }))
  const mean = rated.reduce((n, row) => n + row.liking, 0) / rated.length
  const spread = Math.sqrt(rated.reduce((n, row) => n + (row.liking - mean) ** 2, 0) / rated.length)

  return {
    genres: facets(
      rated.map((row) => ({ keys: row.genres, liking: row.liking })),
      mean
    ),
    studios: facets(
      rated.map((row) => ({ keys: row.studios, liking: row.liking })),
      mean
    ),
    sample: rated.length,
    scored: usable.filter((row) => row.score !== null && row.score > 0).length,
    mean,
    spread
  }
}

/** En deçà, le profil repose sur trop peu de séries pour valoir un conseil. */
export const MIN_SAMPLE = 12

/** Ce qu'on note d'un candidat : sa place, et pourquoi il l'a. */
export interface Scored {
  score: number
  reasons: string[]
}

/**
 * Écart-type à partir duquel les notes portent seules le classement.
 *
 * En dessous, elles n'ont pas assez départagé les séries pour qu'on s'y fie,
 * et la fréquence reprend la main à proportion.
 */
export const FULL_SPREAD = 0.4

const lookup = (facets: TasteFacet[]): Map<string, TasteFacet> => new Map(facets.map((f) => [f.name, f]))

/** « de la romance », « d'action » : l'élision, sinon la phrase cloche. */
function partitive(name: string): string {
  return /^[aeiouyéèêh]/i.test(name) ? `d’${name}` : `de ${name}`
}

/** Le poids donné à l'appréciation, de 0 (rien de noté) à 1 (avis tranchés). */
export function trustInScores(profile: TasteProfile): number {
  return clamp(profile.spread / FULL_SPREAD, 0, 1)
}

/**
 * Confronte une série au profil.
 *
 * Les facettes sont **moyennées**, jamais additionnées : sans cela une série à
 * six genres l'emporterait sur une série à deux, uniquement parce qu'elle a
 * plus d'occasions de marquer.
 *
 * Le studio pèse moins que les genres — on regarde d'abord une histoire — et
 * la note d'AniList ne sert qu'à départager : elle ne dit rien de ce goût-ci,
 * seulement qu'une série est ratée ou non.
 */
export function scoreAgainst(
  profile: TasteProfile,
  media: { genres: string[]; studios: string[]; averageScore: number | null },
  /**
   * Traduit un nom de genre pour la phrase affichée. AniList les nomme en
   * anglais ; l'app parle français, et « tu regardes beaucoup de Slice of
   * Life » n'est une phrase dans aucune des deux langues.
   */
  label: (name: string) => string = (name) => name
): Scored {
  const byGenre = lookup(profile.genres)
  const byStudio = lookup(profile.studios)

  const genres = media.genres.map((name) => byGenre.get(name)).filter((f): f is TasteFacet => !!f)
  const studios = media.studios.map((name) => byStudio.get(name)).filter((f): f is TasteFacet => !!f)

  const trust = trustInScores(profile)
  // La fréquence vit à une autre échelle que l'appréciation : une part de
  // bibliothèque dépasse rarement 0,4, là où un écart de note atteint 1.
  const affinity = (f: TasteFacet): number => trust * f.lift + (1 - trust) * f.pull * 2

  const genreScore = genres.length ? genres.reduce((n, f) => n + affinity(f), 0) / genres.length : 0
  // Le meilleur studio, pas la moyenne : une coproduction ne doit pas diluer
  // celui dont on aime tout.
  const studioScore = studios.length ? Math.max(...studios.map(affinity)) : 0
  const quality = media.averageScore !== null ? clamp((media.averageScore - 70) / 30) : 0

  const score = 0.62 * genreScore + 0.28 * studioScore + 0.1 * quality

  // Seul ce qui tire vers le haut est dit : « parce que tu n'aimes pas les
  // comédies » n'est pas une raison de conseiller quelque chose. Et le seuil
  // porte sur l'affinité effective, pas sur l'un des deux axes : sinon une
  // bibliothèque sans note n'aurait jamais aucune raison à afficher.
  const said = (list: TasteFacet[]): TasteFacet[] =>
    list.filter((f) => affinity(f) > 0.01).sort((a, b) => affinity(b) - affinity(a))

  const reasons: string[] = []
  const topGenres = said(genres).slice(0, 2)
  if (topGenres.length) {
    const names = topGenres.map((f) => label(f.name).toLowerCase())
    // La phrase dit d'où vient le classement. Promettre « tu notes haut » à
    // quelqu'un qui n'a rien noté serait un mensonge vérifiable en un clic.
    reasons.push(
      trust >= 0.5
        ? `tu notes haut ${names.map((n) => `le ${n}`).join(' et ')}`
        : `tu regardes beaucoup ${names.map(partitive).join(' et ')}`
    )
  }

  const topStudio = said(studios)[0]
  if (topStudio) reasons.push(`et le studio ${topStudio.name}`)

  return { score, reasons }
}

/**
 * Les facettes qui portent vraiment le profil, pour le montrer à l'écran.
 *
 * Classées par l'affinité effective, celle qui a servi au classement — sinon
 * la page annoncerait un goût que le tri n'a pas suivi.
 */
export function highlights(profile: TasteProfile, count = 4): TasteFacet[] {
  const trust = trustInScores(profile)
  const affinity = (f: TasteFacet): number => trust * f.lift + (1 - trust) * f.pull * 2
  return profile.genres
    .filter((f) => f.count >= 2 && affinity(f) > 0)
    .sort((a, b) => affinity(b) - affinity(a))
    .slice(0, count)
}
