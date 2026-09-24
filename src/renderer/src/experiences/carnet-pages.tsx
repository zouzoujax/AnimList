import { ArrowLeft, Search } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import {
  STATUS_LABELS,
  type BrowseKind,
  type LibraryStatus,
  type Manga,
  type MangaKind,
  type Media
} from '@shared/types'
import { MangaSheet } from '@/components/MangaSheet'
import { Modal } from '@/components/ui'
import { formatLabel, formatTime, seasonLabel, titleOf } from '@/lib/format'
import { statusBlocked } from '@/lib/status'
import { useApp } from '@/store/app'
import { useCatalogue, useForYou, useMangaList, useWeek } from './pages-data'
import type { DetailHeroProps } from '.'

/*
 * CARNET — le reste du carnet de collectionneur : les trouvailles épinglées,
 * l'agenda en double page, l'étagère manga en tranches de livres, et la fiche
 * d'un anime comme une carte de collection annotée.
 */

/** Une inclinaison qui a l'air laissée au hasard, mais qui ne bouge pas d'un rendu à l'autre. */
const tilt = (i: number): number => ((i * 37) % 7) - 3
const INKS = ['#c8553d', '#e0a458', '#588b8b', '#8f5d9a', '#6b8f4e', '#3f6c9e']

function Pinned({ media, index }: { media: Media; index: number }): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  return (
    <motion.button
      className="xk-polaroid text-left"
      style={{ rotate: tilt(index) }}
      whileHover={{ rotate: 0, scale: 1.06, y: -6 }}
      onClick={() => navigate({ name: 'anime', id: media.id })}
    >
      <span className="xk-pin" style={{ background: INKS[index % INKS.length] }} aria-hidden />
      <img src={media.cover.large} alt="" className="aspect-[3/4] w-full object-cover" loading="lazy" />
      <span className="xk-hand clamp-2 mt-2 block">{titleOf(media, lang)}</span>
      <span className="xk-note block">
        {formatLabel(media.format)}
        {media.seasonYear ? ` · ${media.seasonYear}` : ''}
      </span>
    </motion.button>
  )
}

const TAGS: { kind: BrowseKind; label: string }[] = [
  { kind: 'trending', label: 'Du moment' },
  { kind: 'season', label: 'De la saison' },
  { kind: 'popular', label: 'Classiques' },
  { kind: 'top', label: 'Pépites' },
  { kind: 'upcoming', label: 'À guetter' }
]

export function CarnetDiscover({ initialSearch }: { initialSearch?: string }): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const [tag, setTag] = useState<BrowseKind>('trending')
  const [search, setSearch] = useState(initialSearch ?? '')
  const { items, loading, hasMore, loadMore, searching, error } = useCatalogue(tag, search)
  const rec = useForYou()

  return (
    <div className="px-8 py-8">
      <div className="xk-page relative mx-auto max-w-[1180px] px-16 py-12">
        <span className="xk-rings" aria-hidden />
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h1 className="xk-title">Trouvailles</h1>
          <label className="xk-label-tape">
            <Search size={15} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="chercher une série…" />
          </label>
        </div>
        {!searching && (
          <div className="mt-6 flex flex-wrap gap-3">
            {TAGS.map((t, i) => (
              <motion.button
                key={t.kind}
                className="xk-tag"
                style={{ background: INKS[i % INKS.length], rotate: tilt(i) / 2 }}
                data-on={tag === t.kind}
                whileHover={{ y: -3 }}
                onClick={() => setTag(t.kind)}
              >
                {t.label}
              </motion.button>
            ))}
          </div>
        )}

        {!searching && rec && rec.picks.length > 0 && (
          <>
            <h2 className="xk-heading mt-10">Glissé par un ami</h2>
            <div className="mt-4 flex flex-wrap gap-4">
              {rec.picks.slice(0, 6).map((pick, i) => (
                <motion.button
                  key={pick.media.id}
                  className="xk-postit text-left"
                  style={{ rotate: tilt(i + 2) }}
                  whileHover={{ rotate: 0, y: -4 }}
                  onClick={() => navigate({ name: 'anime', id: pick.media.id })}
                >
                  <span className="xk-hand clamp-2 block">{titleOf(pick.media, lang)}</span>
                  {pick.from[0] && <span className="xk-note mt-1 block">« si tu as aimé {pick.from[0]} »</span>}
                </motion.button>
              ))}
            </div>
          </>
        )}

        <h2 className="xk-heading mt-10">{searching ? 'Ce que j’ai trouvé' : 'Sur le tableau'}</h2>
        <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-8">
          {items.map((media, i) => (
            <Pinned key={media.id} media={media} index={i} />
          ))}
        </div>
        {loading && items.length === 0 && <p className="xk-hand mt-4">Je fouille les bacs…</p>}
        {error && <p className="xk-note mt-4">{error}</p>}
        {hasMore && !loading && (
          <button className="xk-tag mt-10" style={{ background: '#3a2c20' }} onClick={loadMore}>
            Fouiller encore
          </button>
        )}
      </div>
    </div>
  )
}

