/**
 * Pose l'épisode voulu avant qu'Anime-Sama ne se charge.
 *
 * Le site n'a pas d'adresse par épisode — vérifié : `?episode=5` rend la page
 * saison au bit près, et les formes en chemin répondent 404. Le numéro vit dans
 * le stockage local du navigateur, sous une clé formée du chemin de la page :
 *
 *     savedEpName/catalogue/tomb-raider-king/saison1/vostfr/  ->  "Episode 8"
 *     savedEpNb/catalogue/tomb-raider-king/saison1/vostfr/    ->  7
 *
 * Leur script relit ces deux clés au chargement, et **le nom fait foi** : si
 * l'option à l'index enregistré ne porte pas ce nom, il cherche l'option qui le
 * porte. C'est pourquoi on écrit les deux, le nom en premier rôle.
 *
 * Un préchargement s'exécute avant les scripts de la page : au moment où leur
 * `setCorrectEpisode()` lit le stockage, la valeur y est déjà.
 *
 * Rien n'est extrait ni contourné ici : c'est leur page, leur lecteur, leur
 * sélecteur. On se contente de le positionner.
 */

/**
 * Le projet compile main et preload sans la bibliothèque DOM — c'est du code
 * qui n'a pas de page. Ce fichier-ci en a une, mais il n'en touche que deux
 * choses : le chemin et le stockage. Les déclarer ici plutôt que d'ouvrir le
 * DOM à tout le processus principal dit exactement ce qu'on manipule.
 */
declare const window: {
  location: { pathname: string }
  localStorage: { setItem(key: string, value: string): void }
}

const FLAG = '--animelist-episode='

const raw = process.argv.find((arg) => arg.startsWith(FLAG))
const episode = raw ? Number(raw.slice(FLAG.length)) : NaN

if (Number.isInteger(episode) && episode > 0) {
  try {
    // Exactement le texte que leur script fabrique : `"Episode " + i`, sans
    // accent ni zéro de tête. Une variante ne serait jamais retrouvée.
    const name = `Episode ${episode}`
    const key = window.location.pathname
    window.localStorage.setItem(`savedEpName${key}`, JSON.stringify(name))
    // L'index n'est qu'un point de départ : leur code le corrige à partir du
    // nom. Il compte quand même pour les séries à épisodes spéciaux, où la
    // numérotation du menu se décale.
    window.localStorage.setItem(`savedEpNb${key}`, String(episode - 1))
  } catch {
    // Stockage refusé : la page s'ouvrira au dernier épisode vu, comme avant.
  }
}
