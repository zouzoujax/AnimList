import { describe, expect, it } from 'vitest'
import {
  cardOf,
  checkChosen,
  makeToken,
  MAX_CHOSEN,
  MIN_CHOSEN,
  isRemoteStatus,
  needsToken,
  remoteUrl,
  routeOf,
  safeEqual,
  tokenFrom,
  TOKEN_LENGTH
} from './remote'

describe('makeToken', () => {
  it('a la longueur annoncée', () => {
    expect(makeToken(new Uint8Array(32).fill(7))).toHaveLength(TOKEN_LENGTH)
  })

  // Un mot de passe qu'on recopie à la main sur un téléphone : « l » et « 1 »
  // confondus, c'est une tentative ratée qu'on ne comprend pas.
  it('évite les caractères qui se confondent à l’œil', () => {
    const token = makeToken(Uint8Array.from({ length: 32 }, (_, i) => i * 7))
    expect(token).not.toMatch(/[01lioIO]/)
    expect(token).toMatch(/^[a-z2-9]+$/)
  })

  it('change avec la source d’aléa', () => {
    const a = makeToken(Uint8Array.from({ length: 32 }, (_, i) => i))
    const b = makeToken(Uint8Array.from({ length: 32 }, (_, i) => i + 1))
    expect(a).not.toBe(b)
  })

  it('ne casse pas sur une source trop courte', () => {
    expect(makeToken(new Uint8Array(2))).toHaveLength(TOKEN_LENGTH)
  })
})

describe('safeEqual', () => {
  it('reconnaît l’égalité', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
  })

  it('refuse tout le reste', () => {
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'ab')).toBe(false)
    expect(safeEqual('', 'a')).toBe(false)
  })

  it('accepte deux vides', () => {
    expect(safeEqual('', '')).toBe(true)
  })
})

describe('tokenFrom', () => {
  it('lit le paramètre d’adresse', () => {
    expect(tokenFrom('/api/state?t=abc123', null)).toBe('abc123')
  })

  it('préfère l’en-tête, qui ne traîne pas dans l’historique', () => {
    expect(tokenFrom('/api/state?t=abc', 'Bearer xyz')).toBe('xyz')
    expect(tokenFrom('/api/state', 'bearer xyz')).toBe('xyz')
  })

  it('rend null quand il n’y en a pas', () => {
    expect(tokenFrom('/api/state', null)).toBe(null)
    expect(tokenFrom('/api/state?autre=1', null)).toBe(null)
    expect(tokenFrom('/api/state', 'Basic zzz')).toBe(null)
  })
})

describe('routeOf', () => {
  it('reconnaît les adresses prévues', () => {
    expect(routeOf('/')).toBe('page')
    expect(routeOf('/api/state')).toBe('state')
    expect(routeOf('/calendrier.ics')).toBe('ics')
    expect(routeOf('/api/tick')).toBe('tick')
    expect(routeOf('/api/open')).toBe('open')
    expect(routeOf('/api/watch')).toBe('watch')
    expect(routeOf('/api/trailer')).toBe('trailer')
    expect(routeOf('/api/control')).toBe('control')
    expect(routeOf('/api/player')).toBe('player')
    expect(routeOf('/api/library')).toBe('library')
    expect(routeOf('/api/discover')).toBe('discover')
    expect(routeOf('/api/add')).toBe('add')
    expect(routeOf('/api/status')).toBe('status')
    expect(routeOf('/api/episodes')).toBe('episodes')
    expect(routeOf('/api/franchise')).toBe('franchise')
  })

  it('tolère une barre en trop', () => {
    expect(routeOf('/api/state/')).toBe('state')
    expect(routeOf('//')).toBe('page')
  })

  // Une liste fermée, jamais un chemin traduit en fichier : c'est ce qui rend
  // impossible de faire servir autre chose que les réponses prévues.
  it('refuse tout le reste, remontées d’arborescence comprises', () => {
    expect(routeOf('/../../etc/passwd')).toBe('unknown')
    expect(routeOf('/api/state/../../secret')).toBe('unknown')
    expect(routeOf('/index.html')).toBe('unknown')
  })

  it('connaît les statistiques et le calendrier', () => {
    expect(routeOf('/api/stats')).toBe('stats')
    expect(routeOf('/api/calendar')).toBe('calendar')
    expect(routeOf('/api/stats/')).toBe('stats')
  })
})

describe('needsToken', () => {
  it('protège tout ce qui touche à la bibliothèque ou à la machine', () => {
    expect(needsToken('state')).toBe(true)
    expect(needsToken('tick')).toBe(true)
    expect(needsToken('open')).toBe(true)
    // Ouvrir une fenêtre sur le PC de quelqu'un d'autre est au moins aussi
    // intrusif que lire sa liste.
    expect(needsToken('watch')).toBe(true)
    expect(needsToken('trailer')).toBe(true)
    expect(needsToken('control')).toBe(true)
    expect(needsToken('player')).toBe(true)
    expect(needsToken('library')).toBe(true)
    expect(needsToken('discover')).toBe(true)
    expect(needsToken('add')).toBe(true)
    expect(needsToken('episodes')).toBe(true)
  })

  it('laisse la page se charger : c’est elle qui demande le mot de passe', () => {
    expect(needsToken('page')).toBe(false)
  })
})

