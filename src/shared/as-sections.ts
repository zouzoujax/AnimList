/**
 * Les sections d'une série chez Anime-Sama, et celle qui porte un film ou un OAV.
 *
 * Le résolveur ne connaissait que `saison<N>/` : un spécial comme « Kaiju No. 8:
 * Hoshina's Day Off » ouvrait donc la saison 1 de la série. Leur site range
 * pourtant films et OAV à part, et le déclare sur la page de la série :
 *
 *     panneauAnime("Saison 1", "saison1/vostfr");
 *     panneauAnime("OAV", "oav/vostfr");
 *     panneauAnime("Film - Train de l'infini", "film1/vostfr");
 *
 * Dans une de ces sections, les entrées ne s'appellent pas « Episode 3 » mais
 * par leur titre — `newSPF("Hoshina's Day Off")` —, et plusieurs spéciaux
 * partagent la même page. Viser la section ne suffit donc pas : il faut aussi
 * l'entrée, retrouvée par son nom.
 *
 * Pur et testé : les pages arrivent en texte, rien ici ne touche au réseau.
 */

import { compact, similarity } from './titles'

export interface Section {
  /** Ce que leur page affiche : « OAV », « Film - Train de l'infini »… */
  name: string
  /** Le chemin sans la langue : `oav`, `film1`, `saison1hs`. */
  base: string
}

/** Une entrée nommée dans le menu d'une section, et sa place (à partir de 1). */
export interface Entry {
  index: number
  name: string
}

/** Les formats qui ne vivent jamais sous `saison<N>/`. */
export const isSideFormat = (format: string | null | undefined): boolean =>
  format === 'MOVIE' || format === 'OVA' || format === 'SPECIAL'

