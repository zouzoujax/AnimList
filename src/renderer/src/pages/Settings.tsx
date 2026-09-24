import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { SETTINGS_SECTIONS } from '@/lib/settings-sections'
import SettingsBody from './settings/Body'
import { ChromeProvider, filterSettings, type CardProps, type RowProps, type ToggleProps } from './settings/chrome'
import { useApp } from '@/store/app'

function Card({ id, title, icon, children }: CardProps): React.JSX.Element {
  const keywords = SETTINGS_SECTIONS.find((section) => section.id === id)?.keywords ?? ''
  return (
    <section
      id={`reglages-${id}`}
      data-settings-section={id}
      data-keywords={`${title} ${keywords}`}
      className="glass mb-4 scroll-mt-5 rounded-[20px] p-5"
    >
      <h2 className="mb-4 flex items-center gap-2 text-[0.98rem] font-semibold">
        <span className="text-[var(--accent-2)]">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

/** `badge` : « WIP » et compagnie, pour dire qu'un réglage n'est pas encore stabilisé. */
function Row({ label, hint, badge, children }: RowProps): React.JSX.Element {
  return (
    <div
      data-settings-row
      className="flex items-center justify-between gap-6 border-t py-3 first:border-t-0 first:pt-0"
      style={{ borderColor: 'var(--line)' }}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[0.85rem] font-medium">
          {label}
          {badge && (
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wide uppercase"
              style={{
                background: 'rgba(255,255,255,.09)',
                border: '1px solid var(--line-2)',
                color: 'var(--color-faint)'
              }}
            >
              {badge}
            </span>
          )}
        </p>
        {hint && <p className="mt-0.5 text-[0.74rem] leading-snug text-faint">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ on, onChange }: ToggleProps): React.JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="relative h-[26px] w-[46px] rounded-full transition-colors duration-200"
      style={{
        background: on ? 'linear-gradient(135deg, var(--accent), var(--accent-2))' : 'rgba(255,255,255,.1)',
        boxShadow: on ? '0 0 18px -6px var(--glow)' : 'inset 0 1px 0 rgba(255,255,255,.06)'
      }}
    >
      <span
        className="absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all duration-200"
        style={{ left: on ? 23 : 3 }}
      />
    </button>
  )
}

const CHROME = { Card, Row, Toggle }

/**
 * Le sommaire des Réglages, qui suit la lecture.
 *
 * Onze cartes les unes sous les autres : sans lui, trouver « Discord »
 * voulait dire faire défiler toute la page en lisant chaque titre.
 */
function SettingsToc({ visible }: { visible: Set<string> | null }): React.JSX.Element {
  const [current, setCurrent] = useState<string>(SETTINGS_SECTIONS[0].id)

  useEffect(() => {
    const root = document.getElementById('contenu')
    const observer = new IntersectionObserver(
      (seen) => {
        const top = seen
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        const id = (top?.target as HTMLElement | undefined)?.dataset.settingsSection
        if (id) setCurrent(id)
      },
      // Une bande en haut de l'écran : la carte qui la traverse est « la » carte lue.
      { root, rootMargin: '0px 0px -70% 0px' }
    )
    document.querySelectorAll('[data-settings-section]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <nav
      aria-label="Sections des réglages"
      className="sticky top-7 hidden w-[180px] shrink-0 self-start min-[1180px]:block"
    >
      <ul className="flex flex-col gap-0.5">
        {SETTINGS_SECTIONS.filter((section) => !visible || visible.has(section.id)).map((section) => (
          <li key={section.id}>
            <button
              className="w-full rounded-lg px-3 py-1.5 text-left text-[0.8rem] transition-colors"
              aria-current={current === section.id ? 'true' : undefined}
              style={
                current === section.id
                  ? { background: 'color-mix(in oklab, var(--accent) 18%, transparent)', color: 'var(--color-text)' }
                  : { color: 'var(--color-muted)' }
              }
              onClick={() => document.getElementById(`reglages-${section.id}`)?.scrollIntoView({ behavior: 'smooth' })}
            >
              {section.title}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * Les Réglages, forme d'origine : des cartes de verre empilées, un sommaire à
 * gauche, une recherche en tête. Le contenu vient de `settings/Body`.
 */
export default function SettingsPage(): React.JSX.Element {
  const entries = useApp((s) => s.entries)
  const events = useApp((s) => s.events)
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState<Set<string> | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const route = useApp((s) => s.route)
  const section = route.name === 'settings' ? route.section : undefined

  useEffect(() => {
    if (bodyRef.current) setVisible(filterSettings(bodyRef.current, query))
  }, [query])

  // Arrivé par la palette sur une section précise : on y va.
  useEffect(() => {
    if (!section) return
    const t = setTimeout(
      () => document.getElementById(`reglages-${section}`)?.scrollIntoView({ behavior: 'smooth' }),
      80
    )
    return () => clearTimeout(t)
  }, [section])

  return (
    <div className="mx-auto flex max-w-[1060px] gap-8 px-7 py-7">
      <SettingsToc visible={visible} />
      <div ref={bodyRef} className="min-w-0 max-w-[820px] flex-1">
        <h1 className="title-xl mb-1 text-[1.85rem]">Réglages</h1>
        <p className="mb-5 text-[0.85rem] text-muted">
          {entries.size} titres et {events.length} épisodes stockés sur ce PC.
        </p>
        <label className="relative mb-6 block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="search"
            className="field w-full !pl-9"
            placeholder="Chercher un réglage : notifications, Discord, sauvegarde…"
            aria-label="Chercher un réglage"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape' || !query) return
              e.stopPropagation()
              setQuery('')
            }}
          />
          {query && (
            <button
              className="icon-btn absolute right-1.5 top-1/2 !h-7 !w-7 -translate-y-1/2"
              onClick={() => setQuery('')}
              aria-label="Effacer la recherche"
            >
              <X size={14} />
            </button>
          )}
        </label>
        {visible?.size === 0 && (
          <p className="glass mb-4 rounded-[20px] p-5 text-[0.85rem] text-muted">
            Aucun réglage ne répond à « {query.trim()} ».
          </p>
        )}

        <ChromeProvider value={CHROME}>
          <SettingsBody />
        </ChromeProvider>
      </div>
    </div>
  )
}
