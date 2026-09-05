/**
 * Cocher l'épisode fini, et enchaîner le suivant.
 *
 * Tout existait déjà séparément : l'app sait quel épisode elle a lancé, elle
 * voit la position et la durée du lecteur d'Anime-Sama à travers son iframe,
 * et elle sait actionner leur propre sélecteur d'épisodes. Personne ne reliait
 * les trois — d'où une case à cocher à la main après chaque épisode, sur cent
 * sept séries.
 *
 * **Rien n'est extrait, rien n'est contourné.** C'est leur page, leur lecteur,
 * leur menu ; on regarde une vidéo qui joue déjà et on choisit une option dans
 * une liste, exactement comme un visiteur.
 *
 * La règle — quand un épisode est vu, quand il est fini — vit dans
 * `@shared/binge`, à part et testée : elle décide d'une écriture dans la
 * bibliothèque, et une erreur y coche des épisodes que personne n'a regardés.
 *
 * Le compte à rebours est posé *dans le cadre du lecteur*, pas dans une
 * fenêtre à nous : au moment où il compte, la vidéo est en plein écran, et
 * seul ce qui vit dans l'élément agrandi reste visible.
 */

import { shouldAdvance, shouldTick, type Playing } from '@shared/binge'
import { canTick } from '@shared/airing'
import { videoFrame } from './video-frame'
import { getLaunched, rememberLaunch } from './now'
import { getMedia, getPrefs, isWatched, setWatched } from './store'
import { playNext, watchWindow } from './watch-window'

/** Assez souvent pour ne pas manquer une fin, assez rare pour ne rien coûter. */
const POLL_MS = 5000

/** Le temps laissé pour dire non avant que le suivant ne parte. */
const COUNTDOWN_S = 8

/** Le drapeau que pose le bouton « Annuler », lu depuis le processus principal. */
const CANCEL_FLAG = '__animelistNextCancelled'

/**
 * L'épisode dont on s'est déjà occupé.
 *
 * Sans mémoire, le tour suivant recocherait et relancerait le même : la
 * position ne redescend pas toute seule.
 */
let ticked: string | null = null
let advancing: string | null = null

/** Ceux dont on a refusé la suite : on ne repropose pas dix secondes après. */
const refused = new Set<string>()

const keyOf = (animeId: number, episode: number): string => `${animeId}:${episode}`

/**
 * Le carton du compte à rebours, posé dans le document du lecteur.
 *
 * Il ne remplace rien et ne masque rien : un rectangle en bas à droite,
 * au-dessus de tout, qui disparaît de lui-même. Le bouton ne fait que poser un
 * drapeau — c'est le processus principal qui décide, et une page qui aurait
 * changé entre-temps ne peut donc rien lancer.
 *
 * Exporté pour être mesurable : une faute de syntaxe dans ce texte ne
 * provoquerait aucune erreur visible, elle ferait simplement disparaître le
 * compte à rebours. Le seul moyen de le savoir est de l'exécuter dans une
 * vraie page.
 */
export function countdownScript(seconds: number, episode: number): string {
  return `(function () {
    try {
      window.${CANCEL_FLAG} = false
      var old = document.getElementById('animelist-next')
      if (old && old.parentNode) old.parentNode.removeChild(old)

      var host = document.fullscreenElement || document.body
      if (!host) return false

      var box = document.createElement('div')
      box.id = 'animelist-next'
      box.style.cssText = [
        'position:fixed', 'right:22px', 'bottom:22px', 'z-index:2147483647',
        'display:flex', 'align-items:center', 'gap:14px',
        'padding:12px 16px', 'border-radius:12px',
        'background:rgba(12,14,24,.92)', 'color:#e8ecf8',
        'font:500 14px/1.3 "Segoe UI",system-ui,sans-serif',
        'box-shadow:0 10px 30px rgba(0,0,0,.5)'
      ].join(';')

      var text = document.createElement('span')
      var left = ${seconds}
      var say = function () { text.textContent = 'Épisode ${episode} dans ' + left + ' s' }
      say()

      var stop = document.createElement('button')
      stop.textContent = 'Annuler'
      stop.style.cssText = [
        'padding:6px 12px', 'border:0', 'border-radius:8px', 'cursor:pointer',
        'background:rgba(255,255,255,.14)', 'color:inherit', 'font:inherit'
      ].join(';')
      stop.onclick = function () {
        window.${CANCEL_FLAG} = true
        if (box.parentNode) box.parentNode.removeChild(box)
      }

      var timer = setInterval(function () {
        left -= 1
        if (left <= 0) {
          clearInterval(timer)
          if (box.parentNode) box.parentNode.removeChild(box)
          return
        }
        say()
      }, 1000)

      box.appendChild(text)
      box.appendChild(stop)
      host.appendChild(box)
      return true
    } catch (e) {
      return false
    }
  })()`
}

