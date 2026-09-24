import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NdHeader, plural } from '@/components/nd'
import { SETTINGS_SECTIONS, filterSettings } from '@/lib/settings-sections'
import SettingsBody from './settings/Body'
import { useApp } from '@/store/app'

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
 * Les Réglages : la coquille — le titre, la recherche, le sommaire.
 *
 * Le contenu, lui, vit dans `settings/Body` : onze sections et une centaine
 * de réglages, qui n'ont pas à traîner dans le même fichier que la mise en
 * page.
 *
 * Cette forme-là est née dans le nouveau design et l'a quitté : elle n'est
 * plus un choix mais la page. Les cartes de verre empilées, avec leur icône
 * en couleur et leur titre de la taille d'une ligne, ne reviendront pas.
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
          <SettingsBody />
        </div>
      </div>
    </div>
  )
}
