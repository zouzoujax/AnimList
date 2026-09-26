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
import { THEMES, accentFor, type ThemeId } from '@shared/types'
import { setPrefs } from './store'

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
  click?: string | string[]
  /** Attente après chaque clic. Six secondes par défaut, pour la bande-annonce. */
  clickWaitMs?: number
  /** Script lancé juste avant la prise, pour réveiller un habillage qui se cache. */
  beforeShot?: string
}

/** Réveille l'habillage : sans souris, Cinéma et Épure se cachent au bout de deux secondes. */
const WAKE = "window.dispatchEvent(new MouseEvent('mousemove'))"

/**
 * Le lecteur de manga, sur les tomes inventés de la démonstration. Les prises
 * s'enchaînent : chacune part de l'habillage laissé par la précédente, d'où
 * l'ordre des clics — un sélecteur absent est simplement sauté.
 */
function readerShots(): ShotPlan[] {
  const base = { route: { name: 'manga', tab: 'local' }, settleMs: 800, clickWaitMs: 1300 }
  return [
    {
      ...base,
      name: 'lecteur-cinema',
      click: ['[data-shot="resume"]', '[data-menu]', '[data-skin="cinema"]', '[data-mode="single"]'],
      beforeShot: WAKE
    },
    { ...base, name: 'lecteur-cinema-nu', settleMs: 3400 },
    { ...base, name: 'lecteur-livre', click: ['[data-skin="livre"]', '[data-mode="double"]'] },
    { ...base, name: 'lecteur-epure', click: ['[data-mode="single"]', '[data-skin="epure"]'], beforeShot: WAKE },
    { ...base, name: 'lecteur-epure-menu', click: ['[data-menu]'] },
    { ...base, name: 'lecteur-defilement', click: ['[data-skin="cinema"]', '[data-mode="scroll"]'], beforeShot: WAKE }
  ]
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export function screenshotRun(): { outDir: string; plan: ShotPlan[]; themes: ThemeId[] } | null {
  const flag = process.argv.find((a) => a.startsWith('--screenshots'))
  if (!flag) return null

  const outDir = flag.includes('=') ? flag.slice(flag.indexOf('=') + 1) : 'docs/screenshots'
  const animeId = Number(process.argv.find((a) => a.startsWith('--shot-anime='))?.split('=')[1]) || 0

  const plan: ShotPlan[] = [
    { name: 'accueil', route: { name: 'home' }, settleMs: 1400 },
    // La semaine et les tendances vivent sous la file, dont la hauteur suit la bibliothèque.
    { name: 'accueil-bas', route: { name: 'home' }, settleMs: 1400, scrollTo: '#semaine' },
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
    // Le tri de la saison interroge AniList sur toute la saison, en deux ou
    // trois pages : il lui faut plus de temps que les autres.
    { name: 'saison', route: { name: 'season' }, settleMs: 6000 },
    { name: 'manga', route: { name: 'manga', tab: 'catalogue' }, settleMs: 2000 },
    { name: 'mangas', route: { name: 'manga', tab: 'local' }, settleMs: 1500 },
    ...readerShots(),
    // Les expériences ont leur propre page de badges ; ailleurs, la route
    // retombe sur les Statistiques.
    { name: 'mur-badges', route: { name: 'badges' }, settleMs: 1600 },
    { name: 'statistiques', route: { name: 'stats' }, settleMs: 1600 },
    // The badge wall sits under every chart, so its offset moves with the data.
    { name: 'badges', route: { name: 'stats' }, settleMs: 1600, scrollTo: '#badges' },
    // Pas de réseau : la page ne lit que l'historique local, elle est prête tout de suite.
    { name: 'journal', route: { name: 'journal' }, settleMs: 900 },
    { name: 'reglages', route: { name: 'settings' }, settleMs: 1000 },
    // Les interrupteurs et les lignes : le haut de la page n'est fait que de
    // vignettes de thèmes, qui ne disent rien de la forme des réglages.
    { name: 'reglages-bas', route: { name: 'settings' }, settleMs: 1000, scrollTo: '#reglages-lecture' }
  ]

  // `--shot-only=accueil,fiche` : quelques pages seulement, pour juger un thème
  // sans refaire les dix captures.
  const only = process.argv
    .find((a) => a.startsWith('--shot-only='))
    ?.split('=')[1]
    ?.split(',')

  // `--shot-themes=indigo,oled` ou `--shot-themes=all` : plusieurs thèmes,
  // tous photographiés dans le même lancement.
  const wanted = process.argv
    .find((a) => a.startsWith('--shot-themes='))
    ?.split('=')[1]
    ?.split(',')
  const themes = wanted ? THEMES.filter((t) => wanted.includes('all') || wanted.includes(t.id)).map((t) => t.id) : []

  return { outDir, plan: only ? plan.filter((shot) => only.includes(shot.name)) : plan, themes }
}

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

/**
 * Walks the plan, writing one JPEG per entry into `dir`.
 *
 * Waits are deliberate and generous: covers come off the network on a
 * rate-limited queue, and a chart that has not finished laying out photographs
 * as an empty box.
 */
async function walk(win: BrowserWindow, dir: string, plan: ShotPlan[]): Promise<void> {
  await fs.mkdir(dir, { recursive: true })

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

    for (const selector of shot.click === undefined ? [] : [shot.click].flat()) {
      const clicked = (await win.webContents.executeJavaScript(
        `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true })()`
      )) as boolean
      if (!clicked) process.stdout.write(`  (rien à cliquer pour ${shot.name} : ${selector})\n`)
      // The player has to fetch and start.
      await sleep(shot.clickWaitMs ?? 6000)
    }

    if (shot.beforeShot) {
      await win.webContents.executeJavaScript(`${shot.beforeShot}; void 0`)
      await sleep(400)
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
}

export async function captureAll(
  win: BrowserWindow,
  outDir: string,
  plan: ShotPlan[],
  themes: ThemeId[] = []
): Promise<void> {
  const dir = join(app.getAppPath(), outDir)

  // The first paint is not the first useful paint: the library snapshot, the
  // theme and the initial AniList rows all land after it.
  await sleep(4000)

  if (!themes.length) {
    await walk(win, dir, plan)
    app.exit(0)
    return
  }

  /*
   * Un seul lancement pour tous les thèmes : relancer l'app quinze fois referait
   * quinze fois les requêtes AniList, et la limite est tombée à trente par
   * minute. On change le réglage puis on recharge la page — le processus
   * principal garde ses caches, seul l'habillage repart de zéro.
   *
   * Rangement : `<dossier>/<rang>-<thème>/`, dans l'ordre des Réglages.
   */
  for (const id of themes) {
    const theme = THEMES.find((t) => t.id === id) ?? THEMES[0]
    // Comme un clic dans les Réglages : le thème arrive avec sa couleur.
    setPrefs({ theme: id, accent: accentFor(id) })
    win.setBackgroundColor(theme.titlebar.color)
    const reloaded = new Promise<void>((resolve) => win.webContents.once('did-finish-load', () => resolve()))
    win.webContents.reload()
    await reloaded
    await sleep(3500)

    const rank = THEMES.indexOf(theme) + 1
    process.stdout.write(`\n${theme.name}\n`)
    await walk(win, join(dir, `${String(rank).padStart(2, '0')}-${theme.id}`), plan)
  }

  app.exit(0)
}
