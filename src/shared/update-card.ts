/**
 * Ce que la petite fenêtre de mise à jour montre, et à quel moment.
 *
 * Elle ne parle à personne : elle traduit un `UpdateStatus` en une carte —
 * un titre, une ligne, une barre — ou en `null` quand il n'y a plus rien à
 * suivre.
 *
 * **Aucun bouton.** La carte rend compte, elle ne demande rien : la décision a
 * déjà été prise dans les réglages, et la reposer par-dessus reviendrait à
 * demander deux fois. Elle s'ouvre sur ce clic-là, et se ferme d'elle-même.
 *
 * **Le pourcentage est celui du téléchargement, pas de l'installation.** La
 * distinction n'est pas un détail de vocabulaire : l'installeur NSIS tourne
 * *après* la fermeture de l'app, en silence, et ne rend aucune progression à
 * personne. Afficher « installation 42 % » serait inventer un chiffre. La
 * dernière étape est donc annoncée sans nombre, et elle dure une seconde.
 *
 * Le `null` reste utile une fois la carte ouverte : c'est ce qui la ferme
 * quand le cycle retombe — plus rien à suivre, plus de fenêtre.
 */

import type { UpdateStatus } from './types'

/**
 * La barre : une valeur connue, un va-et-vient quand l'étape n'a pas de
 * mesure, ou rien du tout. Le va-et-vient dit « ça travaille » sans prétendre
 * savoir où ça en est.
 */
export type UpdateBar = 'none' | 'value' | 'sweep'

export interface UpdateCard {
  title: string
  line: string
  /** `null` quand la barre n'a pas de valeur à montrer. */
  percent: number | null
  bar: UpdateBar
}

/** Un pourcentage montrable : entier, entre 0 et 100, jamais NaN. */
export function clampPercent(value: number): number {
  // `NaN` traverse les comparaisons sans jamais être borné : il ressortirait
  // tel quel, et une barre large de « NaN % » est ignorée par le navigateur —
  // elle resterait figée sans que rien ne le dise.
  if (Number.isNaN(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

/**
 * La carte à dessiner, ou `null` quand la fenêtre n'a pas lieu d'être.
 *
 * `installing` n'est pas une phase du cycle : c'est le fait que quelqu'un
 * vienne de cliquer sur « Redémarrer ». L'app se ferme dans la seconde, et
 * sans cet état la carte afficherait « prête à installer » pendant qu'elle
 * s'installe.
 */
export function updateCard(status: UpdateStatus, installing = false): UpdateCard | null {
  const title = status.version ? `AnimeList ${status.version}` : 'AnimeList'

  if (installing) return { title, line: 'Installation…', percent: null, bar: 'sweep' }

  switch (status.phase) {
    case 'available':
      // Le téléchargement démarre dans la seconde : la carte annonce ce qui
      // commence plutôt que de rester vide le temps du premier octet.
      return { title, line: 'Nouvelle version disponible', percent: 0, bar: 'value' }
    case 'downloading': {
      const percent = clampPercent(status.percent)
      return { title, line: `Téléchargement… ${percent} %`, percent, bar: 'value' }
    }
    case 'ready':
      return { title, line: 'Prête à installer', percent: 100, bar: 'value' }
    default:
      // « à jour », « recherche », et l'erreur : plus rien à suivre. La carte
      // s'efface, et les réglages disent le reste à qui va les lire.
      return null
  }
}
