import { describe, expect, it } from 'vitest'
import { buildProfile, highlights, likingOf, MIN_SAMPLE, scoreAgainst, trustInScores, type Rated } from './taste'

const rated = (patch: Partial<Rated>): Rated => ({
  genres: [],
  studios: [],
  score: null,
  status: 'completed',
  favorite: false,
  rewatches: 0,
  emotions: 0,
  ...patch
})

describe('likingOf', () => {
  it('prend la note quand il y en a une, six étant le point neutre', () => {
    expect(likingOf(rated({ score: 6 }))).toBeCloseTo(0)
    expect(likingOf(rated({ score: 10 }))).toBeCloseTo(1)
    expect(likingOf(rated({ score: 2 }))).toBeCloseTo(-1)
  })

  it('retombe sur le statut quand rien n’est noté', () => {
    expect(likingOf(rated({ status: 'dropped' }))).toBeLessThan(0)
    expect(likingOf(rated({ status: 'completed' }))).toBeGreaterThan(0)
  })

  // Y être retourné vaut mieux que n'importe quelle note.
  it('compte les revisionnages et les favoris', () => {
    expect(likingOf(rated({ score: 7, rewatches: 2 }))).toBeGreaterThan(likingOf(rated({ score: 7 })))
    expect(likingOf(rated({ score: 7, favorite: true }))).toBeGreaterThan(likingOf(rated({ score: 7 })))
  })

  it('ne sort jamais de l’intervalle', () => {
    expect(likingOf(rated({ score: 10, favorite: true, rewatches: 5, emotions: 8 }))).toBe(1)
    expect(likingOf(rated({ score: 1 }))).toBe(-1)
  })
})

describe('buildProfile', () => {
  it('rend un profil vide sans planter sur une bibliothèque vide', () => {
    expect(buildProfile([])).toEqual({ genres: [], studios: [], sample: 0, scored: 0, mean: 0, spread: 0 })
  })

  // Le cœur du principe : une intention n'est pas un avis.
  it('ignore les séries seulement prévues', () => {
    const profile = buildProfile([
      rated({ genres: ['Drama'], score: 9 }),
      rated({ genres: ['Ecchi'], status: 'planned' })
    ])
    expect(profile.sample).toBe(1)
    expect(profile.genres.map((f) => f.name)).toEqual(['Drama'])
  })

  it('sépare ce qui est aimé de ce qui ne l’est pas', () => {
    const rows: Rated[] = [
      ...Array.from({ length: 6 }, () => rated({ genres: ['Drama'], score: 9 })),
      ...Array.from({ length: 6 }, () => rated({ genres: ['Ecchi'], score: 3 }))
    ]
    const profile = buildProfile(rows)
    const drama = profile.genres.find((f) => f.name === 'Drama')
    const ecchi = profile.genres.find((f) => f.name === 'Ecchi')
    expect(drama!.lift).toBeGreaterThan(0)
    expect(ecchi!.lift).toBeLessThan(0)
    expect(profile.genres[0].name).toBe('Drama')
  })

  // Quelqu'un qui note tout haut n'aime pas tout : rien ne doit ressortir.
  it('ne voit pas de préférence là où tout est noté pareil', () => {
    const rows = [
      ...Array.from({ length: 5 }, () => rated({ genres: ['Action'], score: 8 })),
      ...Array.from({ length: 5 }, () => rated({ genres: ['Comedy'], score: 8 }))
    ]
    for (const facet of buildProfile(rows).genres) expect(Math.abs(facet.lift)).toBeLessThan(0.001)
  })

  // Un genre vu une seule fois ne doit pas peser autant qu'un genre vu dix fois.
  it('rabat vers zéro ce qui repose sur une seule série', () => {
    const rows = [
      ...Array.from({ length: 10 }, () => rated({ genres: ['Drama'], score: 9 })),
      rated({ genres: ['Horror'], score: 9 }),
      ...Array.from({ length: 10 }, () => rated({ genres: ['Ecchi'], score: 3 }))
    ]
    const profile = buildProfile(rows)
    const drama = profile.genres.find((f) => f.name === 'Drama')!
    const horror = profile.genres.find((f) => f.name === 'Horror')!
    expect(horror.lift).toBeGreaterThan(0)
    expect(horror.lift).toBeLessThan(drama.lift / 2)
  })
})

