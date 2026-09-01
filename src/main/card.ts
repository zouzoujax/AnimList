/**
 * Enregistre une portion de la fenêtre en image.
 *
 * `capturePage` plutôt qu'un rendu séparé : la carte est déjà dessinée à
 * l'écran, avec les polices, le thème et l'accent de l'utilisateur. La
 * redessiner ailleurs pour l'exporter reviendrait à maintenir deux fois la même
 * mise en page, et à les voir diverger.
 *
 * La contrepartie est que la zone doit être visible : la fenêtre capture ce
 * qu'elle affiche, pas ce qu'elle contient. C'est à l'appelant de l'amener à
 * l'écran avant de demander.
 */

import { BrowserWindow, dialog } from 'electron'
import { promises as fs } from 'node:fs'
import { basename } from 'node:path'

export interface CardRect {
  x: number
  y: number
  width: number
  height: number
}

export async function saveCard(rect: CardRect, name: string): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!win) return null

  // Des pixels entiers : une zone à virgule est refusée sans un mot.
  const box = {
    x: Math.max(0, Math.round(rect.x)),
    y: Math.max(0, Math.round(rect.y)),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height))
  }

  const image = await win.webContents.capturePage(box)
  if (image.isEmpty()) return null

  const res = await dialog.showSaveDialog(win, {
    title: 'Enregistrer l’image',
    defaultPath: name,
    filters: [{ name: 'Image PNG', extensions: ['png'] }]
  })
  if (res.canceled || !res.filePath) return null

  await fs.writeFile(res.filePath, image.toPNG())
  return basename(res.filePath)
}
