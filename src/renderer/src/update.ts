/**
 * La petite fenêtre de mise à jour : logo, nom, progression.
 *
 * Sans React et sans le reste de l'app — elle doit s'afficher au moment où une
 * version est trouvée, pas après avoir chargé un mégaoctet de rendu. Ce qu'elle
 * montre est décidé par `updateCard`, testé à part ; il ne reste ici que le
 * dessin et les trois boutons.
 */

import { updateCard, type UpdateAction, type UpdateCard } from '@shared/update-card'
import type { UpdateStatus } from '@shared/types'

interface UpdateWindowApi {
  status: () => Promise<UpdateStatus>
  download: () => Promise<UpdateStatus>
  install: () => Promise<void>
  dismiss: (remember: boolean) => void
  onStatus: (fn: (status: UpdateStatus) => void) => () => void
}

declare global {
  interface Window {
    updateWindow: UpdateWindowApi
  }
}

const api = window.updateWindow

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
const title = el('title')
const line = el('line')
const track = el<HTMLDivElement>('track')
const fill = el<HTMLDivElement>('fill')
const actions = el<HTMLDivElement>('actions')

/** Le thème de l'app, passé en paramètres d'adresse par le processus principal. */
const params = new URLSearchParams(location.search)
for (const name of ['bg', 'fg', 'accent'] as const) {
  const value = params.get(name)
  if (value) document.documentElement.style.setProperty(`--${name}`, value)
}

/**
 * « Redémarrer » a été cliqué : l'app se ferme dans la seconde, et sans cet
 * état la carte afficherait « prête à installer » pendant qu'elle s'installe.
 */
let installing = false

/**
 * L'aperçu : la carte jouée à vide, depuis les réglages.
 *
 * Rien de ce qu'elle montre n'est vrai, et rien de ce qu'on y clique ne
 * télécharge — d'où la mention sur chaque ligne. Sans ça, une fenêtre qui
 * n'apparaît qu'au moment d'une vraie mise à jour resterait invisible jusqu'à
 * la prochaine, thème compris.
 */
const demo = params.get('demo') === '1'

const LABEL: Record<UpdateAction, string> = {
  download: 'Télécharger',
  install: 'Redémarrer maintenant',
  later: 'Plus tard'
}

function run(action: UpdateAction): void {
  if (demo) return api.dismiss(false)
  if (action === 'later') return api.dismiss(true)
  if (action === 'download') return void api.download()
  installing = true
  void api.install()
  // Redessiné tout de suite : l'app met une seconde à se fermer, et un bouton
  // qui ne réagit pas se reclique.
  void api.status().then(draw)
}

function draw(status: UpdateStatus): void {
  const card: UpdateCard | null = updateCard(status, installing)
  // Plus rien à annoncer — « à jour », ou une erreur que les réglages diront
  // mieux : la fenêtre n'a plus de raison d'être.
  if (!card) return api.dismiss(false)

  title.textContent = card.title
  line.textContent = demo ? `Aperçu · ${card.line}` : card.line

  track.hidden = card.bar === 'none'
  track.classList.toggle('sweep', card.bar === 'sweep')
  if (card.bar === 'value') fill.style.width = `${card.percent ?? 0}%`

  actions.replaceChildren(
    ...card.actions.map((action) => {
      const button = document.createElement('button')
      button.className = action === 'later' ? 'act' : 'act primary'
      button.textContent = LABEL[action]
      button.onclick = () => run(action)
      return button
    })
  )
}

el<HTMLButtonElement>('close').onclick = () => api.dismiss(!demo)

/** Les trois moments de la carte, joués une fois, pour l'aperçu. */
function playDemo(): void {
  const version = params.get('version') ?? ''
  const fake = (patch: Partial<UpdateStatus>): UpdateStatus => ({
    phase: 'idle',
    version,
    percent: 0,
    message: null,
    notes: [],
    ...patch
  })

  draw(fake({ phase: 'available' }))
  window.setTimeout(() => {
    let percent = 0
    const timer = window.setInterval(() => {
      percent += 7
      if (percent >= 100) {
        window.clearInterval(timer)
        draw(fake({ phase: 'ready', percent: 100 }))
        return
      }
      draw(fake({ phase: 'downloading', percent }))
    }, 180)
  }, 1600)
}

if (demo) playDemo()
else {
  api.onStatus(draw)
  void api.status().then(draw)
}
