import { ArrowRight, History } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { RestoreMode, RestorePreview, SeriesChange } from '@shared/restore'
import { STATUS_LABELS, type BackupCopy } from '@shared/types'
import { Modal, Spinner } from '@/components/ui'
import { pluralize, relativeDay } from '@/lib/format'
import { useApp } from '@/store/app'

/** Combien de titres on nomme par groupe avant de résumer le reste. */
const NAMED = 6

/** L'heure, à la seconde quand une autre copie tombe dans la même minute. */
function hour(at: number, all: BackupCopy[]): string {
  const minute = Math.floor(at / 60_000)
  const twin = all.some((c) => c.at !== at && Math.floor(c.at / 60_000) === minute)
  return new Date(at).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    ...(twin ? { second: '2-digit' } : {})
  })
}

function kilo(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`
    : `${Math.max(1, Math.round(bytes / 1024))} Ko`
}

/** Un groupe de titres : les premiers par leur nom, le reste en nombre. */
function Group({
  title,
  rows,
  tone,
  detail
}: {
  title: string
  rows: SeriesChange[]
  tone?: string
  detail?: (row: SeriesChange) => React.ReactNode
}): React.JSX.Element | null {
  if (!rows.length) return null
  const rest = rows.length - NAMED
  return (
    <div className="mt-3">
      <h4 className="label mb-1.5" style={tone ? { color: tone } : undefined}>
        {title} · {rows.length}
      </h4>
      <ul className="space-y-0.5 text-[0.8rem]">
        {rows.slice(0, NAMED).map((row) => (
          <li key={row.id} className="flex min-w-0 items-center gap-2">
            <span className="truncate">{row.title}</span>
            {detail && <span className="shrink-0 text-muted">{detail(row)}</span>}
          </li>
        ))}
        {rest > 0 && <li className="text-muted">et {pluralize(rest, 'autre', 'autres')}</li>}
      </ul>
    </div>
  )
}

/** « 107 → 112 », le second en gras quand il change. */
function Figure({ label, before, after }: { label: string; before: number; after: number }): React.JSX.Element {
  return (
    <div className="rounded-xl border border-[var(--line)] px-3 py-2">
      <div className="text-[0.7rem] text-muted">{label}</div>
      <div className="flex items-baseline gap-1.5 tabular-nums">
        <span className={after === before ? 'font-semibold' : 'text-muted'}>{before}</span>
        {after !== before && (
          <>
            <ArrowRight size={11} className="self-center text-muted" />
            <span className="font-semibold">{after}</span>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Restaurer une copie du dossier de sauvegarde, en voyant d'abord ce qui change.
 *
 * « Restaurer une sauvegarde » demandait un fichier et l'appliquait à
 * l'aveugle : on choisissait une date sans savoir si elle contenait la série
 * perdue, ni ce que le remplacement allait emporter. Ici la liste des copies
 * est déjà là, et chaque choix — une date, fusionner ou remplacer — montre ce
 * qu'il ferait avant qu'on le fasse. L'aperçu vient du même calcul que la
 * restauration.
 */
export default function RestoreBackup({
  open,
  onClose,
  onDone
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
}): React.JSX.Element {
  const toast = useApp((s) => s.toast)
  const [copies, setCopies] = useState<BackupCopy[] | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [mode, setMode] = useState<RestoreMode>('merge')
  const [preview, setPreview] = useState<{ key: string; data: RestorePreview | null; error: string | null } | null>(
    null
  )
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true
    void window.api.backup.copies().then((list) => {
      if (!alive) return
      setCopies(list)
      setPicked((p) => p ?? list[0]?.name ?? null)
    })
    return () => {
      alive = false
    }
  }, [open])

  const key = picked ? `${picked}:${mode}` : ''
  useEffect(() => {
    if (!open || !picked) return
    let alive = true
    const k = `${picked}:${mode}`
    void window.api.backup.preview(picked, mode).then((res) => {
      if (!alive) return
      setPreview(res.ok ? { key: k, data: res.preview, error: null } : { key: k, data: null, error: res.error })
    })
    return () => {
      alive = false
    }
  }, [open, picked, mode])

  const shown = preview?.key === key ? preview : null
  const p = shown?.data ?? null
  // Remplacer en perdant quelque chose mérite la couleur d'un geste qui coûte.
  const costly = !!p && (p.removed.length > 0 || p.episodes.lost > 0)

  const restore = (): void => {
    if (!picked) return
    setBusy(true)
    void window.api.backup
      .restore(picked, mode)
      .then((res) => {
        if (!res.ok) {
          toast(res.message, 'error')
          return
        }
        toast(`${res.message} L’état d’avant est gardé dans une nouvelle copie.`, 'ok')
        onDone()
        onClose()
      })
      .finally(() => setBusy(false))
  }

  return (
    <Modal open={open} onClose={onClose} width={680}>
      <div className="p-6">
        <h3 className="title-xl mb-1 text-[1.1rem]">Restaurer une copie</h3>
        <p className="mb-4 max-w-[60ch] text-[0.82rem] leading-relaxed text-muted">
          Choisis une date : l’aperçu dit ce qui changerait avant que rien ne change. Ta bibliothèque actuelle est
          copiée juste avant, pour pouvoir revenir en arrière.
        </p>

        {copies === null ? (
          <div className="grid h-40 place-items-center">
            <Spinner />
          </div>
        ) : copies.length === 0 ? (
          <p className="text-[0.84rem] text-muted">Aucune copie dans le dossier de sauvegarde.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-[236px_1fr]">
            <ul className="max-h-[340px] space-y-1 overflow-y-auto pr-1" aria-label="Copies">
              {copies.map((copy) => (
                <li key={copy.name}>
                  <button
                    className="chip w-full justify-between gap-3"
                    data-on={copy.name === picked}
                    aria-pressed={copy.name === picked}
                    onClick={() => setPicked(copy.name)}
                  >
                    <span>
                      {relativeDay(copy.at)} · {hour(copy.at, copies)}
                    </span>
                    <span className="text-[0.7rem] text-muted">{kilo(copy.bytes)}</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="min-w-0">
              <div className="mb-3 flex gap-1.5" role="radiogroup" aria-label="Manière de restaurer">
                <button
                  className="chip flex-1 justify-center"
                  role="radio"
                  aria-checked={mode === 'merge'}
                  data-on={mode === 'merge'}
                  onClick={() => setMode('merge')}
                  title="Ajoute ce qui manque, ne retire rien"
                >
                  Fusionner
                </button>
                <button
                  className="chip flex-1 justify-center"
                  role="radio"
                  aria-checked={mode === 'replace'}
                  data-on={mode === 'replace'}
                  onClick={() => setMode('replace')}
                  title="La bibliothèque devient exactement la copie"
                >
                  Remplacer
                </button>
              </div>
              <p className="mb-3 text-[0.76rem] text-muted">
                {mode === 'merge'
                  ? 'Ajoute ce qui manque. Rien de ce que tu as aujourd’hui n’est retiré, et une série plus récente ici garde sa version.'
                  : 'Ta bibliothèque devient exactement cette copie : ce qui a été ajouté depuis disparaît.'}
              </p>

              {!shown ? (
                <div className="grid h-32 place-items-center">
                  <Spinner />
                </div>
              ) : shown.error ? (
                <p className="text-[0.82rem]" style={{ color: '#ff9a9a' }}>
                  {shown.error}
                </p>
              ) : p ? (
                <div aria-live="polite">
                  <div className="grid grid-cols-3 gap-2">
                    <Figure label="Séries" before={p.series.before} after={p.series.after} />
                    <Figure label="Épisodes vus" before={p.episodes.before} after={p.episodes.after} />
                    <Figure label="Listes" before={p.lists.before} after={p.lists.after} />
                  </div>
                  {p.identical ? (
                    <p className="mt-3 text-[0.82rem] text-muted">
                      Rien ne changerait : cette copie ne contient rien que ta bibliothèque n’ait déjà.
                    </p>
                  ) : (
                    <div className="max-h-[210px] overflow-y-auto pr-1">
                      {(p.episodes.gained > 0 || p.episodes.lost > 0) && (
                        <p className="mt-3 text-[0.8rem]">
                          {p.episodes.gained > 0 &&
                            `${pluralize(p.episodes.gained, 'visionnage revient', 'visionnages reviennent')}`}
                          {p.episodes.gained > 0 && p.episodes.lost > 0 && ' · '}
                          {p.episodes.lost > 0 && (
                            <span style={{ color: '#ff9a9a' }}>
                              {pluralize(p.episodes.lost, 'visionnage disparaît', 'visionnages disparaissent')}
                            </span>
                          )}
                        </p>
                      )}
                      <Group title="Reviennent" rows={p.added} detail={(r) => (r.to ? STATUS_LABELS[r.to] : null)} />
                      <Group
                        title="Changent de statut"
                        rows={p.changed}
                        detail={(r) => `${r.from ? STATUS_LABELS[r.from] : ''} → ${r.to ? STATUS_LABELS[r.to] : ''}`}
                      />
                      <Group title="Disparaissent" rows={p.removed} tone="#ff9a9a" />
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button
            className={costly ? 'btn' : 'btn btn-primary'}
            style={
              costly
                ? { background: 'rgba(255,80,80,.16)', borderColor: 'rgba(255,80,80,.4)', color: '#ff9a9a' }
                : undefined
            }
            disabled={busy || !p || p.identical}
            onClick={restore}
          >
            <History size={14} />
            {busy ? 'Restauration…' : mode === 'replace' ? 'Remplacer par cette copie' : 'Fusionner cette copie'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
