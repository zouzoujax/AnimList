import { Check, Clock, Play, Plus, Star } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef } from 'react'
import type { Media } from '@shared/types'
import { rgba, toneAccent } from '@/lib/color'
import { airingLabel, countdown, formatLabel, isUnaired, titleOf } from '@/lib/format'
import { nextEpisodeOf, useApp } from '@/store/app'
import { Poster, ProgressRing } from './ui'

export function AnimeCard({
  media,
  width = 172,
  index = 0,
  onHover
}: {
  media: Media
  width?: number | string
  index?: number
  /** L'accueil s'en sert pour teinter la lumière de la page. Ailleurs : rien. */
  onHover?: (media: Media | null) => void
}): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const entry = useApp((s) => s.entries.get(media.id))
  const seen = useApp((s) => s.watched.get(media.id)?.size ?? 0)
  const reduceMotion = useApp((s) => s.prefs.reduceMotion)
  const saveEntry = useApp((s) => s.saveEntry)
  const toast = useApp((s) => s.toast)
  const cardRef = useRef<HTMLButtonElement>(null)

  // Written straight to the DOM rather than through state: this fires on every
  // mousemove and must not re-render the card.
  const onMove = (event: React.MouseEvent): void => {
    const el = cardRef.current
    if (!el || reduceMotion) return
    const box = el.getBoundingClientRect()
    el.style.setProperty('--rx', String((event.clientX - box.left) / box.width - 0.5))
    el.style.setProperty('--ry', String((event.clientY - box.top) / box.height - 0.5))
  }

  const onLeave = (): void => {
    onHover?.(null)
    const el = cardRef.current
    if (!el) return
    el.style.setProperty('--rx', '0')
    el.style.setProperty('--ry', '0')
  }

  const glow = toneAccent(media.cover.color)
  const total = media.episodes
  const ratio = total ? Math.min(1, seen / total) : 0

  const quickAdd = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (entry) return
    await saveEntry(media.id, { status: 'planned' }, media)
    toast(`${titleOf(media, lang)} ajouté à « À voir »`)
  }

  return (
    <motion.button
      ref={cardRef}
      onClick={() => navigate({ name: 'anime', id: media.id })}
      onMouseMove={onMove}
      onMouseEnter={() => onHover?.(media)}
      onMouseLeave={onLeave}
      className="group relative shrink-0 text-left"
      style={{ width }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.022, 0.3), type: 'spring', stiffness: 260, damping: 28 }}
      whileHover={{ y: -6 }}
    >
      <div className="tilt">
        <div
          className="tilt-inner relative overflow-hidden rounded-[15px]"
          style={{ boxShadow: `0 18px 42px -22px ${rgba(glow, 0.9)}` }}
        >
          <Poster src={media.cover.xl} alt="" className="tilt-img aspect-[2/3] w-full" rounded="rounded-[15px]" />
          <span className="sheen pointer-events-none absolute inset-0 rounded-[15px] mix-blend-overlay" />

          <div
            className="pointer-events-none absolute inset-0 rounded-[15px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{ boxShadow: `inset 0 0 0 1.5px ${rgba(glow, 0.85)}, inset 0 -70px 60px -50px ${rgba(glow, 0.7)}` }}
          />

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 to-transparent" />

          {/* Score / airing badge */}
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1.5">
            {media.averageScore !== null && (
              <span
                className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.65rem] font-bold backdrop-blur-md"
                style={{ background: 'rgba(0,0,0,.62)', color: media.averageScore >= 75 ? '#ffd166' : '#e9ecf8' }}
              >
                <Star size={9} fill="currentColor" strokeWidth={0} />
                {media.averageScore}
              </span>
            )}
            {media.nextAiring && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[0.62rem] font-semibold backdrop-blur-md"
                style={{ background: rgba(glow, 0.85), color: '#0a0b12' }}
              >
                EP {media.nextAiring.episode} · {countdown(media.nextAiring.airingAt)}
              </span>
            )}
          </div>

          {/* Quick add / tracked marker */}
          <div className="absolute right-2 top-2">
            {entry ? (
              <span
                className="grid h-6 w-6 place-items-center rounded-full backdrop-blur-md"
                style={{ background: 'rgba(0,0,0,.6)', color: rgba(glow, 1) }}
                title="Dans ta bibliothèque"
              >
                <Check size={12} strokeWidth={3} />
              </span>
            ) : (
              <span
                onClick={quickAdd}
                role="button"
                tabIndex={-1}
                title="Ajouter à « À voir »"
                className="grid h-6 w-6 translate-y-1 place-items-center rounded-full opacity-0 backdrop-blur-md transition-all duration-200 hover:!bg-white/25 group-hover:translate-y-0 group-hover:opacity-100"
                style={{ background: 'rgba(0,0,0,.6)' }}
              >
                <Plus size={13} strokeWidth={2.6} />
              </span>
            )}
          </div>

          {/* Progress */}
          {seen > 0 && (
            <div className="absolute inset-x-0 bottom-0">
              {total ? (
                <div className="mx-2 mb-2 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${ratio * 100}%`,
                        background: `linear-gradient(90deg, ${glow}, var(--accent-2))`
                      }}
                    />
                  </div>
                  <span className="text-[0.62rem] font-semibold tabular-nums text-white/90">
                    {seen}/{total}
                  </span>
                </div>
              ) : (
                <div className="mx-2 mb-2 text-[0.62rem] font-semibold text-white/90">{seen} vus</div>
              )}
            </div>
          )}
        </div>
      </div>

      <h3 className="clamp-2 mt-2.5 text-[0.815rem] font-semibold leading-snug">{titleOf(media, lang)}</h3>
      <p className="mt-0.5 text-[0.7rem] text-faint">
        {formatLabel(media.format)}
        {media.seasonYear ? ` · ${media.seasonYear}` : ''}
      </p>
    </motion.button>
  )
}

