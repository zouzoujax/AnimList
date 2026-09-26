/**
 * La fiche d'un manga, telle qu'elle s'ouvre dans une fenêtre.
 *
 * Partagée entre le catalogue et la fiche d'un anime : arriver par la série
 * qu'on regarde ou par la liste des tendances mène au même endroit, sans qu'un
 * des deux chemins finisse par dériver de l'autre. C'est aussi là que se tient
 * la lecture : statut, chapitre, tomes, notes.
 */

import { useState } from 'react'
import { BookOpen, BookmarkPlus, ExternalLink, Heart, Minus, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { READ_STATUS_LABELS, type LibraryStatus, type Manga, type MangaEntry } from '@shared/types'
import { ORIGIN_HINTS, ORIGIN_LABELS } from '@shared/origin'
import { Poster } from '@/components/ui'
import { rgba, toneAccent } from '@/lib/color'
import { useApp } from '@/store/app'

export const MANGA_STATUS: Record<string, string> = {
  FINISHED: 'Terminé',
  RELEASING: 'En cours',
  NOT_YET_RELEASED: 'À paraître',
  CANCELLED: 'Annulé',
  HIATUS: 'En pause'
}

export const READ_STATUS_ORDER: LibraryStatus[] = ['watching', 'planned', 'completed', 'paused', 'dropped']

/**
 * Pourquoi « Lu » est refusé, ou `null`.
 *
 * La règle des séries : on ne termine pas ce qui paraît encore. Un manga en
 * cours n'a pas de dernier chapitre — on est à jour, pas au bout.
 */
function readBlocked(status: LibraryStatus, manga: Manga, entry: MangaEntry): string | null {
  if (status !== 'completed' || entry.status === 'completed') return null
  if (manga.status === 'RELEASING' || manga.status === 'HIATUS' || manga.status === 'NOT_YET_RELEASED')
    return 'Il paraît encore : on est à jour, pas au bout.'
  return null
}

/** Un compteur : moins, la valeur qu'on peut taper, plus. */
function Counter({
  label,
  value,
  total,
  onStep,
  onSet,
  stepLabel
}: {
  label: string
  value: number
  total: number | null
  onStep: (delta: number) => void
  onSet: (value: number) => void
  stepLabel: string
}): React.JSX.Element {
  // Le brouillon n'existe que pendant la frappe : hors d'elle, le champ montre
  // ce que la bibliothèque retient.
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (raw: string): void => {
    setDraft(null)
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n) || n === value) return
    onSet(Math.max(0, total ? Math.min(n, total) : n))
  }
  return (
    <div>
      <p className="label mb-1.5">{label}</p>
      <div className="flex items-center gap-1.5">
        <button
          className="icon-btn !h-8 !w-8"
          aria-label={`${label} : un de moins`}
          disabled={value <= 0}
          onClick={() => onStep(-1)}
        >
          <Minus size={14} />
        </button>
        <input
          inputMode="numeric"
          aria-label={label}
          value={draft ?? String(value)}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setDraft(null)
          }}
          className="field !h-8 w-16 text-center tabular-nums"
        />
        <span className="text-[0.76rem] tabular-nums text-faint">/ {total ?? '?'}</span>
        <button
          className="btn !h-8 !px-2.5 !text-[0.76rem]"
          disabled={total !== null && value >= total}
          onClick={() => onStep(1)}
          title={stepLabel}
        >
          <Plus size={13} />1
        </button>
      </div>
    </div>
  )
}

/**
 * Où j'en suis de ce manga.
 *
 * « +1 » est une lecture : elle est datée d'aujourd'hui et compte dans le
 * mois. Un numéro tapé est un rattrapage — un manga lu depuis des années
 * n'a pas été lu cet après-midi — : il compte au total, pas au calendrier.
 */
