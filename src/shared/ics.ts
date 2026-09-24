/**
 * Le calendrier des diffusions, au format iCalendar (RFC 5545).
 *
 * De quoi abonner l'agenda du téléphone aux sorties de ses séries : une fois
 * l'adresse ajoutée, les épisodes de la semaine y arrivent sans ouvrir le PC.
 * Rien ne sort du réseau local — c'est le serveur de la télécommande qui sert
 * ce fichier, à qui sait déjà son mot de passe.
 *
 * Pur et testé, comme le reste de ce qui part chez quelqu'un d'autre : un
 * fichier mal formé n'est pas signalé par l'agenda, il est simplement ignoré,
 * et on croit l'abonnement vide.
 *
 * **Un événement par série, celui de son prochain épisode.** AniList n'annonce
 * que celui-là ; le reste serait deviné. L'agenda relit le fichier de
 * lui-même toutes les quelques heures, si bien que l'épisode suivant paraît
 * dès que la grille avance.
 */

export interface IcsEvent {
  animeId: number
  title: string
  episode: number
  /** Millisecondes, comme partout ailleurs dans l'app. */
  airingAt: number
  /** Durée d'un épisode, pour que l'agenda ne pose pas un point sans épaisseur. */
  minutes: number
}

/** L'identité stable d'un événement : relire le fichier met à jour, il ne duplique pas. */
const uid = (ev: IcsEvent): string => `animelist-${ev.animeId}-${ev.episode}@animelist.local`

/** `20260924T183000Z` */
function stamp(ms: number): string {
  return `${new Date(ms).toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`
}

/**
 * Les caractères que la grammaire d'iCalendar se réserve.
 *
 * Un titre à virgule — « Fate/stay night: Unlimited Blade Works, Part 2 » —
 * couperait l'événement en deux valeurs sans ça.
 */
function escape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * Le pliage des lignes longues.
 *
 * La norme les borne à 75 octets, la suite décalée d'une espace. Compté en
 * octets et non en caractères : un titre japonais en fait trois par signe, et
 * couper au milieu de l'un d'eux donne un caractère de remplacement dans
 * l'agenda.
 */
function fold(line: string): string {
  // `TextEncoder` et non `Buffer` : ce module est dans `shared`, et rien n'y
  // doit dépendre de Node.
  const bytes = encoder.encode(line)
  if (bytes.length <= 75) return line

  const out: string[] = []
  let start = 0
  while (start < bytes.length) {
    // 75 la première fois, 74 ensuite : l'espace de continuation compte.
    const room = out.length === 0 ? 75 : 74
    let end = Math.min(start + room, bytes.length)
    // Reculer jusqu'au début d'un caractère : 10xxxxxx est une suite, pas un début.
    while (end < bytes.length && (bytes[end] & 0b1100_0000) === 0b1000_0000) end -= 1
    out.push(decoder.decode(bytes.subarray(start, end)))
    start = end
  }
  return out.join('\r\n ')
}

/** Toutes les quatre heures : assez pour suivre la grille, assez peu pour ne rien réveiller. */
const REFRESH = 'PT4H'

export function buildIcs(events: IcsEvent[], now = Date.now(), name = 'AnimeList — mes diffusions'): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AnimeList//Diffusions//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape(name)}`,
    // Deux façons de dire la même chose : la norme, et ce qu'Apple et Google
    // lisent vraiment.
    `REFRESH-INTERVAL;VALUE=DURATION:${REFRESH}`,
    `X-PUBLISHED-TTL:${REFRESH}`
  ]

  for (const ev of [...events].sort((a, b) => a.airingAt - b.airingAt)) {
    const minutes = ev.minutes > 0 ? ev.minutes : 24
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid(ev)}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(ev.airingAt)}`,
      `DTEND:${stamp(ev.airingAt + minutes * 60_000)}`,
      `SUMMARY:${escape(`${ev.title} — épisode ${ev.episode}`)}`,
      `DESCRIPTION:${escape(`Épisode ${ev.episode} de ${ev.title}, annoncé par AniList.`)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT'
    )
  }

  lines.push('END:VCALENDAR')
  // CRLF : la norme l'impose, et un agenda strict refuse le fichier sans.
  return lines.map(fold).join('\r\n') + '\r\n'
}
