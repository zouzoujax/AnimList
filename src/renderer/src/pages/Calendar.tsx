import { CalendarDays, ChevronLeft, ChevronRight, Globe, LibraryBig, Radio } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import type { AiringEntry } from '@shared/types'
import { EmptyState, ErrorBox, Modal, Poster, Spinner } from '@/components/ui'
import { rgba, toneAccent } from '@/lib/color'
import { countdown, formatTime, titleOf } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import { useApp } from '@/store/app'

const DAY_MS = 86_400_000
type Scope = 'library' | 'all'

function startOfWeek(ts: number, weekStart: 0 | 1): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  const shift = (d.getDay() - weekStart + 7) % 7
  return d.getTime() - shift * DAY_MS
}

const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const monthYear = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })

/** "27 juil. – 2 août" for the week starting at `from`. */
function weekRange(from: number): string {
  return `${dayMonth.format(from)} – ${dayMonth.format(from + 6 * DAY_MS)}`
}

/** Every week whose span touches the given month. */
function weeksOfMonth(monthStart: number, weekStart: 0 | 1): number[] {
  const first = new Date(monthStart)
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getTime()
  const out: number[] = []
  for (let cursor = startOfWeek(first.getTime(), weekStart); cursor <= lastDay; cursor += 7 * DAY_MS) {
    out.push(cursor)
  }
  return out
}

function WeekPicker({
  open,
  onClose,
  current,
  weekStart,
  onPick
}: {
  open: boolean
  onClose: () => void
  current: number
  weekStart: 0 | 1
  onPick: (weekStartTs: number) => void
}): React.JSX.Element {
  // `Modal` démonte ses enfants à la fermeture : le mois parcouru vit dans le
  // corps, donc rouvrir retombe sur le mois affiché sans remise à zéro.
  return (
    <Modal open={open} onClose={onClose} width={420}>
      <PickerBody current={current} weekStart={weekStart} onPick={onPick} onClose={onClose} />
    </Modal>
  )
}

