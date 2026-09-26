/**
 * Lecture d'une archive ZIP (et donc d'un CBZ), sans dépendance.
 *
 * Un CBZ n'est qu'un ZIP d'images, presque toujours « stocké » (sans
 * compression : un JPEG ne se compresse plus) ou « deflate ». Ces deux
 * méthodes couvrent la totalité des archives de mangas qu'on croise ; zlib,
 * livré avec Node, suffit pour la seconde. Une bibliothèque entière pour ça
 * aurait été un paquet de plus à installer, alors que npm 11 bloque déjà les
 * scripts d'installation ici.
 *
 * On ne lit que le répertoire central — la table des matières à la fin du
 * fichier — puis la seule entrée demandée. Ouvrir un tome de 200 Mo ne charge
 * donc jamais 200 Mo : tourner une page lit une page.
 *
 * Le ZIP64 (archives de plus de 4 Go ou de plus de 65 535 fichiers) n'est pas
 * pris en charge : un tome n'en approche pas.
 */

import { open, type FileHandle } from 'node:fs/promises'
import { inflateRawSync } from 'node:zlib'

export interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  size: number
  /** Position de l'en-tête local, pas des données : il faut le relire. */
  headerOffset: number
}

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
/** L'enregistrement de fin fait 22 octets, plus un commentaire d'au plus 64 Ko. */
const EOCD_SEARCH = 22 + 0xffff

async function readAt(handle: FileHandle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await handle.read(buffer, 0, length, position)
  return buffer.subarray(0, bytesRead)
}

/** Les noms en UTF-8 portent le bit 11 ; les autres sont en CP437, rarement accentués. */
function decodeName(raw: Buffer, utf8: boolean): string {
  return utf8 ? raw.toString('utf8') : raw.toString('latin1')
}

export async function listZip(path: string): Promise<ZipEntry[]> {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    const tailLength = Math.min(size, EOCD_SEARCH)
    const tail = await readAt(handle, size - tailLength, tailLength)

    let eocd = -1
    for (let i = tail.length - 22; i >= 0; i -= 1) {
      if (tail.readUInt32LE(i) === EOCD_SIGNATURE) {
        eocd = i
        break
      }
    }
    if (eocd === -1) throw new Error('Archive illisible : ce n’est pas un ZIP.')

    const count = tail.readUInt16LE(eocd + 10)
    const dirSize = tail.readUInt32LE(eocd + 12)
    const dirOffset = tail.readUInt32LE(eocd + 16)
    const dir = await readAt(handle, dirOffset, dirSize)

    const entries: ZipEntry[] = []
    let at = 0
    for (let n = 0; n < count && at + 46 <= dir.length; n += 1) {
      if (dir.readUInt32LE(at) !== CENTRAL_SIGNATURE) break
      const flags = dir.readUInt16LE(at + 8)
      const method = dir.readUInt16LE(at + 10)
      const compressedSize = dir.readUInt32LE(at + 20)
      const uncompressed = dir.readUInt32LE(at + 24)
      const nameLength = dir.readUInt16LE(at + 28)
      const extraLength = dir.readUInt16LE(at + 30)
      const commentLength = dir.readUInt16LE(at + 32)
      const headerOffset = dir.readUInt32LE(at + 42)
      const name = decodeName(dir.subarray(at + 46, at + 46 + nameLength), (flags & 0x800) !== 0)
      if (!name.endsWith('/')) entries.push({ name, method, compressedSize, size: uncompressed, headerOffset })
      at += 46 + nameLength + extraLength + commentLength
    }
    return entries
  } finally {
    await handle.close()
  }
}

export async function readZipEntry(path: string, entry: ZipEntry): Promise<Buffer> {
  const handle = await open(path, 'r')
  try {
    const local = await readAt(handle, entry.headerOffset, 30)
    if (local.length < 30 || local.readUInt32LE(0) !== LOCAL_SIGNATURE) {
      throw new Error('Archive abîmée : en-tête introuvable.')
    }
    // Les longueurs de l'en-tête local peuvent différer de celles du
    // répertoire central : seules les siennes disent où commencent les données.
    const start = entry.headerOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28)
    const data = await readAt(handle, start, entry.compressedSize)
    if (entry.method === 0) return data
    if (entry.method === 8) return inflateRawSync(data)
    throw new Error(`Compression non prise en charge (méthode ${entry.method}).`)
  } finally {
    await handle.close()
  }
}
