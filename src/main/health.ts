/**
 * Le bilan de santé de la bibliothèque.
 *
 * Aucun des défauts cherchés ici n'empêche l'app de fonctionner — c'est
 * exactement pour ça que personne ne les voit. Une fiche perdue depuis un
 * import, trois visionnages rattachés à une série effacée, un compte qui
 * dépasse le total annoncé : ça se répare en une seconde quand c'est dit, et
 * ça reste là indéfiniment quand ça ne l'est pas.
 *
 * Le bilan ne répare rien tout seul. Il montre, et propose — le nettoyage est
 * une décision, pas un effet de bord de l'ouverture d'un écran.
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import type { HealthReport } from '@shared/types'
import { compact } from '@shared/titles'
import { dbPath, snapshot, dropOrphanEvents } from './store'

/** Un fichier de plus d'un mois qu'aucune version de l'app ne relit. */
const STRAY = /^animelist\.(json\.v\d+-backup|before-[^.]+\.json)$|-history\.avant-.*\.jsonl$/
const OLD_ENOUGH_MS = 30 * 24 * 3600_000

export function health(): HealthReport {
  const db = snapshot()
  const known = new Set(db.entries.map((e) => e.animeId))
  const media = new Map(db.media.map((m) => [m.id, m]))

  const missingMedia = db.entries
    .filter((e) => !media.has(e.animeId))
    .map((e) => ({
      animeId: e.animeId,
      episodes: db.history.filter((h) => h.animeId === e.animeId).length
    }))

  const orphans = new Map<number, number>()
  const highest = new Map<number, number>()
  for (const ev of db.history) {
    if (!known.has(ev.animeId)) orphans.set(ev.animeId, (orphans.get(ev.animeId) ?? 0) + 1)
    highest.set(ev.animeId, Math.max(highest.get(ev.animeId) ?? 0, ev.episode))
  }

  const beyondTotal = db.entries
    .map((e) => {
      const m = media.get(e.animeId)
      const top = highest.get(e.animeId) ?? 0
      if (!m?.episodes || top <= m.episodes) return null
      return { animeId: e.animeId, title: m.title.english ?? m.title.romaji, total: m.episodes, highest: top }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  // Deux entrées pour la même œuvre : un import qui a créé un doublon, ou une
  // fiche AniList scindée depuis. Le titre compacté sert de signature.
  const byTitle = new Map<string, { title: string; ids: number[] }>()
  for (const entry of db.entries) {
    const m = media.get(entry.animeId)
    if (!m) continue
    const title = m.title.english ?? m.title.romaji
    const sig = compact(title)
    const held = byTitle.get(sig)
    if (held) held.ids.push(entry.animeId)
    else byTitle.set(sig, { title, ids: [entry.animeId] })
  }
  const duplicates = [...byTitle.values()].filter((row) => row.ids.length > 1)

  return {
    entries: db.entries.length,
    events: db.history.length,
    missingMedia,
    orphanEvents: [...orphans.entries()].map(([animeId, count]) => ({ animeId, count })),
    beyondTotal,
    duplicates,
    strayFiles: strayFiles()
  }
}

function strayFiles(): HealthReport['strayFiles'] {
  const dir = dirname(dbPath())
  if (!existsSync(dir)) return []
  const now = Date.now()
  const out: HealthReport['strayFiles'] = []
  for (const name of readdirSync(dir)) {
    if (!STRAY.test(name)) continue
    try {
      const info = statSync(`${dir}/${name}`)
      const age = Math.floor((now - info.mtimeMs) / 86_400_000)
      // Une sauvegarde d'avant-migration de la semaine dernière peut encore
      // servir. Celle de juillet, non.
      if (now - info.mtimeMs < OLD_ENOUGH_MS) continue
      out.push({ name, bytes: info.size, age })
    } catch {
      // Disparu entre la liste et la lecture : rien à signaler.
    }
  }
  return out.sort((a, b) => b.bytes - a.bytes)
}

/** Retire les visionnages sans série. Le nombre effacé, pour pouvoir le dire. */
export function cleanOrphans(): number {
  return dropOrphanEvents()
}

/** Supprime un résidu nommé dans le bilan, et lui seul. */
export async function removeStray(name: string): Promise<boolean> {
  // Le nom vient du bilan, mais il fait l'aller-retour par la fenêtre : on ne
  // supprime que ce que le motif reconnaît, dans le seul dossier de données.
  if (!STRAY.test(name) || name.includes('/') || name.includes('\\')) return false
  const path = `${dirname(dbPath())}/${name}`
  if (!existsSync(path)) return false
  await fs.unlink(path)
  return true
}