const dayName = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' })
const dayNum = new Intl.DateTimeFormat('fr-FR', { day: 'numeric' })
const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })

export function CarnetCalendar(): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const [scope, setScope] = useState<'library' | 'all'>('library')
  const [offset, setOffset] = useState(0)
  const week = useWeek(scope, offset)
  const today = new Date().setHours(0, 0, 0, 0)

  return (
    <div className="px-8 py-8">
      <div className="xk-page xk-spread relative mx-auto max-w-[1240px] px-16 py-12">
        <span className="xk-rings" aria-hidden />
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <p className="xk-note capitalize">{monthName.format(week.from)}</p>
            <h1 className="xk-title">Mon agenda</h1>
          </div>
          <div className="ml-auto flex flex-wrap gap-3">
            <button
              className="xk-tag"
              style={{ background: '#588b8b' }}
              data-on={scope === 'library'}
              onClick={() => setScope('library')}
            >
              Mes séries
            </button>
            <button
              className="xk-tag"
              style={{ background: '#8f5d9a' }}
              data-on={scope === 'all'}
              onClick={() => setScope('all')}
            >
              Tout ce qui passe
            </button>
            <button className="xk-tag" style={{ background: '#3a2c20' }} onClick={() => setOffset((o) => o - 1)}>
              ← page d’avant
            </button>
            <button className="xk-tag" style={{ background: '#3a2c20' }} onClick={() => setOffset((o) => o + 1)}>
              page d’après →
            </button>
          </div>
        </div>
        {week.error && <p className="xk-note mt-2">{week.error}</p>}

        <div className="mt-8 grid grid-cols-4 gap-x-8 gap-y-6">
          {week.days.map((day) => (
            <section key={day.date} className="xk-agenda-day">
              <header className="flex items-baseline gap-2">
                <span className="xk-agenda-num" data-today={day.date === today}>
                  {dayNum.format(day.date)}
                </span>
                <span className="xk-hand capitalize">{dayName.format(day.date)}</span>
              </header>
              <ul className="mt-2">
                {day.items.map((slot) => (
                  <li key={`${slot.mediaId}-${slot.episode}`}>
                    <button className="xk-agenda-line" onClick={() => navigate({ name: 'anime', id: slot.media.id })}>
                      <img
                        src={slot.media.cover.large}
                        alt=""
                        className="h-7 w-5 shrink-0 rounded-[2px] object-cover"
                      />
                      <span className="xk-note shrink-0">{formatTime(slot.airingAt * 1000)}</span>
                      <span className="xk-hand truncate !text-[1rem]">{titleOf(slot.media, lang)}</span>
                      <span className="xk-note shrink-0">ép. {slot.episode}</span>
                    </button>
                  </li>
                ))}
                {day.items.length === 0 && <li className="xk-note">{week.loading ? '…' : 'rien de prévu'}</li>}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

const MANGA_TAGS: { kind: MangaKind; label: string }[] = [
  { kind: 'trending', label: 'Du moment' },
  { kind: 'popular', label: 'Les plus lus' },
  { kind: 'top', label: 'Pépites' }
]

export function CarnetManga(): React.JSX.Element {
  const [tag, setTag] = useState<MangaKind>('trending')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<Manga | null>(null)
  const { items, loading, error } = useMangaList(tag, search)

  return (
    <div className="px-10 py-10">
      <div className="flex flex-wrap items-end gap-6">
        <h1 className="xk-title xk-title-light">L’étagère manga</h1>
        <div className="flex gap-3">
          {MANGA_TAGS.map((t, i) => (
            <button
              key={t.kind}
              className="xk-tag"
              style={{ background: INKS[i] }}
              data-on={tag === t.kind}
              onClick={() => setTag(t.kind)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="xk-label-tape ml-auto">
          <Search size={15} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="chercher un tome…" />
        </label>
      </div>
      <p className="xk-label mt-6">Survole une tranche pour la sortir de l’étagère.</p>

      <div className="xk-bookshelf mt-4">
        {items.map((manga, i) => (
          <motion.button
            key={manga.id}
            className="xk-spine"
            style={{ background: manga.cover.color ?? INKS[i % INKS.length], height: `${210 + ((i * 29) % 60)}px` }}
            whileHover={{ y: -34 }}
            onClick={() => setOpen(manga)}
            title={manga.title.english ?? manga.title.romaji}
          >
            <span className="xk-spine-title">{manga.title.english ?? manga.title.romaji}</span>
            <img src={manga.cover.large} alt="" className="xk-spine-cover" />
          </motion.button>
        ))}
      </div>
      {loading && <p className="xk-hand mt-4 text-[#f3e6cf]">Je range l’étagère…</p>}
      {error && <p className="xk-note mt-4">{error}</p>}
      <Modal open={open !== null} onClose={() => setOpen(null)} width={640}>
        {open && <MangaSheet manga={open} onClose={() => setOpen(null)} />}
      </Modal>
    </div>
  )
}

const STATUSES: LibraryStatus[] = ['watching', 'planned', 'completed', 'paused', 'dropped']

export function CarnetDetailHero(props: DetailHeroProps): React.JSX.Element {
  const { media, entry, next, seen, total } = props
  const lang = useApp((s) => s.prefs.titleLang)

  return (
    <div className="px-8 pt-8">
      <div className="xk-page relative mx-auto max-w-[1240px] px-16 py-10">
        <span className="xk-rings" aria-hidden />
        <button className="xk-tag mb-6" style={{ background: '#3a2c20' }} onClick={props.onBack}>
          <ArrowLeft size={14} /> page précédente
        </button>
        <div className="grid grid-cols-[260px_1fr] gap-12">
          <button className="xk-card xk-card-big" type="button">
            <span className="xk-card-inner">
              <span className="xk-card-face">
                <img src={media.cover.xl} alt="" className="h-full w-full object-cover" />
                <span className="xk-card-name">{titleOf(media, lang)}</span>
              </span>
              <span className="xk-card-face xk-card-back">
                <span className="xk-hand">{titleOf(media, lang)}</span>
                <span className="xk-note mt-3 block">{formatLabel(media.format)}</span>
                <span className="xk-note block">{seasonLabel(media.season, media.seasonYear)}</span>
                <span className="xk-note block">{total ?? '?'} épisodes</span>
                <span className="xk-note block">{media.averageScore ?? '—'} / 100</span>
                <span className="xk-note block">{media.studios[0] ?? ''}</span>
              </span>
            </span>
          </button>

          <div>
            <p className="xk-note">
              {media.studios[0] ?? 'Studio inconnu'} · {seasonLabel(media.season, media.seasonYear)}
            </p>
            <h1 className="xk-title !text-[3.6rem]">{titleOf(media, lang)}</h1>
            {props.alsoKnownAs[0] && <p className="xk-hand mt-1">aussi appelé « {props.alsoKnownAs[0]} »</p>}

            <figure className="xk-polaroid mt-6 w-[80%]" style={{ rotate: '-1.5deg' }}>
              <span className="xk-tape" aria-hidden />
              <img src={media.banner ?? media.cover.xl} alt="" className="aspect-[16/7] w-full object-cover" />
            </figure>

            <div className="mt-6 flex flex-wrap items-center gap-4">
              {entry && (
                <span className="xk-stamp-status" style={{ rotate: '-6deg' }}>
                  {STATUS_LABELS[entry.status]}
                </span>
              )}
              {entry && total ? (
                <span className="xk-hand">
                  {seen} épisodes cochés sur {total}
                </span>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {next !== null && (
                <motion.button
                  className="xk-tag"
                  style={{ background: '#c8553d' }}
                  whileHover={{ y: -3 }}
                  onClick={props.onMark}
                >
                  ✓ cocher l’épisode {next}
                </motion.button>
              )}
              {!entry && (
                <motion.button
                  className="xk-tag"
                  style={{ background: '#588b8b' }}
                  whileHover={{ y: -3 }}
                  onClick={props.onAdd}
                >
                  + coller dans le carnet
                </motion.button>
              )}
              <motion.button
                className="xk-tag"
                style={{ background: '#b5838d' }}
                whileHover={{ y: -3 }}
                onClick={props.onFavorite}
              >
                {entry?.favorite ? '♥ coup de cœur' : '♡ coup de cœur'}
              </motion.button>
              {entry && (
                <motion.button
                  className="xk-tag"
                  style={{ background: '#3f6c9e' }}
                  whileHover={{ y: -3 }}
                  onClick={props.onLists}
                >
                  ranger dans une liste{props.inLists > 0 ? ` (${props.inLists})` : ''}
                </motion.button>
              )}
            </div>
            {entry && (
              <div className="mt-4 flex flex-wrap gap-2">
                {STATUSES.map((status, i) => {
                  const blocked = statusBlocked(status, media, entry)
                  return (
                    <button
                      key={status}
                      className="xk-tag !min-h-0 !py-1 !text-[0.75rem]"
                      style={{ background: INKS[i % INKS.length] }}
                      data-on={entry.status === status}
                      disabled={!!blocked}
                      title={blocked ?? undefined}
                      onClick={() => props.onStatus(status)}
                    >
                      {STATUS_LABELS[status]}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
