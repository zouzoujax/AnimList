import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La reprise après une panne, telle qu'elle est câblée dans le client AniList.
 *
 * Les règles sont testées à part (`shared/api-recovery`) ; ici on vérifie
 * qu'elles sont bien appliquées : combien d'appels partent pendant une
 * coupure, et ce qui repart au retour. Un faux `fetch` et de fausses horloges
 * suffisent — le module est rechargé à chaque test, son état est global.
 */

type Api = typeof import('./anilist')

const PROBE = 'query { Media(id: 1) { id } }'

/** Une réponse AniList valide, pour la sonde comme pour le calendrier. */
function okResponse(): Response {
  return new Response(JSON.stringify({ data: { Media: { id: 1 }, Page: { airingSchedules: [] } } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

let online = false
/** AniList répond, mais pour dire qu'il a coupé son API (septembre 2026). */
let disabled = false
const calls: string[] = []

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetModules()
  online = false
  disabled = false
  calls.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init: { body: string }) => {
      const { query } = JSON.parse(init.body) as { query: string }
      calls.push(query === PROBE ? 'probe' : 'query')
      if (disabled) {
        return Promise.resolve(new Response(JSON.stringify({ errors: [{ message: 'API disabled' }] }), { status: 403 }))
      }
      if (!online) return Promise.reject(new TypeError('fetch failed'))
      return Promise.resolve(okResponse())
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function load(): Promise<Api> {
  return import('./anilist')
}

/** Coupe le réseau et laisse le client constater la panne. */
async function goOffline(api: Api): Promise<void> {
  const failed = api.airing([1], 0, 1).catch(() => 'échec')
  // Le second essai part 1,5 s après le premier.
  await vi.advanceTimersByTimeAsync(1500)
  expect(await failed).toBe('échec')
  expect(api.apiStatus().state).toBe('offline')
}

/** La file espace ses départs : on avance l'horloge le temps qu'elle réponde. */
async function failure(p: Promise<unknown>): Promise<boolean> {
  const failed = p.then(
    () => false,
    () => true
  )
  await vi.advanceTimersByTimeAsync(1000)
  return failed
}

const probes = (): number => calls.filter((c) => c === 'probe').length

describe('la sonde pendant une coupure', () => {
  it('attend trente secondes, puis de plus en plus longtemps', async () => {
    const api = await load()
    await goOffline(api)

    const gaps: number[] = []
    for (let i = 0; i < 4; i += 1) {
      const wait = api.apiStatus().probeAt! - Date.now()
      gaps.push(wait)
      // Le sondage part à l'heure dite, et son nouvel essai réseau 1,5 s après.
      await vi.advanceTimersByTimeAsync(wait + 1500)
      expect(probes()).toBe(2 * (i + 1))
    }
    expect(gaps).toEqual([30_000, 60_000, 120_000, 240_000])
  })

  it('ne dépasse jamais dix minutes entre deux essais', async () => {
    const api = await load()
    await goOffline(api)
    // Deux heures de coupure : 30 s, 1, 2, 4, 8 min (15 min 30 en tout),
    // puis toutes les dix minutes — une petite quinzaine d'essais, pas mille.
    await vi.advanceTimersByTimeAsync(2 * 3600_000)
    expect(probes() / 2).toBe(15)
    expect(api.apiStatus().probeAt! - Date.now()).toBeLessThanOrEqual(10 * 60_000)
  })
})

describe('la sonde pendant une pause déclarée', () => {
  it('se tait jusqu’à la fin de la pause, et les pages aussi', async () => {
    const api = await load()
    disabled = true
    expect(await failure(api.airing([1], 0, 1))).toBe(true)
    const status = api.apiStatus()
    expect(status.state).toBe('paused')
    // Quinze minutes de silence promises : la sonde ne part pas avant.
    expect(status.probeAt).toBe(status.until)
    expect(status.until! - Date.now()).toBeGreaterThan(14 * 60_000)

    // Une page rouverte entre-temps n'envoie rien.
    expect(await failure(api.airing([2], 0, 1))).toBe(true)
    await vi.advanceTimersByTimeAsync(14 * 60_000)
    expect(calls).toEqual(['query'])

    // La pause finie, la sonde part, voit le service revenu, et rattrape.
    disabled = false
    online = true
    await vi.advanceTimersByTimeAsync(2 * 60_000)
    expect(api.apiStatus()).toEqual({ state: 'ok' })
    expect(calls.slice(0, 2)).toEqual(['query', 'probe'])
    expect(calls.filter((c) => c === 'query')).toHaveLength(3)
  })
})

describe('le retour du service', () => {
  it('rejoue ce qui a échoué et prévient les modules abonnés', async () => {
    const api = await load()
    const back = vi.fn()
    api.onApiRecovered(back)
    await goOffline(api)
    expect(api.apiStatus().pending).toBe(1)

    online = true
    calls.length = 0
    await vi.advanceTimersByTimeAsync(30_000)
    await vi.advanceTimersByTimeAsync(5000)

    expect(api.apiStatus()).toEqual({ state: 'ok' })
    expect(back).toHaveBeenCalledTimes(1)
    // La sonde, puis le calendrier resté en panne.
    expect(calls).toEqual(['probe', 'query'])
    // Rejoué et gardé : relire la même page ne coûte plus rien.
    await api.airing([1], 0, 1)
    expect(calls).toHaveLength(2)
  })

  it('« Réessayer » n’attend pas la sonde', async () => {
    const api = await load()
    await goOffline(api)
    online = true
    calls.length = 0
    const status = await api.probeNow()
    expect(status.state).toBe('ok')
    expect(calls[0]).toBe('probe')
  })

  it('un nouvel échec de « Réessayer » réarme la sonde', async () => {
    const api = await load()
    await goOffline(api)
    const tried = api.probeNow()
    await vi.advanceTimersByTimeAsync(2000)
    const status = await tried
    expect(status.state).toBe('offline')
    expect(status.probeAt).toBeGreaterThan(Date.now())
  })
})
