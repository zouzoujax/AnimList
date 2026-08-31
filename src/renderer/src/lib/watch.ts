import type { Media, MediaDetail } from '@shared/types'
import { baseAndSeason, compact, searchVariants, siteSlug } from '@shared/titles'
import { overrideFor } from '@shared/watch-overrides'
import { premiereLabel } from '@/lib/format'

/**
 * `direct`      the URL was verified, hand-checked, or supplied by AniList.
 * `guess`       built from the title and impossible to verify.
 * `search`      opens the site's search, pre-filled.
 * `absent`      the title is known not to be on that site.
 * `unreleased`  the anime hasn't aired yet, so no site can be streaming it.
 */
export type WatchKind = 'direct' | 'guess' | 'search' | 'absent' | 'unreleased'

export interface WatchLink {
  id: 'crunchyroll' | 'anime-sama' | 'franime' | 'adn'
  label: string
  url: string
  kind: WatchKind
  hint: string
  color: string
  /**
   * Ce que le site ne sait pas faire à notre place.
   *
   * Anime-Sama n'a pas d'adresse par épisode : le lecteur retient le numéro
   * dans le stockage local du navigateur, et `?episode=5` renvoie la page
   * saison mot pour mot. Vérifié — les formes en chemin répondent 404, les
   * formes en paramètre servent des octets identiques à la page nue. Faute de
   * pouvoir viser l'épisode, on dit lequel choisir une fois sur place.
   */
  pick: string | null
}

export interface AnimeSamaTarget {
  url: string
  direct: boolean
  absent?: boolean
  /** L'adresse porte un menu d'épisodes : seule celle-là peut être positionnée. */
  episodes?: boolean
}

export const WATCH_BADGE: Record<WatchKind, { label: string; color: string }> = {
  direct: { label: 'direct', color: 'var(--accent-2)' },
  guess: { label: 'déduit', color: '#ffb038' },
  search: { label: 'recherche', color: 'var(--color-faint)' },
  absent: { label: 'absent', color: '#6b7392' },
  unreleased: { label: 'pas sorti', color: '#6b7392' }
}

/** Rows that must not be clickable: there is nothing to open. */
export function isWatchDisabled(kind: WatchKind): boolean {
  return kind === 'absent' || kind === 'unreleased'
}

/** Search terms these sites actually index: western title first, punctuation dropped. */
export function searchTerm(media: Media): string {
  const title = media.title.english ?? media.title.romaji
  return searchVariants(baseAndSeason(title).base)[0] ?? title
}

/** Both titles, so a lookup can retry when the western one draws a blank. */
export function searchTitles(media: Media): string[] {
  return [media.title.english, media.title.romaji].filter((t): t is string => !!t)
}

/**
 * AniList still stores legacy Crunchyroll URLs (`http://`, no locale segment).
 * Upgrading them keeps the browser on the French catalogue instead of bouncing
 * through a redirect to the US one.
 */
function toFrenchCrunchyroll(url: string): string {
  return url
    .replace(/^http:/, 'https:')
    .replace(/^https:\/\/(?:www\.)?crunchyroll\.com\/(?![a-z]{2}\/)/, 'https://www.crunchyroll.com/fr/')
}

const CRUNCHYROLL_SEARCH = 'https://www.crunchyroll.com/fr/search?q='
const ANIME_SAMA_SEARCH = 'https://anime-sama.to/catalogue/?search='
// Cloudflare answers 403 to every automated request on these two, so neither the
// slug nor the search parameter could be confirmed against the live sites. They
// are the only places to change if either ever drifts.
const FRANIME_SERIES = 'https://franime.fr/anime/'
const ADN_SEARCH = 'https://animationdigitalnetwork.com/video?search='

/**
 * FrAnime files every season under one franchise page, and AniList season names
 * are not always numeric — DxD's seasons 2–4 are "NEW", "BorN" and "HERO", which
 * no season-stripping rule can catch. So the shortest already-known title that
 * prefixes this one wins: "High School DxD NEW" reduces to "High School DxD".
 */
