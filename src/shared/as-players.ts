/**
 * Les lecteurs d'une page d'épisodes chez Anime-Sama.
 *
 * Leur page porte un `<select id="selectLecteurs">` que leur script remplit
 * d'options « Lecteur 1 » à « Lecteur N », une par hébergeur déclaré (`eps1` à
 * `eps8`). Quand l'un ne marche pas — vidéo retirée, publicité qui ne se ferme
 * pas —, leur page dit elle-même d'en changer : « Pub insistante ou vidéo
 * indisponible ? Changez de lecteur ».
 *
 * Pur et testé : ce qui arrive de leur page est lu ici, en se méfiant de tout.
 */

/** Leur script ne déclare jamais plus de huit hébergeurs. */
export const MAX_PLAYERS = 8

/** Au-delà, un libellé n'est plus un nom de lecteur. */
const MAX_LABEL = 40

export interface PlayerChoice {
  /** Les libellés de leur menu, dans son ordre. */
  labels: string[]
  /** Celui qui est chargé, ou -1 si leur menu ne le dit pas. */
  current: number
}

/**
 * Ce que leur menu propose, ou rien quand il n'y a pas de choix à faire.
 *
 * Un seul lecteur n'est pas un choix : le sélecteur n'apparaît qu'à partir de
 * deux. Un libellé vide ou étrange garde sa place et prend un nom par défaut,
 * pour que le numéro affiché reste celui de leur menu.
 */
export function parsePlayers(raw: unknown): PlayerChoice | null {
  if (!raw || typeof raw !== 'object') return null
  const { labels, current } = raw as { labels?: unknown; current?: unknown }
  if (!Array.isArray(labels)) return null

  const clean = labels
    .slice(0, MAX_PLAYERS)
    .map((label, i) =>
      typeof label === 'string' && label.trim() ? label.trim().slice(0, MAX_LABEL) : `Lecteur ${i + 1}`
    )
  if (clean.length < 2) return null

  const known = typeof current === 'number' && Number.isInteger(current) && current >= 0 && current < clean.length
  return { labels: clean, current: known ? current : -1 }
}

/**
 * Un numéro de lecteur recevable depuis le téléphone, compté à partir de zéro.
 *
 * Il finit dans un script exécuté dans leur page : seul un entier borné passe.
 */
export function playerIndex(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < MAX_PLAYERS ? value : null
}
