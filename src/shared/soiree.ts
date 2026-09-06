/**
 * Composer une soirée : « j'ai deux heures, qu'est-ce que je regarde ? »
 *
 * L'app savait déjà répondre à trois questions voisines — ce qui est en cours,
 * ce qui est sorti sans être vu, ce qui arrive — mais aucune ne répond à
 * celle-là, qui est pourtant celle qu'on se pose le plus souvent. Chacune donne
 * une liste ; personne ne dit dans quel ordre, ni combien en tiennent dans le
 * temps qu'on a.
 *
 * Ici, rien n'est écrit dans la bibliothèque : la règle ne fait que proposer.
 * Elle vit tout de même à part et sous test, parce qu'une mauvaise proposition
 * ne se voit pas — elle ressemble à une bonne, et on lui donne sa soirée.
 *
 * Deux décisions portent tout le reste :
 *
 * **L'ordre.** Ce qu'on a commencé et qui est encore en diffusion passe devant :
 * ce sont les seules séries qui grossissent pendant qu'on regarde ailleurs. Le
 * reste suit la fraîcheur — la série touchée hier avant celle laissée en mars,
 * parce qu'on se souvient encore de où on en était. Une série jamais ouverte
 * ferme la marche, quoi qu'il arrive : commencer est un engagement, pas une
 * façon de remplir vingt minutes.
 *
 * **Le débordement.** Remplir sans jamais dépasser laisse un trou : deux
 * épisodes de 24 minutes dans une heure, et douze minutes perdues. Un épisode
 * de plus n'est ajouté que s'il remplit davantage qu'il ne dépasse — soit une
 * durée inférieure au double du temps restant. Un film de 2 h ne s'invite donc
 * jamais dans une demi-heure, et un épisode de 24 minutes complète volontiers
 * une heure entamée.
 */

/** Une série dont quelque chose est regardable tout de suite. */
export interface Candidate {
  animeId: number
  title: string
  /** Les épisodes diffusés et non vus, dans l'ordre. */
  episodes: number[]
  /** La durée d'un épisode, en minutes. */
  minutes: number
  /** Encore en diffusion. */
  airing: boolean
  /** Date de la dernière séance sur cette série, `0` si jamais commencée. */
  lastWatchedAt: number
}

/** Pourquoi cet épisode est là. Affiché : une proposition doit se justifier. */
export type Reason = 'retard' | 'reprise' | 'decouverte' | 'suite'

export interface Slot {
  animeId: number
  title: string
  episode: number
  minutes: number
  reason: Reason
}

export interface Session {
  slots: Slot[]
  /** Le total réel, qui peut dépasser le budget d'un épisode. */
  minutes: number
  /** Le temps demandé, ou celui déduit des habitudes. */
  budget: number
}

/** Deux épisodes, faute de mieux : la valeur par défaut d'une bibliothèque vide. */
export const DEFAULT_EVENING = 48

/** Bornes de la soirée déduite : ni un seul épisode, ni une nuit blanche. */
export const MIN_EVENING = 24
export const MAX_EVENING = 240

/**
 * En diffusion, et déjà commencée.
 *
 * La condition « commencée » n'est pas décorative : sans elle, une saison
 * ajoutée mais jamais ouverte est annoncée « en retard », ce qui est faux — on
 * n'a pas de retard sur ce qu'on n'a pas commencé — et elle passe devant les
 * séries qu'on suit vraiment.
 */
const late = (c: Candidate): boolean => c.airing && c.lastWatchedAt > 0

const dayKey = (at: number): number => new Date(at).setHours(0, 0, 0, 0)

/**
 * La soirée habituelle, déduite de l'historique.
 *
 * « Aucune idée » ne veut pas dire « choisis au hasard » : la réponse est déjà
 * dans les lignes déjà écrites. On prend la médiane des journées de visionnage,
 * pas la moyenne — un week-end de douze heures ne doit pas décider des mardis.
 *
 * Les lignes importées sont écartées : elles portent la date à laquelle une
 * autre app les a cochées, pas celle d'un visionnage, et vingt séries importées
 * le même jour feraient une soirée de trois jours.
 */
export function usualEvening(
  events: { at: number; minutes: number; imported?: boolean }[],
  now = Date.now(),
  windowDays = 60
): number {
  const since = now - windowDays * 86_400_000
  const perDay = new Map<number, number>()
  for (const e of events) {
    if (e.imported || e.at < since || !Number.isFinite(e.minutes)) continue
    const key = dayKey(e.at)
    perDay.set(key, (perDay.get(key) ?? 0) + e.minutes)
  }

  const days = [...perDay.values()].sort((a, b) => a - b)
  if (days.length === 0) return DEFAULT_EVENING

  const mid = Math.floor(days.length / 2)
  const median = days.length % 2 === 1 ? days[mid] : Math.round((days[mid - 1] + days[mid]) / 2)
  // Pas d'arrondi de confort : les épisodes durent 23 ou 24 minutes, et arrondir
  // à la dizaine la plus proche transforme deux épisodes en « 50 minutes », un
  // budget que rien dans la bibliothèque ne sait remplir exactement.
  return Math.min(MAX_EVENING, Math.max(MIN_EVENING, median))
}

/**
 * L'ordre dans lequel on pioche.
 *
 * Trié plutôt que noté : une note agrège des choses qui ne se comparent pas —
 * un retard n'est pas une date — et son résultat ne s'explique plus à celui qui
 * le lit. Trois règles enchaînées se disent en une phrase.
 */
export function rank(candidates: Candidate[]): Candidate[] {
  return [...candidates]
    .filter((c) => c.episodes.length > 0 && c.minutes > 0)
    .sort(
      (a, b) =>
        Number(late(b)) - Number(late(a)) ||
        b.lastWatchedAt - a.lastWatchedAt ||
        b.episodes.length - a.episodes.length ||
        a.animeId - b.animeId
    )
}

function reasonOf(c: Candidate, first: boolean): Reason {
  if (!first) return 'suite'
  if (c.lastWatchedAt === 0) return 'decouverte'
  return late(c) ? 'retard' : 'reprise'
}

/**
 * Compose la soirée.
 *
 * On remplit série par série dans l'ordre du classement, sans jamais dépasser,
 * puis on autorise un seul débordement s'il rapproche du but. Un épisode trop
 * long pour le temps restant n'interrompt pas la recherche : la série suivante
 * a peut-être des épisodes plus courts, et une demi-heure se remplit mieux avec
 * un format court qu'avec rien.
 */
export function buildSession(candidates: Candidate[], budget: number): Session {
  const ordered = rank(candidates)
  const slots: Slot[] = []
  let minutes = 0

  for (const c of ordered) {
    let first = true
    for (const episode of c.episodes) {
      if (minutes + c.minutes > budget) break
      slots.push({ animeId: c.animeId, title: c.title, episode, minutes: c.minutes, reason: reasonOf(c, first) })
      minutes += c.minutes
      first = false
    }
  }

  const left = budget - minutes
  if (left > 0) {
    // Le premier épisode encore libre qui remplit plus qu'il ne dépasse.
    for (const c of ordered) {
      const taken = slots.filter((s) => s.animeId === c.animeId).length
      const episode = c.episodes[taken]
      if (episode === undefined || c.minutes >= left * 2) continue
      slots.push({
        animeId: c.animeId,
        title: c.title,
        episode,
        minutes: c.minutes,
        reason: reasonOf(c, taken === 0)
      })
      minutes += c.minutes
      break
    }
  }

  return { slots, minutes, budget }
}
