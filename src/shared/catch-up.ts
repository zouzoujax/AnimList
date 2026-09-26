/**
 * Rattraper la diffusion : quels épisodes regarder quel soir pour être à jour.
 *
 * L'accueil dit combien d'épisodes t'attendent, et la soirée compose ce soir.
 * Aucun des deux ne répond à la question qu'on se pose après une semaine
 * chargée — « quand est-ce que je serai à jour ? » —, parce qu'elle court sur
 * plusieurs soirs, pendant lesquels d'autres épisodes sortent.
 *
 * Seules les séries **en diffusion et commencées** comptent. Une série finie
 * n'a pas de date à rattraper : trois cents épisodes de Bleach ne sont pas un
 * retard, c'est une série à regarder, et ils noieraient le reste. Pour la même
 * raison, une série en diffusion avec plus d'une saison de retard — One Piece
 * repris en route — reste hors du plan. Une saison jamais ouverte non plus :
 * on n'a pas de retard sur ce qu'on n'a pas commencé.
 *
 * Pur et testé, comme la soirée dont il reprend le rythme et la règle de
 * débordement : un mauvais plan ne se voit pas, il ressemble à un bon.
 *
 * Trois décisions portent le reste.
 *
 * **L'urgence d'abord.** La série dont le prochain épisode sort le plus tôt
 * passe devant : c'est celle où le retard va grossir en premier. À égalité, la
 * plus fraîchement regardée, dont on se souvient encore.
 *
 * **Les sorties de la semaine comptent.** Un épisode annoncé pour jeudi entre
 * dans le plan jeudi, pas avant. Sans lui, « à jour mercredi » serait faux dès
 * le lendemain.
 *
 * **Le soir même tient compte de ce qu'on a déjà vu.** Une heure regardée cet
 * après-midi a mangé la soirée habituelle : le plan commence demain, plutôt que
 * de promettre une deuxième soirée.
 */

export interface CatchUpSeries {
  animeId: number
  title: string
  /** Les épisodes diffusés et pas vus, dans l'ordre. */
  behind: number[]
  /** La durée d'un épisode, en minutes. */
  minutes: number
  /** Dernière séance sur la série, `0` si jamais commencée. */
  lastWatchedAt: number
  /** Le prochain épisode annoncé, heure en millisecondes ; `null` hors diffusion. */
  next: { episode: number; at: number } | null
}

export interface PlanItem {
  animeId: number
  title: string
  /** Consécutifs : « épisodes 14 à 16 ». */
  episodes: number[]
  minutes: number
}

export interface PlanDay {
  /** Minuit du jour, heure locale. */
  day: number
  items: PlanItem[]
  minutes: number
}

export interface CatchUpPlan {
  /** Le temps d'une soirée, repris de la soirée habituelle. */
  budget: number
  /** Les jours où il y a quelque chose à regarder, dans l'ordre. */
  days: PlanDay[]
  /** Ce qui attend dès maintenant, hors sorties à venir. */
  behind: { episodes: number; minutes: number }
  /** Le jour où tout est vu, sorties de la semaine comprises ; `null` si ça ne tient pas. */
  doneOn: number | null
  /** Ce qui déborde de la semaine. */
  left: { episodes: number; minutes: number }
}

/** Sept soirs : assez pour voir venir, pas assez pour que le plan devienne une fiction. */
export const PLAN_DAYS = 7

/**
 * En dessous, pas de plan : un ou deux épisodes se regardent ce soir, la
 * soirée suffit, et un plan d'un seul soir n'a rien d'un plan.
 */
export const MIN_BEHIND = 3

/**
 * Au-delà d'une saison de retard, ce n'est plus un retard : c'est une série à
 * regarder, et elle occuperait la semaine entière à elle seule.
 */
export const MAX_BEHIND = 13

/** Minuit, `offset` jours après celui de `at` — par le calendrier, pour traverser les changements d'heure. */
function midnight(at: number, offset = 0): number {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return d.getTime()
}

