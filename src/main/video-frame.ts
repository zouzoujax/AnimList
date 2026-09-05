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
  /** L'adresse du fichier joué : ce qui distingue un épisode du suivant. */
  src?: string
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
    full: document.fullscreenElement !== null,
    src: v.currentSrc || ''
  }
`)

/**
 * De quoi reconnaître un lecteur d'un autre.
 *
 * Le cadre et le fichier joué : deux épisodes ne partagent pas la seconde, et
 * un lecteur remplacé change généralement la première. C'est ce qui permet de
 * dire « ce n'est plus le même » sans avoir à le supposer.
 */
export function playerSignature(found: { frame: WebFrameMain; state: VideoState }): string {
  // Un cadre détruit entre-temps refuse de dire son adresse.
  let url: string
  try {
    url = found.frame.url
  } catch {
    url = ''
  }
  return `${url}|${found.state.src ?? ''}`
}

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
 * Le plein écran, sans demander de plein écran.
 *
 * **Mesuré sur leur site, et c'est ce qui a tranché.** Leur page ne remplace
 * pas le cadre du lecteur quand on change d'épisode : elle en change l'adresse.
 * Or Chromium quitte le plein écran dès qu'un cadre agrandi navigue — que ce
 * soit celui du document intérieur ou le cadre lui-même. Le plein écran était
 * donc perdu à chaque épisode, la fenêtre revenait une seconde à sa taille,
 * puis on le redemandait. C'est cette seconde qu'on voyait.
 *
 * Alors on ne le demande plus. La fenêtre est agrandie par l'app, et le cadre
 * du lecteur est étalé sur toute la page par une règle de style. Il n'y a plus
 * aucun état de plein écran à perdre : le cadre reste à 1920x1080 pendant que
 * sa source change, mesuré à toutes les demi-secondes de la bascule.
 *
 * La règle vise un attribut qu'on pose nous-mêmes, et tout est réversible : le
 * style reste inerte tant que la classe n'est pas sur `<html>`.
 */
const CINEMA = `
  var f = document.getElementById('playerDF')
  if (!f) {
    var all = Array.prototype.slice.call(document.querySelectorAll('iframe'))
    f = all.sort(function (a, b) { return b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight })[0]
  }
  if (!f) return false
  f.setAttribute('data-animelist-cine', '1')
  var st = document.getElementById('animelist-cine-style')
  if (!st) {
    st = document.createElement('style')
    st.id = 'animelist-cine-style'
    st.textContent = 'html.animelist-cine, html.animelist-cine body { overflow:hidden !important; background:#000 !important; } html.animelist-cine [data-animelist-cine] { position:fixed !important; top:0 !important; left:0 !important; width:100vw !important; height:100vh !important; max-width:none !important; max-height:none !important; margin:0 !important; border:0 !important; z-index:2147483646 !important; }'
    document.head.appendChild(st)
  }
  document.documentElement.classList.add('animelist-cine')
  return true
