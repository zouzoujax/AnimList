import { describe, expect, it } from 'vitest'
import { checkServer, isTopic, makeTopic, pushBody, TOPIC_RANDOM, topicUrl } from './phone-push'

describe('makeTopic', () => {
  it('fabrique un sujet valide et assez long', () => {
    const topic = makeTopic(new Uint8Array(64).map((_, i) => i * 7))
    expect(topic.startsWith('animelist-')).toBe(true)
    expect(topic).toHaveLength('animelist-'.length + TOPIC_RANDOM)
    expect(isTopic(topic)).toBe(true)
  })
})

describe('checkServer', () => {
  it('accepte https et retire la barre finale', () => {
    expect(checkServer('https://ntfy.sh/')).toEqual({ ok: true, server: 'https://ntfy.sh' })
    expect(checkServer(' https://push.exemple.fr:8443 ')).toEqual({ ok: true, server: 'https://push.exemple.fr:8443' })
  })

  it('n’accepte http que sur le réseau local', () => {
    expect(checkServer('http://192.168.1.20:8080').ok).toBe(true)
    expect(checkServer('http://ntfy.sh').ok).toBe(false)
  })

  it('refuse un chemin, un sujet collé ou n’importe quoi', () => {
    expect(checkServer('https://ntfy.sh/mon-sujet').ok).toBe(false)
    expect(checkServer('ntfy.sh').ok).toBe(false)
    expect(checkServer('ftp://ntfy.sh').ok).toBe(false)
  })
})

describe('pushBody', () => {
  it('passe les titres accentués sans les abîmer', () => {
    const body = JSON.parse(
      pushBody('animelist-x', { title: 'Épisode 3 disponible', message: '葬送のフリーレン' })
    ) as Record<string, unknown>
    expect(body).toEqual({
      topic: 'animelist-x',
      title: 'Épisode 3 disponible',
      message: '葬送のフリーレン',
      tags: ['tv']
    })
  })

  it('n’ajoute un lien que s’il y en a un', () => {
    const body = JSON.parse(pushBody('t', { title: 'a', message: 'b', click: 'http://192.168.1.2:8787/' })) as {
      click?: string
    }
    expect(body.click).toBe('http://192.168.1.2:8787/')
  })
})

describe('topicUrl', () => {
  it('colle le sujet au serveur', () => {
    expect(topicUrl('https://ntfy.sh/', 'abc')).toBe('https://ntfy.sh/abc')
  })
})
