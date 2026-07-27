/**
 * Converts a TV Time / OpenTV GDPR export into an AnimeList backup file.
 *
 * The hard part is numbering: TheTVDB models a long anime as one series with
 * seasons, AniList splits it into one entry per cour. So watched episodes are
 * poured, in order, into a chain of AniList entries linked by SEQUEL relations,
 * spilling into the next entry whenever the current one fills up.
 */
import fs from 'node:fs'
import path from 'node:path'

const BASE = String.raw`C:\Users\willi\Documents\dev\animelist\DATA EXPORT\OpenTV Backup`
const OUT = process.argv[2]
if (!OUT) throw new Error('usage: node import-tvtime.mjs <out.json>')

// ------------------------------------------------------------------ csv

function parseCsv(text) {
  const rows = []
  let row = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false }
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const head = rows.shift()
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}
const read = n => parseCsv(fs.readFileSync(path.join(BASE, n), 'utf8').replace(/^\uFEFF/, ''))

// ------------------------------------------------------------------ anilist

const MEDIA_FIELDS = `
  id idMal
  title{romaji english native} synonyms
  coverImage{extraLarge large color} bannerImage
  format status episodes duration season seasonYear
  genres averageScore popularity
  studios(isMain:true){nodes{name}}
  description(asHtml:false)
  nextAiringEpisode{episode airingAt}
  trailer{id site}
  startDate{year month}
`

let last = 0
async function gql(query, variables) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const gap = Date.now() - last
    if (gap < 750) await new Promise(r => setTimeout(r, 750 - gap))
    last = Date.now()
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables })
    })
    if (res.status === 429) { await new Promise(r => setTimeout(r, (Number(res.headers.get('retry-after') || 5)) * 1000)); continue }
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const b = await res.json()
    if (b.errors) throw new Error(b.errors[0].message)
    return b.data
  }
  throw new Error('AniList rate limited')
}

const SEARCH = `query($search:String){Page(perPage:8){media(search:$search,type:ANIME,sort:SEARCH_MATCH){
  ${MEDIA_FIELDS}
  relations{edges{relationType(version:2) node{id type format episodes}}}
}}}`

const BY_ID = `query($id:Int){Media(id:$id,type:ANIME){
  ${MEDIA_FIELDS}
  relations{edges{relationType(version:2) node{id type format episodes}}}
}}`

const FRANCHISE = `query($search:String){Page(perPage:25){media(search:$search,type:ANIME,sort:START_DATE){
  ${MEDIA_FIELDS}
  relations{edges{relationType(version:2) node{id type format episodes}}}
}}}`

// ------------------------------------------------------------------ matching

/** Collapses long vowels and romanisation noise: "shippuuden" == "shippūden". */
const norm = s => (s || '').toLowerCase()
  .replace(/[āàáâ]/g, 'a').replace(/[ūùúû]/g, 'u').replace(/[ōòóô]/g, 'o')
  .replace(/[ēèéê]/g, 'e').replace(/[īìíî]/g, 'i')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/([aeiou])\1+/g, '$1')
  .trim()

function ratio(a, b) {
  if (!a.length || !b.length) return 0
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0]; prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1))
      last = tmp
    }
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length)
}

function score(needle, media) {
  const n = norm(needle)
  const names = [media.title.romaji, media.title.english, media.title.native, ...(media.synonyms || [])]
    .filter(Boolean).map(norm)
  let best = 0
  for (const name of names) {
    if (name === n) best = Math.max(best, 100)
    else if (name.startsWith(n) || n.startsWith(name)) best = Math.max(best, 84)
    else if (name.includes(n) || n.includes(name)) best = Math.max(best, 66)
    else best = Math.max(best, Math.round(ratio(n, name) * 78))
  }
  if (media.format === 'TV' || media.format === 'ONA') best += 6
  if (media.format === 'MOVIE' || media.format === 'MUSIC' || media.format === 'SPECIAL') best -= 30
  if (media.episodes === 1) best -= 12
  return best
}

/** Tries the raw name, then progressively simpler queries. */
async function findMedia(name) {
  const tries = [name]
  // AniList's search chokes on macrons ("Shippūden" never reaches "Shippuuden").
  const ascii = name.normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (ascii !== name) tries.push(ascii)
  const noSub = name.split(/[:–—]/)[0].trim()
  if (noSub && noSub !== name) tries.push(noSub)
  const noHonorific = name.replace(/-(kun|chan|san|sama)\b/gi, '').trim()
  if (noHonorific !== name) tries.push(noHonorific)

  let best = null
  for (const q of tries) {
    let data
    try { data = await gql(SEARCH, { search: q }) } catch { continue }
    for (const m of data.Page.media || []) {
      const s = score(name, m)
      if (!best || s > best.score) best = { media: m, score: s }
    }
    if (best && best.score >= 84) break
  }
  return best
}

