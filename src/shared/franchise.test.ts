import { describe, expect, it } from 'vitest'
import { branchOf, buildTree, type Edge, type Progress, type Spine } from './franchise'

const saison = (id: number, number: number, over: Partial<Spine> = {}): Spine => ({
  id,
  number,
  part: null,
  title: `Saison ${number}`,
  format: 'TV',
  episodes: 12,
  year: 2020 + number,
  cover: null,
  ...over
})

const arete = (relationType: string, id: number, format: string | null, title = `#${id}`): Edge => ({
  relationType,
  id,
  title,
  cover: null,
  format
})

const rien: Progress = { seen: 0, total: null, tracked: false }
const vus = (seen: number, total: number): Progress => ({ seen, total, tracked: true })

describe('branchOf', () => {
  it('range au format, pas au libellé', () => {
    expect(branchOf('SIDE_STORY', 'MOVIE', false)).toBe('film')
    expect(branchOf('SIDE_STORY', 'OVA', false)).toBe('ova')
    expect(branchOf('SIDE_STORY', 'TV', false)).toBe('spinoff')
  })

  // Un film qui continue l'histoire arrive par une arête « suite » : il ne
  // rentre pas dans la chaîne des saisons, il ne doit pas se perdre pour autant.
  it('rattrape un film arrivé par une suite', () => {
    expect(branchOf('SEQUEL', 'MOVIE', false)).toBe('film')
  })

  it('laisse le tronc au tronc', () => {
    expect(branchOf('SEQUEL', 'TV', true)).toBeNull()
    expect(branchOf('PREQUEL', 'TV', true)).toBeNull()
  })

  it('garde les remakes et les résumés à part', () => {
    expect(branchOf('ALTERNATIVE', 'TV', false)).toBe('alternative')
    expect(branchOf('SUMMARY', 'MOVIE', false)).toBe('resume')
  })

  it('écarte ce qui raconte autre chose', () => {
    for (const t of ['SOURCE', 'ADAPTATION', 'CHARACTER', 'OTHER', 'INVENTÉ']) {
      expect(branchOf(t, 'TV', false)).toBeNull()
    }
  })
})

describe('buildTree', () => {
  it('rend le tronc dans l’ordre, sans branche', () => {
    const tree = buildTree(
      [saison(1, 1), saison(2, 2)],
      () => [],
      () => rien
    )
    expect(tree.trunk.map((s) => s.id)).toEqual([1, 2])
    expect(tree.trunk[0].branches).toEqual([])
    expect(tree.count).toBe(2)
  })

  it('accroche les branches à leur saison', () => {
    const edges = new Map([[1, [arete('SIDE_STORY', 10, 'MOVIE'), arete('SIDE_STORY', 11, 'OVA')]]])
    const tree = buildTree(
      [saison(1, 1), saison(2, 2)],
      (id) => edges.get(id) ?? [],
      () => rien
    )
    expect(tree.trunk[0].branches.map((b) => b.kind)).toEqual(['film', 'ova'])
    expect(tree.trunk[1].branches).toEqual([])
  })

  // Sans ça, chaque saison apparaîtrait deux fois : à sa place, et sous la précédente.
  it('ne fait pas repousser une saison en branche', () => {
    const edges = new Map([[1, [arete('SEQUEL', 2, 'TV')]]])
    const tree = buildTree(
      [saison(1, 1), saison(2, 2)],
      (id) => edges.get(id) ?? [],
      () => rien
    )
    expect(tree.trunk[0].branches).toEqual([])
    expect(tree.count).toBe(2)
  })

  // Un film récapitulatif est souvent cité par toutes les saisons.
  it('ne place une série qu’une fois, sur la plus ancienne', () => {
    const film = arete('SIDE_STORY', 10, 'MOVIE')
    const edges = new Map([
      [1, [film]],
      [2, [film]]
    ])
    const tree = buildTree(
      [saison(1, 1), saison(2, 2)],
      (id) => edges.get(id) ?? [],
      () => rien
    )
    expect(tree.trunk[0].branches[0].nodes.map((n) => n.id)).toEqual([10])
    expect(tree.trunk[1].branches).toEqual([])
    expect(tree.count).toBe(3)
  })

  it('range les branches dans un ordre stable', () => {
    const edges = new Map([
      [
        1,
        [
          arete('SUMMARY', 12, 'MOVIE'),
          arete('ALTERNATIVE', 13, 'TV'),
          arete('SIDE_STORY', 10, 'MOVIE'),
          arete('SIDE_STORY', 11, 'OVA')
        ]
      ]
    ])
    const tree = buildTree(
      [saison(1, 1)],
      (id) => edges.get(id) ?? [],
      () => rien
    )
    expect(tree.trunk[0].branches.map((b) => b.kind)).toEqual(['film', 'ova', 'alternative', 'resume'])
  })

  it('trie les séries d’une branche par titre', () => {
    const edges = new Map([[1, [arete('SIDE_STORY', 10, 'MOVIE', 'Zéro'), arete('SIDE_STORY', 11, 'MOVIE', 'Alpha')]]])
    const tree = buildTree(
      [saison(1, 1)],
      (id) => edges.get(id) ?? [],
      () => rien
    )
    expect(tree.trunk[0].branches[0].nodes.map((n) => n.title)).toEqual(['Alpha', 'Zéro'])
  })

  it('additionne l’avancement du tronc et des branches', () => {
    const edges = new Map([[1, [arete('SIDE_STORY', 10, 'MOVIE')]]])
    const progres = new Map([
      [1, vus(6, 12)],
      [10, vus(1, 1)]
    ])
    const tree = buildTree(
      [saison(1, 1)],
      (id) => edges.get(id) ?? [],
      (id) => progres.get(id) ?? rien
    )
    expect(tree.seen).toBe(7)
    expect(tree.total).toBe(13)
  })

  // Un total inconnu ne doit pas devenir un zéro trompeur dans la somme.
  it('ignore un total inconnu au lieu de le compter', () => {
    const tree = buildTree(
      [saison(1, 1)],
      () => [],
      () => ({ seen: 3, total: null, tracked: true })
    )
    expect(tree.total).toBe(0)
    expect(tree.seen).toBe(3)
  })

  it('survit à une franchise vide', () => {
    expect(
      buildTree(
        [],
        () => [],
        () => rien
      )
    ).toEqual({ trunk: [], seen: 0, total: 0, count: 0 })
  })
})
