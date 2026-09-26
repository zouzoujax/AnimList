/**
 * La fiche d'un manga, telle qu'elle s'ouvre dans une fenêtre.
 *
 * Partagée entre le catalogue et la fiche d'un anime : arriver par la série
 * qu'on regarde ou par la liste des tendances mène au même endroit, sans qu'un
 * des deux chemins finisse par dériver de l'autre.
 */

import { BookOpen, ExternalLink } from 'lucide-react'
import type { Manga } from '@shared/types'
import { ORIGIN_HINTS, ORIGIN_LABELS } from '@shared/origin'
import { Poster } from '@/components/ui'
import { rgba, toneAccent } from '@/lib/color'

export const MANGA_STATUS: Record<string, string> = {
  FINISHED: 'Terminé',
  RELEASING: 'En cours',
  NOT_YET_RELEASED: 'À paraître',
  CANCELLED: 'Annulé',
  HIATUS: 'En pause'
}

export function MangaSheet({ manga, onClose }: { manga: Manga; onClose: () => void }): React.JSX.Element {
  const glow = toneAccent(manga.cover.color)
  return (
    <>
      <div className="flex gap-4 border-b p-5" style={{ borderColor: 'var(--line)' }}>
        <Poster src={manga.cover.xl} alt="" className="h-[168px] w-[116px] shrink-0" rounded="rounded-[14px]" />
        <div className="min-w-0 flex-1">
          {/* L'origine avant le statut : c'est elle qui dit ce qu'on s'apprête
              à lire — un manhwa se lit en couleur et se défile, un manga se
              tourne de droite à gauche. */}
          <p className="label" style={{ color: rgba(glow, 1) }} title={ORIGIN_HINTS[manga.origin]}>
            {ORIGIN_LABELS[manga.origin]}
            {manga.status && MANGA_STATUS[manga.status] ? ` · ${MANGA_STATUS[manga.status]}` : ''}
          </p>
          <h2 className="title-xl mt-1 text-[1.3rem] leading-tight">{manga.title.english ?? manga.title.romaji}</h2>
          {manga.title.native && <p className="mt-0.5 text-[0.78rem] text-faint">{manga.title.native}</p>}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.76rem] text-muted">
            {manga.averageScore !== null && (
              <span className="font-semibold" style={{ color: rgba(glow, 1) }}>
                {manga.averageScore}%
              </span>
            )}
            {manga.chapters && <span>{manga.chapters} chapitres</span>}
            {manga.volumes && <span>{manga.volumes} tomes</span>}
            {manga.startYear && <span>{manga.startYear}</span>}
          </div>

          {manga.staff.length > 0 && <p className="mt-1.5 text-[0.76rem] text-faint">{manga.staff.join(' · ')}</p>}
        </div>
      </div>

      <div className="max-h-[36vh] overflow-y-auto px-5 py-4">
        {manga.genres.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {manga.genres.map((genre) => (
              <span key={genre} className="chip !h-6 !cursor-default !text-[0.65rem]">
                {genre}
              </span>
            ))}
          </div>
        )}
        <p className="whitespace-pre-line text-[0.83rem] leading-relaxed text-muted">
          {manga.description ?? 'Aucun résumé sur AniList.'}
        </p>
      </div>

      <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--line)' }}>
        <button className="btn" onClick={onClose}>
          Fermer
        </button>
        <button className="btn btn-primary" onClick={() => void window.api.app.openExternal(manga.siteUrl)}>
          <BookOpen size={14} />
          Voir sur AniList
          <ExternalLink size={13} />
        </button>
      </div>
    </>
  )
}
