/**
 * Les autres rôles d'un personnage ou d'un doubleur.
 *
 * La fiche d'une série liste ses personnages et leurs voix depuis toujours,
 * sans que rien ne soit cliquable — alors que « où l'ai-je déjà entendu ? » est
 * l'une des questions qu'on se pose le plus souvent devant un anime.
 *
 * Ce qui est déjà dans la bibliothèque est signalé : c'est justement la
 * réponse qu'on cherchait.
 */

import { useEffect, useState } from 'react'
import { ArrowLeft, Mic, User } from 'lucide-react'
import type { PersonWorks } from '@shared/types'
import { AnimeCard } from '@/components/AnimeCard'
import { ErrorBox, Poster, PosterSkeletons } from '@/components/ui'
import { useApp } from '@/store/app'

export default function PersonPage({ kind, id }: { kind: 'character' | 'staff'; id: number }): React.JSX.Element {
  const back = useApp((s) => s.back)
  const entries = useApp((s) => s.entries)
  const [person, setPerson] = useState<PersonWorks | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    void window.api.anime
      .person(kind, id)
      .then((res) => alive && setPerson(res))
      .catch(() => alive && setPerson(null))
    return () => {
      alive = false
    }
  }, [kind, id])

  if (person === undefined) {
    return (
      <div className="page">
        <PosterSkeletons count={12} />
      </div>
    )
  }

  if (person === null) {
    return (
      <div className="page">
        <ErrorBox message="Cette fiche est introuvable sur AniList." onRetry={back} />
      </div>
    )
  }

  const owned = person.roles.filter((row) => entries.has(row.media.id)).length

  return (
    <div className="page">
      <button className="btn mb-5 !h-8" onClick={back}>
        <ArrowLeft size={14} />
        Retour
      </button>

      <div className="mb-7 flex items-center gap-4">
        {person.image ? (
          <Poster src={person.image} alt="" className="h-[110px] w-[80px] shrink-0" rounded="rounded-[14px]" />
        ) : (
          <div className="grid h-[110px] w-[80px] shrink-0 place-items-center rounded-[14px] bg-white/5">
            {kind === 'staff' ? <Mic size={22} className="text-faint" /> : <User size={22} className="text-faint" />}
          </div>
        )}
        <div className="min-w-0">
          <p className="label mb-1">{kind === 'staff' ? 'Doubleur' : 'Personnage'}</p>
          <h1 className="title-xl text-[1.85rem] leading-tight">{person.name}</h1>
          <p className="mt-1 text-[0.82rem] text-muted">
            {person.roles.length} série{person.roles.length > 1 ? 's' : ''}
            {owned > 0 && ` · ${owned} dans ta bibliothèque`}
          </p>
        </div>
      </div>

      {person.roles.length === 0 ? (
        <p className="py-16 text-center text-sm text-faint">AniList ne lui connaît aucune autre série.</p>
      ) : (
        <div className="card-grid">
          {person.roles.map((row, i) => (
            <div key={row.media.id}>
              <AnimeCard media={row.media} width="100%" index={i % 24} />
              {row.role && (
                <p
                  className="clamp-2 mt-1 px-0.5 text-[0.68rem] font-semibold"
                  style={{ color: entries.has(row.media.id) ? 'var(--accent-2)' : 'var(--color-faint)' }}
                >
                  {row.role}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
