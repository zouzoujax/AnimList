import { ScanSearch, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  GENRES,
  GENRE_LABELS,
  FORMAT_LABELS,
  type BrowseKind,
  type BrowseQuery,
  type ForYou,
  type ForYouPick,
  type Media,
  type MediaFormat
} from '@shared/types'
import { AnimeCard } from '@/components/AnimeCard'
import IdentifyImage from '@/components/IdentifyImage'
import { NdTabs, plural } from '@/components/nd'
import { ErrorBox, Modal, Poster, PosterSkeletons, RowScroller, Spinner } from '@/components/ui'
import { toneAccent } from '@/lib/color'
import { monthBucket, premiereLabel, premiereOf, premiereSort, titleOf } from '@/lib/format'
import { useBrowse, useDebounced, useInView } from '@/lib/hooks'
import { StaleNote } from '@/components/StaleNote'
import { useApp } from '@/store/app'

const TABS: { id: BrowseKind; label: string }[] = [
  { id: 'trending', label: 'Tendances' },
  { id: 'season', label: 'Cette saison' },
  { id: 'popular', label: 'Populaires' },
  { id: 'top', label: 'Mieux notés' },
  { id: 'upcoming', label: 'À venir' }
]

const TAB_LINES: Record<string, string> = {
  trending: 'Ce que tout le monde regarde cette semaine.',
  season: 'Les séries qui passent en ce moment.',
  popular: 'Les séries les plus suivies sur AniList, toutes années confondues.',
  top: 'Les mieux notées par la communauté.',
  upcoming: 'Les sorties annoncées, de la plus proche à la plus lointaine.'
}

const FORMATS: MediaFormat[] = ['TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL', 'TV_SHORT']

/**
 * La raison d'une recommandation, écrite comme une phrase.
 *
 * Le profil parle en premier — c'est lui qui a classé. À défaut, la
 * communauté explique d'où vient le titre. Sinon, on se tait.
 */
function reasonOf(pick: ForYouPick): string {
  if (pick.reasons.length) return `Parce que ${pick.reasons.join(' ')}.`
  if (pick.from.length) {
    const extra = pick.from.length > 2 ? ` et ${pick.from.length - 2} autres` : ''
    return `Parce que tu as aimé ${pick.from.slice(0, 2).join(' et ')}${extra}.`
  }
  return ''
}

/**
 * Une recommandation : l'affiche, le titre, et surtout pourquoi.
 *
 * Sur l'ancienne page, la raison tenait en gris sous l'affiche, à la taille
 * d'une légende. C'est pourtant ce qui distingue une recommandation d'une
 * tendance : ici elle a la place d'une phrase.
 */
function PickCard({ pick }: { pick: ForYouPick }): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  return (
    <button
      className="nd-pick-card"
      style={{ '--tone': toneAccent(pick.media.cover.color) } as React.CSSProperties}
      onClick={() => navigate({ name: 'anime', id: pick.media.id })}
    >
      <Poster src={pick.media.cover.large} alt="" className="h-[132px] w-[88px] shrink-0" rounded="rounded-[10px]" />
      <span className="min-w-0">
        <span className="clamp-2 text-[0.92rem] font-semibold leading-snug">{titleOf(pick.media, lang)}</span>
        <span className="clamp-3 mt-1.5 text-[0.78rem] leading-relaxed text-muted">{reasonOf(pick)}</span>
      </span>
    </button>
  )
}

/** « Sort le 3 oct. 2026 », « Reprend en janvier 2027 », « Date à confirmer ». */
function releaseLine(media: Media): string {
  const start = premiereOf(media)
  if (!start?.year) return 'Date à confirmer'
  const verb = media.status === 'RELEASING' ? 'Reprend' : 'Sort'
  return `${verb} ${start.day && start.month ? 'le' : 'en'} ${premiereLabel(start).toLowerCase()}`
}

