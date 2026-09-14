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

import { buildTree, dateKey, type Edge, type Progress, type Spine, type Tree } from '@shared/franchise'
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

export async function franchiseTree(id: number): Promise<Tree> {
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

  return { ...buildTree(spine, (of) => edges.get(of) ?? [], progressOf), partial }
}
