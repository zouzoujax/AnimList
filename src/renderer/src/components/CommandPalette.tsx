import {
  CalendarDays,
  ChartColumn,
  Compass,
  CornerDownLeft,
  House,
  LibraryBig,
  LoaderCircle,
  Search,
  Settings
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Media } from '@shared/types'
import { titleMatches } from '@shared/titles'
import { useBrowse, useDebounced } from '@/lib/hooks'
import { formatLabel, titleOf } from '@/lib/format'
import { useApp, type Route } from '@/store/app'
import { Modal } from './ui'

interface Item {
  key: string
  label: string
  sub: string
  cover?: string
  run: () => void
}

const NAV_COMMANDS: { label: string; icon: typeof House; route: Route }[] = [
  { label: 'Accueil', icon: House, route: { name: 'home' } },
  { label: 'Découvrir', icon: Compass, route: { name: 'discover' } },
  { label: 'Bibliothèque', icon: LibraryBig, route: { name: 'library' } },
  { label: 'Calendrier', icon: CalendarDays, route: { name: 'calendar' } },
  { label: 'Statistiques', icon: ChartColumn, route: { name: 'stats' } },
  { label: 'Réglages', icon: Settings, route: { name: 'settings' } }
]

/**
 * L'enveloppe ne porte aucun état.
 *
 * `Modal` démonte ses enfants à la fermeture : en logeant la saisie et le
 * curseur dans le corps plutôt qu'ici, la palette repart vide à chaque
 * ouverture sans que personne ait eu à la vider. Elle ne lance pas non plus de
 * recherche tant qu'elle est fermée.
 */
export function CommandPalette(): React.JSX.Element {
  const open = useApp((s) => s.paletteOpen)
  const setPalette = useApp((s) => s.setPalette)

  return (
    <Modal open={open} onClose={() => setPalette(false)} width={640}>
      <Palette />
    </Modal>
  )
}

function Palette(): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const mediaMap = useApp((s) => s.media)
  const entries = useApp((s) => s.entries)

  const [query, setQuery] = useState('')
  // Le curseur appartient à une longueur de liste : dès qu'elle change, il
  // repart de zéro de lui-même, sans effet de remise à zéro.
  const [held, setHeld] = useState({ len: 0, index: 0 })
  const debounced = useDebounced(query.trim(), 350)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const remote = useBrowse(debounced.length >= 2 ? { kind: 'search', search: debounced, perPage: 12 } : null)

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 40)
    return () => clearTimeout(t)
  }, [])

  const local = useMemo(() => {
    const needle = query.trim()
    if (!needle) return []
    const out: Media[] = []
    for (const id of entries.keys()) {
      const media = mediaMap.get(id)
      if (!media) continue
      if (titleMatches(needle, [media.title.romaji, media.title.english, media.title.native])) out.push(media)
      if (out.length >= 6) break
    }
    return out
  }, [query, entries, mediaMap])

  const items = useMemo<Item[]>(() => {
    const needle = query.trim().toLowerCase()
    const nav = NAV_COMMANDS.filter((c) => !needle || c.label.toLowerCase().includes(needle)).map((c) => ({
      key: `nav-${c.label}`,
      label: c.label,
      sub: 'Navigation',
      run: () => navigate(c.route)
    }))

    const localIds = new Set(local.map((m) => m.id))
    const toItem = (media: Media, sub: string): Item => ({
      key: `a-${media.id}`,
      label: titleOf(media, lang),
      sub,
      cover: media.cover.large,
      run: () => navigate({ name: 'anime', id: media.id })
    })

    return [
      ...local.map((m) => toItem(m, 'Ma bibliothèque')),
      ...nav,
      ...remote.items.filter((m) => !localIds.has(m.id)).map((m) => toItem(m, formatLabel(m.format)))
    ]
  }, [local, remote.items, query, lang, navigate])

  const cursor = held.len === items.length ? held.index : 0
  const move = (index: number): void => setHeld({ len: items.length, index })

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      move((cursor + 1) % Math.max(items.length, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      move((cursor - 1 + items.length) % Math.max(items.length, 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      items[cursor]?.run()
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b px-4" style={{ borderColor: 'var(--line)' }}>
        <Search size={17} className="text-faint" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Chercher un anime, aller quelque part…"
          className="h-[54px] flex-1 bg-transparent text-[0.94rem] outline-none placeholder:text-faint"
        />
        {remote.loading && <LoaderCircle size={15} className="animate-spin text-faint" />}
      </div>

      <div ref={listRef} className="scroll-y max-h-[52vh] p-2">
        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-[0.83rem] text-faint">
            {query.trim().length >= 2 ? 'Aucun résultat.' : 'Tape au moins deux lettres pour chercher sur AniList.'}
          </p>
        ) : (
          items.map((item, i) => (
            <button
              key={item.key}
              data-idx={i}
              onMouseEnter={() => move(i)}
              onClick={() => item.run()}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition"
              style={{
                background: i === cursor ? 'color-mix(in oklab, var(--accent) 18%, transparent)' : 'transparent'
              }}
            >
              {item.cover ? (
                <img src={item.cover} alt="" className="h-11 w-8 shrink-0 rounded-md object-cover" />
              ) : (
                <span className="grid h-11 w-8 shrink-0 place-items-center rounded-md bg-white/6 text-faint">
                  <CornerDownLeft size={13} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.86rem] font-medium">{item.label}</span>
                <span className="block text-[0.72rem] text-faint">{item.sub}</span>
              </span>
              {i === cursor && <CornerDownLeft size={13} className="shrink-0 text-faint" />}
            </button>
          ))
        )}
      </div>

      <div
        className="flex items-center gap-4 border-t px-4 py-2 text-[0.68rem] text-faint"
        style={{ borderColor: 'var(--line)' }}
      >
        <span>↑↓ naviguer</span>
        <span>⏎ ouvrir</span>
        <span>Échap fermer</span>
      </div>
    </>
  )
}
