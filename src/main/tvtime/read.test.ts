import { describe, expect, it } from 'vitest'
import { parseExport, parseStamp } from './read'

const SHOWS = `tv_show_id,tv_show_name,is_favorited
121361,Attack on Titan,1
81797,One Piece,0
`

const TRACKING = `s_id,season_number,episode_number,created_at
121361,1,1,2020-03-01 20:00:00
121361,1,2,2020-03-02 20:00:00
121361,2,1,2021-05-10 18:30:00
`

describe('parseStamp', () => {
  it('reads the export date format', () => {
    // "YYYY-MM-DD HH:MM:SS" is not what Date.parse expects; the space must
    // become a T or every timestamp comes back NaN.
    expect(parseStamp('2020-03-01 20:00:00')).toBe(Date.parse('2020-03-01T20:00:00'))
  })

  it('returns null rather than today for junk', () => {
    expect(parseStamp('')).toBeNull()
    expect(parseStamp(null)).toBeNull()
    expect(parseStamp('pas une date')).toBeNull()
  })
})

describe('parseExport', () => {
  it('lists followed series with their episodes', () => {
    const shows = parseExport({ shows: SHOWS, tracking: TRACKING })
    expect(shows).toHaveLength(2)
    expect(shows[0]).toMatchObject({ id: '121361', name: 'Attack on Titan', favorite: true, watched: 3 })
    expect(shows[1]).toMatchObject({ name: 'One Piece', favorite: false, watched: 0 })
  })

  it('groups episodes by season, in order', () => {
    const [aot] = parseExport({ shows: SHOWS, tracking: TRACKING })
    expect(aot.seasons).toHaveLength(2)
    expect(aot.seasons[0]).toHaveLength(2)
    expect(aot.seasons[1]).toHaveLength(1)
  })

  it('sorts seasons and episodes whatever the row order', () => {
    const shuffled = `s_id,season_number,episode_number,created_at
1,2,1,2021-01-01 10:00:00
1,1,3,2020-01-03 10:00:00
1,1,1,2020-01-01 10:00:00
1,1,2,2020-01-02 10:00:00
`
    const [show] = parseExport({ shows: 'tv_show_id,tv_show_name\n1,Test', tracking: shuffled })
    expect(show.seasons[0]).toEqual([
      Date.parse('2020-01-01T10:00:00'),
      Date.parse('2020-01-02T10:00:00'),
      Date.parse('2020-01-03T10:00:00')
    ])
    expect(show.seasons[1]).toHaveLength(1)
  })

  it('keeps specials, which live in season 0', () => {
    const tracking = 's_id,season_number,episode_number,created_at\n1,0,1,2020-01-01 10:00:00\n'
    const [show] = parseExport({ shows: 'tv_show_id,tv_show_name\n1,Test', tracking })
    expect(show.watched).toBe(1)
  })

  it('drops a row without a usable episode number', () => {
    const tracking = `s_id,season_number,episode_number,created_at
1,1,0,2020-01-01 10:00:00
1,1,,2020-01-01 10:00:00
,1,1,2020-01-01 10:00:00
1,1,2,2020-01-01 10:00:00
`
    const [show] = parseExport({ shows: 'tv_show_id,tv_show_name\n1,Test', tracking })
    expect(show.watched).toBe(1)
  })

  it('counts a re-ticked episode once', () => {
    const tracking = `s_id,season_number,episode_number,created_at
1,1,1,2020-01-01 10:00:00
1,1,1,2022-06-01 10:00:00
`
    const [show] = parseExport({ shows: 'tv_show_id,tv_show_name\n1,Test', tracking })
    expect(show.watched).toBe(1)
    // The later tick wins, matching what the source app displays.
    expect(show.seasons[0][0]).toBe(Date.parse('2022-06-01T10:00:00'))
  })

  it('handles a series with nothing watched', () => {
    const [, onePiece] = parseExport({ shows: SHOWS, tracking: TRACKING })
    expect(onePiece.seasons).toEqual([])
    expect(onePiece.watched).toBe(0)
  })

  it('ignores a series with no name', () => {
    const shows = parseExport({ shows: 'tv_show_id,tv_show_name\n1,\n2,Réel', tracking: '' })
    expect(shows.map((s) => s.name)).toEqual(['Réel'])
  })

  it('reads a title containing a comma', () => {
    const shows = parseExport({
      shows: 'tv_show_id,tv_show_name\n1,"Kaguya-sama, Love Is War"',
      tracking: ''
    })
    expect(shows[0].name).toBe('Kaguya-sama, Love Is War')
  })
})

describe('side-file OpenTV', () => {
  it('picks up the date a series was added', () => {
    const extras = JSON.stringify({ shows: [{ tvdbId: 121361, addedAt: '2019-08-14 09:00:00' }] })
    const [aot] = parseExport({ shows: SHOWS, tracking: TRACKING, extras })
    expect(aot.addedAt).toBe(Date.parse('2019-08-14T09:00:00'))
  })

  it('leaves the date null without the side-file', () => {
    // A plain TV Time export has no such file; the caller falls back to now.
    const [aot] = parseExport({ shows: SHOWS, tracking: TRACKING })
    expect(aot.addedAt).toBeNull()
  })

  it('survives a corrupt side-file', () => {
    const shows = parseExport({ shows: SHOWS, tracking: TRACKING, extras: '{ not json' })
    expect(shows).toHaveLength(2)
    expect(shows[0].addedAt).toBeNull()
  })

  it('accepts a numeric or string id', () => {
    const extras = JSON.stringify({ shows: [{ tvdbId: '121361', addedAt: '2019-08-14 09:00:00' }] })
    const [aot] = parseExport({ shows: SHOWS, tracking: TRACKING, extras })
    expect(aot.addedAt).not.toBeNull()
  })
})
