import { Check, Clock, Eye, RotateCcw, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { GENRE_LABELS, type Media } from '@shared/types'
import { NdHeader, NdTabs, SeriesRow, behindOf, plural } from '@/components/nd'
import { ErrorBox, Poster, PosterSkeletons, Spinner } from '@/components/ui'
import { toneAccent } from '@/lib/color'
import { currentSeasonOf, formatLabel, seasonLabel, titleOf } from '@/lib/format'
import { useBrowse } from '@/lib/hooks'
import { useApp } from '@/store/app'

type Group = 'sort' | 'watching' | 'planned' | 'skipped'

const GROUPS: { id: Group; label: string }[] = [
  { id: 'sort', label: 'À trier' },
  { id: 'watching', label: 'Tu suis' },
  { id: 'planned', label: 'Prévues' },
  { id: 'skipped', label: 'Écartées' }
]

/** Ce que chaque groupe est, dit en une phrase sous les onglets. */
const LINES: Record<Group, string> = {
  sort: 'Ni suivies, ni prévues, ni écartées : celles sur lesquelles tu ne t’es pas encore prononcé.',
  watching: 'Les séries de la saison déjà dans ta bibliothèque, et où tu en es.',
  planned: 'Mises de côté pour plus tard. Elles t’attendent dans « À voir ».',
  skipped: 'Abandonnées, ou écartées d’un « pas pour moi ». Rien n’a été ajouté à ta bibliothèque.'
}

/**
 * Une série à trancher : l'affiche, ce qu'elle est, et les trois gestes.
 *
 * Une carte et non une ligne : trier, c'est choisir, et on choisit sur une
 * jaquette. Les lignes sont pour la progression — l'onglet « Tu suis » les
 * reprend, puisque là on ne choisit plus, on regarde où on en est.
 */
function SortCard({
  media,
  actions,
  onSkip
}: {
  media: Media
  actions: React.ReactNode
  /** Présent : un « pas pour moi » discret au coin de la carte. */
  onSkip?: () => void
}): React.JSX.Element {
  const lang = useApp((s) => s.prefs.titleLang)
  const navigate = useApp((s) => s.navigate)
  const aired = media.nextAiring ? media.nextAiring.episode - 1 : (media.episodes ?? 0)
  const genres = media.genres
    .slice(0, 2)
    .map((g) => GENRE_LABELS[g] ?? g)
    .join(' · ')

  return (
    <li className="nd-sort-card" style={{ '--tone': toneAccent(media.cover.color) } as React.CSSProperties}>
      <button
        className="shrink-0"
        onClick={() => navigate({ name: 'anime', id: media.id })}
        aria-label={`Ouvrir ${titleOf(media, lang)}`}
      >
        <Poster src={media.cover.large} alt="" className="h-[124px] w-[86px]" rounded="rounded-[11px]" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <button
          className="clamp-2 pr-7 text-left text-[0.92rem] font-semibold leading-snug hover:underline"
          onClick={() => navigate({ name: 'anime', id: media.id })}
        >
          {titleOf(media, lang)}
        </button>
        <p className="mt-1 text-[0.76rem] text-muted">
          {[formatLabel(media.format), genres].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-0.5 text-[0.76rem] text-faint">
          {aired > 0 ? `${plural(aired, 'épisode sorti', 'épisodes sortis')}` : 'Pas encore commencée'}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2.5">{actions}</div>
      </div>
      {/* Au coin plutôt qu'en bout de file : écarter n'est pas un choix de
          même rang que « je regarde », et à côté des deux autres il passait à
          la ligne tout seul. */}
      {onSkip && (
        <button className="nd-sort-skip" onClick={onSkip} aria-label="Pas pour moi" title="Pas pour moi">
          <X size={14} />
        </button>
      )}
    </li>
  )
}

/**
 * Le tri de début de saison, dans le nouveau design.
 *
 * La page répond à une seule question, répétée quarante fois : celle-là,
 * j'en fais quoi ? Le titre le dit en toutes lettres — combien restent à
 * trancher — et chaque groupe s'annonce par une phrase plutôt que par une
 * étiquette. « Pas pour moi » n'ajoute toujours rien à la bibliothèque :
 * l'écart est gardé dans les réglages.
 */
export default function NdSeasonPage(): React.JSX.Element {
  const entries = useApp((s) => s.entries)
  const watched = useApp((s) => s.watched)
  const skippedIds = useApp((s) => s.prefs.seasonSkipped)
  const setPrefs = useApp((s) => s.setPrefs)
  const saveEntry = useApp((s) => s.saveEntry)

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
  const total = GROUPS.reduce((n, g) => n + grouped[g.id].length, 0)

  const sub =
    loading && !items.length
      ? 'Les séries de la saison arrivent…'
      : grouped.sort.length === 0
        ? `Tout est tranché : ${plural(grouped.watching.length, 'série suivie', 'séries suivies')}, ${plural(grouped.planned.length, 'prévue', 'prévues')}, ${plural(grouped.skipped.length, 'écartée', 'écartées')} sur ${total}.`
        : `${plural(total, 'série')} cette saison, ${plural(grouped.sort.length, 'reste', 'restent')} à trier. Tu en suis ${grouped.watching.length}.`

  return (
    <div className="page">
      <NdHeader title={seasonLabel(season, year)} sub={sub} />

      <NdTabs
        label="Groupes"
        tabs={GROUPS.map((g) => ({ ...g, count: grouped[g.id].length }))}
        value={group}
        onChange={setGroup}
      />
      <p className="mb-6 mt-1.5 max-w-[70ch] px-1 text-[0.8rem] text-muted">{LINES[group]}</p>

      {error && !items.length ? (
        <ErrorBox message={error} onRetry={retry} />
      ) : loading && !items.length ? (
        <PosterSkeletons count={12} />
      ) : shown.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          {group === 'sort'
            ? 'Chaque série de la saison a sa place. Les nouvelles apparaîtront ici.'
            : 'Aucune série dans ce groupe pour l’instant.'}
        </p>
      ) : group === 'watching' ? (
        // Là, on ne choisit plus : on regarde où on en est.
        <ul className="home-queue">
          {shown.map((media) => (
            <SeriesRow key={media.id} media={media} behind={behindOf(media, watched.get(media.id))} />
          ))}
        </ul>
      ) : (
        <ul className="nd-sort-grid">
          {shown.map((media) => (
            <SortCard
              key={media.id}
              media={media}
              onSkip={group === 'sort' ? () => skip(media.id, true) : undefined}
              actions={
                group === 'sort' ? (
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
                  </>
                ) : group === 'planned' ? (
                  <button
                    className="btn !h-7 !px-2.5 text-[0.74rem]"
                    onClick={() => void saveEntry(media.id, { status: 'watching' })}
                  >
                    <Eye size={13} />
                    Je commence
                  </button>
                ) : entries.has(media.id) ? (
                  <span className="flex items-center gap-1.5 text-[0.74rem] text-faint">
                    <Check size={13} />
                    Abandonnée : à reprendre depuis sa fiche.
                  </span>
                ) : (
                  <button className="btn !h-7 !px-2.5 text-[0.74rem]" onClick={() => skip(media.id, false)}>
                    <RotateCcw size={13} />
                    Remettre à trier
                  </button>
                )
              }
            />
          ))}
        </ul>
      )}

      {loadingMore && <Spinner label="La suite de la saison…" />}
    </div>
  )
}
