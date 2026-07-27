import fs from 'node:fs'
import path from 'node:path'

const BASE = String.raw`C:\Users\willi\Documents\dev\animelist\DATA EXPORT\OpenTV Backup`
const OUT = process.argv[2] || null

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

const Q = `
query($search:String){
  Page(perPage:6){
    media(search:$search, type:ANIME, sort:SEARCH_MATCH){
      id episodes format status seasonYear
      title{romaji english native} synonyms
      relations{edges{relationType(version:2) node{id type format episodes title{romaji english}}}}
    }
  }
}`

let last = 0
async function gql(variables) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const gap = Date.now() - last
    if (gap < 750) await new Promise(r => setTimeout(r, 750 - gap))
    last = Date.now()
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: Q, variables })
    })
    if (res.status === 429) { await new Promise(r => setTimeout(r, (Number(res.headers.get('retry-after') || 5)) * 1000)); continue }
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const b = await res.json()
    if (b.errors) throw new Error(b.errors[0].message)
    return b.data
  }
  throw new Error('rate limited')
}

// ------------------------------------------------------------------ scoring

const norm = s => (s || '').toLowerCase()
  .replace(/[āàá]/g, 'a').replace(/[ūùú]/g, 'u').replace(/[ōòó]/g, 'o').replace(/[ēèé]/g, 'e').replace(/[īìí]/g, 'i')
  .replace(/[^a-z0-9]+/g, ' ').trim()

function score(needle, media) {
  const n = norm(needle)
  const names = [media.title.romaji, media.title.english, media.title.native, ...(media.synonyms || [])].filter(Boolean).map(norm)
  let best = 0
  for (const name of names) {
    if (name === n) best = Math.max(best, 100)
    else if (name.startsWith(n) || n.startsWith(name)) best = Math.max(best, 80)
    else if (name.includes(n) || n.includes(name)) best = Math.max(best, 62)
    else {
      const a = new Set(n.split(' ')), b = new Set(name.split(' '))
      const inter = [...a].filter(w => b.has(w)).length
      best = Math.max(best, Math.round((inter / Math.max(a.size, b.size)) * 55))
    }
  }
  if (media.format === 'TV') best += 6
  if (media.format === 'MOVIE' || media.format === 'MUSIC') best -= 25
  return best
}

// ------------------------------------------------------------------ main

const shows = read('user_tv_show_data.csv')
const tracks = read('tracking-prod-records-v2.csv')

const per = new Map()
for (const t of tracks) {
  const sid = t.s_id
  const s = Number(t.season_number || 0), e = Number(t.episode_number || 0)
  if (!sid || !e) continue
  if (!per.has(sid)) per.set(sid, new Map())
  const seasons = per.get(sid)
  if (!seasons.has(s)) seasons.set(s, new Map())
  seasons.get(s).set(e, t.created_at)
}

const report = []
for (const show of shows) {
  const sid = show.tv_show_id
  const seasons = per.get(sid)
  const totals = seasons ? [...seasons.entries()].sort((a, b) => a[0] - b[0]).map(([s, m]) => ({ season: s, count: m.size })) : []
  const watched = totals.reduce((a, b) => a + b.count, 0)

  let data
  try { data = await gql({ search: show.tv_show_name }) }
  catch (err) { report.push({ name: show.tv_show_name, error: err.message, watched, totals }); continue }

  const candidates = (data.Page.media || []).map(m => ({ m, s: score(show.tv_show_name, m) })).sort((a, b) => b.s - a.s)
  const top = candidates[0]
  if (!top || top.s < 40) { report.push({ name: show.tv_show_name, error: 'no match', watched, totals }); continue }

  const m = top.m
  const needsSplit = watched > 0 && m.episodes !== null && watched > m.episodes
  const sequels = (m.relations?.edges || [])
    .filter(e => e.relationType === 'SEQUEL' && e.node.type === 'ANIME')
    .map(e => ({ id: e.node.id, title: e.node.title.romaji, episodes: e.node.episodes }))

  report.push({
    name: show.tv_show_name,
    watched,
    totals,
    match: { id: m.id, title: m.title.romaji, english: m.title.english, episodes: m.episodes, format: m.format, year: m.seasonYear },
    confidence: top.s,
    needsSplit,
    sequels
  })
  process.stderr.write('.')
}
process.stderr.write('\n')

if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2))

console.log('name'.padEnd(46), 'wtch'.padStart(5), 'conf'.padStart(5), 'eps'.padStart(5), '  anilist match')
for (const r of report) {
  if (r.error) { console.log(r.name.slice(0, 45).padEnd(46), String(r.watched).padStart(5), '  !!!'.padStart(5), ''.padStart(5), '  <' + r.error + '>'); continue }
  const flag = r.needsSplit ? ' SPLIT>' + r.sequels.length : (r.confidence < 70 ? ' ?' : '')
  console.log(
    r.name.slice(0, 45).padEnd(46),
    String(r.watched).padStart(5),
    String(r.confidence).padStart(5),
    String(r.match.episodes ?? '?').padStart(5),
    '  ' + r.match.title.slice(0, 44) + flag
  )
}
const bad = report.filter(r => r.error || r.confidence < 70).length
const split = report.filter(r => r.needsSplit).length
console.log(`\n${report.length} shows · ${bad} low-confidence/unmatched · ${split} need season splitting`)
