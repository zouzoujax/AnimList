/**
 * La télécommande : piloter l'app depuis un téléphone, sur le même réseau.
 *
 * Un petit serveur et une page unique. Depuis le canapé : voir ce qu'il y a à
 * reprendre, cocher un épisode, ou faire ouvrir une fiche sur le PC.
 *
 * **Éteint par défaut, et c'est délibéré.** Allumer, c'est exposer sa
 * bibliothèque à tout ce qui est branché sur la même box. Trois garde-fous,
 * dans cet ordre d'importance :
 *
 * 1. Un mot de passe tiré au hasard à chaque allumage, exigé sur tout ce qui
 *    touche à la bibliothèque, comparé à durée constante. Il peut être choisi
 *    dans les réglages, pour ne plus avoir à rescanner : c'est alors un secret
 *    qui dure, et les règles qui l'encadrent sont dans `shared/remote.ts`.
 * 2. Une liste fermée de quatre adresses. Aucun chemin n'est jamais traduit en
 *    fichier, donc rien du disque ne peut fuir par une remontée
 *    d'arborescence.
 * 3. Peu de permissions d'écriture : cocher un épisode, ajouter une série,
 *    changer son statut. Pas de suppression, pas de réglages, pas d'export —
 *    et chaque écriture refait ici les vérifications que fait l'app.
 *
 * Il n'y a pas de chiffrement : c'est du HTTP en clair sur le réseau local. Ça
 * suffit chez soi et pas ailleurs — d'où le refus catégorique d'ouvrir ça sur
 * autre chose qu'une adresse privée.
 */

import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import { BrowserWindow } from 'electron'
import {
  checkChosen,
  makeToken,
  needsToken,
  REMOTE_PORT,
  icsUrl,
  remoteUrl,
  isRemoteStatus,
  routeOf,
  safeEqual,
  tokenFrom
} from '@shared/remote'
import { nextEpisode } from '@shared/resume'
import { canComplete, canTick, isUnaired } from '@shared/airing'
import { shouldOfferNext } from '@shared/binge'
import { playerIndex } from '@shared/as-players'
import { searchTitles } from '@shared/titles'
import { summarise, upcoming } from '@shared/summary'
import { buildIcs } from '@shared/ics'
import { episodeStrip } from '@shared/episode-strip'
import { aimFor, resolve as resolveAnimeSama } from './animesama'
import { franchiseTree } from './franchise'
import { openTrailerWindow } from './trailer'
import { openAnimeSamaEpisode, playerChoices, switchPlayer, watchWindow } from './watch-window'
import { sessionAutoSkip, setSessionAutoSkip } from './binge'
import { playerCommand, playerState, type PlayerAction, type PlayerState } from './playing'
import { browse, refreshMedia } from './anilist'
import { getMedia, getPrefs } from './store'
import { setEntry, setWatched, setWatchedUpTo, snapshot } from './store'
import { getLaunched, rememberLaunch, setLaunched, type Launched } from './now'
import { page } from './remote-page'

export interface RemoteStatus {
  on: boolean
  url: string | null
  /** Le calendrier des diffusions, à coller dans un agenda. */
  ics: string | null
  token: string | null
  port: number
  error: string | null
}

let server: Server | null = null
let token = ''
let status: RemoteStatus = { on: false, url: null, ics: null, token: null, port: REMOTE_PORT, error: null }

/** Le corps d'une requête, plafonné : rien ici n'a besoin d'être gros. */
async function readBody(req: IncomingMessage, max = 4096): Promise<string> {
  let out = ''
  for await (const chunk of req) {
    out += chunk
    if (out.length > max) throw new Error('corps trop gros')
  }
  return out
}

function json(res: ServerResponse, code: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    // La page ne parle qu'à son propre serveur : aucune raison qu'un site
    // ouvert à côté puisse l'interroger depuis le navigateur du téléphone.
    'Access-Control-Allow-Origin': 'null',
    'Cache-Control': 'no-store'
  })
  res.end(payload)
}

/**
 * Les séries de la bibliothèque, mises en forme pour le téléphone.
 *
 * Une seule fabrique pour l'accueil et pour la bibliothèque : deux mises en
 * forme finiraient par diverger, et un bouton « Vu » qui n'annonce pas le même
 * épisode d'un onglet à l'autre serait pire que pas de bouton du tout.
 */
