import { useMemo, useState, type ReactNode } from 'react'
import { heatRamp, rgba } from '@/lib/color'
import { num } from '@/lib/format'
import { useApp } from '@/store/app'

/**
 * Every mark on this page encodes magnitude, so each chart stays single-hue and
 * lets length, position or lightness carry the value. Labels wear ink tokens,
 * never the series colour.
 */

interface TipState {
  x: number
  y: number
  content: ReactNode
}

function useTooltip(): {
  tip: TipState | null
  show: (e: React.MouseEvent, content: ReactNode) => void
  hide: () => void
  node: ReactNode
} {
  const [tip, setTip] = useState<TipState | null>(null)
  return {
    tip,
    show: (e, content) => {
      const host = e.currentTarget.closest('[data-chart]')
      const box = host?.getBoundingClientRect()
      setTip({ x: e.clientX - (box?.left ?? 0), y: e.clientY - (box?.top ?? 0), content })
    },
    hide: () => setTip(null),
    node: tip ? (
      <div
        className="glass-blur pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-[calc(100%+12px)] whitespace-nowrap rounded-xl px-2.5 py-1.5 text-[0.73rem] shadow-xl"
        style={{ left: tip.x, top: tip.y }}
      >
        {tip.content}
      </div>
    ) : null
  }
}

export function StatTile({
  label,
  value,
  hint,
  icon,
  accentText
}: {
  label: string
  value: string
  hint?: string
  icon?: ReactNode
  accentText?: boolean
}): React.JSX.Element {
  return (
    <div className="glass relative overflow-hidden rounded-[18px] px-4 py-3.5">
      {icon && <span className="absolute right-3 top-3 text-white/12">{icon}</span>}
      <p className="label">{label}</p>
      {/* leading-none clipped descenders — the "j" of "jour" lost its tail. */}
      <p className={`mt-1 text-[1.75rem] leading-[1.15] ${accentText ? 'stat-num' : 'title-xl'}`}>{value}</p>
      {hint && <p className="mt-1.5 text-[0.72rem] text-faint">{hint}</p>}
    </div>
  )
}

// ---------------------------------------------------------------- heatmap

export interface DayCount {
  date: number
  count: number
}

const WEEKDAYS = ['L', '', 'M', '', 'J', '', 'D']

