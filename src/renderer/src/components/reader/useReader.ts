/**
 * Le cœur du lecteur, commun aux trois habillages.
 *
 * Les habillages ne décident que de ce qui entoure les pages ; l'ordre de
 * lecture, le sens, les doubles pages, le préchargement et le marque-page sont
 * ici, une seule fois. Comparer trois interfaces n'a de sens que si elles
 * tournent les pages exactement de la même façon.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LocalSeries, LocalVolume, ReaderDir, ReaderMode, ReaderSkin } from '@shared/types'
import { spreads } from '@shared/manga-files'
import { useApp } from '@/store/app'

export interface ReaderControl {
  series: LocalSeries
  volume: LocalVolume
  volumeIndex: number
  pages: string[]
  loading: boolean
  /** Première page affichée : c'est elle qui sert de marque-page. */
  page: number
  /** Les pages visibles à l'écran : une, ou deux en double page. */
  shown: number[]
  /** Rang de l'écran courant parmi `units`, et leur nombre. */
  unit: number
  units: number[][]
  mode: ReaderMode
  dir: ReaderDir
  skin: ReaderSkin
  setMode: (mode: ReaderMode) => void
  setDir: (dir: ReaderDir) => void
  setSkin: (skin: ReaderSkin) => void
  next: () => void
  prev: () => void
  /** Aller à une page précise (et non à un écran). */
  goPage: (page: number) => void
  openVolume: (index: number) => void
  hasNextVolume: boolean
  hasPrevVolume: boolean
  /** Signale une page plus large que haute : elle restera seule. */
  markWide: (page: number) => void
  /** En défilement, la page qui passe au milieu de l'écran. */
  reportScrolled: (page: number) => void
  close: () => void
}

export function useReader(series: LocalSeries, startVolume: string, onClose: () => void): ReaderControl {
  const prefs = useApp((s) => s.prefs)
  const setPrefs = useApp((s) => s.setPrefs)
  const { readerMode: mode, readerDir: dir, readerSkin: skin } = prefs

  const [volumeIndex, setVolumeIndex] = useState(() =>
    Math.max(
      0,
      series.volumes.findIndex((v) => v.id === startVolume)
    )
  )
  const volume = series.volumes[volumeIndex]

  const [held, setHeld] = useState<{ id: string; pages: string[] }>({ id: '', pages: [] })
  const [page, setPage] = useState(() => {
    const v = series.volumes.find((x) => x.id === startVolume)
    // Un tome fini se rouvre au début, pas sur sa dernière page.
    return v && v.page < v.pages - 1 ? v.page : 0
  })
  const [wide, setWide] = useState<Set<number>>(new Set())

  useEffect(() => {
    let alive = true
    void window.api.reader.pages(volume.id).then((pages) => {
      if (alive) setHeld({ id: volume.id, pages })
    })
    return () => {
      alive = false
    }
  }, [volume.id])

  const loading = held.id !== volume.id
  const pages = useMemo(() => (loading ? [] : held.pages), [loading, held.pages])

  const units = useMemo<number[][]>(() => {
    if (mode === 'double') return spreads(pages.length, wide)
    return pages.map((_, i) => [i])
  }, [mode, pages, wide])

  const unit = Math.max(
    0,
    units.findIndex((u) => u.includes(page))
  )
  const shown = units[unit] ?? []

  // Le marque-page, écrit un instant après la dernière page tournée : feuilleter
  // vite ne doit pas écrire vingt fois le fichier.
  useEffect(() => {
    if (loading || !pages.length) return
    const timer = setTimeout(() => void window.api.reader.remember(volume.id, page, pages.length), 450)
    return () => clearTimeout(timer)
  }, [loading, page, pages.length, volume.id])

  // Les trois pages suivantes, pour que tourner soit instantané.
  useEffect(() => {
    for (let i = page + 1; i <= page + 3 && i < pages.length; i += 1) {
      const img = new Image()
      img.src = pages[i]
    }
  }, [page, pages])

  const openVolume = useCallback(
    (index: number) => {
      const target = series.volumes[index]
      if (!target) return
      setVolumeIndex(index)
      setWide(new Set())
      setPage(target.page < target.pages - 1 ? target.page : 0)
    },
    [series.volumes]
  )

  const next = useCallback(() => {
    if (unit < units.length - 1) setPage(units[unit + 1][0])
    else if (volumeIndex < series.volumes.length - 1) {
      // Au bout du tome, le suivant s'ouvre à sa première page.
      setVolumeIndex(volumeIndex + 1)
      setWide(new Set())
      setPage(0)
    }
  }, [unit, units, volumeIndex, series.volumes.length])

  const prev = useCallback(() => {
    if (unit > 0) setPage(units[unit - 1][0])
    else if (volumeIndex > 0) {
      const before = series.volumes[volumeIndex - 1]
      setVolumeIndex(volumeIndex - 1)
      setWide(new Set())
      setPage(Math.max(0, before.pages - 1))
    }
  }, [unit, units, volumeIndex, series.volumes])

  const goPage = useCallback(
    (target: number) => setPage(Math.max(0, Math.min(target, pages.length - 1))),
    [pages.length]
  )

  const markWide = useCallback((index: number) => {
    setWide((prev) => (prev.has(index) ? prev : new Set(prev).add(index)))
  }, [])

  // Le défilement dit lui-même où il en est : le suivre, sans y renvoyer.
  const reportScrolled = useCallback((index: number) => setPage(index), [])

  // Le clavier suit le sens de lecture : en manga, la flèche gauche avance.
  const keys = useRef({ next, prev, onClose, dir, mode, goPage, count: pages.length })
  useEffect(() => {
    keys.current = { next, prev, onClose, dir, mode, goPage, count: pages.length }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const k = keys.current
      if (e.key === 'Escape') k.onClose()
      else if (k.mode === 'scroll') return
      else if (e.key === 'ArrowLeft') (k.dir === 'rtl' ? k.next : k.prev)()
      else if (e.key === 'ArrowRight') (k.dir === 'rtl' ? k.prev : k.next)()
      else if (e.key === ' ' || e.key === 'PageDown' || e.key === 'ArrowDown') k.next()
      else if (e.key === 'PageUp' || e.key === 'ArrowUp') k.prev()
      else if (e.key === 'Home') k.goPage(0)
      else if (e.key === 'End') k.goPage(k.count - 1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return {
    series,
    volume,
    volumeIndex,
    pages,
    loading,
    page,
    shown,
    unit,
    units,
    mode,
    dir,
    skin,
    setMode: (readerMode) => void setPrefs({ readerMode }),
    setDir: (readerDir) => void setPrefs({ readerDir }),
    setSkin: (readerSkin) => void setPrefs({ readerSkin }),
    next,
    prev,
    goPage,
    openVolume,
    hasNextVolume: volumeIndex < series.volumes.length - 1,
    hasPrevVolume: volumeIndex > 0,
    markWide,
    reportScrolled,
    close: onClose
  }
}

/** « Tome 3 », « Chapitre 12 », ou le nom tel qu'il est écrit. */
export function volumeLabel(volume: LocalVolume): string {
  if (volume.number === null) return volume.name
  return `${volume.chapter ? 'Chapitre' : 'Tome'} ${String(volume.number).replace('.', ',')}`
}
