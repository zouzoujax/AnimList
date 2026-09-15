import { ArrowLeft } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { STATUS_LABELS, type BrowseKind, type LibraryStatus, type Manga, type MangaKind } from '@shared/types'
import { MangaSheet } from '@/components/MangaSheet'
import { Modal } from '@/components/ui'
import { countdown, formatLabel, formatTime, titleOf } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import { useApp } from '@/store/app'
import { useCatalogue, useForYou, useMangaList, useWeek } from './pages-data'
import type { DetailHeroProps } from '.'

/*
 * COCKPIT — les autres postes du vaisseau : un scanner de catalogue, une carte
 * des orbites de la semaine, les archives manga en registre, et la fiche d'un
 * anime ouverte comme un dossier de cible.
 */

function Box({
  code,
  title,
  className = '',
  children
}: {
  code: string
  title: string
  className?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <section className={`xh-panel relative p-4 ${className}`}>
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="xh-title">{title}</h2>
        <span className="xh-code">{code}</span>
      </header>
      {children}
    </section>
  )
}

const MODES: { kind: BrowseKind; label: string }[] = [
  { kind: 'trending', label: 'TENDANCES' },
  { kind: 'season', label: 'SAISON' },
  { kind: 'popular', label: 'POPULAIRES' },
  { kind: 'top', label: 'TOP' },
  { kind: 'upcoming', label: 'À VENIR' }
]

export function HudDiscover({ initialSearch }: { initialSearch?: string }): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const [mode, setMode] = useState<BrowseKind>('trending')
  const [search, setSearch] = useState(initialSearch ?? '')
  const { items, loading, hasMore, loadMore, searching, error } = useCatalogue(mode, search)
  const rec = useForYou()

  return (
    <div className="xh-screen grid grid-cols-12 gap-3 p-5">
      <Box code="S-00" title="Scanner du catalogue" className="col-span-12">
        <label className="xh-prompt">
          <span className="xh-hot">SCAN &gt;</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="saisir un titre…" autoFocus />
          <span className="xh-cursor" aria-hidden />
        </label>
        {!searching && (
          <div className="mt-3 flex flex-wrap gap-2">
            {MODES.map((m) => (
              <button key={m.kind} className="xh-cmd" data-on={mode === m.kind} onClick={() => setMode(m.kind)}>
                [{m.label}]
              </button>
            ))}
          </div>
        )}
      </Box>

      <Box code="S-01" title={`Signaux détectés · ${items.length}`} className="col-span-8">
        <div className="grid grid-cols-2 gap-2">
          {items.map((media, i) => (
            <motion.button
              key={media.id}
              className="xh-row flex gap-3 text-left"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.4) }}
              onClick={() => navigate({ name: 'anime', id: media.id })}
            >
              <img src={media.cover.large} alt="" className="xh-frame h-[72px] w-[50px] shrink-0 object-cover" />
              <span className="min-w-0 flex-1">
                <span className="xh-code block">
                  {String(media.id).padStart(6, '0')} · {formatLabel(media.format).toUpperCase()} ·{' '}
                  {media.seasonYear ?? '—'}
                </span>
                <span className="block truncate text-[0.85rem] font-semibold">{titleOf(media, lang)}</span>
                <span className="xh-meter mt-1.5 !w-full">
                  <span style={{ width: `${media.averageScore ?? 0}%` }} />
                </span>
                <span className="xh-code">SIGNAL {media.averageScore ?? '—'}%</span>
              </span>
            </motion.button>
          ))}
        </div>
        {loading && items.length === 0 && <p className="xh-code mt-2">BALAYAGE EN COURS…</p>}
        {error && <p className="xh-code mt-2">{error}</p>}
        {hasMore && !loading && (
          <button className="xh-cmd mt-4" onClick={loadMore}>
            ▼ ÉTENDRE LE BALAYAGE
          </button>
        )}
      </Box>

      <Box code="S-02" title="Cibles recommandées" className="col-span-4">
        <ul className="flex flex-col gap-3">
          {(rec?.picks ?? []).slice(0, 8).map((pick, i) => (
            <li key={pick.media.id}>
              <button className="text-left" onClick={() => navigate({ name: 'anime', id: pick.media.id })}>
                <span className="xh-code mr-2">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-[0.82rem] font-semibold">{titleOf(pick.media, lang)}</span>
                {pick.reasons[0] && <span className="xh-code block">› {pick.reasons[0]}</span>}
              </button>
            </li>
          ))}
          {!rec && <li className="xh-code">CALCUL DU PROFIL…</li>}
        </ul>
      </Box>
    </div>
  )
}

