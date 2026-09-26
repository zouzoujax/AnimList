/**
 * « Mes mangas » : les séries du dossier choisi, et de quoi reprendre.
 *
 * Rien ne vient d'Internet ici. On lit ses propres fichiers — CBZ, ZIP ou
 * dossiers d'images —, rangés un sous-dossier par série. Pour en acheter, un
 * lien mène à izneo, qui les vend légalement mais ne les laisse lire que chez
 * lui.
 */

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { BookOpen, ExternalLink, FolderOpen, FolderSearch, Play, RefreshCw, Unlink } from 'lucide-react'
import type { LocalSeries, LocalVolume, MangaShelf } from '@shared/types'
import { isFinished } from '@shared/manga-files'
import { Modal, Spinner } from '@/components/ui'
import { useNow } from '@/lib/hooks'
import { IZNEO_MANGA, izneoSearch } from '@/lib/izneo'
import { ageLabel } from '@shared/api-recovery'
import Reader from './Reader'
import { volumeLabel } from './useReader'

/** Le tome à reprendre : le dernier ouvert s'il n'est pas fini, sinon le suivant. */
function resumeOf(series: LocalSeries): LocalVolume {
  const opened = series.volumes.filter((v) => v.readAt).sort((a, b) => (b.readAt ?? 0) - (a.readAt ?? 0))[0]
  if (!opened) return series.volumes[0]
  if (!isFinished(opened.page, opened.pages)) return opened
  const at = series.volumes.indexOf(opened)
  return series.volumes[at + 1] ?? opened
}

function seriesProgress(series: LocalSeries): { read: number; total: number } {
  const total = series.volumes.length
  const read = series.volumes.filter((v) => isFinished(v.page, v.pages)).length
  return { read, total }
}

