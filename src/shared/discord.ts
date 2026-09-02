/**
 * Ce que Discord affiche, et la forme exacte qu'il attend.
 *
 * Le statut « Rich Presence » est une petite carte sous ton nom : une ligne en
 * gras, une ligne en dessous, une jaquette et un compte à rebours. Ce module
 * ne parle à personne — il décide seulement *quoi* montrer. Le tuyau est dans
 * `src/main/discord.ts`.
 *
 * Deux règles viennent de chez eux, mesurées et non supposées :
 *
 * - un texte d'activité fait entre 2 et 128 caractères, sinon la commande est
 *   refusée en bloc — un titre trop long ne serait pas coupé, il ferait
 *   disparaître toute la carte ;
 * - `large_image` accepte une adresse `https://` telle quelle. Vérifié en
 *   envoyant une jaquette AniList : Discord la renvoie réécrite en
 *   `mp:external/…`, autrement dit il la relaie lui-même. Rien à téléverser
 *   dans leur portail, et une jaquette qui change ne demande aucun réglage.
 *
 * Le compte à rebours n'est pas un nombre qu'on rafraîchit : on donne l'heure
 * de fin, et c'est le client Discord qui égrène les secondes tout seul. D'où
 * l'absence de mise à jour tant que rien ne bouge — et l'obligation de retirer
 * cette heure sur une pause, sinon elle continuerait de descendre dans le vide.
 */

/** Les opérations du protocole, telles qu'elles voyagent sur le tube. */
export const OP_HANDSHAKE = 0
export const OP_FRAME = 1
export const OP_CLOSE = 2
export const OP_PING = 3
export const OP_PONG = 4

/**
 * Discord n'ouvre pas toujours le même tube.
 *
 * Le premier client lancé prend `discord-ipc-0`, le suivant `-1`, et ainsi de
 * suite : quelqu'un qui fait tourner la version stable et Canary côte à côte
 * n'a pas forcément la première libre. On les essaie dans l'ordre.
 */
export const PIPE_COUNT = 10

/** Bornes de Discord sur un texte d'activité. Hors de là, tout est refusé. */
export const MIN_TEXT = 2
export const MAX_TEXT = 128

/**
 * Type 3, « Watching ». C'est lui qui met « Regarde » devant le nom de l'app.
 * Le mot vient de Discord, dans la langue du lecteur — on ne l'écrit pas.
 */
export const WATCHING = 3

/** Ce qu'on est en train de regarder, quelle que soit la source. */
export interface Watching {
  title: string
  episode: number | null
  /** Nombre d'épisodes de la série, quand il est connu. */
  total: number | null
  cover: string | null
  /** Secondes écoulées, et durée totale. Zéro quand on ne sait pas. */
  position: number
  duration: number
  paused: boolean
  /** Ce qu'on regarde quand ce n'est pas un épisode : « Bande-annonce ». */
  note?: string
}

/**
 * Ce que le lecteur intégré rapporte de lui-même.
 *
 * Partagé parce qu'il traverse la frontière : la fenêtre le pousse, le
 * processus principal le reçoit. Une seule définition, donc, sinon les deux
 * bords divergent au premier champ ajouté.
 */
export interface LocalWatching {
  animeId: number
  title: string
  episode: number | null
  /** Secondes. */
  position: number
  duration: number
  paused: boolean
}

/** Ce que les réglages affichent du statut : demandé, réel, et pourquoi. */
export interface DiscordStatus {
  /** Ce qui est coché dans les réglages. */
  on: boolean
  /** Ce qui est vrai : la poignée de main est passée. */
  connected: boolean
  error: string | null
}

/** Une activité, dans la forme littérale que la commande transporte. */
export interface Activity {
  type: number
  details: string
  state?: string
  timestamps?: { start?: number; end?: number }
  assets?: { large_image?: string; large_text?: string }
}

/**
 * Un identifiant d'application Discord.
 *
 * C'est un « snowflake » : dix-sept à vingt chiffres. Le vérifier ici évite de
 * lancer une connexion vouée à revenir avec « Invalid Client ID », et permet
 * aux réglages de dire pourquoi avant même d'essayer.
 */
