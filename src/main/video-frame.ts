/**
 * Retrouver l'élément `video` d'une page, où qu'il se cache.
 *
 * Chez Anime-Sama, le lecteur vit dans une iframe d'un autre domaine, parfois
 * elle-même imbriquée. Une page ne peut rien y toucher — le processus
 * principal, si : `framesInSubtree` énumère tous les cadres, et
 * `executeJavaScript` s'exécute *dedans*. La politique d'origine ne s'applique
 * pas à un accès privilégié.
 *
 * Ce module est à part parce que deux appelants en ont besoin — celui qui
 * ouvre la fenêtre et celui qui la pilote — et qu'ils s'importeraient l'un
 * l'autre sans lui.
 */

import type { BrowserWindow, WebFrameMain } from 'electron'

/** Le lecteur met un moment à s'installer : on repasse plutôt que d'abandonner. */
const TRIES = 20
const EVERY_MS = 700

export interface VideoState {
  position?: number
  duration?: number
  volume?: number
  playing?: boolean
  /** Vrai quand c'est la vidéo qui est en plein écran, pas la fenêtre. */
  full?: boolean
}

/**
 * Le script qui trouve la vidéo dans un cadre, et agit dessus.
 *
 * La plus grande est la bonne : les lecteurs web posent souvent une vignette
 * d'aperçu ou une publicité vidéo minuscule à côté de la vraie. Trier par
 * surface visible évite de piloter le mauvais élément.
 */
export function videoScript(body: string): string {
  return `(function () {
    var all = Array.prototype.slice.call(document.querySelectorAll('video'))
    var v = all.sort(function (a, b) {
      return b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight
    })[0]
    if (!v) return null
    ${body}
  })()`
}

export const PROBE = videoScript(`
  return {
    position: v.currentTime || 0,
    duration: isFinite(v.duration) ? v.duration : 0,
    volume: Math.round((v.muted ? 0 : v.volume) * 100),
    playing: !v.paused,
    full: document.fullscreenElement !== null
  }
`)

/** Le premier cadre qui contient une vidéo, et ce qu'elle raconte. */
export async function videoFrame(win: BrowserWindow): Promise<{ frame: WebFrameMain; state: VideoState } | null> {
  if (win.isDestroyed()) return null

  for (const frame of win.webContents.mainFrame.framesInSubtree) {
    // Un cadre peut disparaître entre l'énumération et l'appel — une publicité
    // qui se referme, une navigation. L'échec ne doit pas interrompre le tour.
    const found: unknown = await frame.executeJavaScript(PROBE, true).catch(() => null)
    if (found && typeof found === 'object') return { frame, state: found }
  }
  return null
}

/**
 * Passe le lecteur en plein écran, et vérifie qu'il l'a obtenu.
 *
 * **Le conteneur, pas la vidéo.** Mettre l'élément `video` seul en plein écran
 * marche — et fait disparaître toutes les commandes du lecteur : sa barre de
 * progression, son volume, ses réglages vivent *à côté* de la vidéo dans le
 * document, pas dedans. Seul le contenu de l'élément agrandi reste visible.
 *
 * Le conteneur, c'est la racine du document du lecteur quand il est dans son
 * propre cadre — ce qui est le cas chez eux. Si la vidéo se trouvait dans la
 * page principale, agrandir sa racine montrerait le site entier : on prend
 * alors le parent direct de la vidéo, qui porte les commandes sans le reste.
 *
 * La demande peut être refusée — un cadre sans autorisation de plein écran, un
 * lecteur qui l'intercepte. Le plein écran arrivant de façon différée,
 * demander tout de suite si c'est fait répondrait toujours non : d'où
 * l'attente avant de constater.
 */
export async function videoFullscreen(win: BrowserWindow): Promise<boolean> {
  const video = await videoFrame(win)
  if (!video) return false

  const asked: unknown = await video.frame
    .executeJavaScript(
      videoScript(`
        var root = window.parent !== window ? document.documentElement : v.parentElement || v
        if (!root.requestFullscreen) return false
        root.requestFullscreen()
        return true
      `),
      true
    )
    .catch(() => false)
  if (asked !== true) return false

  await new Promise((resolve) => setTimeout(resolve, 350))
  const took: unknown = await video.frame
    .executeJavaScript('document.fullscreenElement !== null', true)
    .catch(() => false)
  return took === true
}

/**
 * Attend que le lecteur soit là, démarre la vidéo et la passe en plein écran.
 *
 * Rien n'est garanti : certains lecteurs ne créent leur `video` qu'après un
 * clic, et aucun code ne peut le donner à leur place — le cadre appartient à
 * un autre domaine, et un clic injecté n'y entre pas. On repasse pendant une
 * quinzaine de secondes, puis on renonce en silence : la page reste ouverte,
 * et il suffit alors de cliquer soi-même.
 */
export async function autostart(win: BrowserWindow, wantFullscreen: boolean): Promise<boolean> {
  for (let i = 0; i < TRIES; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, EVERY_MS))
    if (win.isDestroyed()) return false

    const video = await videoFrame(win)
    if (!video) continue

    // Le son est remis : un lecteur démarre parfois muet pour contourner les
    // règles de démarrage automatique, et une vidéo muette a l'air en panne.
    await video.frame.executeJavaScript(videoScript('v.muted = false; v.play(); return true'), true).catch(() => false)

    if (wantFullscreen) await videoFullscreen(win)
    return true
  }
  return false
}
