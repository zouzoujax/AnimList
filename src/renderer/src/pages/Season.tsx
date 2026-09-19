import { Check, Clock, Eye, RotateCcw, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { GENRE_LABELS, type Media } from '@shared/types'
import { EmptyState, ErrorBox, Poster, Spinner } from '@/components/ui'
import { currentSeasonOf, formatLabel, seasonLabel, titleOf } from '@/lib/format'
import { useBrowse } from '@/lib/hooks'
import { useApp } from '@/store/app'

type Group = 'sort' | 'watching' | 'planned' | 'skipped'

const GROUPS: { id: Group; title: string; hint: string }[] = [
  { id: 'sort', title: 'À trier', hint: 'Ni suivies, ni prévues, ni écartées.' },
  { id: 'watching', title: 'Tu suis', hint: 'En cours, en pause ou déjà terminées.' },
  { id: 'planned', title: 'Prévues', hint: 'Dans ta liste « À voir ».' },
  { id: 'skipped', title: 'Écartées', hint: 'Abandonnées ou « pas pour moi ».' }
]

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`
}

/**
 * Le tri de début de saison.
 *
 * « Cette saison », dans Découvrir, montre ce qui passe ; elle ne dit pas ce
 * qu'on en a décidé. Ici chaque série de la saison tombe dans une case — à
 * trier, suivie, prévue, écartée — et se range d'un clic. « Pas pour moi »
 * n'ajoute rien à la bibliothèque : l'écart est gardé à part, dans les
 * réglages, pour ne pas remplir la liste de séries qu'on n'a jamais voulues.
 */
export default function SeasonPage(): React.JSX.Element {
  const entries = useApp((s) => s.entries)
  const watched = useApp((s) => s.watched)
  const lang = useApp((s) => s.prefs.titleLang)
  const skippedIds = useApp((s) => s.prefs.seasonSkipped)
  const setPrefs = useApp((s) => s.setPrefs)
  const saveEntry = useApp((s) => s.saveEntry)
  const navigate = useApp((s) => s.navigate)

  const { season, year } = currentSeasonOf()
  const { items, loading, loadingMore, error, hasMore, loadMore, retry } = useBrowse({ kind: 'season', perPage: 50 })
  const [group, setGroup] = useState<Group>('sort')

  // Toute la saison, pas seulement la première page : trier la moitié d'une
  // saison n'a pas de sens. Deux ou trois requêtes au plus.
  useEffect(() => {
    if (hasMore && !loading && !loadingMore) loadMore()
  }, [hasMore, loading, loadingMore, loadMore])

  const skipped = useMemo(() => new Set(skippedIds), [skippedIds])

  const grouped = useMemo(() => {
    const out: Record<Group, Media[]> = { sort: [], watching: [], planned: [], skipped: [] }
    const seen = new Set<number>()
    for (const media of items) {
      if (seen.has(media.id)) continue
      seen.add(media.id)
      const status = entries.get(media.id)?.status
      if (status === 'dropped' || (!status && skipped.has(media.id))) out.skipped.push(media)
      else if (status === 'planned') out.planned.push(media)
      else if (status) out.watching.push(media)
      else out.sort.push(media)
    }
    return out
  }, [items, entries, skipped])

  const skip = (id: number, on: boolean): void => {
    const next = on ? [...skippedIds.filter((x) => x !== id), id] : skippedIds.filter((x) => x !== id)
    void setPrefs({ seasonSkipped: next })
  }

  const shown = grouped[group]
  const total = grouped.sort.length + grouped.watching.length + grouped.planned.length + grouped.skipped.length

  return (
    <div className="mx-auto max-w-[1180px] px-7 py-7">
      <h1 className="title-xl mb-1 text-[1.85rem]">{seasonLabel(season, year)}</h1>
      <p className="mb-6 text-[0.88rem] text-muted">
        {loading && !items.length
          ? 'Les séries de la saison arrivent…'
          : `${plural(total, 'série', 'séries')} cette saison. Tu en suis ${grouped.watching.length}, ${plural(grouped.planned.length, 'est prévue', 'sont prévues')}, ${plural(grouped.sort.length, 'reste', 'restent')} à trier.`}
      </p>

      <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Groupes">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            role="tab"
            aria-selected={group === g.id}
            data-on={group === g.id}
            className="chip"
            onClick={() => setGroup(g.id)}
            title={g.hint}
          >
            {g.title}
            <span className="ml-1.5 tabular-nums text-faint">{grouped[g.id].length}</span>
          </button>
        ))}
      </div>

      {error && !items.length ? (
        <ErrorBox message={error} onRetry={retry} />
      ) : loading && !items.length ? (
        <Spinner label="Chargement de la saison…" />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={22} />}
          title={group === 'sort' ? 'Tout est trié' : 'Rien ici'}
          hint={
            group === 'sort'
              ? 'Chaque série de la saison a sa place. Les nouvelles apparaîtront ici.'
              : GROUPS.find((g) => g.id === group)?.hint
          }
        />
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
          {shown.map((media) => {
            const entry = entries.get(media.id)
            const seen = watched.get(media.id)?.size ?? 0
            const aired = media.nextAiring ? media.nextAiring.episode - 1 : media.episodes
            const genres = media.genres
              .slice(0, 2)
              .map((g) => GENRE_LABELS[g] ?? g)
              .join(' · ')
            return (
              <li key={media.id} className="glass flex gap-3 rounded-2xl p-2.5">
                <button
                  className="shrink-0"
                  onClick={() => navigate({ name: 'anime', id: media.id })}
                  aria-label={`Ouvrir ${titleOf(media, lang)}`}
                >
                  <Poster src={media.cover.large} alt="" className="h-[108px] w-[74px]" rounded="rounded-xl" />
                </button>
                <div className="flex min-w-0 flex-1 flex-col">
                  <button
                    className="line-clamp-2 text-left text-[0.86rem] font-semibold leading-snug hover:underline"
                    onClick={() => navigate({ name: 'anime', id: media.id })}
                  >
                    {titleOf(media, lang)}
                  </button>
                  <p className="mt-0.5 truncate text-[0.72rem] text-faint">
                    {[formatLabel(media.format), genres].filter(Boolean).join(' · ')}
                  </p>
                  <p className="mt-0.5 text-[0.72rem] text-faint">
                    {entry
                      ? `${seen} vu${seen > 1 ? 's' : ''}${aired ? ` sur ${aired} sorti${aired > 1 ? 's' : ''}` : ''}`
                      : aired
                        ? `${plural(aired, 'épisode sorti', 'épisodes sortis')}`
                        : 'Pas encore commencée'}
                  </p>

                  <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                    {group === 'sort' && (
                      <>
                        <button
                          className="btn !h-7 !px-2.5 text-[0.74rem]"
                          onClick={() => void saveEntry(media.id, { status: 'watching' }, media)}
                        >
                          <Eye size={13} />
                          Je regarde
                        </button>
                        <button
                          className="btn !h-7 !px-2.5 text-[0.74rem]"
                          onClick={() => void saveEntry(media.id, { status: 'planned' }, media)}
                        >
                          <Clock size={13} />
                          Plus tard
                        </button>
                        <button
                          className="icon-btn !h-7 !w-7"
                          onClick={() => skip(media.id, true)}
                          aria-label="Pas pour moi"
                          title="Pas pour moi"
                        >
                          <X size={14} />
                        </button>
                      </>
                    )}
                    {group === 'planned' && (
                      <button
                        className="btn !h-7 !px-2.5 text-[0.74rem]"
                        onClick={() => void saveEntry(media.id, { status: 'watching' })}
                      >
                        <Eye size={13} />
                        Je commence
                      </button>
                    )}
                    {group === 'watching' && entry && (
                      <span className="flex items-center gap-1 text-[0.72rem] text-muted">
                        <Check size={13} />
                        Dans ta bibliothèque
                      </span>
                    )}
                    {group === 'skipped' && !entry && (
                      <button className="btn !h-7 !px-2.5 text-[0.74rem]" onClick={() => skip(media.id, false)}>
                        <RotateCcw size={13} />
                        Remettre à trier
                      </button>
                    )}
                    {group === 'skipped' && entry && (
                      <span className="text-[0.72rem] text-faint">Abandonnée : à changer depuis sa fiche.</span>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {loadingMore && <Spinner label="La suite de la saison…" />}
    </div>
  )
}