interface Pending {
  series: CatchUpSeries
  /** Épisode et premier jour (index) où il est regardable. */
  queue: { episode: number; from: number }[]
}

/**
 * Le plan de la semaine.
 *
 * `watchedToday` : les minutes déjà vues aujourd'hui, retirées de la soirée.
 */
export function planCatchUp(
  series: CatchUpSeries[],
  opts: { budget: number; now: number; watchedToday?: number; days?: number }
): CatchUpPlan {
  const { budget, now, watchedToday = 0, days = PLAN_DAYS } = opts
  const starts = Array.from({ length: days + 1 }, (_, i) => midnight(now, i))
  const dayOf = (at: number): number => {
    const i = starts.findIndex((start, k) => at >= start && at < (starts[k + 1] ?? Infinity))
    return i === -1 ? days : Math.min(i, days)
  }

  const pending: Pending[] = series
    .filter((s) => s.lastWatchedAt > 0 && s.next !== null && s.minutes > 0 && s.behind.length <= MAX_BEHIND)
    .map((s) => {
      const queue = s.behind.map((episode) => ({ episode, from: 0 }))
      const next = s.next!
      if (next.at >= now && !s.behind.includes(next.episode)) {
        queue.push({ episode: next.episode, from: dayOf(next.at) })
      }
      return { series: s, queue }
    })
    .filter((p) => p.queue.length > 0)
    .sort(
      (a, b) =>
        a.series.next!.at - b.series.next!.at ||
        b.series.lastWatchedAt - a.series.lastWatchedAt ||
        a.series.animeId - b.series.animeId
    )

  const behind = pending.reduce(
    (sum, p) => {
      const n = p.queue.filter((q) => q.from === 0 && p.series.behind.includes(q.episode)).length
      return { episodes: sum.episodes + n, minutes: sum.minutes + n * p.series.minutes }
    },
    { episodes: 0, minutes: 0 }
  )

  const planned: PlanDay[] = []
  for (let d = 0; d < days; d += 1) {
    const room = d === 0 ? Math.max(0, budget - watchedToday) : budget
    const picks: { p: Pending; episode: number }[] = []
    let minutes = 0

    // Ce qui est regardable ce jour-là, dans l'ordre de chaque série : un
    // épisode pas encore sorti bloque ceux d'après.
    const ready = (p: Pending): { episode: number; from: number } | undefined =>
      p.queue[0] && p.queue[0].from <= d ? p.queue[0] : undefined

    for (const p of pending) {
      while (ready(p) && minutes + p.series.minutes <= room) {
        picks.push({ p, episode: p.queue.shift()!.episode })
        minutes += p.series.minutes
      }
    }
    // Un seul débordement, s'il remplit plus qu'il ne dépasse — la règle de la soirée.
    const left = room - minutes
    if (left > 0) {
      const extra = pending.find((p) => ready(p) && p.series.minutes < left * 2)
      if (extra) {
        picks.push({ p: extra, episode: extra.queue.shift()!.episode })
        minutes += extra.series.minutes
      }
    }
    if (!picks.length) continue

    const items: PlanItem[] = []
    for (const { p, episode } of picks) {
      const last = items[items.length - 1]
      if (last && last.animeId === p.series.animeId && last.episodes[last.episodes.length - 1] === episode - 1) {
        last.episodes.push(episode)
        last.minutes += p.series.minutes
      } else {
        items.push({ animeId: p.series.animeId, title: p.series.title, episodes: [episode], minutes: p.series.minutes })
      }
    }
    planned.push({ day: starts[d], items, minutes })
  }

  const rest = pending.flatMap((p) => p.queue.filter((q) => q.from < days).map(() => p.series.minutes))
  const done = rest.length === 0 && planned.length > 0
  return {
    budget,
    days: planned,
    behind,
    doneOn: done ? planned[planned.length - 1].day : null,
    left: { episodes: rest.length, minutes: rest.reduce((a, b) => a + b, 0) }
  }
}
