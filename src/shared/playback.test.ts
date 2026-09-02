import { describe, expect, it } from 'vitest'
import {
  clock,
  MAX_AGE_DAYS,
  progressOf,
  prunePositions,
  resumePoint,
  worthRemembering,
  type Position
} from './playback'

const pos = (at: number, duration: number, updatedAt = Date.now()): Position => ({ at, duration, updatedAt })

describe('worthRemembering', () => {
  it('garde le milieu d’un épisode', () => {
    expect(worthRemembering(600, 1440)).toBe(true)
  })

  it('ignore les premières secondes', () => {
    expect(worthRemembering(0, 1440)).toBe(false)
    expect(worthRemembering(29, 1440)).toBe(false)
    expect(worthRemembering(30, 1440)).toBe(true)
  })

  // Le vrai piège : reprendre sur le générique de fin est pire que reprendre au début.
  it('ignore la toute fin', () => {
    expect(worthRemembering(1439, 1440)).toBe(false)
    expect(worthRemembering(1380, 1440)).toBe(false)
    expect(worthRemembering(1360, 1440)).toBe(true)
  })

  it('refuse une durée inconnue ou absurde', () => {
    expect(worthRemembering(600, 0)).toBe(false)
    expect(worthRemembering(600, Number.NaN)).toBe(false)
    expect(worthRemembering(Number.POSITIVE_INFINITY, 1440)).toBe(false)
  })
})

describe('resumePoint', () => {
  it('rend la seconde, ou rien', () => {
    expect(resumePoint(pos(600, 1440))).toBe(600)
    expect(resumePoint(pos(5, 1440))).toBe(null)
    expect(resumePoint(null)).toBe(null)
    expect(resumePoint(undefined)).toBe(null)
  })
})

describe('progressOf', () => {
  it('reste entre 0 et 1', () => {
    expect(progressOf(pos(720, 1440))).toBe(0.5)
    expect(progressOf(pos(2000, 1440))).toBe(1)
    expect(progressOf(pos(-10, 1440))).toBe(0)
    expect(progressOf(pos(600, 0))).toBe(0)
  })
})

describe('clock', () => {
  it('écrit un temps lisible', () => {
    expect(clock(0)).toBe('0:00')
    expect(clock(65)).toBe('1:05')
    expect(clock(754)).toBe('12:34')
    expect(clock(3723)).toBe('1:02:03')
  })

  it('ne rend jamais NaN', () => {
    expect(clock(Number.NaN)).toBe('0:00')
    expect(clock(-5)).toBe('0:00')
  })
})

describe('prunePositions', () => {
  const now = Date.now()

  it('jette ce qui est trop vieux', () => {
    const kept = prunePositions(
      {
        vieux: pos(600, 1440, now - (MAX_AGE_DAYS + 1) * 86_400_000),
        frais: pos(600, 1440, now)
      },
      now
    )
    expect(Object.keys(kept)).toEqual(['frais'])
  })

  it('jette ce qui n’a plus lieu d’être repris', () => {
    const kept = prunePositions({ fini: pos(1439, 1440, now), debut: pos(2, 1440, now) }, now)
    expect(kept).toEqual({})
  })

  it('garde les plus récentes quand il y en a trop', () => {
    const many: Record<string, Position> = {}
    for (let i = 0; i < 10; i += 1) many[`f${i}`] = pos(600, 1440, now - i * 1000)
    const kept = prunePositions(many, now, 3)
    expect(Object.keys(kept)).toEqual(['f0', 'f1', 'f2'])
  })
})
