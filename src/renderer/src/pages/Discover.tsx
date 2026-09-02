import { CalendarClock, Flame, Rocket, ScanSearch, Search, Sparkles, Star, TrendingUp, X } from 'lucide-react'
import { motion } from 'motion/react'
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
import { ErrorBox, Modal, PosterSkeletons, Spinner } from '@/components/ui'
import { monthBucket, premiereLabel, premiereOf, premiereSort } from '@/lib/format'
import { useBrowse, useDebounced, useInView } from '@/lib/hooks'
import { useApp } from '@/store/app'

const TABS: { kind: BrowseKind; label: string; icon: typeof Flame }[] = [
  { kind: 'trending', label: 'Tendances', icon: Flame },
  { kind: 'season', label: 'Cette saison', icon: Sparkles },
  { kind: 'popular', label: 'Populaires', icon: TrendingUp },
  { kind: 'top', label: 'Mieux notés', icon: Star },
  { kind: 'upcoming', label: 'À venir', icon: Rocket }
]

const FORMATS: MediaFormat[] = ['TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL', 'TV_SHORT']

/**
 * La phrase sous une carte.
 *
 * Le profil parle en premier — c'est lui qui a classé. À défaut, la
 * communauté explique d'où vient le titre. Si ni l'un ni l'autre n'a rien à
 * dire, mieux vaut se taire qu'inventer une raison.
 */
function reasonOf(pick: ForYouPick): string {
  if (pick.reasons.length) return `parce que ${pick.reasons.join(' ')}`
  if (pick.from.length) {
    const extra = pick.from.length > 2 ? ` +${pick.from.length - 2}` : ''
    return `parce que tu as aimé ${pick.from.slice(0, 2).join(', ')}${extra}`
  }
  return ''
}

/** Release schedule: grouped by premiere month, earliest first, TBA last. */
function UpcomingSchedule({ items }: { items: Media[] }): React.JSX.Element {
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
    <div className="flex flex-col gap-9">
      {groups.map((group, gi) => (
        <motion.section
          key={group.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: gi * 0.05 }}
        >
          <header className="mb-3.5 flex items-center gap-3 px-1">
            <CalendarClock size={15} style={{ color: 'var(--accent-2)' }} />
            <h2 className="title-xl text-[1.12rem] capitalize">{group.label}</h2>
            <span className="text-[0.74rem] text-faint">{group.items.length} titres</span>
            <div className="hairline ml-2 flex-1" />
          </header>

          <div className="card-grid">
            {group.items.map((media, i) => (
              <div key={media.id}>
                <AnimeCard media={media} width="100%" index={i % 24} />
                <p className="mt-1 px-0.5 text-[0.68rem] font-semibold" style={{ color: 'var(--accent-2)' }}>
                  {media.status === 'RELEASING' && <span style={{ color: '#ffb038' }}>Reprise · </span>}
                  {premiereLabel(premiereOf(media))}
                </p>
              </div>
            ))}
          </div>
        </motion.section>
      ))}
    </div>
  )
}

