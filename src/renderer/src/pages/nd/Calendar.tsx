import { humanMessage } from '@shared/api-outage'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { AiringEntry } from '@shared/types'
import { NdHeader, NdTabs, plural } from '@/components/nd'
import { EmptyState, ErrorBox, Poster, Spinner } from '@/components/ui'
import { toneAccent } from '@/lib/color'
import { formatTime, titleOf } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import { WeekPicker, startOfWeek, weekRange } from '@/pages/Calendar'
import { useApp } from '@/store/app'

const DAY_MS = 86_400_000
type Scope = 'library' | 'all'

/**
 * Les tranches d'une grille de programmes.
 *
 * Une colonne par jour disait quel jour ; elle ne disait pas quand, et c'est
 * pourtant la question du soir : « qu'est-ce qui sort pendant que je suis
 * devant l'écran ? ». La nuit vient en dernier, parce que c'est là que tombent
 * les diffusions japonaises vues depuis la France.
 */
const BANDS = [
  { id: 'morning', label: 'Matin', hint: '5 h à midi', from: 5, to: 12 },
  { id: 'afternoon', label: 'Après-midi', hint: 'midi à 18 h', from: 12, to: 18 },
  { id: 'evening', label: 'Soirée', hint: '18 h à minuit', from: 18, to: 24 },
  { id: 'night', label: 'Nuit', hint: 'minuit à 5 h', from: 0, to: 5 }
] as const

const bandOf = (hour: number): (typeof BANDS)[number]['id'] =>
  BANDS.find((b) => hour >= b.from && hour < b.to)?.id ?? 'night'

const EMPTY_SLOTS: AiringEntry[] = []

function Slot({ item, scope, now }: { item: AiringEntry; scope: Scope; now: number }): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const tracked = useApp((s) => s.entries.has(item.mediaId))
  const aired = item.airingAt * 1000 < now
  return (
    <button
      className="nd-slot"
      data-aired={aired}
      data-mine={scope === 'all' && tracked}
      style={{ '--tone': toneAccent(item.media.cover.color) } as React.CSSProperties}
      onClick={() => navigate({ name: 'anime', id: item.mediaId })}
      title={aired ? 'Déjà diffusé' : undefined}
    >
      <Poster src={item.media.cover.large} alt="" className="h-[46px] w-[32px] shrink-0" rounded="rounded-[6px]" />
      <span className="min-w-0">
        <span className="clamp-2 text-[0.74rem] font-semibold leading-snug">{titleOf(item.media, lang)}</span>
        <span className="mt-0.5 block text-[0.68rem] text-muted">
          Ép. {item.episode} à {formatTime(item.airingAt * 1000)}
        </span>
      </span>
    </button>
  )
}

