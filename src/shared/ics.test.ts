import { describe, expect, it } from 'vitest'
import { buildIcs, type IcsEvent } from './ics'

const now = Date.UTC(2026, 8, 24, 10, 0)
const ev = (over: Partial<IcsEvent> = {}): IcsEvent => ({
  animeId: 1,
  title: 'Frieren',
  episode: 12,
  airingAt: Date.UTC(2026, 8, 25, 18, 30),
  minutes: 24,
  ...over
})

/** Déplie les lignes comme le fait un agenda, pour pouvoir les relire. */
const unfold = (ics: string): string[] => ics.replace(/\r\n /g, '').split('\r\n')

describe('buildIcs', () => {
  it('produit un calendrier lisible par un agenda', () => {
    const lines = unfold(buildIcs([ev()], now))
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines).toContain('VERSION:2.0')
    expect(lines).toContain('END:VCALENDAR')
    expect(lines).toContain('DTSTART:20260925T183000Z')
    expect(lines).toContain('DTEND:20260925T185400Z')
    expect(lines).toContain('DTSTAMP:20260924T100000Z')
    expect(lines).toContain('SUMMARY:Frieren — épisode 12')
  })

  it('termine chaque ligne par CRLF', () => {
    const ics = buildIcs([ev()], now)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.includes('\n\n')).toBe(false)
  })

  it('donne à chaque épisode une identité stable', () => {
    const a = unfold(buildIcs([ev()], now)).find((l) => l.startsWith('UID:'))
    const b = unfold(buildIcs([ev()], now + 86_400_000)).find((l) => l.startsWith('UID:'))
    expect(a).toBe(b)
    expect(a).toBe('UID:animelist-1-12@animelist.local')
  })

  it('range les événements par heure de diffusion', () => {
    const tard = ev({ animeId: 2, episode: 3, airingAt: Date.UTC(2026, 8, 26, 12, 0) })
    const tôt = ev({ animeId: 3, episode: 7, airingAt: Date.UTC(2026, 8, 24, 12, 0) })
    const uids = unfold(buildIcs([tard, tôt], now)).filter((l) => l.startsWith('UID:'))
    expect(uids).toEqual(['UID:animelist-3-7@animelist.local', 'UID:animelist-2-3@animelist.local'])
  })

  it('protège les caractères réservés d’un titre', () => {
    const lines = unfold(buildIcs([ev({ title: 'Fate/stay night, Unlimited; Blade' })], now))
    expect(lines).toContain('SUMMARY:Fate/stay night\\, Unlimited\\; Blade — épisode 12')
  })

  it('plie les lignes longues sans couper un caractère', () => {
    const title = 'あの日見た花の名前を僕達はまだ知らない'.repeat(3)
    const ics = buildIcs([ev({ title })], now)
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(76)
    }
    expect(unfold(ics)).toContain(`SUMMARY:${title} — épisode 12`)
  })

  it('reste valide sans aucune diffusion', () => {
    const lines = unfold(buildIcs([], now))
    expect(lines).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//AnimeList//Diffusions//FR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:AnimeList — mes diffusions',
      'REFRESH-INTERVAL;VALUE=DURATION:PT4H',
      'X-PUBLISHED-TTL:PT4H',
      'END:VCALENDAR',
      ''
    ])
  })

  it('donne une épaisseur à un épisode sans durée connue', () => {
    const lines = unfold(buildIcs([ev({ minutes: 0 })], now))
    expect(lines).toContain('DTEND:20260925T185400Z')
  })
})
