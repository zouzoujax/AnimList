/**
 * Custom-list membership and upkeep, shared by the library's selection bar and
 * by a single anime's page.
 *
 * The four things a list needs — join, leave, rename, delete — used to be split
 * across two screens, and renaming was reachable from neither even though the
 * store, the IPC channel and the preload bridge all supported it. One control
 * now does all four.
 *
 * With an empty `animeIds` it becomes a pure management panel: the rows stop
 * being membership toggles, because there is nothing to put in or take out.
 */

import { useState } from 'react'
import { Check, Minus, Pencil, Trash2 } from 'lucide-react'
import type { CustomList } from '@shared/types'
import { useApp } from '../store/app'
import { Modal } from './ui'

/** Enough to tell one list from another at a glance, short enough to scan. */
const EMOJIS = ['📁', '⭐', '🔥', '🌸', '🎬', '🍿', '💤', '🏆', '🎯', '❤️', '🌙', '🧊']

function Editor({ list, onDone }: { list: CustomList; onDone: () => void }): React.JSX.Element {
  const updateList = useApp((s) => s.updateList)
  const deleteList = useApp((s) => s.deleteList)
  const toast = useApp((s) => s.toast)
  const [name, setName] = useState(list.name)
  const [emoji, setEmoji] = useState(list.emoji)
  const [confirming, setConfirming] = useState(false)

  const save = async (): Promise<void> => {
    if (!name.trim()) return
    await updateList(list.id, { name, emoji })
    onDone()
  }

  const drop = async (): Promise<void> => {
    await deleteList(list.id)
    toast(`Liste « ${list.name} » supprimée`, 'info')
    onDone()
  }

  return (
    <div className="px-5 py-4" style={{ background: 'var(--panel-2)' }}>
      <div className="flex flex-wrap gap-1">
        {EMOJIS.map((e) => (
          <button
            key={e}
            data-on={emoji === e}
            className="chip !h-8 !w-8 !justify-center !px-0 !text-[0.95rem]"
            onClick={() => setEmoji(e)}
            aria-label={`Emoji ${e}`}
          >
            <span aria-hidden>{e}</span>
          </button>
        ))}
      </div>

      <div className="mt-2.5 flex gap-1.5">
        <input
          className="field flex-1"
          value={name}
          onChange={(ev) => setName(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') void save()
          }}
          aria-label="Nom de la liste"
        />
        <button className="btn btn-primary" disabled={!name.trim()} onClick={() => void save()}>
          Enregistrer
        </button>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <button className="btn !h-7 text-[0.74rem]" onClick={onDone}>
          Annuler
        </button>
        {confirming ? (
          <span className="flex items-center gap-1.5">
            {/* Une liste est du rangement fait à la main : elle ne part pas sur
                un clic malheureux, comme le retrait groupé d'animes. */}
            <span className="text-[0.74rem] text-muted">Supprimer pour de bon ?</span>
            <button
              className="btn !h-7 text-[0.74rem]"
              style={{ color: '#ff8080', borderColor: 'rgba(255,128,128,.3)' }}
              onClick={() => void drop()}
            >
              Confirmer
            </button>
          </span>
        ) : (
          <button
            className="btn !h-7 text-[0.74rem]"
            style={{ color: '#ff8080', borderColor: 'rgba(255,128,128,.3)' }}
            onClick={() => setConfirming(true)}
          >
            <Trash2 size={12} />
            Supprimer
          </button>
        )}
      </div>
    </div>
  )
}

export default function ListPicker({
  open,
  onClose,
  animeIds
}: {
  open: boolean
  onClose: () => void
  animeIds: number[]
}): React.JSX.Element {
  const lists = useApp((s) => s.lists)
  const createList = useApp((s) => s.createList)
  const setListMembership = useApp((s) => s.setListMembership)
  const toast = useApp((s) => s.toast)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)

  // Rouvrir le panneau ne doit pas rouvrir l'éditeur laissé ouvert la fois
  // d'avant. On range à la fermeture plutôt que dans un effet, et toutes les
  // sorties passent par ici : bouton, Échap, clic sur le fond.
  const close = (): void => {
    setEditing(null)
    onClose()
  }

  const total = animeIds.length
  const picking = total > 0

  const toggle = async (list: CustomList): Promise<void> => {
    const held = animeIds.filter((id) => list.animeIds.includes(id)).length
    await setListMembership(list.id, animeIds, held !== total)
  }

  const create = async (): Promise<void> => {
    const list = await createList(name)
    if (!list) return
    setName('')
    if (picking) await setListMembership(list.id, animeIds, true)
    toast(`Liste « ${list.name} » créée`, 'ok')
  }

  const plural = total > 1 ? 's' : ''

  return (
    <Modal open={open} onClose={close} width={440}>
      <div className="border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
        <p className="text-[0.95rem] font-semibold">{picking ? 'Listes' : 'Gérer les listes'}</p>
        <p className="mt-0.5 text-[0.78rem] text-muted">
          {picking
            ? `${total} anime${plural} sélectionné${plural} — clique une liste pour l'y mettre ou l'en sortir`
            : 'Renomme, change l’emoji ou supprime une liste.'}
        </p>
      </div>

      {lists.length > 0 && (
        <ul className="max-h-[46vh] overflow-y-auto">
          {lists.map((list) => {
            const held = animeIds.filter((id) => list.animeIds.includes(id)).length
            const state = held === 0 ? 'none' : held === total ? 'all' : 'some'
            return (
              <li key={list.id} className="border-t first:border-t-0" style={{ borderColor: 'var(--line)' }}>
                <div className="flex items-center">
                  <button
                    className="flex flex-1 items-center gap-2.5 px-5 py-3 text-left hover:bg-[var(--panel-2)] disabled:cursor-default disabled:hover:bg-transparent"
                    onClick={() => void toggle(list)}
                    disabled={!picking}
                    aria-pressed={picking ? state === 'all' : undefined}
                  >
                    {picking && (
                      <span
                        className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border"
                        style={
                          state === 'none'
                            ? { borderColor: 'var(--line)' }
                            : { borderColor: 'transparent', background: 'var(--accent)', color: '#fff' }
                        }
                      >
                        {state === 'all' && <Check size={12} strokeWidth={3} />}
                        {/* Sélection à cheval : ni tout dedans, ni tout dehors. */}
                        {state === 'some' && <Minus size={12} strokeWidth={3} />}
                      </span>
                    )}
                    <span aria-hidden>{list.emoji}</span>
                    <span className="flex-1 truncate text-[0.85rem]">{list.name}</span>
                    <span className="text-faint text-[0.72rem] tabular-nums">{list.animeIds.length}</span>
                  </button>
                  <button
                    className="icon-btn mr-3 !h-8 !w-8"
                    onClick={() => setEditing(editing === list.id ? null : list.id)}
                    aria-label={`Modifier ${list.name}`}
                  >
                    <Pencil size={13} />
                  </button>
                </div>
                {editing === list.id && <Editor list={list} onDone={() => setEditing(null)} />}
              </li>
            )
          })}
        </ul>
      )}

      <div className="border-t px-5 py-4" style={{ borderColor: 'var(--line)' }}>
        <span className="label mb-1.5 block">Nouvelle liste</span>
        <div className="flex gap-1.5">
          <input
            className="field flex-1"
            placeholder="À rattraper cet été…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) void create()
            }}
          />
          <button className="btn btn-primary" disabled={!name.trim()} onClick={() => void create()}>
            Créer
          </button>
        </div>
      </div>
    </Modal>
  )
}
