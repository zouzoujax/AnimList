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
 */

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ExternalLink, TriangleAlert, X } from 'lucide-react'
import type { LocalEpisode } from '@shared/types'
import { useApp } from '../store/app'

/** Assez tard pour que ce soit vu, assez tôt pour ne pas dépendre du générique. */
const WATCHED_AT = 0.9

export default function Player({
  file,
  animeId,
  title,
  onClose
}: {
  file: LocalEpisode
  animeId: number
  title: string
  onClose: () => void
}): React.JSX.Element {
  const video = useRef<HTMLVideoElement>(null)
  const toggleEpisode = useApp((s) => s.toggleEpisode)
  const watched = useApp((s) => (file.episode === null ? true : (s.watched.get(animeId)?.has(file.episode) ?? false)))
  const toast = useApp((s) => s.toast)
  const [failed, setFailed] = useState(!file.playable)
  const ticked = useRef(false)

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
    if (!el || ticked.current || watched || file.episode === null) return
    if (!el.duration || el.currentTime / el.duration < WATCHED_AT) return
    ticked.current = true
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
        className="fixed inset-0 z-[60] flex flex-col bg-black/95"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <header className="flex shrink-0 items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.9rem] font-semibold text-white">
              {file.episode !== null ? `Épisode ${file.episode} · ` : ''}
              {title}
            </p>
            <p className="truncate text-[0.7rem] text-white/45">{file.name}</p>
          </div>
          <button className="btn" onClick={openOutside} title="Ouvrir dans le lecteur du système">
            <ExternalLink size={14} />
            Lecteur système
          </button>
          <button className="btn" onClick={onClose}>
            <X size={14} />
            Fermer
          </button>
        </header>

        <div className="grid min-h-0 flex-1 place-items-center px-5 pb-5">
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
              onError={() => setFailed(true)}
              className="max-h-full max-w-full rounded-[14px]"
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
