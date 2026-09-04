/**
 * Le pont de la petite carte de mise à jour.
 *
 * Elle n'a besoin que de trois choses : savoir où en est le cycle, en suivre
 * les changements, et se fermer. Rien à déclencher — la décision a été prise
 * dans les réglages, et la carte ne porte aucun bouton. Lui donner le pont
 * complet de l'app reviendrait à exposer la bibliothèque entière, les réglages
 * et les fenêtres à une carte de cent pixels de haut.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { UpdateStatus } from '@shared/types'

const api = {
  status: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:status'),
  /** Se ferme elle-même : plus rien à suivre, ou tout est dit. */
  close: (): void => ipcRenderer.send('update:close'),
  onStatus: (fn: (status: UpdateStatus) => void): (() => void) => {
    const handler = (_: unknown, status: UpdateStatus): void => fn(status)
    ipcRenderer.on('update:status', handler)
    return () => ipcRenderer.off('update:status', handler)
  }
}

contextBridge.exposeInMainWorld('updateWindow', api)

export type UpdateWindowApi = typeof api
