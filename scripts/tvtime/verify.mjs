import fs from 'node:fs'

const snap = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const media = new Map(snap.media.map(m => [m.id, m]))

let problems = 0
const fail = msg => { console.log('  FAIL ' + msg); problems++ }

// 1. referential integrity
for (const e of snap.entries) if (!media.has(e.animeId)) fail(`entry ${e.animeId} has no media`)
for (const h of snap.history) if (!media.has(h.animeId)) fail(`history ${h.animeId} has no media`)

// 2. no duplicate episodes, none beyond the known episode count
const seen = new Set()
const perAnime = new Map()
for (const h of snap.history) {
  const k = `${h.animeId}:${h.episode}`
  if (seen.has(k)) fail(`duplicate ${k}`)
  seen.add(k)
  perAnime.set(h.animeId, (perAnime.get(h.animeId) ?? 0) + 1)
  if (h.episode < 1) fail(`episode ${h.episode} < 1 on ${h.animeId}`)
  const cap = media.get(h.animeId)?.episodes
  if (cap && h.episode > cap) fail(`${media.get(h.animeId).title.romaji}: ep ${h.episode} > ${cap}`)
}

// 3. status consistency
for (const e of snap.entries) {
  const count = perAnime.get(e.animeId) ?? 0
  const total = media.get(e.animeId)?.episodes
  const expect = count === 0 ? 'planned' : (total && count >= total ? 'completed' : 'watching')
  if (e.status !== expect) fail(`${media.get(e.animeId)?.title.romaji}: status ${e.status} but ${count}/${total}`)
}

// 4. timestamps plausible
const ats = snap.history.map(h => h.at)
const bad = ats.filter(t => !Number.isFinite(t) || t < Date.parse('2010-01-01') || t > Date.now() + 86400000)
if (bad.length) fail(`${bad.length} implausible timestamps`)

const minutes = snap.history.reduce((a, h) => a + h.minutes, 0)
console.log(`entries=${snap.entries.length}  media=${snap.media.length}  history=${snap.history.length}`)
console.log(`terminés=${snap.entries.filter(e => e.status === 'completed').length}  en cours=${snap.entries.filter(e => e.status === 'watching').length}  à voir=${snap.entries.filter(e => e.status === 'planned').length}`)
console.log(`temps total=${Math.round(minutes / 60)} h  (${(minutes / 1440).toFixed(1)} jours)`)
console.log(`fenêtre=${new Date(Math.min(...ats)).toISOString().slice(0, 10)} -> ${new Date(Math.max(...ats)).toISOString().slice(0, 10)}`)

const top = [...perAnime.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
console.log('top:', top.map(([id, n]) => `${media.get(id).title.romaji}=${n}`).join(', '))
console.log(problems ? `\n${problems} PROBLÈMES` : '\nTous les contrôles passent.')
process.exit(problems ? 1 : 0)
