import { describe, expect, it } from 'vitest'
import { baseAndSeason, compact, searchVariants, similarity, siteSlug, slugify, titleMatches } from './titles'

describe('baseAndSeason', () => {
  it.each([
    ['One-Punch Man Season 2', 'One-Punch Man', 2],
    ['My Hero Academia Season 6', 'My Hero Academia', 6],
    ['Overlord II', 'Overlord', 2],
    ['Mob Psycho 100 III', 'Mob Psycho 100', 3],
    ['Kono Subarashii Sekai ni Shukufuku wo! 2', 'Kono Subarashii Sekai ni Shukufuku wo!', 2],
    ['Tensei Shitara Slime Datta Ken 2nd Season', 'Tensei Shitara Slime Datta Ken', 2],
    ['Mushoku Tensei: Isekai Ittara Honki Dasu Part 2', 'Mushoku Tensei: Isekai Ittara Honki Dasu', 2]
  ])('splits %s', (title, base, season) => {
    expect(baseAndSeason(title)).toEqual({ base, season })
  })

  it('leaves a plain title untouched', () => {
    expect(baseAndSeason('Dr. STONE: STONE WARS')).toEqual({ base: 'Dr. STONE: STONE WARS', season: 1 })
  })

  // « Kaiju No. 8 » partait chercher une saison 8 : le chiffre du nom était lu
  // comme un numéro de saison.
  it.each([
    'Kaiju No. 8',
    'Kaiju No.8',
    'Sakamoto Days n°2',
    'Cyborg 009',
    'Trigger #3'
  ])('keeps a numbered name whole: %s', (title) => {
    expect(baseAndSeason(title)).toEqual({ base: title, season: 1 })
  })

  // Le garde-fou ne doit pas avaler les vraies saisons pour autant.
  it('still reads the season of a numbered name', () => {
    expect(baseAndSeason('Kaiju No. 8 Season 2')).toEqual({ base: 'Kaiju No. 8', season: 2 })
  })

  it('still splits a title that merely ends in "no"', () => {
    expect(baseAndSeason('Kino 2')).toEqual({ base: 'Kino', season: 2 })
  })

  // A title that says "Final Season" gives no usable number, and guessing 1
  // would send the resolver to the wrong /saisonN/ URL. 0 means "unknown".
  it.each([
    ['Attack on Titan Final Season', 'Attack on Titan'],
    ['Boku no Hero Academia FINAL SEASON', 'Boku no Hero Academia'],
    ['Shingeki no Kyojin: The Final Season', 'Shingeki no Kyojin']
  ])('reports an unknown season for %s', (title, base) => {
    expect(baseAndSeason(title)).toEqual({ base, season: 0 })
  })
})

describe('siteSlug', () => {
  // Every one of these was verified by hand against the live site; they are the
  // regression guard for the apostrophe/colon rule.
  it.each([
    ['Re:ZERO -Starting Life in Another World-', 'rezero-starting-life-in-another-world'],
    [
      'The Aristocrat’s Otherworldly Adventure: Serving Gods Who Go Too Far',
      'the-aristocrats-otherworldly-adventure-serving-gods-who-go-too-far'
    ],
    ["The Aristocrat's Otherworldly Adventure", 'the-aristocrats-otherworldly-adventure'],
    ['Monster Musume: Everyday Life With Monster Girls', 'monster-musume-everyday-life-with-monster-girls'],
    ['High School DxD', 'high-school-dxd'],
    ['To Love Ru', 'to-love-ru'],
    ['Cat Planet Cuties', 'cat-planet-cuties'],
    ['Valkyrie Drive: Mermaid', 'valkyrie-drive-mermaid']
  ])('%s -> %s', (title, slug) => {
    expect(siteSlug(title)).toBe(slug)
  })

  it('drops colons where the plain slugifier would insert a dash', () => {
    expect(slugify('Re:ZERO')).toBe('re-zero')
    expect(siteSlug('Re:ZERO')).toBe('rezero')
  })

  it('strips accents', () => {
    expect(siteSlug('Naruto Shippūden')).toBe('naruto-shippuden')
  })
})

describe('titleMatches', () => {
  const rezero = ['Re:Zero kara Hajimeru Isekai Seikatsu', 'Re:ZERO -Starting Life in Another World-']

  it.each(['rezero', 're zero', 're:zero', 'RE ZERO', 'hajimeru'])('finds Re:Zero from %s', (needle) => {
    expect(titleMatches(needle, rezero)).toBe(true)
  })

  it('still matches a plain substring', () => {
    expect(titleMatches('dxd', ['High School DxD'])).toBe(true)
  })

  it('rejects an unrelated needle', () => {
    expect(titleMatches('bebop', rezero)).toBe(false)
  })

  it('treats an empty needle as a match-all', () => {
    expect(titleMatches('', rezero)).toBe(true)
  })

  it('ignores null titles', () => {
    expect(titleMatches('naruto', [null, undefined, 'NARUTO'])).toBe(true)
  })
})

describe('similarity', () => {
  it('is 1 for identical strings', () => {
    expect(similarity('naruto', 'naruto')).toBe(1)
  })

  it('is 0 when either side is empty', () => {
    expect(similarity('', 'naruto')).toBe(0)
    expect(similarity('naruto', '')).toBe(0)
  })

  // The case that made slug lookup work: "Kaiju No. 8" lives at `kaiju-n8`.
  it('scores a near miss high enough to accept', () => {
    expect(similarity(compact('Kaiju No. 8'), compact('kaiju-n8'))).toBeGreaterThan(0.62)
  })

  it('scores an unrelated pair below the threshold', () => {
    expect(similarity(compact('Kaiju No. 8'), compact('k-on'))).toBeLessThan(0.62)
  })
})

describe('searchVariants', () => {
  it('offers the subtitle-stripped form, which is what the sites index', () => {
    expect(searchVariants('Demon Slayer: Kimetsu no Yaiba')).toContain('Demon Slayer')
  })

  it('offers the article-stripped form', () => {
    expect(searchVariants('The Seven Deadly Sins: Revival of the Commandments')).toContain('Seven Deadly Sins')
  })

  // "Re" alone would match anything on a catalogue search.
  it('never emits a variant shorter than three characters', () => {
    for (const variant of searchVariants('Re:Zero kara Hajimeru Isekai Seikatsu')) {
      expect(variant.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('deduplicates', () => {
    const variants = searchVariants('Prison School')
    expect(new Set(variants).size).toBe(variants.length)
  })
})
