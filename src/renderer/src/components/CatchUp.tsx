/**
 * Le plan de rattrapage : quels épisodes regarder quel soir pour être à jour.
 *
 * La règle vit dans `@shared/catch-up`, à part et testée. Ce fichier ne fait
 * que la nourrir — ce qui est en retard, le rythme habituel, ce qu'on a déjà vu
 * aujourd'hui — et la montrer, dans la même grille de sept jours que les
 * sorties de la semaine. Les deux accueils s'en servent.
 */

import { useMemo } from 'react'
import { planCatchUp, type CatchUpPlan, type CatchUpSeries } from '@shared/catch-up'
import { usualEvening } from '@shared/soiree'
import type { Media } from '@shared/types'
import { Poster } from '@/components/ui'
import { plural } from '@/components/nd'
import { minutesToHuman, startOfDay, titleOf } from '@/lib/format'
import { useApp } from '@/store/app'

/** « Aujourd'hui », « Demain », puis le jour en toutes lettres. */
export function dayName(i: number, day: number, today = "Aujourd'hui"): string {
  if (i === 0) return today
  if (i === 1) return 'Demain'
  // La majuscule dans le texte : `::first-letter` ne s'applique pas à une
  // ligne en flex, celle du plan qui porte aussi la durée.
  const name = new Date(day).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })
  return name[0].toUpperCase() + name.slice(1)
}

/** « Ép. 14 », « Ép. 14–16 ». */
const episodesLabel = (episodes: number[]): string =>
  episodes.length === 1 ? `Ép. ${episodes[0]}` : `Ép. ${episodes[0]}–${episodes[episodes.length - 1]}`

/**
 * Le plan de la semaine, recalculé à chaque coche.
 *
 * Les séries en diffusion où des épisodes attendent, réparties au rythme de la
 * soirée habituelle. Les lignes importées ne disent pas quand on a regardé :
 * elles ne comptent pas dans ce qu'on a vu aujourd'hui, et ne datent la
 * dernière séance qu'à défaut d'une vraie — comme dans la soirée. Les écarter
 * tout à fait faisait passer pour jamais commencée une série suivie depuis un
 * import.
 */
export function useCatchUpPlan(now: number): CatchUpPlan {
  const entries = useApp((s) => s.entries)
  const mediaMap = useApp((s) => s.media)
  const watchedMap = useApp((s) => s.watched)
  const events = useApp((s) => s.events)
  const lang = useApp((s) => s.prefs.titleLang)
  const runtime = useApp((s) => s.prefs.defaultRuntime)

  return useMemo(() => {
    const today = startOfDay(now)
    let watchedToday = 0
    const real = new Map<number, number>()
    const fallback = new Map<number, number>()
    for (const ev of events) {
      if (!ev.imported && ev.at >= today) watchedToday += ev.minutes
      const target = ev.imported ? fallback : real
      if ((target.get(ev.animeId) ?? 0) < ev.at) target.set(ev.animeId, ev.at)
    }
    const series: CatchUpSeries[] = []
    for (const entry of entries.values()) {
      if (entry.status !== 'watching') continue
      const media = mediaMap.get(entry.animeId)
      if (!media?.nextAiring) continue
      const seen = watchedMap.get(media.id)
      const behind: number[] = []
      for (let n = 1; n < media.nextAiring.episode; n += 1) if (!seen?.has(n)) behind.push(n)
      series.push({
        animeId: media.id,
        title: titleOf(media, lang),
        behind,
        minutes: media.duration ?? runtime,
        lastWatchedAt: real.get(media.id) ?? fallback.get(media.id) ?? 0,
        next: { episode: media.nextAiring.episode, at: media.nextAiring.airingAt * 1000 }
      })
    }
    return planCatchUp(series, { budget: usualEvening(events, now), now, watchedToday })
  }, [entries, mediaMap, watchedMap, events, lang, runtime, now])
}

/** Ce que le plan promet, en une phrase. */
export function planSentence(plan: CatchUpPlan, now: number): string {
  // « Sur les séries en diffusion » : le retard compté ailleurs sur l'accueil
  // inclut les séries finies, et deux chiffres voisins qui diffèrent sans
  // raison dite passeraient pour une erreur.
  const n = plan.behind.episodes
  const late = `Sur les séries en diffusion, ${plural(n, 'épisode')} ${n > 1 ? "t'attendent" : "t'attend"} (${minutesToHuman(plan.behind.minutes)})`
  const pace = `à ton rythme d'environ ${minutesToHuman(plan.budget)} par soir`
  if (plan.doneOn === null) {
    return `${late}. Même ${pace}, il en restera ${plan.left.episodes} dans une semaine.`
  }
  const i = Math.round((plan.doneOn - startOfDay(now)) / 86_400_000)
  const when =
    i === 0
      ? 'dès ce soir'
      : i === 1
        ? 'demain'
        : new Date(plan.doneOn).toLocaleDateString('fr-FR', { weekday: 'long' })
  return `${late}. ${pace[0].toUpperCase()}${pace.slice(1)}, tu es à jour ${when}, sorties de la semaine comprises.`
}

/**
 * Le plan, dans la même grille que les sorties.
 *
 * Les mêmes sept colonnes, pour qu'on lise d'une vue à l'autre ce qui sort un
 * soir et ce qu'on y regarde.
 */
export function PlanGrid({
  plan,
  now,
  onHover
}: {
  plan: CatchUpPlan
  now: number
  onHover?: (media: Media | null) => void
}): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const mediaMap = useApp((s) => s.media)
  const today = startOfDay(now)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    return d.getTime()
  })

  return (
    <div className="week-grid">
      {days.map((day, i) => {
        const planned = plan.days.find((d) => d.day === day)
        return (
          <div key={day} className="week-day" data-empty={!planned}>
            <p className="week-day-name flex items-baseline justify-between gap-2">
              <span>{dayName(i, day, 'Ce soir')}</span>
              {planned && (
                <span className="text-[0.7rem] font-normal text-faint">{minutesToHuman(planned.minutes)}</span>
              )}
            </p>
            {planned?.items.map((item) => {
              const media = mediaMap.get(item.animeId)
              return (
                <button
                  key={`${item.animeId}-${item.episodes[0]}`}
                  className="week-item"
                  onClick={() => navigate({ name: 'anime', id: item.animeId })}
                  onMouseEnter={() => onHover?.(media ?? null)}
                  onMouseLeave={() => onHover?.(null)}
                >
                  <Poster
                    src={media?.cover.large ?? ''}
                    alt=""
                    className="h-[52px] w-[36px] shrink-0"
                    rounded="rounded-[7px]"
                  />
                  <span className="min-w-0">
                    <span className="clamp-2 text-[0.76rem] font-semibold leading-snug">{item.title}</span>
                    <span className="mt-0.5 block text-[0.7rem] text-faint">{episodesLabel(item.episodes)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