/** Wide "keep watching" card used on the home page. */
export function ContinueCard({
  media,
  index = 0,
  note,
  onHover
}: {
  media: Media
  index?: number
  /** Mention posée à côté du numéro d'épisode, quand la carte sert un autre propos. */
  note?: string
  onHover?: (media: Media | null) => void
}): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const seen = useApp((s) => s.watched.get(media.id)?.size ?? 0)
  const next = useApp((s) => nextEpisodeOf(s, media.id, media.episodes))
  const toggleEpisode = useApp((s) => s.toggleEpisode)
  const toast = useApp((s) => s.toast)

  const glow = toneAccent(media.cover.color)
  const total = media.episodes
  const ratio = total ? Math.min(1, seen / total) : 0
  // Rien à cocher tant que l'épisode n'est pas diffusé : le bouton cède la
  // place au compte à rebours.
  const pending = next !== null && isUnaired(media, next)

  const markNext = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (!next) return
    await toggleEpisode(media.id, next)
    toast(`Épisode ${next} coché · ${titleOf(media, lang)}`)
  }

  return (
    <motion.button
      onClick={() => navigate({ name: 'anime', id: media.id })}
      onMouseEnter={() => onHover?.(media)}
      onMouseLeave={() => onHover?.(null)}
      className="group relative h-[196px] w-[358px] shrink-0 overflow-hidden rounded-[20px] text-left"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.25), type: 'spring', stiffness: 240, damping: 26 }}
      whileHover={{ y: -5 }}
      style={{ boxShadow: `0 24px 56px -30px ${rgba(glow, 1)}`, border: `1px solid ${rgba(glow, 0.28)}` }}
    >
      <img
        src={media.banner ?? media.cover.xl}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full scale-105 object-cover transition-transform duration-[900ms] group-hover:scale-110"
      />
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(100deg, rgba(6,7,14,.95) 26%, ${rgba(glow, 0.28)} 130%)` }}
      />

      <div className="relative flex h-full items-center gap-4 p-4">
        <Poster src={media.cover.large} alt="" className="h-full w-[110px] shrink-0" rounded="rounded-[13px]" />

        <div className="flex h-full min-w-0 flex-1 flex-col">
          <p className="label flex items-center gap-1.5 pr-[52px]" style={{ color: rgba(glow, 0.95) }}>
            {next ? `${pending ? 'Prochain épisode' : 'Épisode'} ${next}` : 'Terminé'}
            {note && (
              <span
                className="rounded-full px-1.5 py-px text-[0.58rem] font-bold"
                style={{ background: rgba(glow, 0.9), color: '#07080f' }}
              >
                {note}
              </span>
            )}
          </p>
          <h3 className="clamp-2 mt-1 pr-[52px] text-[0.98rem] font-semibold leading-snug">{titleOf(media, lang)}</h3>

          <div className="mt-auto flex items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              {/*
               * Sur une seule ligne, quoi qu'il arrive : le compte qui passe à
               * la ligne pousse la barre hors de la carte, alors qu'un compte
               * rogné de quelques pixels ne se remarque pas.
               */}
              <div className="mb-1.5 flex items-baseline gap-1.5 overflow-hidden whitespace-nowrap text-[0.72rem] text-muted">
                <span className="font-semibold tabular-nums text-white">{seen}</span>
                <span>/ {total ?? '?'} épisodes</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${ratio * 100}%`,
                    background: `linear-gradient(90deg, ${glow}, var(--accent-2))`,
                    boxShadow: `0 0 12px ${rgba(glow, 0.8)}`
                  }}
                />
              </div>
            </div>

            {pending && media.nextAiring ? (
              <span
                title={airingLabel(media.nextAiring.airingAt)}
                className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[0.68rem] font-semibold"
                style={{ background: rgba(glow, 0.18), color: rgba(glow, 1) }}
              >
                <Clock size={12} />
                {countdown(media.nextAiring.airingAt)}
              </span>
            ) : (
              next && (
                <span
                  onClick={markNext}
                  role="button"
                  tabIndex={-1}
                  title={`Marquer l'épisode ${next} comme vu`}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full transition-transform hover:scale-110 active:scale-95"
                  style={{ background: `linear-gradient(135deg, ${glow}, var(--accent-2))`, color: '#07080f' }}
                >
                  <Play size={15} fill="currentColor" strokeWidth={0} className="ml-0.5" />
                </span>
              )
            )}
          </div>
        </div>

        {/*
         * Posé par-dessus plutôt qu'à côté : en colonne, ses 40 px se
         * retiraient de la ligne « x / y épisodes », qui passait alors à la
         * ligne et chassait la barre de progression hors de la carte. Il reste
         * au même pixel, il ne coûte plus de place — le texte lui cède le
         * passage par un `pr` au lieu d'une colonne.
         */}
        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
          <ProgressRing value={ratio} size={40} stroke={3}>
            <span className="text-[0.6rem] font-bold tabular-nums">{Math.round(ratio * 100)}</span>
          </ProgressRing>
        </div>
      </div>
    </motion.button>
  )
}

export function MiniCard({
  id,
  title,
  cover,
  caption,
  index = 0,
  onOpen
}: {
  id: number
  title: string
  cover: string
  caption?: string | null
  index?: number
  /** Ouvre autre chose que la fiche de l'anime — un manga n'en a pas. */
  onOpen?: () => void
}): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  return (
    <motion.button
      onClick={() => (onOpen ? onOpen() : navigate({ name: 'anime', id }))}
      className="group w-[126px] shrink-0 text-left"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.25) }}
      whileHover={{ y: -4 }}
    >
      <Poster
        src={cover}
        alt=""
        className="aspect-[2/3] w-full ring-1 ring-white/8 transition group-hover:ring-white/25"
      />
      {caption && <p className="label mt-2 !text-[0.62rem]">{caption}</p>}
      <p className="clamp-2 mt-0.5 text-[0.75rem] font-medium leading-snug">{title}</p>
    </motion.button>
  )
}