const byId = new Map()
async function fetchById(id) {
  if (byId.has(id)) return byId.get(id)
  const data = await gql(BY_ID, { id })
  byId.set(id, data.Media)
  return data.Media
}

/** Follows SEQUEL edges, keeping only broadcast formats, to build the cour chain. */
async function buildChain(root, needed) {
  const chain = [root]
  let total = root.episodes ?? 0
  let current = root
  const seen = new Set([root.id])

  while (total < needed && chain.length < 12) {
    const next = (current.relations?.edges ?? [])
      .filter(e => e.relationType === 'SEQUEL' && e.node.type === 'ANIME')
      .filter(e => ['TV', 'ONA', 'TV_SHORT'].includes(e.node.format))
      .filter(e => !seen.has(e.node.id))
      .sort((a, b) => (b.node.episodes ?? 0) - (a.node.episodes ?? 0))[0]
    if (!next) break
    const media = await fetchById(next.node.id)
    seen.add(media.id)
    chain.push(media)
    total += media.episodes ?? 0
    current = media
  }

  // Some franchises don't expose a clean SEQUEL edge for every cour
  // (Dr. STONE, Tensei Shitara Slime…). Fall back to title-prefix siblings.
  if (total < needed) {
    const key = norm(root.title.romaji).split(' ').slice(0, 2).join(' ')
    const started = m => (m.startDate?.year ?? 0) * 100 + (m.startDate?.month ?? 0)
    let siblings = []
    try {
      const data = await gql(FRANCHISE, { search: root.title.romaji })
      siblings = (data.Page.media ?? [])
        .filter(m => !seen.has(m.id))
        .filter(m => ['TV', 'ONA', 'TV_SHORT'].includes(m.format))
        .filter(m => [m.title.romaji, m.title.english].filter(Boolean).some(t => norm(t).startsWith(key)))
        .sort((a, b) => started(a) - started(b))
    } catch { /* offline or rate limited — keep what we have */ }

    for (const media of siblings) {
      chain.push(media)
      seen.add(media.id)
      total += media.episodes ?? 0
      if (total >= needed) break
    }
  }
  return chain
}

// ------------------------------------------------------------------ mapping

const PLACEHOLDER = 'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'
const strip = t => t ? t.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim() : null

const toMedia = m => ({
  id: m.id,
  idMal: m.idMal ?? null,
  title: { romaji: m.title?.romaji ?? m.title?.english ?? `#${m.id}`, english: m.title?.english ?? null, native: m.title?.native ?? null },
  cover: { large: m.coverImage?.large ?? PLACEHOLDER, xl: m.coverImage?.extraLarge ?? m.coverImage?.large ?? PLACEHOLDER, color: m.coverImage?.color ?? null },
  banner: m.bannerImage ?? null,
  format: m.format ?? null,
  status: m.status ?? null,
  episodes: m.episodes ?? null,
  duration: m.duration ?? null,
  season: m.season ?? null,
  seasonYear: m.seasonYear ?? null,
  genres: m.genres ?? [],
  studios: m.studios?.nodes?.map(s => s.name) ?? [],
  averageScore: m.averageScore ?? null,
  popularity: m.popularity ?? 0,
  description: strip(m.description),
  nextAiring: m.nextAiringEpisode ?? null,
  trailer: m.trailer?.id && m.trailer.site === 'youtube' ? { id: m.trailer.id, site: 'youtube' } : null,
  cachedAt: Date.now()
})

const stamp = s => {
  const t = Date.parse((s || '').replace(' ', 'T'))
  return Number.isNaN(t) ? Date.now() : t
}

// ------------------------------------------------------------------ run

const shows = read('user_tv_show_data.csv')
const followed = new Map(read('followed_tv_show.csv').map(r => [r.tv_show_id, r]))
const extras = new Map(
  JSON.parse(fs.readFileSync(path.join(BASE, '_opentv_extras.json'), 'utf8')).shows.map(s => [String(s.tvdbId), s])
)
const tracks = read('tracking-prod-records-v2.csv')

// tvdbId -> season -> episode -> watched-at
const watchedBy = new Map()
for (const t of tracks) {
  const sid = t.s_id
  const s = Number(t.season_number || 0), e = Number(t.episode_number || 0)
  if (!sid || !e) continue
  if (!watchedBy.has(sid)) watchedBy.set(sid, new Map())
  const seasons = watchedBy.get(sid)
  if (!seasons.has(s)) seasons.set(s, new Map())
  seasons.get(s).set(e, stamp(t.created_at))
}

const mediaOut = new Map()
const entries = new Map()
const history = []
const report = []

