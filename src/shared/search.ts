/**
 * Retrouver une série dans sa bibliothèque quand on ne tape pas son titre.
 *
 * Ce qui marchait déjà : les accents et la ponctuation, écrasés par `compact`
 * — « jujutsu kaïsen » trouvait « Jujutsu Kaisen ». Ce qui ne marchait pas :
 * les abréviations (« jjk »), les mots dans le désordre (« kaisen jujutsu »)
 * et les fautes de frappe (« jujutsu kaisan »), parce qu'un `includes` est
 * tout ou rien.
 *
 * Chaque règle rend un score plutôt qu'un oui/non, et le meilleur gagne : une
 * bibliothèque de cent séries ne supporte pas qu'une recherche tolérante
 * remonte dix réponses dans le désordre. Ce qui ressemble exactement à ce
 * qu'on a tapé passe devant ce qui y ressemble de loin.
 */

import { compact, deaccent, similarity } from './titles'

/** Au-dessous, tout ressemble à tout : « re » serait une sous-suite de la moitié du catalogue. */
const MIN_LOOSE = 3

/** À partir d'ici, une faute de frappe reste la même intention. Mesuré sur des titres réels. */
const FUZZY = 0.72

export interface Candidate {
  /** Les titres connus : romaji, anglais, natif. Les vides sont ignorés. */
  titles: (string | null | undefined)[]
  /** Les surnoms donnés à la main. Ils passent avant tout le reste. */
  aliases?: string[]
}

/** Les mots d'un titre, sans accents ni ponctuation : « Re:Zero kara » → [re, zero, kara]. */
function words(title: string): string[] {
  return deaccent(title)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/**
 * Les positions où commence un mot, dans la forme compactée.
 *
 * C'est ce qui sépare une abréviation d'un hasard : dans « jujutsukaisen »,
 * le « k » de « jjk » tombe au début de « kaisen ».
 */
function starts(title: string): Set<number> {
  const out = new Set<number>()
  let at = 0
  for (const word of words(title)) {
    out.add(at)
    at += word.length
  }
  return out
}

/**
 * Les lettres tapées forment-elles une abréviation de ce titre, et à quel point ?
 *
 * Rend la part des lettres qui ouvrent un mot, ou `0` si ce n'en est pas une.
 * « snk » vaut 1 pour « Shingeki no Kyojin » — trois initiales sur trois — et
 * deux tiers pour « Shaman King », où le « n » tombe au milieu. C'est ce qui
 * les range dans le bon ordre.
 *
 * Deux garde-fous, tous deux mesurés sur la vraie bibliothèque : la moitié des
 * lettres au moins doit ouvrir un mot, et la première doit ouvrir le titre.
 * Sans la seconde, « snk » remontait dix-huit séries dont KONOSUBA, et « aot »
 * treize dont « The Seven Deadly Sins » — une sous-suite finit toujours par se
 * trouver quelque part dans un titre assez long.
 */
function abbreviates(needle: string, title: string): number {
  const flat = compact(title)
  if (flat[0] !== needle[0]) return 0
  const wordStarts = starts(title)
  let at = 0
  let onStarts = 0

  for (const char of needle) {
    // Un début de mot d'abord, la première occurrence venue ensuite. Prendre
    // toujours la plus proche coûtait « snk » : le « n » tombait au milieu de
    // « shingeki », et le « no » qui suit n'était plus disponible.
    let found = -1
    for (const start of wordStarts) {
      if (start >= at && flat[start] === char && (found < 0 || start < found)) found = start
    }
    if (found < 0) found = flat.indexOf(char, at)
    else onStarts += 1
    if (found < 0) return 0
    at = found + 1
  }

  const ratio = onStarts / needle.length
  return ratio >= 0.5 ? ratio : 0
}

/** Tous les mots tapés se retrouvent-ils, quel que soit l'ordre ? */
function allWords(needle: string, title: string): boolean {
  const flat = compact(title)
  const asked = needle.split(/\s+/).filter(Boolean).map(compact).filter(Boolean)
  return asked.length > 1 && asked.every((word) => flat.includes(word))
}

/**
 * La ressemblance la plus forte entre ce qu'on a tapé et une partie du titre.
 *
 * Comparée au titre entier, « frieren » ressemble de loin à « Sousou no
 * Frieren » : un titre long noie une requête courte. On compare donc aussi
 * mot à mot, et au début du titre de la même longueur que la requête.
 */
function closeness(flat: string, title: string): number {
  const whole = compact(title)
  let best = similarity(flat, whole)
  best = Math.max(best, similarity(flat, whole.slice(0, flat.length)))
  for (const word of words(title)) best = Math.max(best, similarity(flat, word))
  return best
}

/**
 * À quel point cette série répond-elle à ce qu'on a tapé ? `0` = pas du tout.
 *
 * Les paliers, du plus sûr au plus large : un surnom qu'on a soi-même donné,
 * le titre exact, le titre qui contient la requête, tous les mots dans le
 * désordre, une abréviation, puis une faute de frappe.
 */
export function matchScore(needle: string, candidate: Candidate): number {
  const flat = compact(needle)
  if (!flat) return 0

  const titles = candidate.titles.filter((t): t is string => !!t)
  const aliases = candidate.aliases ?? []

  for (const alias of aliases) {
    const flatAlias = compact(alias)
    if (!flatAlias) continue
    if (flatAlias === flat) return 100
    if (flatAlias.includes(flat)) return 95
  }

  let best = 0
  for (const title of titles) {
    const whole = compact(title)
    if (whole === flat) return 90
    if (whole.includes(flat)) best = Math.max(best, 80)
  }
  if (best) return best

  for (const title of titles) if (allWords(needle, title)) return 70

  if (flat.length >= MIN_LOOSE) {
    // L'abréviation parfaite — une initiale par lettre — passe devant celle
    // dont une lettre traîne au milieu d'un mot.
    let sharp = 0
    for (const title of titles) sharp = Math.max(sharp, abbreviates(flat, title))
    if (sharp > 0) return 55 + Math.round(sharp * 10)
  }

  // La faute de frappe en dernier : c'est la règle qui se trompe le plus, et
  // elle ne doit jamais passer devant une réponse franche.
  let fuzzy = 0
  for (const title of titles) fuzzy = Math.max(fuzzy, closeness(flat, title))
  return fuzzy >= FUZZY ? 40 + Math.round((fuzzy - FUZZY) * 50) : 0
}

/** Les surnoms d'une série, tels qu'ils sont rangés dans les préférences. */
export function aliasesOf(store: Record<string, string[]> | undefined, animeId: number): string[] {
  return store?.[String(animeId)] ?? []
}

/**
 * Ce qu'on vient de taper dans le champ « surnoms », rangé.
 *
 * Séparés par des virgules, sans doublon, sans vide, et bornés : un surnom
 * n'est pas une note, et un champ sans limite finit par en tenir lieu.
 */
export function parseAliases(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(',')) {
    const alias = raw.trim().slice(0, 40)
    if (!alias || out.some((kept) => kept.toLowerCase() === alias.toLowerCase())) continue
    out.push(alias)
    if (out.length >= 8) break
  }
  return out
}