function seriesRows(keep: (status: string) => boolean): {
  rows: Record<string, unknown>[]
} {
  const data = snapshot()
  const media = new Map(data.media.map((m) => [m.id, m]))

  const seen = new Map<number, Set<number>>()
  for (const ev of data.history) {
    const held = seen.get(ev.animeId) ?? new Set<number>()
    held.add(ev.episode)
    seen.set(ev.animeId, held)
  }

  const rows: Record<string, unknown>[] = []
  for (const entry of data.entries) {
    if (!keep(entry.status)) continue
    const found = media.get(entry.animeId)
    if (!found) continue
    const episode = nextEpisode(seen.get(entry.animeId), found.episodes)
    // Le retard se compte sur les épisodes **diffusés**, comme à l'accueil de
    // l'app : un épisode programmé pour jeudi n'est pas un retard.
    const aired = found.nextAiring ? found.nextAiring.episode - 1 : (found.episodes ?? 0)
    let behind = 0
    for (let n = 1; n <= aired; n += 1) if (!seen.get(entry.animeId)?.has(n)) behind += 1
    rows.push({
      id: entry.animeId,
      title: found.title.english ?? found.title.romaji,
      cover: found.cover.large,
      // La couleur de la jaquette teinte la frise et la fiche : chaque série
      // se reconnaît à la sienne, comme dans le nouveau design de l'app.
      color: found.cover.color,
      status: entry.status,
      // `null` quand tout est vu : la série n'a plus d'épisode à reprendre.
      episode,
      total: found.episodes,
      seen: seen.get(entry.animeId)?.size ?? 0,
      /** Épisodes sortis et pas encore vus : ce qui attend vraiment. */
      behind,
      /** Un caractère par épisode. Voir `shared/episode-strip`. */
      strip: episodeStrip(seen.get(entry.animeId), found.episodes, aired),
      // La série reste dans la liste, mais sans bouton : savoir qu'il n'y a
      // rien à regarder ce soir est une réponse, la masquer n'en est pas une.
      unaired: episode !== null && isUnaired(found, episode),
      // « Terminé » reste éteint tant que la série paraît : la règle de l'app,
      // dite d'avance plutôt que refusée après coup.
      finishable: canComplete(found, entry.status === 'completed'),
      airingAt: found.nextAiring?.airingAt ?? null,
      // La bande-annonce se sait d'avance ; l'adresse de lecture demande une
      // résolution réseau, faite seulement au moment où on la réclame.
      trailer: !!found.trailer?.id,
      updatedAt: entry.updatedAt
    })
  }

  rows.sort((a, b) => (b.updatedAt as number) - (a.updatedAt as number))
  return { rows }
}

/** Ce que la télécommande montre en arrivant : les séries en cours. */
async function remoteState(): Promise<unknown> {
  const rows = seriesRows((status) => status === 'watching').rows.filter((r) => r.episode !== null)
  // Ce qui joue en ce moment sur le PC, pour que le téléphone puisse le
  // piloter sans avoir à demander séparément.
  return { series: rows, player: await nowPlaying() }
}

/**
 * Le temps qu'on laisse au lecteur pour rattraper un changement d'épisode.
 *
 * Mesuré sur leur page : le cadre se recharge, la vidéo repart, et
 * `autostart` repasse toutes les sept dixièmes de seconde pendant une
 * quinzaine de secondes. Dix suffisent largement au cas courant, et le seul
 * coût d'une attente trop longue est un bouton qui tarde à reparaître.
 */
const SETTLE_MS = 10000

/**
 * L'épisode à proposer quand celui-ci touche à sa fin, s'il y en a un.
 *
 * Le téléphone est déjà en main : c'est le seul endroit où enchaîner ne
 * demande pas de se lever. La règle du « quand » est partagée avec le reste de
 * l'app ; ce qui se décide ici, c'est le « s'il y en a un » — une bande-annonce
 * n'a pas de suite, et le dernier épisode d'une série non plus.
 */
