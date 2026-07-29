import { describe, expect, it } from 'vitest'
import { seasonNumbers } from '@shared/titles'

/** Forme lisible d'une bande de saisons, telle que la fiche l'affiche. */
const label = (titles: string[]): string[] =>
  seasonNumbers(titles).map((s) => `S${s.number}${s.part === null ? '' : `P${s.part}`}`)

describe('numérotation des saisons', () => {
  it('Slime : le cour scindé ne décale pas la 4e saison', () => {
    expect(
      label([
        'Tensei Shitara Slime Datta Ken',
        'Tensei Shitara Slime Datta Ken 2nd Season',
        'Tensei Shitara Slime Datta Ken 2nd Season Part 2',
        'Tensei Shitara Slime Datta Ken 3rd Season',
        'Tensei Shitara Slime Datta Ken 4th Season'
      ])
    ).toEqual(['S1', 'S2', 'S2P2', 'S3', 'S4'])
  })

  it('Shingeki : « Final Season » sans numéro prend le suivant', () => {
    expect(
      label([
        'Shingeki no Kyojin',
        'Shingeki no Kyojin Season 2',
        'Shingeki no Kyojin Season 3',
        'Shingeki no Kyojin Season 3 Part 2',
        'Shingeki no Kyojin: The Final Season',
        'Shingeki no Kyojin: The Final Season Part 2'
      ])
    ).toEqual(['S1', 'S2', 'S3', 'S3P2', 'S4', 'S4P2'])
  })

  it('Solo Leveling : numéro pris dans un sous-titre', () => {
    expect(label(['Ore dake Level Up na Ken', 'Ore dake Level Up na Ken: Season 2 - Arise from the Shadow'])).toEqual([
      'S1',
      'S2'
    ])
  })

  it('sans aucun numéro, la position sert de repli', () => {
    expect(label(['Mushishi', 'Mushishi Zoku Shou'])).toEqual(['S1', 'S2'])
  })
})
