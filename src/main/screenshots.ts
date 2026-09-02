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
  /**
   * Scroll until this element is at the top instead of guessing an offset.
   * A section whose distance from the top depends on how much data sits above
   * it cannot be reached by a fixed number.
   */
  scrollTo?: string
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
    // « Pour toi » passe par la file d'arrière-plan : plusieurs requêtes
    // espacées, et la rangée n'apparaît qu'une fois le vivier constitué.
    { name: 'decouvrir', route: { name: 'discover' }, settleMs: 7000 },
    { name: 'calendrier', route: { name: 'calendar' }, settleMs: 2200 },
    { name: 'statistiques', route: { name: 'stats' }, settleMs: 1600 },
    // The badge wall sits under every chart, so its offset moves with the data.
    { name: 'badges', route: { name: 'stats' }, settleMs: 1600, scrollTo: '#badges' },
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
/**
 * Au-delà, on tire quand même : une page qui n'arrive jamais doit se voir.
 *
 * Généreux, parce qu'une prise de vue complète demande beaucoup à AniList en
 * peu de temps — vingt-trois fiches, la saison, les recommandations — et qu'une
 * limitation de débit fait attendre jusqu'à une minute avant de réessayer.
 */
const MAX_WAIT_MS = 75_000
const POLL_MS = 500

/**
 * Attend qu'il ne reste plus rien en train de charger.
 *
 * Les délais fixes sont un pari sur la vitesse du réseau, et le pari se perd :
 * une capture du calendrier est partie en dépôt avec « Récupération de la
 * grille… » en plein milieu, parce que deux mille deux cents millisecondes ont
 * suffi dix fois et pas la onzième.
 *
 * On regarde donc la page elle-même. Tant qu'un indicateur de chargement y est,
 * on repasse ; passé vingt secondes, on tire quand même — une page qui n'arrive
 * jamais est une information, et un script qui ne rend pas la main n'en est pas
 * une.
 */
async function settled(win: BrowserWindow): Promise<void> {
  const busy = `(() => {
    if (document.querySelector('[data-loading], .animate-spin')) return true
    // Les libellés d'attente de l'app, au cas où l'indicateur change de forme.
    return /Chargement|Récupération/.test(document.getElementById('contenu')?.innerText ?? '')
  })()`

  for (let waited = 0; waited < MAX_WAIT_MS; waited += POLL_MS) {
    const loading = (await win.webContents.executeJavaScript(busy).catch(() => false)) as boolean
    if (!loading) return
    await sleep(POLL_MS)
  }
  console.warn('  (toujours en chargement, capture quand même)')
}

export async function captureAll(win: BrowserWindow, outDir: string, plan: ShotPlan[]): Promise<void> {
  const dir = join(app.getAppPath(), outDir)
  await fs.mkdir(dir, { recursive: true })

  // The first paint is not the first useful paint: the library snapshot, the
  // theme and the initial AniList rows all land after it.
  await sleep(4000)

  for (const shot of plan) {
    win.webContents.send('nav:goto', shot.route)
    await sleep(shot.settleMs ?? 1200)
    await settled(win)

    if (shot.scrollY !== undefined || shot.scrollTo) {
      // The scroller is the <main> element, not the document.
      const target = shot.scrollTo
        ? `(() => { const el = document.querySelector(${JSON.stringify(shot.scrollTo)}); const box = document.getElementById('contenu'); if (!el || !box) return; box.scrollTo({ top: box.scrollTop + el.getBoundingClientRect().top - 76 }) })()`
        : `document.getElementById('contenu')?.scrollTo({ top: ${shot.scrollY} })`
      await win.webContents.executeJavaScript(`${target}; void 0`)
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
