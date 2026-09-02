/**
 * Piloter, depuis le téléphone, ce qui joue sur le PC.
 *
 * Deux fenêtres peuvent être ouvertes, et elles n'offrent pas les mêmes
 * prises. La différence n'est pas un choix : elle vient de qui possède le
 * lecteur.
 *
 * **La bande-annonce** est notre page, servie par `trailer.ts` sur la boucle
 * locale. On y a mis un pont vers le lecteur de YouTube : lecture, pause,
 * position, volume, tout est atteignable.
 *
 * **Anime-Sama** est leur page, et leur lecteur vit dans une iframe d'un autre
 * domaine. La politique d'origine du navigateur interdit d'y toucher — ce
 * n'est pas une pudeur, c'est une impossibilité technique, et la contourner
 * demanderait précisément ce que cette app refuse de faire. Restent les
 * commandes qui s'adressent à la **fenêtre** et non au lecteur : plein écran
 * et fermeture.
 *
 * D'où `canSeek` : le téléphone n'affiche que les boutons qui marchent, plutôt
 * que d'en proposer qui ne répondent pas.
 */

import type { BrowserWindow } from 'electron'
import { closeTrailerWindow, trailerWindow } from './trailer'
import { closeWatchWindow, watchWindow } from './watch-window'

export type PlayerKind = 'trailer' | 'animesama'

export interface PlayerState {
  kind: PlayerKind
  title: string
  /** Secondes. Zéro quand la position n'est pas connue. */
  position: number
  duration: number
  /** De 0 à 100. */
  volume: number
  playing: boolean
  fullscreen: boolean
  /** Faux pour un lecteur qu'on ne peut pas atteindre : la barre est masquée. */
  canSeek: boolean
}

export type PlayerAction = 'play' | 'pause' | 'seek' | 'volume' | 'fullscreen' | 'windowed' | 'close'

/** La fenêtre qui joue, s'il y en a une. La bande-annonce passe devant. */
function current(): { kind: PlayerKind; win: BrowserWindow } | null {
  const trailer = trailerWindow()
  if (trailer) return { kind: 'trailer', win: trailer }
  const watch = watchWindow()
  if (watch) return { kind: 'animesama', win: watch }
  return null
}

interface RawTrailerState {
  position?: number
  duration?: number
  volume?: number
  playing?: boolean
}

/**
 * Ce qui revient d'une page est vérifié, pas supposé.
 *
 * `executeJavaScript` rend `any` : la page pourrait être en cours de
 * chargement, ou avoir été remplacée. Un contrôle de forme coûte une ligne et
 * évite de lire des champs sur `null`.
 */
function isTrailerState(value: unknown): value is RawTrailerState {
  return typeof value === 'object' && value !== null
}

export async function playerState(): Promise<PlayerState | null> {
  const found = current()
  if (!found) return null

  const base: PlayerState = {
    kind: found.kind,
    title: found.win.getTitle(),
    position: 0,
    duration: 0,
    volume: 100,
    playing: true,
    fullscreen: found.win.isFullScreen(),
    canSeek: found.kind === 'trailer'
  }

  if (found.kind !== 'trailer') return base

  // La page expose son état ; une page pas encore chargée n'a pas la fonction,
  // et l'absence d'état ne doit pas faire disparaître les boutons.
  const raw: unknown = await found.win.webContents
    .executeJavaScript('window.__player ? window.__player() : null', true)
    .catch(() => null)
  if (!isTrailerState(raw)) return base
  const state = raw

  return {
    ...base,
    position: state.position ?? 0,
    duration: state.duration ?? 0,
    volume: state.volume ?? 100,
    playing: state.playing ?? true
  }
}

export async function playerCommand(action: PlayerAction, value?: number): Promise<boolean> {
  const found = current()
  if (!found) return false

  // Ce qui s'adresse à la fenêtre marche pour les deux.
  if (action === 'close') {
    if (found.kind === 'trailer') closeTrailerWindow()
    else closeWatchWindow()
    return true
  }
  if (action === 'fullscreen' || action === 'windowed') {
    found.win.setFullScreen(action === 'fullscreen')
    return true
  }

  // Ce qui s'adresse au lecteur ne marche que sur le nôtre.
  if (found.kind !== 'trailer') return false

  const arg = Number.isFinite(value) ? Number(value) : 0
  return (await found.win.webContents
    .executeJavaScript(`window.__cmd ? window.__cmd(${JSON.stringify(action)}, ${arg}) : false`, true)
    .catch(() => false)) as boolean
}
