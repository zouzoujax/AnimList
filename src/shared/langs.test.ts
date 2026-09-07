import { describe, expect, it } from 'vitest'
import { isLang, LANG_LABELS, LANGS, langUrl, pickLang } from './langs'

describe('LANGS', () => {
  it('suit l’ordre du site : VO puis VF', () => {
    expect(LANGS).toEqual(['vostfr', 'vf'])
    expect(LANG_LABELS.vostfr).toBe('VO')
    expect(LANG_LABELS.vf).toBe('VF')
  })
})

describe('isLang', () => {
  it('reconnaît les deux, et rien d’autre', () => {
    expect(isLang('vostfr')).toBe(true)
    expect(isLang('vf')).toBe(true)
    for (const faux of ['VF', 'va', '', null, undefined, 3]) expect(isLang(faux)).toBe(false)
  })
})

describe('pickLang', () => {
  it('respecte le choix quand il existe', () => {
    expect(pickLang(['vostfr', 'vf'], 'vf')).toBe('vf')
    expect(pickLang(['vostfr', 'vf'], 'vostfr')).toBe('vostfr')
  })

  it('prend la première du site sans choix', () => {
    expect(pickLang(['vostfr', 'vf'], null)).toBe('vostfr')
    expect(pickLang(['vf', 'vostfr'], undefined)).toBe('vostfr')
  })

  // Une refonte du site peut retirer la VF d'une série qu'on regardait ainsi :
  // mieux vaut la VO qu'une adresse morte.
  it('retombe sur ce qui reste quand le choix a disparu', () => {
    expect(pickLang(['vostfr'], 'vf')).toBe('vostfr')
    expect(pickLang(['vf'], 'vostfr')).toBe('vf')
  })

  it('ne rend rien quand il n’y a rien', () => {
    expect(pickLang([], 'vf')).toBeNull()
    expect(pickLang(['klingon'], 'vf')).toBeNull()
  })

  it('ignore un choix qui n’est pas une langue connue', () => {
    expect(pickLang(['vostfr', 'vf'], 'VF')).toBe('vostfr')
  })
})

describe('langUrl', () => {
  const base = 'https://anime-sama.to/catalogue/jujutsu-kaisen/saison1/'

  it('bascule d’une langue à l’autre', () => {
    expect(langUrl(`${base}vostfr/`, 'vf')).toBe(`${base}vf/`)
    expect(langUrl(`${base}vf/`, 'vostfr')).toBe(`${base}vostfr/`)
  })

  it('ne change rien quand c’est déjà la bonne', () => {
    expect(langUrl(`${base}vf/`, 'vf')).toBe(`${base}vf/`)
  })

  // Le hub d'une série n'a pas de langue : il n'y a rien à basculer.
  it('laisse intacte une adresse sans langue', () => {
    const hub = 'https://anime-sama.to/catalogue/jujutsu-kaisen/'
    expect(langUrl(hub, 'vf')).toBe(hub)
    expect(langUrl(`${base}vostfr`, 'vf')).toBe(`${base}vostfr`)
  })

  // « vf » apparaît dans bien des titres : seul le dernier segment compte.
  it('ne touche pas au reste du chemin', () => {
    const piege = 'https://anime-sama.to/catalogue/vf-story/saison1/vostfr/'
    expect(langUrl(piege, 'vf')).toBe('https://anime-sama.to/catalogue/vf-story/saison1/vf/')
  })
})
