/**
 * Screenshot run, for the README.
 *
 * Inert unless the app is launched with `--screenshots`, which only
 * `scripts/screenshots.mjs` does. That script also points `--user-data-dir` at a
 * throwaway folder seeded with a demonstration library, so a capture can never
 * read or touch the real one.
 *
 * `webContents.capturePage()` rather than a system screenshot: the capture has
 * to walk the app page by page, and only the app itself can do the navigating.
 * A screen grab would also drag in the taskbar and whatever is behind the
 * window.
 */

import { BrowserWindow, app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

export interface ShotPlan {
  /** File name without extension. */
  name: string
  /** Route handed to `nav:goto`. */
  route: unknown
  /** Extra wait for covers and charts to settle, in milliseconds. */
  settleMs?: number
  /** Scroll offset inside the page, for content below the fold. */
  scrollY?: number
  /** CSS selector to click before capturing, for states behind an interaction. */
  click?: string
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export function screenshotRun(): { outDir: string; plan: ShotPlan[] } | null {
  const flag = process.argv.find((a) => a.startsWith('--screenshots'))
  if (!flag) return null

  const outDir = flag.includes('=') ? flag.slice(flag.indexOf('=') + 1) : 'docs/screenshots'
  const animeId = Number(process.argv.find((a) => a.startsWith('--shot-anime='))?.split('=')[1]) || 0

  const plan: ShotPlan[] = [
    { name: 'accueil', route: { name: 'home' }, settleMs: 1400 },
    { name: 'bibliotheque', route: { name: 'library' }, settleMs: 1200 },
    { name: 'fiche', route: { name: 'anime', id: animeId }, settleMs: 2600 },
    // The trailer only loads once asked, so the shot has to press play.
    {
      name: 'bande-annonce',
      route: { name: 'anime', id: animeId },
      settleMs: 1200,
      scrollY: 520,
      click: '[aria-label^="Lire la bande-annonce"]'
    },
    // The episode grid is the app's central interaction and lives below the fold.
    { name: 'episodes', route: { name: 'anime', id: animeId }, settleMs: 1600, scrollY: 1180 },
    { name: 'decouvrir', route: { name: 'discover' }, settleMs: 2600 },
    { name: 'calendrier', route: { name: 'calendar' }, settleMs: 2200 },
    { name: 'statistiques', route: { name: 'stats' }, settleMs: 1600 },
    { name: 'reglages', route: { name: 'settings' }, settleMs: 1000 }
  ]

  return { outDir, plan }
}

/**
 * Walks the plan, writing one PNG per entry, then quits.
 *
 * Waits are deliberate and generous: covers come off the network on a
 * rate-limited queue, and a chart that has not finished laying out photographs
 * as an empty box.
 */
export async function captureAll(win: BrowserWindow, outDir: string, plan: ShotPlan[]): Promise<void> {
  const dir = join(app.getAppPath(), outDir)
  await fs.mkdir(dir, { recursive: true })

  // The first paint is not the first useful paint: the library snapshot, the
  // theme and the initial AniList rows all land after it.
  await sleep(4000)

  for (const shot of plan) {
    win.webContents.send('nav:goto', shot.route)
    await sleep(shot.settleMs ?? 1200)

    if (shot.scrollY) {
      // The scroller is the <main> element, not the document.
      await win.webContents.executeJavaScript(
        `document.getElementById('contenu')?.scrollTo({ top: ${shot.scrollY} }); void 0`
      )
      // Long enough for the scroll-triggered entrance animations to finish.
      await sleep(900)
    }

    if (shot.click) {
      const clicked = (await win.webContents.executeJavaScript(
        `(() => { const el = document.querySelector(${JSON.stringify(shot.click)}); if (!el) return false; el.click(); return true })()`
      )) as boolean
      if (!clicked) process.stdout.write(`  (rien à cliquer pour ${shot.name})\n`)
      // The player has to fetch and start.
      await sleep(6000)
    }

    const image = await win.webContents.capturePage()
    /* JPEG, not PNG: these frames are mostly cover art, which PNG stores badly —
       the same eight pages came to 8.7 MB as PNG against roughly 1 MB here, and
       every re-run would add that to the repository's history. Quality 92 keeps
       the interface text clean. */
    const file = join(dir, `${shot.name}.jpg`)
    await fs.writeFile(file, image.toJPEG(92))
    process.stdout.write(`${shot.name}.jpg\n`)
  }

  app.exit(0)
}
