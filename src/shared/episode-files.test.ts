import { describe, expect, it } from 'vitest'
import { episodeFromName, isVideo, srtToVtt, subtitleTwin } from './episode-files'

describe('episodeFromName', () => {
  it('reads the shapes release groups actually use', () => {
    expect(episodeFromName('[Groupe] Titre - 05 [1080p][x265][A1B2C3D4].mkv')).toBe(5)
    expect(episodeFromName('Titre.S01E05.VOSTFR.1080p.WEB-DL.x264.mp4')).toBe(5)
    expect(episodeFromName('Titre Ep. 5 (2026).mkv')).toBe(5)
    expect(episodeFromName('Titre - Episode 12.mkv')).toBe(12)
    expect(episodeFromName('Titre Épisode 3.mp4')).toBe(3)
    expect(episodeFromName('Titre [07].mkv')).toBe(7)
  })

  // Le cœur du problème : ces nombres-là ne sont pas des épisodes.
  it('is not fooled by the resolution', () => {
    expect(episodeFromName('Titre - 04 [1080p].mkv')).toBe(4)
    expect(episodeFromName('Titre - 04 [720p].mkv')).toBe(4)
  })

  it('is not fooled by the codec', () => {
    expect(episodeFromName('Titre S02E09 x265 10bit.mkv')).toBe(9)
    expect(episodeFromName('Titre - 11 [HEVC][h.264].mkv')).toBe(11)
  })

  it('is not fooled by the year or the CRC', () => {
    expect(episodeFromName('Titre (2026) - 02.mkv')).toBe(2)
    expect(episodeFromName('Titre - 02 [A1B2C3D4].mkv')).toBe(2)
  })

  it('is not fooled by the audio layout', () => {
    expect(episodeFromName('Titre - 06 [AAC 5.1].mkv')).toBe(6)
  })

  it('reads a re-encode as its episode, not its revision', () => {
    expect(episodeFromName('Titre - 08v2 [1080p].mkv')).toBe(8)
  })

  it('keeps three-digit numbering for long-running shows', () => {
    expect(episodeFromName('Titre - 1042 [1080p].mkv')).toBe(1042)
  })

  it('accepts episode zero, which prequels use', () => {
    expect(episodeFromName('Titre - 00 [1080p].mkv')).toBe(0)
  })

  it('gives up rather than guessing', () => {
    expect(episodeFromName('Titre complet.mkv')).toBeNull()
    expect(episodeFromName('bande-annonce.mp4')).toBeNull()
  })
})

describe('isVideo', () => {
  it('recognises the containers, whatever the case', () => {
    expect(isVideo('a.MKV')).toBe(true)
    expect(isVideo('a.mp4')).toBe(true)
    expect(isVideo('a.srt')).toBe(false)
    expect(isVideo('a')).toBe(false)
  })
})

describe('subtitleTwin', () => {
  const files = ['Titre - 05.mkv', 'Titre - 05.srt', 'Titre - 05.fr.vtt', 'Titre - 06.srt']

  it('prefers the format the video tag reads without conversion', () => {
    expect(subtitleTwin('Titre - 05.mkv', files)).toBe('Titre - 05.fr.vtt')
  })

  it('falls back to SubRip when there is no WebVTT', () => {
    expect(subtitleTwin('Titre - 06.mkv', files)).toBe('Titre - 06.srt')
  })

  it('returns nothing when no file matches', () => {
    expect(subtitleTwin('Titre - 09.mkv', files)).toBeNull()
  })
})

describe('srtToVtt', () => {
  it('adds the header and turns the comma into a dot', () => {
    const srt = '1\n00:00:01,500 --> 00:00:04,000\nBonjour\n'
    expect(srtToVtt(srt)).toBe('WEBVTT\n\n1\n00:00:01.500 --> 00:00:04.000\nBonjour\n')
  })
})
