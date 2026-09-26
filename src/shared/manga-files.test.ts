import { describe, expect, it } from 'vitest'
import { isImage, seriesTitleOf, sortVolumes, spreads, volumeNumber } from './manga-files'

describe('volumeNumber', () => {
  it.each([
    ['Frieren T01', 1],
    ['Tome 12', 12],
    ['One Piece Vol.105', 105],
    ['Chapitre 1089', 1089],
    ['Berserk - 03', 3],
    ['Chap. 10,5', 10.5],
    ['Oneshot', null]
  ])('%s → %s', (name, expected) => {
    expect(volumeNumber(name)).toBe(expected)
  })
})

describe('seriesTitleOf', () => {
  it('retire le numéro et les crochets', () => {
    expect(seriesTitleOf('Frieren T01 [FR].cbz')).toBe('Frieren')
    expect(seriesTitleOf('Dandadan_Tome_03.zip')).toBe('Dandadan')
  })
})

describe('sortVolumes', () => {
  it('range par numéro, pas par ordre alphabétique', () => {
    const names = sortVolumes([{ name: 'Tome 10' }, { name: 'Tome 2' }, { name: 'Bonus' }, { name: 'Tome 1' }])
    expect(names.map((n) => n.name)).toEqual(['Tome 1', 'Tome 2', 'Tome 10', 'Bonus'])
  })
})

describe('isImage', () => {
  it('écarte les vignettes de macOS', () => {
    expect(isImage('001.JPG')).toBe(true)
    expect(isImage('__MACOSX/._001.jpg')).toBe(false)
    expect(isImage('info.txt')).toBe(false)
  })
})

describe('spreads', () => {
  it('laisse la couverture seule puis groupe par deux', () => {
    expect(spreads(6)).toEqual([[0], [1, 2], [3, 4], [5]])
  })
  it('garde seule une page déjà double', () => {
    expect(spreads(6, new Set([3]))).toEqual([[0], [1, 2], [3], [4, 5]])
  })
})