export function ActivityHeatmap({ days }: { days: DayCount[] }): React.JSX.Element {
  const accent = useApp((s) => s.prefs.accent)
  const ramp = useMemo(() => heatRamp(accent), [accent])
  const tooltip = useTooltip()

  const max = Math.max(1, ...days.map((d) => d.count))
  const levelOf = (count: number): number => {
    if (count === 0) return -1
    return Math.min(3, Math.floor((count / max) * 3.999))
  }

  const weeks = useMemo(() => {
    const out: DayCount[][] = []
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7))
    return out
  }, [days])

  const monthMarks = useMemo(() => {
    const marks: { index: number; label: string }[] = []
    let lastMonth = -1
    let lastIndex = -10
    weeks.forEach((week, i) => {
      // Judged mid-week: the first column can start in the previous December,
      // which used to stamp a "déc." label on top of "janv.".
      const mid = week[3] ?? week[0]
      const month = new Date(mid.date).getMonth()
      if (month === lastMonth || i - lastIndex < 3) return
      marks.push({ index: i, label: new Date(mid.date).toLocaleDateString('fr-FR', { month: 'short' }) })
      lastMonth = month
      lastIndex = i
    })
    return marks
  }, [weeks])

  return (
    <div data-chart className="relative">
      <div className="scroll-x pb-1">
        <div className="min-w-max">
          <div className="mb-1 flex gap-[3px] pl-[18px]">
            {weeks.map((_, i) => {
              const mark = monthMarks.find((m) => m.index === i)
              return (
                <span key={i} className="w-[11px] text-[0.6rem] capitalize text-faint">
                  {mark ? <span className="absolute">{mark.label}</span> : null}
                </span>
              )
            })}
          </div>

          <div className="flex gap-[3px]">
            <div className="flex w-[15px] flex-col gap-[3px]">
              {WEEKDAYS.map((d, i) => (
                <span key={i} className="h-[11px] text-[0.58rem] leading-[11px] text-faint">
                  {d}
                </span>
              ))}
            </div>

            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((day) => {
                  const level = levelOf(day.count)
                  return (
                    <span
                      key={day.date}
                      onMouseEnter={(e) =>
                        tooltip.show(
                          e,
                          <>
                            <b className="tabular-nums">{day.count}</b> épisode{day.count > 1 ? 's' : ''} ·{' '}
                            <span className="text-faint">
                              {new Date(day.date).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric'
                              })}
                            </span>
                          </>
                        )
                      }
                      onMouseLeave={tooltip.hide}
                      className="h-[11px] w-[11px] rounded-[3px] transition-transform hover:scale-[1.35]"
                      style={{
                        background: level < 0 ? 'rgba(255,255,255,.045)' : ramp[level],
                        outline: level < 0 ? '1px solid rgba(255,255,255,.03)' : 'none'
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[0.65rem] text-faint">
        <span>Moins</span>
        <span className="h-[10px] w-[10px] rounded-[3px]" style={{ background: 'rgba(255,255,255,.045)' }} />
        {ramp.map((c) => (
          <span key={c} className="h-[10px] w-[10px] rounded-[3px]" style={{ background: c }} />
        ))}
        <span>Plus</span>
        <span className="ml-auto tabular-nums">Pic : {max} épisodes en un jour</span>
      </div>

      {tooltip.node}
    </div>
  )
}

// ---------------------------------------------------------------- columns

export function MonthlyColumns({
  data,
  unit
}: {
  data: { label: string; value: number; detail: string }[]
  unit: string
}): React.JSX.Element {
  const accent = useApp((s) => s.prefs.accent)
  const tooltip = useTooltip()
  const max = Math.max(1, ...data.map((d) => d.value))
  const peak = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0)

  return (
    <div data-chart className="relative">
      <div className="relative h-[168px]">
        {[1, 0.5, 0].map((f) => (
          <div
            key={f}
            className="absolute inset-x-0 border-t"
            style={{ bottom: `${f * 100}%`, borderColor: 'rgba(255,255,255,.07)' }}
          />
        ))}

        <div className="absolute inset-0 flex items-end gap-[2px]">
          {data.map((d, i) => {
            const h = (d.value / max) * 100
            return (
              <div
                key={d.label}
                className="group relative flex h-full flex-1 items-end"
                onMouseEnter={(e) => tooltip.show(e, <span className="tabular-nums">{d.detail}</span>)}
                onMouseLeave={tooltip.hide}
              >
                <div className="absolute inset-0 rounded-t-lg transition group-hover:bg-white/4" />
                <div
                  className="relative w-full rounded-t-[4px] transition-all duration-500"
                  style={{
                    height: `${Math.max(h, d.value > 0 ? 2 : 0)}%`,
                    background: `linear-gradient(180deg, ${accent}, ${rgba(accent, 0.55)})`
                  }}
                />
                {i === peak && d.value > 0 && (
                  <span
                    className="absolute inset-x-0 text-center text-[0.66rem] font-semibold tabular-nums"
                    style={{ bottom: `calc(${Math.max(h, 2)}% + 5px)` }}
                  >
                    {num(d.value)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-2 flex gap-[2px]">
        {data.map((d) => (
          <span key={d.label} className="flex-1 text-center text-[0.62rem] capitalize text-faint">
            {d.label}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-[0.68rem] text-faint">{unit}</p>

      {tooltip.node}
    </div>
  )
}

// ---------------------------------------------------------------- ranked bars

export interface RankedRow {
  key: string
  label: string
  /** Sert à dimensionner la barre. Pas forcément lisible tel quel. */
  value: number
  /**
   * Ce qu'on écrit à la place du nombre brut.
   *
   * Une durée en minutes classe correctement mais ne se lit pas : « 8616 »
   * n'apprend rien à personne. Quand la grandeur a une unité, elle s'écrit ici.
   */
  display?: string
  detail?: string
}

export function RankedBars({
  rows,
  suffix,
  onSelect
}: {
  rows: RankedRow[]
  suffix: string
  onSelect?: (key: string) => void
}): React.JSX.Element {
  const accent = useApp((s) => s.prefs.accent)
  const max = Math.max(1, ...rows.map((r) => r.value))

  if (!rows.length) {
    return <p className="py-6 text-center text-[0.78rem] text-faint">Pas encore assez de données.</p>
  }

  return (
    <div className="flex flex-col gap-1">
      {rows.map((row) => (
        <button
          key={row.key}
          onClick={onSelect ? () => onSelect(row.key) : undefined}
          disabled={!onSelect}
          className="group grid grid-cols-[minmax(84px,132px)_1fr_auto] items-center gap-3 rounded-[9px] px-1.5 py-1 text-left transition enabled:hover:bg-white/6 disabled:cursor-default"
        >
          <span
            className="truncate text-[0.76rem] text-muted transition group-enabled:group-hover:text-white"
            title={row.label}
          >
            {row.label}
          </span>
          <div className="h-[18px] overflow-hidden rounded-[5px]" style={{ background: 'rgba(255,255,255,.045)' }}>
            <div
              className="h-full rounded-[5px] transition-[width] duration-700"
              style={{
                width: `${(row.value / max) * 100}%`,
                background: `linear-gradient(90deg, ${rgba(accent, 0.62)}, ${accent})`
              }}
            />
          </div>
          <span className="w-[96px] text-right text-[0.76rem] font-semibold tabular-nums">
            {row.display ?? num(row.value)}
            {/* Sur deux lignes seulement quand la valeur est une durée : « 5 j
                23 h » et « 359 ép. » ne tiennent pas côte à côte, là où
                « 142 ép. » se lit très bien d'un trait. */}
            {(row.detail ?? suffix) && (
              <span className={`font-normal text-faint ${row.display ? 'block' : 'ml-1'}`}>{row.detail ?? suffix}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}
