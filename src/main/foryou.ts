/**
 * Les recommandations, tirées du profil de goût.
 *
 * L'ancienne version demandait à AniList les voisins de huit titres aimés et
 * les affichait dans l'ordre où la communauté les avait votés. C'est un bon
 * pourvoyeur de candidats, et un mauvais juge : il répond « les gens qui ont
 * aimé ça ont aimé ceci », sans jamais savoir que celui qui regarde note haut
 * les drames et abandonne les comédies scolaires.
 *
 * Ici les deux rôles sont séparés :
 *
 * - **Trouver des candidats** — les voisins votés par la communauté, plus les
 *   classements et la saison, plus les meilleurs titres des genres que le
 *   profil place en tête. Un genre aimé mais absent des tendances ne
 *   remonterait jamais autrement.
 * - **Les classer** — le profil, et lui seul, avec la raison affichée. Une
 *   recommandation sans raison ne se vérifie pas.
 *
 * Rien n'est écrit : cette page se consulte.
 */

import { baseAndSeason, compact } from '@shared/titles'
import { buildProfile, highlights, MIN_SAMPLE, scoreAgainst, type Rated, type TasteProfile } from '@shared/taste'
import { GENRE_LABELS, type Entry, type ForYou, type ForYouPick, type Media } from '@shared/types'
import { browse, recommended } from './anilist'
import { getPrefs, snapshot } from './store'

/** Assez pour que le classement ait de la matière, sans noyer la page. */
const KEEP = 24

/** Les graines envoyées à la communauté : au-delà, la requête devient lourde. */
const SEEDS = 8

/** Ce qui vient d'une recommandation de la communauté part avec une avance. */
const COMMUNITY_BONUS = 0.06

/** Un profil se construit sur ce qui a été regardé, jamais sur une intention. */
function ratedRows(entries: Entry[], media: Map<number, Media>): Rated[] {
  const rows: Rated[] = []
  for (const entry of entries) {
    const m = media.get(entry.animeId)
    if (!m) continue
    rows.push({
      genres: m.genres,
      studios: m.studios,
      score: entry.score,
      status: entry.status,
      favorite: entry.favorite,
      rewatches: entry.rewatches,
      emotions: entry.emotions.length
    })
  }
  return rows
}

/**
 * Les titres à partir desquels demander des voisins.
 *
 * Une seule entrée par franchise : huit graines dont six saisons de la même
 * série ne ratissent qu'un sixième de ce qu'elles pourraient.
 */
function seedsOf(entries: Entry[], media: Map<number, Media>): number[] {
  const rank = (entry: Entry): number => (entry.favorite ? 100 : 0) + (entry.score ?? 0)

  const seen = new Set<string>()
  const picked: number[] = []

  for (const entry of [...entries]
    .filter((e) => e.status === 'completed' || e.status === 'watching')
    .sort((a, b) => rank(b) - rank(a) || b.updatedAt - a.updatedAt)) {
    const m = media.get(entry.animeId)
    if (!m) continue
    const family = compact(baseAndSeason(m.title.english ?? m.title.romaji).base)
    if (seen.has(family)) continue
    seen.add(family)
    picked.push(entry.animeId)
    if (picked.length === SEEDS) break
  }

  return picked
}

/** Rassemble les candidats de toutes les sources, sans doublon ni déjà-suivi. */
async function candidates(
  profile: TasteProfile,
  seeds: number[],
  owned: Set<number>,
  showAdult: boolean
): Promise<{ pool: Map<number, Media>; fromCommunity: Map<number, string[]> }> {
  const pool = new Map<number, Media>()
  const fromCommunity = new Map<number, string[]>()

  const take = (list: Media[]): void => {
    for (const media of list) {
      if (owned.has(media.id) || pool.has(media.id)) continue
      pool.set(media.id, media)
    }
  }

  if (seeds.length) {
    const votes = await recommended(seeds, [...owned], showAdult).catch(() => [])
    for (const vote of votes) {
      if (owned.has(vote.media.id)) continue
      fromCommunity.set(vote.media.id, vote.from)
      if (!pool.has(vote.media.id)) pool.set(vote.media.id, vote.media)
    }
  }

  // Les classements et la saison : de quoi ne pas dépendre d'une seule source.
  for (const kind of ['trending', 'popular', 'top', 'season'] as const) {
    const page = await browse({ kind, page: 1, perPage: 50 }, showAdult).catch(() => null)
    if (page) take(page.items)
  }

  // Puis les meilleurs titres des genres que le profil place en tête : c'est
  // la seule source qui suive vraiment le goût plutôt que la popularité.
  for (const facet of highlights(profile, 2)) {
    const page = await browse({ kind: 'top', page: 1, perPage: 50, genre: facet.name }, showAdult).catch(() => null)
    if (page) take(page.items)
  }

  return { pool, fromCommunity }
}

/**
 * Le profil et les recommandations qui en découlent.
 *
 * Ne jette pas sur une source muette : chaque appel réseau est rattrapé
 * séparément, et une source manquante coûte des candidats, pas la page.
 */
export async function forYou(): Promise<ForYou> {
  const data = snapshot()
  const showAdult = getPrefs().showAdult
  const media = new Map(data.media.map((m) => [m.id, m]))
  const owned = new Set(data.entries.map((e) => e.animeId))

  const profile = buildProfile(ratedRows(data.entries, media))
  const seeds = seedsOf(data.entries, media)
  const { pool, fromCommunity } = await candidates(profile, seeds, owned, showAdult)

  const picks: ForYouPick[] = []
  for (const candidate of pool.values()) {
    const { score, reasons } = scoreAgainst(profile, candidate, (name) => GENRE_LABELS[name] ?? name)
    const from = fromCommunity.get(candidate.id) ?? []

    picks.push({
      media: candidate,
      score: score + (from.length ? COMMUNITY_BONUS : 0),
      reasons,
      from
    })
  }

  picks.sort((a, b) => b.score - a.score)

  return {
    profile: {
      top: highlights(profile, 6),
      genres: profile.genres.slice(0, 12),
      studios: profile.studios.slice(0, 8),
      sample: profile.sample,
      scored: profile.scored
    },
    // En deçà du seuil, le classement repose sur trop peu de séries pour être
    // présenté comme un goût. La page le dit plutôt que de faire semblant.
    weak: profile.sample < MIN_SAMPLE,
    picks: picks.slice(0, KEEP)
  }
}
