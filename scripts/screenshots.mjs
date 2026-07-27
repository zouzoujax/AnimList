/**
 * Generates the README screenshots.
 *
 *   npm run screenshots
 *
 * Builds a demonstration library from public AniList data, seeds it into a
 * throwaway user-data folder, then launches the app pointed at that folder with
 * `--screenshots` so it walks its own pages and captures each one.
 *
 * The real library is never read. That is deliberate: this repository is public
 * and a watch history is personal, so the screenshots show invented progress on
 * public catalogue entries.
 */

import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ENDPOINT = 'https://graphql.anilist.co'
const OUT_DIR = process.argv[2] ?? 'docs/screenshots'

/**
 * A fixed cast, so a re-run produces the same pages.
 *
 * Querying "trending" instead would make every run a different screenshot set,
 * which is useless for a README diff.
 */
const CAST = [
  154587, // Sousou no Frieren — 28 ép.
  16498, // Shingeki no Kyojin — 25 ép.
  20958, // Shingeki no Kyojin Season 2 — 12 ép.
  101922, // Kimetsu no Yaiba — 26 ép.
  113415, // Jujutsu Kaisen — 24 ép.
  127230, // Chainsaw Man — 12 ép.
  21087, // One Punch Man — 12 ép.
  9253, // Steins;Gate — 24 ép.
  5114, // Hagane no Renkinjutsushi: FULLMETAL ALCHEMIST — 64 ép.
  11061, // HUNTER×HUNTER (2011) — 148 ép.
  1535, // DEATH NOTE — 37 ép.
  21355, // Re:Zero kara Hajimeru Isekai Seikatsu — 25 ép.
  108465, // Mushoku Tensei — 11 ép.
  101348, // VINLAND SAGA — 24 ép.
  21459, // Boku no Hero Academia — 13 ép.
  20605, // Tokyo Ghoul — 12 ép.
  101921, // Kaguya-sama wa Kokurasetai — 12 ép.
  130003, // Bocchi the Rock! — 12 ép.
  140960, // SPY×FAMILY — 12 ép.
  21827, // Violet Evergarden — 13 ép.
  98460, // DEVILMAN crybaby — 10 ép., ONA
  21519, // Kimi no Na wa. — film
  20 // NARUTO — 220 ép.
]

const MEDIA_FIELDS = `
  id idMal
  title { romaji english native }
  coverImage { extraLarge large color }
  bannerImage
  format status episodes duration season seasonYear
  startDate { year month day }
  genres averageScore popularity
  studios(isMain: true) { nodes { name } }
  description(asHtml: false)
  nextAiringEpisode { episode airingAt }
  trailer { id site }
`

async function ask(query, variables) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  })
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`)
  const body = await res.json()
  if (body.errors) throw new Error(body.errors[0].message)
  return body.data
}

const fetchCast = async () =>
  (
    await ask(`query($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { ${MEDIA_FIELDS} } } }`, {
      ids: CAST
    })
  ).Page.media

/**
 * Whatever is airing right now, so the calendar and the "resume" hero have
 * something in them.
 *
 * This is the one part that cannot be a fixed list: a screenshot run six months
 * from now needs that season's shows, not this one's. The first attempt used only
 * finished series and produced a calendar reading "nothing scheduled" — an empty
 * page is a worse README than a slightly non-reproducible one.
 */
const fetchAiring = async () =>
  (
    await ask(
      `query { Page(perPage: 20) { media(status: RELEASING, type: ANIME, format: TV, sort: POPULARITY_DESC, isAdult: false) { ${MEDIA_FIELDS} } } }`,
      {}
    )
  ).Page.media
    // Long-runners are excluded: a demo library caught up on One Piece would
    // carry eleven hundred invented episodes and say nothing useful.
    .filter((m) => m.nextAiringEpisode && m.nextAiringEpisode.episode <= 40)

const PLACEHOLDER = 'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'

const strip = (t) =>
  t
    ? t
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : null

const toMedia = (m) => ({
  id: m.id,
  idMal: m.idMal ?? null,
  title: {
    romaji: m.title?.romaji ?? m.title?.english ?? `#${m.id}`,
    english: m.title?.english ?? null,
    native: m.title?.native ?? null
  },
  cover: {
    large: m.coverImage?.large ?? PLACEHOLDER,
    xl: m.coverImage?.extraLarge ?? m.coverImage?.large ?? PLACEHOLDER,
    color: m.coverImage?.color ?? null
  },
  banner: m.bannerImage ?? null,
  format: m.format ?? null,
  status: m.status ?? null,
  episodes: m.episodes ?? null,
  duration: m.duration ?? null,
  season: m.season ?? null,
  seasonYear: m.seasonYear ?? null,
  startDate: m.startDate ?? null,
  genres: m.genres ?? [],
  studios: m.studios?.nodes?.map((s) => s.name) ?? [],
  averageScore: m.averageScore ?? null,
  popularity: m.popularity ?? 0,
  description: strip(m.description),
  nextAiring: m.nextAiringEpisode ?? null,
  trailer: m.trailer?.id && m.trailer.site === 'youtube' ? { id: m.trailer.id, site: 'youtube' } : null,
  cachedAt: Date.now()
})

