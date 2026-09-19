import { useEffect, useState } from 'react'
import { Mic, User } from 'lucide-react'
import type { PersonWorks } from '@shared/types'
import { AnimeCard } from '@/components/AnimeCard'
import { FollowButton } from '@/components/FollowButton'
import { NdHeader, SeriesRow, plural } from '@/components/nd'
import { ErrorBox, Poster, PosterSkeletons } from '@/components/ui'
import { useApp } from '@/store/app'

/**
 * Un personnage ou un doubleur, dans le nouveau design.
 *
 * On arrive ici en se demandant « où l'ai-je déjà entendu ? » : la réponse,
 * les séries de ta bibliothèque, vient en premier, avec le rôle tenu écrit en
 * toutes lettres. Le reste suit en affiches.
 */
export default function NdPersonPage({ kind, id }: { kind: 'character' | 'staff'; id: number }): React.JSX.Element {
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

  const owned = person.roles.filter((row) => entries.has(row.media.id))
  const others = person.roles.filter((row) => !entries.has(row.media.id))
  const who = kind === 'staff' ? 'Doubleur' : 'Personnage'

  return (
    <div className="page">
      <div className="flex items-end gap-5">
        {person.image ? (
          <Poster src={person.image} alt="" className="mb-6 h-[132px] w-[96px] shrink-0" rounded="rounded-[14px]" />
        ) : (
          <div className="mb-6 grid h-[132px] w-[96px] shrink-0 place-items-center rounded-[14px] bg-[var(--panel)]">
            {kind === 'staff' ? <Mic size={24} className="text-faint" /> : <User size={24} className="text-faint" />}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <NdHeader
            back={back}
            title={person.name}
            sub={
              owned.length > 0
                ? `${who}, dans ${plural(owned.length, 'série')} de ta bibliothèque et ${plural(others.length, 'autre')}.`
                : `${who}, dans ${plural(person.roles.length, 'série')}. Aucune n’est dans ta bibliothèque.`
            }
            // Seulement pour une personne : un personnage ne sort rien de neuf.
            actions={kind === 'staff' ? <FollowButton kind="staff" target={id} name={person.name} /> : undefined}
          />
        </div>
      </div>

      {person.roles.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">AniList ne lui connaît aucune autre série.</p>
      ) : (
        <>
          {owned.length > 0 && (
            <section className="mb-10">
              <h2 className="title-xl mb-3.5 px-1 text-[1.32rem]">Là où tu l’as déjà croisé</h2>
              <ul className="home-queue">
                {owned.map((row) => (
                  <SeriesRow
                    key={row.media.id}
                    media={row.media}
                    note={row.role ? <span>{row.role}</span> : undefined}
                  />
                ))}
              </ul>
            </section>
          )}
          {others.length > 0 && (
            <section>
              {owned.length > 0 && <h2 className="title-xl mb-3.5 px-1 text-[1.32rem]">Ses autres séries</h2>}
              <div className="card-grid">
                {others.map((row, i) => (
                  <div key={row.media.id}>
                    <AnimeCard media={row.media} width="100%" index={i % 24} />
                    {row.role && <p className="clamp-2 mt-1 px-0.5 text-[0.74rem] text-muted">{row.role}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
