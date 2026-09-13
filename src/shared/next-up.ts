/**
 * Quoi regarder après une série terminée, en suivant l'arbre de sa franchise.
 *
 * L'arbre montrait déjà tout ce qui gravite autour d'une série ; il ne disait
 * pas par où continuer au moment précis où la question se pose — l'épisode
 * final à peine coché. Cette règle y répond, et vit à part et sous test : un
 * mauvais conseil ne se voit pas, il ressemble à un bon et on le suit.
 *
 * Deux décisions portent tout.
 *
 * **La saison suivante d'abord.** Un film ou un spin-off se branche sur une
 * saison ; la suite de l'histoire, elle, est sur le tronc. On la propose avant
 * le reste, et on saute celles qui sont déjà vues.
 *
 * **Jamais ce qui n'est pas sorti.** Une saison annoncée mais pas diffusée
 * n'est pas une suite qu'on peut regarder ce soir. La chaîne est dans l'ordre
 * de diffusion : passé la première saison à venir, les suivantes ne sont pas
 * sorties non plus.
 *
 * Les résumés sont écartés : on vient de voir l'histoire, un récapitulatif
 * n'est pas une suite.
 */

import type { Branch, Node, Tree } from './franchise'

export type NextKind = 'season' | Exclude<Branch, 'resume'>

export interface Suggestion {
  id: number
  title: string
  cover: string | null
  format: string | null
  kind: NextKind
  /** Ce qu'on affiche : « Saison 2 », « Film »… */
  label: string
}

/** Assez pour choisir, assez peu pour que la modale reste une question. */
export const NEXT_MAX = 3

/** Dans l'ordre où l'on conseille, du plus proche de l'histoire au plus lointain. */
const BRANCH_ORDER: Exclude<Branch, 'resume'>[] = ['film', 'ova', 'spinoff', 'alternative']

const KIND_LABELS: Record<Exclude<Branch, 'resume'>, string> = {
  film: 'Film',
  ova: 'OVA ou spécial',
  spinoff: 'Spin-off',
  alternative: 'Version alternative'
}

/** Vu en entier : un total inconnu ne compte jamais comme fini. */
const done = (n: Pick<Node, 'seen' | 'total'>): boolean => n.total !== null && n.total > 0 && n.seen >= n.total

export function nextUp(tree: Tree, finishedId: number, max = NEXT_MAX): Suggestion[] {
  // Une saison du tronc, ou une branche : on la situe sur la saison qui la porte.
  let at = tree.trunk.findIndex((s) => s.id === finishedId)
  if (at === -1) at = tree.trunk.findIndex((s) => s.branches.some((b) => b.nodes.some((n) => n.id === finishedId)))
  if (at === -1) return []

  const out: Suggestion[] = []

  for (let i = at + 1; i < tree.trunk.length; i += 1) {
    const season = tree.trunk[i]
    if (season.status === 'NOT_YET_RELEASED') break
    if (done(season)) continue
    out.push({
      id: season.id,
      title: season.title,
      cover: season.cover,
      format: season.format,
      kind: 'season',
      label: `Saison ${season.number}${season.part ? ` · partie ${season.part}` : ''}`
    })
    break
  }

  const home = tree.trunk[at]
  for (const kind of BRANCH_ORDER) {
    const group = home.branches.find((b) => b.kind === kind)
    for (const node of group?.nodes ?? []) {
      if (node.id === finishedId || done(node)) continue
      out.push({
        id: node.id,
        title: node.title,
        cover: node.cover,
        format: node.format,
        kind,
        label: KIND_LABELS[kind]
      })
    }
  }

  return out.slice(0, max)
}