const DAY = 86_400_000

/** Index in the cast shown mid-rewatch; its slot must be a completed one. */
const REWATCHING = 3

/** Episodes at 20:30 local, give or take, because that is when anime is watched. */
const eveningOf = (dayOffset, slot, now) => now - dayOffset * DAY - 3 * 3600_000 + slot * 26 * 60_000

/**
 * Invents a plausible year of watching.
 *
 * Two properties the screenshots depend on:
 *
 * - **Clusters, not an even spread.** Real viewing is an episode on a weeknight
 *   and then four on a Sunday. An even spread renders the heatmap as flat grey,
 *   the streak as meaningless and the monthly chart as a straight line.
 * - **It reaches today.** Episodes are placed by counting *backwards* from a
 *   finish day, and the series still in progress finish within the last few
 *   days. Otherwise "these 7 days" reads 0 and the current streak is 0, which is
 *   what a first attempt at this produced.
 */
function inventHistory(media, rng) {
  const entries = []
  const history = []
  const now = Date.now()

  /*
   * One slot per series, so nothing repeats. `endsAt` is the day the last
   * episode was watched, counted back from today.
   *
   * The recent end is deliberately thin: only two series are active in the last
   * week. A first version reused sixteen slots across twenty-three series, which
   * piled everything onto July and claimed eighty-six episodes in seven days —
   * twelve a day, which nobody believes.
   */
  const plan = [
    { status: 'watching', share: 0.55, endsAt: 0 }, // in progress right now
    { status: 'watching', share: 0.33, endsAt: 3 },
    { status: 'completed', share: 1, endsAt: 11 },
    { status: 'completed', share: 1, endsAt: 19 }, // the rewatched one
    { status: 'completed', share: 1, endsAt: 31 },
    { status: 'watching', share: 0.5, endsAt: 44 },
    { status: 'completed', share: 1, endsAt: 58 },
    { status: 'completed', share: 1, endsAt: 72 },
    { status: 'paused', share: 0.28, endsAt: 90 },
    { status: 'completed', share: 1, endsAt: 106 },
    { status: 'completed', share: 1, endsAt: 124 },
    { status: 'dropped', share: 0.14, endsAt: 141 },
    { status: 'completed', share: 1, endsAt: 158 },
    { status: 'watching', share: 0.4, endsAt: 176 },
    { status: 'completed', share: 1, endsAt: 195 },
    { status: 'planned', share: 0, endsAt: 0 },
    { status: 'completed', share: 1, endsAt: 214 },
    { status: 'paused', share: 0.45, endsAt: 236 },
    { status: 'completed', share: 1, endsAt: 258 },
    { status: 'completed', share: 1, endsAt: 281 },
    { status: 'planned', share: 0, endsAt: 0 },
    { status: 'completed', share: 1, endsAt: 305 },
    { status: 'completed', share: 1, endsAt: 332 }
  ]

  media.forEach((m, i) => {
    const slot = plan[i % plan.length]
    const total = m.episodes ?? 12
    // Long-runners are capped: nobody watched 220 episodes of Naruto this year.
    const seen = Math.min(Math.max(0, Math.round(total * slot.share)), 42)
    const runtime = m.duration || 24

    /* Walk backwards from the finish day in binges of three to five, leaving a
       one-to-four-day gap between them. */
    const stamps = []
    let day = slot.endsAt
    let left = seen
    while (left > 0) {
      const burst = Math.min(left, 3 + Math.floor(rng() * 3))
      for (let k = 0; k < burst; k += 1) stamps.push(eveningOf(day, k, now))
      left -= burst
      day += 1 + Math.floor(rng() * 4)
    }
    stamps.sort((a, b) => a - b)

    stamps.forEach((at, index) => {
      history.push({ animeId: m.id, episode: index + 1, at, minutes: runtime })
    })

    const firstAt = stamps[0] ?? null
    let lastAt = stamps[stamps.length - 1] ?? null
    let status = seen === 0 ? 'planned' : seen >= total ? 'completed' : slot.status
    let rewatches = 0

    /* One series is mid-rewatch, so the badge and the second pass are visible.
       It has to be done properly: an entry with `rewatches: 1` and no pass-1
       events reads as zero progress, because only the current pass counts. */
    if (i === REWATCHING && seen >= total) {
      rewatches = 1
      status = 'watching'
      const again = Math.max(2, Math.round(total * 0.35))
      for (let ep = 1; ep <= again; ep += 1) {
        const at = eveningOf(Math.max(0, again - ep), (ep - 1) % 3, now)
        history.push({ animeId: m.id, episode: ep, at, minutes: runtime, pass: 1 })
        lastAt = Math.max(lastAt ?? 0, at)
      }
    }

    entries.push({
      animeId: m.id,
      status,
      addedAt: firstAt ?? now - Math.floor(rng() * 200) * DAY,
      updatedAt: lastAt ?? now,
      score: status === 'completed' || status === 'paused' ? [7, 7.5, 8, 8.5, 9, 9.5, 10][Math.floor(rng() * 7)] : null,
      emotions: seen > 0 ? [['love'], ['hype', 'cry'], ['mind'], ['laugh'], ['chill']][i % 5] : [],
      favorite: i % 4 === 0,
      notes: '',
      rewatches,
      startedAt: firstAt,
      finishedAt: status === 'completed' ? lastAt : null
    })
  })

  return { entries, history }
}

