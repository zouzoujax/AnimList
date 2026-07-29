import {
  Bell,
  BellOff,
  Bookmark,
  Check,
  CheckCheck,
  Eye,
  EyeOff,
  ExternalLink,
  Heart,
  Maximize2,
  Play,
  Repeat,
  RotateCcw,
  Star,
  Trash2,
  Users
} from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  EMOTIONS,
  GENRE_LABELS,
  STATUS_LABELS,
  type EmotionId,
  type LibraryStatus,
  type Media,
  type MediaDetail
} from '@shared/types'
import { MiniCard } from '@/components/AnimeCard'
import EpisodeEditor from '@/components/EpisodeEditor'
import { ErrorBox, Poster, ProgressRing, RowScroller, Section, Skeleton } from '@/components/ui'
import { rgba, toneAccent } from '@/lib/color'
import { countdown, formatLabel, minutesToHuman, seasonLabel, titleOf } from '@/lib/format'
import { useAnimeSama, useDetail, useFiller, useFranchiseFilms, useSeasons } from '@/lib/hooks'
import { WATCH_BADGE, isWatchDisabled, otherPlatforms, watchLinks } from '@/lib/watch'
import { nextEpisodeOf, useApp } from '@/store/app'

const STATUS_ORDER: LibraryStatus[] = ['watching', 'planned', 'completed', 'paused', 'dropped']

function Stars({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }): React.JSX.Element {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0

  return (
    <div className="flex items-center gap-2">
      <div className="flex" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((star) => {
          const full = shown >= star * 2
          const half = !full && shown >= star * 2 - 1
          return (
            <span key={star} className="relative h-7 w-7">
              <Star size={26} className="absolute inset-0 text-white/14" fill="currentColor" strokeWidth={0} />
              {(full || half) && (
                <span className="absolute inset-0 overflow-hidden" style={{ width: full ? '100%' : '50%' }}>
                  <Star size={26} className="text-amber-300" fill="currentColor" strokeWidth={0} />
                </span>
              )}
              {[star * 2 - 1, star * 2].map((score, i) => (
                <button
                  key={score}
                  onMouseEnter={() => setHover(score)}
                  onClick={() => onChange(value === score ? null : score)}
                  aria-label={`Noter ${score} sur 10`}
                  className="absolute top-0 h-full w-1/2"
                  style={{ left: i === 0 ? 0 : '50%' }}
                />
              ))}
            </span>
          )
        })}
      </div>
      <span className="w-14 text-[0.82rem] font-semibold tabular-nums">
        {shown > 0 ? `${shown}/10` : <span className="text-faint">—</span>}
      </span>
    </div>
  )
}

/**
 * Season strip.
 *
 * AniList has no "season 3": entries are linked pairwise by prequel and sequel,
 * so the number here is a position in that chain — which is what a viewer means
 * by season 3 even when the entry is titled "Part 2".
 */
