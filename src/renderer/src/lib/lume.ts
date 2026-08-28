/**
 * La lumière ambiante de la fenêtre.
 *
 * Les trois halos du fond tiraient leur couleur de l'accent seul, la même quoi
 * qu'on regarde. Ils la tirent maintenant de la jaquette de l'anime dont la
 * page parle — mélangée à l'accent, jamais à sa place.
 *
 * Écrit directement sur l'élément racine plutôt que par un état React : la
 * valeur change à chaque affiche survolée et ne doit provoquer aucun rendu. La
 * traversée d'une couleur à l'autre est déclarée en CSS, pas ici.
 */
import { toneAccent } from './color'

const PROP = '--lume-src'

/** `null` rend la main à l'accent réglé par l'utilisateur. */
export function setLume(cover: string | null | undefined): void {
  const root = document.documentElement
  if (cover === null || cover === undefined) root.style.removeProperty(PROP)
  else root.style.setProperty(PROP, toneAccent(cover))
}
