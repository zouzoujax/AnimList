/**
 * Rassemble de quoi dessiner l'arbre d'une franchise.
 *
 * Le tronc est la chaîne des saisons que la bande d'une fiche affiche déjà. Les
 * branches sortent des relations : celles des fiches gardées en cache servent
 * telles quelles, les autres arrivent toutes ensemble en une seule requête.
 * L'arbre reste consultable quand leur API est coupée, avec ce que le cache sait.
 *
 * La règle qui range les branches vit dans `@shared/franchise`, à part et
 * testée. Ce fichier ne fait que la nourrir : la chaîne d'un côté, les
 * relations de l'autre, l'avancement de la bibliothèque par-dessus.
 */

import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import {
  buildTree,
  dateKey,
  isStale,
  toForget,
  type Edge,
  type Progress,
  type Spine,
  type Tree
} from '@shared/franchise'
import { knownStart, relationsOfMany, seasonChain } from './anilist'
import { getMedia, isTracked, watchedCount } from './store'

/** Assez pour Naruto ou Gundam, assez peu pour ne pas figer la fenêtre. */
const MAX_SEASONS = 24

/** Une série sans chaîne connue est son propre tronc, à une seule saison. */
function alone(id: number): Spine[] {
  const media = getMedia(id)
  if (!media) return []
  return [
    {
      id,
      number: 1,
      part: null,
      title: media.title.english ?? media.title.romaji,
      format: media.format,
      episodes: media.episodes,
      year: media.seasonYear,
      cover: media.cover.large,
      status: media.status
    }
  ]
}

/**
 * La date de sortie, là où on la trouve sans rien demander.
 *
 * Les relations n'en portaient pas avant, et les fiches gardées d'alors non
 * plus : la bibliothèque et le cache comblent ce qu'ils peuvent. La modale
 * « Série terminée » range ses conseils avec.
 */
const dateOf = (id: number): number | null => dateKey(getMedia(id)?.startDate) ?? knownStart(id)

function progressOf(id: number): Progress {
  const media = getMedia(id)
  // Suivie selon l'entrée, pas selon la fiche en cache : retirer une série
  // de la liste garde sa fiche, et l'arbre continuait de la colorer.
  return { seen: watchedCount(id), total: media?.episodes ?? null, tracked: isTracked(id) }
}

/**
 * La structure d'une franchise, telle qu'elle est gardée sur le disque.
 *
 * Le tronc et les branches, sans l'avancement : celui-ci se recalcule à chaque
 * lecture depuis la bibliothèque. Un arbre ressorti du fichier annoncerait
 * sinon les chiffres du jour où il a été lu.
 */
interface Kept {
  /** Quand la structure a été lue chez AniList. */
  at: number
  /** Quand on l'a servie pour la dernière fois — c'est ce qui décide des oublis. */
  usedAt: number
  spine: Spine[]
  /** La carte des arêtes, mise en paires : un JSON ne sait pas écrire une Map. */
  edges: [number, Edge[]][]
  partial: boolean
}

const cachePath = (): string => join(app.getPath('userData'), 'franchise-cache.json')

/** Tout le fichier, chargé une fois puis tenu en mémoire. */
let kept: Record<string, Kept> | null = null

function load(): Record<string, Kept> {
  if (kept) return kept
  kept = {}
  const path = cachePath()
  if (!existsSync(path)) return kept
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, Kept>
    // Un fichier écrit par une version plus ancienne, ou abîmé : on repart de
    // zéro plutôt que de dessiner un arbre à partir de n'importe quoi. Il se
    // reconstruit tout seul, c'est un cache.
    for (const [id, row] of Object.entries(raw)) {
      if (Array.isArray(row?.spine) && Array.isArray(row?.edges) && typeof row?.at === 'number') kept[id] = row
    }
  } catch (err) {
    console.error('[franchise] cache illisible, on repart de zéro', err)
  }
  return kept
}

/** Une écriture à la fois, jamais deux qui se marchent dessus. */
let writing: Promise<void> = Promise.resolve()

function save(): void {
  const rows = load()
  for (const id of toForget(Object.entries(rows).map(([id, row]) => ({ id: Number(id), usedAt: row.usedAt })))) {
    delete rows[String(id)]
  }
  const payload = JSON.stringify(rows)
  writing = writing
    .then(async () => {
      // tmp + rename, comme le registre : un cache à moitié écrit se relit au
      // prochain lancement, et on préfère qu'il se relise entier ou pas du tout.
      const path = cachePath()
      await fs.writeFile(`${path}.tmp`, payload, 'utf8')
      await fs.rename(`${path}.tmp`, path)
    })
    .catch((err) => console.error('[franchise] cache non écrit', err))
}

