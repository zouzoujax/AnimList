/**
 * Publier une notification pour le téléphone, par ntfy.
 *
 * Les règles — sujet, serveur accepté, forme du message — sont dans
 * `shared/phone-push.ts`. Ici, seulement l'envoi et le souvenir de ce qui est
 * parti, pour ne jamais sonner deux fois pour le même épisode.
 */

import { randomBytes } from 'node:crypto'
import {
  checkServer,
  isTopic,
  makeTopic,
  pushBody,
  pushKey,
  topicUrl,
  type PhonePushStatus,
  type PushMessage
} from '@shared/phone-push'
import { getPrefs, setPrefs } from './store'
import { remoteStatus } from './remote'

const TIMEOUT_MS = 10_000

/** Les épisodes déjà annoncés sur le téléphone pendant cette séance. */
const sent = new Set<string>()

export function phonePushStatus(): PhonePushStatus {
  const prefs = getPrefs()
  const topic = isTopic(prefs.phonePushTopic) ? prefs.phonePushTopic : ''
  return {
    on: prefs.phonePush && !!topic,
    server: prefs.phonePushServer,
    topic,
    url: topic ? topicUrl(prefs.phonePushServer, topic) : null
  }
}

/** Allume, avec un sujet neuf s'il n'y en a pas encore. */
export function enablePhonePush(on: boolean): PhonePushStatus {
  const prefs = getPrefs()
  const topic = isTopic(prefs.phonePushTopic) ? prefs.phonePushTopic : makeTopic(randomBytes(32))
  setPrefs({ phonePush: on, phonePushTopic: topic })
  return phonePushStatus()
}

/**
 * Un sujet neuf. L'ancien cesse de recevoir quoi que ce soit : c'est le geste
 * à faire si l'adresse a fuité, et il faut alors se réabonner.
 */
export function newPhonePushTopic(): PhonePushStatus {
  setPrefs({ phonePushTopic: makeTopic(randomBytes(32)) })
  return phonePushStatus()
}

export function setPhonePushServer(raw: string): { ok: boolean; error?: string; status: PhonePushStatus } {
  const checked = checkServer(raw)
  if (!checked.ok) return { ok: false, error: checked.error, status: phonePushStatus() }
  setPrefs({ phonePushServer: checked.server })
  return { ok: true, status: phonePushStatus() }
}

async function publish(msg: PushMessage): Promise<{ ok: boolean; error?: string }> {
  const { on, server, topic } = phonePushStatus()
  if (!on) return { ok: false, error: 'Notifications du téléphone éteintes.' }
  const checked = checkServer(server)
  if (!checked.ok) return { ok: false, error: checked.error }
  try {
    const res = await fetch(checked.server, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: pushBody(topic, msg),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!res.ok) return { ok: false, error: `Le serveur ntfy a répondu ${res.status}.` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Serveur ntfy injoignable : ${(err as Error).message}` }
  }
}

/**
 * Toucher la notification ouvre la télécommande, si elle est allumée : on
 * arrive sur la série à reprendre, sur le réseau de la maison. Ailleurs,
 * l'adresse ne mènerait nulle part, d'où l'absence de lien quand elle est éteinte.
 */
function clickTarget(): string | undefined {
  const remote = remoteStatus()
  return remote.on && remote.url ? remote.url.replace(/\?.*$/, '') : undefined
}

/** Un épisode sorti, annoncé une seule fois. */
export function pushEpisode(animeId: number, episode: number, title: string, soon?: number): void {
  const key = soon ? `${pushKey(animeId, episode)}:bientôt` : pushKey(animeId, episode)
  if (sent.has(key) || !phonePushStatus().on) return
  sent.add(key)
  void publish({
    title: soon ? `Bientôt : épisode ${episode}` : `Épisode ${episode} disponible`,
    message: soon ? `${title} — dans ${soon} min` : title,
    click: clickTarget()
  }).then((res) => {
    // Raté : on oublie l'avoir envoyé, pour que le rattrapage réessaie.
    if (!res.ok) {
      sent.delete(key)
      console.warn('[ntfy]', res.error)
    }
  })
}

/** Le bouton « Envoyer un essai » des réglages. */
export function testPhonePush(): Promise<{ ok: boolean; error?: string }> {
  return publish({
    title: 'AnimeList',
    message: 'Ça marche : les prochains épisodes arriveront ici.',
    tags: ['white_check_mark'],
    click: clickTarget()
  })
}
