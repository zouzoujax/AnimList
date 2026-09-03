import { describe, expect, it } from 'vitest'
import { activityOf, clampText, looksLikeAppId, sameActivity, summarise, MAX_TEXT, type Watching } from './discord'

const base: Watching = {
  title: 'Sousou no Frieren',
  episode: 12,
  total: 28,
  cover: 'https://s4.anilist.co/file/cover.jpg',
  position: 300,
  duration: 1440,
  paused: false
}

const AT = 1_700_000_000_000

describe('looksLikeAppId', () => {
  it('accepte un identifiant d’application', () => {
    expect(looksLikeAppId('1544850319878656161')).toBe(true)
    expect(looksLikeAppId('  1544850319878656161  ')).toBe(true)
  })

  // Sans ce contrôle, la seule façon d'apprendre qu'un identifiant est mauvais
  // serait de se faire fermer la connexion au visage.
  it('refuse ce qui n’en est pas un', () => {
    expect(looksLikeAppId('')).toBe(false)
    expect(looksLikeAppId('mon-application')).toBe(false)
    expect(looksLikeAppId('12345')).toBe(false)
    expect(looksLikeAppId('154485031987865616112345')).toBe(false)
  })
})

describe('clampText', () => {
  it('laisse un texte normal tranquille', () => {
    expect(clampText('  Frieren  ')).toBe('Frieren')
  })

  // Un texte hors bornes ne serait pas raccourci par Discord : il ferait
  // refuser l'activité entière.
  it('coupe un titre trop long, visiblement', () => {
    const long = 'a'.repeat(200)
    const out = clampText(long)
    expect(out).toHaveLength(MAX_TEXT)
    expect(out.endsWith('…')).toBe(true)
  })

  it('complète un titre d’un seul caractère', () => {
    expect(clampText('K')).toBe('K.')
  })
})

describe('activityOf', () => {
  it('n’annonce rien quand rien ne joue', () => {
    expect(activityOf(null)).toBeNull()
  })

  it('met le titre, l’épisode et la jaquette', () => {
    const activity = activityOf(base, { at: AT })
    expect(activity).toMatchObject({
      details: 'Sousou no Frieren',
      state: 'Épisode 12 sur 28',
      assets: { large_image: 'https://s4.anilist.co/file/cover.jpg', large_text: 'Sousou no Frieren' }
    })
  })

  // C'est ce qui donne « il reste 19:00 » chez le lecteur, sans qu'on ait à
  // renvoyer quoi que ce soit pendant l'épisode.
  it('donne l’heure de fin, pas le temps restant', () => {
    expect(activityOf(base, { at: AT })?.timestamps).toEqual({ end: AT + 1140 * 1000 })
  })

  it('retombe sur le temps écoulé quand la durée est inconnue', () => {
    expect(activityOf({ ...base, duration: 0 }, { at: AT })?.timestamps).toEqual({ start: AT - 300 * 1000 })
  })

  // Laissée en place, l'horloge continuerait de descendre pendant que l'image
  // est arrêtée.
  it('retire l’horloge sur une pause, et le dit', () => {
    const activity = activityOf({ ...base, paused: true }, { at: AT })
    expect(activity?.timestamps).toBeUndefined()
    expect(activity?.state).toBe('Épisode 12 sur 28 · En pause')
  })

  it('se passe du total quand il n’est pas connu', () => {
    expect(activityOf({ ...base, total: null }, { at: AT })?.state).toBe('Épisode 12')
  })

  it('n’invente pas d’épisode pour un film', () => {
    expect(activityOf({ ...base, episode: null }, { at: AT })?.state).toBeUndefined()
  })

  // Une bande-annonce n'a pas de numéro, et laisser la ligne vide ferait
  // croire à un épisode dont on ignore le rang.
  it('dit ce qu’on regarde quand ce n’est pas un épisode', () => {
    expect(activityOf({ ...base, episode: null, note: 'Bande-annonce' }, { at: AT })?.state).toBe('Bande-annonce')
  })

  /**
   * Le mode discret remplace, il n'atténue pas : une jaquette se reconnaît
   * mieux qu'un titre, et un numéro d'épisode avec une horloge suffirait à
   * retrouver la série.
   */
  it('ne laisse rien filtrer en mode discret', () => {
    const activity = activityOf(base, { hideTitle: true, at: AT })
    expect(activity).toEqual({ details: 'Un anime' })
  })

  /**
   * Discord accepte un champ `type`, le renvoie dans sa réponse, et refuse
   * ensuite d'afficher la carte. Le test garde la forme documentée : le
   * symptôme d'une régression ici serait une carte muette, impossible à
   * relier à sa cause.
   */
  it('n’envoie aucun champ hors de la commande documentée', () => {
    const activity = activityOf(base, { at: AT })
    expect(Object.keys(activity ?? {}).sort()).toEqual(['assets', 'details', 'state', 'timestamps'])
  })
})

describe('sameActivity', () => {
  it('reconnaît deux activités identiques', () => {
    expect(sameActivity(activityOf(base, { at: AT }), activityOf(base, { at: AT }))).toBe(true)
  })

  // Sans tolérance, la dérive d'une milliseconde ferait renvoyer l'activité à
  // chaque tour — et Discord limite le débit des envois.
  it('tolère la dérive d’un recalcul', () => {
    expect(sameActivity(activityOf(base, { at: AT }), activityOf(base, { at: AT + 900 }))).toBe(true)
  })

  it('voit un vrai déplacement dans l’épisode', () => {
    expect(sameActivity(activityOf(base, { at: AT }), activityOf({ ...base, position: 900 }, { at: AT }))).toBe(false)
  })

  it('voit un changement d’épisode et une pause', () => {
    expect(sameActivity(activityOf(base, { at: AT }), activityOf({ ...base, episode: 13 }, { at: AT }))).toBe(false)
    expect(sameActivity(activityOf(base, { at: AT }), activityOf({ ...base, paused: true }, { at: AT }))).toBe(false)
  })

  it('distingue « rien » de « quelque chose »', () => {
    expect(sameActivity(null, null)).toBe(true)
    expect(sameActivity(activityOf(base, { at: AT }), null)).toBe(false)
  })
})

describe('summarise', () => {
  // C'est la ligne qui répond à « je ne vois rien sur mon profil » : elle doit
  // dire ce qui est parti, pas ce qu'on espérait envoyer.
  it('rend lisible ce qui a été envoyé', () => {
    expect(summarise(activityOf(base, { at: AT }))).toBe('Sousou no Frieren — Épisode 12 sur 28')
  })

  it('se passe de la seconde ligne quand il n’y en a pas', () => {
    expect(summarise(activityOf({ ...base, episode: null }, { at: AT }))).toBe('Sousou no Frieren')
  })

  it('ne montre rien quand rien n’a été envoyé', () => {
    expect(summarise(null)).toBeNull()
  })
})