function Reading({ manga }: { manga: Manga }): React.JSX.Element {
  const entry = useApp((s) => s.mangaEntries.get(manga.id))
  const toast = useApp((s) => s.toast)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [notes, setNotes] = useState<string | null>(null)
  const api = window.api.manga

  if (!entry) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3" style={{ borderColor: 'var(--line)' }}>
        <button className="btn btn-primary" onClick={() => void api.setEntry(manga.id, { status: 'watching' }, manga)}>
          <BookOpen size={14} />
          Je le lis
        </button>
        <button className="btn" onClick={() => void api.setEntry(manga.id, { status: 'planned' }, manga)}>
          <BookmarkPlus size={14} />À lire plus tard
        </button>
      </div>
    )
  }

  const total = manga.chapters
  const ratio = total ? Math.min(1, entry.chapter / total) : null

  return (
    <div className="border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
      <div className="flex flex-wrap items-center gap-1.5">
        {READ_STATUS_ORDER.map((status) => {
          const blocked = readBlocked(status, manga, entry)
          return (
            <button
              key={status}
              data-on={entry.status === status}
              className="chip"
              disabled={!!blocked}
              title={blocked ?? undefined}
              onClick={() => void api.setEntry(manga.id, { status })}
            >
              {READ_STATUS_LABELS[status]}
            </button>
          )
        })}
        <button
          className="icon-btn !h-8 !w-8"
          onClick={() => void api.setEntry(manga.id, { favorite: !entry.favorite })}
          aria-label="Favori"
          aria-pressed={entry.favorite}
          style={entry.favorite ? { color: '#fb7185', background: 'rgba(251,113,133,.12)' } : undefined}
        >
          <Heart size={14} fill={entry.favorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="mt-3.5 flex flex-wrap gap-x-6 gap-y-3">
        <Counter
          label={entry.rereads > 0 ? `Chapitres · relecture ${entry.rereads}` : 'Chapitres'}
          value={entry.chapter}
          total={total}
          stepLabel="Un chapitre lu aujourd’hui"
          onStep={(d) => void api.advance(manga.id, d)}
          onSet={(n) => void api.setChapter(manga.id, n, true)}
        />
        <Counter
          label="Tomes"
          value={entry.volume}
          total={manga.volumes}
          stepLabel="Un tome de plus"
          onStep={(d) => void api.setEntry(manga.id, { volume: entry.volume + d })}
          onSet={(n) => void api.setEntry(manga.id, { volume: n })}
        />
      </div>
      {ratio !== null && (
        <div className="mt-3 h-1 overflow-hidden rounded-full" style={{ background: 'var(--line)' }}>
          <div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, background: 'var(--accent)' }} />
        </div>
      )}
      <p className="mt-2 text-[0.7rem] text-faint">
        « +1 » compte une lecture d’aujourd’hui ; un numéro tapé rattrape sans dater.
      </p>

      <textarea
        value={notes ?? entry.notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={(e) => {
          setNotes(null)
          if (e.target.value !== entry.notes) void api.setEntry(manga.id, { notes: e.target.value })
        }}
        rows={2}
        placeholder="Mes notes : un arc, un personnage, où reprendre…"
        className="field mt-3 w-full !h-auto resize-y py-2 text-[0.8rem] leading-relaxed"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {entry.status === 'completed' && (
          <button
            className="btn btn-ghost !h-8 !text-[0.76rem]"
            onClick={() =>
              void api.reread(manga.id).then(() => toast('Relecture commencée : la progression repart de zéro.', 'ok'))
            }
          >
            <RotateCcw size={13} />
            Relire
          </button>
        )}
        <button
          className="btn btn-ghost ml-auto !h-8 !text-[0.76rem]"
          onClick={() => {
            if (!confirmRemove) return setConfirmRemove(true)
            void api.remove(manga.id)
          }}
          onBlur={() => setConfirmRemove(false)}
        >
          <Trash2 size={13} />
          {confirmRemove ? 'Retirer, avec son historique ?' : 'Retirer de ma liste'}
        </button>
      </div>
    </div>
  )
}

export function MangaSheet({ manga, onClose }: { manga: Manga; onClose: () => void }): React.JSX.Element {
  const glow = toneAccent(manga.cover.color)
  return (
    <>
      <div className="flex gap-4 border-b p-5" style={{ borderColor: 'var(--line)' }}>
        <Poster src={manga.cover.xl} alt="" className="h-[168px] w-[116px] shrink-0" rounded="rounded-[14px]" />
        <div className="min-w-0 flex-1">
          {/* L'origine avant le statut : c'est elle qui dit ce qu'on s'apprête
              à lire — un manhwa se lit en couleur et se défile, un manga se
              tourne de droite à gauche. */}
          <p className="label" style={{ color: rgba(glow, 1) }} title={ORIGIN_HINTS[manga.origin]}>
            {ORIGIN_LABELS[manga.origin]}
            {manga.status && MANGA_STATUS[manga.status] ? ` · ${MANGA_STATUS[manga.status]}` : ''}
          </p>
          <h2 className="title-xl mt-1 text-[1.3rem] leading-tight">{manga.title.english ?? manga.title.romaji}</h2>
          {manga.title.native && <p className="mt-0.5 text-[0.78rem] text-faint">{manga.title.native}</p>}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.76rem] text-muted">
            {manga.averageScore !== null && (
              <span className="font-semibold" style={{ color: rgba(glow, 1) }}>
                {manga.averageScore}%
              </span>
            )}
            {manga.chapters && <span>{manga.chapters} chapitres</span>}
            {manga.volumes && <span>{manga.volumes} tomes</span>}
            {manga.startYear && <span>{manga.startYear}</span>}
          </div>

          {manga.staff.length > 0 && <p className="mt-1.5 text-[0.76rem] text-faint">{manga.staff.join(' · ')}</p>}
        </div>
      </div>

      <Reading manga={manga} />

      <div className="max-h-[26vh] overflow-y-auto px-5 py-4">
        {manga.genres.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {manga.genres.map((genre) => (
              <span key={genre} className="chip !h-6 !cursor-default !text-[0.65rem]">
                {genre}
              </span>
            ))}
          </div>
        )}
        <p className="whitespace-pre-line text-[0.83rem] leading-relaxed text-muted">
          {manga.description ?? 'Aucun résumé sur AniList.'}
        </p>
      </div>

      <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--line)' }}>
        <button className="btn" onClick={onClose}>
          Fermer
        </button>
        <button className="btn btn-primary" onClick={() => void window.api.app.openExternal(manga.siteUrl)}>
          <BookOpen size={14} />
          Voir sur AniList
          <ExternalLink size={13} />
        </button>
      </div>
    </>
  )
}