/** Les relectures en cours, pour ne pas en lancer deux sur la même franchise. */
const inflight = new Map<number, Promise<Kept>>()

/**
 * L'avancement, posé sur une structure gardée.
 *
 * Les dates manquantes sont retentées au passage : la bibliothèque en apprend
 * en permanence, et un film sans date à la première lecture en a souvent une
 * la fois suivante.
 */
function assemble(row: Kept): Tree {
  const spine = row.spine.map((s) => ({ ...s, date: s.date ?? dateOf(s.id) }))
  const edges = new Map(
    row.edges.map(([of, list]) => [of, list.map((e) => ({ ...e, date: e.date ?? dateOf(e.id) }))] as const)
  )
  return { ...buildTree(spine, (of) => edges.get(of) ?? [], progressOf), partial: row.partial }
}

/**
 * L'arbre d'une franchise, tout de suite s'il est déjà connu.
 *
 * Le construire demande plusieurs requêtes chez AniList — une trentaine de
 * secondes à froid sur une grosse franchise — pour une structure qui ne change
 * presque jamais. On sert donc ce qu'on a et on relit derrière, sans faire
 * attendre : la fois suivante montrera la saison qui vient d'être annoncée.
 *
 * Seule la structure est gardée ; l'avancement est refait à chaque lecture.
 */
export async function franchiseTree(id: number): Promise<Tree> {
  const rows = load()
  const row = rows[String(id)]

  if (row) {
    row.usedAt = Date.now()
    // Relu quand il a vieilli — et à chaque ouverture tant qu'il est
    // incomplet : un arbre tronqué par une API muette ne doit pas le rester
    // une demi-journée sous prétexte qu'il est « frais ».
    if (isStale(row.at) || row.partial) {
      // Détachée : personne n'attend après elle, et une API coupée ne doit pas
      // empêcher de servir l'arbre qu'on a déjà.
      void rebuild(id).catch((err) => console.error('[franchise] relecture en arrière-plan', err))
    }
    save()
    return assemble(row)
  }

  return assemble(await rebuild(id))
}

/** Relit la structure chez AniList et la range. Une seule à la fois par franchise. */
function rebuild(id: number): Promise<Kept> {
  const current = inflight.get(id)
  if (current) return current

  const task = fetchStructure(id)
    .then((row) => {
      const rows = load()
      const before = rows[String(id)]
      /*
       * Une relecture ratée ne remplace pas un bon arbre.
       *
       * AniList coupé rend un tronc à un nœud et aucune branche. Sans cette
       * garde, ouvrir l'arbre pendant une panne effaçait pour de bon la
       * franchise entière qu'on avait — et l'écran d'après affichait « cette
       * série n'a rien d'autre », ce qui est faux. On garde l'ancien, et on
       * retentera à la prochaine ouverture.
       */
      if (before && row.partial && !before.partial) return before

      rows[String(id)] = row
      save()
      return row
    })
    .finally(() => inflight.delete(id))

  inflight.set(id, task)
  return task
}

async function fetchStructure(id: number): Promise<Kept> {
  /**
   * Ce qu'on n'a pas pu lire, retenu au lieu d'être avalé.
   *
   * Les `catch` d'ici rendaient une liste vide, indistinguable d'une franchise
   * qui n'a réellement ni suite ni film : l'arbre annonçait une absence qu'il
   * ne connaissait pas, et son bandeau d'avertissement ne s'affichait jamais.
   */
  let partial = false

  const chain = await seasonChain(id).catch(() => {
    partial = true
    return []
  })
  const spine = (chain.length ? chain : alone(id)).slice(0, MAX_SEASONS).map((s) => ({ ...s, date: dateOf(s.id) }))

  // Une requête pour toutes les saisons, pas une par saison : sous la limite
  // d'AniList, huit fiches à la file faisaient attendre l'arbre deux minutes.
  // Une saison dont les relations manquent perd ses branches, pas sa place.
  const relations = await relationsOfMany(spine.map((s) => s.id))
  const edges = new Map<number, Edge[]>()
  for (const season of spine) {
    const list = relations.get(season.id)
    if (!list) {
      partial = true
      continue
    }
    edges.set(
      season.id,
      list.map((e) => ({ ...e, date: e.date ?? dateOf(e.id) }))
    )
  }

  const now = Date.now()
  return { at: now, usedAt: now, spine, edges: [...edges.entries()], partial }
}