export default function Shelf(): React.JSX.Element {
  const [shelf, setShelf] = useState<MangaShelf | null>(null)
  const [open, setOpen] = useState<LocalSeries | null>(null)
  const [reading, setReading] = useState<{ series: LocalSeries; volume: string } | null>(null)
  const now = useNow()

  useEffect(() => {
    let alive = true
    void window.api.reader.shelf().then((next) => alive && setShelf(next))
    return () => {
      alive = false
    }
  }, [])

  const refresh = async (): Promise<void> => setShelf(await window.api.reader.shelf())

  const read = (series: LocalSeries, volume: LocalVolume): void => {
    setOpen(null)
    setReading({ series, volume: volume.id })
  }

  // La série la plus récemment ouverte, pour le bandeau « Reprendre ».
  const resume = useMemo(() => shelf?.series.find((s) => s.readAt) ?? null, [shelf])

  if (!shelf) return <Spinner label="Chargement de tes mangas…" />

  if (!shelf.root || shelf.missing) {
    return (
      <div className="glass mx-auto mt-4 max-w-[640px] rounded-[22px] p-8 text-center">
        <div
          className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl"
          style={{ background: 'color-mix(in oklab, var(--accent) 22%, transparent)' }}
        >
          <BookOpen size={24} />
        </div>
        <h2 className="title-xl text-[1.35rem]">{shelf.missing ? 'Dossier introuvable' : 'Lis tes mangas ici'}</h2>
        <p className="mx-auto mt-2 max-w-[460px] text-[0.85rem] leading-relaxed text-muted">
          {shelf.missing
            ? `Le dossier ${shelf.root} a été déplacé ou supprimé. Choisis-le à nouveau.`
            : 'Choisis le dossier où sont tes mangas : un sous-dossier par série, avec des tomes en CBZ, en ZIP ou en dossiers d’images. Page seule, double page ou défilement, dans le sens manga.'}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button className="btn btn-primary" onClick={() => void window.api.reader.choose().then(setShelf)}>
            <FolderSearch size={15} />
            Choisir mon dossier
          </button>
          <button className="btn" onClick={() => void window.api.app.openExternal(IZNEO_MANGA)}>
            Acheter sur izneo
            <ExternalLink size={13} />
          </button>
        </div>
        <pre className="mx-auto mt-6 w-fit text-left text-[0.72rem] leading-relaxed text-faint">
          {
            'Mangas/\n  Frieren/\n    Frieren T01.cbz\n    Frieren T02.cbz\n  Dandadan/\n    Tome 01/  001.jpg 002.jpg …'
          }
        </pre>
      </div>
    )
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2 text-[0.78rem] text-muted">
        <FolderOpen size={14} />
        <span className="truncate">{shelf.root}</span>
        <span className="text-faint">
          · {shelf.series.length} série{shelf.series.length > 1 ? 's' : ''}
        </span>
        <div className="ml-auto flex gap-1.5">
          <button className="btn !h-8" onClick={() => void refresh()}>
            <RefreshCw size={13} />
            Actualiser
          </button>
          <button className="btn !h-8" onClick={() => void window.api.reader.choose().then(setShelf)}>
            <FolderSearch size={13} />
            Changer
          </button>
          <button
            className="btn btn-ghost !h-8"
            title="Oublier ce dossier (rien n'est supprimé du disque)"
            onClick={() => void window.api.reader.forget().then(refresh)}
          >
            <Unlink size={13} />
          </button>
        </div>
      </div>

      {resume && <ResumeBanner series={resume} now={now} onRead={read} />}

      {shelf.series.length === 0 ? (
        <p className="py-16 text-center text-sm text-faint">
          Aucun tome trouvé. Un sous-dossier par série, avec des CBZ, des ZIP ou des dossiers d’images.
        </p>
      ) : (
        <div className="card-grid">
          {shelf.series.map((series, i) => {
            const { read: done, total } = seriesProgress(series)
            return (
              <motion.button
                key={series.id}
                className="text-left"
                data-shot-series={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.25) }}
                whileHover={{ y: -4 }}
                onClick={() => setOpen(series)}
              >
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[14px] bg-black/30">
                  {series.cover && <img src={series.cover} alt="" className="h-full w-full object-cover" />}
                  <span
                    className="absolute inset-x-0 bottom-0 h-1"
                    style={{ background: 'color-mix(in oklab, var(--color-ink) 18%, transparent)' }}
                  >
                    <span
                      className="block h-full"
                      style={{ width: `${(done / total) * 100}%`, background: 'var(--accent)' }}
                    />
                  </span>
                </div>
                <p className="clamp-2 mt-2 text-[0.815rem] font-semibold leading-snug">{series.title}</p>
                <p className="mt-0.5 text-[0.7rem] text-faint">
                  {done}/{total} {series.volumes.every((v) => v.chapter) ? 'chapitres' : 'tomes'} lus
                  {series.readAt ? ` · ${ageLabel(series.readAt, now)}` : ''}
                </p>
              </motion.button>
            )
          })}
        </div>
      )}

      <Modal open={open !== null} onClose={() => setOpen(null)} width={640}>
        {open && <SeriesSheet series={open} onRead={read} onClose={() => setOpen(null)} />}
      </Modal>

      {reading && (
        <Reader
          series={reading.series}
          volume={reading.volume}
          onClose={() => {
            setReading(null)
            // Les marque-pages ont bougé : l'étagère les relit.
            void refresh()
          }}
        />
      )}
    </>
  )
}

