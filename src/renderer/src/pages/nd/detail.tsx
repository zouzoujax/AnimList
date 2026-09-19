/**
 * La fiche d'un anime, dans le nouveau design.
 *
 * Même contrat que les expériences : la fiche calcule tout et passe l'en-tête
 * ses valeurs, le corps ses blocs déjà rendus. Seules la forme et l'ordre
 * changent ici — les épisodes passent en premier, parce que c'est ce qu'on
 * vient faire sur la fiche d'une série qu'on regarde, et un sommaire reste à
 * côté pendant qu'on descend.
 */

import { ArrowLeft, Check, FolderPlus, Heart, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { STATUS_LABELS, type LibraryStatus } from '@shared/types'
import type { DetailHeroProps, DetailPartKey, DetailParts } from '@/experiences'
import { EpisodeStrip, plural } from '@/components/nd'
import { Poster } from '@/components/ui'
import { rgba, toneAccent } from '@/lib/color'
import { airingLabel, titleOf } from '@/lib/format'
import { useApp } from '@/store/app'

const STATUSES: LibraryStatus[] = ['watching', 'planned', 'completed', 'paused', 'dropped']

export function NdDetailHero(props: DetailHeroProps): React.JSX.Element {
  const { media, entry, next, seen, total } = props
  const lang = useApp((s) => s.prefs.titleLang)
  const glow = toneAccent(media.cover.color)
  const upcoming = media.nextAiring

  // Où tu en es, en une phrase : c'est ce que l'en-tête doit dire avant tout.
  const where = !entry
    ? 'Pas encore dans ta bibliothèque.'
    : seen === 0
      ? `Pas encore commencée${total ? `, ${plural(total, 'épisode')} au total` : ''}.`
      : total && seen >= total
        ? `Tu as vu les ${total} épisodes.`
        : `Tu as vu ${plural(seen, 'épisode')}${total ? ` sur ${total}` : ''}.${
            next !== null
              ? ` Le suivant est l’épisode ${next}.`
              : upcoming
                ? ` L’épisode ${upcoming.episode} sort ${airingLabel(upcoming.airingAt).toLowerCase()}.`
                : ''
          }`

  return (
    <section className="on-art relative overflow-hidden" style={{ '--tone': glow } as React.CSSProperties}>
      {/* Le fond s'efface vers le bas sur un thème sombre (voir .nd-hero-bg). */}
      <div className="nd-hero-bg absolute inset-0" aria-hidden>
        <img
          src={media.banner ?? media.cover.xl}
          alt=""
          className="h-full w-full object-cover opacity-70"
          draggable={false}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, rgba(5,6,12,.4), rgba(5,6,12,.85)), linear-gradient(90deg, rgba(5,6,12,.8), transparent 70%, ${rgba(glow, 0.3)})`
          }}
        />
      </div>

      <div className="relative mx-auto max-w-[1400px] px-7 pb-8 pt-5">
        <button className="btn !h-8" onClick={props.onBack}>
          <ArrowLeft size={14} />
          Retour
        </button>

        <div className="mt-10 flex items-end gap-7">
          <Poster
            src={media.cover.xl}
            alt=""
            className="hidden h-[270px] w-[182px] shrink-0 sm:block"
            rounded="rounded-[16px]"
          />
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="title-xl clamp-3 max-w-[22ch] text-[2.7rem] leading-[1.02]">{titleOf(media, lang)}</h1>
            {props.alsoKnownAs.length > 0 && (
              <p className="mt-2 text-[0.9rem] text-muted">Aussi appelé {props.alsoKnownAs.slice(0, 2).join(' ou ')}</p>
            )}

            <p className="mt-4 max-w-[60ch] text-[0.95rem] leading-relaxed">{where}</p>
            {entry && (
              <div className="mt-3 max-w-[640px]">
                <EpisodeStrip media={media} next={next} size="lg" />
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              {!entry ? (
                <button className="btn btn-primary" onClick={props.onAdd}>
                  <Plus size={15} />
                  Ajouter à ma bibliothèque
                </button>
              ) : (
                next !== null && (
                  <button className="btn btn-primary" onClick={props.onMark}>
                    <Check size={15} />
                    Cocher l’épisode {next}
                  </button>
                )
              )}
              <button className="btn" onClick={props.onFavorite} aria-pressed={!!entry?.favorite}>
                <Heart size={14} fill={entry?.favorite ? 'currentColor' : 'none'} />
                {entry?.favorite ? 'Dans tes favoris' : 'Ajouter aux favoris'}
              </button>
              {entry && (
                <button className="btn" onClick={props.onLists}>
                  <FolderPlus size={14} />
                  {props.inLists > 0 ? `Dans ${plural(props.inLists, 'liste')}` : 'Ranger dans une liste'}
                </button>
              )}
            </div>

            {entry && (
              <div className="nd-seg mt-4" role="group" aria-label="Statut">
                {STATUSES.map((status) => (
                  <button key={status} aria-pressed={entry.status === status} onClick={() => props.onStatus(status)}>
                    {STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/** L'ordre de lecture : ce qu'on fait d'abord, ce qu'on lit ensuite, ce qu'on découvre à la fin. */
const MAIN: { key: DetailPartKey; label: string }[] = [
  { key: 'episodes', label: 'Épisodes' },
  { key: 'language', label: 'Langue' },
  { key: 'files', label: 'Fichiers' },
  { key: 'synopsis', label: 'Synopsis' },
  { key: 'trailer', label: 'Bande-annonce' },
  { key: 'cast', label: 'Personnages' },
  { key: 'franchise', label: 'Franchise' },
  { key: 'relations', label: 'Même série' },
  { key: 'films', label: 'Films' },
  { key: 'manga', label: 'Manga' },
  { key: 'recommendations', label: 'Recommandations' }
]
const SIDE: DetailPartKey[] = ['progress', 'rating', 'watch', 'info', 'error']

const shown = (node: React.ReactNode): boolean => node !== null && node !== undefined && node !== false

export function NdDetailBody({ parts }: { parts: DetailParts }): React.JSX.Element {
  const present = MAIN.filter((p) => shown(parts[p.key]))
  const [active, setActive] = useState<DetailPartKey | null>(present[0]?.key ?? null)
  const keys = present.map((p) => p.key).join(',')

  // Le sommaire suit la lecture : le bloc le plus haut encore visible est surligné.
  useEffect(() => {
    const root = document.getElementById('contenu')
    const nodes = keys
      .split(',')
      .map((key) => document.getElementById(`nd-part-${key}`))
      .filter((n): n is HTMLElement => !!n)
    if (!nodes.length) return
    const observer = new IntersectionObserver(
      (records) => {
        const top = records
          .filter((r) => r.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActive(top.target.id.replace('nd-part-', '') as DetailPartKey)
      },
      { root, rootMargin: '0px 0px -60% 0px' }
    )
    nodes.forEach((n) => observer.observe(n))
    return () => observer.disconnect()
  }, [keys])

  return (
    <div className="nd-detail mx-auto mt-8 max-w-[1400px] px-7">
      <nav className="nd-toc" aria-label="Sommaire de la fiche">
        {present.map((p) => (
          <button
            key={p.key}
            aria-current={active === p.key ? 'true' : undefined}
            onClick={() =>
              document.getElementById(`nd-part-${p.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          >
            {p.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0">
        {present.map((p) => (
          <div key={p.key} id={`nd-part-${p.key}`} className="nd-part">
            {parts[p.key]}
          </div>
        ))}
      </div>
      <aside className="flex flex-col gap-4">
        {SIDE.filter((k) => shown(parts[k])).map((k) => (
          <div key={k}>{parts[k]}</div>
        ))}
      </aside>
    </div>
  )
}