describe('remoteUrl', () => {
  it('donne une adresse recopiable', () => {
    expect(remoteUrl('192.168.1.20', 8787, 'abc')).toBe('http://192.168.1.20:8787/?t=abc')
  })
})

/**
 * Un mot de passe choisi remplace un tirage au sort : c'est un affaiblissement
 * consenti, et ces règles sont ce qui en borne le prix. Elles se vérifient
 * ici, là où personne ne les contourne.
 */
describe('checkChosen', () => {
  it('accepte un mot de passe assez long et recopiable', () => {
    expect(checkChosen('canape2026')).toEqual({ ok: true, token: 'canape2026' })
    expect(checkChosen('mon-mot_de.passe~1')).toEqual({ ok: true, token: 'mon-mot_de.passe~1' })
  })

  it('ne retient pas les espaces autour', () => {
    expect(checkChosen('  canape2026  ')).toEqual({ ok: true, token: 'canape2026' })
  })

  it('refuse ce qui se devine en quelques essais', () => {
    expect(checkChosen('court').ok).toBe(false)
    expect(checkChosen('').ok).toBe(false)
    expect(checkChosen('a'.repeat(MIN_CHOSEN - 1)).ok).toBe(false)
    expect(checkChosen('a'.repeat(MIN_CHOSEN)).ok).toBe(true)
  })

  it('refuse ce qui ne tiendrait pas dans une adresse', () => {
    // Un espace, un accent, une esperluette : encodés dans le lien, ils ne se
    // recopient plus à la main sans se tromper.
    expect(checkChosen('mot de passe').ok).toBe(false)
    expect(checkChosen('motdepassé').ok).toBe(false)
    expect(checkChosen('mot&passe=1').ok).toBe(false)
    expect(checkChosen('a'.repeat(MAX_CHOSEN + 1)).ok).toBe(false)
  })

  it('dit pourquoi il refuse, en une phrase affichable', () => {
    const refus = checkChosen('abc')
    expect(refus.ok).toBe(false)
    if (!refus.ok) expect(refus.error.length).toBeGreaterThan(10)
  })

  it('donne un mot de passe qui traverse une adresse tel quel', () => {
    const chosen = checkChosen('canape2026')
    expect(chosen.ok).toBe(true)
    if (chosen.ok) {
      const url = remoteUrl('192.168.1.20', 8787, chosen.token)
      expect(tokenFrom(url, null)).toBe(chosen.token)
    }
  })
})

describe('isRemoteStatus', () => {
  it('n’accepte que les statuts de l’app', () => {
    expect(isRemoteStatus('paused')).toBe(true)
    expect(isRemoteStatus('completed')).toBe(true)
    expect(isRemoteStatus('deleted')).toBe(false)
    expect(isRemoteStatus(3)).toBe(false)
  })
})

describe('cardOf', () => {
  const base = {
    id: 1,
    idMal: null,
    title: { romaji: 'Naruto: Blood Prison', english: null, native: null },
    cover: { large: 'c.jpg', xl: '', color: '#e4a15d' },
    banner: null,
    popularity: 0,
    nextAiring: null,
    cachedAt: 0
  }

  it('date un film au jour et donne sa durée entière', () => {
    const card = cardOf({
      ...base,
      format: 'MOVIE',
      status: 'FINISHED',
      episodes: 1,
      duration: 102,
      season: 'SUMMER',
      seasonYear: 2011,
      startDate: { year: 2011, month: 7, day: 30 },
      genres: ['Action', 'Adventure'],
      studios: ['Studio Pierrot'],
      averageScore: 71,
      description: 'Naruto est accusé…',
      trailer: { id: 'abc', site: 'youtube' }
    })
    expect(card.facts).toEqual(['Film', '30 juillet 2011', '1 h 42'])
    expect(card).toMatchObject({ status: 'Terminé', studio: 'Studio Pierrot', score: 71, trailer: true })
  })

  it('date une série à sa saison et donne la durée par épisode', () => {
    const card = cardOf({
      ...base,
      format: 'TV',
      status: 'RELEASING',
      episodes: 24,
      duration: 24,
      season: 'FALL',
      seasonYear: 2026,
      startDate: { year: 2026, month: 10, day: 3 },
      genres: [],
      studios: [],
      averageScore: null,
      description: null,
      nextAiring: { episode: 5, airingAt: 1_790_000_000 },
      trailer: null
    })
    expect(card.facts).toEqual(['Série TV', 'Automne 2026', '24 épisodes', '24 min par épisode'])
    expect(card).toMatchObject({
      status: 'En diffusion',
      nextAiring: { episode: 5, at: 1_790_000_000_000 },
      trailer: false
    })
  })
})
