import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { locateExport } from './folder'

let root = ''

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'animelist-export-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

/** Writes a usable export into `dir`, creating it if needed. */
async function writeExport(dir: string, extras?: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(join(dir, 'user_tv_show_data.csv'), 'tv_show_id,tv_show_name\n1,Bleach\n')
  await fs.writeFile(join(dir, 'tracking-prod-records-v2.csv'), 's_id,season_number,episode_number,created_at\n')
  if (extras !== undefined) await fs.writeFile(join(dir, '_opentv_extras.json'), extras)
}

describe('locateExport', () => {
  it('finds an export sitting at the root', async () => {
    await writeExport(root)
    const found = await locateExport(root)
    expect(found?.folder).toBe(root)
    expect(found?.shows).toContain('Bleach')
  })

  it('finds an export one folder down', async () => {
    // Unzipping tools routinely add a wrapper folder.
    const inner = join(root, 'OpenTV Backup')
    await writeExport(inner)
    const found = await locateExport(root)
    expect(found?.folder).toBe(inner)
  })

  it('finds an export two folders down', async () => {
    const inner = join(root, 'DATA EXPORT', 'OpenTV Backup')
    await writeExport(inner)
    expect((await locateExport(root))?.folder).toBe(inner)
  })

  it('returns null when the required files are missing', async () => {
    await fs.writeFile(join(root, 'autre.csv'), 'rien')
    expect(await locateExport(root)).toBeNull()
  })

  it('returns null when only one required file is present', async () => {
    // Half an export is not an export: reporting it as found would fail later
    // with a confusing read error.
    await fs.writeFile(join(root, 'user_tv_show_data.csv'), 'tv_show_id,tv_show_name\n')
    expect(await locateExport(root)).toBeNull()
  })

  it('returns null for a folder that does not exist', async () => {
    expect(await locateExport(join(root, 'absent'))).toBeNull()
  })

  it('reads the OpenTV side-file when it is there', async () => {
    await writeExport(root, '{"shows":[]}')
    expect((await locateExport(root))?.extras).toBe('{"shows":[]}')
  })

  it('leaves extras null on a plain TV Time export', async () => {
    await writeExport(root)
    expect((await locateExport(root))?.extras).toBeNull()
  })

  it('does not descend past the depth limit', async () => {
    await writeExport(join(root, 'a', 'b', 'c', 'd'))
    expect(await locateExport(root)).toBeNull()
  })

  it('ignores hidden folders', async () => {
    await writeExport(join(root, '.trash'))
    expect(await locateExport(root)).toBeNull()
  })
})
