/**
 * La petite carte de mise à jour : logo, nom, barre de progression.
 *
 * **Elle ne surgit jamais d'elle-même.** Elle s'ouvre sur un clic dans les
 * réglages — télécharger, ou redémarrer pour installer — et suit ensuite le
 * cycle jusqu'au bout. Une carte qui apparaîtrait toute seule pendant qu'on
 * regarde un épisode serait une interruption ; celle-ci ne fait que montrer où
 * en est ce qu'on vient de demander.
 *
 * Aucun bouton non plus, pour la même raison : la décision est prise: la carte
 * en rend compte. Elle se ferme donc seule, quand il n'y a plus rien à suivre.
 *
 * Elle paraît au centre de l'écran : c'est la réponse au clic qu'on vient de
 * faire, et on la cherche là où on regardait. Elle ne prend pas le focus pour
 * autant, et ne passe au-dessus des autres fenêtres que si aucun épisode ne
 * joue — on peut lancer une mise à jour puis retourner à sa série.
 *
 * Le contenu vient de `updateCard`, testé à part. Cette page-ci est bâtie sans
 * React ni Tailwind : elle doit paraître à l'instant, pas après avoir chargé
 * le rendu complet de l'app.
 */

import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { THEMES, chromeFor } from '@shared/types'
import { getLocalWatching } from './now'
import { getPrefs } from './store'
import { trailerWindow } from './trailer'
import { watchWindow } from './watch-window'

const WIDTH = 380
/** Le logo, deux lignes, une barre. Rien d'autre : rien d'autre à loger. */
const HEIGHT = 104

let win: BrowserWindow | null = null

/**
 * La carte d'installation doit survivre à la fermeture qu'elle annonce.
 *
 * C'est ce qui la rendait invisible : `quitAndInstall` déclenche `before-quit`,
 * qui referme la carte — elle naissait et mourait dans le même souffle, et le
 * clic sur « Redémarrer » ne montrait rien du tout. Tant qu'elle tient ce
 * rôle-là, seule une fermeture explicite l'emporte.
 */
let holding = false

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

/**
 * Au centre de l'écran qui porte la fenêtre principale.
 *
 * `workArea` plutôt que la taille de l'écran : sur un centrage vertical exact,
 * la barre des tâches décale l'ensemble de sa hauteur, et la carte tombe
 * légèrement bas. Le centre visé est celui de la zone utile.
 */
function place(target: BrowserWindow): void {
  const main = BrowserWindow.getAllWindows().find((w) => w !== target && !w.isDestroyed())
  const display = main ? screen.getDisplayMatching(main.getBounds()) : screen.getPrimaryDisplay()
  const { x, y, width, height } = display.workArea
  target.setPosition(Math.round(x + (width - WIDTH) / 2), Math.round(y + (height - HEIGHT) / 2))
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
 * Ouvre la carte, sur le clic qui vient d'être fait.
 *
 * `install` ne se déduit d'aucun état : le cycle reste sur « prête » pendant
 * que l'installeur démarre, et la carte annoncerait « prête à installer »
 * pendant qu'elle s'installe. C'est le clic qui le sait.
 *
 * Une fois ouverte, elle suit le cycle toute seule : les changements d'état
 * lui parviennent comme à toutes les fenêtres.
 */
export function showUpdateWindow(mode: 'download' | 'install'): Promise<void> {
  closeUpdateWindow(true)
  holding = mode === 'install'
  const target = create(`${colors()}&mode=${mode}`)
  win = target
  // Au-dessus du reste, sauf pendant un épisode : la carte attendra la fin
  // plutôt que de se poser sur la vidéo.
  target.setAlwaysOnTop(!watching())

  // Rendue avant de continuer. L'appelant qui enchaîne sur une fermeture doit
  // attendre ici, sinon il ferme l'app avant que la page ne soit dessinée.
  return new Promise((resolve) => {
    target.once('ready-to-show', () => resolve())
    // Une page qui ne se charge pas ne doit pas retenir une fermeture.
    setTimeout(resolve, 2000)
  })
}

/**
 * `force` passe outre la carte d'installation.
 *
 * La fermeture de l'app, elle, ne doit pas l'emporter : c'est précisément ce
 * qu'elle est en train d'annoncer.
 */
export function closeUpdateWindow(force = false): void {
  if (holding && !force) return
  holding = false
  if (win && !win.isDestroyed()) win.destroy()
  win = null
}
