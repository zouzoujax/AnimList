/**
 * Deux versions, deux dossiers de données.
 *
 * `app.getPath('userData')` se déduit du nom de l'app : « animelist » depuis les
 * sources, « AnimeList » une fois empaquetée. Sur Windows la casse ne distingue
 * pas deux dossiers — les deux versions écrivaient donc dans le même
 * `%APPDATA%\animelist`, le même `animelist.json`, le même journal. Décocher un
 * épisode pour essayer quelque chose en développement le décochait pour de bon,
 * et il fallait ensuite le recocher à la main dans l'app installée.
 *
 * Le verrou d'instance unique se déduit du même chemin : lancer la version de
 * développement pendant que l'app installée tourne en réveillait la fenêtre au
 * lieu d'ouvrir la seconde. Séparer les dossiers règle les deux d'un coup, ce
 * qui explique l'ordre dans `index.ts` — avant `requestSingleInstanceLock`.
 *
 * La première fois, la bibliothèque installée est recopiée : un bac à sable
 * vide ne permet de tester rien. La copie ne va que dans ce sens, et une seule
 * fois — ensuite les deux vies divergent, ce qui est exactement le but.
 */

import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const DEV_DIR = 'animelist-dev'

/** Le noyau et son journal. Le reste (caches, session) se reconstruit seul. */
const SEEDED = ['animelist.json', 'animelist-history.jsonl']

export function useDevProfile(): void {
  const installed = app.getPath('userData')
  const dev = join(app.getPath('appData'), DEV_DIR)
  app.setPath('userData', dev)

  if (existsSync(join(dev, 'animelist.json'))) return

  try {
    mkdirSync(dev, { recursive: true })
    for (const name of SEEDED) {
      const from = join(installed, name)
      if (existsSync(from)) copyFileSync(from, join(dev, name))
    }
    console.warn(`[profil] bibliothèque recopiée depuis l'app installée vers ${dev}`)
  } catch (err) {
    // Repartir de zéro reste préférable à écrire dans les données de l'app installée.
    console.error('[profil] copie initiale impossible', err)
  }
}
