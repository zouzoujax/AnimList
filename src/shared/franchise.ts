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
  /** Date de sortie (voir `dateKey`), `null` quand personne ne la connaît. */
  date?: number | null
}

/**
 * Une date AniList réduite à un nombre qui se trie : 20250328.
 *
 * Mois et jour inconnus valent zéro — une sortie connue à l'année près se range
 * en tête de son année, ce qui vaut mieux que de disparaître du tri.
 */
export function dateKey(
  d: { year: number | null; month?: number | null; day?: number | null } | null | undefined
): number | null {
  if (!d?.year) return null
  return d.year * 10000 + (d.month ?? 0) * 100 + (d.day ?? 0)
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
  /** FINISHED, RELEASING, NOT_YET_RELEASED… — optionnel, la chaîne ne le donne pas toujours. */
  status?: string | null
  date?: number | null
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
  date?: number | null
}

export interface Season extends Node {
  number: number
  part: number | null
  year: number | null
  status?: string | null
  branches: { kind: Branch; nodes: Node[] }[]
}

export interface Tree {
  trunk: Season[]
  /** Vus et total sur toute la franchise, branches comprises. */
  seen: number
  total: number
  /** Combien de séries l'arbre porte, tronc compris. */
  count: number
  /**
   * Combien de ces séries sont dans la bibliothèque.
   *
   * Sans ce chiffre, l'en-tête annonçait « 24 séries · 1013 sur 1013 · 100 % »
   * pour une franchise dont vingt titres ne sont pas suivis : leur total est
   * inconnu, il ne pèse donc rien dans la somme, et le pourcentage proclamait
   * une complétude qui n'existe pas.
   */
  tracked: number
  /**
   * Vrai quand une partie de l'arbre n'a pas pu être lue.
   *
   * Sans ce drapeau, un catalogue muet rendait un tronc à un seul nœud et
   * aucune branche — ce qui se lit comme « cette franchise n'a rien d'autre »
   * au lieu de « je n'ai pas pu savoir ». C'est aussi ce qui permet de
   * prévenir qu'une série hors bibliothèque ne s'ouvrira pas, avant le clic.
   *
   * Faux par construction ici : seul l'appelant sait si une lecture a échoué.
   */
  partial: boolean
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
      list.push({
        id: edge.id,
        title: edge.title,
        cover: edge.cover,
        format: edge.format,
        date: edge.date ?? null,
        ...progressOf(edge.id)
      })
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
      status: season.status ?? null,
      date: season.date ?? null,
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
  let tracked = 0
  for (const season of trunk) {
    for (const node of [season as Node, ...season.branches.flatMap((b) => b.nodes)]) {
      seen += node.seen
      total += node.total ?? 0
      count += 1
      if (node.tracked) tracked += 1
    }
  }

  return { trunk, seen, total, count, tracked, partial: false }
}

/* ─────────────────────────────── Ce qu'on garde d'un arbre d'une fois sur l'autre

   Construire un arbre demande plusieurs requêtes chez AniList : la chaîne des
   saisons, puis les relations de chacune. C'est long — une trentaine de
   secondes à froid sur une grosse franchise —, et le résultat ne change
   presque jamais. Une saison de plus est annoncée deux fois par an, pas deux
   fois par heure.

   Ce qui est gardé est la **structure** seule : le tronc et ses branches.
   L'avancement — vus, total, suivie — est recalculé à chaque lecture depuis la
   bibliothèque, sinon un arbre ressorti du fichier annoncerait les chiffres du
   jour où on l'a lu la première fois.

   Les deux règles ci-dessous sont ici, avec le reste des règles de l'arbre :
   elles décident quand redemander et quoi oublier, et ce sont les deux seules
   choses qu'on puisse se tromper sans le voir. */

/** Passé ce délai, on ressert le cache mais on relit derrière. Une demi-journée. */
export const FRANCHISE_FRESH_MS = 12 * 3600_000

/**
 * Combien d'arbres on garde.
 *
 * Quelques kilo-octets pièce : la borne n'est pas là pour la place mais pour
 * que le fichier reste relisable à la main, comme tout ce que cette app écrit.
 */
export const MAX_FRANCHISE_CACHE = 80

/** L'arbre gardé mérite-t-il une relecture ? */
export function isStale(at: number, now: number = Date.now()): boolean {
  return now - at >= FRANCHISE_FRESH_MS
}

/**
 * Lesquels oublier quand le fichier déborde.
 *
 * Les moins consultés partent, pas les plus vieux : un arbre qu'on ouvre tous
 * les soirs a beau dater, c'est celui qu'on veut instantané. Rendus dans
 * l'ordre où on les efface, pour que le test le montre.
 */
export function toForget(kept: { id: number; usedAt: number }[], max = MAX_FRANCHISE_CACHE): number[] {
  if (kept.length <= max) return []
  return [...kept]
    .sort((a, b) => a.usedAt - b.usedAt)
    .slice(0, kept.length - max)
    .map((row) => row.id)
}