function offerNext(state: PlayerState, launched: Launched): number | null {
  if (state.kind !== 'animesama' || launched.note || launched.episode === null) return null
  // Le lecteur met quelques secondes à charger l'épisode qu'on vient de
  // lancer, et jusque-là il rapporte la fin du précédent. Sans ce délai, le
  // bouton reparaîtrait aussitôt sur le numéro d'après : un clic de trop
  // sauterait un épisode entier.
  if (Date.now() - launched.at < SETTLE_MS) return null
  if (!shouldOfferNext({ position: state.position, duration: state.duration, playing: state.playing })) return null

  const next = launched.episode + 1
  // Le compte d'épisodes manque parfois — une série en cours de diffusion dont
  // la fiche ne l'annonce pas. On propose alors : le site dira mieux que nous
  // si le numéro existe, et le bouton ne coûte rien s'il n'existe pas.
  const total = getMedia(launched.animeId)?.episodes ?? null
  return total !== null && next > total ? null : next
}

/** L'état du lecteur, complété par ce qu'on sait de la série lancée. */
async function nowPlaying(): Promise<unknown> {
  const state = await playerState()
  if (!state) {
    setLaunched(null)
    return null
  }
  const launched = getLaunched()
  // Le saut des génériques et le choix du lecteur n'ont de sens que chez eux :
  // une bande-annonce n'a ni l'un ni l'autre.
  const anime = state.kind === 'animesama'
  const autoSkip = anime ? sessionAutoSkip() : null
  const players = anime ? await playerChoices() : null
  return launched ? { ...state, ...launched, offerNext: offerNext(state, launched), autoSkip, players } : state
}

/**
 * Les adresses privées de cette machine.
 *
 * Sert à afficher celle qu'il faut taper sur le téléphone — et à refuser de
 * démarrer si la machine n'en a aucune, auquel cas le serveur ne serait
 * joignable que depuis l'extérieur.
 */
export function localAddresses(): string[] {
  const out: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family !== 'IPv4' || net.internal) continue
      // Seulement les plages privées : 10/8, 172.16/12, 192.168/16.
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(net.address)) out.push(net.address)
    }
  }
  return out
}

/**
 * Jusqu'où le calendrier regarde.
 *
 * Plus loin que les quinze jours de la page : un agenda se consulte à
 * l'avance, et rien ne coûte à y porter une date déjà connue. AniList
 * n'annonce de toute façon que le prochain épisode de chaque série, donc la
 * fenêtre ne fait qu'éviter d'écarter une reprise lointaine.
 */