function SeasonStrip({ animeId }: { animeId: number }): React.JSX.Element | null {
  const seasons = useSeasons(animeId)
  const navigate = useApp((s) => s.navigate)
  const entries = useApp((s) => s.entries)
  const watched = useApp((s) => s.watched)

  if (seasons.length < 2) return null

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <span className="label mr-0.5">Saisons</span>
      {seasons.map((season, index) => {
        const current = season.id === animeId
        const seen = watched.get(season.id)?.size ?? 0
        const done = season.episodes ? seen >= season.episodes : false
        const tracked = entries.has(season.id)

        return (
          <button
            key={season.id}
            className="chip"
            data-on={current}
            aria-current={current ? 'page' : undefined}
            onClick={() => !current && navigate({ name: 'anime', id: season.id })}
            title={`${season.title}${season.year ? ` · ${season.year}` : ''}${
              season.episodes ? ` · ${season.episodes} ép.` : ''
            }${tracked ? ` · ${seen} vus` : ' · pas dans ta bibliothèque'}`}
          >
            S{index + 1}
            {/* A dot rather than a colour alone, so the state is not carried by
                hue only. */}
            {tracked && (
              <span
                className="h-[5px] w-[5px] rounded-full"
                style={{ background: done ? 'var(--accent-2)' : 'var(--color-faint)' }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

function EpisodeGrid({ detail, glow }: { detail: MediaDetail; glow: string }): React.JSX.Element {
  const seen = useApp((s) => s.watched.get(detail.id))
  const next = useApp((s) => nextEpisodeOf(s, detail.id, detail.episodes))
  const entry = useApp((s) => s.entries.get(detail.id))
  const events = useApp((s) => s.events)
  const toggleEpisode = useApp((s) => s.toggleEpisode)
  const markUpTo = useApp((s) => s.markUpTo)
  const clearProgress = useApp((s) => s.clearProgress)
  const startRewatch = useApp((s) => s.startRewatch)
  const cancelRewatch = useApp((s) => s.cancelRewatch)
  const toast = useApp((s) => s.toast)
  const [hovered, setHovered] = useState<number | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [hideFiller, setHideFiller] = useState(false)
  const fillerInfo = useFiller(detail.idMal)

  const episodes = detail.episodeMeta
  if (!episodes.length) {
    return (
      <p className="glass rounded-2xl px-4 py-6 text-center text-[0.82rem] text-faint">
        La liste d'épisodes n'est pas encore publiée pour ce titre.
      </p>
    )
  }

  const hoveredMeta = hovered ? episodes[hovered - 1] : null
  const count = seen?.size ?? 0
  const pass = entry?.rewatches ?? 0
  const finished = count === episodes.length && count > 0

  /** Episodes carrying a note or a mood, in any pass — worth flagging. */
  const annotated = new Set(
    events.filter((e) => e.animeId === detail.id && (e.note || e.emotions?.length)).map((e) => e.episode)
  )

  // Recaps are filler for the purpose of skipping: neither advances the story.
  const filler = new Set([...(fillerInfo?.filler ?? []), ...(fillerInfo?.recap ?? [])])
  const shown = hideFiller ? episodes.filter((ep) => !filler.has(ep.number)) : episodes

  /**
   * Last episode already broadcast. `nextAiring.episode` is the one still to
   * come, so everything from it onwards cannot have been watched.
   */
  const lastAired = detail.nextAiring ? detail.nextAiring.episode - 1 : episodes.length
  const unaired = (n: number): boolean => n > lastAired

  return (
    <div>
      <SeasonStrip animeId={detail.id} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* Stops at the last broadcast episode: marking one that has not aired
            would invent a viewing. */}
        <button
          className="btn !h-8"
          onClick={() => markUpTo(detail.id, Math.min(episodes.length, lastAired))}
          disabled={count >= Math.min(episodes.length, lastAired)}
          title={lastAired < episodes.length ? `Jusqu'à l'épisode ${lastAired}, le dernier diffusé` : undefined}
        >
          <CheckCheck size={14} />
          Tout marquer
        </button>
        <button className="btn !h-8" onClick={() => clearProgress(detail.id)} disabled={count === 0}>
          <RotateCcw size={14} />
          Réinitialiser
        </button>

        {/* Only offered when MyAnimeList actually labelled something: a switch
            that never changes anything is worse than no switch. */}
        {filler.size > 0 && (
          <button
            className="btn !h-8"
            data-on={hideFiller}
            onClick={() => setHideFiller((v) => !v)}
            aria-pressed={hideFiller}
            title={
              hideFiller
                ? 'Réafficher les épisodes hors intrigue'
                : `${filler.size} épisode${filler.size > 1 ? 's' : ''} hors intrigue (filler ou résumé)`
            }
            style={hideFiller ? { borderColor: 'var(--accent)' } : undefined}
          >
            {hideFiller ? <Eye size={14} /> : <EyeOff size={14} />}
            {hideFiller ? 'Tout afficher' : 'Sans filler'}
            <span className="tabular-nums opacity-60">{filler.size}</span>
          </button>
        )}

        {entry && finished && (
          <button
            className="btn btn-primary !h-8"
            onClick={() => {
              void startRewatch(detail.id)
              toast('Nouveau visionnage commencé — l’historique précédent est conservé.', 'ok')
            }}
          >
            <Repeat size={14} />
            Revoir
          </button>
        )}

        {pass > 0 && (
          <>
            {/* The tint and the outline carry the accent; the text stays ink, so
                the badge is readable whatever accent and theme are in use. */}
            <span
              className="rounded-full px-2.5 py-1 text-[0.72rem] font-medium"
              style={{
                background: rgba(glow, 0.16),
                border: `1px solid ${rgba(glow, 0.5)}`,
                color: 'var(--color-ink)'
              }}
            >
              {pass === 1 ? '2ᵉ' : `${pass + 1}ᵉ`} visionnage
            </span>
            <button className="btn !h-8 text-[0.75rem]" onClick={() => void cancelRewatch(detail.id)}>
              Annuler ce visionnage
            </button>
          </>
        )}

        <p className="ml-auto min-h-[1.2rem] text-[0.76rem] text-muted">
          {hoveredMeta?.title ? (
            <span>
              <span className="text-faint">EP {hoveredMeta.number} · </span>
              {hoveredMeta.title}
            </span>
          ) : (
            <span className="text-faint">
              {hideFiller
                ? `${episodes.length - shown.length} épisode${episodes.length - shown.length > 1 ? 's' : ''} hors intrigue masqué${episodes.length - shown.length > 1 ? 's' : ''}`
                : 'Clic pour cocher · Maj+clic jusque-là · Clic droit pour éditer'}
            </span>
          )}
        </p>
      </div>

      <EpisodeEditor
        animeId={detail.id}
        episode={editing}
        title={editing ? (episodes[editing - 1]?.title ?? null) : null}
        onClose={() => setEditing(null)}
      />

      <div className="flex flex-wrap gap-1.5">
        {shown.map((ep) => {
          const watched = seen?.has(ep.number) ?? false
          const isNext = ep.number === next
          const isFiller = filler.has(ep.number)
          const notOut = unaired(ep.number)
          const label = ep.title ? `EP ${ep.number} — ${ep.title}` : `Épisode ${ep.number}`
          const note = notOut ? ' · pas encore diffusé' : isFiller ? ' · hors intrigue' : ''
          return (
            <button
              key={ep.number}
              disabled={notOut}
              onMouseEnter={() => setHovered(ep.number)}
              onMouseLeave={() => setHovered(null)}
              onClick={(e) => (e.shiftKey ? markUpTo(detail.id, ep.number) : toggleEpisode(detail.id, ep.number))}
              onContextMenu={(e) => {
                e.preventDefault()
                if (!notOut) setEditing(ep.number)
              }}
              title={`${label}${note}`}
              className={`relative grid h-[38px] w-[42px] place-items-center rounded-[10px] text-[0.75rem] font-semibold tabular-nums transition-all duration-150 ${
                notOut ? 'cursor-not-allowed' : 'hover:scale-110'
              }`}
              style={
                watched
                  ? { background: `linear-gradient(140deg, ${glow}, var(--accent-2))`, color: '#07080f' }
                  : notOut
                    ? {
                        // Not a disabled control so much as a date not yet reached.
                        background: 'transparent',
                        border: '1px solid var(--line)',
                        color: 'var(--color-faint)',
                        opacity: 0.45
                      }
                    : isNext
                      ? {
                          background: 'rgba(255,255,255,.05)',
                          border: `1.5px solid ${rgba(glow, 0.85)}`,
                          color: '#fff',
                          boxShadow: `0 0 18px -4px ${rgba(glow, 0.9)}`
                        }
                      : isFiller
                        ? {
                            // Dashed and dimmed: skippable, not unavailable.
                            background: 'transparent',
                            border: '1px dashed var(--line-2)',
                            color: 'var(--color-faint)'
                          }
                        : {
                            background: 'rgba(255,255,255,.045)',
                            border: '1px solid var(--line)',
                            color: 'var(--color-muted)'
                          }
              }
            >
              {watched ? <Check size={14} strokeWidth={3} /> : ep.number}
              {annotated.has(ep.number) && (
                <span
                  className="absolute right-1 top-1 h-[5px] w-[5px] rounded-full"
                  style={{ background: watched ? '#07080f' : glow }}
                  title="Cet épisode a une note"
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The trailer plays right here, in place of the thumbnail.
 *
 * The frame's source is a loopback page rather than YouTube directly — see
 * `src/main/trailer.ts` for why: the embedded player refuses to start on a page
 * that sends no `Referer`, and this renderer runs on `file://`.
 *
 * The poster is kept until the first click so no video is fetched by merely
 * opening an anime, and so the page has something to show while the player
 * loads.
 */
function Trailer({ id, cover, title }: { id: string; cover: string; title: string }): React.JSX.Element {
  const toast = useApp((s) => s.toast)
  const [thumb, setThumb] = useState(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`)
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onThumbError = (): void =>
    setThumb((current) => (current.includes('maxresdefault') ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : cover))

  const play = async (): Promise<void> => {
    setLoading(true)
    try {
      const url = await window.api.app.trailerUrl(id, title)
      if (url) {
        setSrc(url)
        return
      }
      // A malformed id, or the loopback port would not bind.
      toast('Lecture impossible dans l’app, ouverture sur YouTube.', 'info')
      void window.api.app.openExternal(`https://www.youtube.com/watch?v=${id}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="group relative aspect-video w-full overflow-hidden rounded-[18px]"
      style={{ border: '1px solid var(--line)', background: '#000' }}
    >
      {src ? (
        <iframe
          src={src}
          title={`Bande-annonce de ${title}`}
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
          className="h-full w-full"
          style={{ border: 0 }}
        />
      ) : (
        <button
          onClick={() => void play()}
          className="absolute inset-0"
          aria-label={`Lire la bande-annonce de ${title}`}
        >
          <img
            src={thumb}
            alt=""
            onError={onThumbError}
            className="h-full w-full object-cover opacity-70 transition duration-500 group-hover:scale-[1.03] group-hover:opacity-90"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
          <span className="absolute inset-0 grid place-items-center">
            <span
              className="grid h-16 w-16 place-items-center rounded-full transition-transform group-hover:scale-110"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: '#07080f' }}
            >
              <Play size={24} fill="currentColor" strokeWidth={0} className="ml-1" />
            </span>
          </span>
          <span className="absolute bottom-3 left-4 text-[0.8rem] font-semibold">
            {loading ? 'Chargement…' : 'Bande-annonce'}
          </span>
        </button>
      )}

      {/* Once the player has the frame it also owns the clicks, so these sit
          outside it and only show on hover. */}
      <div
        className={`absolute right-3 top-3 flex gap-1.5 transition-opacity ${
          src ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
        }`}
      >
        {src && (
          <button
            onClick={() => void window.api.app.popoutTrailer(id, title)}
            className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[0.72rem] text-white/85 transition-colors hover:bg-black/80 hover:text-white"
            title="Ouvrir dans une fenêtre plus grande"
          >
            <Maximize2 size={12} />
            Agrandir
          </button>
        )}
        <button
          onClick={() => void window.api.app.openExternal(`https://www.youtube.com/watch?v=${id}`)}
          className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[0.72rem] text-white/85 transition-colors hover:bg-black/80 hover:text-white"
          title="Ouvrir dans le navigateur"
        >
          YouTube
          <ExternalLink size={12} />
        </button>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-[0.74rem] text-faint">{label}</span>
      <span className="text-right text-[0.79rem] font-medium">{value}</span>
    </div>
  )
}

export default function DetailPage({ id }: { id: number }): React.JSX.Element {
  const { data, loading, error, retry } = useDetail(id)
  const mediaCache = useApp((s) => s.media)
  const cached = mediaCache.get(id)
  const entry = useApp((s) => s.entries.get(id))
  const lang = useApp((s) => s.prefs.titleLang)
  const seenCount = useApp((s) => s.watched.get(id)?.size ?? 0)
  const next = useApp((s) => nextEpisodeOf(s, id, s.media.get(id)?.episodes ?? null))
  const saveEntry = useApp((s) => s.saveEntry)
  const removeEntry = useApp((s) => s.removeEntry)
  const toggleEpisode = useApp((s) => s.toggleEpisode)
  const toast = useApp((s) => s.toast)

  const media: Media | MediaDetail | undefined = data ?? cached
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [expanded, setExpanded] = useState(false)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset the textarea only when the anime changes. Depending on `entry` would
  // overwrite what you are typing every time the debounced save echoes back.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setNotes(entry?.notes ?? ''), [entry?.animeId])

  const glow = useMemo(() => toneAccent(media?.cover.color), [media?.cover.color])
  const animeSama = useAnimeSama(media ?? null)
  const franchiseFilms = useFranchiseFilms(media ?? null)

  // Franchise-wide sweep first, then any film this entry links to that the
  // sweep missed — deduplicated, current entry excluded.
  const filmRow = useMemo(() => {
    const out = new Map<number, { id: number; title: string; cover: string; caption: string | null }>()
    for (const film of franchiseFilms) {
      if (film.id === id) continue
      const year = film.startDate?.year ?? film.seasonYear
      out.set(film.id, {
        id: film.id,
        title: titleOf(film, lang),
        cover: film.cover.large,
        caption: year ? String(year) : null
      })
    }
    for (const relation of data?.relations ?? []) {
      if (relation.format !== 'MOVIE' || relation.id === id || out.has(relation.id)) continue
      out.set(relation.id, {
        id: relation.id,
        title: relation.title,
        cover: relation.cover,
        caption: relation.extra
      })
    }
    return [...out.values()]
  }, [franchiseFilms, data, id, lang])
  const total = media?.episodes ?? null
  const ratio = total ? Math.min(1, seenCount / total) : 0
  const watchedMinutes = seenCount * (media?.duration || 24)

  const patch = async (values: Parameters<typeof saveEntry>[1]): Promise<void> => {
    if (!media) return
    await saveEntry(id, values, media)
  }

  const onNotes = (value: string): void => {
    setNotes(value)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => void patch({ notes: value }), 600)
  }

  const toggleEmotion = async (emotion: EmotionId): Promise<void> => {
    const current = entry?.emotions ?? []
    await patch({ emotions: current.includes(emotion) ? current.filter((e) => e !== emotion) : [...current, emotion] })
  }

  if (!media) {
    return (
      <div className="mx-auto max-w-[1400px] px-7 py-7">
        {error ? (
          <ErrorBox message={error} onRetry={retry} />
        ) : (
          <Skeleton className="h-[380px] w-full rounded-[26px]" />
        )}
      </div>
    )
  }

  const detail = data
  const others = otherPlatforms(detail)
  const knownMedia = [...mediaCache.values()]
  // Films get their own row below, so they don't belong in the relations rail.
  const relationRow = (detail?.relations ?? []).filter((r) => r.format !== 'MOVIE')

  return (
    <div className="pb-14">
      {/* ---------------------------------------------------------------- hero */}
      <div className="relative">
        <div className="absolute inset-x-0 top-0 h-[330px] overflow-hidden">
          {media.banner ? (
            <img src={media.banner} alt="" className="h-full w-full object-cover" />
          ) : (
            <img src={media.cover.xl} alt="" className="h-full w-full scale-110 object-cover blur-2xl" />
          )}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, ${rgba(glow, 0.22)} 0%, rgba(5,6,12,.72) 45%, var(--bg) 100%)`
            }}
          />
        </div>

        <div className="relative mx-auto flex max-w-[1400px] gap-7 px-7 pt-[168px]">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 26 }}
            className="hidden shrink-0 md:block"
          >
            <Poster src={media.cover.xl} alt="" className="h-[286px] w-[194px]" rounded="rounded-[18px]" />
          </motion.div>

          <div className="min-w-0 flex-1 pb-1">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[0.74rem] text-muted">
              <span
                className="chip !cursor-default !h-6"
                style={{ background: rgba(glow, 0.2), color: '#fff', borderColor: rgba(glow, 0.4) }}
              >
                {formatLabel(media.format)}
              </span>
              <span>{seasonLabel(media.season, media.seasonYear)}</span>
              {media.studios[0] && <span>· {media.studios[0]}</span>}
              {media.averageScore !== null && <span>· {media.averageScore}% AniList</span>}
            </div>

            <h1 className="title-xl text-[2.35rem] leading-[1.06]">{titleOf(media, lang)}</h1>
            {media.title.native && lang !== 'native' && (
              <p className="mt-1 text-[0.86rem] text-faint">{media.title.native}</p>
            )}

            {media.nextAiring && (
              <p
                className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[0.76rem] font-semibold"
                style={{ background: rgba(glow, 0.18), color: rgba(glow, 1) }}
              >
                Épisode {media.nextAiring.episode} {countdown(media.nextAiring.airingAt)}
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {next && total !== 0 && (
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    await toggleEpisode(id, next)
                    toast(`Épisode ${next} coché`)
                  }}
                >
                  <Play size={14} fill="currentColor" strokeWidth={0} />
                  Marquer l'épisode {next}
                </button>
              )}

              {!entry ? (
                <button className="btn" onClick={() => patch({ status: 'planned' })}>
                  <Bookmark size={14} />
                  Ajouter à ma liste
                </button>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_ORDER.map((status) => (
                    <button
                      key={status}
                      data-on={entry.status === status}
                      className="chip !h-[38px] !px-3"
                      onClick={() => patch({ status })}
                    >
                      {STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>
              )}

              <button
                className="icon-btn !h-[38px] !w-[38px]"
                onClick={() => patch({ favorite: !entry?.favorite })}
                aria-label="Favori"
                style={entry?.favorite ? { color: '#fb7185', background: 'rgba(251,113,133,.12)' } : undefined}
              >
                <Heart size={16} fill={entry?.favorite ? 'currentColor' : 'none'} />
              </button>

              {entry && (
                <button
                  className="icon-btn !h-[38px] !w-[38px]"
                  onClick={() => patch({ notify: entry.notify === false })}
                  aria-label={entry.notify === false ? 'Réactiver les notifications' : 'Couper les notifications'}
                  title={
                    entry.notify === false ? 'Notifications coupées pour cette série' : 'Prévenir quand un épisode sort'
                  }
                  style={entry.notify === false ? { color: 'var(--color-faint)' } : undefined}
                >
                  {entry.notify === false ? <BellOff size={15} /> : <Bell size={15} />}
                </button>
              )}

              {entry && (
                <button
                  className="icon-btn !h-[38px] !w-[38px]"
                  onClick={async () => {
                    await removeEntry(id)
                    toast('Retiré de ta bibliothèque', 'info')
                  }}
                  aria-label="Retirer de ma liste"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>

            {media.genres.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {media.genres.map((g) => (
                  <span key={g} className="chip !h-6 !cursor-default !text-[0.68rem]">
                    {GENRE_LABELS[g] ?? g}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- body */}
      <div className="mx-auto mt-9 grid max-w-[1400px] gap-7 px-7 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {media.description && (
            <section className="mb-8">
              <h2 className="label mb-2">Synopsis</h2>
              <p
                className={`whitespace-pre-line text-[0.885rem] leading-relaxed text-muted ${expanded ? '' : 'clamp-3'}`}
              >
                {media.description}
              </p>
              {media.description.length > 240 && (
                <button
                  className="mt-1.5 text-[0.78rem] font-semibold"
                  style={{ color: 'var(--accent-2)' }}
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? 'Réduire' : 'Lire la suite'}
                </button>
              )}
            </section>
          )}

          {media.trailer && (
            <section className="mb-8">
              {/* Keyed by the video: moving to another anime must start from the
                  poster again rather than carry the previous player over. */}
              <Trailer
                key={media.trailer.id}
                id={media.trailer.id}
                cover={media.banner ?? media.cover.xl}
                title={titleOf(media, lang)}
              />
            </section>
          )}

          <Section title="Épisodes" subtitle={total ? `${seenCount} vus sur ${total}` : `${seenCount} épisodes vus`}>
            {loading && !detail ? (
              <Skeleton className="h-28 w-full" />
            ) : detail ? (
              <EpisodeGrid detail={detail} glow={glow} />
            ) : null}
          </Section>

          {detail && detail.characters.length > 0 && (
            <Section title="Personnages" subtitle="Voix japonaises">
              <RowScroller>
                {detail.characters.map((c, i) => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.025 }}
                    className="glass w-[168px] shrink-0 rounded-[15px] p-2.5"
                  >
                    <div className="flex gap-2">
                      <Poster
                        src={c.image ?? media.cover.large}
                        alt=""
                        className="h-[74px] w-[52px]"
                        rounded="rounded-[9px]"
                      />
                      {c.vaImage && (
                        <Poster
                          src={c.vaImage}
                          alt=""
                          className="h-[74px] w-[52px] opacity-75"
                          rounded="rounded-[9px]"
                        />
                      )}
                    </div>
                    <p className="clamp-2 mt-2 text-[0.75rem] font-semibold leading-snug">{c.name}</p>
                    <p className="mt-0.5 text-[0.67rem] text-faint">{c.role}</p>
                    {c.va && <p className="clamp-2 mt-1 text-[0.67rem] text-muted">{c.va}</p>}
                  </motion.div>
                ))}
              </RowScroller>
            </Section>
          )}

          {relationRow.length > 0 && (
            <Section title="Dans la même série">
              <RowScroller>
                {relationRow.map((r, i) => (
                  <MiniCard
                    key={`${r.id}-${i}`}
                    id={r.id}
                    title={r.title}
                    cover={r.cover}
                    caption={r.extra}
                    index={i}
                  />
                ))}
              </RowScroller>
            </Section>
          )}

          {filmRow.length > 0 && (
            <Section title="Films de la série" subtitle={`${filmRow.length} longs métrages`}>
              <RowScroller>
                {filmRow.map((film, i) => (
                  <MiniCard
                    key={film.id}
                    id={film.id}
                    title={film.title}
                    cover={film.cover}
                    caption={film.caption}
                    index={i}
                  />
                ))}
              </RowScroller>
            </Section>
          )}

          {detail && detail.recommendations.length > 0 && (
            <Section title="Tu aimeras peut-être">
              <RowScroller>
                {detail.recommendations.map((r, i) => (
                  <MiniCard key={r.id} id={r.id} title={r.title} cover={r.cover} caption={r.extra} index={i} />
                ))}
              </RowScroller>
            </Section>
          )}
        </div>

        {/* ------------------------------------------------------------ aside */}
        <aside className="flex flex-col gap-4">
          <div className="glass rounded-[20px] p-4">
            <div className="flex items-center gap-4">
              <ProgressRing value={ratio} size={68} stroke={5}>
                <span className="text-[0.78rem] font-bold tabular-nums">{Math.round(ratio * 100)}%</span>
              </ProgressRing>
              <div className="min-w-0">
                <p className="stat-num text-[1.5rem] leading-none">
                  {seenCount}
                  <span className="text-[0.9rem] text-faint"> / {total ?? '?'}</span>
                </p>
                <p className="mt-1.5 text-[0.74rem] text-faint">{minutesToHuman(watchedMinutes)} de visionnage</p>
              </div>
            </div>
          </div>

          <div className="glass rounded-[20px] p-4">
            <h3 className="label mb-2.5">Ma note</h3>
            <Stars value={entry?.score ?? null} onChange={(score) => patch({ score })} />

            <h3 className="label mb-2 mt-5">Ressenti</h3>
            <div className="flex flex-wrap gap-1.5">
              {EMOTIONS.map((emotion) => {
                const on = entry?.emotions.includes(emotion.id) ?? false
                return (
                  <button
                    key={emotion.id}
                    onClick={() => toggleEmotion(emotion.id)}
                    title={emotion.label}
                    data-on={on}
                    className="chip !h-8 !px-2.5 !text-[0.95rem]"
                  >
                    <span style={{ filter: on ? 'none' : 'grayscale(.65)' }}>{emotion.emoji}</span>
                  </button>
                )
              })}
            </div>

            <h3 className="label mb-2 mt-5">Mes notes</h3>
            <textarea
              value={notes}
              onChange={(e) => onNotes(e.target.value)}
              rows={3}
              placeholder="Une pensée, un moment marquant…"
              className="field w-full !h-auto resize-y py-2 text-[0.8rem] leading-relaxed"
            />
          </div>

          <div className="glass rounded-[20px] p-4">
            <h3 className="label mb-1.5">Informations</h3>
            <InfoRow label="Format" value={formatLabel(media.format)} />
            <InfoRow label="Épisodes" value={total ?? '—'} />
            <InfoRow label="Durée" value={media.duration ? `${media.duration} min` : '—'} />
            <InfoRow label="Diffusion" value={seasonLabel(media.season, media.seasonYear)} />
            <InfoRow label="Studio" value={media.studios.join(', ') || '—'} />
            <InfoRow
              label="Score AniList"
              value={
                media.averageScore !== null ? (
                  <span className="inline-flex items-center gap-1">
                    <Star size={11} className="text-amber-300" fill="currentColor" strokeWidth={0} />
                    {media.averageScore}%
                  </span>
                ) : (
                  '—'
                )
              }
            />
            <InfoRow
              label="Popularité"
              value={
                <span className="inline-flex items-center gap-1">
                  <Users size={11} />
                  {media.popularity.toLocaleString('fr-FR')}
                </span>
              }
            />

            {detail && detail.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {detail.tags.map((tag) => (
                  <span key={tag} className="chip !h-6 !cursor-default !text-[0.65rem]">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="glass rounded-[20px] p-4">
            <h3 className="label mb-2.5">Regarder</h3>
            <div className="flex flex-col gap-1.5">
              {watchLinks(media, detail, animeSama, knownMedia).map((link) => (
                <button
                  key={link.id}
                  onClick={() => link.url && window.api.app.openExternal(link.url)}
                  disabled={isWatchDisabled(link.kind)}
                  title={link.url ? `${link.hint}\n${link.url}` : link.hint}
                  className="group flex items-center gap-2.5 rounded-[12px] border border-white/8 bg-white/5 px-3 py-2.5 text-left transition enabled:hover:border-white/20 enabled:hover:bg-white/10 disabled:cursor-default disabled:opacity-45"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: link.color, boxShadow: `0 0 10px ${link.color}` }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[0.82rem] font-semibold">{link.label}</span>
                  <span
                    className="shrink-0 text-[0.62rem] font-bold uppercase tracking-wider"
                    style={{ color: WATCH_BADGE[link.kind].color }}
                  >
                    {WATCH_BADGE[link.kind].label}
                  </span>
                  {!isWatchDisabled(link.kind) && (
                    <ExternalLink size={12} className="shrink-0 text-faint transition group-hover:text-white" />
                  )}
                </button>
              ))}
            </div>

            {media.status === 'NOT_YET_RELEASED' && (
              <p className="mt-3 text-[0.73rem] leading-snug text-faint">
                Aucun service ne diffuse encore ce titre. Ajoute-le à « À voir » pour être prévenu à la sortie du
                premier épisode.
              </p>
            )}

            {others.length > 0 && media.status !== 'NOT_YET_RELEASED' && (
              <>
                <div className="hairline my-3.5" />
                <h4 className="label mb-2">Autres plateformes</h4>
                <div className="flex flex-wrap gap-1.5">
                  {others.map((link) => (
                    <button key={link.url} className="chip" onClick={() => window.api.app.openExternal(link.url)}>
                      {link.site}
                      <ExternalLink size={11} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {error && <ErrorBox message={error} onRetry={retry} />}
        </aside>
      </div>
    </div>
  )
}
