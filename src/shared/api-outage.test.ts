import { describe, expect, it } from 'vitest'
import { failureOf, HICCUP_MS, humanMessage, OUTAGE_MS } from './api-outage'

const DISABLED = 'The AniList API has been temporarily disabled due to severe stability issues.'

describe('failureOf', () => {
  it('reconnaît une API coupée et se tait un quart d’heure', () => {
    const f = failureOf(403, DISABLED)
    expect(f.pauseMs).toBe(OUTAGE_MS)
    expect(f.message).toContain('indisponible')
  })

  // La seconde phrase compte autant que la première : sans elle, une panne de
  // leur côté se lit comme une app cassée du nôtre.
  it('dit ce qui marche encore', () => {
    const f = failureOf(403, DISABLED)
    expect(f.message).toContain('bibliothèque')
    expect(f.message).toContain('statistiques')
  })

  it('ne laisse fuir ni numéro ni anglais', () => {
    const f = failureOf(403, DISABLED)
    expect(f.message).not.toContain('403')
    expect(f.message).not.toContain('AniList API has been')
  })

  it('traite un 403 ordinaire à part', () => {
    const f = failureOf(403, 'Forbidden')
    expect(f.pauseMs).toBe(HICCUP_MS)
    expect(f.message).toContain('refuse')
  })

  it('range les pannes de serveur avec les hoquets', () => {
    expect(failureOf(500, null).pauseMs).toBe(HICCUP_MS)
    expect(failureOf(503, null).message).toContain('panne')
  })

  // Une requête fautive ne doit pas faire taire les autres.
  it('ne suspend rien sur une erreur de requête', () => {
    expect(failureOf(400, 'Bad query').pauseMs).toBe(0)
    expect(failureOf(404, null).pauseMs).toBe(0)
  })

  it('reprend le message de l’API quand il en donne un', () => {
    expect(failureOf(400, 'Variable $id is required').message).toBe('Variable $id is required')
  })

  it('se rabat sur le code quand il n’y a rien à citer', () => {
    expect(failureOf(418, null).message).toBe('AniList a répondu 418.')
  })

  // Leur phrase peut changer ; « disabled » est le mot sur lequel on parie.
  it('suit le mot plutôt que la phrase entière', () => {
    expect(failureOf(403, 'API disabled for maintenance').pauseMs).toBe(OUTAGE_MS)
    expect(failureOf(403, 'The API has been DISABLED').pauseMs).toBe(OUTAGE_MS)
  })
})

describe('humanMessage', () => {
  it('retire l’emballage d’Electron', () => {
    expect(humanMessage("Error invoking remote method 'anime:airing': Error: AniList HTTP 403")).toBe(
      'AniList HTTP 403'
    )
  })

  it('marche sans le second « Error: »', () => {
    expect(humanMessage("Error invoking remote method 'lib:snapshot': Fichier illisible")).toBe('Fichier illisible')
  })

  it('laisse intact ce qui ne vient pas du pont', () => {
    expect(humanMessage('Réponse AniList vide')).toBe('Réponse AniList vide')
    expect(humanMessage('Error: quelque chose')).toBe('Error: quelque chose')
  })

  // Mieux vaut un emballage qu'un vide : on ne renvoie jamais rien du tout.
  it('ne rend pas une chaîne vide', () => {
    const nu = "Error invoking remote method 'x': Error: "
    expect(humanMessage(nu)).toBe(nu)
  })
})
