/**
 * Selection toolbar for the library.
 *
 * Appears only once something is selected, so the page is unchanged for the
 * common case of just browsing. Every action here is a single store write and a
 * single echo — applying a status to forty series must not fire forty updates.
 */

import { useState } from 'react'
import { CheckCheck, FolderPlus, Heart, HeartOff, Trash2, X } from 'lucide-react'
import { STATUS_LABELS, type LibraryStatus } from '@shared/types'
import { useApp } from '../store/app'
import ListPicker from './ListPicker'
import { Modal } from './ui'

const STATUSES: LibraryStatus[] = ['watching', 'planned', 'completed', 'paused', 'dropped']

export default function BulkBar({
  selected,
  onClear
}: {
  selected: Set<number>
  onClear: () => void
}): React.JSX.Element | null {
  const entries = useApp((s) => s.entries)
  const bulkPatch = useApp((s) => s.bulkPatch)
  const bulkRemove = useApp((s) => s.bulkRemove)
  const bulkMarkWatched = useApp((s) => s.bulkMarkWatched)
  const toast = useApp((s) => s.toast)

  const [picking, setPicking] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  if (selected.size === 0) return null
  const ids = [...selected]

  /**
   * Un bouton qui n'ajoute jamais que des favoris ne sait pas défaire son
   * propre geste. Il bascule : tout en favori, il les retire ; sinon il ajoute.
   */
  const allFavorite = ids.every((id) => entries.get(id)?.favorite)

  const apply = async (label: string, action: () => Promise<number>): Promise<void> => {
    const n = await action()
    toast(`${label} — ${n} modifié${n > 1 ? 's' : ''}`, 'ok')
    onClear()
  }

  return (
    <>
      <div
        className="glass-blur fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-1.5 rounded-[18px] px-3 py-2.5 shadow-2xl"
        role="region"
        aria-label="Actions groupées"
      >
        <span className="px-1.5 text-[0.8rem] font-medium tabular-nums">
          {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
        </span>

        <span className="mx-1 h-5 w-px" style={{ background: 'var(--line)' }} />

        <label className="relative flex items-center">
          <select
            className="field !h-8 !pr-7 !pl-2.5 text-[0.78rem]"
            defaultValue=""
            onChange={(e) => {
              const status = e.target.value as LibraryStatus
              if (!status) return
              e.target.value = ''
              void apply(STATUS_LABELS[status], () => bulkPatch(ids, { status }))
            }}
          >
            <option value="" disabled>
              Statut…
            </option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>

        <button className="btn !h-8 text-[0.78rem]" onClick={() => setPicking(true)}>
          <FolderPlus size={13} />
          Liste
        </button>

        <button
          className="btn !h-8 text-[0.78rem]"
          onClick={() =>
            void apply(allFavorite ? 'Retirés des favoris' : 'Favoris', () =>
              bulkPatch(ids, { favorite: !allFavorite })
            )
          }
        >
          {allFavorite ? <HeartOff size={13} /> : <Heart size={13} />}
          {allFavorite ? 'Plus favori' : 'Favori'}
        </button>

        <button
          className="btn !h-8 text-[0.78rem]"
          onClick={() => void apply('Épisodes cochés', () => bulkMarkWatched(ids))}
          title="Coche tous les épisodes connus de chaque série"
        >
          <CheckCheck size={13} />
          Tout vu
        </button>

        <button
          className="btn !h-8 text-[0.78rem]"
          style={{ color: '#ff8080', borderColor: 'rgba(255,128,128,.3)' }}
          onClick={() => setConfirmRemove(true)}
        >
          <Trash2 size={13} />
          Retirer
        </button>

        <button className="icon-btn !h-8 !w-8" onClick={onClear} aria-label="Annuler la sélection">
          <X size={14} />
        </button>
      </div>

      <ListPicker open={picking} onClose={() => setPicking(false)} animeIds={ids} />

      <Modal open={confirmRemove} onClose={() => setConfirmRemove(false)} width={420}>
        <div className="px-5 py-5">
          <p className="text-[0.95rem] font-semibold">
            Retirer {selected.size} anime{selected.size > 1 ? 's' : ''} ?
          </p>
          <p className="mt-1.5 text-[0.82rem] text-muted">
            Leur historique d'épisodes sera supprimé aussi. Les fiches restent trouvables dans Découvrir.
          </p>
          <div className="mt-4 flex justify-end gap-1.5">
            <button className="btn" onClick={() => setConfirmRemove(false)}>
              Annuler
            </button>
            <button
              className="btn"
              style={{ color: '#ff8080', borderColor: 'rgba(255,128,128,.3)' }}
              onClick={() => {
                setConfirmRemove(false)
                void apply('Retirés', () => bulkRemove(ids))
              }}
            >
              Retirer
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
