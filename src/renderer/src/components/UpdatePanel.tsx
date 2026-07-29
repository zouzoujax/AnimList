/**
 * Update controls for the settings page.
 *
 * En automatique il n'y a rien à faire : le panneau ne fait que raconter où en
 * est le cycle, et propose le redémarrage immédiat quand la version est prête.
 * Le réglage coupé, les trois étapes — chercher, télécharger, redémarrer —
 * redeviennent des boutons.
 */

import { useEffect, useState } from 'react'
import { Check, Download, RefreshCw, RotateCw, TriangleAlert } from 'lucide-react'
import type { UpdateStatus } from '@shared/types'
import { useApp } from '../store/app'

export default function UpdatePanel({ version }: { version: string | null }): React.JSX.Element {
  const toast = useApp((s) => s.toast)
  const auto = useApp((s) => s.prefs.autoUpdate)
  const [status, setStatus] = useState<UpdateStatus>({
    phase: 'idle',
    version: null,
    percent: 0,
    message: null
  })

  useEffect(() => {
    void window.api.app.updateStatus().then(setStatus)
    return window.api.app.onUpdateStatus(setStatus)
  }, [])

  const busy = status.phase === 'checking' || status.phase === 'downloading'

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

        {/* En automatique le téléchargement est déjà parti tout seul. */}
        {status.phase === 'available' && !auto && (
          <button className="btn btn-primary" onClick={() => void window.api.app.downloadUpdate()}>
            <Download size={14} />
            Télécharger
          </button>
        )}

        {status.phase === 'ready' && (
          <button className="btn btn-primary" onClick={() => void window.api.app.installUpdate()}>
            <RotateCw size={14} />
            Redémarrer maintenant
          </button>
        )}

        {status.phase !== 'ready' && status.phase !== 'available' && (
          <button
            className="btn"
            disabled={busy || status.phase === 'unsupported'}
            onClick={() =>
              void window.api.app.checkUpdate().then((next) => {
                if (next.phase === 'current') toast('Tu as déjà la dernière version.', 'ok')
              })
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
    </div>
  )
}
