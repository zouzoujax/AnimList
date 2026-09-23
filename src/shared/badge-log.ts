/**
 * Le registre des badges obtenus : lequel, et quand.
 *
 * Les badges se recalculent entièrement depuis l'historique à chaque
 * affichage — ils ne sont écrits nulle part. Rien ne disait donc *quand* l'un
 * d'eux était tombé, ni même qu'il venait de tomber : on le découvrait en
 * ouvrant la page des statistiques, sans savoir si c'était d'hier ou de juillet.
 *
 * Ce registre comble ce trou, et rien de plus : un identifiant, une date.
 *
 * **C'est lui qui porte la file d'attente.** Un badge qui reste à fêter est
 * simplement un badge gagné que le registre ne connaît pas encore ; il s'y
 * inscrit quand son carton s'efface. Rien à tenir à côté, et une fermeture de
 * l'app au milieu ne perd que l'annonce, jamais la victoire.
 *
 * Pur et testé : c'est lui qui décide ce qu'on fête, et une erreur ici sonne la
 * fanfare pour un badge gagné il y a trois mois.
 */

/**
 * La date des badges déjà gagnés quand le registre s'ouvre.
 *
 * Toutes les bibliothèques d'avant sont dans ce cas : leurs badges sont acquis,
 * et personne n'a noté le jour. L'inventer — en prenant aujourd'hui, ou le
 * dernier épisode vu — serait pire que de l'avouer.
 */
export const UNKNOWN_DATE = 0

/**
 * Le nombre de badges annoncés un par un.
 *
 * Un import de bibliothèque en débloque vingt d'un coup : les faire défiler
 * ferait des cartons pendant une minute et demie, et le vingtième n'aurait plus
 * rien d'une fête. Au-delà, les autres s'inscrivent ensemble et le dernier
 * carton dit combien ils sont.
 */
export const MAX_CHEERS = 3

/**
 * Le premier inventaire, inscrit en silence.
 *
 * Sans lui, la première ouverture après la mise à jour fêterait cent badges à
 * la suite, tous gagnés depuis des mois.
 */
export function firstInventory(unlocked: readonly string[]): Record<string, number> {
  const log: Record<string, number> = {}
  for (const id of unlocked) log[id] = UNKNOWN_DATE
  return log
}

/**
 * Les badges gagnés que le registre ne connaît pas encore.
 *
 * Vide tant que le registre n'a pas été ouvert : avant l'inventaire, « gagné et
 * pas inscrit » veut dire « gagné il y a longtemps », pas « vient de tomber ».
 *
 * Un badge inscrit n'en ressort jamais, même si son compte repasse sous la
 * barre — décocher un épisode par erreur ne devrait pas effacer une victoire,
 * et la refêter au recochage serait ridicule.
 */
export function freshBadges(unlocked: readonly string[], log: Record<string, number> | null): string[] {
  if (log === null) return []
  return unlocked.filter((id) => !(id in log))
}

/** Inscrit ces badges à cette date, sans toucher à ceux qui y sont déjà. */
export function withUnlocked(
  log: Record<string, number> | null,
  ids: readonly string[],
  now: number
): Record<string, number> {
  const date = Number.isFinite(now) && now > 0 ? now : UNKNOWN_DATE
  const next = { ...(log ?? {}) }
  for (const id of ids) if (!(id in next)) next[id] = date
  return next
}

/** La date d'obtention d'un badge : sa date, `UNKNOWN_DATE`, ou rien s'il n'est pas inscrit. */
export function unlockedAt(id: string, log: Record<string, number> | null): number | null {
  if (!log) return null
  return id in log ? log[id] : null
}
