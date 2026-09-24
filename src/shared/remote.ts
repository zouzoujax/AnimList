/**
 * La télécommande : ce qui décide qui a le droit d'entrer.
 *
 * Ouvrir un serveur sur le réseau local, c'est ouvrir la bibliothèque à tout
 * ce qui est branché sur la même box — un colocataire, un objet connecté, un
 * invité sur le wifi. Le mot de passe est donc la fonctionnalité : sans lui,
 * n'importe qui cocherait des épisodes et lirait ce qu'on regarde.
 *
 * Ces règles-là sont pures et testées. Le serveur, lui, ne fait que les
 * appliquer : une erreur ici ne se verrait pas à l'usage, elle se découvrirait
 * le jour où quelqu'un d'autre s'en sert.
 */

/** Port par défaut. Haut, peu disputé, facile à retenir. */
export const REMOTE_PORT = 8787

/** Sans ambiguïté à l'œil : ni O/0, ni I/1, ni majuscules dispersées. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/**
 * Assez long pour qu'essayer au hasard ne serve à rien.
 *
 * Vingt caractères dans cet alphabet valent une centaine de bits : hors de
 * portée d'une machine du même réseau, et encore recopiable à la main.
 */
export const TOKEN_LENGTH = 20

/**
 * Fabrique un mot de passe.
 *
 * La source d'aléa est passée en paramètre : le processus principal fournit
 * celle du système, et le test une suite connue. Le tirage n'est pas fait ici,
 * seulement la mise en forme.
 */
export function makeToken(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < TOKEN_LENGTH; i += 1) out += ALPHABET[(bytes[i] ?? 0) % ALPHABET.length]
  return out
}

/**
 * Un mot de passe choisi à la main plutôt que tiré au hasard.
 *
 * Le tirage au sort est meilleur, et il reste ce qui se passe par défaut :
 * vingt caractères imprévisibles, renouvelés à chaque allumage. Mais il oblige
 * à rescanner le QR à chaque fois, et quelqu'un qui se sert de sa télécommande
 * tous les soirs préfère mettre son lien en favori une bonne fois.
 *
 * Ce choix a un prix, et ces règles-là sont ce qui l'empêche d'être trop
 * élevé : un mot de passe court se devine depuis le même réseau, et un mot de
 * passe qui ne tient pas dans une adresse ne se scanne plus.
 */
export const MIN_CHOSEN = 8
export const MAX_CHOSEN = 64

/**
 * Ce qu'une adresse transporte sans avoir à l'encoder.
 *
 * Le mot de passe voyage dans le lien, celui du QR code comme celui qu'on met
 * en favori. Un espace ou un accent y survivrait encodé, et ne se recopierait
 * plus à la main sans se tromper.
 */
const CHOSEN_OK = /^[A-Za-z0-9._~-]+$/

export type TokenCheck = { ok: true; token: string } | { ok: false; error: string }

/**
 * Accepte, ou dit pourquoi non.
 *
 * Le refus est une phrase et pas un booléen : c'est elle que les réglages
 * affichent, et deux formulations pour une même règle finiraient par diverger.
 */
export function checkChosen(raw: string): TokenCheck {
  const token = raw.trim()
  if (token.length < MIN_CHOSEN) return { ok: false, error: `Au moins ${MIN_CHOSEN} caractères.` }
  if (token.length > MAX_CHOSEN) return { ok: false, error: `Pas plus de ${MAX_CHOSEN} caractères.` }
  if (!CHOSEN_OK.test(token)) {
    return { ok: false, error: 'Lettres, chiffres, et . _ ~ - seulement : le mot de passe voyage dans l’adresse.' }
  }
  return { ok: true, token }
}

/**
 * Comparaison à durée constante.
 *
 * Une comparaison ordinaire s'arrête au premier caractère faux, et le temps
 * qu'elle met révèle combien de caractères étaient bons. Sur un réseau local,
 * où les allers-retours sont d'une milliseconde, ça se mesure.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Le mot de passe présenté par une requête, en-tête ou paramètre d'adresse. */
export function tokenFrom(url: string, header: string | null | undefined): string | null {
  if (header) {
    const bearer = /^Bearer\s+(.+)$/i.exec(header.trim())
    if (bearer) return bearer[1]
  }
  const at = url.indexOf('?')
  if (at < 0) return null
  return new URLSearchParams(url.slice(at + 1)).get('t')
}

export type RemoteRoute =
  | 'page'
  | 'state'
  | 'tick'
  | 'open'
  | 'watch'
  | 'trailer'
  | 'control'
  | 'player'
  | 'library'
  | 'discover'
  | 'add'
  | 'episodes'
  | 'franchise'
  | 'stats'
  | 'calendar'
  | 'ics'
  | 'unknown'

/**
 * Ce que demande une adresse.
 *
 * Une liste fermée, jamais un chemin traduit en fichier : c'est ce qui rend
 * impossible de faire servir autre chose que les réponses prévues.
 */
export function routeOf(pathname: string): RemoteRoute {
  switch (pathname.replace(/\/+$/, '') || '/') {
    case '/':
      return 'page'
    case '/api/state':
      return 'state'
    case '/api/tick':
      return 'tick'
    case '/api/open':
      return 'open'
    case '/api/watch':
      return 'watch'
    case '/api/trailer':
      return 'trailer'
    case '/api/control':
      return 'control'
    case '/api/player':
      return 'player'
    case '/api/library':
      return 'library'
    case '/api/discover':
      return 'discover'
    case '/api/stats':
      return 'stats'
    case '/api/calendar':
      return 'calendar'
    // Une vraie extension de fichier, et non `/api/…` : c'est l'adresse qu'on
    // colle dans un agenda, et certains refusent ce qui ne finit pas par .ics.
    case '/calendrier.ics':
      return 'ics'
    case '/api/add':
      return 'add'
    case '/api/episodes':
      return 'episodes'
    case '/api/franchise':
      return 'franchise'
    default:
      return 'unknown'
  }
}

/** La page elle-même se sert sans mot de passe : c'est elle qui le demande. */
export function needsToken(route: RemoteRoute): boolean {
  return route !== 'page' && route !== 'unknown'
}

/** Adresse à recopier sur le téléphone. */
export function remoteUrl(host: string, port: number, token: string): string {
  return `http://${host}:${port}/?t=${token}`
}

/**
 * Adresse à donner à un agenda.
 *
 * Le mot de passe voyage dans le lien et non dans un en-tête : un agenda qui
 * s'abonne ne sait rien envoyer d'autre qu'une adresse.
 */
export function icsUrl(host: string, port: number, token: string): string {
  return `http://${host}:${port}/calendrier.ics?t=${token}`
}