for (const show of shows) {
  const sid = show.tv_show_id
  const name = show.tv_show_name
  const extra = extras.get(sid)
  const addedAt = extra?.addedAt ? stamp(extra.addedAt) : Date.now()

  // flatten watched episodes in broadcast order
  const seasons = watchedBy.get(sid) ?? new Map()
  const seasonLists = [...seasons.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, eps]) => [...eps.entries()].sort((a, b) => a[0] - b[0]).map(([, at]) => at))
  const flat = seasonLists.flat()

  const found = await findMedia(name)
  if (!found || found.score < 45) {
    report.push({ name, watched: flat.length, status: 'UNMATCHED' })
    process.stderr.write('x')
    continue
  }

  const chain = flat.length > (found.media.episodes ?? 0)
    ? await buildChain(found.media, flat.length)
    : [found.media]

  // Pour season by season: a TVDB season is usually exactly one AniList cour, so
  // an untouched slot with a matching episode count wins. Otherwise fill in order
  // and spill into the next slot (Dr. STONE's 22-episode S3 = two 11-ep entries).
  const pool = chain.map(m => ({ media: m, used: 0, cap: m.episodes ?? Infinity, ats: [] }))
  let placedCount = 0

  for (const season of seasonLists) {
    let list = season
    let idx = pool.findIndex(p => p.used === 0 && p.cap === list.length)
    if (idx === -1) idx = pool.findIndex(p => p.used < p.cap)
    while (list.length && idx !== -1) {
      const slot = pool[idx]
      const take = Math.min(slot.cap - slot.used, list.length)
      if (take <= 0) break
      for (let i = 0; i < take; i++) {
        history.push({
          animeId: slot.media.id,
          episode: slot.used + i + 1,
          at: list[i],
          minutes: slot.media.duration || 24
        })
      }
      slot.ats.push(...list.slice(0, take))
      slot.used += take
      placedCount += take
      list = list.slice(take)
      const from = idx
      idx = pool.findIndex((p, i) => i > from && p.used < p.cap)
    }
  }

  // every entry in the chain lands in the library, even the untouched tail
  for (const slot of pool) {
    const media = slot.media
    mediaOut.set(media.id, toMedia(media))
    const status = slot.used === 0
      ? 'planned'
      : media.episodes && slot.used >= media.episodes ? 'completed' : 'watching'
    entries.set(media.id, {
      animeId: media.id,
      status,
      addedAt,
      updatedAt: Date.now(),
      score: null,
      emotions: [],
      favorite: show.is_favorited === '1',
      notes: '',
      rewatches: 0,
      startedAt: slot.ats.length ? Math.min(...slot.ats) : null,
      finishedAt: status === 'completed' ? Math.max(...slot.ats) : null
    })
  }

  const placed = pool
    .filter(p => p.used > 0)
    .map(p => ({ id: p.media.id, title: p.media.title.romaji, took: p.used, of: p.media.episodes }))

  report.push({
    name,
    watched: flat.length,
    placed: placedCount,
    score: found.score,
    chain: placed,
    leftover: flat.length - placedCount,
    status: placedCount === flat.length ? 'OK' : 'PARTIAL'
  })
  process.stderr.write('.')
}
process.stderr.write('\n')

const snapshot = {
  version: 1,
  entries: [...entries.values()],
  media: [...mediaOut.values()],
  history,
  prefs: {}
}
fs.writeFileSync(OUT, JSON.stringify(snapshot, null, 2))

// ------------------------------------------------------------------ report

console.log('source'.padEnd(42), 'wtch'.padStart(5), 'plcd'.padStart(5), '  anilist chain')
for (const r of report) {
  if (r.status === 'UNMATCHED') { console.log(r.name.slice(0, 41).padEnd(42), String(r.watched).padStart(5), '  ---'.padStart(5), '  !! AUCUNE CORRESPONDANCE'); continue }
  const chain = r.chain.map(c => `${c.title.slice(0, 30)} ${c.took}/${c.of ?? '?'}`).join('  +  ')
  const warn = r.leftover ? `  << ${r.leftover} non placés` : ''
  console.log(r.name.slice(0, 41).padEnd(42), String(r.watched).padStart(5), String(r.placed).padStart(5), '  ' + chain + warn)
}
const un = report.filter(r => r.status === 'UNMATCHED')
const part = report.filter(r => r.status === 'PARTIAL')
console.log(`\nfiches AniList: ${entries.size} · épisodes placés: ${history.length} / ${report.reduce((a, r) => a + r.watched, 0)}`)
console.log(`non appariées: ${un.length}${un.length ? ' (' + un.map(r => r.name).join(', ') + ')' : ''}`)
console.log(`partielles: ${part.length}${part.length ? ' (' + part.map(r => `${r.name}: ${r.leftover}`).join(', ') + ')' : ''}`)
console.log(`écrit -> ${OUT}`)