`

/**
 * Les fenêtres en mode cinéma.
 *
 * Deux comportements en dépendent — la touche Échap et le refus du plein écran
 * du lecteur — et ils vivent dans la fenêtre, pas ici. Un ensemble faible :
 * une fenêtre fermée s'en retire toute seule.
 */
const inCinema = new WeakSet<BrowserWindow>()

export function isCinema(win: BrowserWindow): boolean {
  return inCinema.has(win)
}

/** Étale le lecteur sur l'écran. Vrai si le cadre a été trouvé. */
export async function enterCinema(win: BrowserWindow): Promise<boolean> {
  if (win.isDestroyed()) return false
  const done: unknown = await win.webContents.mainFrame
    .executeJavaScript(`(function () { try { ${CINEMA} } catch (e) { return false } })()`, true)
    .catch(() => false)
  inCinema.add(win)
  win.setFullScreen(true)
  return done === true
}

/** Rend la page à sa mise en page, et la fenêtre à sa taille. */
export async function leaveCinema(win: BrowserWindow): Promise<void> {
  if (win.isDestroyed()) return
  await win.webContents.mainFrame
    .executeJavaScript(
      `(function () {
        document.documentElement.classList.remove('animelist-cine')
        var f = document.querySelector('[data-animelist-cine]')
        if (f) f.removeAttribute('data-animelist-cine')
        // Le plein écran du lecteur, s'il a été pris par leur bouton.
        if (document.fullscreenElement) document.exitFullscreen()
        return true
      })()`,
      true
    )
    .catch(() => false)
  inCinema.delete(win)
  win.setFullScreen(false)
}

/**
 * Sort du plein écran partout, et attend que ce soit fait.
 *
 * **À appeler avant de remplacer le lecteur.** Chromium tient l'état du plein
 * écran dans le document du haut autant que dans le cadre agrandi ; un élément
 * agrandi qui disparaît du document sans que personne n'ait quitté le plein
 * écran laisse cet état à moitié posé. La page du haut se croit encore
 * agrandie, et toute demande suivante est refusée — la nôtre comme celle du
 * bouton de leur lecteur, qui cesse alors de fonctionner jusqu'au rechargement.
 *
 * En sortir volontairement d'abord coûte le même dixième de seconde et ne
 * laisse rien derrière.
 */
export async function exitFullscreen(win: BrowserWindow): Promise<void> {
  if (win.isDestroyed()) return
  for (const frame of win.webContents.mainFrame.framesInSubtree) {
    await frame
      .executeJavaScript('if (document.fullscreenElement) document.exitFullscreen(); true', true)
      .catch(() => false)
  }
  // La sortie est différée : demander tout de suite si c'est fait répondrait
  // toujours non, et remplacer le cadre dans la foulée annulerait le bénéfice.
  await new Promise((resolve) => setTimeout(resolve, 200))
}

/**
 * Combien de tours on accepte d'attendre le *nouveau* lecteur avant de se
 * contenter de celui qui est là. Certains lecteurs se réutilisent tels quels,
 * et attendre indéfiniment un remplacement qui n'arrive pas ne démarrerait
 * jamais rien.
 */
const STALE_TRIES = 16

/**
 * Attend que le lecteur soit là, démarre la vidéo et la passe en plein écran.
 *
 * Rien n'est garanti : certains lecteurs ne créent leur `video` qu'après un
 * clic, et aucun code ne peut le donner à leur place — le cadre appartient à
 * un autre domaine, et un clic injecté n'y entre pas. On repasse pendant une
 * quinzaine de secondes, puis on renonce en silence : la page reste ouverte,
 * et il suffit alors de cliquer soi-même.
 *
 * `stale` est la signature du lecteur qu'on vient de quitter, lors d'un
 * changement d'épisode. Sans elle, le plein écran se perdait une fois sur
 * deux : le premier tour tombait sur l'ancien lecteur, encore en place, le
 * démarrait et l'agrandissait — puis le site remplaçait le cadre, l'élément
 * agrandi disparaissait avec lui, et personne ne redemandait rien.
 */
export async function autostart(
  win: BrowserWindow,
  wantFullscreen: boolean,
  stale: string | null = null
): Promise<boolean> {
  for (let i = 0; i < TRIES; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, EVERY_MS))
    if (win.isDestroyed()) return false

    const video = await videoFrame(win)
    if (!video) continue
    // L'ancien lecteur est encore en place : le démarrer maintenant rejouerait
    // ce qu'on vient de quitter, et le plein écran demandé partirait avec le
    // cadre remplacé.
    if (stale && i < STALE_TRIES && playerSignature(video) === stale) continue

    // Le son est remis : un lecteur démarre parfois muet pour contourner les
    // règles de démarrage automatique, et une vidéo muette a l'air en panne.
    await video.frame.executeJavaScript(videoScript('v.muted = false; v.play(); return true'), true).catch(() => false)

    if (!wantFullscreen) return true
    await enterCinema(win)

    /**
     * Une seule reprise, deux secondes plus tard.
     *
     * Il arrive qu'un lecteur se reconstruise une fois de plus juste après son
     * démarrage — une publicité qui se referme, une source de secours : le
     * plein écran obtenu part alors avec l'ancien élément. Une seule reprise
     * couvre ce cas sans se mettre à lutter contre quelqu'un qui vient d'en
     * sortir volontairement.
     */
    await new Promise((resolve) => setTimeout(resolve, 2000))
    if (win.isDestroyed()) return true
    // Le cadre a pu être remis en place derrière nous — une publicité qui se
    // referme, une source de secours : la règle se repose sans rien coûter.
    await enterCinema(win)
    return true
  }
  return false
}
