/**
 * Stands in for the `electron` module under test. Only `app.getPath` (and, for
 * the AniList client, an empty `BrowserWindow` list) is used by the code under
 * test; `getPath` points at a throwaway directory so the real user
 * data is never touched.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'animelist-test-'))

export const app = {
  getPath: (): string => dir,
  getVersion: (): string => '0.0.0-test'
}

/** Aucune fenêtre : ce qu'on diffuse aux fenêtres part dans le vide. */
export const BrowserWindow = {
  getAllWindows: (): never[] => []
}
