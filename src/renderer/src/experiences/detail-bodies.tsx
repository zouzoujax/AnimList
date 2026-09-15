import { motion } from 'motion/react'
import { useState } from 'react'
import type { Media } from '@shared/types'
import type { DetailPartKey, DetailParts } from '.'

/*
 * Le corps de la fiche, disposé par chaque expérience.
 *
 * Les blocs (épisodes, casting, liens…) restent ceux de la fiche classique —
 * ils portent toute la logique de visionnage et ne doivent exister qu'une
 * fois. Ce qui change, c'est leur agencement et leur habillage : onglets pour
 * Streaming, menu latéral pour Console, article avec encadré pour Magazine,
 * grille de panneaux pour Cockpit, pages de carnet pour Carnet.
 */

type Props = { media: Media; parts: DetailParts }

const TITLES: Record<DetailPartKey, string> = {
  synopsis: 'Synopsis',
  trailer: 'Bande-annonce',
  language: 'Langue',
  franchise: 'Franchise',
  episodes: 'Épisodes',
  files: 'Fichiers',
  cast: 'Personnages',
  relations: 'Même série',
  manga: 'Manga',
  films: 'Films',
  recommendations: 'Recommandations',
  progress: 'Progression',
  rating: 'Ta note',
  info: 'Informations',
  watch: 'Regarder',
  error: 'Erreur'
}

/** Les blocs demandés qui ont quelque chose à montrer, dans l'ordre donné. */
function present(parts: DetailParts, keys: DetailPartKey[]): DetailPartKey[] {
  return keys.filter((k) => parts[k] !== null && parts[k] !== undefined && parts[k] !== false)
}

function Stack({
  parts,
  keys,
  className = ''
}: {
  parts: DetailParts
  keys: DetailPartKey[]
  className?: string
}): React.JSX.Element {
  return (
    <div className={className}>
      {present(parts, keys).map((k) => (
        <div key={k} data-part={k}>
          {parts[k]}
        </div>
      ))}
    </div>
  )
}

/* ─────────────────────────────── STREAMING : onglets sous la bannière */
const STREAM_TABS: { id: string; label: string; main: DetailPartKey[]; side: DetailPartKey[] }[] = [
  { id: 'episodes', label: 'Épisodes', main: ['language', 'episodes', 'files'], side: ['watch', 'progress'] },
  { id: 'infos', label: 'Plus d’infos', main: ['synopsis', 'trailer'], side: ['info', 'rating', 'error'] },
  { id: 'cast', label: 'Distribution', main: ['cast'], side: [] },
  { id: 'more', label: 'Similaires', main: ['recommendations', 'relations', 'films', 'manga', 'franchise'], side: [] }
]

