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

export type RemoteRoute = 'page' | 'state' | 'tick' | 'open' | 'watch' | 'trailer' | 'unknown'

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