export default function DiscoverPage({ initialSearch }: { initialSearch?: string }): React.JSX.Element {
  const entries = useApp((s) => s.entries)
  const [tab, setTab] = useState<BrowseKind>('trending')
  // La saisie appartient à la recherche qui a ouvert la page. Arriver avec une
  // autre — depuis la palette, par exemple — rend la précédente caduque sans
  // qu'on ait à l'écraser dans un effet.
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

  const { items, loading, loadingMore, error, stale, hasMore, loadMore, retry } = useBrowse(query)
  const sentinel = useInView(loadMore)

  // Split cours resuming after a break are still RELEASING, so the upcoming
  // query can't see them — they're fetched separately and merged in.
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

  /**
   * Le profil de goût et ce qu'il conseille.
   *
   * Tout est calculé côté processus principal : c'est lui qui a la
   * bibliothèque entière, les fiches en cache et le droit d'appeler AniList.
   * La fenêtre ne fait que demander une fois et afficher — y compris la
   * raison, sans laquelle une recommandation ne se vérifie pas.
   */
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
    // Une entrée ajoutée ou notée change le profil ; la relancer à chaque
    // épisode coché, non — d'où la taille plutôt que la table elle-même.
  }, [entries.size])

  /**
   * Reconnaissance d'une image.
   *
   * Coller ouvre la fenêtre avec l'image déjà dedans : après une capture
   * d'écran, Ctrl+V est le geste qu'on fait sans y penser, et devoir d'abord
   * trouver un bouton casserait exactement ça. La saisie de recherche est
   * épargnée — y coller du texte doit rester du texte.
   */
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

  return (
    <div className="page">
      <h1 className="title-xl mb-1 text-[1.85rem]">Découvrir</h1>
      <p className="mb-6 text-[0.85rem] text-muted">
        {searching
          ? `Résultats pour « ${debounced} »`
          : showSchedule
            ? 'Calendrier des sorties, du plus proche au plus lointain. Les titres sans date annoncée ne sont pas listés.'
            : 'Tout le catalogue AniList — sans compte, sans pub.'}
      </p>

      <div className="glass sticky top-0 z-20 mb-7 rounded-[20px] p-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[240px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un titre…"
              className="field w-full !pl-9 !pr-9"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Effacer"
                className="icon-btn absolute right-1 top-1/2 !h-7 !w-7 -translate-y-1/2"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <button
            className="chip !h-[38px] !px-3.5 shrink-0"
            title="Trouver de quel anime vient une capture d’écran"
            onClick={() => setIdentify({ open: true, file: null })}
          >
            <ScanSearch size={14} />
            Identifier une image
          </button>

          <div className="flex flex-wrap gap-1.5">
            {TABS.map(({ kind, label, icon: Icon }) => (
              <button
                key={kind}
                onClick={() => {
                  setTab(kind)
                  setSearch('')
                }}
                data-on={!searching && tab === kind}
                className="chip !h-[38px] !px-3.5"
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <button data-on={!genre} className="chip" onClick={() => setGenre(null)}>
            Tous genres
          </button>
          {GENRES.map((g) => (
            <button key={g} data-on={genre === g} className="chip" onClick={() => setGenre(genre === g ? null : g)}>
              {GENRE_LABELS[g] ?? g}
            </button>
          ))}
          <span className="mx-1 h-4 w-px" style={{ background: 'var(--line-2)' }} />
          {FORMATS.map((f) => (
            <button key={f} data-on={format === f} className="chip" onClick={() => setFormat(format === f ? null : f)}>
              {FORMAT_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {stale && (
        <p className="mb-4 text-[0.76rem] text-amber-300/80">Hors ligne — affichage de la dernière version en cache.</p>
      )}

      {/* Avant le catalogue : ce qui vient de ta bibliothèque passe devant ce
          qui vient du classement mondial. Absente en recherche, où l'on sait
          déjà ce qu'on cherche. */}
      {!searching && tab === 'trending' && rec && rec.picks.length > 0 && (
        <section className="mb-9">
          <div className="mb-3.5 px-1">
            <h2 className="title-xl text-[1.32rem] leading-tight">Pour toi</h2>
            {/* La phrase dit sur quoi le classement repose. Sans note donnée,
                il repose sur ce qui est le plus regardé — et le dire tient
                lieu d'invitation à noter, ce qui l'affinerait vraiment. */}
            <p className="mt-0.5 text-[0.8rem] text-muted">
              {rec.weak
                ? `Ton profil ne tient encore que sur ${rec.profile.sample} série${rec.profile.sample > 1 ? 's' : ''} regardée${rec.profile.sample > 1 ? 's' : ''} — il s’affinera à mesure que tu en ajoutes.`
                : rec.profile.scored === 0
                  ? `D’après les ${rec.profile.sample} séries que tu regardes. Note-les et le classement suivra tes notes plutôt que tes habitudes.`
                  : `D’après tes ${rec.profile.scored} notes, sur les ${rec.profile.sample} séries que tu as regardées`}
            </p>
            {/* Ce que l'app croit avoir compris, affiché : un classement dont
                on ne voit pas la règle ne se conteste pas. */}
            {rec.profile.top.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {rec.profile.top.map((facet) => (
                  <span key={facet.name} className="chip !h-6 !cursor-default !text-[0.65rem]">
                    {GENRE_LABELS[facet.name] ?? facet.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="card-grid">
            {rec.picks.slice(0, 12).map((pick, i) => (
              <div key={pick.media.id}>
                <AnimeCard media={pick.media} width="100%" index={i} />
                <p className="clamp-2 mt-1 px-0.5 text-[0.68rem] text-faint" title={pick.from.join(', ')}>
                  {reasonOf(pick)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <PosterSkeletons count={12} />
      ) : error ? (
        <ErrorBox message={error} onRetry={retry} />
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-faint">
          {showSchedule ? 'Rien d’annoncé pour cette saison.' : 'Aucun anime ne correspond à ces filtres.'}
        </p>
      ) : (
        <>
          {showSchedule ? (
            <UpcomingSchedule items={scheduleItems} />
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
