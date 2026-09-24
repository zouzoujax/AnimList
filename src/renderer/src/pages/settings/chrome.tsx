/**
 * L'habillage des Réglages, fourni par la page qui les affiche.
 *
 * Le contenu — onze sections, une centaine de réglages, et tout ce qui les
 * fait marcher — vit dans `Body.tsx`, en un seul exemplaire. Ce qui change
 * d'un design à l'autre, c'est la forme des cartes, des lignes et des
 * interrupteurs : chaque page fournit les siennes ici, et le corps s'y coule.
 *
 * Deux copies du corps auraient divergé au premier réglage ajouté — c'est
 * arrivé à d'autres pages, et un réglage qui n'existe que dans l'ancien
 * design est un réglage introuvable.
 */

import { createContext, useContext, type ReactNode } from 'react'
import type { SettingsSection } from '@/lib/settings-sections'
import { fold } from '@/lib/settings-sections'

export interface CardProps {
  id: SettingsSection
  title: string
  icon: ReactNode
  children: ReactNode
}

export interface RowProps {
  label: string
  hint?: string
  /** « WIP » et compagnie : dire qu'un réglage n'est pas encore stabilisé. */
  badge?: string
  children: ReactNode
}

export interface ToggleProps {
  on: boolean
  onChange: (v: boolean) => void
}

export interface SettingsChrome {
  Card: (props: CardProps) => React.JSX.Element
  Row: (props: RowProps) => React.JSX.Element
  Toggle: (props: ToggleProps) => React.JSX.Element
}

const ChromeContext = createContext<SettingsChrome | null>(null)

export const ChromeProvider = ChromeContext.Provider

export function useChrome(): SettingsChrome {
  const chrome = useContext(ChromeContext)
  if (!chrome) throw new Error('Les réglages doivent être rendus dans un ChromeProvider.')
  return chrome
}

/**
 * Masque les lignes qui ne répondent pas à la recherche.
 *
 * Par le DOM plutôt que par l'état : les cartes mêlent des lignes simples et
 * des blocs sur mesure, et faire remonter à chacune « je corresponds » aurait
 * voulu dire réécrire la page. Rend les sections encore visibles.
 *
 * L'habillage n'y change rien, tant qu'il pose `data-settings-section`,
 * `data-keywords` et `data-settings-row` — c'est le contrat des deux designs.
 */
export function filterSettings(root: HTMLElement, query: string): Set<string> | null {
  const needle = fold(query.trim())
  const sections = root.querySelectorAll<HTMLElement>('[data-settings-section]')
  if (!needle) {
    sections.forEach((section) => {
      section.hidden = false
      section.querySelectorAll<HTMLElement>('[data-settings-row]').forEach((row) => (row.hidden = false))
    })
    return null
  }
  const visible = new Set<string>()
  sections.forEach((section) => {
    const whole = fold(section.dataset.keywords ?? '').includes(needle)
    let any = whole
    section.querySelectorAll<HTMLElement>('[data-settings-row]').forEach((row) => {
      const hit = whole || fold(row.textContent ?? '').includes(needle)
      row.hidden = !hit
      if (hit) any = true
    })
    section.hidden = !any
    if (any) visible.add(section.dataset.settingsSection ?? '')
  })
  return visible
}
