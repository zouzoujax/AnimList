/**
 * Editor for a single episode: every time it was watched, with its date, its
 * runtime, a note and how it felt.
 *
 * One episode can have several viewings — a rewatch repeats it — so the panel
 * lists them by pass rather than assuming a single row. Deleting the last one
 * simply un-ticks the episode.
 */

import { useState } from 'react'
import { CalendarClock, Clock, Trash2 } from 'lucide-react'
import { EMOTIONS, type EmotionId, type WatchEvent } from '@shared/types'
import { useApp } from '../store/app'
import { Modal } from './ui'

/** `<input type="datetime-local">` wants local wall-clock time, not an ISO instant. */
function toLocalInput(at: number): string {
  const d = new Date(at)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const passLabel = (pass: number): string =>
  pass === 0 ? 'Premier visionnage' : pass === 1 ? '2ᵉ visionnage' : `${pass + 1}ᵉ visionnage`

function ViewingForm({
  animeId,
  episode,
  event
}: {
  animeId: number
  episode: number
  event: WatchEvent
}): React.JSX.Element {
  const updateEvent = useApp((s) => s.updateEvent)
  const removeEvent = useApp((s) => s.removeEvent)
  const toast = useApp((s) => s.toast)

  const pass = event.pass ?? 0
  const ref = { animeId, episode, pass }

  // Seeded once: while the panel is open these inputs are the source of truth,
  // and the store is written on blur. Syncing them back from the echo would
  // steal focus every time a field is committed.
  const [date, setDate] = useState(() => toLocalInput(event.at))
  const [minutes, setMinutes] = useState(String(event.minutes))
  const [note, setNote] = useState(event.note ?? '')
  const emotions = event.emotions ?? []

  /** Commits a date, or puts the stored one back when it cannot be read. */
  const commitDate = (value: string): void => {
    const at = Date.parse(value)
    if (Number.isNaN(at)) {
      setDate(toLocalInput(event.at))
      return
    }
    void updateEvent(ref, { at })
  }

  const commitMinutes = (): void => {
    const value = Number(minutes)
    if (!Number.isFinite(value) || value < 0) {
      setMinutes(String(event.minutes))
      return
    }
    void updateEvent(ref, { minutes: value })
  }

  const toggleEmotion = (id: EmotionId): void => {
    const next = emotions.includes(id) ? emotions.filter((e) => e !== id) : [...emotions, id]
    void updateEvent(ref, { emotions: next })
  }

  return (
    <div className="border-t px-5 py-4 first:border-t-0" style={{ borderColor: 'var(--line)' }}>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-[0.78rem] font-medium">{passLabel(pass)}</span>
        {event.imported && (
          <span className="rounded-full px-2 py-0.5 text-[0.66rem] text-faint" style={{ background: 'var(--line)' }}>
            importé
          </span>
        )}
        <button
          className="btn ml-auto !h-7 text-[0.72rem]"
          style={{ color: '#ff8080', borderColor: 'rgba(255,128,128,.3)' }}
          onClick={() => {
            void removeEvent(ref)
            toast('Visionnage supprimé', 'ok')
          }}
        >
          <Trash2 size={12} />
          Supprimer
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="flex-1 basis-[15rem]">
          <span className="label mb-1 flex items-center gap-1.5">
            <CalendarClock size={12} />
            Vu le
          </span>
          <input
            type="datetime-local"
            className="field w-full text-[0.78rem]"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onBlur={(e) => commitDate(e.target.value)}
          />
        </label>

        <label className="basis-[7rem]">
          <span className="label mb-1 flex items-center gap-1.5">
            <Clock size={12} />
            Durée
          </span>
          <input
            type="number"
            min={0}
            className="field w-full text-[0.78rem]"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            onBlur={commitMinutes}
          />
        </label>
      </div>

      {event.imported && (
        <p className="mt-1.5 text-[0.7rem] text-faint">
          Cette date est celle du pointage dans l'app d'origine, pas celle du visionnage — les statistiques
          par jour l'ignorent. La corriger ici la rend réelle.
        </p>
      )}

      <div className="mt-3">
        <span className="label mb-1.5 block">Ressenti</span>
        <div className="flex flex-wrap gap-1">
          {EMOTIONS.map((emotion) => (
            <button
              key={emotion.id}
              className="chip !h-7 text-[0.72rem]"
              data-on={emotions.includes(emotion.id)}
              onClick={() => toggleEmotion(emotion.id)}
              title={emotion.label}
            >
              <span aria-hidden>{emotion.emoji}</span>
              {emotion.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <span className="label mb-1.5 block">Note</span>
        <textarea
          className="field min-h-[4.5rem] w-full resize-y py-2 text-[0.78rem] leading-relaxed"
          placeholder="Ce que tu veux retenir de cet épisode…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => void updateEvent(ref, { note })}
        />
      </div>
    </div>
  )
}

export default function EpisodeEditor({
  animeId,
  episode,
  title,
  onClose
}: {
  animeId: number
  episode: number | null
  title: string | null
  onClose: () => void
}): React.JSX.Element {
  const events = useApp((s) => s.events)
  const toggleEpisode = useApp((s) => s.toggleEpisode)

  const viewings = events
    .filter((e) => e.animeId === animeId && e.episode === episode)
    .sort((a, b) => (a.pass ?? 0) - (b.pass ?? 0))

  return (
    <Modal open={episode !== null} onClose={onClose} width={560}>
      <div className="border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
        <p className="text-[0.95rem] font-semibold">Épisode {episode}</p>
        {title && <p className="mt-0.5 text-[0.8rem] text-muted">{title}</p>}
      </div>

      {viewings.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <p className="text-[0.82rem] text-muted">Cet épisode n'est pas marqué comme vu.</p>
          <button
            className="btn btn-primary mt-3"
            onClick={() => episode !== null && void toggleEpisode(animeId, episode)}
          >
            Le marquer comme vu
          </button>
        </div>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto">
          {viewings.map((event) => (
            <ViewingForm key={event.pass ?? 0} animeId={animeId} episode={episode as number} event={event} />
          ))}
        </div>
      )}

      <div className="flex justify-end border-t px-5 py-3" style={{ borderColor: 'var(--line)' }}>
        <button className="btn" onClick={onClose}>
          Fermer
        </button>
      </div>
    </Modal>
  )
}