/** Deterministic PRNG, so two runs invent the same history. */
function mulberry(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Currently-airing series, caught up to a couple of episodes behind.
 *
 * Behind on purpose: an entry with everything ticked shows nothing to resume, and
 * the home page's whole point is telling you what to watch next.
 */
function followAiring(media, history, entries) {
  const now = Date.now()
  media.forEach((m, i) => {
    const aired = m.nextAiring ? Math.max(0, m.nextAiring.episode - 1) : 0
    const seen = Math.max(0, aired - (1 + (i % 2)))
    const runtime = m.duration || 24

    let firstAt = null
    let lastAt = null
    for (let ep = 1; ep <= seen; ep += 1) {
      // Weekly, as they aired, the last one a few days ago.
      const at = now - (seen - ep) * 7 * DAY - (2 + i) * DAY + 20 * 3600_000
      history.push({ animeId: m.id, episode: ep, at, minutes: runtime })
      firstAt ??= at
      lastAt = at
    }

    entries.push({
      animeId: m.id,
      status: 'watching',
      addedAt: firstAt ?? now - 30 * DAY,
      updatedAt: lastAt ?? now,
      score: null,
      emotions: [],
      favorite: i === 0,
      notes: '',
      rewatches: 0,
      startedAt: firstAt,
      finishedAt: null
    })
  })
}

async function main() {
  process.stdout.write('Récupération du casting depuis AniList…\n')
  const [raw, airingRaw] = await Promise.all([fetchCast(), fetchAiring()])
  if (!raw.length) throw new Error('AniList n’a renvoyé aucune fiche')

  // Keep the requested order: the API returns them by id.
  const byId = new Map(raw.map((m) => [m.id, m]))
  const media = CAST.map((id) => byId.get(id))
    .filter(Boolean)
    .map(toMedia)
  process.stdout.write(`${media.length} fiches sur ${CAST.length} demandées\n`)

  // Six, not four: with four, only two happened to air inside the shown week and
  // the calendar screenshot was mostly empty boxes.
  const airing = airingRaw
    .filter((m) => !byId.has(m.id))
    .slice(0, 6)
    .map(toMedia)
  process.stdout.write(`${airing.length} séries en cours de diffusion ajoutées\n`)

  const { entries, history } = inventHistory(media, mulberry(42))
  followAiring(airing, history, entries)
  media.push(...airing)

  const lists = [
    {
      id: 'demo-ete',
      name: 'À rattraper cet été',
      emoji: '☀️',
      animeIds: media.slice(5, 9).map((m) => m.id),
      createdAt: Date.now() - 40 * DAY,
      updatedAt: Date.now() - 3 * DAY
    },
    {
      id: 'demo-cultes',
      name: 'Cultes',
      emoji: '🏆',
      animeIds: media.slice(0, 4).map((m) => m.id),
      createdAt: Date.now() - 200 * DAY,
      updatedAt: Date.now() - 20 * DAY
    }
  ]

  const dir = mkdtempSync(join(tmpdir(), 'animelist-shots-'))
  await fs.writeFile(
    join(dir, 'animelist.json'),
    JSON.stringify({
      version: 5,
      media: Object.fromEntries(media.map((m) => [String(m.id), m])),
      entries: Object.fromEntries(entries.map((e) => [String(e.animeId), e])),
      history: [],
      lists,
      prefs: { titleLang: 'romaji', theme: 'nebula', layout: 'classic', accent: '#7c5cff', mica: false }
    }),
    'utf8'
  )
  await fs.writeFile(
    join(dir, 'animelist-history.jsonl'),
    history.map((h) => JSON.stringify(h)).join('\n') + '\n',
    'utf8'
  )

  process.stdout.write(`${entries.length} entrées, ${history.length} épisodes inventés\n`)
  process.stdout.write(`Bibliothèque de démonstration : ${dir}\n`)
  process.stdout.write('Lancement de la capture…\n')

  // Mica is off in the seeded prefs: a translucent window would capture whatever
  // happens to be behind it.
  const electron = join('node_modules', 'electron', 'dist', 'electron.exe')
  const child = spawn(
    electron,
    ['.', `--user-data-dir=${dir}`, `--screenshots=${OUT_DIR}`, `--shot-anime=${media[0].id}`, '--disable-gpu-vsync'],
    { stdio: 'inherit' }
  )

  child.on('exit', (code) => {
    // Synchronous on purpose: `process.exit` below would kill a pending async
    // removal, and eight runs left eight demo libraries behind in the temp dir.
    rmSync(dir, { recursive: true, force: true })
    if (code === 0) process.stdout.write(`\nÉcrit dans ${OUT_DIR}/\n`)
    process.exit(code ?? 1)
  })
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`)
  process.exit(1)
})
