/**
 * La sauvegarde automatique, hors du dossier de données.
 *
 * Le `.bak` et l'instantané d'avant migration vivent à côté du fichier qu'ils
 * protègent : ils sauvent d'une écriture ratée, pas d'un disque perdu, d'un
 * dossier effacé ni d'un ransomware. Le registre étant ce que l'app a de plus
 * précieux — des années de visionnages qu'aucun service ne rendra —, il lui
 * faut une copie ailleurs, faite sans qu'on y pense.
 *
 * Ce qui est copié : l'instantané, celui-là même que produit « Exporter ».
 * Donc un fichier que « Restaurer une sauvegarde » sait relire, sans outil ni
 * manipulation. Les positions de lecture, les dossiers de fichiers locaux et
 * les suivis n'y sont pas : ce sont des commodités, elles se refont en un
 * geste, et la restauration doit rester celle qu'on connaît déjà.
 */

import { BrowserWindow, dialog, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { backupName, isDue, listBackups, toDelete } from '@shared/backups'
import type { BackupStatus } from '@shared/types'
import { getPrefs, setPrefs, snapshot } from './store'

/** Les noms de nos fichiers dans le dossier choisi, le reste ignoré. */
async function names(folder: string): Promise<string[]> {
  return (await fs.readdir(folder, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name)
}

export async function backupStatus(): Promise<BackupStatus> {
  const folder = getPrefs().backupFolder
  if (!folder) return { folder: null, lastAt: 0, count: 0, error: null }

  try {
    const found = listBackups(await names(folder))
    return { folder, lastAt: found[0]?.at ?? 0, count: found.length, error: null }
  } catch (err) {
    // Disque externe débranché, dossier renommé, partage réseau absent : la
    // ligne des Réglages doit le dire plutôt que d'afficher « jamais ».
    return { folder, lastAt: 0, count: 0, error: `Dossier introuvable : ${(err as Error).message}` }
  }
}

/**
 * Écrit une copie, puis fait le ménage.
 *
 * La rotation passe après l'écriture, et seulement si elle a réussi : effacer
 * d'abord reviendrait à échanger sept sauvegardes contre zéro le jour où le
 * disque est plein.
 */
export async function runBackup(force: boolean): Promise<BackupStatus> {
  const folder = getPrefs().backupFolder
  if (!folder) return { folder: null, lastAt: 0, count: 0, error: null }

  try {
    await fs.mkdir(folder, { recursive: true })
    const before = await names(folder)
    const now = Date.now()

    if (!force && !isDue(before, now)) return backupStatus()

    const path = join(folder, backupName(now))
    // tmp + rename, comme le registre lui-même : une copie à moitié écrite
    // qu'on prendrait pour une bonne serait pire que pas de copie du tout.
    const tmp = `${path}.tmp`
    await fs.writeFile(tmp, JSON.stringify(snapshot()), 'utf8')
    await fs.rename(tmp, path)

    for (const name of toDelete([...before, backupName(now)])) {
      await fs.rm(join(folder, name), { force: true })
    }

    setPrefs({ backupAt: now })
    return backupStatus()
  } catch (err) {
    console.error('[backup]', err)
    return { folder, lastAt: getPrefs().backupAt, count: 0, error: `Sauvegarde impossible : ${(err as Error).message}` }
  }
}

/**
 * La copie du démarrage.
 *
 * Au démarrage et non à la fermeture : ce qui est en mémoire vient tout juste
 * d'être lu sur le disque, donc la copie porte l'état d'avant la séance. Une
 * fausse manœuvre faite ce soir laisse la sauvegarde de ce matin intacte,
 * alors qu'une copie prise à la fermeture l'aurait enregistrée aussi.
 */
export function backupOnLaunch(): void {
  if (!getPrefs().backupFolder) return
  // Détaché : personne n'attend après lui, et un partage réseau lent ne doit
  // pas retarder l'ouverture de la fenêtre.
  setTimeout(() => void runBackup(false), 4000)
}

export async function chooseBackupFolder(win: BrowserWindow): Promise<BackupStatus> {
  const res = await dialog.showOpenDialog(win, {
    title: 'Où garder les sauvegardes automatiques',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: getPrefs().backupFolder ?? undefined
  })
  if (res.canceled || !res.filePaths[0]) return backupStatus()

  setPrefs({ backupFolder: res.filePaths[0] })
  // Une première copie tout de suite : choisir un dossier et n'y rien voir
  // laisserait croire que ça n'a pas marché.
  return runBackup(true)
}

export function forgetBackupFolder(): BackupStatus {
  setPrefs({ backupFolder: null, backupAt: 0 })
  return { folder: null, lastAt: 0, count: 0, error: null }
}

export function revealBackupFolder(): void {
  const folder = getPrefs().backupFolder
  if (folder) void shell.openPath(folder)
}
