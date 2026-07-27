/**
 * Electron's own postinstall does `require('@electron/get')`, which is now an
 * ES module. On Node < 20.19 that throws ERR_REQUIRE_ESM and the binary silently
 * never lands, leaving `electron-vite dev/preview` with "Error: Electron uninstall".
 *
 * This script does the same work through dynamic import, so it runs on any
 * supported Node. It is a no-op once the binary is in place.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

let electronDir
try {
  electronDir = path.dirname(require.resolve('electron/package.json'))
} catch {
  console.log('[electron] package not installed — nothing to do')
  process.exit(0)
}

const { version } = require(path.join(electronDir, 'package.json'))

function platformPath() {
  const platform = process.env.npm_config_platform || os.platform()
  switch (platform) {
    case 'mas':
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron'
    case 'freebsd':
    case 'openbsd':
    case 'linux':
      return 'electron'
    case 'win32':
      return 'electron.exe'
    default:
      throw new Error(`Electron builds are not available on platform: ${platform}`)
  }
}

const target = platformPath()

function isInstalled() {
  try {
    if (fs.readFileSync(path.join(electronDir, 'dist', 'version'), 'utf8').replace(/^v/, '') !== version) return false
    if (fs.readFileSync(path.join(electronDir, 'path.txt'), 'utf8') !== target) return false
    return fs.existsSync(path.join(electronDir, 'dist', target))
  } catch {
    return false
  }
}

if (isInstalled()) {
  console.log(`[electron] v${version} already installed`)
  process.exit(0)
}

const fromElectron = createRequire(path.join(electronDir, 'install.js'))
const importFrom = (id) => import(pathToFileURL(fromElectron.resolve(id)).href)

const { downloadArtifact } = await importFrom('@electron/get')
const { extract } = await importFrom('@electron-internal/extract-zip')

console.log(`[electron] downloading v${version} for ${process.platform}-${process.arch}…`)

const zipPath = await downloadArtifact({
  version,
  artifactName: 'electron',
  force: process.env.force_no_cache === 'true',
  cacheRoot: process.env.electron_config_cache,
  checksums: require(path.join(electronDir, 'checksums.json')),
  platform: process.env.npm_config_platform || process.platform,
  arch: process.env.npm_config_arch || process.arch
})

const distPath = path.join(electronDir, 'dist')
await extract(zipPath, { dir: distPath })

const bundledTypes = path.join(distPath, 'electron.d.ts')
if (fs.existsSync(bundledTypes)) fs.renameSync(bundledTypes, path.join(electronDir, 'electron.d.ts'))

fs.writeFileSync(path.join(electronDir, 'path.txt'), target)
console.log(`[electron] installed → ${path.join(distPath, target)}`)
