/**
 * Fenêtre d'ouverture d'un épisode chez Anime-Sama.
 *
 * Le site ne sait pas viser un épisode par son adresse : le numéro vit dans le
 * stockage local du navigateur. Le navigateur système ne nous laisse pas y
 * écrire — cette fenêtre-ci, si, par un préchargement qui pose la clé avant que
 * leurs scripts ne la lisent. Voir `src/preload/watch.ts`.
 *
 * C'est leur page qui s'affiche, avec leur lecteur : rien n'est extrait, rien
 * n'est contourné. La fenêtre est une fenêtre de navigation, pas un lecteur.
 *
 * Aucune intégration Node, aucun accès à nos canaux : le préchargement n'expose
 * rien et la fenêtre ne peut rien demander à l'app.
 */

import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { ORIGIN } from './animesama'

let win: BrowserWindow | null = null

export function openAnimeSamaEpisode(url: string, episode: number | null): boolean {
  // Une seule origine acceptée : cette fenêtre n'est pas un navigateur à tout
  // faire, et une URL venue d'ailleurs n'a rien à y faire.
  if (!url.startsWith(`${ORIGIN}/`)) return false

  const args = Number.isInteger(episode) && (episode as number) > 0 ? [`--animelist-episode=${episode}`] : []

  // Une fenêtre à la fois : rouvrir déplace celle qui est là plutôt que d'en
  // empiler une deuxième. Le préchargement ne s'appliquant qu'au chargement,
  // l'épisode change en rechargeant l'adresse dans une fenêtre neuve.
  if (win && !win.isDestroyed()) {
    win.close()
    win = null
  }

  win = new BrowserWindow({
    width: 1180,
    height: 760,
    backgroundColor: '#05060c',
    autoHideMenuBar: true,
    title: 'Anime-Sama',
    webPreferences: {
      /**
       * Sa propre session : le site range ses cookies et son stockage à part
       * des nôtres, et aucun réglage posé sur la session par défaut ne peut
       * l'atteindre par accident — c'est ainsi que notre politique de sécurité
       * avait fini par étrangler leur page en version installée.
       */
      partition: 'persist:anime-sama',
      preload: join(__dirname, '../preload/watch.js'),
      // Le préchargement écrit dans le stockage de la page : il doit partager
      // son monde. Il n'expose rien en retour, et Node reste hors de portée.
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: args
    }
  })

  win.on('closed', () => {
    win = null
  })

  // Les publicités du site ouvrent des fenêtres : elles partent au navigateur
  // système, où l'utilisateur a ses défenses habituelles.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//i.test(target)) void shell.openExternal(target)
    return { action: 'deny' }
  })

  void win.loadURL(url)
  return true
}
