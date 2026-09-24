import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { exportName, ofYear, spokenHours, toCsv, toMarkdown, yearsOf, type ExportRow } from '@shared/journal-export'
import { Modal } from '@/components/ui'
import { titleOf } from '@/lib/format'
import { emotionOf, type JournalRow } from '@/lib/journal'
import { useApp } from '@/store/app'

type Format = 'md' | 'csv'

/**
 * Sortir son journal de l'app.
 *
 * Une sauvegarde JSON se restaure, elle ne se lit pas : tant que la seule
 * façon de relire ses années de visionnage est d'ouvrir l'app, « local et
 * inspectable » n'est vrai qu'à moitié. Le Markdown se lit tel quel et se
 * colle dans n'importe quel carnet ; le CSV s'ouvre dans un tableur, pour
 * compter autre chose que ce que l'app compte.
 *
 * Ce qui part est ce que la page montre, filtres compris — c'est dit dans la
 * fenêtre, parce qu'exporter « tout » et n'obtenir que les lignes annotées
 * serait une mauvaise surprise qu'on ne découvrirait qu'en ouvrant le fichier.
 */
export function JournalExport({ rows, filtered }: { rows: JournalRow[]; filtered: boolean }): React.JSX.Element {
  const lang = useApp((s) => s.prefs.titleLang)
  const toast = useApp((s) => s.toast)
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<Format>('md')
  const [year, setYear] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const all = useMemo<ExportRow[]>(
    () =>
      rows.map(({ event, media }) => ({
        at: event.at,
        title: titleOf(media, lang),
        episode: event.episode,
        minutes: event.minutes,
        note: event.note,
        emotions: (event.emotions ?? []).map((id) => emotionOf(id)?.emoji ?? '').filter(Boolean),
        pass: event.pass
      })),
    [rows, lang]
  )

  const years = useMemo(() => yearsOf(all), [all])
  const chosen = useMemo(() => ofYear(all, year), [all, year])
  const minutes = chosen.reduce((sum, row) => sum + (row.minutes || 0), 0)

  const save = (): void => {
    const title = year === null ? 'Journal' : `Journal — ${year}`
    const text = format === 'md' ? toMarkdown(chosen, title) : toCsv(chosen)
    setBusy(true)
    void window.api.data
      .exportJournal(exportName(year, format), text)
      .then((report) => {
        if (report.message) toast(report.message, report.ok ? 'ok' : 'info')
        if (report.ok) setOpen(false)
      })
      .finally(() => setBusy(false))
  }

  return (
    <>
      <button className="chip" title="Enregistrer ton journal en Markdown ou en CSV" onClick={() => setOpen(true)}>
        <Download size={13} />
        Exporter
      </button>

      <Modal open={open} onClose={() => setOpen(false)} width={460}>
        <div className="p-6">
          <h3 className="title-xl mb-1 text-[1.1rem]">Exporter le journal</h3>
          <p className="mb-5 text-[0.8rem] leading-relaxed text-muted">
            Un fichier à toi, lisible sans l’app.
            {filtered && ' Ce sont les lignes actuellement affichées qui partent, filtres compris.'}
          </p>

          <p className="label mb-2">Format</p>
          <div className="nd-seg mb-5">
            <button aria-pressed={format === 'md'} onClick={() => setFormat('md')}>
              Markdown
            </button>
            <button aria-pressed={format === 'csv'} onClick={() => setFormat('csv')}>
              CSV
            </button>
          </div>

          <p className="label mb-2">Période</p>
          <select
            className="field mb-5 w-full"
            value={year ?? ''}
            onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
            aria-label="Année à exporter"
          >
            <option value="">Tout le journal</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <p className="mb-5 text-[0.8rem] text-muted">
            {chosen.length === 0
              ? 'Rien à exporter pour cette période.'
              : `${chosen.length} épisode${chosen.length > 1 ? 's' : ''}, ${spokenHours(minutes)} de visionnage.`}
          </p>

          <div className="flex justify-end gap-2">
            <button className="btn" onClick={() => setOpen(false)}>
              Annuler
            </button>
            <button className="btn btn-primary" disabled={busy || chosen.length === 0} onClick={save}>
              <Download size={14} />
              {busy ? 'Écriture…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
