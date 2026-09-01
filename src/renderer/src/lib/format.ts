import { FORMAT_LABELS, type Media, type SeasonName, type TitleLang } from '@shared/types'

export function titleOf(media: { title: Media['title'] }, lang: TitleLang): string {
  if (lang === 'english') return media.title.english ?? media.title.romaji
  if (lang === 'native') return media.title.native ?? media.title.romaji
  return media.title.romaji
}

export function formatLabel(format: string | null): string {
  return format ? (FORMAT_LABELS[format] ?? format) : '—'
}

const SEASON_LABELS: Record<SeasonName, string> = {
  WINTER: 'Hiver',
  SPRING: 'Printemps',
  SUMMER: 'Été',
  FALL: 'Automne'
}

export function seasonLabel(season: SeasonName | null, year: number | null): string {
  if (!season && !year) return '—'
  if (!season) return String(year)
  return `${SEASON_LABELS[season]} ${year ?? ''}`.trim()
}

const nf = new Intl.NumberFormat('fr-FR')

export function num(value: number): string {
  return nf.format(Math.round(value))
}

/** 1 486 min → "24 h 46". Used everywhere a watch time is shown. */
export function minutesToHuman(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m} min`
  if (h < 24) return `${h} h ${String(m).padStart(2, '0')}`
  const d = Math.floor(h / 24)
  return `${num(d)} j ${h % 24} h`
}

/**
 * Duration split into value/unit pairs so a big display figure can style them
 * apart. A lone bold "j" at 4rem loses its tittle and reads as an "I", so the
 * day unit is always spelled out here.
 */
export function durationParts(minutes: number): { value: string; unit: string }[] {
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  if (h === 0) return [{ value: String(total), unit: 'min' }]
  if (h < 24)
    return [
      { value: String(h), unit: 'h' },
      { value: String(total % 60).padStart(2, '0'), unit: 'min' }
    ]
  const d = Math.floor(h / 24)
  return [
    { value: num(d), unit: d > 1 ? 'jours' : 'jour' },
    { value: String(h % 24), unit: 'h' }
  ]
}

export function dayLabel(count: number): string {
  return `${num(count)} ${count > 1 ? 'jours' : 'jour'}`
}

export function hoursOf(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

export const formatDate = (ts: number): string => dateFmt.format(ts)
export const formatDay = (ts: number): string => dayFmt.format(ts)
export const formatTime = (ts: number): string => timeFmt.format(ts)

export function relativeDay(ts: number): string {
  const a = new Date(ts)
  const b = new Date()
  const days = Math.round(
    (new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime() -
      new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()) /
      86_400_000
  )
  if (days === 0) return "Aujourd'hui"
  if (days === 1) return 'Demain'
  if (days === -1) return 'Hier'
  if (days > 1 && days < 7) return dayFmt.format(ts).replace(/^./, (c) => c.toUpperCase())
  if (days < -1 && days > -7) return `Il y a ${-days} jours`
  return dateFmt.format(ts)
}

/** Countdown for an upcoming airing, in seconds-since-epoch. */
export function countdown(airingAtSeconds: number): string {
  const delta = airingAtSeconds * 1000 - Date.now()
  if (delta <= 0) return 'Disponible'
  const mins = Math.floor(delta / 60_000)
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  if (days > 0) return `dans ${days} j ${hours} h`
  if (hours > 0) return `dans ${hours} h ${mins % 60} min`
  return `dans ${mins} min`
}

/**
 * True when episode `n` has not been broadcast yet. `nextAiring.episode` is the
 * one still to come, so it and everything after it cannot have been watched.
 */
export function isUnaired(media: Pick<Media, 'nextAiring'>, n: number): boolean {
  return media.nextAiring !== null && n >= media.nextAiring.episode
}

/** Day and hour of an airing still to come: « Demain à 18:30 ». */
export function airingLabel(airingAtSeconds: number): string {
  const ms = airingAtSeconds * 1000
  return `${relativeDay(ms)} à ${formatTime(ms)}`
}

export function scoreLabel(score: number | null): string {
  return score === null ? '—' : score.toFixed(1).replace('.', ',').replace(/,0$/, '')
}

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function pluralize(count: number, one: string, many: string): string {
  return `${num(count)} ${count > 1 ? many : one}`
}

const SEASON_ORDER: SeasonName[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL']

export function currentSeasonOf(date = new Date()): { season: SeasonName; year: number } {
  return { season: SEASON_ORDER[Math.floor((date.getMonth() / 12) * 4)], year: date.getFullYear() }
}

/** The next `count` seasons after the current one, for the upcoming schedule. */
export function seasonsAhead(count: number): { season: SeasonName; year: number; label: string }[] {
  const now = currentSeasonOf()
  let index = SEASON_ORDER.indexOf(now.season)
  let year = now.year
  const out: { season: SeasonName; year: number; label: string }[] = []
  for (let i = 0; i < count; i += 1) {
    index += 1
    if (index > 3) {
      index = 0
      year += 1
    }
    const season = SEASON_ORDER[index]
    out.push({ season, year, label: seasonLabel(season, year) })
  }
  return out
}

const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })

/** « septembre 2026 », capitale en tête comme un titre. */
export function monthLabel(date: Date): string {
  return monthFmt.format(date).replace(/^./, (c) => c.toUpperCase())
}

export interface Premiere {
  year: number | null
  month: number | null
  day: number | null
}

/**
 * The date that matters for the upcoming schedule. A split cour returning from a
 * break is still RELEASING and its startDate is months in the past, so the next
 * episode's air date is what should place it on the calendar.
 */
export function premiereOf(media: Pick<Media, 'status' | 'startDate' | 'nextAiring'>): Premiere | null {
  if (media.status === 'RELEASING' && media.nextAiring) {
    const d = new Date(media.nextAiring.airingAt * 1000)
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
  }
  return media.startDate ?? null
}

/** Sortable month bucket. A known year with no month lands at the end of that year. */
export function monthBucket(start: Premiere | null | undefined): { key: number; label: string } {
  if (!start?.year) return { key: Number.MAX_SAFE_INTEGER, label: 'Date à confirmer' }
  if (!start.month) return { key: start.year * 100 + 99, label: `Courant ${start.year}` }
  const label = monthFmt.format(new Date(start.year, start.month - 1, 1))
  return { key: start.year * 100 + start.month, label: label.charAt(0).toUpperCase() + label.slice(1) }
}

export function premiereLabel(start: Premiere | null | undefined): string {
  if (!start?.year) return 'Date à confirmer'
  if (!start.month) return String(start.year)
  if (!start.day) return monthFmt.format(new Date(start.year, start.month - 1, 1))
  return dateFmt.format(new Date(start.year, start.month - 1, start.day))
}

/** Sort key inside a month: known days first, then unknown. */
export function premiereSort(start: Premiere | null | undefined): number {
  if (!start?.year) return Number.MAX_SAFE_INTEGER
  if (!start.month) return start.year * 10000 + 9999
  return start.year * 10000 + start.month * 100 + (start.day ?? 99)
}
