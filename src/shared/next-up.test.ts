import { describe, expect, it } from 'vitest'
import { NEXT_MAX, nextUp } from './next-up'
import type { Branch, Node, Season, Tree } from './franchise'

const node = (id: number, over: Partial<Node> = {}): Node => ({
  id,
  title: `#${id}`,
  cover: null,
  format: 'MOVIE',
  seen: 0,
  total: 1,
  tracked: false,
  ...over
})

const season = (
  id: number,
  number: number,
  over: Partial<Season> = {},
  branches: { kind: Branch; nodes: Node[] }[] = []
): Season => ({
  ...node(id, { format: 'TV', total: 12 }),
  number,
  part: null,
  year: 2020 + number,
  status: 'FINISHED',
  branches,
  ...over
})

const tree = (trunk: Season[]): Tree => ({ trunk, seen: 0, total: 0, count: trunk.length, tracked: 0, partial: false })

const ids = (list: { id: number }[]): number[] => list.map((s) => s.id)

describe('nextUp', () => {
  it('conseille la saison suivante', () => {
    const t = tree([season(1, 1, { seen: 12 }), season(2, 2)])
    const out = nextUp(t, 1)
    expect(ids(out)).toEqual([2])
    expect(out[0]).toMatchObject({ kind: 'season', label: 'Saison 2' })
  })

  it('saute une saison déjà vue', () => {
    const t = tree([season(1, 1, { seen: 12 }), season(2, 2, { seen: 12 }), season(3, 3)])
    expect(ids(nextUp(t, 1))).toEqual([3])
  })

  // Une saison annoncée n'est pas une suite qu'on peut regarder ce soir.
  it('ne conseille jamais une saison pas encore sortie', () => {
    const t = tree([season(1, 1, { seen: 12 }), season(2, 2, { status: 'NOT_YET_RELEASED' }), season(3, 3)])
    expect(nextUp(t, 1)).toEqual([])
  })

  it('met la saison avant les films, les films avant les spin-off', () => {
    const t = tree([
      season(1, 1, { seen: 12 }, [
        { kind: 'spinoff', nodes: [node(30, { format: 'ONA' })] },
        { kind: 'film', nodes: [node(20)] }
      ]),
      season(2, 2)
    ])
    const out = nextUp(t, 1)
    expect(ids(out)).toEqual([2, 20, 30])
    expect(out.map((s) => s.label)).toEqual(['Saison 2', 'Film', 'Spin-off'])
  })

  // On vient de voir l'histoire : un récapitulatif n'est pas une suite.
  it('écarte les résumés', () => {
    const t = tree([season(1, 1, { seen: 12 }, [{ kind: 'resume', nodes: [node(40)] }])])
    expect(nextUp(t, 1)).toEqual([])
  })

  it('écarte ce qui est déjà vu', () => {
    const t = tree([season(1, 1, { seen: 12 }, [{ kind: 'film', nodes: [node(20, { seen: 1 }), node(21)] }])])
    expect(ids(nextUp(t, 1))).toEqual([21])
  })

  // Le cas de « Kaijuu 8-gou Movie » : un film terminé se situe sur sa saison.
  it('situe un film terminé sur la saison qui le porte', () => {
    const t = tree([
      season(1, 1, { seen: 12 }, [{ kind: 'film', nodes: [node(20, { seen: 1 }), node(21)] }]),
      season(2, 2)
    ])
    expect(ids(nextUp(t, 20))).toEqual([2, 21])
  })

  it('ne se conseille pas elle-même', () => {
    const t = tree([season(1, 1, {}, [{ kind: 'film', nodes: [node(20)] }])])
    expect(ids(nextUp(t, 20))).not.toContain(20)
  })

  it('ne rend rien pour une série absente de l’arbre', () => {
    expect(nextUp(tree([season(1, 1)]), 99)).toEqual([])
  })

  it('ne dépasse pas la limite', () => {
    const films = [...Array(8)].map((_, i) => node(100 + i))
    const t = tree([season(1, 1, { seen: 12 }, [{ kind: 'film', nodes: films }]), season(2, 2)])
    expect(nextUp(t, 1)).toHaveLength(NEXT_MAX)
  })

  // Un total inconnu ne doit pas faire passer une saison pour vue.
  it('ne tient pas pour finie une saison au total inconnu', () => {
    const t = tree([season(1, 1, { seen: 12 }), season(2, 2, { seen: 5, total: null })])
    expect(ids(nextUp(t, 1))).toEqual([2])
  })

  it('annonce la partie d’une saison scindée', () => {
    const t = tree([season(1, 1, { seen: 12 }), season(2, 1, { part: 2 })])
    expect(nextUp(t, 1)[0].label).toBe('Saison 1 · partie 2')
  })
})
