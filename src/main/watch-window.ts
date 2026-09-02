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

import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { ORIGIN } from './animesama'

let win: BrowserWindow | null = null

/** L'adresse actuellement ouverte, pour savoir si un changement suffit. */
let openedUrl = ''

/**
 * Change d'épisode dans la page déjà ouverte.
 *
 * Leur page porte un `<select id="selectEpisodes">` dont le `onchange` appelle
 * leur propre `selectEpisode()`. Le choisir, c'est exactement le geste d'un
 * visiteur — on ne contourne rien, on actionne leur sélecteur.
 *
 * Recréer la fenêtre marchait aussi, et c'est ce qui se passait : tout le site
 * se rechargeait à chaque épisode, publicités comprises, avec le clignotement
 * que ça suppose. Rend faux si le sélecteur n'est pas là — page pas encore
 * chargée, ou mise en page changée — et l'appelant repart alors de zéro.
 */
async function switchEpisode(target: BrowserWindow, episode: number): Promise<boolean> {
  const script = `(function () {
    var sel = document.getElementById('selectEpisodes')
    if (!sel || !sel.options || !sel.options.length) return false
    var want = 'EPISODE ' + ${episode}
    for (var i = 0; i < sel.options.length; i++) {
      if ((sel.options[i].textContent || '').trim().toUpperCase() === want) {
        sel.selectedIndex = i
        sel.dispatchEvent(new Event('change'))
        return true
      }
    }
    return false
  })()`

  const done: unknown = await target.webContents.executeJavaScript(script, true).catch(() => false)
  return done === true
}

export async function openAnimeSamaEpisode(url: string, episode: number | null): Promise<boolean> {
  // Une seule origine acceptée : cette fenêtre n'est pas un navigateur à tout
  // faire, et une URL venue d'ailleurs n'a rien à y faire.
  if (!url.startsWith(`${ORIGIN}/`)) return false

  // Même saison déjà à l'écran : on ne recharge pas le site pour changer de
  // numéro. C'est la différence entre un clic dans un menu et une visite
  // entière, publicités comprises.
  if (win && !win.isDestroyed() && openedUrl === url && Number.isInteger(episode) && (episode as number) > 0) {
    if (await switchEpisode(win, episode as number)) {
      win.focus()
      return true
    }
  }

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
      /**
       * Chromium refuse de démarrer une vidéo sans geste de l'utilisateur.
       * Depuis un canapé, le geste a eu lieu — sur un téléphone, à l'autre
       * bout de la pièce. Sans ça, « Regarder » ouvre la page et s'arrête là.
       */
      autoplayPolicy: 'no-user-gesture-required',
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
    openedUrl = ''
  })

  /**
   * Aucune fenêtre surgissante, et rien renvoyé au navigateur.
   *
   * Le premier clic sur le lecteur en déclenche une : c'est le modèle du site.
   * La faire suivre vers le navigateur — ce que faisait la première version —
   * revient à ouvrir soi-même la publicité qu'on vient de refuser. Tous les
   * navigateurs les bloquent par défaut ; celui-ci aussi.
   *
   * Conséquence assumée : les liens Discord et X de leur en-tête, qui passent
   * par le même mécanisme, ne s'ouvrent plus.
   */
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  /**
   * La fenêtre reste chez eux.
   *
   * Un clic mal placé peut emmener la page entière sur une régie publicitaire.
   * Seule la navigation de premier niveau est concernée : le lecteur vit dans
   * une iframe, dont les changements d'adresse ne passent pas par ici.
   */
  win.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith(`${ORIGIN}/`)) event.preventDefault()
  })

  openedUrl = url
  void win.loadURL(url)
  return true
}

/**
 * La fenêtre Anime-Sama, pour qui doit la piloter. `null` si fermée.
 *
 * Seules les commandes qui s'adressent à la fenêtre elle-même — plein écran,
 * fermeture — ont un sens ici : leur lecteur vit dans une iframe d'un autre
 * domaine, hors d'atteinte.
 */
export function watchWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null
}

export function closeWatchWindow(): void {
  win?.close()
}
