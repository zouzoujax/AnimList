/**
 * Lecteur pour un fichier local.
 *
 * Il coche l'épisode tout seul aux neuf dixièmes : c'est le moment où on l'a
 * vu, pas la fin du générique qu'on saute. Une seule fois par ouverture, et
 * jamais si l'épisode l'était déjà — cocher deux fois inventerait un
 * visionnage.
 *
 * Quand Chromium n'arrive pas à décoder — du HEVC, un conteneur exotique — le
 * lecteur ne montre pas un carré noir : il le dit et propose le lecteur du
 * système, qui lui saura le lire.
 *
 * Les touches multimédia du clavier le pilotent, mais seulement tant qu'il est
 * ouvert — un raccourci global est global, et le garder posé volerait la
 * touche « lecture » à tous les autres lecteurs de la machine.
 *
 * Il retient aussi où on s'est arrêté, et rouvre le fichier à cette
 * seconde-là. La position part sur le disque toutes les cinq secondes et à la
 * fermeture : fermer la fenêtre est le geste normal, ce n'est pas à
 * l'utilisateur de penser à sauvegarder sa place. Elle est effacée dès que
 * l'épisode est coché — il n'y a plus rien à reprendre.
 */

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ExternalLink, PictureInPicture2, RotateCcw, SkipBack, SkipForward, TriangleAlert, X } from 'lucide-react'
import type { LocalEpisode } from '@shared/types'
import { clock } from '@shared/playback'
import { useApp } from '../store/app'

/** Assez tard pour que ce soit vu, assez tôt pour ne pas dépendre du générique. */
const WATCHED_AT = 0.9

/** Assez souvent pour ne rien perdre d'une coupure, assez rare pour ne rien coûter. */
const SAVE_EVERY_MS = 5000

