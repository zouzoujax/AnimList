import {
  Activity,
  Anchor,
  Archive,
  Atom,
  Award,
  Ban,
  Bed,
  Bookmark,
  Boxes,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChartColumn,
  CheckCheck,
  Clapperboard,
  Clock,
  Compass,
  Crown,
  Database,
  Diamond,
  Dices,
  Drum,
  Eye,
  Factory,
  Feather,
  Film,
  Fish,
  Flame,
  Flower2,
  FolderHeart,
  Footprints,
  Gamepad2,
  Gauge,
  Gem,
  Ghost,
  Globe,
  Heart,
  HeartHandshake,
  History,
  Hourglass,
  Layers,
  Leaf,
  Library,
  ListTodo,
  Magnet,
  Medal,
  Megaphone,
  Milestone,
  Moon,
  Mountain,
  NotebookPen,
  Orbit,
  Package,
  Palette,
  Pencil,
  PenLine,
  Play,
  Popcorn,
  Puzzle,
  Radio,
  Repeat,
  Rocket,
  RotateCcw,
  Ruler,
  Scale,
  Shuffle,
  Skull,
  Smartphone,
  Snail,
  Snowflake,
  Sparkles,
  Split,
  Sprout,
  Star,
  Sun,
  Sunrise,
  Swords,
  Target,
  Tent,
  ThumbsDown,
  Ticket,
  Timer,
  Tornado,
  Trash2,
  TreePine,
  TrendingUp,
  Trophy,
  Tv,
  Umbrella,
  Undo2,
  Users,
  Warehouse,
  Waves,
  Wifi,
  Wind,
  Zap,
  Infinity as InfinityIcon
} from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { GENRE_LABELS, type Media } from '@shared/types'
import { ActivityHeatmap, MonthlyColumns, RankedBars, StatTile, type DayCount } from '@/components/Charts'
import { EmptyState, Poster, RowScroller, Section } from '@/components/ui'
import { rgba } from '@/lib/color'
import { dayLabel, durationParts, hoursOf, minutesToHuman, num, startOfDay, titleOf } from '@/lib/format'
import { useApp } from '@/store/app'

const DAY_MS = 86_400_000

function yearGrid(year: number, counts: Map<number, number>): DayCount[] {
  const first = new Date(year, 0, 1)
  const start = new Date(first)
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7)) // back to Monday
  const end = new Date(year, 11, 31)
  const last = new Date(end)
  last.setDate(end.getDate() + ((7 - ((end.getDay() + 6) % 7) - 1) % 7)) // forward to Sunday

  const days: DayCount[] = []
  for (let t = start.getTime(); t <= last.getTime(); t += DAY_MS) {
    const date = startOfDay(t)
    days.push({ date, count: counts.get(date) ?? 0 })
  }
  return days
}

function streaksOf(dayKeys: number[]): { current: number; best: number } {
  if (!dayKeys.length) return { current: 0, best: 0 }
  const sorted = [...dayKeys].sort((a, b) => a - b)
  let best = 1
  let run = 1
  for (let i = 1; i < sorted.length; i += 1) {
    run = sorted[i] - sorted[i - 1] === DAY_MS ? run + 1 : 1
    best = Math.max(best, run)
  }

  const today = startOfDay(Date.now())
  const latest = sorted[sorted.length - 1]
  if (latest !== today && latest !== today - DAY_MS) return { current: 0, best }

  let current = 1
  for (let i = sorted.length - 1; i > 0; i -= 1) {
    if (sorted[i] - sorted[i - 1] !== DAY_MS) break
    current += 1
  }
  return { current, best }
}

interface Badge {
  id: string
  label: string
  hint: string
  icon: typeof Trophy
  /** 1 or more means unlocked; below that it drives the progress bar. */
  progress: number
  group: string
}

const BADGE_GROUPS = ['Volume', 'Assiduité', 'Exploits', 'Collection', 'Curiosité', 'Critique', 'Époques'] as const

function BadgeCard({ badge, index }: { badge: Badge; index: number }): React.JSX.Element {
  const accent = useApp((s) => s.prefs.accent)
  const done = badge.progress >= 1
  const pct = Math.min(1, Math.max(0, badge.progress))
  const Icon = badge.icon

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: Math.min(index * 0.02, 0.3) }}
      className="glass relative overflow-hidden rounded-[16px] p-3.5 text-center"
      style={done ? { borderColor: rgba(accent, 0.45), background: rgba(accent, 0.1) } : undefined}
      title={done ? `Débloqué — ${badge.hint}` : `${Math.round(pct * 100)} % — ${badge.hint}`}
    >
      <div
        className="mx-auto mb-2 grid h-11 w-11 place-items-center rounded-full"
        style={{
          background: done ? `linear-gradient(140deg, ${accent}, var(--accent-2))` : 'rgba(255,255,255,.05)',
          color: done ? '#07080f' : 'var(--color-faint)',
          boxShadow: done ? `0 0 24px -6px ${rgba(accent, 0.9)}` : 'none'
        }}
      >
        <Icon size={19} />
      </div>
      <p className="text-[0.78rem] font-semibold">{badge.label}</p>
      <p className="mt-0.5 text-[0.66rem] leading-snug text-faint">{badge.hint}</p>
      {!done && (
        <div className="mx-auto mt-2 h-1 w-3/4 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: accent }} />
        </div>
      )}
    </motion.div>
  )
}

