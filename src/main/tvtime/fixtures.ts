/** Builders shared by the importer tests. Not used by the application. */

import type { Media } from '@shared/types'
import type { ImportCandidate, SequelRef } from './chain'

export function media(over: Partial<Media> & { id: number }): Media {
  return {
    idMal: null,
    title: { romaji: `#${over.id}`, english: null, native: null },
    cover: { large: '', xl: '', color: null },
    banner: null,
    format: 'TV',
    status: 'FINISHED',
    episodes: 12,
    duration: 24,
    season: null,
    seasonYear: null,
    startDate: null,
    genres: [],
    studios: [],
    averageScore: null,
    popularity: 0,
    description: null,
    nextAiring: null,
    trailer: null,
    cachedAt: 0,
    ...over
  }
}

export function candidate(
  over: Partial<Media> & { id: number },
  extra: { synonyms?: string[]; sequels?: SequelRef[] } = {}
): ImportCandidate {
  return {
    media: media(over),
    synonyms: extra.synonyms ?? [],
    sequels: extra.sequels ?? []
  }
}

/** A `fetchById` backed by a fixed set of candidates. */
export function library(candidates: ImportCandidate[]): (id: number) => Promise<ImportCandidate | null> {
  const byId = new Map(candidates.map((c) => [c.media.id, c]))
  return (id: number) => Promise.resolve(byId.get(id) ?? null)
}
