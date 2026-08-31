/**
 * Publishes the built installer to GitHub Releases.
 *
 * `electron-builder --publish always` uploads its three artifacts in parallel,
 * and each one, finding no release for the tag, creates it. Twice in a row that
 * race produced two releases sharing a tag: the blockmap on one, the installer
 * and `latest.yml` on the other. Only the release that owns the tag answers
 * `/releases/download/<tag>/…`, so the update manifest came back 404 and every
 * installed app kept reporting that it was already up to date.
 *
 * So: one release, created once, then three uploads in sequence. Slower by a few
 * seconds, and impossible to split.
 *
 * Usage: GH_TOKEN=… node scripts/publish-release.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { version } = require('../package.json')

const OWNER = 'zouzoujax'
const REPO = 'AnimList'
const TAG = `v${version}`
const DIR = path.join(process.cwd(), 'release')
const ASSETS = [`AnimeList-${version}-setup.exe`, `AnimeList-${version}-setup.exe.blockmap`, 'latest.yml']

const token = process.env.GH_TOKEN
if (!token) {
  console.error('GH_TOKEN manquant. $env:GH_TOKEN="…" avant de lancer.')
  process.exit(1)
}

const headers = { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }
const api = `https://api.github.com/repos/${OWNER}/${REPO}`

async function json(url, init) {
  const res = await fetch(url, { ...init, headers: { ...headers, ...init?.headers } })
  const body = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${init?.method ?? 'GET'} ${url}\n${body}`)
  return body ? JSON.parse(body) : null
}

/** The three files must describe each other, or the update fails after the download. */
function checkArtifacts() {
  for (const name of ASSETS) {
    const file = path.join(DIR, name)
    if (!fs.existsSync(file)) throw new Error(`${name} absent de release/ — lancer \`npm run dist\` d'abord`)
  }
  const manifest = fs.readFileSync(path.join(DIR, 'latest.yml'), 'utf8')
  const declared = Number(manifest.match(/size: (\d+)/)?.[1])
  const actual = fs.statSync(path.join(DIR, `AnimeList-${version}-setup.exe`)).size
  if (declared !== actual) {
    throw new Error(
      `latest.yml décrit ${declared} octets, l'installeur en fait ${actual}.\n` +
        'Deux builds se sont mélangés dans release/ : vider le dossier et refaire `npm run dist`.'
    )
  }
  if (!manifest.includes(`version: ${version}`)) throw new Error(`latest.yml n'annonce pas la version ${version}`)
  console.log(`Trois fichiers cohérents, installeur de ${actual.toLocaleString('fr-FR')} octets.`)
}

/** Reuses the release when the tag already has one, so a retry is harmless. */
async function release() {
  const sharing = await json(`${api}/releases`).then((all) => all.filter((r) => r.tag_name === TAG))
  // Le désordre laissé par les publications précédentes : deux releases sur un
  // même tag, dont une seule répond aux URLs de téléchargement. Rien à réparer
  // en devinant laquelle garder — il faut choisir, et c'est un geste destructif.
  if (sharing.length > 1) {
    throw new Error(
      `${sharing.length} releases partagent le tag ${TAG} (ids ${sharing.map((r) => r.id).join(', ')}).\n` +
        'Une seule répond aux URLs /releases/download/<tag>/… Supprimer les deux, puis relancer :\n' +
        sharing.map((r) => `  gh api -X DELETE repos/${OWNER}/${REPO}/releases/${r.id}`).join('\n')
    )
  }
  const [existing] = sharing
  if (existing) {
    console.log(`Release ${TAG} déjà là (id ${existing.id}).`)
    return existing
  }
  const created = await json(`${api}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_name: TAG, name: `AnimeList ${version}` })
  })
  console.log(`Release ${TAG} créée (id ${created.id}).`)
  return created
}

async function upload(rel, name) {
  const already = rel.assets?.find((a) => a.name === name)
  if (already) {
    await fetch(`${api}/releases/assets/${already.id}`, { method: 'DELETE', headers })
    console.log(`  ${name} : ancienne version retirée`)
  }
  const body = fs.readFileSync(path.join(DIR, name))
  const url = `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/octet-stream' },
    body
  })
  if (!res.ok) throw new Error(`${res.status} en envoyant ${name}\n${await res.text()}`)
  console.log(`  ${name} envoyé`)
}

checkArtifacts()
const rel = await release()
// En série, jamais en parallèle : c'est tout l'intérêt de ce script.
for (const name of ASSETS) await upload(rel, name)

const probe = await fetch(`https://github.com/${OWNER}/${REPO}/releases/download/${TAG}/latest.yml`)
console.log(
  probe.ok
    ? `\nlatest.yml atteignable par le tag — l'app installée trouvera la ${version}.`
    : `\nAttention : latest.yml répond ${probe.status} par l'URL du tag. Une release en double traîne peut-être.`
)