const stripComments = (html: string): string => html.replace(/\/\*[\s\S]*?\*\//g, '')

/** Chaîne JavaScript entre guillemets doubles ou simples, échappements compris. */
const JS_STRING = String.raw`(["'])((?:(?!\1)[^\\]|\\.)*)\1`

const unescapeJs = (text: string): string => text.replace(/\\(.)/g, '$1')

export function sectionsIn(html: string): Section[] {
  const out: Section[] = []
  const pattern = new RegExp(String.raw`panneauAnime\(\s*${JS_STRING}\s*,\s*(["'])((?:(?!\3)[^\\]|\\.)*)\3\s*\)`, 'g')
  for (const m of stripComments(html).matchAll(pattern)) {
    const name = unescapeJs(m[2])
    const path = unescapeJs(m[4])
    // Le modèle laissé dans leur page : `panneauAnime("nom", "url")`.
    if (name === 'nom' && path === 'url') continue
    const base = path.split('/')[0]
    if (base && !out.some((s) => s.base === base)) out.push({ name, base })
  }
  return out
}

/**
 * Les sections où chercher un film ou un OAV.
 *
 * Le chemin dit la nature — `film`, `film2`, `oav` —, le nom ne la dit pas
 * toujours : chez Slime, le premier film s'appelle « Scarlet Bond ».
 */
export function sectionsFor(sections: Section[], format: string | null | undefined): Section[] {
  const kind = format === 'MOVIE' ? /^film\d*$/ : /^oav\d*$/
  return sections.filter((s) => kind.test(s.base))
}

/**
 * Les noms du menu d'une section, dans l'ordre où leur script les crée.
 *
 * Seulement quand le menu est fait d'entrées nommées. Mêlé à des épisodes
 * numérotés (`creerListe(1, 12)`), la place d'une entrée dépend de calculs
 * qu'on ne referait pas sans risque de viser à côté : on rend alors une liste
 * vide, et la section s'ouvre sans entrée.
 */
export function entriesIn(html: string): string[] {
  const code = stripComments(html)
  if (/creerListe\s*\(\s*\d/.test(code)) return []
  const pattern = new RegExp(String.raw`newSPF\(\s*${JS_STRING}\s*\)`, 'g')
  return [...code.matchAll(pattern)].map((m) => unescapeJs(m[2]).trim())
}

/** Seuil de ressemblance : assez haut pour ne pas confondre deux spéciaux d'une même série. */
const MATCH = 0.72

/**
 * Le titre et ses sous-titres : « Kaiju No. 8: Hoshina's Day Off » donne aussi
 * « Hoshina's Day Off », qui est le nom que leur menu emploie.
 */
function variants(titles: string[]): string[] {
  const out = new Set<string>()
  for (const title of titles) {
    if (!title) continue
    out.add(compact(title))
    for (const part of title.split(/\s*[:：~～]\s*|\s+-\s+/).slice(1)) out.add(compact(part))
  }
  return [...out].filter((v) => v.length >= 3)
}

function score(candidate: string, titles: string[]): number {
  const flat = compact(candidate)
  if (flat.length < 3) return 0
  let best = 0
  for (const v of variants(titles)) {
    best = Math.max(best, similarity(v, flat))
    // Un nom court entièrement contenu dans le titre, ou l'inverse.
    if (Math.min(v.length, flat.length) >= 6 && (v.includes(flat) || flat.includes(v))) best = Math.max(best, 0.9)
  }
  return best
}

/** Même nature qu'une section : film avec film, OVA et spécial ensemble. */
export const sameKind = (a: string | null | undefined, b: string | null | undefined): boolean =>
  a === 'MOVIE' ? b === 'MOVIE' : isSideFormat(a) && isSideFormat(b) && b !== 'MOVIE'

/** La place d'une série parmi ses sœurs (à partir de 1), et leur nombre. */
export interface Rank {
  position: number
  of: number
}

/**
 * La place d'un film parmi ceux de sa série, dans l'ordre de sortie.
 *
 * Par date quand toutes sont connues ; sinon par identifiant AniList, attribué
 * à l'ajout dans leur base et donc presque toujours dans l'ordre de sortie —
 * les fiches gardées hors ligne n'ont souvent pas de date.
 */
export function rankAmong(siblings: { id: number; date: number | null }[], id: number): Rank | null {
  const dated = siblings.every((s) => s.date !== null)
  const order = [...siblings].sort((a, b) => (dated ? (a.date as number) - (b.date as number) : 0) || a.id - b.id)
  const at = order.findIndex((s) => s.id === id)
  return at === -1 ? null : { position: at + 1, of: order.length }
}

export interface SideOption extends Section {
  /** Les noms du menu de la section (voir `entriesIn`). */
  names: string[]
}

/**
 * La section et l'entrée d'un film ou d'un OAV.
 *
 * Un nom d'entrée qui ressemble au titre l'emporte ; à défaut, un nom de
 * section.
 *
 * Rien qui ressemble — leurs titres sont souvent en français, ceux d'AniList
 * en anglais : « La Légende de la pierre de Guelel » contre « Legend of the
 * Stone of Gelel » — : la place de sortie prend le relais. Leur menu range les
 * films dans l'ordre de sortie, sections comprises (`film1`, puis `film2`) ;
 * on ne s'y fie que si le compte est le même des deux côtés, sans quoi la place
 * ne voudrait plus rien dire.
 *
 * En dernier recours, la première section de la bonne nature, avec son entrée
 * si elle n'en a qu'une. Mieux vaut la page des OAV que la saison 1.
 */
export function chooseSide(
  options: SideOption[],
  titles: string[],
  rank: Rank | null = null
): { base: string; entry: Entry | null } | null {
  let best: { base: string; entry: Entry | null; score: number } | null = null
  const offer = (base: string, entry: Entry | null, s: number): void => {
    if (s >= MATCH && (best === null || s > best.score)) best = { base, entry, score: s }
  }

  for (const option of options) {
    for (const [i, name] of option.names.entries()) offer(option.base, { index: i + 1, name }, score(name, titles))
    const only = option.names.length === 1 ? { index: 1, name: option.names[0] } : null
    offer(option.base, only, score(option.name, titles))
  }

  const found = best as { base: string; entry: Entry | null } | null
  if (found) return { base: found.base, entry: found.entry }

  const flat = options.flatMap((o) => o.names.map((name, i) => ({ base: o.base, entry: { index: i + 1, name } })))
  if (rank && flat.length === rank.of) return flat[rank.position - 1]

  const first = options[0]
  if (!first) return null
  return { base: first.base, entry: first.names.length === 1 ? { index: 1, name: first.names[0] } : null }
}
