import { describe, expect, it } from 'vitest'
import {
  alignEntry,
  chooseSide,
  entriesIn,
  isSideFormat,
  releaseOrder,
  sameKind,
  sectionsFor,
  sectionsIn,
  type Sibling
} from './as-sections'

// Relevés sur anime-sama.to : la page de « Kaiju No. 8 » et sa section OAV.
const KAIJU_HUB = `
  <script>
    /* panneauAnime("nom", "url"); */
    panneauAnime("nom", "url");
    panneauAnime("Saison 1", "saison1/vostfr");
    panneauAnime("Saison 2", "saison2/vostfr");
    panneauAnime("OAV", "oav/vostfr");
    panneauScan("Scans", "scan/vf");
  </script>`

const KAIJU_OAV = `
  <script>
    /*
    resetListe(); toujours au debut en premier
    creerListe(debut, fin);newSP(special); on en met autant qu'on veut
    finirListe(debut de la fin);
    */
    resetListe();
    newSPF("Hoshina's Day Off");
    newSPF("Narumi's Week at Work - partie 1");
    newSPF("Narumi's Week at Work - partie 2");
    finirListe(3);
  </script>`

describe('sectionsIn', () => {
  it('lit les sections et écarte le modèle', () => {
    expect(sectionsIn(KAIJU_HUB)).toEqual([
      { name: 'Saison 1', base: 'saison1' },
      { name: 'Saison 2', base: 'saison2' },
      { name: 'OAV', base: 'oav' }
    ])
  })

  // Le nom des sagas de One Piece contient des parenthèses.
  it('garde un nom à parenthèses', () => {
    expect(sectionsIn('panneauAnime("Saga 1 (East Blue)", "saison1/vostfr");')).toEqual([
      { name: 'Saga 1 (East Blue)', base: 'saison1' }
    ])
  })
})

describe('sectionsFor', () => {
  const sections = [
    { name: 'Saison 1', base: 'saison1' },
    { name: "Film - Train de l'infini", base: 'film1' },
    { name: "Épisode - Train de l'infini", base: 'saison1hs' },
    { name: 'La Forteresse Infinie', base: 'film2' },
    { name: 'OAV', base: 'oav' }
  ]

  it('range un film sous film, film1, film2', () => {
    expect(sectionsFor(sections, 'MOVIE').map((s) => s.base)).toEqual(['film1', 'film2'])
  })

  it('range un OVA et un spécial sous oav', () => {
    expect(sectionsFor(sections, 'SPECIAL').map((s) => s.base)).toEqual(['oav'])
    expect(sectionsFor(sections, 'OVA').map((s) => s.base)).toEqual(['oav'])
  })
})

describe('isSideFormat', () => {
  it('ne concerne que films, OVA et spéciaux', () => {
    expect(['MOVIE', 'OVA', 'SPECIAL'].every(isSideFormat)).toBe(true)
    expect(['TV', 'ONA', 'TV_SHORT', null].some(isSideFormat)).toBe(false)
  })
})

describe('entriesIn', () => {
  it('lit les entrées nommées dans l’ordre, sans le commentaire modèle', () => {
    expect(entriesIn(KAIJU_OAV)).toEqual([
      "Hoshina's Day Off",
      "Narumi's Week at Work - partie 1",
      "Narumi's Week at Work - partie 2"
    ])
  })

  it('renonce quand le menu mêle des épisodes numérotés', () => {
    expect(entriesIn('creerListe(1, 12); newSPF("Spécial"); finirListe(13);')).toEqual([])
  })

  it('accepte les guillemets simples et les apostrophes échappées', () => {
    expect(entriesIn("newSPF('L\\'Aventure');")).toEqual(["L'Aventure"])
  })
})

describe('chooseSide', () => {
  it('trouve Hoshina’s Day Off dans la section OAV de Kaiju No. 8', () => {
    const options = [{ name: 'OAV', base: 'oav', names: entriesIn(KAIJU_OAV) }]
    const titles = ["Kaiju No. 8: Hoshina's Day Off", 'Kaijuu 8-gou: Hoshina no Kyuujitsu']
    expect(chooseSide(options, titles)).toEqual({ base: 'oav', entry: { index: 1, name: "Hoshina's Day Off" } })
  })

  it('choisit la section dont le nom ressemble au titre', () => {
    const options = [
      { name: 'Scarlet Bond', base: 'film', names: ['Scarlet Bond'] },
      { name: 'Les larmes de la mer azur', base: 'film2', names: ['Les larmes de la mer azur'] }
    ]
    const titles = ['That Time I Got Reincarnated as a Slime the Movie: Scarlet Bond']
    expect(chooseSide(options, titles)).toEqual({ base: 'film', entry: { index: 1, name: 'Scarlet Bond' } })
  })

  it('sans ressemblance, ouvre la première section sans viser d’entrée', () => {
    const options = [{ name: 'OAV', base: 'oav', names: ['Un', 'Deux'] }]
    expect(chooseSide(options, ['Tout autre chose'])).toEqual({ base: 'oav', entry: null })
  })

  it('sans ressemblance, vise l’entrée unique', () => {
    const options = [{ name: 'Film', base: 'film', names: ['Le train de l’Infini'] }]
    expect(chooseSide(options, ['Demon Slayer: Mugen Train'])).toEqual({
      base: 'film',
      entry: { index: 1, name: 'Le train de l’Infini' }
    })
  })

  it('ne rend rien sans section', () => {
    expect(chooseSide([], ['Kaiju No. 8'])).toBeNull()
  })

  // Relevé : les films de Naruto chez Anime-Sama, titrés en français.
  const NARUTO_FILMS = [
    {
      name: 'Film',
      base: 'film',
      names: [
        'Naruto et la Princesse des neiges',
        'La Légende de la pierre de Guelel',
        'Mission spéciale au pays de la Lune'
      ]
    }
  ]
  const GELEL = [
    'Naruto the Movie: Legend of the Stone of Gelel',
    'NARUTO: Dai Gekitotsu! Maboroshi no Chitei Iseki Dattebayo'
  ]

  // Les films de Naruto dans la fiche de la série : une seule date en cache.
  const NARUTO_SIBLINGS: Sibling[] = [
    { id: 2144, date: null, titles: ['NARUTO: Dai Koufun! Mikazukijima no Animal Panic Dattebayo!'] },
    { id: 936, date: 20050806, titles: GELEL },
    { id: 442, date: null, titles: ['NARUTO: Dai Katsugeki! Yuki Hime Ninpouchou Dattebayo!!'] }
  ]

  it('retrouve un film titré en français par sa place de sortie', () => {
    expect(chooseSide(NARUTO_FILMS, GELEL, NARUTO_SIBLINGS, 936)).toEqual({
      base: 'film',
      entry: { index: 2, name: 'La Légende de la pierre de Guelel' }
    })
  })

  it('suit la place à travers plusieurs sections', () => {
    const options = [
      { name: 'Film', base: 'film1', names: ['Premier'] },
      { name: 'Film', base: 'film2', names: ['Second'] }
    ]
    const siblings = [
      { id: 1, date: null, titles: ['Alpha'] },
      { id: 2, date: null, titles: ['Beta'] }
    ]
    expect(chooseSide(options, ['Beta'], siblings, 2)).toEqual({ base: 'film2', entry: { index: 1, name: 'Second' } })
  })
})