function franchiseTitle(media: Media, known: Media[]): string {
  const base = baseAndSeason(media.title.english ?? media.title.romaji).base
  const needle = compact(base)
  let best = base

  for (const other of known) {
    if (other.id === media.id) continue
    const candidate = baseAndSeason(other.title.english ?? other.title.romaji).base
    if (candidate.length >= best.length) continue
    const flat = compact(candidate)
    if (flat.length >= 5 && needle.startsWith(flat)) best = candidate
  }
  return best
}

export function watchLinks(
  media: Media,
  detail: MediaDetail | null,
  animeSama?: AnimeSamaTarget | null,
  known: Media[] = [],
  /** L'épisode où on en est, pour les sites qui ne savent pas y mener. */
  episode?: number | null
): WatchLink[] {
  const term = searchTerm(media)
  const q = encodeURIComponent(term)
  const official = detail?.links ?? []
  const crunchyroll = official.find((l) => /crunchyroll/i.test(l.site))
  const override = overrideFor(media.id)

  // Nothing is streaming an anime that hasn't aired: every row is dead.
  if (media.status === 'NOT_YET_RELEASED') {
    const hint = `Pas encore sorti — prévu ${premiereLabel(media.startDate)}`
    return (
      [
        { id: 'crunchyroll', label: 'Crunchyroll', color: '#f47521' },
        { id: 'anime-sama', label: 'Anime-Sama', color: '#8b5cf6' },
        { id: 'franime', label: 'FrAnime', color: '#34d399' },
        { id: 'adn', label: 'ADN', color: '#00b0f0' }
      ] as const
    ).map((row) => ({ ...row, url: '', kind: 'unreleased' as const, hint, pick: null }))
  }

  const franimeFixed = override && 'franime' in override ? override.franime : undefined
  const franime: Pick<WatchLink, 'url' | 'kind' | 'hint'> =
    franimeFixed === null
      ? { url: '', kind: 'absent', hint: 'Absent du catalogue FrAnime' }
      : franimeFixed
        ? { url: franimeFixed, kind: 'direct', hint: 'URL vérifiée à la main' }
        : {
            url: FRANIME_SERIES + siteSlug(franchiseTitle(media, known)),
            kind: 'guess',
            hint: 'URL déduite du titre — le site bloque toute vérification automatique'
          }

  // Le site n'a pas d'adresse par épisode : c'est l'app qui pose le numéro dans
  // sa propre fenêtre avant que leur page ne le lise. Voir src/main/watch-window.ts.
  const pick = episode ? `Ouvre l'épisode ${episode}` : null

  return [
    {
      id: 'crunchyroll',
      label: 'Crunchyroll',
      url: crunchyroll ? toFrenchCrunchyroll(crunchyroll.url) : CRUNCHYROLL_SEARCH + q,
      kind: crunchyroll ? 'direct' : 'search',
      hint: crunchyroll ? 'Lien officiel fourni par AniList' : 'AniList ne connaît pas de lien : recherche',
      color: '#f47521',
      pick: null
    },
    {
      id: 'anime-sama',
      label: 'Anime-Sama',
      url: animeSama?.absent ? '' : (animeSama?.url ?? ANIME_SAMA_SEARCH + q),
      kind: animeSama?.absent ? 'absent' : animeSama?.direct ? 'direct' : 'search',
      hint: animeSama?.absent
        ? 'Absent du catalogue Anime-Sama'
        : animeSama?.direct
          ? 'URL vérifiée dans le catalogue du site'
          : 'Titre introuvable dans le catalogue : recherche',
      color: '#8b5cf6',
      pick: animeSama?.episodes ? pick : null
    },
    { id: 'franime', label: 'FrAnime', color: '#34d399', pick: null, ...franime },
    {
      id: 'adn',
      label: 'ADN',
      url: ADN_SEARCH + q,
      kind: 'search',
      hint: 'Recherche — paramètre non vérifiable, le site bloque les requêtes',
      color: '#00b0f0',
      pick: null
    }
  ]
}

/** AniList platforms minus the ones that already have their own row. */
export function otherPlatforms(detail: MediaDetail | null): { site: string; url: string }[] {
  return (detail?.links ?? []).filter((l) => !/crunchyroll|animation digital|anime-sama|franime/i.test(l.site))
}
