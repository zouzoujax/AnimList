import { describe, expect, it } from 'vitest'
import { nextEpisode, resumeTargets, shortcutLabel } from './resume'

describe('nextEpisode', () => {
  it('rend le premier non coché', () => {
    expect(nextEpisode(new Set([1, 2, 3]), 12)).toBe(4)
    expect(nextEpisode(new Set(), 12)).toBe(1)
  })

  it('saute les trous', () => {
    expect(nextEpisode(new Set([1, 3, 4]), 12)).toBe(2)
  })

  it('rend null quand tout est vu', () => {
    expect(nextEpisode(new Set([1, 2]), 2)).toBe(null)
  })

  // Une série en cours de diffusion n'a pas toujours de total annoncé.
  it('avance quand même sans total connu', () => {
    expect(nextEpisode(new Set([1, 2]), null)).toBe(3)
    expect(nextEpisode(new Set([1, 2]), 0)).toBe(3)
  })
})

describe('resumeTargets', () => {
  const media = new Map([
    [1, { title: 'Frieren', episodes: 28 }],
    [2, { title: 'Bocchi', episodes: 12 }],
    [3, { title: 'Fini', episodes: 2 }]
  ])

  it('ne retient que ce qui est en cours', () => {
    const found = resumeTargets(
      [
        { animeId: 1, status: 'watching', updatedAt: 200 },
        { animeId: 2, status: 'planned', updatedAt: 300 }
      ],
      media,
      new Map()
    )
    expect(found.map((t) => t.animeId)).toEqual([1])
  })

  it('classe du plus récemment touché au plus ancien', () => {
    const found = resumeTargets(
      [
        { animeId: 1, status: 'watching', updatedAt: 100 },
        { animeId: 2, status: 'watching', updatedAt: 900 }
      ],
      media,
      new Map()
    )
    expect(found.map((t) => t.animeId)).toEqual([2, 1])
  })

  // Une série cochée jusqu'au bout n'a plus d'épisode à reprendre : proposer
  // un raccourci vers elle enverrait sur du vide.
  it('écarte une série sans épisode suivant', () => {
    const found = resumeTargets(
      [{ animeId: 3, status: 'watching', updatedAt: 100 }],
      media,
      new Map([[3, new Set([1, 2])]])
    )
    expect(found).toEqual([])
  })

  it('donne bien l’épisode où reprendre', () => {
    const found = resumeTargets(
      [{ animeId: 1, status: 'watching', updatedAt: 100 }],
      media,
      new Map([[1, new Set([1, 2, 3, 4])]])
    )
    expect(found[0].episode).toBe(5)
  })

  it('ignore une série dont la fiche manque', () => {
    expect(resumeTargets([{ animeId: 99, status: 'watching', updatedAt: 1 }], media, new Map())).toEqual([])
  })

  it('borne la liste', () => {
    const many = [1, 2, 3].map((id) => ({ animeId: id, status: 'watching', updatedAt: id }))
    expect(resumeTargets(many, media, new Map(), 2)).toHaveLength(2)
  })
})

describe('shortcutLabel', () => {
  const target = { animeId: 1, title: 'Frieren', episode: 12, updatedAt: 0 }

  it('garde le titre entier quand il tient', () => {
    expect(shortcutLabel(target)).toBe('Frieren — ép. 12')
  })

  // L'épisode est la seule chose qui change d'un raccourci à l'autre : c'est
  // lui qui doit survivre à la coupe, pas la fin du titre.
  it('coupe le titre, jamais l’épisode', () => {
    const long = { ...target, title: 'Kono Subarashii Sekai ni Shukufuku wo! Kurenai Densetsu' }
    const label = shortcutLabel(long)
    expect(label.length).toBeLessThanOrEqual(50)
    expect(label).toContain('ép. 12')
    expect(label).toContain('…')
  })

  it('coupe au mot plutôt qu’au milieu d’un mot', () => {
    const title = 'Un titre assez long pour devoir etre raccourci ici'
    const kept = shortcutLabel({ ...target, title }).split('…')[0]
    // Ce qui reste doit être un début du titre s'arrêtant sur un mot entier :
    // « devoir etre », jamais « devoir et ».
    expect(title.startsWith(kept)).toBe(true)
    expect(title[kept.length]).toBe(' ')
  })
})
