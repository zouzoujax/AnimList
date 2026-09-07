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

import { shouldAdvance, shouldTick, watchedRatio, type Playing } from '@shared/binge'
import { canTick } from '@shared/airing'
import { activeSkip, SKIP_LABELS } from '@shared/skip'
import { searchTitles } from '@shared/titles'
import { isCinema, leaveCinema, videoFrame } from './video-frame'
import { resolve as resolveAnimeSama } from './animesama'
import { getLaunched, rememberLaunch, sendProgress } from './now'
import { getMedia, getPrefs, isWatched, setWatched } from './store'
import { skipRangesFor } from './skip'
import { soireeNext, stopSoiree } from './soiree-queue'
import { openAnimeSamaEpisode, playNext, watchWindow } from './watch-window'

/** Assez souvent pour ne pas manquer une fin, assez rare pour ne rien coûter. */
const POLL_MS = 5000

/** Le temps laissé pour dire non avant que le suivant ne parte. */
const COUNTDOWN_S = 8

/** Le drapeau que pose le bouton « Annuler », lu depuis le processus principal. */
const CANCEL_FLAG = '__animelistNextCancelled'

/** Le temps laissé au carton de fin avant que la fenêtre ne se ferme. */
const END_LINGER_MS = 4000

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

/** Les génériques déjà proposés ou passés : on ne revient pas dessus. */
const offered = new Set<string>()

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
export function countdownScript(seconds: number, label: string): string {
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
      var say = function () { text.textContent = ${JSON.stringify(label)} + ' dans ' + left + ' s' }
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

/**
 * Le bouton « passer le générique », posé dans le cadre du lecteur.
 *
 * Il agit sur place plutôt que de poser un drapeau qu'on relirait cinq secondes
 * plus tard : un générique dure une minute et demie, et une réponse différée
 * d'un tour d'horloge ferait sauter au mauvais endroit. Il se retire tout seul
 * quand le générique est passé, sans quoi il resterait à proposer un saut vers
 * une seconde déjà franchie.
 *
 * Plus haut que le carton de l'épisode suivant, qui occupe le même coin : sur
 * un générique de fin, les deux peuvent s'afficher ensemble.
 */
export function skipScript(to: number, label: string, seconds: number): string {
  return `(function () {
    try {
      var old = document.getElementById('animelist-skip')
      if (old && old.parentNode) old.parentNode.removeChild(old)

      var host = document.fullscreenElement || document.body
      if (!host) return false

      var b = document.createElement('button')
      b.id = 'animelist-skip'
      b.textContent = ${JSON.stringify(label)}
      b.style.cssText = [
        'position:fixed', 'right:22px', 'bottom:86px', 'z-index:2147483647',
        'padding:10px 16px', 'border:0', 'border-radius:12px', 'cursor:pointer',
        'background:rgba(12,14,24,.92)', 'color:#e8ecf8',
        'font:500 14px/1.3 "Segoe UI",system-ui,sans-serif',
        'box-shadow:0 10px 30px rgba(0,0,0,.5)'
      ].join(';')

      var partir = function () { if (b.parentNode) b.parentNode.removeChild(b) }
      b.onclick = function () {
        var v = document.querySelector('video')
        if (v) v.currentTime = ${to}
        partir()
      }
      setTimeout(partir, ${Math.max(1, Math.round(seconds))} * 1000)

      host.appendChild(b)
      return true
    } catch (e) {
      return false
    }
  })()`
}

/** Retire le bouton, quand le générique est passé sans qu'on y touche. */
const REMOVE_SKIP = `(function () {
  var b = document.getElementById('animelist-skip')
  if (b && b.parentNode) b.parentNode.removeChild(b)
  return true
})()`

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

/**
 * Le carton de fin de soirée : rien à décider, juste de quoi comprendre.
 *
 * Sans lui, la fenêtre disparaîtrait sans explication au bout du dernier
 * épisode, et on croirait à un plantage plutôt qu'à une liste terminée.
 */
export function noticeScript(text: string): string {
  return `(function () {
    try {
      var old = document.getElementById('animelist-next')
      if (old && old.parentNode) old.parentNode.removeChild(old)
      var host = document.fullscreenElement || document.body
      if (!host) return false
      var box = document.createElement('div')
      box.id = 'animelist-next'
      box.style.cssText = [
        'position:fixed', 'right:22px', 'bottom:22px', 'z-index:2147483647',
        'padding:12px 16px', 'border-radius:12px',
        'background:rgba(12,14,24,.92)', 'color:#e8ecf8',
        'font:500 14px/1.3 "Segoe UI",system-ui,sans-serif',
        'box-shadow:0 10px 30px rgba(0,0,0,.5)'
      ].join(';')
      box.textContent = ${JSON.stringify(text)}
      host.appendChild(box)
      return true
    } catch (e) {
      return false
    }
  })()`
}

/**
 * La soirée est finie : on rend l'écran, puis on ferme.
 *
 * Rendre l'écran avant de fermer plutôt que l'inverse : une fenêtre agrandie
 * qui disparaît laisse le bureau se réafficher d'un coup, et c'est le genre de
 * secousse qu'on remarque à une heure du matin.
 */
async function endSoiree(): Promise<void> {
  stopSoiree()
  const win = watchWindow()
  if (!win) return

  const video = await videoFrame(win)
  if (video) await video.frame.executeJavaScript(noticeScript('Soirée terminée'), true).catch(() => false)
  await new Promise((resolve) => setTimeout(resolve, END_LINGER_MS))

  const still = watchWindow()
  if (!still || still.isDestroyed()) return
  if (isCinema(still)) await leaveCinema(still)
  still.close()
}

/** Ouvre une autre série dans la fenêtre de lecture. */
async function openOther(animeId: number, episode: number): Promise<boolean> {
  const media = getMedia(animeId)
  if (!media) return false
  const target = await resolveAnimeSama(animeId, searchTitles(media.title)).catch(() => null)
  // Sans menu d'épisodes, viser un numéro n'a pas de sens : mieux vaut arrêter
  // la soirée que d'ouvrir une page au hasard pendant que personne ne regarde.
  if (!target?.url || !target.episodes) return false
  return openAnimeSamaEpisode(target.url, episode)
}

/**
 * Propose la suite, puis la lance si personne n'a dit non.
 *
 * Deux régimes. Sans soirée, le comportement d'origine : le numéro d'après,
 * dans la même série, indéfiniment. Avec une soirée, c'est la liste qui décide
 * — elle change de série au bon moment et s'arrête au bout, ce qu'un simple
 * `épisode + 1` ne saura jamais faire.
 */
async function advanceUnlessRefused(animeId: number, episode: number, key: string): Promise<void> {
  advancing = key
  const step = soireeNext(animeId, episode)

  // Dernier épisode de la liste : plus rien à proposer, la soirée s'achève.
  if (step.inSession && step.next === null) {
    await endSoiree()
    return
  }

  const target = step.next ?? { animeId, episode: episode + 1, title: null }
  const sameShow = target.animeId === animeId
  const label = sameShow ? `Épisode ${target.episode}` : `${target.title ?? 'Suite'} — épisode ${target.episode}`

  const win = watchWindow()
  const video = win ? await videoFrame(win) : null
  // Le carton peut ne pas s'afficher — cadre disparu, page remplacée. Ce n'est
  // pas une raison de renoncer : le compte à rebours court quand même, et
  // fermer la fenêtre reste la façon la plus directe de dire non.
  if (video) await video.frame.executeJavaScript(countdownScript(COUNTDOWN_S, label), true).catch(() => false)

  await new Promise((resolve) => setTimeout(resolve, COUNTDOWN_S * 1000))

  // La fenêtre a pu se fermer pendant le décompte.
  if (!watchWindow()) return
  const stillVideo = await videoFrame(watchWindow() as NonNullable<ReturnType<typeof watchWindow>>)
  const cancelled: unknown = stillVideo
    ? await stillVideo.frame.executeJavaScript(`window.${CANCEL_FLAG} === true`, true).catch(() => false)
    : false
  if (cancelled === true) {
    refused.add(key)
    // « Annuler » veut dire s'arrêter là, pas sauter un épisode : une soirée
    // qui repartirait toute seule au suivant n'aurait pas été annulée.
    if (step.inSession) stopSoiree()
    return
  }

  // Faux veut dire que ce numéro n'existe pas dans leur menu : la saison est
  // finie. Rien à faire, et surtout pas ouvrir une page d'épisode inexistant.
  const opened = sameShow ? await playNext(target.episode) : await openOther(target.animeId, target.episode)
  if (opened) rememberLaunch(target.animeId, target.episode)
  else if (step.inSession) stopSoiree()
}

/**
 * Propose de passer le générique, ou le passe.
 *
 * Une seule fois par générique et par épisode : ignorer le bouton est une
 * réponse, et le faire réapparaître à chaque tour d'horloge en ferait un
 * harcèlement.
 */
async function offerSkip(animeId: number, episode: number, now: Playing, auto: boolean): Promise<void> {
  const win = watchWindow()
  if (!win) return

  const ranges = await skipRangesFor(getMedia(animeId)?.idMal ?? null, episode)
  if (!ranges.length) return

  const active = activeSkip(ranges, now.position, now.duration)
  const video = await videoFrame(win)
  if (!video) return

  if (!active) {
    await video.frame.executeJavaScript(REMOVE_SKIP, true).catch(() => false)
    return
  }

  const key = `${animeId}:${episode}:${active.kind}`
  if (offered.has(key)) return
  offered.add(key)

  if (auto) {
    await video.frame
      .executeJavaScript(
        `(function(){var v=document.querySelector('video');if(v)v.currentTime=${active.end};return true})()`,
        true
      )
      .catch(() => false)
    return
  }

  const reste = active.end - now.position
  await video.frame.executeJavaScript(skipScript(active.end, SKIP_LABELS[active.kind], reste), true).catch(() => false)
}

async function tick(): Promise<void> {
  const prefs = getPrefs()

  if (!watchWindow()) {
    // Fenêtre fermée : la prochaine ouverture repart de zéro, sinon un épisode
    // relancé plus tard hériterait des décisions de la session précédente.
    ticked = null
    advancing = null
    refused.clear()
    offered.clear()
    sendProgress(null)
    return
  }

  const launched = getLaunched()
  // Une bande-annonce n'a pas de numéro d'épisode, et rien à cocher.
  if (!launched || launched.episode === null || launched.note) return

  const now = await playing()
  if (!now) return

  // Avant les réglages, et non après : le remplissage des cases n'est pas la
  // coche automatique, et couper celle-ci ne doit pas aveugler celui-là.
  sendProgress({ animeId: launched.animeId, episode: launched.episode, ratio: watchedRatio(now) })

  // Avant les réglages de la coche, pour la même raison : passer un générique
  // n'a rien à voir avec cocher un épisode.
  if (prefs.skipHint || prefs.autoSkip) {
    await offerSkip(launched.animeId, launched.episode, now, prefs.autoSkip)
  }

  if (!prefs.autoTick && !prefs.autoNext) return

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