describe('scoreAgainst', () => {
  const profile = buildProfile([
    ...Array.from({ length: 8 }, () => rated({ genres: ['Drama', 'Psychological'], studios: ['Bones'], score: 9 })),
    ...Array.from({ length: 8 }, () => rated({ genres: ['Ecchi'], studios: ['Studio Z'], score: 3 }))
  ])

  it('classe au-dessus ce qui ressemble à ce qu’on aime', () => {
    const good = scoreAgainst(profile, { genres: ['Drama'], studios: ['Bones'], averageScore: 80 })
    const bad = scoreAgainst(profile, { genres: ['Ecchi'], studios: ['Studio Z'], averageScore: 80 })
    expect(good.score).toBeGreaterThan(bad.score)
  })

  it('dit pourquoi, et seulement en bien', () => {
    const good = scoreAgainst(profile, { genres: ['Drama'], studios: ['Bones'], averageScore: 80 })
    expect(good.reasons[0]).toContain('tu notes haut')
    expect(good.reasons.join(' ')).toContain('drama')
    expect(good.reasons.join(' ')).toContain('Bones')

    const bad = scoreAgainst(profile, { genres: ['Ecchi'], studios: ['Studio Z'], averageScore: 80 })
    expect(bad.reasons).toEqual([])
  })

  // Sinon une série à six genres gagnerait juste parce qu'elle en a six.
  it('moyenne les genres au lieu de les additionner', () => {
    const focused = scoreAgainst(profile, { genres: ['Drama'], studios: [], averageScore: null })
    const diluted = scoreAgainst(profile, { genres: ['Drama', 'Ecchi'], studios: [], averageScore: null })
    expect(focused.score).toBeGreaterThan(diluted.score)
  })

  // Un genre jamais rencontré ne dit rien : ni en bien, ni en mal. Il ne doit
  // donc ni faire monter une série, ni la punir d'être inhabituelle.
  it('ignore un genre inconnu du profil au lieu de le compter contre', () => {
    const known = scoreAgainst(profile, { genres: ['Drama'], studios: [], averageScore: null })
    const withUnknown = scoreAgainst(profile, { genres: ['Drama', 'Mecha'], studios: [], averageScore: null })
    expect(withUnknown.score).toBeCloseTo(known.score)
    expect(scoreAgainst(profile, { genres: ['Mecha'], studios: [], averageScore: null }).reasons).toEqual([])
  })
})

// Le cas relevé sur une vraie bibliothèque : 107 séries, zéro note. Toutes les
// appréciations valent alors la même chose et l'axe des notes est muet.
describe('une bibliothèque sans aucune note', () => {
  const rows = [
    ...Array.from({ length: 40 }, () => rated({ genres: ['Comedy', 'Action'], studios: ['bones'] })),
    ...Array.from({ length: 4 }, () => rated({ genres: ['Mystery'], studios: ['Studio Z'] }))
  ]
  const profile = buildProfile(rows)

  it('ne fait pas confiance à des notes qui n’existent pas', () => {
    expect(profile.scored).toBe(0)
    expect(profile.spread).toBeCloseTo(0)
    expect(trustInScores(profile)).toBe(0)
  })

  // Sans le second axe, tous les écarts tombaient à trois millièmes et le
  // classement revenait à tirer au sort.
  it('classe quand même, sur ce qui est le plus regardé', () => {
    const usual = scoreAgainst(profile, { genres: ['Comedy'], studios: ['bones'], averageScore: null })
    const rare = scoreAgainst(profile, { genres: ['Mystery'], studios: ['Studio Z'], averageScore: null })
    expect(usual.score).toBeGreaterThan(rare.score)
  })

  it('dit d’où vient le classement, sans prétendre lire des notes', () => {
    const usual = scoreAgainst(profile, { genres: ['Comedy'], studios: ['bones'], averageScore: null })
    expect(usual.reasons[0]).toContain('tu regardes beaucoup')
    expect(usual.reasons.join(' ')).not.toContain('notes haut')
  })

  it('a bien quelque chose à mettre en avant', () => {
    expect(highlights(profile).map((f) => f.name)).toContain('Comedy')
  })
})

describe('trustInScores', () => {
  it('monte avec des avis tranchés', () => {
    const flat = buildProfile(Array.from({ length: 10 }, () => rated({ genres: ['Action'], score: 8 })))
    const sharp = buildProfile([
      ...Array.from({ length: 5 }, () => rated({ genres: ['Action'], score: 10 })),
      ...Array.from({ length: 5 }, () => rated({ genres: ['Ecchi'], score: 2 }))
    ])
    expect(trustInScores(flat)).toBeCloseTo(0)
    expect(trustInScores(sharp)).toBe(1)
  })
})

describe('highlights', () => {
  it('n’expose que ce qui repose sur au moins deux séries', () => {
    const profile = buildProfile([
      ...Array.from({ length: 6 }, () => rated({ genres: ['Drama'], score: 9 })),
      rated({ genres: ['Horror'], score: 9 }),
      ...Array.from({ length: 6 }, () => rated({ genres: ['Ecchi'], score: 3 }))
    ])
    expect(highlights(profile).map((f) => f.name)).toEqual(['Drama'])
  })
})

describe('MIN_SAMPLE', () => {
  it('reste un seuil sérieux', () => {
    expect(MIN_SAMPLE).toBeGreaterThanOrEqual(10)
  })
})
