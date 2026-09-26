import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { afterAll, describe, expect, it } from 'vitest'
import { listZip, readZipEntry } from './zip'

/** Un ZIP minimal, écrit à la main : une entrée stockée, une compressée. */
function buildZip(files: { name: string; data: Buffer; deflate: boolean }[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const body = file.deflate ? deflateRawSync(file.data) : file.data
    const name = Buffer.from(file.name, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(0x800, 6)
    local.writeUInt16LE(file.deflate ? 8 : 0, 8)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(file.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, body)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(0x800, 8)
    central.writeUInt16LE(file.deflate ? 8 : 0, 10)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(file.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += 30 + name.length + body.length
  }
  const dir = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, dir, end])
}

const dir = mkdtempSync(join(tmpdir(), 'zip-test-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('zip', () => {
  it('liste les entrées et relit les deux méthodes', async () => {
    const path = join(dir, 'tome.cbz')
    const page = Buffer.from('page-deux '.repeat(50))
    writeFileSync(
      path,
      buildZip([
        { name: 'Tome 1/001.jpg', data: Buffer.from('page-un'), deflate: false },
        { name: 'Tome 1/002.jpg', data: page, deflate: true }
      ])
    )
    const entries = await listZip(path)
    expect(entries.map((e) => e.name)).toEqual(['Tome 1/001.jpg', 'Tome 1/002.jpg'])
    expect((await readZipEntry(path, entries[0])).toString()).toBe('page-un')
    expect((await readZipEntry(path, entries[1])).equals(page)).toBe(true)
  })

  it('refuse ce qui n’est pas un ZIP', async () => {
    const path = join(dir, 'faux.cbz')
    writeFileSync(path, 'pas une archive')
    await expect(listZip(path)).rejects.toThrow()
  })
})
