/**
 * La langue d'une saison chez Anime-Sama.
 *
 * Leurs épisodes vivent sous `saison<N>/<langue>/`, et une même saison existe
 * souvent dans les deux : sur leur page, deux pastilles VO et VF. Le résolveur
 * de l'app sondait `vostfr` puis `vf` et s'arrêtait au premier trouvé — la VF
 * n'était donc jamais joignable dès que la VO existait, ce qui est presque
 * toujours le cas.
 *
 * Ces quelques lignes vivent à part parce que trois endroits doivent s'accorder
 * sur elles : le résolveur qui découvre les langues, la bibliothèque qui retient
 * le choix, et la fiche qui l'affiche. Un ordre différent d'un côté et la
 * pastille allumée ne serait pas celle qu'on regarde.
 */

/** Dans l'ordre où le site les présente. */
export const LANGS = ['vostfr', 'vf'] as const

export type Lang = (typeof LANGS)[number]

/** Ce que leur page affiche : une pastille au drapeau japonais, une au français. */
export const LANG_LABELS: Record<Lang, string> = {
  vostfr: 'VO',
  vf: 'VF'
}

export const isLang = (value: unknown): value is Lang => LANGS.includes(value as Lang)

/**
 * La langue à ouvrir, parmi celles que la saison propose.
 *
 * Le choix retenu l'emporte, mais seulement s'il existe encore : une série
 * regardée en VF peut perdre sa VF lors d'une refonte du site, et ouvrir une
 * adresse morte serait pire que de retomber sur la VO.
 */
export function pickLang(available: string[], chosen: string | null | undefined): Lang | null {
  const known = LANGS.filter((l) => available.includes(l))
  if (known.length === 0) return null
  if (chosen && known.includes(chosen as Lang)) return chosen as Lang
  return known[0]
}

/**
 * La même adresse, dans une autre langue.
 *
 * Le segment de langue est le dernier du chemin, juste avant la barre finale :
 * `/catalogue/<slug>/saison1/vostfr/`. Écrit ici plutôt qu'aux deux endroits
 * qui en ont besoin — le résolveur et la fiche — pour que la fenêtre et le
 * processus principal ne puissent pas fabriquer deux adresses différentes.
 *
 * Une adresse qui ne finit pas par une langue connue revient telle quelle : ce
 * n'est pas une page d'épisodes, il n'y a rien à basculer.
 */
export function langUrl(url: string, lang: Lang): string {
  return url.replace(/\/(?:vostfr|vf)\/$/, `/${lang}/`)
}
