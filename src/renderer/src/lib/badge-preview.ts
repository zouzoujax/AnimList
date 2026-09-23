/**
 * L'aperçu du carton de badge, déclenché depuis les Réglages.
 *
 * Il faut gagner un badge pour voir ce que ça donne — et quand ils sont tous
 * gagnés, plus rien ne se déclenchera jamais. Un bouton d'essai montre
 * l'animation et joue le son, sans rien inscrire au registre.
 *
 * Un abonnement minuscule plutôt qu'un détour par le magasin : rien ici n'a à
 * être gardé, ni relu au prochain lancement. Et il vit dans son propre fichier,
 * sans dépendance : les Réglages peuvent l'appeler sans tirer le mur des badges
 * dans leur morceau de paquet.
 */

let showing = false
const listeners = new Set<() => void>()

function tell(): void {
  for (const listener of listeners) listener()
}

/** Montre le carton d'essai. */
export function previewBadge(): void {
  showing = true
  tell()
}

/** Le retire — c'est le carton lui-même qui le fait, à la fin de son temps. */
export function endBadgePreview(): void {
  showing = false
  tell()
}

export function isPreviewingBadge(): boolean {
  return showing
}

export function subscribeBadgePreview(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
