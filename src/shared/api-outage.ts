/**
 * Ce qu'on dit quand AniList ne répond pas, et pour combien de temps on se tait.
 *
 * Le transport ne gardait du refus que son numéro : `AniList HTTP 403`, qui
 * remontait tel quel jusqu'à l'écran, enveloppé dans un « Error invoking remote
 * method ». Or le corps de la réponse portait l'explication complète — leur API
 * coupée volontairement — et le code la jetait avant de la lire.
 *
 * Deux décisions vivent ici, et elles sont l'affaire d'une règle plutôt que
 * d'un `if` perdu dans une fonction de trois cents lignes :
 *
 * **Ce qu'on montre.** Un message dit ce qui ne marche pas, mais surtout ce qui
 * marche encore : la bibliothèque, les épisodes et les statistiques ne touchent
 * jamais au réseau. Sans cette seconde phrase, une panne de leur côté se lit
 * comme une app cassée du nôtre.
 *
 * **Combien de temps on se tait.** Une API coupée par décision ne revient pas
 * dans la seconde : continuer à l'appeler fait clignoter la même erreur sur
 * chaque page, à chaque veille de diffusion, à chaque balayage de suites. Un
 * quart d'heure de silence vaut mieux, et rien n'est perdu — tout ce que l'app
 * sait déjà vient du cache.
 */

/** Coupure décidée par eux : elle dure, on n'insiste pas. */
export const OUTAGE_MS = 15 * 60_000

/** Hoquet de serveur : ça peut revenir tout de suite. */
export const HICCUP_MS = 60_000

export interface Failure {
  /** Ce que l'app affiche. En français, et sans jargon de transport. */
  message: string
  /** Combien de temps ne plus appeler. Zéro quand la panne n'a rien de général. */
  pauseMs: number
}

/**
 * Leur formulation exacte au 6 septembre 2026 :
 * « The AniList API has been temporarily disabled due to severe stability
 * issues. » On ne reconnaît que « disabled », le reste de la phrase étant
 * précisément ce qui risque de changer sans prévenir.
 */
const DISABLED = /disabled/i

export function failureOf(status: number, apiMessage: string | null): Failure {
  if (status === 403 && apiMessage && DISABLED.test(apiMessage)) {
    return {
      // Court, parce qu'il s'affiche aussi dans une colonne étroite : la
      // version longue s'y déroulait sur dix lignes. Il dit quand même les deux
      // choses qui comptent — ce qui est cassé, et ce qui ne l'est pas.
      message:
        'Le catalogue AniList est indisponible : ils ont coupé leur API. ' +
        'Ta bibliothèque et tes statistiques n’en dépendent pas.',
      pauseMs: OUTAGE_MS
    }
  }

  if (status === 403 || status === 401) {
    return { message: 'AniList refuse l’accès à son catalogue.', pauseMs: HICCUP_MS }
  }

  if (status >= 500) {
    return { message: 'AniList est momentanément en panne. Réessaie dans un instant.', pauseMs: HICCUP_MS }
  }

  // Une réponse que le serveur juge fautive n'a pas de raison de faire taire
  // les autres : c'est cette requête-là qui ne va pas, pas le service.
  return { message: apiMessage ?? `AniList a répondu ${status}.`, pauseMs: 0 }
}

/**
 * Débarrasse un rejet d'IPC de son emballage.
 *
 * Electron enveloppe toute erreur qui traverse le pont : le message soigné
 * qu'on vient d'écrire arrive à l'écran sous la forme
 * `Error invoking remote method 'anime:airing': Error: …`. Le lecteur n'a que
 * faire du nom de la méthode, et « Error: Error: » n'a jamais renseigné
 * personne.
 *
 * On ne retire que l'emballage exact, et rien d'autre : une erreur qui ne
 * viendrait pas du pont doit ressortir intacte.
 */
const WRAPPER = /^Error invoking remote method '[^']*':\s*(?:[A-Za-z]*Error:\s*)?/

export function humanMessage(raw: string): string {
  return raw.replace(WRAPPER, '').trim() || raw
}
