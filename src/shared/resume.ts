/**
 * « Où en suis-je ? », calculé hors de la fenêtre.
 *
 * La fenêtre sait déjà répondre — c'est `nextEpisodeOf` dans son magasin —
 * mais la barre des tâches de Windows doit poser la même question sans qu'une
 * seule fenêtre soit ouverte. La règle est donc reprise ici, sur la forme
 * brute des données du processus principal, et testée : deux réponses
 * différentes à la même question feraient un raccourci qui ouvre le mauvais
 * épisode.
 */

/** Une série qu'on peut reprendre, et l'épisode où la reprendre. */
export interface ResumeTarget {
  animeId: number
  title: string
  episode: number
  updatedAt: number
}

/** Le premier épisode non coché, ou `null` si la série est finie. */
export function nextEpisode(seen: Set<number> | undefined, total: number | null): number | null {
  const limit = total && total > 0 ? total : Number.MAX_SAFE_INTEGER
  for (let ep = 1; ep <= limit; ep += 1) {
    if (!seen?.has(ep)) return ep
  }
  return null
}

/**
 * Les séries à reprendre, de la plus récemment touchée à la plus ancienne.
 *
 * Seulement celles en cours : un raccourci permanent vers une série terminée
 * ou seulement prévue ne rendrait service à personne, et la place est comptée
 * — Windows n'affiche qu'une poignée d'entrées.
 */
export function resumeTargets(
  entries: { animeId: number; status: string; updatedAt: number }[],
  media: Map<number, { title: string; episodes: number | null }>,
  seen: Map<number, Set<number>>,
  limit = 5
): ResumeTarget[] {
  const out: ResumeTarget[] = []

  for (const entry of entries) {
    if (entry.status !== 'watching') continue
    const found = media.get(entry.animeId)
    if (!found) continue
    const episode = nextEpisode(seen.get(entry.animeId), found.episodes)
    if (episode === null) continue
    out.push({ animeId: entry.animeId, title: found.title, episode, updatedAt: entry.updatedAt })
  }

  return out.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit)
}

/**
 * Le titre d'un raccourci de la barre des tâches.
 *
 * Windows coupe sans prévenir au-delà d'une longueur courte : couper nous-même
 * au mot le plus proche vaut mieux qu'un titre tranché au milieu d'une
 * syllabe, et l'épisode — la seule information qui change — doit survivre.
 */
export function shortcutLabel(target: ResumeTarget, max = 50): string {
  const tail = ` — ép. ${target.episode}`
  const room = max - tail.length
  if (target.title.length <= room) return target.title + tail

  const cut = target.title.slice(0, Math.max(1, room - 1))
  const space = cut.lastIndexOf(' ')
  return `${(space > room / 2 ? cut.slice(0, space) : cut).trimEnd()}…${tail}`
}
