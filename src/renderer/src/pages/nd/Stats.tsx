import { ChartColumn, ImageDown } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { GENRE_LABELS, type Media } from '@shared/types'
import { ActivityHeatmap, MonthlyColumns, RankedBars, type DayCount } from '@/components/Charts'
import { NdTabs, plural, spokenDuration } from '@/components/nd'
import { EmptyState, Poster, RowScroller } from '@/components/ui'
import { toneAccent } from '@/lib/color'
import { dayLabel, hoursOf, minutesToHuman, monthLabel, num, startOfDay, titleOf } from '@/lib/format'
import { BADGE_GROUPS, useBadgeWall, type Badge } from '@/lib/badges'
import { useApp } from '@/store/app'

const DAY_MS = 86_400_000

function yearGrid(year: number, counts: Map<number, number>): DayCount[] {
  const first = new Date(year, 0, 1)
  const start = new Date(first)
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7))
  const end = new Date(year, 11, 31)
  const last = new Date(end)
  last.setDate(end.getDate() + ((7 - ((end.getDay() + 6) % 7) - 1) % 7))
  const days: DayCount[] = []
  for (let t = start.getTime(); t <= last.getTime(); t += DAY_MS) {
    const date = startOfDay(t)
    days.push({ date, count: counts.get(date) ?? 0 })
  }
  return days
}

