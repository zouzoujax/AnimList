/**
 * La reprise après une panne d'AniList : quand revérifier, et quoi rejouer.
 *
 * Jusqu'ici le retour du service ne se constatait qu'au hasard de la requête
 * suivante. Une page ouverte pendant la panne gardait ses données d'hier
 * jusqu'à ce qu'on la quitte, et la veille des diffusions attendait son
 * prochain passage — une demi-heure plus tard. Deux règles pour y remédier :
 *
 * **Sonder, de plus en plus rarement.** Une requête minuscule, relancée avec
 * un délai qui double à chaque échec, jusqu'à un plafond. Une coupure d'une
 * minute se voit en une minute ; une coupure d'une semaine ne coûte qu'un
 * appel toutes les dix minutes.
 *
 * **Rejouer ce qui a échoué.** Chaque réponse qu'on a dû servir périmée, ou
 * pas servie du tout, est notée. Au retour, elles repartent en file de fond :
 * le cache se remet à jour sans que personne n'ait à revisiter chaque page.
 *
 * Pur et testé : c'est ce qui décide combien d'appels partent vers un service
 * limité à trente par minute.
 */

/** Le premier essai, peu après la panne : un hoquet réseau passe vite. */
export const PROBE_MIN_MS = 30_000

/** Jamais plus rare : au-delà, un retour tarderait trop à se voir. */
export const PROBE_MAX_MS = 10 * 60_000

/** Le délai du sondage suivant, après un échec. */
export function nextProbeDelay(previous: number): number {
  if (!Number.isFinite(previous) || previous < PROBE_MIN_MS) return PROBE_MIN_MS
  return Math.min(previous * 2, PROBE_MAX_MS)
}

/**
 * Combien de réponses on se promet de rejouer.
 *
 * À trente requêtes par minute, quarante rejouées occupent la file une minute
 * et demie. Au-delà, on garderait les plus récentes : ce sont les pages qu'on
 * vient de regarder, les plus susceptibles d'être rouvertes.
 */
export const REPLAY_MAX = 40

/**
 * Le carnet des requêtes à rejouer.
 *
 * Une clé n'y figure qu'une fois : dix visites de la même fiche pendant la
 * panne ne valent qu'un rappel. Une clé revue remonte en tête, pour que
 * l'éviction frappe ce qu'on a le moins récemment voulu.
 */
export class ReplayBook<T> {
  private readonly rows = new Map<string, T>()

  constructor(private readonly max = REPLAY_MAX) {}

  note(key: string, value: T): void {
    this.rows.delete(key)
    this.rows.set(key, value)
    while (this.rows.size > this.max) {
      const oldest = this.rows.keys().next().value
      if (oldest === undefined) break
      this.rows.delete(oldest)
    }
  }

  /** Une requête passée depuis n'a plus rien à rejouer. */
  settle(key: string): void {
    this.rows.delete(key)
  }

  get size(): number {
    return this.rows.size
  }

  /** Vide le carnet et rend son contenu, du plus ancien au plus récent. */
  drain(): [string, T][] {
    const out = [...this.rows.entries()]
    this.rows.clear()
    return out
  }
}

/**
 * La plus ancienne donnée montrée pendant la panne.
 *
 * C'est elle que le témoin annonce : « données d'il y a trois heures » dit
 * mieux que « hors ligne » ce qu'on a sous les yeux. La plus ancienne et non la
 * dernière, parce qu'un chiffre rassurant qui ne vaut que pour une page sur
 * dix serait un mensonge par omission.
 */
export function oldestShown(current: number | undefined, at: number): number {
  return current === undefined ? at : Math.min(current, at)
}

/** « à l'instant », « il y a 12 min », « il y a 3 h », « il y a 2 j ». */
export function ageLabel(at: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - at) / 60_000))
  if (minutes < 2) return 'à l’instant'
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 36) return `il y a ${hours} h`
  return `il y a ${Math.round(hours / 24)} j`
}
