/**
 * Quoi regarder après une série terminée, en suivant l'arbre de sa franchise.
 *
 * L'arbre montrait déjà tout ce qui gravite autour d'une série ; il ne disait
 * pas par où continuer au moment précis où la question se pose — l'épisode
 * final à peine coché. Cette règle y répond, et vit à part et sous test : un
 * mauvais conseil ne se voit pas, il ressemble à un bon et on le suit.
 *
 * Trois décisions portent tout.
 *
 * **L'ordre des sorties.** Films, OVA, spin-off et saison suivante se rangent
 * par date de sortie : c'est ainsi qu'ils se sont intercalés, et ainsi qu'on
 * suit une franchise. La première version mettait la saison suivante en tête,
 * devant un spécial sorti quatre mois plus tôt. Une sortie dont personne ne
 * connaît la date passe après les autres, dans l'ordre de l'arbre.
 *
 * **La saison suivante ne disparaît jamais.** La modale ne montre qu'une
 * poignée de conseils. Placée en dernier sans précaution, la suite de
 * l'histoire aurait été coupée dès trois films — c'est le cas de Naruto. Ce
 * sont les sorties annexes qui cèdent leur place, jamais elle.
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
  /** Date de sortie triable, `null` si inconnue. */
  date: number | null
}

/** Par date de sortie ; l'inconnu après le connu, sans rien déplacer d'autre. */
const byRelease = (a: Suggestion, b: Suggestion): number =>
  a.date === null ? (b.date === null ? 0 : 1) : b.date === null ? -1 : a.date - b.date

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

  let next: Suggestion | null = null
  for (let i = at + 1; i < tree.trunk.length; i += 1) {
    const season = tree.trunk[i]
    if (season.status === 'NOT_YET_RELEASED') break
    if (done(season)) continue
    next = {
      id: season.id,
      title: season.title,
      cover: season.cover,
      format: season.format,
      kind: 'season',
      label: `Saison ${season.number}${season.part ? ` · partie ${season.part}` : ''}`,
      date: season.date ?? null
    }
    break
  }

  const side: Suggestion[] = []
  const home = tree.trunk[at]
  for (const kind of BRANCH_ORDER) {
    const group = home.branches.find((b) => b.kind === kind)
    for (const node of group?.nodes ?? []) {
      if (node.id === finishedId || done(node)) continue
      side.push({
        id: node.id,
        title: node.title,
        cover: node.cover,
        format: node.format,
        kind,
        label: KIND_LABELS[kind],
        date: node.date ?? null
      })
    }
  }

  // La place de la saison suivante est réservée ; parmi le reste, ce qui est
  // sorti le plus tôt reste, le plus tardif cède.
  const room = Math.max(0, next ? max - 1 : max)
  const kept = side.sort(byRelease).slice(0, room)
  return (next ? [...kept, next] : kept).sort(byRelease).slice(0, max)
}
