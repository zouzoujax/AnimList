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
import { freshName, isDue, listBackups, toDelete } from '@shared/backups'
import { isSnapshot, mergeSnapshot, previewRestore, type RestoreMode, type RestorePreview } from '@shared/restore'
import type { BackupCopy, BackupStatus, Snapshot } from '@shared/types'
import { getPrefs, importSnapshot, libraryState, setPrefs, snapshot } from './store'

/** Le nom de la dernière copie écrite, pour que la restauration puisse le citer. */
let lastWritten: string | null = null

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

    const name = freshName(before, now)
    const path = join(folder, name)
    // tmp + rename, comme le registre lui-même : une copie à moitié écrite
    // qu'on prendrait pour une bonne serait pire que pas de copie du tout.
    const tmp = `${path}.tmp`
    await fs.writeFile(tmp, JSON.stringify(snapshot()), 'utf8')
    await fs.rename(tmp, path)

    for (const old of toDelete([...before, name])) {
      await fs.rm(join(folder, old), { force: true })
    }

    setPrefs({ backupAt: now })
    lastWritten = name
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

// ---------------------------------------------------------------- restauration

/** Les copies du dossier, de la plus récente à la plus ancienne. */
export async function backupCopies(): Promise<BackupCopy[]> {
  const folder = getPrefs().backupFolder
  if (!folder) return []
  try {
    const found = listBackups(await names(folder))
    return await Promise.all(
      found.map(async (stamp) => {
        const bytes = await fs
          .stat(join(folder, stamp.name))
          .then((st) => st.size)
          .catch(() => 0)
        return { name: stamp.name, at: stamp.at, bytes }
      })
    )
  } catch {
    return []
  }
}

/**
 * Relit une copie, désignée par son nom.
 *
 * Le nom doit être l'un de ceux que le dossier contient et que la règle de
 * nommage reconnaît : c'est la fenêtre qui l'envoie, et un « ../ » glissé là
 * ferait lire n'importe quel fichier du disque.
 */
async function readCopy(name: string): Promise<Snapshot> {
  const folder = getPrefs().backupFolder
  if (!folder) throw new Error('Aucun dossier de sauvegarde choisi.')
  const known = listBackups(await names(folder)).some((s) => s.name === name)
  if (!known) throw new Error('Cette copie n’existe plus dans le dossier.')

  const parsed: unknown = JSON.parse(await fs.readFile(join(folder, name), 'utf8'))
  if (!isSnapshot(parsed)) throw new Error('Ce fichier n’a pas la forme d’une sauvegarde.')
  return parsed
}

/** Ce que la restauration changerait, sans rien changer. */
export async function previewCopy(
  name: string,
  mode: RestoreMode
): Promise<{ ok: true; preview: RestorePreview } | { ok: false; error: string }> {
  try {
    const incoming = await readCopy(name)
    const before = libraryState()
    return { ok: true, preview: previewRestore(before, mergeSnapshot(before, incoming, mode), mode) }
  } catch (err) {
    return { ok: false, error: `Copie illisible : ${(err as Error).message}` }
  }
}

/**
 * Restaure une copie du dossier.
 *
 * Une copie de l'état actuel est écrite d'abord : restaurer la mauvaise date
 * doit se défaire comme on l'a fait, en choisissant une copie dans la même
 * liste. Deux copies de la même minute ne partagent jamais un nom
 * (`freshName`) : la copie de sécurité n'écrase pas celle qu'on restaure.
 */
export async function restoreCopy(
  name: string,
  mode: RestoreMode
): Promise<{ ok: boolean; message: string; safety: string | null }> {
  let incoming: Snapshot
  try {
    incoming = await readCopy(name)
  } catch (err) {
    return { ok: false, message: `Copie illisible : ${(err as Error).message}`, safety: null }
  }

  lastWritten = null
  const before = await runBackup(true)
  if (before.error || !lastWritten) {
    // Sans filet, on ne saute pas : l'état actuel serait perdu pour de bon.
    return {
      ok: false,
      message: `Restauration annulée : ${before.error ?? 'copie de sécurité non écrite'}`,
      safety: null
    }
  }

  importSnapshot(incoming, mode)
  return {
    ok: true,
    message: mode === 'replace' ? 'Bibliothèque remplacée par la copie.' : 'Copie fusionnée dans la bibliothèque.',
    safety: lastWritten
  }
}
