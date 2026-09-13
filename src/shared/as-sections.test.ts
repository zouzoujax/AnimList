import { describe, expect, it } from 'vitest'
import { chooseSide, entriesIn, isSideFormat, sectionsFor, sectionsIn } from './as-sections'

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
})