/** Les sorties à venir, mois par mois. Le mois est le titre ; la date exacte suit chaque affiche. */
function Schedule({ items }: { items: Media[] }): React.JSX.Element {
  const groups = useMemo(() => {
    const buckets = new Map<number, { label: string; items: Media[] }>()
    for (const media of items) {
      const bucket = monthBucket(premiereOf(media))
      let group = buckets.get(bucket.key)
      if (!group) buckets.set(bucket.key, (group = { label: bucket.label, items: [] }))
      group.items.push(media)
    }
    for (const group of buckets.values()) {
      group.items.sort((a, b) => premiereSort(premiereOf(a)) - premiereSort(premiereOf(b)))
    }
    return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g)
  }, [items])

  return (
    <div className="flex flex-col gap-10">
      {groups.map((group) => (
        <section key={group.label}>
          <h2 className="title-xl mb-3.5 px-1 text-[1.32rem] first-letter:uppercase">
            {group.label}
            <span className="ml-2 text-[0.85rem] font-normal text-faint">{plural(group.items.length, 'titre')}</span>
          </h2>
          <div className="card-grid">
            {group.items.map((media, i) => (
              <div key={media.id}>
                <AnimeCard media={media} width="100%" index={i % 24} />
                <p className="mt-1 px-0.5 text-[0.72rem] text-muted">{releaseLine(media)}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export default function NdDiscoverPage({ initialSearch }: { initialSearch?: string }): React.JSX.Element {
  const entries = useApp((s) => s.entries)
  const navigate = useApp((s) => s.navigate)
  const [tab, setTab] = useState<BrowseKind>('trending')
  const [typed, setTyped] = useState({ from: initialSearch ?? '', text: initialSearch ?? '' })
  const [genre, setGenre] = useState<string | null>(null)
  const [format, setFormat] = useState<MediaFormat | null>(null)
  const opened = initialSearch ?? ''
  const search = typed.from === opened ? typed.text : opened
  const setSearch = (text: string): void => setTyped({ from: opened, text })
  const debounced = useDebounced(search.trim(), 380)

  const searching = debounced.length >= 2
  const showSchedule = !searching && tab === 'upcoming'

  const query = useMemo<BrowseQuery>(() => {
    const filters = { genre: genre ?? undefined, format: format ?? undefined }
    if (searching) return { kind: 'search', search: debounced, perPage: 30, ...filters }
    return { kind: tab, perPage: showSchedule ? 50 : 30, ...filters }
  }, [debounced, searching, tab, genre, format, showSchedule])

  const { items, loading, loadingMore, error, stale, staleAt, hasMore, loadMore, retry } = useBrowse(query)
  const sentinel = useInView(loadMore)

  // Les séries qui reprennent après une pause sont encore « en cours » pour
  // AniList : la requête des sorties ne les voit pas, on les ajoute à part.
  const [returning, setReturning] = useState<Media[]>([])
  useEffect(() => {
    if (!showSchedule) return
    let alive = true
    window.api.anime
      .returning()
      .then((res) => alive && setReturning(res))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [showSchedule])

  const [rec, setRec] = useState<ForYou | null>(null)
  useEffect(() => {
    if (!entries.size) return
    let alive = true
    void window.api.anime
      .forYou()
      .then((res) => alive && setRec(res))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [entries.size])

  // Coller une capture d'écran n'importe où sur la page lance la reconnaissance.
  const [identify, setIdentify] = useState<{ open: boolean; file: File | null }>({ open: false, file: null })
  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
      const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (file) setIdentify({ open: true, file })
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const scheduleItems = useMemo(() => {
    if (!showSchedule) return items
    const seen = new Set(items.map((m) => m.id))
    const extra = returning.filter(
      (m) => !seen.has(m.id) && (!genre || m.genres.includes(genre)) && (!format || m.format === format)
    )
    return [...extra, ...items]
  }, [showSchedule, items, returning, genre, format])

  const recLine = rec
    ? rec.weak
      ? `Ton profil ne tient encore que sur ${plural(rec.profile.sample, 'série')} : il s’affinera à mesure que tu en ajoutes.`
      : rec.profile.scored === 0
        ? `D’après les ${rec.profile.sample} séries que tu regardes. Note-les, et le classement suivra tes goûts plutôt que tes habitudes.`
        : `D’après tes ${rec.profile.scored} notes, sur ${plural(rec.profile.sample, 'série regardée', 'séries regardées')}.`
    : ''

  return (
    <div className="page">
      {/* La recherche est l'élément de la page : on vient ici chercher un titre
          plus souvent que flâner. Elle a donc la taille d'un titre. */}
      <label className="nd-hero-search">
        <Search size={22} aria-hidden />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Quel anime cherches-tu ?"
          aria-label="Rechercher un anime"
        />
        {search && (
          <button onClick={() => setSearch('')} aria-label="Effacer la recherche">
            <X size={16} />
          </button>
        )}
      </label>

      <div className="mb-7 mt-3 flex flex-wrap items-center gap-2 px-1">
        <select
          className="field"
          value={genre ?? ''}
          onChange={(e) => setGenre(e.target.value || null)}
          aria-label="Genre"
        >
          <option value="">Tous les genres</option>
          {GENRES.map((g) => (
            <option key={g} value={g}>
              {GENRE_LABELS[g] ?? g}
            </option>
          ))}
        </select>
        <select
          className="field"
          value={format ?? ''}
          onChange={(e) => setFormat((e.target.value || null) as MediaFormat | null)}
          aria-label="Format"
        >
          <option value="">Tous les formats</option>
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABELS[f]}
            </option>
          ))}
        </select>
        <button
          className="btn btn-ghost"
          title="Colle une capture d'écran n'importe où sur la page, ou choisis un fichier"
          onClick={() => setIdentify({ open: true, file: null })}
        >
          <ScanSearch size={14} />
          Retrouver un anime depuis une image
        </button>
      </div>

      {stale && <StaleNote at={staleAt} />}

      {!searching && rec && rec.picks.length > 0 && (
        <section className="mb-10">
          <div className="mb-3.5 px-1">
            <h2 className="title-xl text-[1.32rem] leading-tight">Choisis pour toi</h2>
            <p className="mt-0.5 max-w-[70ch] text-[0.8rem] text-muted">{recLine}</p>
          </div>
          <RowScroller>
            {rec.picks.slice(0, 12).map((pick) => (
              <PickCard key={pick.media.id} pick={pick} />
            ))}
          </RowScroller>
        </section>
      )}

      {searching ? (
        <h2 className="title-xl mb-3.5 px-1 text-[1.32rem]">
          {loading ? 'Recherche…' : `${plural(items.length, 'résultat')} pour « ${debounced} »`}
        </h2>
      ) : (
        <div className="mb-3.5">
          <NdTabs label="Catalogue" tabs={TABS} value={tab} onChange={setTab} />
          <p className="mt-1.5 px-1 text-[0.8rem] text-muted">
            {TAB_LINES[tab]}
            {tab === 'season' && (
              <>
                {' '}
                <button
                  className="font-medium underline underline-offset-2"
                  onClick={() => navigate({ name: 'season' })}
                >
                  Faire le tri de la saison
                </button>
              </>
            )}
          </p>
        </div>
      )}

      {loading ? (
        <PosterSkeletons count={12} />
      ) : error ? (
        <ErrorBox message={error} onRetry={retry} />
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          {showSchedule
            ? 'Rien d’annoncé pour l’instant.'
            : 'Aucun anime ne correspond. Essaie un autre genre ou un autre format.'}
        </p>
      ) : (
        <>
          {showSchedule ? (
            <Schedule items={scheduleItems} />
          ) : (
            <div className="card-grid">
              {items.map((media, i) => (
                <AnimeCard key={media.id} media={media} width="100%" index={i % 30} />
              ))}
            </div>
          )}
          {hasMore && <div ref={sentinel} className="h-4" />}
          {loadingMore && <Spinner label="Chargement de la suite…" />}
        </>
      )}

      <Modal open={identify.open} onClose={() => setIdentify({ open: false, file: null })} width={620}>
        {identify.open && <IdentifyImage initial={identify.file} />}
      </Modal>
    </div>
  )
}
