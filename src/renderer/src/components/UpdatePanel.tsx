/**
 * Update controls for the settings page.
 *
 * En automatique il n'y a rien à faire : le panneau ne fait que raconter où en
 * est le cycle, et propose le redémarrage immédiat quand la version est prête.
 * Le réglage coupé, les trois étapes — chercher, télécharger, redémarrer —
 * redeviennent des boutons.
 *
 * Une version trouvée ouvre le détail de ce qu'elle change : accepter une mise
 * à jour sans savoir ce qu'elle fait, c'est signer sans lire.
 */

import { useEffect, useState } from 'react'
import {
  Check,
  Download,
  Pencil,
  Plus,
  RefreshCw,
  RotateCw,
  Sparkles,
  Trash2,
  TriangleAlert,
  Wrench
} from 'lucide-react'
import type { NoteKind, ReleaseNote, UpdateStatus } from '@shared/types'
import { Modal } from './ui'
import { useApp } from '../store/app'

const KIND: Record<NoteKind, { icon: typeof Plus; color: string }> = {
  add: { icon: Plus, color: 'var(--accent-2)' },
  change: { icon: Pencil, color: 'var(--accent)' },
  fix: { icon: Wrench, color: '#ffb038' },
  remove: { icon: Trash2, color: '#ff8080' },
  other: { icon: Sparkles, color: 'var(--color-faint)' }
}

function NotesModal({
  open,
  onClose,
  notes,
  action
}: {
  open: boolean
  onClose: () => void
  notes: ReleaseNote[]
  action: React.ReactNode
}): React.JSX.Element {
  return (
    <Modal open={open} onClose={onClose} width={560}>
      <div className="border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
        <p className="text-[1.02rem] font-semibold">Quoi de neuf</p>
        <p className="mt-0.5 text-[0.76rem] text-faint">
          {notes.length > 1
            ? `${notes.length} versions depuis la tienne — voici tout ce qui change.`
            : `Ce que la version ${notes[0]?.version ?? ''} apporte.`}
        </p>
      </div>

      <div className="max-h-[52vh] overflow-y-auto px-5 py-4">
        {notes.map((note) => (
          <section key={note.version} className="mb-5 last:mb-0">
            {notes.length > 1 && (
              <p className="label mb-2" style={{ color: 'var(--accent)' }}>
                Version {note.version}
              </p>
            )}
            {note.sections.map((section) => {
              const { icon: Icon, color } = KIND[section.kind]
              return (
                <div key={section.kind} className="mb-3 last:mb-0">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[0.78rem] font-semibold" style={{ color }}>
                    <Icon size={13} />
                    {section.label}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {section.items.map((item, i) => (
                      <li key={i} className="flex gap-2 text-[0.8rem] leading-relaxed text-muted">
                        <span aria-hidden style={{ color }}>
                          ·
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </section>
        ))}
      </div>

      <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--line)' }}>
        <button className="btn" onClick={onClose}>
          Fermer
        </button>
        {action}
      </div>
    </Modal>
  )
}

export default function UpdatePanel({ version }: { version: string | null }): React.JSX.Element {
  const toast = useApp((s) => s.toast)
  const auto = useApp((s) => s.prefs.autoUpdate)
  const [status, setStatus] = useState<UpdateStatus>({
    phase: 'idle',
    version: null,
    percent: 0,
    message: null,
    notes: []
  })
  const [notesOpen, setNotesOpen] = useState(false)

  useEffect(() => {
    void window.api.app.updateStatus().then(setStatus)
    return window.api.app.onUpdateStatus(setStatus)
  }, [])

  const busy = status.phase === 'checking' || status.phase === 'downloading'
  const hasNotes = status.notes.length > 0

  const hint = ((): string => {
    switch (status.phase) {
      case 'checking':
        return 'Recherche…'
      case 'current':
        return `Version ${version ?? '—'} — à jour.`
      case 'available':
        return auto
          ? `Version ${status.version} trouvée, téléchargement en cours…`
          : `Version ${status.version} disponible.`
      case 'downloading':
        return `Téléchargement… ${status.percent} %`
      case 'ready':
        return `Version ${status.version} prête. Elle s'installera à la fermeture de l'app.`
      case 'error':
        return status.message ?? 'La vérification a échoué.'
      case 'unsupported':
        return 'Lancé depuis les sources : il n’y a pas d’application installée à remplacer.'
      default:
        return auto
          ? `Version ${version ?? '—'}. Les nouvelles versions s'installent toutes seules.`
          : `Version ${version ?? '—'}.`
    }
  })()

  const download = (
    <button
      className="btn btn-primary"
      onClick={() => {
        setNotesOpen(false)
        void window.api.app.downloadUpdate()
      }}
    >
      <Download size={14} />
      Télécharger
    </button>
  )

  const restart = (
    <button className="btn btn-primary" onClick={() => void window.api.app.installUpdate()}>
      <RotateCw size={14} />
      Redémarrer maintenant
    </button>
  )

  return (
    <div className="border-t py-3" style={{ borderColor: 'var(--line)' }}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[12rem] flex-1">
          <p className="text-[0.85rem] font-medium">Mises à jour</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[0.74rem] text-faint">
            {status.phase === 'error' && <TriangleAlert size={12} style={{ color: '#ff8080' }} />}
            {status.phase === 'current' && <Check size={12} style={{ color: 'var(--accent-2)' }} />}
            {hint}
          </p>
        </div>

        {/* Reste joignable après coup : la fenêtre s'ouvre seule une fois, on
            doit pouvoir y revenir sans relancer une recherche. */}
        {hasNotes && (
          <button className="btn" onClick={() => setNotesOpen(true)}>
            <Sparkles size={14} />
            Nouveautés
          </button>
        )}

        {/* En automatique le téléchargement est déjà parti tout seul. */}
        {status.phase === 'available' && !auto && download}

        {status.phase === 'ready' && restart}

        {status.phase !== 'ready' && status.phase !== 'available' && (
          <button
            className="btn"
            disabled={busy || status.phase === 'unsupported'}
            onClick={() =>
              void window.api.app
                .checkUpdate()
                .then((next) => {
                  if (next.phase === 'current') toast('Tu as déjà la dernière version.', 'ok')
                  // Trouver une version et ne rien montrer de ce qu'elle change
                  // reviendrait à demander un acte de foi.
                  if (next.notes.length > 0) setNotesOpen(true)
                  else if (next.version) toast(`Version ${next.version} trouvée.`, 'ok')
                })
                // Sans ce filet, un rejet du canal laissait le bouton sans effet
                // visible : rien ne se passait, et rien ne disait pourquoi.
                .catch((err: Error) => toast(`Vérification impossible : ${err.message}`, 'error'))
            }
          >
            <RefreshCw size={14} className={busy ? 'animate-spin' : undefined} />
            Vérifier
          </button>
        )}
      </div>

      {status.phase === 'downloading' && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--line)' }}>
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${status.percent}%`, background: 'var(--accent)' }}
          />
        </div>
      )}

      {hasNotes && (
        <NotesModal
          open={notesOpen}
          onClose={() => setNotesOpen(false)}
          notes={status.notes}
          action={status.phase === 'ready' ? restart : status.phase === 'available' && !auto ? download : null}
        />
      )}
    </div>
  )
}
