/**
 * Les fichiers locaux d'une série, sur sa fiche.
 *
 * On choisit un dossier une fois ; l'app y retrouve les épisodes par leur nom.
 * Le numéro lu dans le nom est affiché tel quel : s'il est faux, ça se voit
 * immédiatement, plutôt que de cocher le mauvais épisode en silence.
 */

import { useEffect, useState } from 'react'
import { FolderOpen, FolderSearch, Play, RefreshCw, TriangleAlert, Unlink } from 'lucide-react'
import type { LocalEpisode, LocalFolder } from '@shared/types'
import { clock } from '@shared/playback'
import Player from './Player'
import { Section } from './ui'
import { rgba } from '@/lib/color'
import { useApp } from '@/store/app'

function weight(bytes: number): string {
  const mo = bytes / 1024 / 1024
  return mo >= 1024 ? `${(mo / 1024).toFixed(1).replace('.', ',')} Go` : `${Math.round(mo)} Mo`
}

export default function LocalFiles({
  animeId,
  title,
  glow
}: {
  animeId: number
  title: string
  glow: string
}): React.JSX.Element | null {
  // `undefined` le temps du scan : rien à montrer tant qu'on ne sait pas s'il y
  // a un dossier. L'état n'est écrit qu'après l'attente, jamais pendant l'effet.
  const [folder, setFolder] = useState<LocalFolder | null | undefined>(undefined)
  const [playing, setPlaying] = useState<LocalEpisode | null>(null)
  const seen = useApp((s) => s.watched.get(animeId))

  useEffect(() => {
    // Changer de fiche pendant un scan ne doit pas faire arriver les fichiers
    // de la précédente sur la nouvelle.
    let alive = true
    void window.api.videos.scan(animeId).then((next) => {
      if (alive) setFolder(next)
    })
    return () => {
      alive = false
    }
  }, [animeId])

  const load = async (): Promise<void> => setFolder(await window.api.videos.scan(animeId))
  const choose = async (): Promise<void> => setFolder(await window.api.videos.choose(animeId))

  const forget = async (): Promise<void> => {
    await window.api.videos.forget(animeId)
    setFolder(null)
  }

  /**
   * Le fichier voisin, s'il existe.
   *
   * Rend `undefined` au bord de la liste plutôt qu'une fonction sans effet :
   * le lecteur n'affiche alors pas le bouton, ce qui vaut mieux qu'un bouton
   * qui ne fait rien.
   */
  const step = (delta: number): (() => void) | undefined => {
    if (!playing || !folder) return undefined
    const at = folder.episodes.findIndex((f) => f.path === playing.path)
    const next = folder.episodes[at + delta]
    if (at < 0 || !next) return undefined
    return () => setPlaying(next)
  }

  if (folder === undefined) return null

  if (!folder) {
    return (
      <Section title="Fichiers locaux" subtitle="Regarde tes épisodes depuis l'app">
        <button className="btn" onClick={() => void choose()}>
          <FolderSearch size={14} />
          Associer un dossier
        </button>
      </Section>
    )
  }

  const matched = folder.episodes.filter((f) => f.episode !== null).length

  return (
    <Section
      title="Fichiers locaux"
      subtitle={
        folder.missing
          ? 'Le dossier a disparu'
          : `${folder.episodes.length} fichier${folder.episodes.length > 1 ? 's' : ''}, ${matched} épisode${matched > 1 ? 's' : ''} reconnu${matched > 1 ? 's' : ''}`
      }
      action={
        <div className="flex shrink-0 gap-1.5">
          <button className="chip" onClick={() => void load()} title="Relire le dossier">
            <RefreshCw size={12} />
          </button>
          <button className="chip" onClick={() => void choose()}>
            <FolderOpen size={12} />
            Changer
          </button>
          <button className="chip" onClick={() => void forget()}>
            <Unlink size={12} />
            Oublier
          </button>
        </div>
      }
    >
      <p className="mb-3 truncate px-1 text-[0.72rem] text-faint" title={folder.path}>
        {folder.path}
      </p>

      {folder.missing ? (
        <p className="flex items-center gap-2 px-1 text-[0.82rem] text-muted">
          <TriangleAlert size={14} style={{ color: '#ffb038' }} />
          Ce dossier n’existe plus. Choisis-en un autre, ou oublie-le.
        </p>
      ) : folder.episodes.length === 0 ? (
        <p className="px-1 text-[0.82rem] text-muted">
          Aucune vidéo dans ce dossier, ni dans ses sous-dossiers directs.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {folder.episodes.map((file) => {
            const done = file.episode !== null && seen?.has(file.episode)
            // Un épisode coché n'a plus rien à reprendre, même si le fichier
            // garde une position d'un visionnage précédent.
            const resume = done ? null : file.resumeAt
            return (
              <button
                key={file.path}
                onClick={() => setPlaying(file)}
                className="glass flex items-center gap-3 rounded-[12px] px-3 py-2 text-left transition hover:brightness-125"
              >
                <span
                  className="grid h-8 w-11 shrink-0 place-items-center rounded-[8px] text-[0.72rem] font-bold tabular-nums"
                  style={
                    done
                      ? { background: rgba(glow, 0.9), color: '#07080f' }
                      : { background: 'rgba(255,255,255,.06)', color: 'var(--color-faint)' }
                  }
                >
                  {file.episode ?? '—'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8rem]">{file.name}</span>
                  <span className="text-[0.68rem] text-faint">
                    {weight(file.size)}
                    {file.subtitleUrl && ' · sous-titres'}
                    {!file.playable && ' · lecteur système'}
                    {resume !== null && ` · reprendre à ${clock(resume)}`}
                  </span>
                  {/* La barre ne s'affiche que s'il y a une durée : sans elle,
                      la part vue est inconnue et une barre vide mentirait. */}
                  {resume !== null && file.duration !== null && file.duration > 0 && (
                    <span className="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-white/10">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (resume / file.duration) * 100)}%`,
                          background: rgba(glow, 0.9)
                        }}
                      />
                    </span>
                  )}
                </span>
                <Play
                  size={15}
                  className="shrink-0"
                  style={{ color: rgba(glow, 1) }}
                  fill="currentColor"
                  strokeWidth={0}
                />
              </button>
            )
          })}
        </div>
      )}

      {playing && (
        <Player
          file={playing}
          animeId={animeId}
          title={title}
          /* Les voisins du dossier, dans l'ordre où ils sont affichés : c'est
             ce qui donne un sens aux touches « suivant » et « précédent » du
             clavier, et aux deux boutons de l'en-tête. */
          onPrevious={step(-1)}
          onNext={step(1)}
          /* Relire le dossier en fermant : la place que le lecteur vient
             d'enregistrer doit se voir sur la ligne, sans rien rafraîchir. */
          onClose={() => {
            setPlaying(null)
            void load()
          }}
        />
      )}
    </Section>
  )
}