export default function StatsPage(): React.JSX.Element {
  const events = useApp((s) => s.events)
  const entries = useApp((s) => s.entries)
  const mediaMap = useApp((s) => s.media)
  const lang = useApp((s) => s.prefs.titleLang)
  const accent = useApp((s) => s.prefs.accent)
  const navigate = useApp((s) => s.navigate)
  const listCount = useApp((s) => s.lists.length)
  const watchedMap = useApp((s) => s.watched)
  const defaultRuntime = useApp((s) => s.prefs.defaultRuntime)

  const stats = useMemo(() => {
    const perDay = new Map<number, number>()
    const perGenre = new Map<string, number>()
    const perStudio = new Map<string, number>()
    const perYear = new Map<number, number>()
    let minutes = 0
    /**
     * Les minutes réellement vécues dans l'app.
     *
     * `minutes` compte tout, imports compris ; `perDay` ne compte que ce qui a
     * été coché ici. Diviser l'un par l'autre mélange deux populations et
     * donne un rythme absurde — 268 heures par jour sur une bibliothèque
     * importée. Toute vitesse doit se calculer sur cette valeur-ci.
     */
    let livedMinutes = 0
    let importedCount = 0

    for (const ev of events) {
      // Totals and breakdowns count everything; anything keyed on a date only
      // counts episodes actually ticked in this app.
      minutes += ev.minutes
      if (ev.imported) importedCount += 1
      else {
        livedMinutes += ev.minutes
        const day = startOfDay(ev.at)
        const year = new Date(ev.at).getFullYear()
        perDay.set(day, (perDay.get(day) ?? 0) + 1)
        perYear.set(year, (perYear.get(year) ?? 0) + 1)
      }

      const media = mediaMap.get(ev.animeId)
      if (!media) continue
      for (const g of media.genres) perGenre.set(g, (perGenre.get(g) ?? 0) + 1)
      for (const s of media.studios.slice(0, 1)) perStudio.set(s, (perStudio.get(s) ?? 0) + 1)
    }

    const list = [...entries.values()]
    const scored = list.filter((e) => e.score !== null)
    const streaks = streaksOf([...perDay.keys()])

    // Habits, only from episodes actually ticked here — imported rows carry the
    // date they were checked off elsewhere, so their hour of day means nothing.
    let night = 0
    let weekend = 0
    for (const ev of events) {
      if (ev.imported) continue
      const d = new Date(ev.at)
      if (d.getHours() < 5) night += 1
      if (d.getDay() === 0 || d.getDay() === 6) weekend += 1
    }

    // Moods and notes come from two places: the series as a whole, and each
    // individual viewing.
    const emotionsUsed = new Set<string>()
    let notes = 0
    for (const ev of events) {
      for (const emotion of ev.emotions ?? []) emotionsUsed.add(emotion)
      if (ev.note?.trim()) notes += 1
    }
    let favorites = 0
    let rewatches = 0
    let movies = 0
    let longDone = 0
    let perfect = 0
    let dropped = 0
    for (const entry of list) {
      for (const emotion of entry.emotions) emotionsUsed.add(emotion)
      if (entry.notes.trim()) notes += 1
      if (entry.favorite) favorites += 1
      if (entry.score === 10) perfect += 1
      if (entry.status === 'dropped') dropped += 1
      rewatches += entry.rewatches
      const media = mediaMap.get(entry.animeId)
      if (entry.status === 'completed' && media) {
        if (media.format === 'MOVIE') movies += 1
        if ((media.episodes ?? 0) >= 100) longDone += 1
      }
    }

    // Habitudes fines : heure creuse, jour de semaine, mois de l'année, et les
    // records d'une seule journée. Toujours sans les épisodes importés, dont la
    // date vient d'une autre app et ne dit rien de l'heure à laquelle on
    // regardait.
    const weekdays = new Set<number>()
    const months = new Set<number>()
    const minutesPerDay = new Map<number, number>()
    const titlesPerDay = new Map<number, Set<number>>()
    const perTitleDay = new Map<string, number>()
    let morning = 0
    for (const ev of events) {
      if (ev.imported) continue
      const d = new Date(ev.at)
      const day = startOfDay(ev.at)
      weekdays.add(d.getDay())
      months.add(d.getMonth())
      if (d.getHours() >= 5 && d.getHours() < 9) morning += 1
      minutesPerDay.set(day, (minutesPerDay.get(day) ?? 0) + ev.minutes)
      let seen = titlesPerDay.get(day)
      if (!seen) titlesPerDay.set(day, (seen = new Set()))
      seen.add(ev.animeId)
      const key = `${day}:${ev.animeId}`
      perTitleDay.set(key, (perTitleDay.get(key) ?? 0) + 1)
    }

    // Ce que la bibliothèque couvre : époques, saisons de diffusion, formats,
    // et les deux extrêmes de la popularité AniList.
    const releaseYears = new Set<number>()
    const decades = new Set<number>()
    const airSeasons = new Set<string>()
    let oldest = Number.POSITIVE_INFINITY
    let shortForm = 0
    let confidential = 0
    let mainstream = 0
    let planned = 0
    let harsh = 0
    let contrarian = 0
    let fastFinish = 0
    for (const entry of list) {
      const media = mediaMap.get(entry.animeId)
      if (entry.status === 'planned') planned += 1
      if (entry.score !== null && entry.score <= 3) harsh += 1
      if (!media) continue
      if (media.seasonYear) {
        releaseYears.add(media.seasonYear)
        decades.add(Math.floor(media.seasonYear / 10) * 10)
        oldest = Math.min(oldest, media.seasonYear)
      }
      if (media.season) airSeasons.add(media.season)
      if (media.popularity < 5_000) confidential += 1
      if (media.popularity > 300_000) mainstream += 1
      // Un écart de 25 points entre la note donnée (sur 10) et la moyenne
      // AniList (sur 100) : deux avis qui ne parlent pas de la même série.
      if (
        entry.score !== null &&
        media.averageScore !== null &&
        Math.abs(entry.score * 10 - media.averageScore) >= 25
      ) {
        contrarian += 1
      }
      if (entry.status !== 'completed') continue
      if ((media.duration ?? 99) <= 10) shortForm += 1
      if (
        entry.startedAt !== null &&
        entry.finishedAt !== null &&
        (media.episodes ?? 0) >= 12 &&
        entry.finishedAt - entry.startedAt <= DAY_MS
      ) {
        fastFinish += 1
      }
    }

    const peak = (values: Iterable<number>): number => {
      let out = 0
      for (const v of values) out = Math.max(out, v)
      return out
    }

    return {
      minutes,
      livedMinutes,
      episodes: events.length,
      importedCount,
      perDay,
      perYear,
      activeDays: perDay.size,
      bestDay: perDay.size ? Math.max(...perDay.values()) : 0,
      completed: list.filter((e) => e.status === 'completed').length,
      watching: list.filter((e) => e.status === 'watching').length,
      tracked: list.length,
      meanScore: scored.length ? scored.reduce((sum, e) => sum + (e.score ?? 0), 0) / scored.length : null,
      scoredCount: scored.length,
      genres: [...perGenre.entries()].sort((a, b) => b[1] - a[1]),
      studios: [...perStudio.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7),
      studioCount: perStudio.size,
      streaks,
      night,
      weekend,
      emotionsUsed: emotionsUsed.size,
      notes,
      favorites,
      rewatches,
      movies,
      longDone,
      perfect,
      dropped,

      morning,
      weekdays: weekdays.size,
      months: months.size,
      bestDayMinutes: peak(minutesPerDay.values()),
      bestTitleDay: peak(perTitleDay.values()),
      bestVariety: peak([...titlesPerDay.values()].map((set) => set.size)),
      startedTitles: new Set(events.map((ev) => ev.animeId)).size,
      topGenre: peak(perGenre.values()),
      topStudio: peak(perStudio.values()),
      releaseYears: releaseYears.size,
      decades,
      airSeasons,
      oldest,
      shortForm,
      confidential,
      mainstream,
      planned,
      scoresUsed: new Set(scored.map((e) => e.score)).size,
      harsh,
      contrarian,
      fastFinish
    }
  }, [events, entries, mediaMap])

  const years = useMemo(() => {
    const list = [...stats.perYear.keys()].sort((a, b) => b - a)
    return list.length ? list : [new Date().getFullYear()]
  }, [stats.perYear])

  const [year, setYear] = useState(years[0])
  const activeYear = years.includes(year) ? year : years[0]

  const heatDays = useMemo(() => yearGrid(activeYear, stats.perDay), [activeYear, stats.perDay])

  const monthly = useMemo(() => {
    const buckets = Array.from({ length: 12 }, () => 0)
    for (const ev of events) {
      if (ev.imported) continue
      const d = new Date(ev.at)
      if (d.getFullYear() === activeYear) buckets[d.getMonth()] += ev.minutes
    }
    return buckets.map((mins, i) => ({
      label: new Date(activeYear, i, 1).toLocaleDateString('fr-FR', { month: 'narrow' }),
      value: hoursOf(mins),
      detail: `${new Date(activeYear, i, 1).toLocaleDateString('fr-FR', { month: 'long' })} · ${minutesToHuman(mins)}`
    }))
  }, [events, activeYear])

  const topRated = useMemo(() => {
    return [...entries.values()]
      .filter((e) => e.score !== null)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 14)
      .map((e) => ({ entry: e, media: mediaMap.get(e.animeId) }))
      .filter((row): row is { entry: (typeof row)['entry']; media: Media } => !!row.media)
  }, [entries, mediaMap])

  const badges = useMemo<Badge[]>(() => {
    const hours = stats.minutes / 60
    const days = stats.minutes / 1440
    return [
      // ---- Volume : nombre d'épisodes et temps cumulé
      {
        group: 'Volume',
        id: 'first',
        label: 'Premier pas',
        hint: '1 épisode coché',
        icon: Sparkles,
        progress: stats.episodes
      },
      {
        group: 'Volume',
        id: 'c10',
        label: 'Mise en route',
        hint: '10 épisodes',
        icon: Play,
        progress: stats.episodes / 10
      },
      {
        group: 'Volume',
        id: 'c100',
        label: 'Centurion',
        hint: '100 épisodes',
        icon: Medal,
        progress: stats.episodes / 100
      },
      {
        group: 'Volume',
        id: 'c500',
        label: 'Vétéran',
        hint: '500 épisodes',
        icon: Swords,
        progress: stats.episodes / 500
      },
      {
        group: 'Volume',
        id: 'c1000',
        label: 'Millénaire',
        hint: '1 000 épisodes',
        icon: Crown,
        progress: stats.episodes / 1000
      },
      {
        group: 'Volume',
        id: 'c2500',
        label: 'Insatiable',
        hint: '2 500 épisodes',
        icon: Orbit,
        progress: stats.episodes / 2500
      },
      {
        group: 'Volume',
        id: 'c5000',
        label: 'Sans fond',
        hint: '5 000 épisodes',
        icon: Atom,
        progress: stats.episodes / 5000
      },
      { group: 'Volume', id: 'h10', label: 'Première soirée', hint: '10 heures', icon: Clock, progress: hours / 10 },
      { group: 'Volume', id: 'h100', label: 'Otaku confirmé', hint: '100 heures', icon: Timer, progress: hours / 100 },
      { group: 'Volume', id: 'h500', label: 'Légende', hint: '500 heures', icon: Trophy, progress: hours / 500 },
      {
        group: 'Volume',
        id: 'd30',
        label: 'Un mois d’écran',
        hint: '30 jours cumulés',
        icon: Hourglass,
        progress: days / 30
      },
      {
        group: 'Volume',
        id: 'c7500',
        label: 'Sans limite',
        hint: '7 500 épisodes',
        icon: InfinityIcon,
        progress: stats.episodes / 7500
      },
      {
        group: 'Volume',
        id: 'h1000',
        label: 'Le millier d’heures',
        hint: '1 000 heures',
        icon: Mountain,
        progress: hours / 1000
      },
      {
        group: 'Volume',
        id: 'd100',
        label: 'Cent jours d’écran',
        hint: '100 jours cumulés',
        icon: Tent,
        progress: days / 100
      },
      {
        group: 'Volume',
        id: 'seen100',
        label: 'Cent titres entamés',
        hint: '100 séries commencées',
        icon: Footprints,
        progress: stats.startedTitles / 100
      },

      // ---- Assiduité : régularité dans le temps
      {
        group: 'Assiduité',
        id: 'streak3',
        label: 'Trois d’affilée',
        hint: '3 jours de suite',
        icon: Activity,
        progress: stats.streaks.best / 3
      },
      {
        group: 'Assiduité',
        id: 'streak7',
        label: 'Régulier',
        hint: '7 jours de suite',
        icon: Flame,
        progress: stats.streaks.best / 7
      },
      {
        group: 'Assiduité',
        id: 'streak14',
        label: 'Rituel',
        hint: '14 jours de suite',
        icon: CalendarCheck,
        progress: stats.streaks.best / 14
      },
      {
        group: 'Assiduité',
        id: 'streak30',
        label: 'Increvable',
        hint: '30 jours de suite',
        icon: Rocket,
        progress: stats.streaks.best / 30
      },
      {
        group: 'Assiduité',
        id: 'streak100',
        label: 'Métronome',
        hint: '100 jours de suite',
        icon: Gauge,
        progress: stats.streaks.best / 100
      },
      {
        group: 'Assiduité',
        id: 'days50',
        label: 'Habitué',
        hint: '50 jours actifs',
        icon: CalendarDays,
        progress: stats.activeDays / 50
      },
      {
        group: 'Assiduité',
        id: 'weekend',
        label: 'Roi du week-end',
        hint: '50 épisodes un samedi ou dimanche',
        icon: Popcorn,
        progress: stats.weekend / 50
      },
      {
        group: 'Assiduité',
        id: 'night',
        label: 'Noctambule',
        hint: '25 épisodes entre minuit et 5 h',
        icon: Moon,
        progress: stats.night / 25
      },
      {
        group: 'Assiduité',
        id: 'streak50',
        label: 'Inébranlable',
        hint: '50 jours de suite',
        icon: Anchor,
        progress: stats.streaks.best / 50
      },
      {
        group: 'Assiduité',
        id: 'streak365',
        label: 'Une année sans faute',
        hint: '365 jours de suite',
        icon: Sun,
        progress: stats.streaks.best / 365
      },
      {
        group: 'Assiduité',
        id: 'days100',
        label: 'Cent jours actifs',
        hint: '100 jours actifs',
        icon: Sprout,
        progress: stats.activeDays / 100
      },
      {
        group: 'Assiduité',
        id: 'days365',
        label: 'Une année d’activité',
        hint: '365 jours actifs',
        icon: TreePine,
        progress: stats.activeDays / 365
      },
      {
        group: 'Assiduité',
        id: 'morning',
        label: 'Lève-tôt',
        hint: '50 épisodes entre 5 h et 9 h',
        icon: Sunrise,
        progress: stats.morning / 50
      },
      {
        group: 'Assiduité',
        id: 'weekdays',
        label: 'Semaine complète',
        hint: 'regarder les 7 jours de la semaine',
        icon: CalendarRange,
        progress: stats.weekdays / 7
      },
      {
        group: 'Assiduité',
        id: 'months',
        label: 'Les douze mois',
        hint: 'regarder pendant les 12 mois de l’année',
        icon: CalendarClock,
        progress: stats.months / 12
      },

      // ---- Exploits : performances sur une journée
      {
        group: 'Exploits',
        id: 'marathon5',
        label: 'Petite série',
        hint: '5 épisodes en un jour',
        icon: Zap,
        progress: stats.bestDay / 5
      },
      {
        group: 'Exploits',
        id: 'marathon12',
        label: 'Un cour d’un coup',
        hint: '12 épisodes en un jour',
        icon: Layers,
        progress: stats.bestDay / 12
      },
      {
        group: 'Exploits',
        id: 'marathon25',
        label: 'Nuit blanche',
        hint: '25 épisodes en un jour',
        icon: Ghost,
        progress: stats.bestDay / 25
      },
      {
        group: 'Exploits',
        id: 'marathon50',
        label: 'Hors catégorie',
        hint: '50 épisodes en un jour',
        icon: Rocket,
        progress: stats.bestDay / 50
      },
      {
        group: 'Exploits',
        id: 'long1',
        label: 'Le souffle long',
        hint: 'terminer une série de 100+ épisodes',
        icon: Snail,
        progress: stats.longDone
      },
      {
        group: 'Exploits',
        id: 'long3',
        label: 'Fleuve tranquille',
        hint: '3 séries de 100+ épisodes',
        icon: Undo2,
        progress: stats.longDone / 3
      },
      {
        group: 'Exploits',
        id: 'rewatch',
        label: 'Encore une fois',
        hint: 'un visionnage répété',
        icon: Repeat,
        progress: stats.rewatches
      },
      {
        group: 'Exploits',
        id: 'marathon75',
        label: 'Démesure',
        hint: '75 épisodes en un jour',
        icon: Tornado,
        progress: stats.bestDay / 75
      },
      {
        group: 'Exploits',
        id: 'day8h',
        label: 'Journée pleine',
        hint: '8 heures en une seule journée',
        icon: Bed,
        progress: stats.bestDayMinutes / 480
      },
      {
        group: 'Exploits',
        id: 'day12h',
        label: 'Sans dormir',
        hint: '12 heures en une seule journée',
        icon: Skull,
        progress: stats.bestDayMinutes / 720
      },
      {
        group: 'Exploits',
        id: 'binge12',
        label: 'D’une traite',
        hint: '12 épisodes de la même série en un jour',
        icon: Drum,
        progress: stats.bestTitleDay / 12
      },
      {
        group: 'Exploits',
        id: 'variety5',
        label: 'Zappeur',
        hint: '5 séries différentes en un jour',
        icon: Shuffle,
        progress: stats.bestVariety / 5
      },
      {
        group: 'Exploits',
        id: 'fastFinish',
        label: 'Avalée en un jour',
        hint: 'finir une série de 12+ épisodes en 24 h',
        icon: Wind,
        progress: stats.fastFinish
      },
      {
        group: 'Exploits',
        id: 'long5',
        label: 'Marathonien',
        hint: '5 séries de 100+ épisodes',
        icon: Waves,
        progress: stats.longDone / 5
      },
      {
        group: 'Exploits',
        id: 'rewatch10',
        label: 'Éternel retour',
        hint: '10 revisionnages',
        icon: RotateCcw,
        progress: stats.rewatches / 10
      },

      // ---- Collection : taille et forme de la bibliothèque
      {
        group: 'Collection',
        id: 'done1',
        label: 'Générique de fin',
        hint: '1 série terminée',
        icon: CheckCheck,
        progress: stats.completed
      },
      {
        group: 'Collection',
        id: 'done10',
        label: 'Complétiste',
        hint: '10 séries terminées',
        icon: Award,
        progress: stats.completed / 10
      },
      {
        group: 'Collection',
        id: 'done50',
        label: 'Archiviste',
        hint: '50 séries terminées',
        icon: Archive,
        progress: stats.completed / 50
      },
      {
        group: 'Collection',
        id: 'done100',
        label: 'Bibliothécaire',
        hint: '100 séries terminées',
        icon: Boxes,
        progress: stats.completed / 100
      },
      {
        group: 'Collection',
        id: 'lib50',
        label: 'Collectionneur',
        hint: '50 titres suivis',
        icon: Gem,
        progress: stats.tracked / 50
      },
      {
        group: 'Collection',
        id: 'lib250',
        label: 'Conservateur',
        hint: '250 titres suivis',
        icon: Database,
        progress: stats.tracked / 250
      },
      {
        group: 'Collection',
        id: 'fav20',
        label: 'Cœur tendre',
        hint: '20 favoris',
        icon: Heart,
        progress: stats.favorites / 20
      },
      {
        group: 'Collection',
        id: 'movies10',
        label: 'Cinéphile',
        hint: '10 films terminés',
        icon: Clapperboard,
        progress: stats.movies / 10
      },
      {
        group: 'Collection',
        id: 'done25',
        label: 'Bon élève',
        hint: '25 séries terminées',
        icon: Bookmark,
        progress: stats.completed / 25
      },
      {
        group: 'Collection',
        id: 'done250',
        label: 'Rayonnage complet',
        hint: '250 séries terminées',
        icon: Library,
        progress: stats.completed / 250
      },
      {
        group: 'Collection',
        id: 'lib100',
        label: 'Étagère pleine',
        hint: '100 titres suivis',
        icon: Package,
        progress: stats.tracked / 100
      },
      {
        group: 'Collection',
        id: 'lib500',
        label: 'Entrepôt',
        hint: '500 titres suivis',
        icon: Warehouse,
        progress: stats.tracked / 500
      },
      {
        group: 'Collection',
        id: 'fav50',
        label: 'Grand cœur',
        hint: '50 favoris',
        icon: HeartHandshake,
        progress: stats.favorites / 50
      },
      {
        group: 'Collection',
        id: 'movies1',
        label: 'Séance unique',
        hint: '1 film terminé',
        icon: Film,
        progress: stats.movies
      },
      {
        group: 'Collection',
        id: 'movies25',
        label: 'Salle obscure',
        hint: '25 films terminés',
        icon: Ticket,
        progress: stats.movies / 25
      },
      {
        group: 'Collection',
        id: 'backlog50',
        label: 'Pile à voir',
        hint: '50 titres en attente',
        icon: ListTodo,
        progress: stats.planned / 50
      },
      {
        group: 'Collection',
        id: 'lists3',
        label: 'Rangement',
        hint: '3 listes personnalisées',
        icon: FolderHeart,
        progress: listCount / 3
      },
      {
        group: 'Collection',
        id: 'shortForm',
        label: 'Format court',
        hint: '10 séries de moins de 10 min terminées',
        icon: Feather,
        progress: stats.shortForm / 10
      },

      // ---- Curiosité : diversité de ce qui est regardé
      {
        group: 'Curiosité',
        id: 'genres5',
        label: 'Touche-à-tout',
        hint: '5 genres différents',
        icon: Dices,
        progress: stats.genres.length / 5
      },
      {
        group: 'Curiosité',
        id: 'genres10',
        label: 'Explorateur',
        hint: '10 genres différents',
        icon: Target,
        progress: stats.genres.length / 10
      },
      {
        group: 'Curiosité',
        id: 'genresAll',
        label: 'Sans préjugé',
        hint: 'les 18 genres',
        icon: Globe,
        progress: stats.genres.length / 18
      },
      {
        group: 'Curiosité',
        id: 'studios10',
        label: 'Œil averti',
        hint: '10 studios différents',
        icon: Eye,
        progress: stats.studioCount / 10
      },
      {
        group: 'Curiosité',
        id: 'studios25',
        label: 'Connaisseur',
        hint: '25 studios différents',
        icon: Users,
        progress: stats.studioCount / 25
      },
      {
        group: 'Curiosité',
        id: 'genres15',
        label: 'Sans frontière',
        hint: '15 genres différents',
        icon: Compass,
        progress: stats.genres.length / 15
      },
      {
        group: 'Curiosité',
        id: 'studios50',
        label: 'Carte des studios',
        hint: '50 studios différents',
        icon: Factory,
        progress: stats.studioCount / 50
      },
      {
        group: 'Curiosité',
        id: 'studioFan',
        label: 'Maison de confiance',
        hint: '250 épisodes d’un même studio',
        icon: Magnet,
        progress: stats.topStudio / 250
      },
      {
        group: 'Curiosité',
        id: 'genreFan',
        label: 'Genre de prédilection',
        hint: '500 épisodes d’un même genre',
        icon: Puzzle,
        progress: stats.topGenre / 500
      },
      {
        group: 'Curiosité',
        id: 'confidential',
        label: 'Hors des sentiers',
        hint: 'suivre un titre de moins de 5 000 membres',
        icon: Fish,
        progress: stats.confidential
      },
      {
        group: 'Curiosité',
        id: 'mainstream',
        label: 'Grand public',
        hint: 'suivre un titre de plus de 300 000 membres',
        icon: Megaphone,
        progress: stats.mainstream
      },

      // ---- Critique : notes, ressentis, notes écrites
      {
        group: 'Critique',
        id: 'rate1',
        label: 'Premier avis',
        hint: '1 note donnée',
        icon: Star,
        progress: stats.scoredCount
      },
      {
        group: 'Critique',
        id: 'rate25',
        label: 'Critique',
        hint: '25 notes données',
        icon: TrendingUp,
        progress: stats.scoredCount / 25
      },
      {
        group: 'Critique',
        id: 'rate100',
        label: 'Jury',
        hint: '100 notes données',
        icon: Trophy,
        progress: stats.scoredCount / 100
      },
      {
        group: 'Critique',
        id: 'perfect',
        label: 'Chef-d’œuvre',
        hint: 'mettre un 10/10',
        icon: Crown,
        progress: stats.perfect
      },
      {
        group: 'Critique',
        id: 'emotions',
        label: 'Palette complète',
        hint: 'utiliser les 8 ressentis',
        icon: Palette,
        progress: stats.emotionsUsed / 8
      },
      {
        group: 'Critique',
        id: 'notes10',
        label: 'Carnet de bord',
        hint: '10 fiches annotées',
        icon: Pencil,
        progress: stats.notes / 10
      },
      {
        group: 'Critique',
        id: 'dropped',
        label: 'Sans pitié',
        hint: 'abandonner 5 séries',
        icon: Ban,
        progress: stats.dropped / 5
      },
      {
        group: 'Critique',
        id: 'rate250',
        label: 'Grand jury',
        hint: '250 notes données',
        icon: Scale,
        progress: stats.scoredCount / 250
      },
      {
        group: 'Critique',
        id: 'scale',
        label: 'Toute la gamme',
        hint: 'utiliser les 10 notes',
        icon: Ruler,
        progress: stats.scoresUsed / 10
      },
      {
        group: 'Critique',
        id: 'perfect5',
        label: 'Panthéon',
        hint: '5 notes de 10/10',
        icon: Diamond,
        progress: stats.perfect / 5
      },
      {
        group: 'Critique',
        id: 'harsh',
        label: 'Verdict sévère',
        hint: 'mettre 3/10 ou moins',
        icon: ThumbsDown,
        progress: stats.harsh
      },
      {
        group: 'Critique',
        id: 'contrarian',
        label: 'À contre-courant',
        hint: 's’écarter de 25 points de la note AniList',
        icon: Split,
        progress: stats.contrarian
      },
      {
        group: 'Critique',
        id: 'notes1',
        label: 'Première ligne',
        hint: '1 fiche annotée',
        icon: PenLine,
        progress: stats.notes
      },
      {
        group: 'Critique',
        id: 'notes50',
        label: 'Journal intime',
        hint: '50 fiches annotées',
        icon: NotebookPen,
        progress: stats.notes / 50
      },
      {
        group: 'Critique',
        id: 'dropped25',
        label: 'Tri sans état d’âme',
        hint: '25 abandons',
        icon: Trash2,
        progress: stats.dropped / 25
      },

      // ---- Époques : les années que la bibliothèque traverse
      {
        group: 'Époques',
        id: 'era80',
        label: 'Avant la couleur',
        hint: 'un titre d’avant 1990',
        icon: Radio,
        progress: stats.oldest < 1990 ? 1 : 0
      },
      {
        group: 'Époques',
        id: 'era90',
        label: 'Années 1990',
        hint: 'un titre des années 1990',
        icon: Tv,
        progress: stats.decades.has(1990) ? 1 : 0
      },
      {
        group: 'Époques',
        id: 'era2000',
        label: 'Années 2000',
        hint: 'un titre des années 2000',
        icon: Gamepad2,
        progress: stats.decades.has(2000) ? 1 : 0
      },
      {
        group: 'Époques',
        id: 'era2010',
        label: 'Années 2010',
        hint: 'un titre des années 2010',
        icon: Smartphone,
        progress: stats.decades.has(2010) ? 1 : 0
      },
      {
        group: 'Époques',
        id: 'era2020',
        label: 'Années 2020',
        hint: 'un titre des années 2020',
        icon: Wifi,
        progress: stats.decades.has(2020) ? 1 : 0
      },
      {
        group: 'Époques',
        id: 'decades4',
        label: 'Traversée du temps',
        hint: '4 décennies différentes',
        icon: Milestone,
        progress: stats.decades.size / 4
      },
      {
        group: 'Époques',
        id: 'years25',
        label: 'Vingt-cinq millésimes',
        hint: '25 années de sortie différentes',
        icon: History,
        progress: stats.releaseYears / 25
      },
      {
        group: 'Époques',
        id: 'winter',
        label: 'Hiver',
        hint: 'un titre de la saison d’hiver',
        icon: Snowflake,
        progress: stats.airSeasons.has('WINTER') ? 1 : 0
      },
      {
        group: 'Époques',
        id: 'spring',
        label: 'Printemps',
        hint: 'un titre de la saison de printemps',
        icon: Flower2,
        progress: stats.airSeasons.has('SPRING') ? 1 : 0
      },
      {
        group: 'Époques',
        id: 'summer',
        label: 'Été',
        hint: 'un titre de la saison d’été',
        icon: Umbrella,
        progress: stats.airSeasons.has('SUMMER') ? 1 : 0
      },
      {
        group: 'Époques',
        id: 'autumn',
        label: 'Automne',
        hint: 'un titre de la saison d’automne',
        icon: Leaf,
        progress: stats.airSeasons.has('FALL') ? 1 : 0
      }
    ]
  }, [stats, listCount])

  const [badgeFilter, setBadgeFilter] = useState<'all' | 'done' | 'todo'>('all')

  /**
   * Ce qui reste à voir, en temps.
   *
   * Un compte d'épisodes ne dit rien : douze épisodes de trois minutes et
   * douze de cinquante ne demandent pas la même soirée. La durée de chaque
   * série est connue ; à défaut, le réglage de durée par défaut sert de
   * repli, comme partout ailleurs dans l'app.
   *
   * Seuls les épisodes d'une série au total connu sont comptés : une saison en
   * cours sans nombre annoncé donnerait un chiffre inventé.
   */
  const backlog = useMemo(() => {
    const rows: { key: string; label: string; value: number; detail: string; status: string }[] = []
    let watchingMin = 0
    let plannedMin = 0

    for (const entry of entries.values()) {
      if (entry.status !== 'watching' && entry.status !== 'planned') continue
      const media = mediaMap.get(entry.animeId)
      const total = media?.episodes ?? 0
      if (!media || total <= 0) continue
      const seen = watchedMap.get(entry.animeId)?.size ?? 0
      const left = Math.max(0, total - seen)
      if (left === 0) continue

      const minutes = left * (media.duration || defaultRuntime)
      if (entry.status === 'watching') watchingMin += minutes
      else plannedMin += minutes

      rows.push({
        key: String(media.id),
        label: titleOf(media, lang),
        value: minutes,
        detail: `${left} épisode${left > 1 ? 's' : ''} · ${minutesToHuman(minutes)}`,
        status: entry.status
      })
    }

    rows.sort((a, b) => b.value - a.value)
    const total = watchingMin + plannedMin
    // Le rythme vient de tes journées actives, pas d'une moyenne sur l'année :
    // les jours sans rien regarder ne disent rien de ta vitesse.
    const perActiveDay = stats.activeDays ? stats.livedMinutes / stats.activeDays : 0
    return {
      rows,
      watchingMin,
      plannedMin,
      total,
      days: perActiveDay > 0 ? Math.ceil(total / perActiveDay) : null,
      perActiveDay: Math.round(perActiveDay),
      // Une moyenne sur trois journées n'est pas une vitesse de croisière. Le
      // dire vaut mieux que d'annoncer un nombre de jours avec assurance.
      thin: stats.activeDays > 0 && stats.activeDays < 7
    }
  }, [entries, mediaMap, watchedMap, defaultRuntime, lang, stats.activeDays, stats.livedMinutes])

  if (stats.episodes === 0) {
    return (
      <div className="mx-auto max-w-[900px] px-7 py-16">
        <EmptyState
          icon={<ChartColumn size={24} />}
          title="Aucune statistique pour l'instant"
          hint="Coche ton premier épisode et cette page se remplit : heures, séries de jours, genres, badges et graphiques année par année."
          action={
            <button className="btn btn-primary" onClick={() => navigate({ name: 'library' })}>
              Ouvrir ma bibliothèque
            </button>
          }
        />
      </div>
    )
  }

  const unlocked = badges.filter((b) => b.progress >= 1).length
  // « À faire » classe les plus proches d'abord : sur cent badges, la question
  // n'est pas lesquels manquent, c'est lequel est à portée.
  const shownBadges =
    badgeFilter === 'done'
      ? badges.filter((b) => b.progress >= 1)
      : badgeFilter === 'todo'
        ? badges.filter((b) => b.progress < 1).sort((a, b) => b.progress - a.progress)
        : badges
  const BADGE_FILTERS = [
    { id: 'all' as const, label: 'Tous', count: badges.length },
    { id: 'done' as const, label: 'Débloqués', count: unlocked },
    { id: 'todo' as const, label: 'À faire', count: badges.length - unlocked }
  ]

  return (
    <div className="page">
      <h1 className="title-xl mb-1 text-[1.85rem]">Statistiques</h1>
      <p className="mb-7 text-[0.85rem] text-muted">Tout est calculé en local, à partir de tes épisodes cochés.</p>

      {/* hero figure */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass relative mb-4 overflow-hidden rounded-[24px] px-7 py-7"
      >
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full opacity-30"
          style={{ background: `radial-gradient(circle, ${accent}, transparent 66%)`, filter: 'blur(50px)' }}
        />
        <p className="label">Temps de visionnage total</p>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-3">
          {durationParts(stats.minutes).map((part) => (
            <span key={part.unit} className="flex items-baseline gap-1.5">
              <span className="stat-num text-[4.2rem] leading-[0.92]">{part.value}</span>
              <span className="text-[1.35rem] font-semibold text-muted">{part.unit}</span>
            </span>
          ))}
        </p>
        <p className="mt-3 text-[0.85rem] text-muted">
          {num(stats.episodes)} épisodes · soit {(stats.minutes / 1440).toFixed(1).replace('.', ',')} jours complets
          devant l'écran.
        </p>
        {stats.importedCount > 0 && (
          <p className="mt-1.5 text-[0.76rem] text-faint">
            Dont {num(stats.importedCount)} épisodes importés, sans date de visionnage réelle : ils comptent dans les
            totaux, mais pas dans les graphiques ci-dessous.
          </p>
        )}
      </motion.div>

      <div className="mb-9 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Série en cours"
          value={dayLabel(stats.streaks.current)}
          hint={`Record : ${dayLabel(stats.streaks.best)} d'affilée`}
          icon={<Flame size={22} />}
          accentText
        />
        <StatTile
          label="Séries terminées"
          value={num(stats.completed)}
          hint={`${num(stats.watching)} en cours · ${num(stats.tracked)} suivies`}
          icon={<CheckCheck size={22} />}
        />
        <StatTile
          label="Ma note moyenne"
          value={stats.meanScore ? `${stats.meanScore.toFixed(1).replace('.', ',')}/10` : '—'}
          hint={`${num(stats.scoredCount)} titres notés`}
          icon={<Star size={22} />}
        />
        <StatTile
          label="Meilleure journée"
          value={`${num(stats.bestDay)} ép.`}
          hint={
            stats.importedCount > 0
              ? `${num(stats.activeDays)} jours actifs · hors import`
              : `${num(stats.activeDays)} jours actifs`
          }
          icon={<Clock size={22} />}
        />
      </div>

      {backlog.rows.length > 0 && (
        <Section
          title="Ce qu'il te reste"
          subtitle={
            backlog.days === null
              ? `${minutesToHuman(backlog.total)} en attente`
              : `${minutesToHuman(backlog.total)} en attente · environ ${backlog.days} jour${backlog.days > 1 ? 's' : ''} à ton rythme${backlog.thin ? ', sur trop peu de séances pour être fiable' : ''}`
          }
        >
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="En cours" value={minutesToHuman(backlog.watchingMin)} icon={<Hourglass size={15} />} />
            <StatTile label="Dans la pile" value={minutesToHuman(backlog.plannedMin)} icon={<ListTodo size={15} />} />
            <StatTile label="Séries concernées" value={num(backlog.rows.length)} icon={<Layers size={15} />} />
            <StatTile
              label="Ton rythme"
              value={`${num(backlog.perActiveDay)} min`}
              hint={`par journée où tu regardes · mesuré sur ${num(stats.activeDays)} journée${stats.activeDays > 1 ? 's' : ''}`}
              icon={<Gauge size={15} />}
            />
          </div>
          <RankedBars
            rows={backlog.rows.slice(0, 10)}
            suffix=""
            onSelect={(key) => navigate({ name: 'anime', id: Number(key) })}
          />
        </Section>
      )}

      <Section
        title="Activité"
        subtitle="Un carré par jour, plus c'est clair plus tu as regardé · épisodes cochés dans l'app"
        action={
          <div className="flex gap-1.5">
            {years.slice(0, 5).map((y) => (
              <button key={y} data-on={y === activeYear} className="chip" onClick={() => setYear(y)}>
                {y}
              </button>
            ))}
          </div>
        }
      >
        <div className="glass rounded-[20px] p-5">
          <ActivityHeatmap days={heatDays} />
          {stats.importedCount > 0 && stats.activeDays === 0 && (
            <p className="mt-3 text-[0.76rem] leading-snug text-faint">
              Encore vide : ta bibliothèque vient d'un import, et la source ne conserve pas la date à laquelle chaque
              épisode a été regardé. La grille se remplira au fil des épisodes que tu cocheras ici.
            </p>
          )}
        </div>
      </Section>

      <Section title={`Mois par mois · ${activeYear}`} subtitle="Heures de visionnage">
        <div className="glass rounded-[20px] p-5">
          <MonthlyColumns data={monthly} unit="Heures de visionnage par mois" />
        </div>
      </Section>

      <div className="mb-9 grid gap-4 lg:grid-cols-2">
        <div className="glass rounded-[20px] p-5">
          <h2 className="title-xl text-[1.05rem]">Genres les plus regardés</h2>
          <p className="mb-3.5 mt-0.5 text-[0.75rem] text-faint">Clique pour filtrer ta bibliothèque</p>
          <RankedBars
            rows={stats.genres
              .slice(0, 8)
              .map(([g, n]) => ({ key: g, label: GENRE_LABELS[g] ?? g, value: n, detail: 'ép.' }))}
            suffix="ép."
            onSelect={(g) => navigate({ name: 'library', genre: g })}
          />
        </div>
        <div className="glass rounded-[20px] p-5">
          <h2 className="title-xl text-[1.05rem]">Studios les plus vus</h2>
          <p className="mb-3.5 mt-0.5 text-[0.75rem] text-faint">Clique pour voir tout son catalogue</p>
          <RankedBars
            rows={stats.studios.map(([s, n]) => ({ key: s, label: s, value: n, detail: 'ép.' }))}
            suffix="ép."
            onSelect={(s) => navigate({ name: 'studio', studio: s })}
          />
        </div>
      </div>

      <Section
        id="badges"
        title="Badges"
        subtitle={`${unlocked} sur ${badges.length} débloqués`}
        action={
          <div className="flex shrink-0 gap-1.5">
            {BADGE_FILTERS.map((f) => (
              <button key={f.id} data-on={badgeFilter === f.id} className="chip" onClick={() => setBadgeFilter(f.id)}>
                {f.label}
                <span className="tabular-nums opacity-60">{f.count}</span>
              </button>
            ))}
          </div>
        }
      >
        <div className="flex flex-col gap-7">
          {shownBadges.length === 0 && (
            <p className="px-1 text-[0.82rem] text-muted">
              Aucun badge débloqué pour l'instant. Coche des épisodes et ils viendront.
            </p>
          )}
          {BADGE_GROUPS.map((group) => {
            const list = shownBadges.filter((b) => b.group === group)
            if (!list.length) return null
            // Le compte reste celui du groupe entier : filtrer l'affichage ne
            // doit pas changer ce que le groupe vaut.
            const whole = badges.filter((b) => b.group === group)
            const done = whole.filter((b) => b.progress >= 1).length
            return (
              <div key={group}>
                <header className="mb-3 flex items-center gap-3 px-1">
                  <h3 className="text-[0.92rem] font-semibold">{group}</h3>
                  <span className="text-[0.72rem] tabular-nums text-faint">
                    {done}/{whole.length}
                  </span>
                  <div className="hairline flex-1" />
                </header>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {list.map((badge, i) => (
                    <BadgeCard key={badge.id} badge={badge} index={i} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      {topRated.length > 0 && (
        <Section title="Mon panthéon" subtitle="Tes meilleures notes">
          <RowScroller>
            {topRated.map(({ entry, media }, i) => (
              <motion.button
                key={media.id}
                onClick={() => navigate({ name: 'anime', id: media.id })}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.025 }}
                whileHover={{ y: -4 }}
                className="w-[126px] shrink-0 text-left"
              >
                <div className="relative">
                  <Poster src={media.cover.xl} alt="" className="aspect-[2/3] w-full" />
                  <span
                    className="absolute -right-1.5 -top-1.5 grid h-8 w-8 place-items-center rounded-full text-[0.72rem] font-bold tabular-nums"
                    style={{ background: `linear-gradient(140deg, ${accent}, var(--accent-2))`, color: '#07080f' }}
                  >
                    {entry.score}
                  </span>
                </div>
                <p className="clamp-2 mt-2 text-[0.75rem] font-medium leading-snug">{titleOf(media, lang)}</p>
              </motion.button>
            ))}
          </RowScroller>
        </Section>
      )}

      <div className="flex items-center gap-2 text-[0.72rem] text-faint">
        <Eye size={13} />
        <Layers size={13} />
        <Award size={13} />
        <span>Aucune de ces données ne quitte ton PC.</span>
      </div>
    </div>
  )
}
