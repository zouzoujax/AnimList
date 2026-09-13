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

  // Le cas réel de Kaiju No. 8 : le spécial et le spin-off sont sortis avant
  // la saison 2, le film récapitulatif est écarté.
  it('range les conseils par date de sortie', () => {
    const t = tree([
      season(1, 1, { seen: 12 }, [
        { kind: 'ova', nodes: [node(20, { format: 'SPECIAL', date: 20250328 })] },
        { kind: 'spinoff', nodes: [node(30, { format: 'ONA', date: 20241206 })] },
        { kind: 'resume', nodes: [node(40, { date: 20250328 })] }
      ]),
      season(2, 2, { date: 20250719 })
    ])
    const out = nextUp(t, 1)
    expect(ids(out)).toEqual([30, 20, 2])
    expect(out.map((s) => s.label)).toEqual(['Spin-off', 'OVA ou spécial', 'Saison 2'])
  })

  it('place après la saison suivante ce qui est sorti après elle', () => {
    const t = tree([
      season(1, 1, { seen: 12 }, [{ kind: 'film', nodes: [node(20, { date: 20260101 })] }]),
      season(2, 2, { date: 20250719 })
    ])
    expect(ids(nextUp(t, 1))).toEqual([2, 20])
  })

  it('met les sorties sans date après celles qui en ont une', () => {
    const t = tree([
      season(1, 1, { seen: 12 }, [{ kind: 'film', nodes: [node(20), node(21, { date: 20230101 })] }]),
      season(2, 2, { date: 20250719 })
    ])
    expect(ids(nextUp(t, 1))).toEqual([21, 2, 20])
  })

  // Quand la place manque, c'est la sortie la plus tardive qui cède.
  it('écarte les sorties les plus tardives quand la place manque', () => {
    const films = [20240101, 20230101, 20220101, 20210101].map((d, i) => node(100 + i, { date: d }))
    const t = tree([season(1, 1, { seen: 12 }, [{ kind: 'film', nodes: films }]), season(2, 2, { date: 20250101 })])
    expect(ids(nextUp(t, 1, 3))).toEqual([103, 102, 2])
  })

  // Sans aucune date, l'ordre de l'arbre : ce qui se rattache à la saison finie, puis la suivante.
  it('sans date, met les films, puis les spin-off, puis la saison suivante', () => {
    const t = tree([
      season(1, 1, { seen: 12 }, [
        { kind: 'spinoff', nodes: [node(30, { format: 'ONA' })] },
        { kind: 'film', nodes: [node(20)] }
      ]),
      season(2, 2)
    ])
    const out = nextUp(t, 1)
    expect(ids(out)).toEqual([20, 30, 2])
    expect(out.map((s) => s.label)).toEqual(['Film', 'Spin-off', 'Saison 2'])
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
    expect(ids(nextUp(t, 20))).toEqual([21, 2])
  })

  it('ne se conseille pas elle-même', () => {
    const t = tree([season(1, 1, {}, [{ kind: 'film', nodes: [node(20)] }])])
    expect(ids(nextUp(t, 20))).not.toContain(20)
  })

  it('ne rend rien pour une série absente de l’arbre', () => {
    expect(nextUp(tree([season(1, 1)]), 99)).toEqual([])
  })

  it('ne dépasse pas la limite', () => {
    const films = [...Array(NEXT_MAX + 4)].map((_, i) => node(100 + i))
    const t = tree([season(1, 1, { seen: 12 }, [{ kind: 'film', nodes: films }])])
    expect(nextUp(t, 1)).toHaveLength(NEXT_MAX)
  })

  // Le piège de la saison en dernier : avec trois films ou plus, la suite de
  // l'histoire aurait été coupée. Ce sont les films qui cèdent la place.
  it('garde toujours la saison suivante, même quand les films débordent', () => {
    const films = [...Array(NEXT_MAX + 4)].map((_, i) => node(100 + i))
    const t = tree([season(1, 1, { seen: 12 }, [{ kind: 'film', nodes: films }]), season(2, 2)])
    const out = nextUp(t, 1)
    expect(out).toHaveLength(NEXT_MAX)
    expect(out[NEXT_MAX - 1]).toMatchObject({ id: 2, kind: 'season' })
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
