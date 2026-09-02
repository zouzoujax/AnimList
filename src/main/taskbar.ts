/**
 * Ce que Windows sait faire, et que l'app n'utilisait pas.
 *
 * Trois choses, toutes visibles hors de la fenêtre — c'est justement leur
 * intérêt : elles servent au moment où l'app n'est pas au premier plan.
 *
 * - **La liste de raccourcis** de l'icône dans la barre des tâches. Un clic
 *   droit, et « Frieren — ép. 12 » ouvre directement la fiche. Reconstruite à
 *   chaque changement de la bibliothèque, puisque l'épisode change.
 * - **La barre de progression** sur cette même icône pendant un
 *   téléchargement de mise à jour : l'app minimisée dit quand même où elle en
 *   est.
 * - **Les touches multimédia** du clavier, mais seulement pendant qu'un
 *   épisode local est ouvert. Un raccourci global est *global* : le laisser
 *   posé en permanence volerait la touche « lecture » à Spotify et à tout le
 *   reste. C'est la raison d'être de `setPlayerActive`.
 *
 * Tout est silencieusement sans effet ailleurs que sur Windows.
 */

import { app, BrowserWindow, globalShortcut } from 'electron'
import { resumeTargets, shortcutLabel } from '@shared/resume'
import { snapshot } from './store'

const isWindows = process.platform === 'win32'

/** Windows n'affiche qu'une poignée d'entrées : au-delà, elles disparaissent. */
const MAX_SHORTCUTS = 5

/** L'argument qui porte la série à ouvrir, quand un raccourci relance l'app. */
export const OPEN_ARG = '--animelist-open='

/**
 * L'identifiant lu dans une ligne de commande, s'il y en a un.
 *
 * Exporté et pur : c'est ce qui relie un clic dans la barre des tâches à une
 * fiche, et une erreur ici ouvre la mauvaise série sans rien dire.
 */
export function openTargetFrom(argv: string[]): number | null {
  for (const arg of argv) {
    if (!arg.startsWith(OPEN_ARG)) continue
    const id = Number(arg.slice(OPEN_ARG.length))
    if (Number.isInteger(id) && id > 0) return id
  }
  return null
}

/**
 * Les arguments qui relancent l'app sur une série.
 *
 * En développement, l'exécutable est Electron lui-même : sans le chemin du
 * projet il s'ouvrirait sur rien du tout.
 */
function argsFor(animeId: number): string {
  const target = `${OPEN_ARG}${animeId}`
  return app.isPackaged ? target : `"${app.getAppPath()}" ${target}`
}

/** Reconstruit la liste de raccourcis depuis l'état courant de la bibliothèque. */
export function refreshJumpList(): void {
  if (!isWindows) return

  const data = snapshot()
  const media = new Map(
    data.media.map((m) => [m.id, { title: m.title.english ?? m.title.romaji, episodes: m.episodes }])
  )

  // L'index des épisodes vus, reconstruit ici : le magasin le garde pour lui,
  // et le recalcul sur quelques milliers de lignes ne coûte rien à ce rythme.
  const seen = new Map<number, Set<number>>()
  for (const ev of data.history) {
    const held = seen.get(ev.animeId) ?? new Set<number>()
    held.add(ev.episode)
    seen.set(ev.animeId, held)
  }

  const targets = resumeTargets(data.entries, media, seen, MAX_SHORTCUTS)

  try {
    if (!targets.length) {
      app.setJumpList(null)
      return
    }

    app.setJumpList([
      {
        type: 'custom',
        name: 'Reprendre',
        items: targets.map((target) => ({
          type: 'task' as const,
          title: shortcutLabel(target),
          description: `Ouvrir ${target.title}`,
          program: process.execPath,
          args: argsFor(target.animeId)
        }))
      }
    ])
  } catch (err) {
    // Une liste refusée — catégorie masquée par l'utilisateur, application non
    // enregistrée — ne doit rien casser : c'est un confort, pas une fonction.
    console.error('[taskbar] liste de raccourcis refusée', err)
  }
}

/** La progression du téléchargement, sur l'icône de la barre des tâches. */
export function setTaskbarProgress(win: BrowserWindow | null, fraction: number | null): void {
  if (!win || win.isDestroyed()) return
  // -1 efface la barre ; toute valeur entre 0 et 1 la dessine.
  win.setProgressBar(fraction === null ? -1 : Math.min(1, Math.max(0, fraction)))
}

// ---------------------------------------------------------------- touches

/**
 * Les touches multimédia, posées seulement pendant une lecture.
 *
 * `globalShortcut` prend la touche pour toute la session Windows, pas
 * seulement pour cette fenêtre : la garder en permanence empêcherait de mettre
 * en pause n'importe quel autre lecteur. Elle est donc prise à l'ouverture du
 * lecteur et rendue à sa fermeture.
 */
const KEYS: { accelerator: string; command: string }[] = [
  { accelerator: 'MediaPlayPause', command: 'playpause' },
  { accelerator: 'MediaNextTrack', command: 'next' },
  { accelerator: 'MediaPreviousTrack', command: 'previous' },
  { accelerator: 'MediaStop', command: 'stop' }
]

let holding = false

export function setPlayerActive(win: BrowserWindow, active: boolean): void {
  if (active === holding) return
  holding = active

  if (!active) {
    for (const { accelerator } of KEYS) globalShortcut.unregister(accelerator)
    return
  }

  for (const { accelerator, command } of KEYS) {
    // Une touche déjà prise par une autre application ne s'obtient pas : on
    // s'en passe plutôt que d'échouer bruyamment.
    const ok = globalShortcut.register(accelerator, () => {
      if (!win.isDestroyed()) win.webContents.send('player:command', command)
    })
    if (!ok) console.warn(`[taskbar] touche ${accelerator} déjà prise`)
  }
}

/** À la fermeture : une touche retenue après la sortie resterait volée. */
export function releaseMediaKeys(): void {
  holding = false
  globalShortcut.unregisterAll()
}
