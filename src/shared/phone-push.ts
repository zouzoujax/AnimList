/**
 * Les notifications sur le téléphone, par ntfy.
 *
 * La télécommande est une page en HTTP sur le réseau local, et un navigateur
 * n'y accorde pas les notifications : il faut une origine sûre, et le chemin
 * d'une notification poussée passe de toute façon par un service extérieur.
 * ntfy est ce service le plus simple : une application gratuite sur le
 * téléphone s'abonne à un « sujet », et le PC y publie par une requête.
 *
 * **Éteint par défaut, et c'est délibéré.** Allumer, c'est envoyer le titre
 * d'une série et un numéro d'épisode à un serveur — ntfy.sh, ou le sien. Le
 * sujet est tiré au hasard et fait office de mot de passe : sur un serveur
 * public, qui le connaît peut lire les messages.
 *
 * Pur et testé : c'est ce qui décide de ce qui part de la machine.
 */

export const DEFAULT_PUSH_SERVER = 'https://ntfy.sh'

export interface PhonePushStatus {
  on: boolean
  server: string
  topic: string
  /** L'adresse à ouvrir dans l'app ntfy pour s'abonner. */
  url: string | null
}

/** Sans ambiguïté à l'œil, comme le mot de passe de la télécommande. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/** Vingt caractères tirés au hasard : une centaine de bits, hors de portée d'un curieux. */
export const TOPIC_RANDOM = 20

/** Un sujet neuf. L'aléa vient du processus principal ; seule la mise en forme est ici. */
export function makeTopic(bytes: Uint8Array): string {
  let out = 'animelist-'
  for (let i = 0; i < TOPIC_RANDOM; i += 1) out += ALPHABET[(bytes[i] ?? 0) % ALPHABET.length]
  return out
}

/** Ce que ntfy accepte comme nom de sujet. */
export function isTopic(topic: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(topic)
}

export type ServerCheck = { ok: true; server: string } | { ok: false; error: string }

/**
 * Un serveur ntfy, ou pourquoi non.
 *
 * `http` n'est accepté que sur une adresse privée : un serveur chez soi n'a
 * pas toujours de certificat, mais un message en clair ne doit pas traverser
 * Internet.
 */
export function checkServer(raw: string): ServerCheck {
  const text = raw.trim().replace(/\/+$/, '')
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return { ok: false, error: 'Adresse illisible : elle commence par https://' }
  }
  if (url.search || url.hash || (url.pathname && url.pathname !== '/')) {
    return { ok: false, error: 'Juste l’adresse du serveur, sans chemin : https://ntfy.sh' }
  }
  const privateHost = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)
  if (url.protocol === 'https:' || (url.protocol === 'http:' && privateHost)) {
    return { ok: true, server: `${url.protocol}//${url.host}` }
  }
  return { ok: false, error: 'En https, ou en http sur le réseau local seulement.' }
}

/** L'adresse du sujet, à ouvrir dans l'app ntfy ou dans un navigateur. */
export function topicUrl(server: string, topic: string): string {
  return `${server.replace(/\/+$/, '')}/${topic}`
}

export interface PushMessage {
  title: string
  message: string
  /** Le sujet ntfy des étiquettes : `tv` donne une petite icône de télé. */
  tags?: string[]
  /** Ouvert au toucher de la notification, s'il y en a un. */
  click?: string
}

/**
 * Le corps de la publication, en JSON.
 *
 * Le JSON plutôt que les en-têtes : un titre japonais ou accentué ne passe pas
 * dans un en-tête HTTP sans encodage, et la moitié des titres en ont besoin.
 */
export function pushBody(topic: string, msg: PushMessage): string {
  return JSON.stringify({
    topic,
    title: msg.title,
    message: msg.message,
    tags: msg.tags ?? ['tv'],
    ...(msg.click ? { click: msg.click } : {})
  })
}

/**
 * Déjà envoyé ? Une clé par épisode, pour que le minuteur de la sortie et le
 * rattrapage qui suit ne sonnent pas deux fois pour le même.
 */
export const pushKey = (animeId: number, episode: number): string => `${animeId}:${episode}`
