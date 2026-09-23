import {
  Award,
  ChartColumn,
  CheckCheck,
  Clock,
  Eye,
  Flame,
  Gauge,
  Hourglass,
  ImageDown,
  Layers,
  ListTodo,
  Star
} from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useRef, useState } from 'react'
import { GENRE_LABELS, type Media } from '@shared/types'
import { ActivityHeatmap, MonthlyColumns, RankedBars, StatTile, type DayCount } from '@/components/Charts'
import { EmptyState, Poster, RowScroller, Section } from '@/components/ui'
import { rgba } from '@/lib/color'
import { dayLabel, durationParts, hoursOf, minutesToHuman, monthLabel, num, startOfDay, titleOf } from '@/lib/format'
import { useApp } from '@/store/app'
import { BADGE_GROUPS, badgeTitle, useBadgeWall, type Badge } from '@/lib/badges'

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
      title={badgeTitle(badge)}
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
  const watchedMap = useApp((s) => s.watched)
  const toast = useApp((s) => s.toast)
  const defaultRuntime = useApp((s) => s.prefs.defaultRuntime)

  const { stats, badges } = useBadgeWall()

  const years = useMemo(() => {
    const list = [...stats.perYear.keys()].sort((a, b) => b - a)
    return list.length ? list : [new Date().getFullYear()]
  }, [stats.perYear])

  const [year, setYear] = useState(years[0])
  const activeYear = years.includes(year) ? year : years[0]

  const heatDays = useMemo(() => yearGrid(activeYear, stats.perDay), [activeYear, stats.perDay])

  /**
   * L'année en une carte.
   *
   * Tout est déjà calculé ailleurs, mais éparpillé sur toute la page : ici on
   * ne retient que ce qui se raconte — le temps, les épisodes, la meilleure
   * journée, et les affiches qui ont occupé l'année.
   */
  const yearCard = useMemo(() => {
    let minutes = 0
    let episodes = 0
    const days = new Set<number>()
    const series = new Map<number, number>()

    for (const ev of events) {
      if (ev.imported) continue
      const date = new Date(ev.at)
      if (date.getFullYear() !== activeYear) continue
      minutes += ev.minutes
      episodes += 1
      days.add(startOfDay(ev.at))
      series.set(ev.animeId, (series.get(ev.animeId) ?? 0) + 1)
    }

    const top = [...series.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ media: mediaMap.get(id), count }))
      .filter((row): row is { media: Media; count: number } => !!row.media)

    return { minutes, episodes, days: days.size, series: series.size, top }
  }, [events, activeYear, mediaMap])

  const cardRef = useRef<HTMLDivElement>(null)
  const saveYearCard = async (): Promise<void> => {
    const el = cardRef.current
    if (!el) return
    // La fenêtre capture ce qu'elle affiche : la carte doit être à l'écran,
    // et le navigateur a besoin d'une image pour finir de la faire défiler.
    el.scrollIntoView({ block: 'center' })
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    const box = el.getBoundingClientRect()
    const name = await window.api.app.saveCard(
      { x: box.x, y: box.y, width: box.width, height: box.height },
      `animelist-${activeYear}.png`
    )
    if (name) toast(`Image enregistrée dans ${name}.`, 'ok')
  }

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
  /**
   * La frise : chaque mois où tu as regardé quelque chose, du plus récent au
   * plus ancien.
   *
   * La carte de chaleur dit *combien*, mois par mois ; elle ne dit pas *quoi*.
   * Ici on retrouve les séries — c'est ce qu'on cherche en remontant le temps.
   *
   * Seuls les épisodes cochés dans l'app y figurent : une ligne importée porte
   * la date de son pointage ailleurs, et rangerait mille épisodes sous le mois
   * de l'import.
   */
  const timeline = useMemo(() => {
    const months = new Map<string, { label: string; minutes: number; episodes: number; series: Map<number, number> }>()
    for (const ev of events) {
      if (ev.imported) continue
      const date = new Date(ev.at)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const held = months.get(key) ?? {
        label: monthLabel(date),
        minutes: 0,
        episodes: 0,
        series: new Map<number, number>()
      }
      held.minutes += ev.minutes
      held.episodes += 1
      held.series.set(ev.animeId, (held.series.get(ev.animeId) ?? 0) + 1)
      months.set(key, held)
    }

    return [...months.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, m]) => ({
        key,
        label: m.label,
        minutes: m.minutes,
        episodes: m.episodes,
        top: [...m.series.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([id, count]) => ({ media: mediaMap.get(id), count }))
          .filter((row): row is { media: Media; count: number } => !!row.media)
      }))
  }, [events, mediaMap])

  const backlog = useMemo(() => {
    // Le détail par série vit sur la fiche de l'anime, pas ici : cette section
    // répond à « combien de temps », pas à « quelle série ».
    let series = 0
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

      series += 1
    }

    const total = watchingMin + plannedMin
    // Le rythme vient de tes journées actives, pas d'une moyenne sur l'année :
    // les jours sans rien regarder ne disent rien de ta vitesse.
    const perActiveDay = stats.activeDays ? stats.livedMinutes / stats.activeDays : 0
    return {
      series,
      watchingMin,
      plannedMin,
      total,
      days: perActiveDay > 0 ? Math.ceil(total / perActiveDay) : null,
      perActiveDay: Math.round(perActiveDay),
      // Une moyenne sur trois journées n'est pas une vitesse de croisière. Le
      // dire vaut mieux que d'annoncer un nombre de jours avec assurance.
      thin: stats.activeDays > 0 && stats.activeDays < 7
    }
  }, [entries, mediaMap, watchedMap, defaultRuntime, stats.activeDays, stats.livedMinutes])

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

      {backlog.series > 0 && (
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
            <StatTile label="Séries concernées" value={num(backlog.series)} icon={<Layers size={15} />} />
            <StatTile
              label="Ton rythme"
              value={`${num(backlog.perActiveDay)} min`}
              hint={`par journée où tu regardes · mesuré sur ${num(stats.activeDays)} journée${stats.activeDays > 1 ? 's' : ''}`}
              icon={<Gauge size={15} />}
            />
          </div>
        </Section>
      )}

      {yearCard.episodes > 0 && (
        <Section
          title={`Ton année ${activeYear}`}
          subtitle="À enregistrer et à partager"
          action={
            <button className="chip shrink-0" onClick={() => void saveYearCard()}>
              <ImageDown size={13} />
              Enregistrer l’image
            </button>
          }
        >
          {/* Capturée telle quelle par la fenêtre : c'est la carte affichée qui
              devient l'image, pas un second rendu à maintenir en parallèle. */}
          <div
            ref={cardRef}
            className="relative overflow-hidden rounded-[22px] p-6"
            style={{
              background: `linear-gradient(140deg, ${rgba(accent, 0.22)}, rgba(8,9,17,.9) 60%)`,
              border: `1px solid ${rgba(accent, 0.3)}`
            }}
          >
            <p className="label" style={{ color: rgba(accent, 1) }}>
              AnimeList · {activeYear}
            </p>
            <p className="title-xl mt-1 text-[2rem] leading-tight">{minutesToHuman(yearCard.minutes)} d’anime</p>

            <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
              {[
                { label: 'Épisodes', value: num(yearCard.episodes) },
                { label: 'Séries', value: num(yearCard.series) },
                { label: 'Journées', value: num(yearCard.days) },
                {
                  label: 'Par journée',
                  value: yearCard.days ? minutesToHuman(Math.round(yearCard.minutes / yearCard.days)) : '—'
                }
              ].map((tile) => (
                <div key={tile.label}>
                  <p className="text-[1.35rem] font-semibold tabular-nums leading-none">{tile.value}</p>
                  <p className="label mt-1 !text-[0.6rem]">{tile.label}</p>
                </div>
              ))}
            </div>

            {yearCard.top.length > 0 && (
              <>
                <p className="label mb-2 mt-5">Ce qui a occupé l’année</p>
                <div className="flex gap-2.5">
                  {yearCard.top.map((row) => (
                    <div key={row.media.id} className="w-[86px]">
                      <Poster src={row.media.cover.large} alt="" className="h-[122px] w-[86px]" />
                      <p className="clamp-2 mt-1 text-[0.66rem] leading-snug">{titleOf(row.media, lang)}</p>
                      <p className="text-[0.62rem] tabular-nums text-faint">{row.count} ép.</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </Section>
      )}

      {timeline.length > 0 && (
        <Section title="Ta frise" subtitle={`${timeline.length} mois de visionnage, du plus récent au plus ancien`}>
          <div className="flex flex-col">
            {timeline.map((month) => (
              <div
                key={month.key}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t py-3 first:border-t-0"
                style={{ borderColor: 'var(--line)' }}
              >
                <div className="w-[150px] shrink-0">
                  <p className="text-[0.86rem] font-semibold capitalize">{month.label}</p>
                  <p className="mt-0.5 text-[0.72rem] tabular-nums text-faint">
                    {month.episodes} ép. · {minutesToHuman(month.minutes)}
                  </p>
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {month.top.map((row) => (
                    <button
                      key={row.media.id}
                      onClick={() => navigate({ name: 'anime', id: row.media.id })}
                      className="flex items-center gap-2 rounded-[10px] py-1 pl-1 pr-2.5 text-left transition hover:bg-white/6"
                    >
                      <Poster
                        src={row.media.cover.large}
                        alt=""
                        className="h-[38px] w-[26px] shrink-0"
                        rounded="rounded-[6px]"
                      />
                      <span className="min-w-0">
                        <span className="block max-w-[180px] truncate text-[0.76rem]">{titleOf(row.media, lang)}</span>
                        <span className="text-[0.68rem] tabular-nums text-faint">{row.count} ép.</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
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