export default function Player({
  file,
  animeId,
  title,
  onClose,
  onPrevious,
  onNext
}: {
  file: LocalEpisode
  animeId: number
  title: string
  onClose: () => void
  /** Les fichiers voisins du dossier, quand il y en a. */
  onPrevious?: () => void
  onNext?: () => void
}): React.JSX.Element {
  const video = useRef<HTMLVideoElement>(null)
  const toggleEpisode = useApp((s) => s.toggleEpisode)
  const watched = useApp((s) => (file.episode === null ? true : (s.watched.get(animeId)?.has(file.episode) ?? false)))
  const toast = useApp((s) => s.toast)
  const [failed, setFailed] = useState(!file.playable)
  const ticked = useRef(false)

  /**
   * Dernière position connue, hors du rendu.
   *
   * Elle change quatre fois par seconde : en faire un état ferait repeindre le
   * lecteur pour rien. La fermeture la relit telle quelle.
   */
  const mark = useRef<{ at: number; duration: number }>({ at: 0, duration: 0 })
  const savedAt = useRef(0)
  const [resumed, setResumed] = useState<number | null>(null)

  /**
   * Enregistre la place au démontage.
   *
   * C'est le seul chemin fiable : fermer, changer d'épisode ou quitter l'app
   * passent tous par là, alors qu'aucun d'eux ne prévient la vidéo.
   */
  useEffect(() => {
    const path = file.path
    return () => {
      const { at, duration } = mark.current
      if (duration > 0) void window.api.videos.remember(path, at, duration)
    }
  }, [file.path])

  /**
   * Le processus principal doit savoir qu'une lecture est en cours : c'est ce
   * qui lui fait prendre — et rendre — les touches multimédia du clavier. Un
   * raccourci global posé en permanence les volerait à tous les autres
   * lecteurs de la machine.
   */
  useEffect(() => {
    void window.api.videos.playing(true)
    return () => {
      void window.api.videos.playing(false)
    }
  }, [])

  /** Ce que fait chaque touche multimédia. */
  useEffect(() => {
    return window.api.videos.onCommand((command) => {
      const el = video.current
      if (command === 'stop') return onClose()
      if (command === 'next') return onNext?.()
      if (command === 'previous') return onPrevious?.()
      if (!el) return
      if (el.paused) void el.play()
      else el.pause()
    })
  }, [onClose, onNext, onPrevious])

  /**
   * Le mini-lecteur flottant.
   *
   * C'est celui de Windows, pas un des nôtres : Chromium sait détacher une
   * vidéo dans une fenêtre qui reste au-dessus des autres, redimensionnable et
   * pilotable depuis la barre des tâches. En réécrire un serait long et moins
   * bon.
   */
  const popOut = (): void => {
    const el = video.current
    if (!el || !document.pictureInPictureEnabled) return
    if (document.pictureInPictureElement) void document.exitPictureInPicture()
    else void el.requestPictureInPicture().catch(() => toast('Ce format ne se détache pas.', 'error'))
  }

  /** Reprend là où on s'était arrêté, une fois la durée connue. */
  const onLoaded = (): void => {
    const el = video.current
    if (!el) return
    mark.current = { at: el.currentTime, duration: el.duration || 0 }
    if (file.resumeAt === null || file.resumeAt <= 0) return
    // Une reprise au-delà de la fin ne rouvrirait que du noir.
    if (el.duration && file.resumeAt >= el.duration) return
    el.currentTime = file.resumeAt
    setResumed(file.resumeAt)
  }

  /** Reprendre du début : on efface la place plutôt que de la garder en fond. */
  const restart = (): void => {
    const el = video.current
    if (el) el.currentTime = 0
    setResumed(null)
    void window.api.videos.forgetPosition(file.path)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      if (e.key === ' ' && video.current) {
        e.preventDefault()
        if (video.current.paused) void video.current.play()
        else video.current.pause()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const onTime = (): void => {
    const el = video.current
    if (!el) return

    mark.current = { at: el.currentTime, duration: el.duration || 0 }
    const now = Date.now()
    if (el.duration && now - savedAt.current > SAVE_EVERY_MS) {
      savedAt.current = now
      void window.api.videos.remember(file.path, el.currentTime, el.duration)
    }

    if (ticked.current || watched || file.episode === null) return
    if (!el.duration || el.currentTime / el.duration < WATCHED_AT) return
    ticked.current = true
    // L'épisode est vu : il n'y a plus de place à garder, et le démontage ne
    // doit pas la réécrire derrière nous.
    mark.current = { at: 0, duration: 0 }
    void window.api.videos.forgetPosition(file.path)
    void toggleEpisode(animeId, file.episode).then(() => toast(`Épisode ${file.episode} coché`, 'ok'))
  }

  const openOutside = (): void => {
    void window.api.videos.openExternal(file.path).then((ok) => {
      if (ok) onClose()
      else toast('Ce fichier ne peut pas être ouvert.', 'error')
    })
  }

  return (
    <AnimatePresence>
      <motion.div
        /**
         * `no-drag` est indispensable, pas décoratif.
         *
         * La fenêtre est sans cadre : ses 44 premiers pixels portent
         * `-webkit-app-region: drag`, et cette zone capture la souris au niveau
         * du système, quel que soit ce qui est peint par-dessus. Le lecteur
         * couvrant tout l'écran, son en-tête tombe dedans — les boutons
         * « Fermer » et « Lecteur système » ne recevaient jamais le clic.
         *
         * Les fenêtres modales y échappaient sans le savoir : elles commencent
         * sous la bande.
         */
        className="no-drag fixed inset-0 z-[60] flex flex-col bg-black/95"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* `pr-[152px]` comme la barre de titre : les boutons de Windows sont
            dessinés par le système en haut à droite, et tout ce qu'on pose
            dessous disparaît. « Fermer » était juste derrière la croix. */}
        <header className="flex shrink-0 items-center gap-3 py-3 pl-5 pr-[152px]">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.9rem] font-semibold text-white">
              {file.episode !== null ? `Épisode ${file.episode} · ` : ''}
              {title}
            </p>
            <p className="truncate text-[0.7rem] text-white/45">{file.name}</p>
          </div>
          {onPrevious && (
            <button
              className="icon-btn !h-8 !w-8"
              onClick={onPrevious}
              title="Épisode précédent"
              aria-label="Précédent"
            >
              <SkipBack size={15} />
            </button>
          )}
          {onNext && (
            <button className="icon-btn !h-8 !w-8" onClick={onNext} title="Épisode suivant" aria-label="Suivant">
              <SkipForward size={15} />
            </button>
          )}
          {!failed && document.pictureInPictureEnabled && (
            <button
              className="icon-btn !h-8 !w-8"
              onClick={popOut}
              title="Détacher dans une fenêtre flottante"
              aria-label="Mini-lecteur"
            >
              <PictureInPicture2 size={15} />
            </button>
          )}
          {resumed !== null && (
            <button className="btn" onClick={restart} title="Repartir du début de l’épisode">
              <RotateCcw size={14} />
              Repris à {clock(resumed)}
            </button>
          )}
          <button className="btn" onClick={openOutside} title="Ouvrir dans le lecteur du système">
            <ExternalLink size={14} />
            Lecteur système
          </button>
          <button className="btn btn-primary" onClick={onClose} title="Fermer — Échap, ou un clic à côté de la vidéo">
            <X size={14} />
            Fermer
          </button>
        </header>

        {/* Cliquer à côté de la vidéo ferme : c'est le geste qu'on fait sans y
            penser, et le lecteur n'avait que son bouton et la touche Échap.
            Le test sur la cible évite de fermer en cliquant la vidéo. */}
        <div
          className="grid min-h-0 flex-1 place-items-center px-3 pb-3"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          {failed ? (
            <div className="max-w-md text-center">
              <TriangleAlert size={30} className="mx-auto mb-3" style={{ color: '#ffb038' }} />
              <p className="text-[0.95rem] font-semibold text-white">Ce fichier ne se lit pas ici</p>
              <p className="mt-1.5 text-[0.82rem] leading-relaxed text-white/55">
                Le format dépasse ce que l’app sait décoder — souvent du HEVC (x265), que Chromium refuse. Le lecteur du
                système, lui, en vient à bout.
              </p>
              <button className="btn btn-primary mx-auto mt-4" onClick={openOutside}>
                <ExternalLink size={14} />
                Ouvrir dans le lecteur système
              </button>
            </div>
          ) : (
            <video
              ref={video}
              src={file.url}
              controls
              autoPlay
              onTimeUpdate={onTime}
              onLoadedMetadata={onLoaded}
              onError={() => setFailed(true)}
              /* `object-contain` plutôt qu'un simple maximum : une vidéo plus
                 petite que la fenêtre restait à sa taille d'origine, perdue au
                 milieu. Elle occupe maintenant toute la place disponible, ses
                 proportions gardées. */
              /* Une largeur maximale, sinon la vidéo mange tout l'écran sur un
                 grand moniteur. `object-contain` garde ses proportions dans
                 cette boîte, et les côtés restent cliquables pour fermer. */
              className="h-full w-full max-w-[1280px] rounded-[14px] object-contain"
            >
              {file.subtitleUrl && (
                <track kind="subtitles" srcLang="fr" label="Sous-titres" src={file.subtitleUrl} default />
              )}
            </video>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