export function StreamingDetailBody({ parts }: Props): React.JSX.Element {
  const [tab, setTab] = useState(STREAM_TABS[0].id)
  const current = STREAM_TABS.find((t) => t.id === tab) ?? STREAM_TABS[0]
  return (
    <div className="xs-detail px-10 pb-16">
      <div className="xs-detail-tabs" role="tablist">
        {STREAM_TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <motion.div
        key={tab}
        className={current.side.length ? 'grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]' : ''}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <Stack parts={parts} keys={current.main} className="flex flex-col gap-6" />
        {current.side.length > 0 && <Stack parts={parts} keys={current.side} className="flex flex-col gap-4" />}
      </motion.div>
    </div>
  )
}

/* ─────────────────────────────── CONSOLE : menu latéral de hub de jeu */
const CONSOLE_MENU: { id: string; label: string; keys: DetailPartKey[] }[] = [
  { id: 'overview', label: 'Vue d’ensemble', keys: ['synopsis', 'progress', 'rating', 'trailer'] },
  { id: 'episodes', label: 'Épisodes', keys: ['language', 'episodes', 'files'] },
  { id: 'play', label: 'Où jouer', keys: ['watch', 'info', 'error'] },
  { id: 'cast', label: 'Personnages', keys: ['cast'] },
  { id: 'universe', label: 'Univers', keys: ['relations', 'films', 'manga', 'recommendations', 'franchise'] }
]

export function ConsoleDetailBody({ parts }: Props): React.JSX.Element {
  const [section, setSection] = useState(CONSOLE_MENU[0].id)
  const current = CONSOLE_MENU.find((m) => m.id === section) ?? CONSOLE_MENU[0]
  return (
    <div className="xc-detail grid gap-8 px-12 pb-16 pt-4 lg:grid-cols-[230px_minmax(0,1fr)]">
      {/* Collé en haut : le menu doit rester sous la main pendant qu'on fait défiler une section. */}
      <nav className="flex flex-col gap-1.5 self-start lg:sticky lg:top-24" aria-label="Sections de la fiche">
        {CONSOLE_MENU.map((m) => (
          <button key={m.id} className="xc-detail-item" data-on={section === m.id} onClick={() => setSection(m.id)}>
            {m.label}
          </button>
        ))}
      </nav>
      <motion.div
        key={section}
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <Stack parts={parts} keys={current.keys} className="flex flex-col gap-5" />
      </motion.div>
    </div>
  )
}

/* ─────────────────────────────── MAGAZINE : article avec encadré */
export function MagazineDetailBody({ parts }: Props): React.JSX.Element {
  return (
    <div className="xm-detail xm-rule-double mx-12 mt-8 grid gap-10 pb-16 pt-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="xm-detail-box flex flex-col gap-6 self-start">
        <p className="xm-kicker">L’encadré</p>
        <Stack parts={parts} keys={['progress', 'rating', 'info', 'watch', 'error']} className="flex flex-col gap-6" />
      </aside>
      <article>
        <Stack parts={parts} keys={['synopsis']} className="xm-detail-lead" />
        <Stack
          parts={parts}
          keys={[
            'trailer',
            'language',
            'episodes',
            'files',
            'cast',
            'relations',
            'manga',
            'films',
            'recommendations',
            'franchise'
          ]}
          className="flex flex-col gap-8"
        />
      </article>
    </div>
  )
}

/* ─────────────────────────────── COCKPIT : grille de panneaux */
const HUD_LAYOUT: { key: DetailPartKey; span: string }[] = [
  { key: 'episodes', span: 'col-span-12 xl:col-span-8' },
  { key: 'watch', span: 'col-span-12 xl:col-span-4' },
  { key: 'synopsis', span: 'col-span-12 lg:col-span-5' },
  { key: 'trailer', span: 'col-span-12 lg:col-span-7' },
  { key: 'progress', span: 'col-span-12 md:col-span-4' },
  { key: 'rating', span: 'col-span-12 md:col-span-4' },
  { key: 'info', span: 'col-span-12 md:col-span-4' },
  { key: 'language', span: 'col-span-12' },
  { key: 'files', span: 'col-span-12' },
  { key: 'cast', span: 'col-span-12' },
  { key: 'relations', span: 'col-span-12' },
  { key: 'films', span: 'col-span-12' },
  { key: 'manga', span: 'col-span-12' },
  { key: 'recommendations', span: 'col-span-12' },
  { key: 'franchise', span: 'col-span-12' },
  { key: 'error', span: 'col-span-12' }
]

export function HudDetailBody({ parts }: Props): React.JSX.Element {
  const shown = HUD_LAYOUT.filter((cell) => present(parts, [cell.key]).length > 0)
  return (
    <div className="xh-detail grid grid-cols-12 gap-3 px-5 pb-10">
      {shown.map((cell, i) => (
        <motion.section
          key={cell.key}
          className={`xh-panel relative p-4 ${cell.span}`}
          initial={{ opacity: 0, clipPath: 'inset(0 0 100% 0)' }}
          animate={{ opacity: 1, clipPath: 'inset(0 0 0% 0)' }}
          transition={{ delay: Math.min(i * 0.05, 0.5), duration: 0.4 }}
        >
          <header className="mb-3 flex items-baseline justify-between">
            <h2 className="xh-title">{TITLES[cell.key]}</h2>
            <span className="xh-code">P-{String(i + 1).padStart(2, '0')}</span>
          </header>
          {parts[cell.key]}
        </motion.section>
      ))}
    </div>
  )
}

/* ─────────────────────────────── CARNET : pages du carnet */
const CARNET_PAGES: { title: string; left: DetailPartKey[]; right: DetailPartKey[] }[] = [
  {
    title: 'Ma fiche',
    left: ['synopsis', 'info', 'progress', 'rating'],
    right: ['watch', 'language', 'episodes', 'files']
  },
  { title: 'Souvenirs', left: ['trailer'], right: ['cast'] },
  {
    title: 'À explorer ensuite',
    left: ['relations', 'films', 'franchise'],
    right: ['manga', 'recommendations', 'error']
  }
]

export function CarnetDetailBody({ parts }: Props): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8 px-8 pb-16 pt-8">
      {CARNET_PAGES.map((page, i) => {
        const left = present(parts, page.left)
        const right = present(parts, page.right)
        if (!left.length && !right.length) return null
        return (
          <motion.section
            key={page.title}
            className="xk-page xk-detail relative mx-auto w-full max-w-[1240px] px-16 py-10"
            initial={{ opacity: 0, y: 30, rotate: -0.6 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ delay: i * 0.08, type: 'spring', stiffness: 160, damping: 22 }}
          >
            <span className="xk-rings" aria-hidden />
            <h2 className="xk-heading">{page.title}</h2>
            <div className="mt-6 grid gap-10 lg:grid-cols-2">
              <Stack parts={parts} keys={left} className="flex min-w-0 flex-col gap-6" />
              <Stack parts={parts} keys={right} className="flex min-w-0 flex-col gap-6" />
            </div>
          </motion.section>
        )
      })}
    </div>
  )
}
