/**
 * La petite fenêtre de mise à jour : logo, nom, barre de progression.
 *
 * Le cycle est automatique et discret — c'est bien, tant que personne ne se
 * demande ce que l'app fabrique. Une version trouvée, un téléchargement en
 * cours, une version prête : trois moments qui méritent d'être vus sans avoir
 * à ouvrir les réglages.
 *
 * **Ce qu'elle ne fait pas** : voler le premier plan. Elle paraît sans prendre
 * le focus, en bas à droite, et ne passe au-dessus des autres fenêtres que si
 * aucun épisode ne joue. Un carton qui recouvre une vidéo pour annoncer une
 * mise à jour est exactement ce qu'on reproche aux autres logiciels.
 *
 * Le contenu vient de `updateCard`, testé à part. Cette page-ci est bâtie sans
 * React ni Tailwind : elle doit paraître à l'instant, pas après avoir chargé
 * le rendu complet de l'app.
 */

import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { THEMES, chromeFor } from '@shared/types'
import { updateCard } from '@shared/update-card'
import type { UpdateStatus } from '@shared/types'
import { getLocalWatching } from './now'
import { getPrefs } from './store'
import { trailerWindow } from './trailer'
import { watchWindow } from './watch-window'

const WIDTH = 380
const HEIGHT = 176
/** De quoi ne pas coller à la barre des tâches ni au bord de l'écran. */
const MARGIN = 18

let win: BrowserWindow | null = null

/**
 * La version qu'on a demandé de ne plus annoncer.
 *
 * « Plus tard » vaut pour toute la version, pas pour l'étape en cours :
 * refermer la carte pendant le téléchargement et la voir revenir dix secondes
 * plus tard sous prétexte que la phase a changé serait pire que de ne pas
 * l'avoir fermée. La notification, elle, dira quand même que c'est prêt.
 */
let dismissed: string | null = null

/** Vrai pendant qu'un épisode ou une bande-annonce joue, ici ou ailleurs. */
function watching(): boolean {
  return getLocalWatching() !== null || trailerWindow() !== null || watchWindow() !== null
}

/** Le thème de l'app, pour que la carte ne soit pas la seule chose grise. */
function colors(): string {
  const theme = getPrefs().theme
  const { color, symbolColor } = chromeFor(theme)
  const accent = (THEMES.find((t) => t.id === theme) ?? THEMES[0]).swatch[1]
  return `?bg=${encodeURIComponent(color)}&fg=${encodeURIComponent(symbolColor)}&accent=${encodeURIComponent(accent)}`
}

/** En bas à droite de l'écran qui porte la fenêtre principale. */
function place(target: BrowserWindow): void {
  const main = BrowserWindow.getAllWindows().find((w) => w !== target && !w.isDestroyed())
  const display = main ? screen.getDisplayMatching(main.getBounds()) : screen.getPrimaryDisplay()
  const { x, y, width, height } = display.workArea
  target.setPosition(x + width - WIDTH - MARGIN, y + height - HEIGHT - MARGIN)
}

function create(search: string): BrowserWindow {
  const target = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/update.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  place(target)

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void target.loadURL(`${devUrl}/update.html${search}`)
  else void target.loadFile(join(__dirname, '../renderer/update.html'), { search })

  // Sans focus : quelqu'un est peut-être en train de taper une recherche.
  target.once('ready-to-show', () => target.showInactive())
  target.on('closed', () => {
    if (win === target) win = null
  })

  // Une fenêtre ouverte empêche `window-all-closed` de se déclencher : fermer
  // la fenêtre principale laisserait l'app en vie, invisible, sur cette carte.
  BrowserWindow.getAllWindows()
    .find((w) => w !== target && !w.isDestroyed())
    ?.once('closed', () => closeUpdateWindow())

  return target
}

/**
 * Montre la carte si le moment s'y prête, la ferme sinon.
 *
 * Appelée à chaque changement d'état : c'est la seule porte, et l'état de la
 * fenêtre ne peut donc pas diverger de celui du cycle.
 */
export function showUpdateWindow(status: UpdateStatus): void {
  if (!updateCard(status)) return closeUpdateWindow()
  if (status.version && status.version === dismissed) return

  if (!win || win.isDestroyed()) win = create(colors())
  // Au-dessus du reste, sauf pendant un épisode : la carte attendra la fin
  // plutôt que de se poser sur la vidéo.
  win.setAlwaysOnTop(!watching())
}

/** « Plus tard », ou la croix : plus rien pour cette version. */
export function dismissUpdateWindow(version: string | null): void {
  dismissed = version
  closeUpdateWindow()
}

export function closeUpdateWindow(): void {
  if (win && !win.isDestroyed()) win.destroy()
  win = null
}

/**
 * Montre la carte à vide, pour la voir sans attendre une vraie version.
 *
 * Une fenêtre qui n'apparaît qu'au moment d'une mise à jour est invisible
 * jusqu'à la prochaine — impossible d'en vérifier l'allure, la position ou la
 * lisibilité du thème avant qu'elle ne serve pour de bon. Les lignes portent
 * la mention « Aperçu », et aucun bouton ne télécharge quoi que ce soit : rien
 * de ce qui s'y affiche n'est vrai.
 */
export function previewUpdateWindow(version: string): void {
  closeUpdateWindow()
  win = create(`${colors()}&demo=1&version=${encodeURIComponent(version)}`)
  win.setAlwaysOnTop(true)
}
