/**
 * La petite carte de mise à jour : logo, nom, progression.
 *
 * Sans React et sans le reste de l'app — elle doit s'afficher à l'instant où
 * on clique dans les réglages, pas après avoir chargé un mégaoctet de rendu.
 * Ce qu'elle montre est décidé par `updateCard`, testé à part ; il ne reste
 * ici que le dessin et le moment de disparaître.
 *
 * Aucun bouton : la décision a été prise dans les réglages, et la carte ne la
 * repose pas. Elle se ferme donc seule — quand l'app se ferme pour installer,
 * quand le cycle retombe, ou quelques secondes après avoir dit que c'est prêt.
 */

import { updateCard, type UpdateCard } from '@shared/update-card'
import type { UpdateStatus } from '@shared/types'

interface UpdateWindowApi {
  status: () => Promise<UpdateStatus>
  close: () => void
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

/** Le thème de l'app, passé en paramètres d'adresse par le processus principal. */
const params = new URLSearchParams(location.search)
for (const name of ['bg', 'fg', 'accent'] as const) {
  const value = params.get(name)
  if (value) document.documentElement.style.setProperty(`--${name}`, value)
}

/**
 * Pourquoi la fenêtre est ouverte.
 *
 * `install` ne se déduit d'aucun état : le cycle reste sur « prête » pendant
 * que l'installeur démarre, et la carte annoncerait donc « prête à installer »
 * pendant qu'elle s'installe. C'est le clic qui le sait, et il l'apporte ici.
 */
const installing = params.get('mode') === 'install'

/** Une fois prête, la carte a tout dit : elle s'efface plutôt que de rester. */
const LINGER_MS = 5000
let leaving = 0

function draw(status: UpdateStatus): void {
  const card: UpdateCard | null = updateCard(status, installing)
  // Plus rien à suivre — « à jour », ou une erreur que les réglages diront
  // mieux : la fenêtre n'a plus de raison d'être.
  if (!card) return api.close()

  title.textContent = card.title
  line.textContent = card.line

  track.classList.toggle('sweep', card.bar === 'sweep')
  if (card.bar === 'value') fill.style.width = `${card.percent ?? 0}%`

  // L'installation, elle, ne se termine pas ici : l'app se ferme, et la
  // fenêtre part avec.
  if (status.phase === 'ready' && !installing && !leaving) {
    leaving = window.setTimeout(() => api.close(), LINGER_MS)
  }
}

api.onStatus(draw)
void api.status().then(draw)