const ICS_DAYS = 60

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? '/'
  const pathname = url.split('?')[0]
  const route = routeOf(pathname)

  if (route === 'unknown') return json(res, 404, { error: 'Adresse inconnue.' })

  if (route === 'page') {
    const html = page()
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html),
      'Cache-Control': 'no-store'
    })
    res.end(html)
    return
  }

  if (needsToken(route)) {
    const given = tokenFrom(url, req.headers.authorization)
    if (!given || !safeEqual(given, token)) return json(res, 401, { error: 'Mot de passe incorrect.' })
  }

  if (route === 'state') return json(res, 200, await remoteState())

  /**
   * L'état du lecteur seul.
   *
   * Le téléphone le relit toutes les deux secondes pour faire avancer le
   * curseur : passer par `/api/state` relirait la bibliothèque entière —
   * entrées, fiches et journal — à ce rythme-là, pour trois nombres.
   */
  if (route === 'player') return json(res, 200, { player: await nowPlaying() })

  // La bibliothèque entière, tous statuts confondus. Le tri par onglet se fait
  // sur le téléphone : cent lignes tiennent dans quelques dizaines de
  // kilo-octets, et refaire un aller-retour à chaque changement d'onglet
  // serait plus lent que de tout envoyer une fois.
  if (route === 'library')
    return json(
      res,
      200,
      seriesRows(() => true)
    )

  /**
   * Les épisodes d'une série, un par un.
   *
   * À part du reste : envoyer la liste complète de chaque série ferait passer
   * des milliers de numéros pour une seule qu'on ouvrira. Elle n'est demandée
   * qu'au moment où l'on déplie le choix.
   */
  if (route === 'episodes') {
    const id = Number(new URLSearchParams(url.slice(url.indexOf('?') + 1)).get('id'))
    const data = snapshot()
    const media = data.media.find((m) => m.id === id)
    if (!media) return json(res, 404, { error: 'Série inconnue.' })

    const watched = data.history.filter((ev) => ev.animeId === id).map((ev) => ev.episode)
    return json(res, 200, {
      id,
      title: media.title.english ?? media.title.romaji,
      total: media.episodes ?? 0,
      watched: [...new Set(watched)].sort((a, b) => a - b),
      // Le dernier épisode diffusé : au-delà, il n'y a rien à regarder ni à
      // cocher, et la grille le montre plutôt que de laisser essayer.
      lastAired: media.nextAiring ? media.nextAiring.episode - 1 : (media.episodes ?? 0)
    })
  }

  /**
   * L'arbre d'une franchise — ESSAI, comme sur le PC.
   *
   * Demandé au coup par coup et jamais avec l'état : il faut plusieurs
   * requêtes chez AniList pour le construire, et l'attacher au
   * rafraîchissement les referait toutes les vingt secondes pour un arbre que
   * personne ne regarde.
   *
   * Le calcul est celui de la fenêtre, au mot près — le même module, le même
   * cache. Un arbre qui ne dirait pas la même chose sur les deux écrans serait
   * pire que pas d'arbre du tout.
   */
  if (route === 'franchise') {
    const id = Number(new URLSearchParams(url.slice(url.indexOf('?') + 1)).get('id'))
    if (!Number.isInteger(id) || id <= 0) return json(res, 400, { error: 'Série inconnue.' })
    try {
      return json(res, 200, await franchiseTree(id))
    } catch (err) {
      return json(res, 502, { error: `Franchise illisible : ${(err as Error).message}` })
    }
  }

  /**
   * Le bilan et le calendrier, calculés ici.
   *
   * La page du téléphone n'a ni build ni dépendance : elle ne peut pas
   * réutiliser les écrans de l'app, qui sont du React compilé. Elle reçoit donc
   * des chiffres déjà faits, et n'a qu'à les mettre en forme.
   */
  if (route === 'stats' || route === 'calendar') {
    const data = snapshot()
    const media = new Map(
      data.media.map((m) => [
        m.id,
        {
          id: m.id,
          title: m.title.english ?? m.title.romaji,
          cover: m.cover.large,
          episodes: m.episodes,
          genres: m.genres,
          nextAiring: m.nextAiring
        }
      ])
    )
    const entries = data.entries.map((e) => ({ animeId: e.animeId, status: e.status }))

    if (route === 'stats') return json(res, 200, summarise(data.history, entries, media))
    const colors = new Map(data.media.map((m) => [m.id, m.cover.color]))
    return json(res, 200, {
      airing: upcoming(entries, media).map((a) => ({ ...a, color: colors.get(a.animeId) ?? null }))
    })
  }

  /**
   * Le calendrier des diffusions, pour l'agenda du téléphone.
   *
   * Servi depuis les fiches déjà en cache : un agenda abonné relit son
   * adresse tout seul, plusieurs fois par jour, et faire partir une requête
   * chez AniList à chaque fois épuiserait le quota pour rien.
   *
   * Le même contenu que le calendrier de la page, mis en forme pour un agenda
   * plutôt que pour un écran. Tout reste sur le réseau local : c'est le
   * téléphone qui vient chercher le fichier, rien ne part d'ici.
   */
  if (route === 'ics') {
    const data = snapshot()
    const media = new Map(
      data.media.map((m) => [
        m.id,
        {
          id: m.id,
          title: m.title.english ?? m.title.romaji,
          cover: m.cover.large,
          episodes: m.episodes,
          genres: m.genres,
          nextAiring: m.nextAiring
        }
      ])
    )
    const entries = data.entries.map((e) => ({ animeId: e.animeId, status: e.status }))
    const runtime = new Map(data.media.map((m) => [m.id, m.duration]))
    const fallback = getPrefs().defaultRuntime
    // Une alarme par épisode, au même moment que la notification du PC — sauf
    // pour une série mise en silence dans l'app : l'agenda n'a pas à sonner
    // pour ce que le PC tait.
    const muted = new Set(data.entries.filter((e) => e.notify === false).map((e) => e.animeId))
    const lead = Math.max(0, getPrefs().notifyLeadMinutes)

    const body = buildIcs(
      upcoming(entries, media, Date.now(), ICS_DAYS).map((a) => ({
        animeId: a.animeId,
        title: a.title,
        episode: a.episode,
        airingAt: a.airingAt,
        minutes: runtime.get(a.animeId) || fallback,
        alarm: muted.has(a.animeId) ? null : lead
      }))
    )
    res.writeHead(200, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      // Le nom du fichier sert quand on ouvre l'adresse à la main plutôt que
      // de s'y abonner : un agenda, lui, ne regarde que le type.
      'Content-Disposition': 'inline; filename="animelist.ics"',
      'Cache-Control': 'no-store'
    })
    res.end(body)
    return
  }

  if (route === 'discover') {
    const params = new URLSearchParams(url.slice(url.indexOf('?') + 1))
    const search = (params.get('q') ?? '').trim()
    const tab = params.get('kind') === 'season' ? 'season' : 'trending'
    const kind = search ? 'search' : tab

    /**
     * En file interactive : quelqu'un vient d'appuyer et regarde son
     * téléphone. C'est le vivier de « Pour toi » qui n'avait rien à y faire —
     * personne n'attendait celui-là.
     */
    const found = await browse(
      { kind, page: 1, perPage: 30, search: search || undefined },
      getPrefs().showAdult,
      'interactive'
    ).catch((err: Error) => err)

    if (found instanceof Error) {
      // Le préfixe datait des messages techniques — « HTTP 403 » ne disait pas
      // de qui il venait. Ceux d'aujourd'hui nomment déjà la source, et
      // l'ajouter donnait « AniList : Le catalogue AniList est indisponible ».
      const dit = found.message.includes('AniList') ? found.message : `AniList : ${found.message}`
      return json(res, 502, { error: dit })
    }

    const owned = new Set(snapshot().entries.map((e) => e.animeId))
    return json(res, 200, {
      items: found.items.map((m) => ({
        id: m.id,
        title: m.title.english ?? m.title.romaji,
        cover: m.cover.large,
        color: m.cover.color,
        year: m.seasonYear,
        format: m.format,
        score: m.averageScore,
        episodes: m.episodes,
        trailer: !!m.trailer?.id,
        owned: owned.has(m.id)
      }))
    })
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode refusée.' })

  let body: {
    id?: number
    episode?: number
    action?: string
    value?: number
    watched?: boolean
    upTo?: boolean
    status?: string
  }
  try {
    body = JSON.parse((await readBody(req)) || '{}') as typeof body
  } catch {
    return json(res, 400, { error: 'Requête illisible.' })
  }

  if (route === 'control') {
    /**
     * Le saut automatique des génériques, pour la séance.
     *
     * Pas une écriture dans les réglages — la télécommande n'en fait aucune —
     * mais un choix gardé en mémoire tant que la fenêtre de lecture reste
     * ouverte. Hors de cette fenêtre, il n'y aurait rien à quoi l'appliquer.
     */
    if (body.action === 'autoskip') {
      if (!watchWindow()) return json(res, 409, { error: 'Aucun épisode en cours de lecture.' })
      setSessionAutoSkip(Number(body.value) === 1)
      return json(res, 200, { player: await nowPlaying() })
    }

    /**
     * Un autre lecteur chez eux, sur le même épisode.
     *
     * Leur page conseille d'en changer quand la vidéo ne vient pas, et depuis
     * le canapé leur menu est hors d'atteinte. Le numéro est vérifié ici : il
     * finit dans un script exécuté dans leur page.
     */
    if (body.action === 'lecteur') {
      const index = playerIndex(body.value)
      if (index === null) return json(res, 400, { error: 'Lecteur inconnu.' })
      if (!(await switchPlayer(index))) {
        return json(res, 409, { error: 'Ce lecteur n’est pas proposé pour cet épisode.' })
      }
      return json(res, 200, { player: await nowPlaying() })
    }

    const action = String(body.action ?? '') as PlayerAction
    const allowed: PlayerAction[] = ['play', 'pause', 'seek', 'volume', 'fullscreen', 'windowed', 'close', 'skip']
    if (!allowed.includes(action)) return json(res, 400, { error: 'Commande inconnue.' })

    const done = await playerCommand(action, { value: Number(body.value) })
    if (!done) return json(res, 409, { error: 'Rien à piloter, ou commande hors de portée de ce lecteur.' })
    return json(res, 200, { player: await nowPlaying() })
  }

  const id = Number(body.id)
  if (!Number.isInteger(id) || id <= 0) return json(res, 400, { error: 'Série inconnue.' })

  if (route === 'add') {
    const media = snapshot().media.find((m) => m.id === id)
    // La fiche vient du catalogue qu'on vient d'afficher : elle n'est pas
    // encore en cache. On la redemande plutôt que d'écrire une entrée sans
    // titre ni jaquette, invisible partout ailleurs.
    const fresh = media ?? (await refreshMedia([id]).catch(() => []))[0]
    if (!fresh) return json(res, 404, { error: 'Série introuvable.' })

    setEntry(id, { status: 'planned' }, fresh)
    return json(res, 200, { ok: true })
  }

  /**
   * Changer le statut d'une série de la liste.
   *
   * Seulement une série déjà suivie : ajouter passe par `add`, qui va chercher
   * la fiche. Et « Terminé » refusé tant que la série paraît, comme sur le PC —
   * la page éteint le bouton, mais une page n'a jamais protégé une écriture.
   */
  if (route === 'status') {
    const next = body.status
    if (!isRemoteStatus(next)) return json(res, 400, { error: 'Statut inconnu.' })

    const data = snapshot()
    const entry = data.entries.find((e) => e.animeId === id)
    if (!entry) return json(res, 404, { error: 'Cette série n’est pas dans ta liste.' })
    const media = data.media.find((m) => m.id === id)
    if (next === 'completed' && media && !canComplete(media, entry.status === 'completed')) {
      return json(res, 409, { error: 'Elle n’a pas fini de sortir : impossible de la marquer terminée.' })
    }

    if (entry.status !== next) setEntry(id, { status: next })
    return json(res, 200, { ok: true, status: next })
  }

  if (route === 'tick') {
    const episode = Number(body.episode)
    if (!Number.isInteger(episode) || episode <= 0) return json(res, 400, { error: 'Épisode inconnu.' })

    // Décocher est toujours permis : c'est la porte de sortie d'une coche
    // arrivée par un import ou par une diffusion repoussée après coup.
    const on = body.watched !== false

    /**
     * Le refus est ici, pas seulement dans la page.
     *
     * Une page restée ouverte depuis hier propose encore l'épisode d'hier ; et
     * rien n'oblige quiconque sur le réseau à passer par notre page. Un écran
     * qui cache un bouton n'a jamais protégé une écriture.
     */
    const media = snapshot().media.find((m) => m.id === id)
    const already = snapshot().history.some((ev) => ev.animeId === id && ev.episode === episode)
    if (on && media && !canTick(media, episode, already)) {
      return json(res, 409, { error: `L’épisode ${episode} n’est pas encore sorti.` })
    }

    // « Jusqu'ici » rattrape une saison entière d'un geste, ce qui est la
    // raison d'être d'une liste d'épisodes sur un téléphone.
    if (on && body.upTo === true) setWatchedUpTo(id, episode)
    else setWatched(id, episode, on)

    return json(res, 200, await remoteState())
  }

  // Les actions qui touchent la machine plutôt que les données. Toutes
  // passent par le mot de passe : ouvrir une fenêtre sur le PC de quelqu'un
  // est au moins aussi intrusif que lire sa liste.
  const win = BrowserWindow.getAllWindows()[0]
  if (!win || win.isDestroyed()) return json(res, 409, { error: 'Aucune fenêtre ouverte sur le PC.' })

  /**
   * `open` : la fiche, sur le PC. Avant la recherche en cache, et c'est tout
   * l'objet de ce commentaire.
   *
   * Ouvrir une fiche ne demande qu'un numéro : c'est la fenêtre qui va
   * chercher la série chez AniList, et elle sait le faire pour une série qu'on
   * n'a jamais ouverte. L'exiger en cache refusait tout ce qui vient de
   * Découvrir — le catalogue n'est pas gardé, seules les séries suivies le
   * sont —, et le téléphone répondait « Série inconnue » sur la moitié des
   * jaquettes, au hasard de ce qui traînait déjà dans la bibliothèque.
   *
   * Les deux routes qui suivent, elles, ont vraiment besoin de la fiche : la
   * bande-annonce y prend son identifiant vidéo, et la lecture ses titres pour
   * retrouver la série chez Anime-Sama. Elles ne sont proposées que sur les
   * séries de la bibliothèque, toujours en cache.
   */
  if (route === 'open') {
    if (win.isMinimized()) win.restore()
    win.focus()
    win.webContents.send('nav:open-anime', id)
    return json(res, 200, { ok: true })
  }

  const media = snapshot().media.find((m) => m.id === id)
  if (!media) return json(res, 404, { error: 'Série inconnue.' })

  if (route === 'trailer') {
    const video = media.trailer?.id
    if (!video) return json(res, 404, { error: 'Pas de bande-annonce pour cette série.' })
    rememberLaunch(id, null, 'Bande-annonce')
    const opened = await openTrailerWindow(win, video, media.title.english ?? media.title.romaji)
    return opened ? json(res, 200, { ok: true }) : json(res, 502, { error: 'La bande-annonce n’a pas pu s’ouvrir.' })
  }

  if (route === 'watch') {
    /**
     * L'adresse est résolue ici, pas gardée dans l'état.
     *
     * La résolution interroge le site : la faire pour toute la liste à chaque
     * rafraîchissement coûterait une requête par série toutes les vingt
     * secondes, pour des adresses dont une seule sera ouverte.
     */
    const target = await resolveAnimeSama(id, searchTitles(media.title)).catch(() => null)
    if (!target?.url) return json(res, 404, { error: 'Série introuvable sur Anime-Sama.' })

    // Seule une adresse portant un menu d'épisodes peut être positionnée ;
    // ailleurs on ouvre la page telle quelle plutôt que de viser à côté.
    const episode = Number(body.episode)
    const at = target.episodes && Number.isInteger(episode) && episode > 0 ? episode : null
    const aim = aimFor(id, target.url, at)
    const opened = await openAnimeSamaEpisode(target.url, aim.episode, aim.entry)
    if (!opened) return json(res, 502, { error: 'Le lecteur n’a pas pu s’ouvrir.' })
    rememberLaunch(id, at)
    return json(res, 200, { player: await nowPlaying() })
  }

  return json(res, 404, { error: 'Adresse inconnue.' })
}