export function looksLikeAppId(value: string): boolean {
  return /^\d{17,20}$/.test(value.trim())
}

/**
 * Un texte qui tient dans les bornes.
 *
 * Le raccourci porte des points de suspension : mieux vaut un titre visiblement
 * coupé qu'un titre coupé en douce. Le cas du caractère unique n'est pas
 * théorique — « K » est un vrai anime — et il reçoit un point pour atteindre le
 * minimum.
 */
export function clampText(text: string): string {
  const out = text.trim()
  if (out.length > MAX_TEXT) return `${out.slice(0, MAX_TEXT - 1)}…`
  if (out.length > 0 && out.length < MIN_TEXT) return `${out}.`
  return out
}

/** La ligne du bas : l'épisode, et l'état de la lecture. */
function stateOf(now: Watching): string | undefined {
  const episode =
    now.episode === null
      ? (now.note ?? null)
      : now.total && now.total > 0
        ? `Épisode ${now.episode} sur ${now.total}`
        : `Épisode ${now.episode}`

  if (now.paused) return clampText(episode ? `${episode} · En pause` : 'En pause')
  return episode ? clampText(episode) : undefined
}

/**
 * L'activité à envoyer, ou `null` quand il n'y a rien à annoncer.
 *
 * `hideTitle` n'atténue pas le message : il le remplace. Annoncer « Un anime »
 * tout en laissant la jaquette ou le numéro d'épisode ne cacherait rien du
 * tout — une jaquette se reconnaît mieux qu'un titre. Il ne reste donc que le
 * fait de regarder, sans horloge ni image.
 *
 * `at` est injectable pour que le calcul des horodatages soit vérifiable.
 */
export function activityOf(
  now: Watching | null,
  { hideTitle = false, at = Date.now() }: { hideTitle?: boolean; at?: number } = {}
): Activity | null {
  if (!now) return null
  if (hideTitle) return { type: WATCHING, details: 'Un anime' }

  const details = clampText(now.title)
  if (!details) return null

  const activity: Activity = { type: WATCHING, details }

  const state = stateOf(now)
  if (state) activity.state = state

  // En pause, aucune horloge : Discord ferait descendre un compte à rebours
  // pendant que l'image est arrêtée.
  if (!now.paused) {
    if (now.duration > 0 && now.duration > now.position) {
      // L'heure de fin donne « il reste 14:02 », qui dit quelque chose.
      activity.timestamps = { end: Math.round(at + (now.duration - now.position) * 1000) }
    } else if (now.position > 0) {
      // Durée inconnue — un direct, un lecteur qui ne la donne pas : on tombe
      // sur le temps écoulé, moins utile mais honnête.
      activity.timestamps = { start: Math.round(at - now.position * 1000) }
    }
  }

  if (now.cover) activity.assets = { large_image: now.cover, large_text: details }

  return activity
}

/**
 * Deux secondes de tolérance sur les horodatages.
 *
 * Recalculée à chaque tour, l'heure de fin bouge d'une poignée de
 * millisecondes même quand la lecture est parfaitement régulière. Comparée au
 * strict, elle ferait renvoyer l'activité en permanence — et Discord limite le
 * débit des envois.
 */
export const DRIFT_MS = 2000

/** Vrai quand renvoyer l'activité n'apprendrait rien à Discord. */
export function sameActivity(a: Activity | null, b: Activity | null): boolean {
  if (!a || !b) return a === b
  if (a.type !== b.type || a.details !== b.details || a.state !== b.state) return false
  if (a.assets?.large_image !== b.assets?.large_image) return false
  if (a.assets?.large_text !== b.assets?.large_text) return false

  const first = a.timestamps
  const second = b.timestamps
  if (!first || !second) return !first && !second
  if ((first.start === undefined) !== (second.start === undefined)) return false
  if ((first.end === undefined) !== (second.end === undefined)) return false
  return Math.abs((first.start ?? first.end ?? 0) - (second.start ?? second.end ?? 0)) <= DRIFT_MS
}