export default function NdCalendarPage(): React.JSX.Element {
  const entries = useApp((s) => s.entries)
  const mediaMap = useApp((s) => s.media)
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

  const from = useMemo(() => startOfWeek(now, weekStart) + offset * 7 * DAY_MS, [now, offset, weekStart])
  const to = from + 7 * DAY_MS

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
      .catch((err: Error) => alive && setHeld({ key, slots: [], error: humanMessage(err.message) }))
    return () => {
      alive = false
    }
  }, [key, scope, ids, from, to, mediaMap])

  const fresh = held.key === key
  const slots = useMemo(() => (fresh ? held.slots : EMPTY_SLOTS), [fresh, held.slots])
  const loading = key !== '' && !fresh
  const error = fresh ? held.error : null

  // grid[jour][tranche] : les épisodes rangés dans leur case, dans l'ordre de passage.
  const grid = useMemo(() => {
    const out = Array.from({ length: 7 }, () => new Map<string, AiringEntry[]>())
    for (const slot of [...slots].sort((a, b) => a.airingAt - b.airingAt)) {
      const at = slot.airingAt * 1000
      const day = Math.floor((at - from) / DAY_MS)
      if (day < 0 || day > 6) continue
      const band = bandOf(new Date(at).getHours())
      const cell = out[day].get(band) ?? []
      cell.push(slot)
      out[day].set(band, cell)
    }
    return out
  }, [slots, from])

  const todayIndex = Math.floor((new Date(now).setHours(0, 0, 0, 0) - from) / DAY_MS)
  const nowBand = bandOf(new Date(now).getHours())
  const busiest = useMemo(() => {
    let best = -1
    let count = 0
    grid.forEach((day, i) => {
      const n = day.get('evening')?.length ?? 0
      if (n > count) {
        best = i
        count = n
      }
    })
    return best
  }, [grid])

  if (scope === 'library' && !ids.length) {
    return (
      <div className="mx-auto max-w-[900px] px-7 py-16">
        <EmptyState
          icon={<CalendarDays size={24} />}
          title="Aucune série à suivre"
          hint="Ajoute des séries en cours ou à voir pour retrouver leurs épisodes ici, ou regarde tout ce qui passe cette semaine."
          action={
            <div className="mt-1 flex gap-2">
              <button className="btn btn-primary" onClick={() => setScope('all')}>
                Voir tout ce qui passe
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

  const total = slots.length
  const when = offset === 0 ? 'cette semaine' : offset === 1 ? 'la semaine prochaine' : `du ${weekRange(from)}`
  const title = loading
    ? 'Récupération de la grille…'
    : total > 0
      ? `${plural(total, 'épisode')} ${scope === 'all' ? 'diffusé' : 'de tes séries'}${scope === 'all' && total > 1 ? 's' : ''} ${when}`
      : `Rien ${scope === 'all' ? 'à l’antenne' : 'dans tes séries'} ${when}`

  const dayName = (i: number): string =>
    new Date(from + i * DAY_MS).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })

  return (
    <div className="page">
      <NdHeader
        title={title}
        sub={
          busiest >= 0 && !loading
            ? `La soirée la plus chargée : ${dayName(busiest)}.`
            : `Semaine du ${weekRange(from)}`
        }
        actions={
          <>
            <button className="icon-btn" onClick={() => setOffset((o) => o - 1)} aria-label="Semaine précédente">
              <ChevronLeft size={16} />
            </button>
            <button className="btn" onClick={() => setPickerOpen(true)} title="Choisir une semaine">
              <CalendarDays size={14} />
              {offset === 0 ? 'Cette semaine' : weekRange(from)}
            </button>
            <button className="icon-btn" onClick={() => setOffset((o) => o + 1)} aria-label="Semaine suivante">
              <ChevronRight size={16} />
            </button>
          </>
        }
      />

      <div className="mb-5">
        <NdTabs
          label="Quelles séries"
          size="sm"
          tabs={[
            { id: 'library' as const, label: 'Mes séries' },
            { id: 'all' as const, label: 'Tout ce qui passe' }
          ]}
          value={scope}
          onChange={setScope}
        />
      </div>

      {error && <ErrorBox message={error} onRetry={() => setNonce((n) => n + 1)} />}
      {loading ? (
        <Spinner label="Récupération de la grille…" />
      ) : (
        <div className="nd-program" role="table" aria-label="Grille des diffusions">
          <div className="nd-program-row nd-program-head" role="row">
            <span role="columnheader" />
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} role="columnheader" className="nd-program-day" data-today={i === todayIndex}>
                {i === todayIndex ? "Aujourd'hui" : dayName(i)}
              </span>
            ))}
          </div>
          {BANDS.map((band) => (
            <div key={band.id} className="nd-program-row" role="row">
              <span role="rowheader" className="nd-program-band">
                {band.label}
                <span className="block text-[0.68rem] font-normal text-faint">{band.hint}</span>
              </span>
              {grid.map((day, i) => {
                const cell = day.get(band.id) ?? []
                return (
                  <div
                    key={i}
                    role="cell"
                    className="nd-program-cell"
                    data-today={i === todayIndex}
                    data-now={i === todayIndex && band.id === nowBand}
                  >
                    {cell.map((item) => (
                      <Slot key={`${item.mediaId}-${item.episode}`} item={item} scope={scope} now={now} />
                    ))}
                  </div>
                )
              })}
            </div>
          ))}
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