export function remoteStatus(): RemoteStatus {
  return status
}

/**
 * Le mot de passe de cette session.
 *
 * Celui des réglages s'il y en a un et qu'il tient les règles, un tirage neuf
 * sinon. Un mot de passe enregistré qui ne les tiendrait pas — un fichier de
 * préférences modifié à la main — ne fait pas échouer l'allumage : on retombe
 * sur le hasard, qui protège au moins autant.
 */
function sessionToken(): string {
  const chosen = checkChosen(getPrefs().remotePassword ?? '')
  return chosen.ok ? chosen.token : makeToken(randomBytes(64))
}

/** Allume le serveur. Un nouveau mot de passe à chaque fois, sauf s'il est choisi. */
export function startRemote(port = REMOTE_PORT): Promise<RemoteStatus> {
  return new Promise((resolve) => {
    if (server) {
      resolve(status)
      return
    }

    const hosts = localAddresses()
    if (!hosts.length) {
      status = {
        on: false,
        url: null,
        ics: null,
        token: null,
        port,
        error: 'Aucun réseau local détecté sur cette machine.'
      }
      resolve(status)
      return
    }

    token = sessionToken()
    const next = createServer((req, res) => {
      void handle(req, res).catch(() => {
        if (!res.headersSent) json(res, 500, { error: 'Erreur interne.' })
      })
    })

    next.on('error', (err: NodeJS.ErrnoException) => {
      server = null
      // Le cas courant : une autre AnimeList ouverte — l'installée à côté de
      // celle de développement — a déjà sa télécommande allumée. Le message
      // de Node, « listen EADDRINUSE », ne le disait à personne.
      const error =
        err.code === 'EADDRINUSE'
          ? `Le port ${port} est déjà pris : une autre fenêtre AnimeList a sans doute sa télécommande allumée. Éteins-la, puis réessaie.`
          : err.message
      status = { on: false, url: null, ics: null, token: null, port, error }
      resolve(status)
    })

    next.listen(port, '0.0.0.0', () => {
      server = next
      status = {
        on: true,
        url: remoteUrl(hosts[0], port, token),
        ics: icsUrl(hosts[0], port, token),
        token,
        port,
        error: null
      }
      resolve(status)
    })
  })
}

export function stopRemote(): RemoteStatus {
  server?.close()
  server = null
  // Le mot de passe meurt avec le serveur : le rallumage en tire un neuf, si
  // bien qu'une adresse notée hier ne rouvre rien aujourd'hui. À moins qu'il
  // n'ait été choisi dans les réglages — c'est justement ce qu'on demande
  // alors, et le lien mis en favori continue de marcher.
  token = ''
  status = { on: false, url: null, ics: null, token: null, port: status.port, error: null }
  return status
}
