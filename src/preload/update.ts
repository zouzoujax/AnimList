/**
 * Le pont de la petite fenêtre de mise à jour.
 *
 * Elle n'a besoin que de quatre choses : savoir où en est le cycle, lancer le
 * téléchargement, redémarrer, et se fermer. Lui donner le pont complet de
 * l'app reviendrait à exposer la bibliothèque entière, les réglages et les
 * fenêtres à une carte de deux cents pixels.
 *
 * Les canaux sont ceux du processus principal, déjà servis pour les réglages :
 * rien de nouveau n'est ouvert ici.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { UpdateStatus } from '@shared/types'

const api = {
  status: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:status'),
  download: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:download'),
  install: (): Promise<void> => ipcRenderer.invoke('update:install'),
  /**
   * Ferme la fenêtre. Le téléchargement, lui, continue.
   *
   * `remember` distingue « plus tard », qui vaut pour toute la version, de la
   * simple fermeture d'un aperçu — lequel n'a aucune raison de faire taire une
   * vraie mise à jour trouvée entre-temps.
   */
  dismiss: (remember: boolean): void => ipcRenderer.send('update:dismiss', remember),
  onStatus: (fn: (status: UpdateStatus) => void): (() => void) => {
    const handler = (_: unknown, status: UpdateStatus): void => fn(status)
    ipcRenderer.on('update:status', handler)
    return () => ipcRenderer.off('update:status', handler)
  }
}

contextBridge.exposeInMainWorld('updateWindow', api)

export type UpdateWindowApi = typeof api