/** Une section de la page : un titre qui est une phrase, et une précision dessous. */
function Part({
  id,
  title,
  sub,
  action,
  children
}: {
  id?: string
  title: string
  sub?: string
  action?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section id={id} className="mb-11">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 px-1">
        <div className="max-w-[70ch]">
          <h2 className="title-xl text-[1.32rem] leading-tight">{title}</h2>
          {sub && <p className="mt-0.5 text-[0.82rem] text-muted">{sub}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

/**
 * Un badge sur une ligne.
 *
 * Cent pastilles rondes toutes pareilles se lisaient comme un motif, pas comme
 * une liste d'objectifs. Une ligne dit ce qu'il faut faire et où tu en es.
 */
function BadgeRow({ badge }: { badge: Badge }): React.JSX.Element {
  const done = badge.progress >= 1
  const pct = Math.min(1, Math.max(0, badge.progress))
  const Icon = badge.icon
  return (
    <li className="nd-badge" data-done={done}>
      <span className="nd-badge-icon" aria-hidden>
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.86rem] font-semibold">{badge.label}</span>
        <span className="block text-[0.76rem] leading-snug text-muted">{badge.hint}</span>
      </span>
      <span className="nd-badge-state">
        {done ? (
          'Obtenu'
        ) : (
          <>
            <span className="nd-badge-bar" aria-hidden>
              <span style={{ width: `${pct * 100}%` }} />
            </span>
            {Math.round(pct * 100)} %
          </>
        )}
      </span>
    </li>
  )
}

/**
 * Les statistiques, racontées.
 *
 * L'ancienne page ouvrait sur un nombre géant et quatre tuiles d'étiquettes en
 * capitales. Ici chaque bloc commence par la phrase qu'on retiendrait, et les
 * chiffres de détail se rangent en liste dessous.
 */
export default function NdStatsPage({ focus }: { focus?: 'badges' }): React.JSX.Element {
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

  // Arriver par « Badges » pose la page sur le mur, pas en haut.
  useEffect(() => {
    if (focus !== 'badges') return
    const t = setTimeout(() => document.getElementById('badges')?.scrollIntoView({ block: 'start' }), 60)
    return () => clearTimeout(t)
  }, [focus])

  const years = useMemo(() => {
    const list = [...stats.perYear.keys()].sort((a, b) => b - a)
    return list.length ? list : [new Date().getFullYear()]
  }, [stats.perYear])
  const [year, setYear] = useState(years[0])
  const activeYear = years.includes(year) ? year : years[0]
  const heatDays = useMemo(() => yearGrid(activeYear, stats.perDay), [activeYear, stats.perDay])

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
      detail: `${new Date(activeYear, i, 1).toLocaleDateString('fr-FR', { month: 'long' })} : ${minutesToHuman(mins)}`
    }))
  }, [events, activeYear])

  const topRated = useMemo(
    () =>
      [...entries.values()]
        .filter((e) => e.score !== null)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 14)
        .map((e) => ({ entry: e, media: mediaMap.get(e.animeId) }))
        .filter((row): row is { entry: (typeof row)['entry']; media: Media } => !!row.media),
    [entries, mediaMap]
  )

  const timeline = useMemo(() => {
    const months = new Map<string, { label: string; minutes: number; episodes: number; series: Map<number, number> }>()
    for (const ev of events) {
      if (ev.imported) continue
      const date = new Date(ev.at)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const held = months.get(key) ?? { label: monthLabel(date), minutes: 0, episodes: 0, series: new Map() }
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
    const perActiveDay = stats.activeDays ? stats.livedMinutes / stats.activeDays : 0
    return {
      series,
      watchingMin,
      plannedMin,
      total,
      days: perActiveDay > 0 ? Math.ceil(total / perActiveDay) : null,
      perActiveDay: Math.round(perActiveDay),
      thin: stats.activeDays > 0 && stats.activeDays < 7
    }
  }, [entries, mediaMap, watchedMap, defaultRuntime, stats.activeDays, stats.livedMinutes])

  const [badgeFilter, setBadgeFilter] = useState<'todo' | 'done' | 'all'>('todo')

  if (stats.episodes === 0) {
    return (
      <div className="mx-auto max-w-[900px] px-7 py-16">
        <EmptyState
          icon={<ChartColumn size={24} />}
          title="Rien à compter pour l'instant"
          hint="Coche ton premier épisode et cette page se remplit : temps passé, séries de jours, genres, badges."
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
  const shownBadges =
    badgeFilter === 'done'
      ? badges.filter((b) => b.progress >= 1)
      : badgeFilter === 'todo'
        ? badges.filter((b) => b.progress < 1).sort((a, b) => b.progress - a.progress)
        : badges

  // Les chiffres de détail, en liste : l'intitulé à gauche, la valeur à droite.
  const facts: [string, string][] = [
    ['Épisodes regardés', num(stats.episodes)],
    ['Séries terminées', num(stats.completed)],
    ['Séries en cours', num(stats.watching)],
    ['Jours d’affilée en ce moment', dayLabel(stats.streaks.current)],
    ['Record de jours d’affilée', dayLabel(stats.streaks.best)],
    ['Meilleure journée', plural(stats.bestDay, 'épisode')],
    ['Journées où tu as regardé', num(stats.activeDays)],
    ['Note moyenne', stats.meanScore ? `${stats.meanScore.toFixed(1).replace('.', ',')} sur 10` : 'Aucune note']
  ]

  return (
    <div className="page">
      {/* L'élément de la page : la phrase qu'on retiendrait, écrite en grand. */}
      <section className="mb-11 px-1">
        <p className="title-xl max-w-[26ch] text-[2.4rem] leading-[1.1]">
          Tu as passé {spokenDuration(stats.minutes)} devant des animes.
        </p>
        <p className="mt-3 max-w-[70ch] text-[0.9rem] leading-relaxed text-muted">
          {plural(stats.episodes, 'épisode')} cochés dans {plural(stats.tracked, 'série')}.
          {stats.importedCount > 0 &&
            ` Dont ${num(stats.importedCount)} importés sans date : ils comptent dans les totaux, pas dans les graphiques.`}{' '}
          Tout est calculé sur ce PC et n’en sort pas.
        </p>

        <dl className="nd-facts mt-7">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {backlog.series > 0 && (
        <Part
          title={`Il te reste ${spokenDuration(backlog.total)} à regarder`}
          sub={
            backlog.days === null
              ? `Sur ${plural(backlog.series, 'série')} en cours ou à voir.`
              : `Environ ${plural(backlog.days, 'jour')} à ton rythme de ${backlog.perActiveDay} minutes par journée de visionnage${backlog.thin ? ', mesuré sur trop peu de journées pour être sûr' : ''}.`
          }
        >
          <dl className="nd-facts">
            <div>
              <dt>Dans les séries en cours</dt>
              <dd>{minutesToHuman(backlog.watchingMin)}</dd>
            </div>
            <div>
              <dt>Dans les séries à voir</dt>
              <dd>{minutesToHuman(backlog.plannedMin)}</dd>
            </div>
          </dl>
        </Part>
      )}

      <Part
        title={`Ton année ${activeYear}`}
        sub={
          yearCard.episodes > 0
            ? `${spokenDuration(yearCard.minutes)} sur ${plural(yearCard.days, 'journée')}, ${plural(yearCard.series, 'série')}.`
            : 'Aucun épisode coché cette année-là.'
        }
        action={
          <div className="flex flex-wrap items-center gap-3">
            {years.length > 1 && (
              <NdTabs
                label="Année"
                size="sm"
                tabs={years.slice(0, 5).map((y) => ({ id: String(y), label: String(y) }))}
                value={String(activeYear)}
                onChange={(y) => setYear(Number(y))}
              />
            )}
            {yearCard.episodes > 0 && (
              <button className="btn" onClick={() => void saveYearCard()}>
                <ImageDown size={14} />
                Enregistrer en image
              </button>
            )}
          </div>
        }
      >
        <div className="nd-panel">
          <ActivityHeatmap days={heatDays} />
          <p className="mt-2 text-[0.76rem] text-faint">
            Un carré par jour : plus il est clair, plus tu as regardé ce jour-là.
          </p>
        </div>

        <div className="nd-panel mt-4">
          <MonthlyColumns data={monthly} unit="Heures de visionnage par mois" />
        </div>

        {yearCard.episodes > 0 && (
          // Capturée telle quelle : c'est la carte affichée qui devient l'image.
          <div
            ref={cardRef}
            className="nd-year-card mt-4"
            style={{ '--tone': toneAccent(accent) } as React.CSSProperties}
          >
            <p className="title-xl text-[1.7rem] leading-tight">
              {activeYear} : {spokenDuration(yearCard.minutes)} d’anime.
            </p>
            <p className="mt-1.5 text-[0.86rem] text-muted">
              {plural(yearCard.episodes, 'épisode')}, {plural(yearCard.series, 'série')},{' '}
              {plural(yearCard.days, 'journée')} devant l’écran.
            </p>
            {yearCard.top.length > 0 && (
              <div className="mt-5 flex gap-3">
                {yearCard.top.map((row) => (
                  <div key={row.media.id} className="w-[92px]">
                    <Poster src={row.media.cover.large} alt="" className="h-[130px] w-[92px]" />
                    <p className="clamp-2 mt-1 text-[0.7rem] leading-snug">{titleOf(row.media, lang)}</p>
                    <p className="text-[0.66rem] text-faint">{plural(row.count, 'épisode')}</p>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 text-[0.7rem] text-faint">AnimeList</p>
          </div>
        )}
      </Part>

      <div className="mb-11 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="title-xl px-1 text-[1.15rem]">
            {stats.genres[0]
              ? `${GENRE_LABELS[stats.genres[0][0]] ?? stats.genres[0][0]} est ton genre le plus regardé`
              : 'Tes genres'}
          </h2>
          <p className="mb-3 mt-0.5 px-1 text-[0.78rem] text-muted">Choisis un genre pour filtrer ta bibliothèque.</p>
          <div className="nd-panel">
            <RankedBars
              rows={stats.genres
                .slice(0, 8)
                .map(([g, n]) => ({ key: g, label: GENRE_LABELS[g] ?? g, value: n, detail: 'ép.' }))}
              suffix="ép."
              onSelect={(g) => navigate({ name: 'library', genre: g })}
            />
          </div>
        </section>
        <section>
          <h2 className="title-xl px-1 text-[1.15rem]">
            {stats.studios[0] ? `${stats.studios[0][0]} est ton studio le plus vu` : 'Tes studios'}
          </h2>
          <p className="mb-3 mt-0.5 px-1 text-[0.78rem] text-muted">Choisis un studio pour voir tout son catalogue.</p>
          <div className="nd-panel">
            <RankedBars
              rows={stats.studios.map(([s, n]) => ({ key: s, label: s, value: n, detail: 'ép.' }))}
              suffix="ép."
              onSelect={(s) => navigate({ name: 'studio', studio: s })}
            />
          </div>
        </section>
      </div>

      {timeline.length > 0 && (
        <Part
          title="Mois par mois"
          sub={`${plural(timeline.length, 'mois')} de visionnage, du plus récent au plus ancien.`}
        >
          <ol className="nd-timeline">
            {timeline.map((month) => (
              <li key={month.key}>
                <div className="w-[160px] shrink-0">
                  <p className="text-[0.9rem] font-semibold first-letter:uppercase">{month.label}</p>
                  <p className="mt-0.5 text-[0.74rem] text-muted">
                    {plural(month.episodes, 'épisode')}, {minutesToHuman(month.minutes)}
                  </p>
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {month.top.map((row) => (
                    <button
                      key={row.media.id}
                      onClick={() => navigate({ name: 'anime', id: row.media.id })}
                      className="nd-chip-series"
                    >
                      <Poster
                        src={row.media.cover.large}
                        alt=""
                        className="h-[38px] w-[26px] shrink-0"
                        rounded="rounded-[6px]"
                      />
                      <span className="min-w-0">
                        <span className="block max-w-[180px] truncate text-[0.78rem]">{titleOf(row.media, lang)}</span>
                        <span className="text-[0.7rem] text-faint">{plural(row.count, 'épisode')}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </Part>
      )}

      <Part
        id="badges"
        title={`${unlocked} badges obtenus sur ${badges.length}`}
        sub={
          badgeFilter === 'todo'
            ? 'Les plus proches d’abord : ce sont ceux qui sont à ta portée.'
            : badgeFilter === 'done'
              ? 'Ceux que tu as déjà.'
              : 'Tous les badges, par famille.'
        }
        action={
          <NdTabs
            label="Badges"
            size="sm"
            tabs={[
              { id: 'todo' as const, label: 'À obtenir', count: badges.length - unlocked },
              { id: 'done' as const, label: 'Obtenus', count: unlocked },
              { id: 'all' as const, label: 'Tous', count: badges.length }
            ]}
            value={badgeFilter}
            onChange={setBadgeFilter}
          />
        }
      >
        {shownBadges.length === 0 ? (
          <p className="px-1 text-[0.85rem] text-muted">
            Aucun badge pour l’instant. Coche des épisodes, ils viendront.
          </p>
        ) : badgeFilter === 'todo' ? (
          <ul className="nd-badges">
            {shownBadges.map((badge) => (
              <BadgeRow key={badge.id} badge={badge} />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col gap-7">
            {BADGE_GROUPS.map((group) => {
              const list = shownBadges.filter((b) => b.group === group)
              if (!list.length) return null
              const whole = badges.filter((b) => b.group === group)
              const done = whole.filter((b) => b.progress >= 1).length
              return (
                <div key={group}>
                  <h3 className="mb-2 px-1 text-[0.95rem] font-semibold">
                    {group}
                    <span className="ml-2 text-[0.78rem] font-normal text-faint">
                      {done} sur {whole.length}
                    </span>
                  </h3>
                  <ul className="nd-badges">
                    {list.map((badge) => (
                      <BadgeRow key={badge.id} badge={badge} />
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </Part>

      {topRated.length > 0 && (
        <Part title="Tes mieux notées" sub="Les séries auxquelles tu as mis les meilleures notes.">
          <RowScroller>
            {topRated.map(({ entry, media }) => (
              <button
                key={media.id}
                onClick={() => navigate({ name: 'anime', id: media.id })}
                className="w-[126px] shrink-0 text-left"
              >
                <Poster src={media.cover.xl} alt="" className="aspect-[2/3] w-full" />
                <p className="clamp-2 mt-2 text-[0.78rem] font-medium leading-snug">{titleOf(media, lang)}</p>
                <p className="text-[0.72rem] text-muted">{entry.score} sur 10</p>
              </button>
            ))}
          </RowScroller>
        </Part>
      )}
    </div>
  )
}
