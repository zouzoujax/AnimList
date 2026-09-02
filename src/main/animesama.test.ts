import { describe, expect, it } from 'vitest'
import { listsEpisodes, searchUrl } from './animesama'

// Relevés sur le site : la saison 1 de « Kaiju No. 8 » liste ses lecteurs, la
// saison 8 — qui n'existe pas — répond 200 avec un commentaire vide pour tout
// contenu. C'est elle que l'app ouvrait.
describe('listsEpisodes', () => {
  it('accepts a real episode list', () => {
    const body = ['var eps1 = [', "'https://video.sibnet.ru/shell.php?videoid=5503622',", ']'].join('\n')
    expect(listsEpisodes(body)).toBe(true)
  })

  it('accepts a second player list', () => {
    expect(listsEpisodes('var eps2 = ["https://vidmoly.to/embed-abc.html"]')).toBe(true)
  })

  it('rejects the empty file a missing season serves', () => {
    expect(listsEpisodes('//\n')).toBe(false)
  })

  it('rejects an empty array', () => {
    expect(listsEpisodes('var eps1 = []')).toBe(false)
  })

  it('rejects a page that is not the script at all', () => {
    expect(listsEpisodes('<!DOCTYPE html><html><body>404</body></html>')).toBe(false)
  })
})

describe('searchUrl', () => {
  it('escapes the term', () => {
    expect(searchUrl('Kaiju No. 8')).toBe('https://anime-sama.to/catalogue/?search=Kaiju%20No.%208')
  })
})
