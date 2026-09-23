/**
 * Lance AnimeList sur une bibliothèque vide.
 *
 *   npm run nothing            un dossier neuf à chaque lancement
 *   npm run nothing -- --garder   reprend celui de la fois d'avant
 *
 * Trois vies, trois dossiers, et aucun ne touche aux autres :
 *
 *   %APPDATA%\animelist           la version installée — la vraie bibliothèque
 *   %APPDATA%\animelist-dev       `npm run dev`, semé d'une copie de la vraie
 *   %APPDATA%\animelist-nothing   ici, et rien dedans
 *
 * Le profil de développement recopie la bibliothèque installée au premier
 * lancement, exprès : on ne développe pas sur une app vide. Mais l'inverse est
 * utile aussi — une bibliothèque vide est le seul endroit où l'on voit ce que
 * voit quelqu'un qui ouvre l'app pour la première fois : les écrans vides, le
 * premier épisode coché, les premiers badges qui tombent pour de vrai.
 *
 * L'app reconnaît `--user-data-dir` et laisse alors son choix de profil de
 * côté (voir `src/main/index.ts` et `src/main/profile.ts`), si bien que rien
 * ici n'a besoin de savoir comment elle range ses fichiers.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const NOM = 'animelist-nothing'
const GARDER = process.argv.includes('--garder')

const base = process.env.APPDATA ?? join(process.env.USERPROFILE ?? '.', 'AppData', 'Roaming')
const dir = join(base, NOM)

/**
 * Le garde-fou qui compte.
 *
 * Ce script efface un dossier ; une variable d'environnement vide ou un nom
 * changé par erreur pourraient le faire pointer ailleurs — sur la vraie
 * bibliothèque, par exemple. On ne supprime donc que si le chemin se termine
 * bien par le nom prévu, et jamais rien d'autre.
 */
if (!dir.endsWith(NOM)) {
  console.error(`[nothing] chemin inattendu, rien n'est effacé : ${dir}`)
  process.exit(1)
}

if (!GARDER && existsSync(dir)) {
  rmSync(dir, { recursive: true, force: true })
  console.log(`[nothing] ${dir} vidé`)
}
mkdirSync(dir, { recursive: true })

console.log(`[nothing] AnimeList sur ${dir}${GARDER ? ' (gardé)' : ' (vide)'}`)

const electron = join('node_modules', 'electron', 'dist', 'electron.exe')
const child = spawn(electron, ['.', `--user-data-dir=${dir}`], { stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
