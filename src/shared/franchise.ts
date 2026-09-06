/**
 * L'arbre d'une franchise : un tronc, et ce qui pousse dessus.
 *
 * L'app savait déjà suivre la chaîne des saisons — c'est la bande en haut d'une
 * fiche. Mais une franchise n'est pas une ligne : autour des saisons vivent des
 * films, des OVA, des spin-off, des remakes, des résumés, et rien ne disait
 * lesquels, ni où ils se branchent, ni ce qu'on en a vu.
 *
 * Deux décisions font tout le travail.
 *
 * **Le tronc l'emporte.** Une saison déjà dans la chaîne ne repousse jamais
 * comme branche, même si l'arête qui y mène s'appelle « suite ». Sans cette
 * règle, chaque saison apparaîtrait deux fois — une fois à sa place, une fois
 * en dessous de la précédente.
 *
 * **La nature se lit au format, pas au libellé.** AniList range sous
 * `SIDE_STORY` aussi bien un film de deux heures qu'un OVA de six minutes ;
 * l'inverse est vrai aussi, un film peut arriver par une arête `SEQUEL`. Le
 * libellé dit le lien, le format dit ce que c'est — et c'est ce qu'on cherche
 * en regardant un arbre.
 */

/** Ce qui peut pousser à côté d'une saison. */
export type Branch = 'film' | 'ova' | 'spinoff' | 'alternative' | 'resume'

/** L'ordre d'affichage : du plus proche de l'histoire au plus lointain. */
export const BRANCHES: Branch[] = ['film', 'ova', 'spinoff', 'alternative', 'resume']

export const BRANCH_LABELS: Record<Branch, string> = {
  film: 'Films',
  ova: 'OVA et spéciaux',
  spinoff: 'Spin-off',
  alternative: 'Versions alternatives',
  resume: 'Résumés'
}

/** Une arête telle qu'AniList la donne, réduite à ce qui sert ici. */
export interface Edge {
  relationType: string
  id: number
  title: string
  cover: string | null
  format: string | null
}

/** Une saison du tronc, telle que la chaîne des saisons la connaît déjà. */
export interface Spine {
  id: number
  number: number
  part: number | null
  title: string
  format: string | null
  episodes: number | null
  year: number | null
  cover: string | null
}

/** Ce que la bibliothèque sait d'une série. */
export interface Progress {
  seen: number
  total: number | null
  tracked: boolean
}

export interface Node extends Progress {
  id: number
  title: string
  cover: string | null
  format: string | null
}

export interface Season extends Node {
  number: number
  part: number | null
  year: number | null
  branches: { kind: Branch; nodes: Node[] }[]
}

export interface Tree {
  trunk: Season[]
  /** Vus et total sur toute la franchise, branches comprises. */
  seen: number
  total: number
  /** Combien de séries l'arbre porte, tronc compris. */
  count: number
}

const byFormat = (format: string | null): Branch =>
  format === 'MOVIE' ? 'film' : format === 'OVA' || format === 'SPECIAL' ? 'ova' : 'spinoff'

/**
 * De quelle branche relève une arête, ou `null` si elle n'a rien à faire là.
 *
 * `onSpine` écarte les saisons du tronc. Les liens vers le manga d'origine, les
 * personnages partagés et le fourre-tout `OTHER` sont écartés aussi : ils ne
 * racontent pas la même histoire, et une fiche entière leur est déjà consacrée
 * ailleurs.
 */
export function branchOf(relationType: string, format: string | null, onSpine: boolean): Branch | null {
  if (onSpine) return null
  switch (relationType) {
    case 'SUMMARY':
      return 'resume'
    case 'ALTERNATIVE':
      return 'alternative'
    case 'SEQUEL':
    case 'PREQUEL':
    case 'SIDE_STORY':
    case 'SPIN_OFF':
    case 'PARENT':
      return byFormat(format)
    default:
      // SOURCE, ADAPTATION, CHARACTER, OTHER, et tout ce qu'ils ajouteront.
      return null
  }
}

/**
 * Assemble l'arbre.
 *
 * Une même série peut être citée par plusieurs saisons — un film récapitulatif
 * l'est souvent par toutes. Elle n'est gardée qu'une fois, sur la saison la
 * plus ancienne qui la mentionne : c'est là qu'elle s'insère dans l'histoire.
 */
export function buildTree(spine: Spine[], edgesOf: (id: number) => Edge[], progressOf: (id: number) => Progress): Tree {
  const onSpine = new Set(spine.map((s) => s.id))
  const placed = new Set<number>()

  const trunk: Season[] = spine.map((season) => {
    const groups = new Map<Branch, Node[]>()

    for (const edge of edgesOf(season.id)) {
      const kind = branchOf(edge.relationType, edge.format, onSpine.has(edge.id))
      if (kind === null || placed.has(edge.id)) continue
      placed.add(edge.id)

      const list = groups.get(kind) ?? []
      list.push({ id: edge.id, title: edge.title, cover: edge.cover, format: edge.format, ...progressOf(edge.id) })
      groups.set(kind, list)
    }

    return {
      id: season.id,
      title: season.title,
      cover: season.cover,
      format: season.format,
      number: season.number,
      part: season.part,
      year: season.year,
      ...progressOf(season.id),
      branches: BRANCHES.filter((k) => groups.has(k)).map((kind) => ({
        kind,
        nodes: (groups.get(kind) as Node[]).sort((a, b) => a.title.localeCompare(b.title, 'fr'))
      }))
    }
  })

  let seen = 0
  let total = 0
  let count = 0
  for (const season of trunk) {
    for (const node of [season as Node, ...season.branches.flatMap((b) => b.nodes)]) {
      seen += node.seen
      total += node.total ?? 0
      count += 1
    }
  }

  return { trunk, seen, total, count }
}