function ResumeBanner({
  series,
  now,
  onRead
}: {
  series: LocalSeries
  now: number
  onRead: (series: LocalSeries, volume: LocalVolume) => void
}): React.JSX.Element {
  const volume = resumeOf(series)
  const started = volume.page > 0 && !isFinished(volume.page, volume.pages)
  const ratio = started ? (volume.page + 1) / volume.pages : 0
  return (
    <div className="glass relative mb-7 flex items-center gap-5 overflow-hidden rounded-[22px] p-4">
      {volume.cover && (
        <>
          <img
            src={volume.cover}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl"
          />
          <img
            src={volume.cover}
            alt=""
            className="relative h-[128px] w-[88px] rounded-[10px] object-cover shadow-xl"
          />
        </>
      )}
      <div className="relative min-w-0 flex-1">
        <p className="label">Reprendre · {ageLabel(series.readAt ?? now, now)}</p>
        <h2 className="title-xl mt-1 truncate text-[1.35rem]">{series.title}</h2>
        <p className="mt-0.5 text-[0.8rem] text-muted">
          {volumeLabel(volume)}
          {started ? ` · page ${volume.page + 1} sur ${volume.pages}` : ` · ${volume.pages} pages`}
        </p>
        <div className="mt-3 h-1.5 max-w-[360px] overflow-hidden rounded-full" style={{ background: 'var(--line-2)' }}>
          <div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, background: 'var(--accent)' }} />
        </div>
      </div>
      <button className="btn btn-primary relative" data-shot="resume" onClick={() => onRead(series, volume)}>
        <Play size={14} />
        {started ? 'Continuer' : 'Commencer'}
      </button>
    </div>
  )
}

function SeriesSheet({
  series,
  onRead,
  onClose
}: {
  series: LocalSeries
  onRead: (series: LocalSeries, volume: LocalVolume) => void
  onClose: () => void
}): React.JSX.Element {
  const resume = resumeOf(series)
  return (
    <>
      <div className="flex gap-4 border-b p-5" style={{ borderColor: 'var(--line)' }}>
        {series.cover && (
          <img src={series.cover} alt="" className="h-[150px] w-[104px] shrink-0 rounded-[12px] object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <p className="label">Sur ton disque</p>
          <h2 className="title-xl mt-1 text-[1.3rem] leading-tight">{series.title}</h2>
          <p className="mt-1 text-[0.78rem] text-muted">
            {series.volumes.length} {series.volumes.every((v) => v.chapter) ? 'chapitres' : 'tomes'} ·{' '}
            {series.volumes.reduce((n, v) => n + v.pages, 0)} pages
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => onRead(series, resume)}>
              <Play size={14} />
              {resume.page > 0 ? `Reprendre ${volumeLabel(resume)}` : `Lire ${volumeLabel(resume)}`}
            </button>
            <button className="btn" onClick={() => void window.api.app.openExternal(izneoSearch(series.title))}>
              Suite sur izneo
              <ExternalLink size={13} />
            </button>
          </div>
        </div>
      </div>
      <div className="max-h-[40vh] overflow-y-auto p-3">
        {series.volumes.map((v) => {
          const done = isFinished(v.page, v.pages)
          const ratio = done ? 1 : v.page > 0 ? (v.page + 1) / v.pages : 0
          return (
            <button
              key={v.id}
              className="flex w-full items-center gap-3 rounded-[12px] p-2 text-left transition-colors hover:bg-[var(--panel-2)]"
              onClick={() => onRead(series, v)}
            >
              {v.cover && <img src={v.cover} alt="" loading="lazy" className="h-14 w-10 rounded-md object-cover" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.85rem] font-semibold">{volumeLabel(v)}</p>
                <p className="text-[0.72rem] text-faint">
                  {done ? 'Lu' : v.page > 0 ? `Page ${v.page + 1} sur ${v.pages}` : `${v.pages} pages`}
                </p>
              </div>
              <div className="h-1 w-24 overflow-hidden rounded-full" style={{ background: 'var(--line-2)' }}>
                <div className="h-full" style={{ width: `${ratio * 100}%`, background: 'var(--accent)' }} />
              </div>
            </button>
          )
        })}
      </div>
      <div className="flex justify-end border-t px-5 py-3" style={{ borderColor: 'var(--line)' }}>
        <button className="btn" onClick={onClose}>
          Fermer
        </button>
      </div>
    </>
  )
}