// Relevé : les films de Naruto Shippuden des deux côtés. AniList en cite huit,
// Anime-Sama en liste sept — le court « Honoo no Chuunin Shiken » leur manque.
const SHIPPUDEN_NAMES = [
  'Un Funeste Présage',
  'Les Liens',
  'La Flamme de la Volonté',
  'La Tour Perdue',
  'Blood Prison',
  'Road to Ninja',
  'The Last'
]
const SHIPPUDEN_FILMS: Sibling[] = [
  { id: 2472, date: 20070804, titles: ['NARUTO: Shippuuden Movie'] },
  { id: 4437, date: null, titles: ['NARUTO: Shippuuden - Kizuna'] },
  { id: 6325, date: null, titles: ['NARUTO: Shippuuden - Hi no Ishi wo Tsugu Mono'] },
  { id: 8246, date: null, titles: ['NARUTO: Shippuuden - The Lost Tower'] },
  { id: 10589, date: null, titles: ['NARUTO: Blood Prison'] },
  { id: 10686, date: null, titles: ['NARUTO: Honoo no Chuunin Shiken! Naruto vs Konohamaru!!'] },
  { id: 13667, date: null, titles: ['ROAD TO NINJA: NARUTO THE MOVIE'] },
  { id: 16870, date: null, titles: ['THE LAST: NARUTO THE MOVIE'] }
]

describe('alignEntry', () => {
  it('aligne les films d’avant le premier repère quand les comptes s’accordent', () => {
    expect(alignEntry(SHIPPUDEN_NAMES, SHIPPUDEN_FILMS, 2472)).toBe(1)
    expect(alignEntry(SHIPPUDEN_NAMES, SHIPPUDEN_FILMS, 4437)).toBe(2)
    expect(alignEntry(SHIPPUDEN_NAMES, SHIPPUDEN_FILMS, 6325)).toBe(3)
    expect(alignEntry(SHIPPUDEN_NAMES, SHIPPUDEN_FILMS, 8246)).toBe(4)
  })

  it('reconnaît les repères par leur nom', () => {
    expect(alignEntry(SHIPPUDEN_NAMES, SHIPPUDEN_FILMS, 10589)).toBe(5)
    expect(alignEntry(SHIPPUDEN_NAMES, SHIPPUDEN_FILMS, 13667)).toBe(6)
    expect(alignEntry(SHIPPUDEN_NAMES, SHIPPUDEN_FILMS, 16870)).toBe(7)
  })

  // Le film qui leur manque ne doit pas prendre la place d'un autre.
  it('ne vise rien pour un film absent de leur liste', () => {
    expect(alignEntry(SHIPPUDEN_NAMES, SHIPPUDEN_FILMS, 10686)).toBeNull()
  })

  it('ne vise rien quand les comptes diffèrent sans repère', () => {
    const names = ['Un', 'Deux']
    const films = [1, 2, 3].map((id) => ({ id, date: null, titles: [`#${id}`] }))
    expect(alignEntry(names, films, 2)).toBeNull()
  })

  it('ne rend rien pour une série absente', () => {
    expect(alignEntry(['Un'], [{ id: 1, date: null, titles: [] }], 2)).toBeNull()
  })
})

describe('releaseOrder', () => {
  it('range par identifiant quand une date manque', () => {
    expect(releaseOrder(SHIPPUDEN_FILMS.slice().reverse()).map((s) => s.id)).toEqual(SHIPPUDEN_FILMS.map((s) => s.id))
  })

  it('range par date quand toutes sont connues', () => {
    const films = [
      { id: 10, date: 20120101, titles: [] },
      { id: 5, date: 20100101, titles: [] }
    ]
    expect(releaseOrder(films).map((s) => s.id)).toEqual([5, 10])
  })
})

describe('sameKind', () => {
  it('met les films à part, OVA et spéciaux ensemble', () => {
    expect(sameKind('MOVIE', 'MOVIE')).toBe(true)
    expect(sameKind('MOVIE', 'SPECIAL')).toBe(false)
    expect(sameKind('SPECIAL', 'OVA')).toBe(true)
    expect(sameKind('OVA', 'MOVIE')).toBe(false)
  })
})
