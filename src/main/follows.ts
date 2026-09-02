/**
 * Suivre une personne ou un studio.
 *
 * L'app savait déjà afficher la filmographie d'un réalisateur ou le catalogue
 * d'un studio ; elle ne savait pas prévenir. Suivre, c'est demander à être
 * averti de ce qui arrive **après** — pas de recevoir la liste de ce qui
 * existe déjà.
 *
 * D'où la mécanique : au moment où l'on suit, tout ce qui est connu est noté
 * comme tel. Un balayage périodique redemande la liste et ne retient que les
 * identifiants qui n'y étaient pas. Ceux-là sont annoncés une fois, puis
 * versés aux connus — même s'ils n'ont jamais été ouverts, sans quoi la même
 * série serait annoncée à chaque passage.
 *
 * Rien n'est écrit dans la bibliothèque : à la différence du balayage des
 * suites, un suivi ne fait que montrer.
 */

import { BrowserWindow, Notification } from 'electron'
import type { Follow, FollowKind, FollowNews, Media } from '@shared/types'
import { latestWorks } from './anilist'
import { dropFollow, getFollows, getPrefs, patchFollow, putFollow } from './store'

/** Deux passages par jour suffisent : une annonce n'a pas d'heure. */
const CHECK_EVERY_MS = 12 * 3600_000

/** Au-delà, on prévient d'un seul coup plutôt que d'empiler les bulles. */
const MAX_TOASTS = 3

export const followKey = (kind: FollowKind, ref: number | string): string => `${kind}:${ref}`

/**
 * Ce qui est nouveau dans une liste, par rapport à ce qu'on connaissait.
 *
 * Séparé et pur : c'est la seule règle qui décide si l'utilisateur est
 * dérangé, et se tromper ici veut dire annoncer vingt vieilles séries.
 */
export function newcomers(known: number[], current: Media[]): Media[] {
  const seen = new Set(known)
  return current.filter((media) => !seen.has(media.id))
}

/**
 * Commence à suivre. Rend `null` si AniList ne connaît pas la référence.
 *
 * Tout ce qui existe déjà entre directement dans les connus : c'est ce qui
 * fait qu'un suivi est silencieux le jour où on le pose.
 */
export async function addFollow(kind: FollowKind, ref: number | string, fallbackName: string): Promise<Follow | null> {
  const found = await latestWorks(kind, ref, getPrefs().showAdult).catch((err) => {
    console.error('[follows]', (err as Error).message)
    return null
  })
  if (!found) return null

  return putFollow({
    key: followKey(kind, ref),
    kind,
    ref,
    name: found.name || fallbackName,
    image: found.image,
    addedAt: Date.now(),
    known: found.items.map((m) => m.id),
    fresh: [],
    lastCheck: Date.now()
  })
}

export function removeFollow(key: string): boolean {
  return dropFollow(key)
}

/** Marque les nouveautés comme vues — d'un suivi, ou de tous. */
export function markSeen(key?: string): void {
  for (const follow of getFollows()) {
    if (key && follow.key !== key) continue
    if (follow.fresh.length) patchFollow(follow.key, { fresh: [] })
  }
}

/**
 * Les nouveautés en attente, avec leurs fiches.
 *
 * Les fiches sont redemandées plutôt que gardées en base : le cache disque
 * d'AniList les a déjà, et les ranger dans la bibliothèque y laisserait des
 * séries que l'utilisateur ne suit pas.
 */
export async function followNews(): Promise<FollowNews[]> {
  const showAdult = getPrefs().showAdult
  const out: FollowNews[] = []

  for (const follow of getFollows()) {
    if (!follow.fresh.length) continue
    const found = await latestWorks(follow.kind, follow.ref, showAdult).catch(() => null)
    if (!found) continue
    const wanted = new Set(follow.fresh)
    const media = found.items.filter((m) => wanted.has(m.id))
    if (media.length) out.push({ follow, media })
  }

  return out
}

/**
 * Redemande la liste de chaque suivi et relève ce qui s'y est ajouté.
 *
 * Ne jette jamais : tourne sans surveillance, et une coupure réseau ne doit
 * ni faire tomber l'app ni vider un suivi. Un suivi dont la référence ne
 * répond plus est laissé intact, pour la même raison.
 */
export async function sweepFollows(win: BrowserWindow | null, force = false): Promise<Media[]> {
  const prefs = getPrefs()
  const now = Date.now()
  const found: Media[] = []

  for (const follow of getFollows()) {
    if (!force && now - follow.lastCheck < CHECK_EVERY_MS) continue

    const latest = await latestWorks(follow.kind, follow.ref, prefs.showAdult).catch((err) => {
      console.error('[follows]', follow.key, (err as Error).message)
      return null
    })
    if (!latest) continue

    const fresh = newcomers(follow.known, latest.items)

    // Les nouveaux passent aux connus dès maintenant, annoncés ou non : sinon
    // le balayage suivant les retrouverait et préviendrait une deuxième fois.
    patchFollow(follow.key, {
      known: [...new Set([...follow.known, ...latest.items.map((m) => m.id)])],
      fresh: [...new Set([...follow.fresh, ...fresh.map((m) => m.id)])],
      lastCheck: now,
      name: latest.name || follow.name,
      image: latest.image ?? follow.image
    })

    for (const media of fresh) {
      found.push(media)
      if (found.length <= MAX_TOASTS) notify(win, follow, media)
    }
  }

  if (found.length > MAX_TOASTS && prefs.notifications && Notification.isSupported()) {
    new Notification({
      title: 'AnimeList',
      body: `${found.length - MAX_TOASTS} autres nouveautés chez ceux que tu suis.`
    }).show()
  }

  return found
}

function notify(win: BrowserWindow | null, follow: Follow, media: Media): void {
  if (!getPrefs().notifications || !Notification.isSupported()) return

  const note = new Notification({
    title: `Du nouveau chez ${follow.name}`,
    body: media.title.english ?? media.title.romaji
  })
  note.on('click', () => {
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.focus()
    win.webContents.send('nav:open-anime', media.id)
  })
  note.show()
}

/**
 * Lance le balayage au démarrage, puis à intervalle régulier.
 *
 * Le premier passage est décalé : l'ouverture de l'app a déjà de quoi occuper
 * la file de requêtes, et une nouveauté peut attendre une minute.
 */
export function startFollowWatcher(win: BrowserWindow): () => void {
  const kick = (): void => {
    void sweepFollows(win).catch((err) => console.error('[follows]', err))
  }

  const first = setTimeout(kick, 60_000)
  const timer = setInterval(kick, CHECK_EVERY_MS)

  return () => {
    clearTimeout(first)
    clearInterval(timer)
  }
}
