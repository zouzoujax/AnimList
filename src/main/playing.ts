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
 * domaine. Une page ne peut rien y toucher — mais le processus principal, si :
 * `framesInSubtree` énumère tous les cadres, y compris ceux d'un autre
 * domaine, et `executeJavaScript` s'exécute *dedans*. La politique d'origine
 * ne s'applique pas à un accès privilégié, et on retrouve l'élément `video`
 * lui-même : lecture, pause, position, volume.
 *
 * Deux voies écartées en chemin, mesurées et non supposées :
 *
 * - `webContents.sendInputEvent` n'atteint que le cadre principal. Vérifié :
 *   le clic injecté arrive bien au parent, qui le voit « sur IFRAME », et le
 *   cadre enfant ne reçoit rien — chaque cadre d'un autre domaine vit dans son
 *   propre processus de rendu.
 * - Désactiver cette isolation ferait tout marcher d'un coup, et affaiblirait
 *   précisément la fenêtre qui en a le plus besoin : celle qui charge un site
 *   tiers plein de régies.
 *
 * `canSeek` reste donc une constatation, pas une supposition : vrai quand un
 * élément `video` a été trouvé, faux tant qu'il n'y en a pas — le lecteur
 * n'est pas encore chargé, ou la page n'en contient pas.
 */

import type { BrowserWindow } from 'electron'
import { videoFrame, videoFullscreen, videoScript, type VideoState } from './video-frame'
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

/** Ce qu'une commande transporte. Tout est facultatif : `close` n'a besoin de rien. */
export interface PlayerParams {
  /** Secondes pour `seek`, pourcentage pour `volume`. */
  value?: number
}

/** La fenêtre qui joue, s'il y en a une. La bande-annonce passe devant. */
function current(): { kind: PlayerKind; win: BrowserWindow } | null {
  const trailer = trailerWindow()
  if (trailer) return { kind: 'trailer', win: trailer }
  const watch = watchWindow()
  if (watch) return { kind: 'animesama', win: watch }
  return null
}

/**
 * Ce qui revient d'une page est vérifié, pas supposé.
 *
 * `executeJavaScript` rend `any` : la page pourrait être en cours de
 * chargement, ou avoir été remplacée. Un contrôle de forme coûte une ligne et
 * évite de lire des champs sur `null`.
 */
function isTrailerState(value: unknown): value is VideoState {
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

  if (found.kind !== 'trailer') {
    const video = await videoFrame(found.win)
    if (!video) return base
    return {
      ...base,
      position: video.state.position ?? 0,
      duration: video.state.duration ?? 0,
      volume: video.state.volume ?? 100,
      playing: video.state.playing ?? true,
      // L'un ou l'autre : la vidéo peut être en plein écran dans une fenêtre
      // qui ne l'est pas, et l'inverse arrive quand la demande a été refusée.
      fullscreen: video.state.full === true || found.win.isFullScreen(),
      // Constaté, pas supposé : on a la main sur un élément `video` réel.
      canSeek: true
    }
  }

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

export async function playerCommand(action: PlayerAction, params: PlayerParams = {}): Promise<boolean> {
  const found = current()
  if (!found) return false

  // Ce qui s'adresse à la fenêtre marche pour les deux.
  if (action === 'close') {
    if (found.kind === 'trailer') closeTrailerWindow()
    else closeWatchWindow()
    return true
  }
  /**
   * Le plein écran de la **vidéo**, pas de la fenêtre.
   *
   * Agrandir la fenêtre montrait leur page en grand — bandeau, menus et
   * publicités compris. Ce qu'on veut, c'est l'image seule.
   *
   * La demande peut être refusée : un cadre sans autorisation de plein écran,
   * ou un lecteur qui l'intercepte. On ne le suppose donc pas — on regarde
   * ensuite si elle a pris, et on agrandit la fenêtre à défaut. Mieux vaut le
   * moins bon des deux que rien.
   *
   * La bande-annonce garde le plein écran de fenêtre : sa page n'est qu'un
   * cadre occupant tout, les deux reviennent au même.
   */
  if ((action === 'fullscreen' || action === 'windowed') && found.kind !== 'trailer') {
    const video = await videoFrame(found.win)

    if (video && action === 'windowed') {
      await video.frame
        .executeJavaScript('document.exitFullscreen && document.exitFullscreen(), true', true)
        .catch(() => false)
      found.win.setFullScreen(false)
      return true
    }

    if (video && action === 'fullscreen' && (await videoFullscreen(found.win))) return true

    found.win.setFullScreen(action === 'fullscreen')
    return true
  }

  if (action === 'fullscreen' || action === 'windowed') {
    found.win.setFullScreen(action === 'fullscreen')
    return true
  }

  // Ce qui s'adresse au lecteur passe par la vidéo du cadre, chez eux.
  if (found.kind !== 'trailer') {
    const video = await videoFrame(found.win)
    if (!video) return false

    const arg = Number.isFinite(params.value) ? Number(params.value) : 0
    const body =
      action === 'play'
        ? 'v.muted = false; v.play(); return true'
        : action === 'pause'
          ? 'v.pause(); return true'
          : action === 'seek'
            ? `v.currentTime = ${arg}; return true`
            : action === 'volume'
              ? `v.volume = ${arg} / 100; v.muted = ${arg} === 0; return true`
              : null
    if (!body) return false

    const done: unknown = await video.frame.executeJavaScript(videoScript(body), true).catch(() => false)
    return done === true
  }

  const arg = Number.isFinite(params.value) ? Number(params.value) : 0
  return (await found.win.webContents
    .executeJavaScript(`window.__cmd ? window.__cmd(${JSON.stringify(action)}, ${arg}) : false`, true)
    .catch(() => false)) as boolean
}
