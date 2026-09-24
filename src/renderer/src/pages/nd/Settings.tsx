import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NdHeader, plural } from '@/components/nd'
import { SETTINGS_SECTIONS } from '@/lib/settings-sections'
import SettingsBody from '../settings/Body'
import { ChromeProvider, filterSettings, type CardProps, type RowProps, type ToggleProps } from '../settings/chrome'
import { useApp } from '@/store/app'

/**
 * Une section : son nom en grand, et rien autour.
 *
 * L'ancienne page posait chaque section dans une carte de verre, avec son
 * icône en couleur et un titre de la taille d'une ligne. Onze boîtes les unes
 * sous les autres, toutes de la même importance. Ici la section s'annonce
 * comme un chapitre — un titre qu'on lit de loin, un trait, puis les réglages
 * — et son icône passe en gris : elle accompagne le titre au lieu de le
 * concurrencer, la navigation étant l'affaire du sommaire.
 */
function Card({ id, title, icon, children }: CardProps): React.JSX.Element {
  const keywords = SETTINGS_SECTIONS.find((section) => section.id === id)?.keywords ?? ''
  return (
    <section
      id={`reglages-${id}`}
      data-settings-section={id}
      data-keywords={`${title} ${keywords}`}
      className="nd-set-section"
    >
      <h2 className="title-xl text-[1.32rem] leading-tight">
        <span className="nd-set-icon" aria-hidden>
          {icon}
        </span>
        {title}
      </h2>
      <div className="mt-3.5">{children}</div>
    </section>
  )
}

/** Un réglage : ce qu'il fait à gauche en une phrase, de quoi le changer à droite. */
function Row({ label, hint, badge, children }: RowProps): React.JSX.Element {
  return (
    <div data-settings-row className="nd-set-row">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[0.88rem] font-semibold">
          {label}
          {badge && <span className="nd-set-badge">{badge}</span>}
        </p>
        {hint && <p className="mt-1 max-w-[62ch] text-[0.78rem] leading-relaxed text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** L'interrupteur : un trait qui se remplit, sans halo ni dégradé. */
function Toggle({ on, onChange }: ToggleProps): React.JSX.Element {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className="nd-switch" data-on={on}>
      <span />
    </button>
  )
}

const CHROME = { Card, Row, Toggle }

/**
 * Le sommaire, qui suit la lecture.
 *
 * Un trait devant la section lue plutôt qu'une pastille colorée : la couleur
 * du thème sert aux actions, pas à dire où l'on est.
 *
 * La section courante est la dernière dont le titre est passé au-dessus du
 * haut de l'écran, relue au défilement. La version à observateur marquait la
 * première section encore visible — c'est-à-dire la précédente, qui déborde
 * par le haut, et le sommaire annonçait « Notifications » pendant qu'on
 * lisait « Lecture ».
 */
function Toc({ visible }: { visible: Set<string> | null }): React.JSX.Element {
  const [current, setCurrent] = useState<string>(SETTINGS_SECTIONS[0].id)

  useEffect(() => {
    const root = document.getElementById('contenu')
    if (!root) return

    const read = (): void => {
      const limite = root.getBoundingClientRect().top + 90
      let found: string = SETTINGS_SECTIONS[0].id
      document.querySelectorAll<HTMLElement>('[data-settings-section]').forEach((el) => {
        if (el.getBoundingClientRect().top <= limite) found = el.dataset.settingsSection ?? found
      })
      setCurrent(found)
    }

    read()
    root.addEventListener('scroll', read, { passive: true })
    return () => root.removeEventListener('scroll', read)
  }, [])

  return (
    <nav aria-label="Sections des réglages" className="nd-set-toc">
      <ul>
        {SETTINGS_SECTIONS.filter((section) => !visible || visible.has(section.id)).map((section) => (
          <li key={section.id}>
            <button
              aria-current={current === section.id ? 'true' : undefined}
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
 * Les Réglages, dans le nouveau design.
 *
 * Même contenu qu'avant, à la ligne près : il vit dans `settings/Body` et les
 * deux pages se le partagent. Ce qui change est la forme — des chapitres
 * plutôt que des boîtes, une phrase par réglage, un sommaire qui accompagne
 * la lecture au lieu de flotter à côté.
 */
export default function NdSettingsPage(): React.JSX.Element {
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
    // Plus étroit que les autres pages : un réglage se lit d'un bout à
    // l'autre, et sur toute la largeur l'interrupteur finit à dix centimètres
    // de la phrase qu'il commande.
    <div className="page" style={{ ['--page-max' as string]: '1040px' }}>
      <NdHeader
        title="Réglages"
        sub={`${plural(entries.size, 'titre')} et ${plural(events.length, 'épisode coché', 'épisodes cochés')} sur ce PC, dans un fichier qui n’en sort pas.`}
      />

      <label className="nd-search mb-8">
        <Search size={15} aria-hidden />
        <input
          type="search"
          placeholder="Chercher un réglage…"
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
          <button onClick={() => setQuery('')} aria-label="Effacer la recherche">
            <X size={15} />
          </button>
        )}
      </label>

      <div className="nd-set-layout">
        <Toc visible={visible} />
        <div ref={bodyRef} className="min-w-0 flex-1">
          {visible?.size === 0 && (
            <p className="py-16 text-center text-sm text-muted">Aucun réglage ne répond à « {query.trim()} ».</p>
          )}
          <ChromeProvider value={CHROME}>
            <SettingsBody />
          </ChromeProvider>
        </div>
      </div>
    </div>
  )
}