const DAY_CODES = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM']

export function HudCalendar(): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const [scope, setScope] = useState<'library' | 'all'>('library')
  const [offset, setOffset] = useState(0)
  const week = useWeek(scope, offset)
  // L'horloge partagée de l'app plutôt que Date.now() : un rendu doit rester pur.
  const now = useNow()
  const upcoming = week.days
    .flatMap((d) => d.items)
    .filter((s) => s.airingAt * 1000 > now)
    .slice(0, 8)

  return (
    <div className="xh-screen grid grid-cols-12 gap-3 p-5">
      <Box code="O-00" title="Carte des orbites" className="col-span-12">
        <div className="mb-4 flex flex-wrap gap-2">
          <button className="xh-cmd" data-on={scope === 'library'} onClick={() => setScope('library')}>
            [SUIVIS]
          </button>
          <button className="xh-cmd" data-on={scope === 'all'} onClick={() => setScope('all')}>
            [TOUS]
          </button>
          <span className="ml-auto flex gap-2">
            <button className="xh-cmd" onClick={() => setOffset((o) => o - 1)}>
              ◀ S-1
            </button>
            <button className="xh-cmd" data-on={offset === 0} onClick={() => setOffset(0)}>
              S-0
            </button>
            <button className="xh-cmd" onClick={() => setOffset((o) => o + 1)}>
              S+1 ▶
            </button>
          </span>
        </div>
        <div className="xh-orbits">
          <div className="xh-orbit-axis">
            {[0, 6, 12, 18, 24].map((h) => (
              <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
                {String(h).padStart(2, '0')}H
              </span>
            ))}
          </div>
          {week.days.map((day, i) => (
            <div key={day.date} className="xh-orbit">
              <span className="xh-code w-12 shrink-0">{DAY_CODES[i]}</span>
              <div className="xh-orbit-line relative flex-1">
                {day.items.map((slot) => {
                  const d = new Date(slot.airingAt * 1000)
                  const pos = ((d.getHours() + d.getMinutes() / 60) / 24) * 100
                  return (
                    <motion.button
                      key={`${slot.mediaId}-${slot.episode}`}
                      className="xh-blip"
                      style={{ left: `${pos}%` }}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      title={`${formatTime(slot.airingAt * 1000)} · ${titleOf(slot.media, lang)} · ép. ${slot.episode}`}
                      onClick={() => navigate({ name: 'anime', id: slot.media.id })}
                    />
                  )
                })}
              </div>
              <span className="xh-code w-10 text-right">{day.items.length}</span>
            </div>
          ))}
        </div>
        {week.loading && <p className="xh-code mt-2">TRIANGULATION…</p>}
        {week.error && <p className="xh-code mt-2">{week.error}</p>}
      </Box>

      <Box code="O-01" title="Prochains contacts" className="col-span-12">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
          {upcoming.map((slot) => (
            <button
              key={`${slot.mediaId}-${slot.episode}`}
              className="xh-row flex items-center justify-between gap-3 text-left"
              onClick={() => navigate({ name: 'anime', id: slot.media.id })}
            >
              <span className="truncate text-[0.82rem]">
                {titleOf(slot.media, lang)} <span className="xh-code">ÉP.{slot.episode}</span>
              </span>
              <span className="xh-hot shrink-0 text-[0.8rem]">T-{countdown(slot.airingAt)}</span>
            </button>
          ))}
          {upcoming.length === 0 && <p className="xh-code">AUCUN CONTACT IMMINENT.</p>}
        </div>
      </Box>
    </div>
  )
}

const MANGA_MODES: { kind: MangaKind; label: string }[] = [
  { kind: 'trending', label: 'TENDANCES' },
  { kind: 'popular', label: 'POPULAIRES' },
  { kind: 'top', label: 'TOP' }
]

