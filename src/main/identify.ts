/**
 * « C'est quoi, cet anime ? »
 *
 * Une image part chez trace.moe, qui la compare à un index de toutes les
 * scènes et rend la série, l'épisode et la seconde exacte. Aucune autre
 * fonction de l'app ne répond à cette question-là.
 *
 * Le service marche sans compte : le quota est compté par adresse IP, une
 * centaine de recherches par mois, largement au-dessus d'un usage personnel.
 * Il est demandé en même temps que le résultat, parce qu'un quota épuisé ne
 * ressemble pas à une panne et doit se dire autrement.
 *
 * L'image ne sort d'ici que sur un geste explicite de l'utilisateur — coller,
 * déposer, choisir un fichier. Rien n'est envoyé de soi-même.
 */

import { bestMatches, type RawMatch } from '@shared/identify'
import type { FrameMatch, Identification } from '@shared/types'
import { refreshMedia } from './anilist'

const ENDPOINT = 'https://api.trace.moe/search?cutBorders'
const QUOTA_URL = 'https://api.trace.moe/me'

/** Au-delà, la requête est refusée par le service avant même d'être lue. */
const MAX_BYTES = 10 * 1024 * 1024

interface RawResponse {
  error?: string
  result?: {
    anilist?: number
    episode?: number | number[] | null
    from?: number
    to?: number
    similarity?: number
    image?: string
  }[]
}

/**
 * L'épisode arrive parfois en intervalle — un fichier qui en contient deux.
 * Le premier est le bon assez souvent, et se tromper d'un épisode vaut mieux
 * que de n'en annoncer aucun.
 */
function episodeOf(value: number | number[] | null | undefined): number | null {
  if (Array.isArray(value)) return typeof value[0] === 'number' ? value[0] : null
  return typeof value === 'number' ? value : null
}

async function quota(): Promise<Identification['quota']> {
  try {
    const res = await fetch(QUOTA_URL)
    if (!res.ok) return null
    const body = (await res.json()) as { quota?: number; quotaUsed?: number }
    if (typeof body.quota !== 'number') return null
    return { used: body.quotaUsed ?? 0, total: body.quota }
  } catch {
    // Le quota est un confort : ne pas le connaître n'empêche pas de chercher.
    return null
  }
}

/**
 * Cherche la scène, puis remplace les identifiants par de vraies fiches.
 *
 * trace.moe sait rendre lui-même les informations AniList, et on ne les lui
 * demande pas : elles arrivent dans une forme qui n'est pas la nôtre, sans
 * passer par le cache ni par la langue de titre choisie. Un aller-retour de
 * plus vaut mieux qu'un deuxième chemin pour la même donnée.
 */
export async function identifyImage(bytes: Uint8Array, mime: string): Promise<Identification> {
  if (!bytes.length) throw new Error('Image vide.')
  if (bytes.length > MAX_BYTES) throw new Error('Image trop lourde : dix mégaoctets au maximum.')

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': mime || 'image/jpeg' },
    body: bytes
  })

  if (res.status === 429) throw new Error('Trop de recherches d’un coup — réessaie dans une minute.')
  if (res.status === 402) throw new Error('Quota de recherches épuisé pour ce mois-ci.')
  if (!res.ok) throw new Error(`trace.moe a répondu ${res.status}.`)

  const body = (await res.json()) as RawResponse
  if (body.error) throw new Error(body.error)

  const raw: RawMatch[] = (body.result ?? [])
    .filter((r): r is typeof r & { anilist: number } => typeof r.anilist === 'number')
    .map((r) => ({
      anilist: r.anilist,
      episode: episodeOf(r.episode),
      from: r.from ?? 0,
      to: r.to ?? 0,
      similarity: r.similarity ?? 0,
      image: r.image ?? ''
    }))

  const kept = bestMatches(raw)
  if (!kept.length) return { matches: [], quota: await quota() }

  // Une fiche introuvable ne fait pas tomber la réponse : la scène reste
  // juste, seul son titre manque, et le résultat est alors écarté.
  const media = await refreshMedia(kept.map((m) => m.anilist)).catch(() => [])
  const byId = new Map(media.map((m) => [m.id, m]))

  const matches: FrameMatch[] = []
  for (const m of kept) {
    const found = byId.get(m.anilist)
    if (!found) continue
    matches.push({
      media: found,
      episode: m.episode,
      from: m.from,
      to: m.to,
      similarity: m.similarity,
      preview: m.image
    })
  }

  return { matches, quota: await quota() }
}