/** Ce que le lecteur raconte, ou rien quand il n'y a pas de vidéo à lire. */
async function playing(): Promise<Playing | null> {
  const win = watchWindow()
  if (!win) return null
  const video = await videoFrame(win)
  if (!video) return null
  return {
    position: video.state.position ?? 0,
    duration: video.state.duration ?? 0,
    playing: video.state.playing ?? false
  }
}

/**
 * Coche, si la règle le dit et si l'épisode a le droit de l'être.
 *
 * Le contrôle de diffusion est le même que partout ailleurs : une écriture
 * automatique n'a pas moins besoin de garde-fou qu'un clic, elle en a plus,
 * puisque personne ne la regarde arriver.
 */
function tickIfDone(now: Playing, animeId: number, episode: number, key: string): void {
  if (ticked === key) return
  const seen = isWatched(animeId, episode)
  if (!shouldTick(now, seen)) return

  const media = getMedia(animeId)
  if (media && !canTick(media, episode, seen)) return

  setWatched(animeId, episode, true)
  ticked = key
}

/** Propose le suivant, puis le lance si personne n'a dit non. */
async function advanceUnlessRefused(animeId: number, episode: number, key: string): Promise<void> {
  advancing = key
  const next = episode + 1

  const win = watchWindow()
  const video = win ? await videoFrame(win) : null
  // Le carton peut ne pas s'afficher — cadre disparu, page remplacée. Ce n'est
  // pas une raison de renoncer : le compte à rebours court quand même, et
  // fermer la fenêtre reste la façon la plus directe de dire non.
  if (video) await video.frame.executeJavaScript(countdownScript(COUNTDOWN_S, next), true).catch(() => false)

  await new Promise((resolve) => setTimeout(resolve, COUNTDOWN_S * 1000))

  // La fenêtre a pu se fermer pendant le décompte.
  if (!watchWindow()) return
  const stillVideo = await videoFrame(watchWindow() as NonNullable<ReturnType<typeof watchWindow>>)
  const cancelled: unknown = stillVideo
    ? await stillVideo.frame.executeJavaScript(`window.${CANCEL_FLAG} === true`, true).catch(() => false)
    : false
  if (cancelled === true) {
    refused.add(key)
    return
  }

  // Faux veut dire que ce numéro n'existe pas dans leur menu : la saison est
  // finie. Rien à faire, et surtout pas ouvrir une page d'épisode inexistant.
  if (await playNext(next)) rememberLaunch(animeId, next)
}

async function tick(): Promise<void> {
  const prefs = getPrefs()
  if (!prefs.autoTick && !prefs.autoNext) return

  if (!watchWindow()) {
    // Fenêtre fermée : la prochaine ouverture repart de zéro, sinon un épisode
    // relancé plus tard hériterait des décisions de la session précédente.
    ticked = null
    advancing = null
    refused.clear()
    return
  }

  const launched = getLaunched()
  // Une bande-annonce n'a pas de numéro d'épisode, et rien à cocher.
  if (!launched || launched.episode === null || launched.note) return

  const now = await playing()
  if (!now) return

  const key = keyOf(launched.animeId, launched.episode)
  if (prefs.autoTick) tickIfDone(now, launched.animeId, launched.episode, key)

  if (prefs.autoNext && advancing !== key && !refused.has(key) && shouldAdvance(now)) {
    await advanceUnlessRefused(launched.animeId, launched.episode, key)
  }
}

/**
 * Surveille tant que l'app tourne.
 *
 * Le tour ne coûte rien quand aucune fenêtre de lecture n'est ouverte, ce qui
 * est le cas la plupart du temps : il sort à la première ligne.
 */
export function startBinge(): () => void {
  const timer = setInterval(() => void tick(), POLL_MS)
  return () => clearInterval(timer)
}
