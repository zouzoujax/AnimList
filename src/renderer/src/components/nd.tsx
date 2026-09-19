/**
 * Les pièces du nouveau design, partagées par ses pages.
 *
 * Trois partis pris les relient : une phrase qui dit quelque chose plutôt
 * qu'un titre et une étiquette en capitales ; la couleur de chaque série
 * (`--tone`) plutôt que l'accent du thème partout ; une ligne par série quand
 * la page parle de progression, des affiches quand elle parle de choisir.
 */

import { Check, Clock } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Media } from '@shared/types'
import { Poster } from '@/components/ui'
import { toneAccent } from '@/lib/color'
import { airingLabel, isUnaired, relativeDay, titleOf } from '@/lib/format'
import { nextEpisodeOf, useApp } from '@/store/app'

export const plural = (n: number, word: string, many = `${word}s`): string => `${n} ${n > 1 ? many : word}`

/** Au-delà, un trait par épisode deviendrait un liseré illisible : on montre une fenêtre autour du suivant. */
const STRIP_MAX = 52

/**
 * Un trait par épisode.
 *
 * La barre de progression disait « 54 % » ; la frise dit lesquels. Vus, le
 * prochain, ceux qui sont sortis sans toi et ceux qui ne sont pas encore
 * diffusés ne se ressemblent pas, parce qu'on n'en fait pas la même chose.
 */
export function EpisodeStrip({
  media,
  next,
  size = 'sm'
}: {
  media: Media
  next: number | null
  size?: 'sm' | 'lg'
}): React.JSX.Element | null {
  const seen = useApp((s) => s.watched.get(media.id))
  const aired = media.nextAiring ? media.nextAiring.episode - 1 : (media.episodes ?? 0)
  const total = media.episodes ?? Math.max(aired + 1, next ?? 0, ...(seen ? [...seen] : [0]))
  if (total <= 1) return null

  const start = total <= STRIP_MAX ? 1 : Math.max(1, Math.min((next ?? total) - STRIP_MAX / 2, total - STRIP_MAX + 1))
  const count = Math.min(total, STRIP_MAX)

  return (
    <div
      className="ep-strip"
      data-size={size}
      style={{ '--tone': toneAccent(media.cover.color) } as React.CSSProperties}
      role="img"
      aria-label={`${seen?.size ?? 0} épisodes vus sur ${total}`}
    >
      {Array.from({ length: count }, (_, i) => {
        const n = start + i
        const state = seen?.has(n) ? 'seen' : n === next ? 'next' : n <= aired ? 'aired' : 'later'
        return <span key={n} className="ep-tick" data-s={state} style={{ '--i': i } as React.CSSProperties} />
      })}
    </div>
  )
}

/** Le haut d'une page : une phrase, une précision discrète, et les actions à droite. */
export function NdHeader({
  title,
  sub,
  actions,
  back
}: {
  title: ReactNode
  sub?: ReactNode
  actions?: ReactNode
  back?: () => void
}): React.JSX.Element {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-1">
      <div className="min-w-0 max-w-[70ch]">
        {back && (
          <button className="nd-back" onClick={back}>
            Retour
          </button>
        )}
        <h1 className="title-xl text-[1.6rem] leading-tight">{title}</h1>
        {sub && <p className="mt-1 text-[0.85rem] leading-relaxed text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** Des onglets écrits en toutes lettres, soulignés quand ils sont choisis. */
export function NdTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  size = 'md'
}: {
  tabs: { id: T; label: string; count?: number }[]
  value: T | null
  onChange: (id: T) => void
  label: string
  size?: 'md' | 'sm'
}): React.JSX.Element {
  return (
    <div className="nd-tabs" data-size={size} role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          className="home-tab title-xl"
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count !== undefined && <span className="nd-tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  )
}

/**
 * Une série sur une ligne : affiche, titre, où tu en es, sa frise, et le
 * bouton pour cocher l'épisode suivant.
 *
 * Deux boutons côte à côte plutôt que l'un dans l'autre : ouvrir la fiche et
 * cocher l'épisode sont deux gestes, et un bouton imbriqué n'est pas valide.
 */
export function SeriesRow({
  media,
  behind = 0,
  note,
  onHover,
  as: Tag = 'li'
}: {
  media: Media
  behind?: number
  /** Une précision de plus sur la ligne : le statut, le rôle tenu… */
  note?: ReactNode
  onHover?: (media: Media | null) => void
  as?: 'li' | 'div'
}): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const next = useApp((s) => nextEpisodeOf(s, media.id, media.episodes))
  const tracked = useApp((s) => s.entries.has(media.id))
  const toggleEpisode = useApp((s) => s.toggleEpisode)
  const toast = useApp((s) => s.toast)
  const pending = next !== null && isUnaired(media, next)

  return (
    <Tag
      className="home-row"
      style={{ '--tone': toneAccent(media.cover.color) } as React.CSSProperties}
      onMouseEnter={() => onHover?.(media)}
      onMouseLeave={() => onHover?.(null)}
    >
      <button className="home-row-main" onClick={() => navigate({ name: 'anime', id: media.id })}>
        <Poster src={media.cover.large} alt="" className="h-[72px] w-[50px] shrink-0" rounded="rounded-[9px]" />
        <span className="min-w-0 flex-1">
          <span className="clamp-2 text-[0.9rem] font-semibold leading-snug">{titleOf(media, lang)}</span>
          <span className="mt-1 flex flex-wrap gap-x-3 text-[0.76rem] text-muted">
            {tracked && <span>{next ? `Épisode ${next}` : 'Terminée'}</span>}
            {behind > 1 && <span className="font-semibold text-[var(--tone-ink)]">{behind} déjà sortis</span>}
            {note}
          </span>
          {tracked && (
            <span className="mt-2 block">
              <EpisodeStrip media={media} next={next} />
            </span>
          )}
        </span>
      </button>

      {tracked &&
        next !== null &&
        (pending && media.nextAiring ? (
          <span className="home-row-when" title={airingLabel(media.nextAiring.airingAt)}>
            <Clock size={13} />
            {relativeDay(media.nextAiring.airingAt * 1000)}
          </span>
        ) : (
          <button
            className="home-row-mark"
            title={`Cocher l'épisode ${next}`}
            onClick={async () => {
              await toggleEpisode(media.id, next, media)
              toast(`Épisode ${next} coché · ${titleOf(media, lang)}`)
            }}
          >
            <Check size={15} />
            <span>{next}</span>
          </button>
        ))}
    </Tag>
  )
}

/** Épisodes diffusés et pas encore vus. Un épisode programmé pour jeudi n'est pas un retard. */
export function behindOf(media: Media, seen: Set<number> | undefined): number {
  const aired = media.nextAiring ? media.nextAiring.episode - 1 : (media.episodes ?? 0)
  let behind = 0
  for (let n = 1; n <= aired; n += 1) if (!seen?.has(n)) behind += 1
  return behind
}

/** Une durée écrite pour être lue dans une phrase : « 7 jours et 4 heures ». */
export function spokenDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const d = Math.floor(total / 1440)
  const h = Math.floor((total % 1440) / 60)
  const m = total % 60
  const parts: [number, string][] =
    d > 0
      ? [
          [d, 'jour'],
          [h, 'heure']
        ]
      : h > 0
        ? [
            [h, 'heure'],
            [m, 'minute']
          ]
        : [[m, 'minute']]
  const said = parts.filter(([n]) => n > 0).map(([n, w]) => plural(n, w))
  return said.length ? said.join(' et ') : '0 minute'
}
