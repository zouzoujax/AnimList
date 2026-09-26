import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Media } from '@shared/types'

/**
 * La télécommande de bout en bout : le vrai serveur HTTP, sur un port à part,
 * devant un registre jetable. Ce qu'un téléphone envoie arrive vraiment dans
 * le registre, et ce qu'un agenda lit sort vraiment du serveur.
 *
 * Tout ce qui ouvrirait une fenêtre ou irait sur le réseau est remplacé : ce
 * n'est pas ce qu'on éprouve ici.
 */

vi.mock('node:os', async (original) => ({
  ...(await original<typeof import('node:os')>()),
  // Une adresse privée, qu'il y ait ou non un réseau sur la machine de test.
  networkInterfaces: () => ({ lan: [{ family: 'IPv4', internal: false, address: '192.168.1.20' }] })
}))
vi.mock('./anilist', () => ({ browse: vi.fn(), refreshMedia: vi.fn(() => Promise.resolve([])) }))
vi.mock('./animesama', () => ({ aimFor: vi.fn(), resolve: vi.fn() }))
vi.mock('./franchise', () => ({ franchiseTree: vi.fn() }))
vi.mock('./trailer', () => ({ openTrailerWindow: vi.fn() }))
vi.mock('./watch-window', () => ({
  openAnimeSamaEpisode: vi.fn(),
  playerChoices: vi.fn(),
  switchPlayer: vi.fn(),
  watchWindow: vi.fn(() => null)
}))
vi.mock('./binge', () => ({ sessionAutoSkip: vi.fn(() => false), setSessionAutoSkip: vi.fn() }))
vi.mock('./playing', () => ({ playerCommand: vi.fn(), playerState: vi.fn(() => null) }))

const { initStore, resetAll, setEntry, setPrefs, snapshot, flush } = await import('./store')
const { startRemote, stopRemote } = await import('./remote')

/** Loin du port de l'app : une AnimeList ouverte à côté n'empêche pas le test. */
const PORT = 18787
const PASSWORD = 'essai-telecommande'
const base = `http://127.0.0.1:${PORT}`

const HOUR = 3600
const inHours = (h: number): number => Math.floor(Date.now() / 1000) + h * HOUR

function media(id: number, over: Partial<Media> = {}): Media {
  return {
    id,
    idMal: null,
    title: { romaji: `Série ${id}`, english: null, native: null },
    cover: { large: '', xl: '', color: null },
    banner: null,
    format: 'TV',
    status: 'FINISHED',
    episodes: 12,
    duration: 24,
    season: null,
    seasonYear: null,
    startDate: null,
    genres: [],
    studios: [],
    averageScore: null,
    popularity: 0,
    description: null,
    nextAiring: null,
    trailer: null,
    cachedAt: Date.now(),
    ...over
  }
}

async function post(path: string, body: unknown, password = PASSWORD): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
    body: JSON.stringify(body)
  })
}

const statusOf = (id: number): string | undefined => snapshot().entries.find((e) => e.animeId === id)?.status

beforeAll(async () => {
  initStore()
  setPrefs({ remotePassword: PASSWORD })
  const status = await startRemote(PORT)
  expect(status.error).toBeNull()
})

afterAll(async () => {
  stopRemote()
  await flush()
})

beforeEach(() => {
  resetAll()
  setPrefs({ remotePassword: PASSWORD, notifyLeadMinutes: 0 })
  // En diffusion : l'épisode 5 sort dans trois heures, sur douze.
  setEntry(
    1,
    { status: 'watching' },
    media(1, { status: 'RELEASING', nextAiring: { episode: 5, airingAt: inHours(3) } })
  )
  // Fini de sortir.
  setEntry(2, { status: 'watching' }, media(2))
})

describe('changer le statut depuis le téléphone', () => {
  it('met en pause, abandonne et reprend', async () => {
    for (const next of ['paused', 'dropped', 'watching'] as const) {
      const res = await post('/api/status', { id: 2, status: next })
      expect(res.status).toBe(200)
      expect(statusOf(2)).toBe(next)
    }
  })

  it('termine une série sortie en entier', async () => {
    expect((await post('/api/status', { id: 2, status: 'completed' })).status).toBe(200)
    expect(statusOf(2)).toBe('completed')
  })

  it('refuse « Terminé » tant que la série paraît, comme sur le PC', async () => {
    const res = await post('/api/status', { id: 1, status: 'completed' })
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toMatch(/pas fini de sortir/)
    expect(statusOf(1)).toBe('watching')
  })

  it('refuse un statut inconnu, une série absente et un mauvais mot de passe', async () => {
    expect((await post('/api/status', { id: 2, status: 'rewatching' })).status).toBe(400)
    expect((await post('/api/status', { id: 99, status: 'paused' })).status).toBe(404)
    expect((await post('/api/status', { id: 2, status: 'paused' }, 'faux')).status).toBe(401)
    expect(statusOf(2)).toBe('watching')
  })
})

describe('le calendrier .ics', () => {
  const ics = async (): Promise<string> => {
    const res = await fetch(`${base}/calendrier.ics?t=${PASSWORD}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/calendar/)
    return res.text()
  }

  it('porte une alarme à l’heure de la sortie', async () => {
    const body = await ics()
    expect(body).toContain('Série 1')
    expect(body).toContain('BEGIN:VALARM')
    expect(body).toContain('TRIGGER:-PT0M')
  })

  it('avance l’alarme comme la notification du PC', async () => {
    setPrefs({ notifyLeadMinutes: 15 })
    expect(await ics()).toContain('TRIGGER:-PT15M')
  })

  it('ne sonne pas pour une série mise en silence', async () => {
    setEntry(1, { notify: false })
    const body = await ics()
    expect(body).toContain('Série 1')
    expect(body).not.toContain('BEGIN:VALARM')
  })

  it('refuse sans mot de passe', async () => {
    expect((await fetch(`${base}/calendrier.ics`)).status).toBe(401)
  })
})

describe('allumer la télécommande', () => {
  it('dit en clair que le port est déjà pris', async () => {
    const { createServer } = await import('node:net')
    const squatter = createServer()
    await new Promise<void>((r) => squatter.listen(PORT + 1, '0.0.0.0', r))
    stopRemote()
    try {
      const status = await startRemote(PORT + 1)
      expect(status.on).toBe(false)
      expect(status.error).toMatch(/déjà pris.*autre fenêtre AnimeList/)
    } finally {
      squatter.close()
      stopRemote()
      expect((await startRemote(PORT)).error).toBeNull()
    }
  })
})