export function HudManga(): React.JSX.Element {
  const [mode, setMode] = useState<MangaKind>('trending')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<Manga | null>(null)
  const { items, loading, error } = useMangaList(mode, search)

  return (
    <div className="xh-screen p-5">
      <Box code="A-00" title={`Archives manga · ${items.length}`}>
        <label className="xh-prompt mb-3">
          <span className="xh-hot">ARCH &gt;</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="titre…" />
        </label>
        <div className="mb-3 flex gap-2">
          {MANGA_MODES.map((m) => (
            <button key={m.kind} className="xh-cmd" data-on={mode === m.kind} onClick={() => setMode(m.kind)}>
              [{m.label}]
            </button>
          ))}
        </div>
        <table className="xh-table w-full">
          <thead>
            <tr>
              <th>ID</th>
              <th>Titre</th>
              <th>Origine</th>
              <th>Chap.</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {items.map((manga) => (
              <tr key={manga.id} onClick={() => setOpen(manga)}>
                <td className="xh-code">{String(manga.id).padStart(6, '0')}</td>
                <td className="font-semibold">{manga.title.english ?? manga.title.romaji}</td>
                <td>{manga.origin.toUpperCase()}</td>
                <td className="tabular-nums">{manga.chapters ?? '—'}</td>
                <td>
                  <span className="xh-meter">
                    <span style={{ width: `${manga.averageScore ?? 0}%` }} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <p className="xh-code mt-2">LECTURE DES ARCHIVES…</p>}
        {error && <p className="xh-code mt-2">{error}</p>}
      </Box>
      <Modal open={open !== null} onClose={() => setOpen(null)} width={640}>
        {open && <MangaSheet manga={open} onClose={() => setOpen(null)} />}
      </Modal>
    </div>
  )
}

const STATUSES: LibraryStatus[] = ['watching', 'planned', 'completed', 'paused', 'dropped']

function Ring({ value, label }: { value: number; label: string }): React.JSX.Element {
  const c = 2 * Math.PI * 34
  return (
    <div className="relative grid h-[92px] w-[92px] place-items-center">
      <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90">
        <circle cx="40" cy="40" r="34" className="xh-gauge-track" />
        <motion.circle
          cx="40"
          cy="40"
          r="34"
          className="xh-gauge-fill"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value) }}
          transition={{ duration: 1 }}
        />
      </svg>
      <span className="text-center">
        <span className="xh-value block !text-[1rem]">{Math.round(value * 100)}%</span>
        <span className="xh-code">{label}</span>
      </span>
    </div>
  )
}

export function HudDetailHero(props: DetailHeroProps): React.JSX.Element {
  const { media, entry, next, seen, total } = props
  const lang = useApp((s) => s.prefs.titleLang)

  return (
    <div className="xh-screen grid grid-cols-12 gap-3 p-5">
      <Box code={`D-${String(media.id).padStart(6, '0')}`} title="Dossier cible" className="col-span-12">
        <button className="xh-cmd mb-4" onClick={props.onBack}>
          <ArrowLeft size={13} /> RETOUR
        </button>
        <div className="flex gap-6">
          <img src={media.cover.xl} alt="" className="xh-frame h-[270px] w-[184px] shrink-0 object-cover" />
          <div className="min-w-0 flex-1">
            <p className="xh-code">
              {formatLabel(media.format).toUpperCase()} · {media.seasonYear ?? '—'} ·{' '}
              {media.studios[0] ?? 'STUDIO INCONNU'}
            </p>
            <h1 className="title-xl clamp-2 mt-1 text-[2.4rem] leading-tight">{titleOf(media, lang)}</h1>
            {props.alsoKnownAs[0] && <p className="xh-code mt-1">ALIAS › {props.alsoKnownAs[0]}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              {next !== null && (
                <button className="xh-cmd xh-cmd-hot" onClick={props.onMark}>
                  ▶ ENGAGER ÉP. {next}
                </button>
              )}
              {!entry && (
                <button className="xh-cmd xh-cmd-hot" onClick={props.onAdd}>
                  + VERROUILLER LA CIBLE
                </button>
              )}
              <button className="xh-cmd" data-on={!!entry?.favorite} onClick={props.onFavorite}>
                {entry?.favorite ? '♥ PRIORITAIRE' : '♡ PRIORITÉ'}
              </button>
              {entry && (
                <button className="xh-cmd" data-on={props.inLists > 0} onClick={props.onLists}>
                  ≡ LISTES{props.inLists > 0 ? ` (${props.inLists})` : ''}
                </button>
              )}
            </div>
            {entry && (
              <div className="mt-3 flex flex-wrap gap-1">
                {STATUSES.map((status) => (
                  <button
                    key={status}
                    className="xh-cmd !h-8"
                    data-on={entry.status === status}
                    onClick={() => props.onStatus(status)}
                  >
                    {STATUS_LABELS[status].toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-3">
            <Ring value={total ? Math.min(1, seen / total) : 0} label="PROGRES" />
            <Ring value={(media.averageScore ?? 0) / 100} label="SIGNAL" />
          </div>
        </div>
      </Box>
    </div>
  )
}