function PickerBody({
  current,
  weekStart,
  onPick,
  onClose
}: {
  current: number
  weekStart: 0 | 1
  onPick: (weekStartTs: number) => void
  onClose: () => void
}): React.JSX.Element {
  const [month, setMonth] = useState(() => new Date(current).setDate(1))
  const now = useNow()

  const shiftMonth = (delta: number): void => {
    const d = new Date(month)
    setMonth(new Date(d.getFullYear(), d.getMonth() + delta, 1).getTime())
  }

  const thisWeek = startOfWeek(now, weekStart)
  const weeks = weeksOfMonth(month, weekStart)

  return (
    <>
      <div
        className="flex items-center justify-between gap-2 border-b px-3 py-2.5"
        style={{ borderColor: 'var(--line)' }}
      >
        <button className="icon-btn" onClick={() => shiftMonth(-1)} aria-label="Mois précédent">
          <ChevronLeft size={16} />
        </button>
        <span className="text-[0.92rem] font-semibold capitalize">{monthYear.format(month)}</span>
        <button className="icon-btn" onClick={() => shiftMonth(1)} aria-label="Mois suivant">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-1 p-2">
        {weeks.map((ts, i) => {
          const selected = ts === current
          const isNow = ts === thisWeek
          return (
            <button
              key={ts}
              onClick={() => {
                onPick(ts)
                onClose()
              }}
              className="flex items-center gap-3 rounded-[11px] px-3 py-2 text-left transition hover:bg-white/6"
              style={
                selected
                  ? {
                      background: 'color-mix(in oklab, var(--accent) 20%, transparent)',
                      boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--accent) 45%, transparent)'
                    }
                  : undefined
              }
            >
              <span className="w-[70px] shrink-0 text-[0.72rem] font-semibold text-faint">Semaine {i + 1}</span>
              <span className="flex-1 text-[0.85rem] font-medium">{weekRange(ts)}</span>
              {isNow && (
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[0.64rem] font-bold uppercase tracking-wide"
                  style={{
                    background: 'color-mix(in oklab, var(--accent) 22%, transparent)',
                    color: 'var(--accent-2)'
                  }}
                >
                  en cours
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex justify-between border-t px-3 py-2" style={{ borderColor: 'var(--line)' }}>
        <button
          className="btn btn-ghost"
          onClick={() => {
            onPick(thisWeek)
            onClose()
          }}
        >
          <CalendarDays size={14} />
          Cette semaine
        </button>
        <button className="btn" onClick={onClose}>
          Fermer
        </button>
      </div>
    </>
  )
}

const EMPTY_SLOTS: AiringEntry[] = []

export default function CalendarPage(): React.JSX.Element {
  const entries = useApp((s) => s.entries)
  const mediaMap = useApp((s) => s.media)
  const lang = useApp((s) => s.prefs.titleLang)
  const weekStart = useApp((s) => s.prefs.weekStart)
  const navigate = useApp((s) => s.navigate)

  const [scope, setScope] = useState<Scope>('library')
  const [offset, setOffset] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const now = useNow()
  const [nonce, setNonce] = useState(0)

  const ids = useMemo(
    () => [...entries.values()].filter((e) => e.status === 'watching' || e.status === 'planned').map((e) => e.animeId),
    [entries]
  )

  // Quantised to the week, so the minute ticks never trigger a refetch.
  const from = useMemo(() => startOfWeek(now, weekStart) + offset * 7 * DAY_MS, [now, offset, weekStart])
  const to = from + 7 * DAY_MS

  // Une semaine vide de bibliothèque n'a rien à demander : la clé est vide, et
  // l'absence de requête se lit dans le rendu au lieu de s'écrire dans l'effet.
  const key =
    scope === 'library' && !ids.length ? '' : `${scope}|${from}|${to}|${nonce}|${scope === 'all' ? '' : ids.join()}`
  const [held, setHeld] = useState<{ key: string; slots: AiringEntry[]; error: string | null }>({
    key: '',
    slots: [],
    error: null
  })

  useEffect(() => {
    if (!key) return
    let alive = true
    const seconds = { from: Math.floor(from / 1000), to: Math.floor(to / 1000) }

    const request =
      scope === 'all'
        ? window.api.anime.airingAll(seconds.from, seconds.to)
        : window.api.anime
            .airing(ids.slice(0, 200), seconds.from, seconds.to)
            .then((items) =>
              items
                .map((item) => ({ ...item, media: mediaMap.get(item.mediaId) }))
                .filter((item): item is AiringEntry => !!item.media)
            )

    request
      .then((res) => alive && setHeld({ key, slots: res, error: null }))
      .catch((err: Error) => alive && setHeld({ key, slots: [], error: err.message }))

    return () => {
      alive = false
    }
  }, [key, scope, ids, from, to, mediaMap])

  const fresh = held.key === key
  // Mémoïsé : sans ça le tableau vide est recréé à chaque rendu et les calculs
  // qui en dépendent repartent pour rien.
  const slots = useMemo(() => (fresh ? held.slots : EMPTY_SLOTS), [fresh, held.slots])
  const loading = key !== '' && !fresh
  const error = fresh ? held.error : null

  const days = useMemo(() => {
    const buckets: { date: number; items: AiringEntry[] }[] = Array.from({ length: 7 }, (_, i) => ({
      date: from + i * DAY_MS,
      items: []
    }))
    for (const slot of slots) {
      const index = Math.floor((slot.airingAt * 1000 - from) / DAY_MS)
      if (index >= 0 && index < 7) buckets[index].items.push(slot)
    }
    for (const bucket of buckets) bucket.items.sort((a, b) => a.airingAt - b.airingAt)
    return buckets
  }, [slots, from])

  const todayStart = new Date().setHours(0, 0, 0, 0)
  const total = slots.length

  const scopeSwitch = (
    <div className="flex gap-1.5">
      <button data-on={scope === 'library'} className="chip !h-9" onClick={() => setScope('library')}>
        <LibraryBig size={13} />
        Ma liste
      </button>
      <button data-on={scope === 'all'} className="chip !h-9" onClick={() => setScope('all')}>
        <Globe size={13} />
        Tous les animes
      </button>
    </div>
  )

  if (scope === 'library' && !ids.length) {
    return (
      <div className="mx-auto max-w-[900px] px-7 py-16">
        <EmptyState
          icon={<CalendarDays size={24} />}
          title="Aucune série suivie"
          hint="Ajoute des animes en cours ou à voir pour retrouver leurs épisodes ici — ou consulte tout ce qui passe cette semaine."
          action={
            <div className="mt-1 flex gap-2">
              <button className="btn btn-primary" onClick={() => setScope('all')}>
                Voir tous les animes
              </button>
              <button className="btn" onClick={() => navigate({ name: 'discover' })}>
                Trouver des séries
              </button>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="title-xl text-[1.85rem]">Calendrier</h1>
          <p className="mt-1 text-[0.85rem] text-muted">
            {loading
              ? 'Chargement…'
              : total > 0
                ? `${total} épisodes ${scope === 'all' ? 'toutes séries confondues' : 'dans tes séries'} · ${weekRange(from)}`
                : `Rien de prévu du ${weekRange(from)}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {scopeSwitch}
          <div className="flex items-center gap-1.5">
            <button className="icon-btn" onClick={() => setOffset((o) => o - 1)} aria-label="Semaine précédente">
              <ChevronLeft size={16} />
            </button>
            <button className="btn !h-9 min-w-[168px]" onClick={() => setPickerOpen(true)} title="Choisir une semaine">
              <CalendarDays size={14} />
              {offset === 0 ? 'Cette semaine' : weekRange(from)}
            </button>
            <button className="icon-btn" onClick={() => setOffset((o) => o + 1)} aria-label="Semaine suivante">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {error && <ErrorBox message={error} onRetry={() => setNonce((n) => n + 1)} />}
      {loading ? (
        <Spinner label="Récupération de la grille…" />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {days.map((day, di) => {
            const isToday = day.date === todayStart
            return (
              <motion.div
                key={day.date}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: di * 0.035 }}
                className="glass flex min-h-[180px] flex-col rounded-[18px] p-2.5"
                style={
                  isToday
                    ? {
                        borderColor: 'color-mix(in oklab, var(--accent) 45%, transparent)',
                        background: 'color-mix(in oklab, var(--accent) 9%, transparent)'
                      }
                    : undefined
                }
              >
                <div className="mb-2.5 flex items-baseline justify-between px-1">
                  <span
                    className="text-[0.74rem] font-semibold capitalize"
                    style={{ color: isToday ? 'var(--accent-2)' : 'var(--color-muted)' }}
                  >
                    {new Date(day.date).toLocaleDateString('fr-FR', { weekday: 'short' })}
                  </span>
                  <span className="text-[0.72rem] tabular-nums text-faint">
                    {new Date(day.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </span>
                </div>

                {day.items.length === 0 ? (
                  <p className="my-auto px-1 text-center text-[0.7rem] text-faint/60">—</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {day.items.map((item) => {
                      const glow = toneAccent(item.media.cover.color)
                      const aired = item.airingAt * 1000 < Date.now()
                      const tracked = entries.has(item.mediaId)
                      return (
                        <button
                          key={`${item.mediaId}-${item.episode}`}
                          onClick={() => navigate({ name: 'anime', id: item.mediaId })}
                          className="group flex gap-2 rounded-[11px] p-1.5 text-left transition hover:bg-white/6"
                          style={
                            scope === 'all' && tracked
                              ? { background: rgba(glow, 0.1), boxShadow: `inset 0 0 0 1px ${rgba(glow, 0.3)}` }
                              : undefined
                          }
                        >
                          <Poster
                            src={item.media.cover.large}
                            alt=""
                            className="h-[54px] w-[38px] shrink-0"
                            rounded="rounded-[7px]"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="clamp-2 text-[0.72rem] font-medium leading-tight">
                              {titleOf(item.media, lang)}
                            </p>
                            <p
                              className="mt-1 flex items-center gap-1 text-[0.66rem] tabular-nums"
                              style={{ color: rgba(glow, 1) }}
                            >
                              {aired && <Radio size={9} />}
                              EP {item.episode}
                            </p>
                            <p className="text-[0.64rem] text-faint">
                              {aired ? formatTime(item.airingAt * 1000) : countdown(item.airingAt)}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      )}

      <WeekPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        current={from}
        weekStart={weekStart}
        onPick={(ts) => setOffset(Math.round((ts - startOfWeek(Date.now(), weekStart)) / (7 * DAY_MS)))}
      />
    </div>
  )
}
