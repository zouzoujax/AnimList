/**
 * The TV Time / OpenTV import panel.
 *
 * An import is long and imperfect: a handful of series never match, and a few
 * land only partly. So the panel is built around the aftermath rather than the
 * button — it shows what happened to every series and lets the failures be
 * corrected by hand, then replayed without leaving the app.
 */

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, ExternalLink, Search, SkipForward, Upload, X } from 'lucide-react'
import type { TvTimeProgress, TvTimeReport, TvTimeShowResult } from '@shared/types'
import { TVTIME_SKIP } from '@shared/types'
import { useApp } from '../store/app'

const STATUS_LABEL: Record<TvTimeShowResult['status'], string> = {
  ok: 'Importée',
  partial: 'Partielle',
  unmatched: 'Introuvable',
  skipped: 'Ignorée'
}

const STATUS_COLOR: Record<TvTimeShowResult['status'], string> = {
  ok: 'var(--ok, #4ade80)',
  partial: '#fbbf24',
  unmatched: '#ff8080',
  skipped: 'var(--muted)'
}

/** Series the user may want to act on, worst first. */
const needsAttention = (s: TvTimeShowResult): boolean => s.status !== 'ok'

function StatusChip({ status }: { status: TvTimeShowResult['status'] }): React.JSX.Element {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[0.68rem] font-medium"
      style={{ color: STATUS_COLOR[status], background: 'color-mix(in srgb, currentColor 12%, transparent)' }}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

function ShowRow({
  show,
  draft,
  onDraft,
  onPin,
  onSkip,
  onClear
}: {
  show: TvTimeShowResult
  draft: string
  onDraft: (value: string) => void
  onPin: () => void
  onSkip: () => void
  onClear: () => void
}): React.JSX.Element {
  const chain = show.chain.map((c) => `${c.title} ${c.took}/${c.of ?? '?'}`).join('  +  ')

  return (
    <li className="border-t py-2.5 first:border-t-0" style={{ borderColor: 'var(--line)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[0.82rem]">{show.sourceName}</span>
        <span className="text-[0.72rem] text-faint">
          {show.placed}/{show.watched} ép.
        </span>
        <StatusChip status={show.status} />
      </div>

      {chain && <p className="mt-1 truncate text-[0.72rem] text-faint">{chain}</p>}

      {needsAttention(show) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <input
            className="field w-[8.5rem] text-[0.75rem]"
            placeholder="id AniList"
            inputMode="numeric"
            value={draft}
            onChange={(e) => onDraft(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft) onPin()
            }}
          />
          <button className="btn text-[0.75rem]" disabled={!draft} onClick={onPin} title="Associer cet id">
            <Check size={13} />
            Associer
          </button>
          <button
            className="btn text-[0.75rem]"
            onClick={() =>
              window.api.app.openExternal(
                `https://anilist.co/search/anime?search=${encodeURIComponent(show.sourceName)}`
              )
            }
            title="Chercher l'id sur AniList"
          >
            <Search size={13} />
            Chercher
            <ExternalLink size={11} />
          </button>
          {show.status === 'skipped' ? (
            <button className="btn text-[0.75rem]" onClick={onClear}>
              <X size={13} />
              Ne plus ignorer
            </button>
          ) : (
            <button className="btn text-[0.75rem]" onClick={onSkip}>
              <SkipForward size={13} />
              Ignorer
            </button>
          )}
        </div>
      )}
    </li>
  )
}

export default function TvTimeImport(): React.JSX.Element {
  const prefs = useApp((s) => s.prefs)
  const setPrefs = useApp((s) => s.setPrefs)
  const toast = useApp((s) => s.toast)

  const [report, setReport] = useState<TvTimeReport | null>(null)
  const [progress, setProgress] = useState<TvTimeProgress | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [showAll, setShowAll] = useState(false)
  const running = useRef(false)

  useEffect(() => window.api.data.onTvTimeProgress(setProgress), [])

  const start = async (folder?: string | null): Promise<void> => {
    if (running.current) return
    running.current = true
    setReport(null)
    try {
      const result = await window.api.data.importTvTime(folder)
      setReport(result)
      if (result.message) toast(result.message, result.ok ? 'ok' : 'info')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      running.current = false
      setProgress(null)
    }
  }

  const setOverride = (sourceId: string, value: number | null): void => {
    const next = { ...prefs.tvtimeOverrides }
    if (value === null) delete next[sourceId]
    else next[sourceId] = value
    void setPrefs({ tvtimeOverrides: next })
  }

  const busy = progress !== null && progress.total > 0
  const problems = report?.shows.filter(needsAttention) ?? []
  const visible = report ? (showAll ? report.shows : problems) : []

  return (
    <div className="border-t py-3" style={{ borderColor: 'var(--line)' }}>
      <p className="text-[0.85rem] font-medium">Importer depuis TV Time / OpenTV</p>
      <p className="mt-0.5 text-[0.74rem] text-faint">
        Choisis le dossier de l'export. Les séries suivies sont retrouvées sur AniList et leurs épisodes répartis sur
        les saisons correspondantes — une série TheTVDB couvre souvent plusieurs fiches AniList.
      </p>

      {busy ? (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 flex-1 truncate text-[0.78rem]">{progress.label || 'Analyse…'}</span>
            <span className="text-[0.72rem] text-faint">
              {progress.done}/{progress.total}
            </span>
            <button className="btn text-[0.75rem]" onClick={() => void window.api.data.cancelTvTime()}>
              Interrompre
            </button>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--line)' }}>
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%`,
                background: 'var(--accent)'
              }}
            />
          </div>
          <p className="mt-1.5 text-[0.7rem] text-faint">
            L'import respecte la limite de requêtes d'AniList ; compte environ une seconde par série.
          </p>
        </div>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button className="btn btn-primary" onClick={() => void start()}>
            <Upload size={14} />
            Choisir un dossier
          </button>
          {prefs.tvtimeFolder && (
            <button className="btn" onClick={() => void start(prefs.tvtimeFolder)} title={prefs.tvtimeFolder}>
              Relancer sur le dernier dossier
            </button>
          )}
        </div>
      )}

      {report && !busy && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex-1 text-[0.78rem]">{report.message}</p>
            {report.shows.length > problems.length && (
              <button className="btn text-[0.75rem]" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Ne montrer que les problèmes' : `Tout voir (${report.shows.length})`}
              </button>
            )}
          </div>

          {problems.length > 0 && !showAll && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[0.74rem]" style={{ color: '#fbbf24' }}>
              <AlertTriangle size={13} />
              {problems.length} série{problems.length > 1 ? 's' : ''} à vérifier. Associe un id AniList, puis relance :
              les corrections sont conservées.
            </p>
          )}

          {visible.length > 0 && (
            <ul className="mt-2 max-h-[22rem] overflow-y-auto pr-1">
              {visible.map((show) => (
                <ShowRow
                  key={show.sourceId}
                  show={show}
                  draft={drafts[show.sourceId] ?? ''}
                  onDraft={(value) => setDrafts((d) => ({ ...d, [show.sourceId]: value }))}
                  onPin={() => {
                    setOverride(show.sourceId, Number(drafts[show.sourceId]))
                    toast(`${show.sourceName} associée — relance l'import pour l'appliquer.`, 'ok')
                  }}
                  onSkip={() => setOverride(show.sourceId, TVTIME_SKIP)}
                  onClear={() => setOverride(show.sourceId, null)}
                />
              ))}
            </ul>
          )}

          {problems.length === 0 && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[0.74rem]" style={{ color: STATUS_COLOR.ok }}>
              <Check size={13} />
              Toutes les séries ont été placées.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
