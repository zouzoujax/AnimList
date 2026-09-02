/**
 * Où en est la lecture d'un fichier local.
 *
 * Les règles vivent ici, isolées et testables, parce que ce sont elles qui
 * décident de ce qui est écrit sur le disque. Mal jugées, elles rouvrent un
 * épisode trois secondes avant la fin, ou le font repartir du début alors
 * qu'on en était au milieu — deux façons de rendre la reprise pire que rien.
 */

/** En deçà, il n'y a rien à reprendre : rouvrir au début ne coûte rien. */
export const MIN_RESUME_SECONDS = 30

/**
 * Au-delà, l'épisode est vu. Le retenir ferait rouvrir sur le générique de fin,
 * et le lecteur coche justement à 0,9 — au-dessus, il n'y a plus rien à voir.
 */
export const END_RATIO = 0.95

/** Ce qu'on garde par fichier. Rien de plus : le chemin est déjà la clé. */
export interface Position {
  /** Secondes depuis le début. */
  at: number
  /** Durée totale, pour savoir si la fin est proche sans rouvrir le fichier. */
  duration: number
  updatedAt: number
}

/**
 * Une position ne vaut d'être gardée qu'entre les deux bornes : assez loin du
 * début pour dire quelque chose, assez loin de la fin pour ne pas être finie.
 */
export function worthRemembering(at: number, duration: number): boolean {
  if (!Number.isFinite(at) || !Number.isFinite(duration)) return false
  if (duration <= 0 || at < MIN_RESUME_SECONDS) return false
  return at / duration < END_RATIO
}

/** La seconde où reprendre, ou `null` s'il n'y a pas lieu de reprendre. */
export function resumePoint(pos: Position | null | undefined): number | null {
  if (!pos) return null
  return worthRemembering(pos.at, pos.duration) ? pos.at : null
}

/** Avancement dans le fichier, de 0 à 1. */
export function progressOf(pos: Position): number {
  if (!Number.isFinite(pos.duration) || pos.duration <= 0) return 0
  return Math.min(1, Math.max(0, pos.at / pos.duration))
}

/** `12:34`, et `1:02:03` dès qu'il y a des heures. */
export function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

/** Au-delà, la liste des positions pèserait plus que ce qu'elle rend service. */
export const MAX_POSITIONS = 400

/** Un fichier laissé en plan depuis six mois ne sera pas repris. */
export const MAX_AGE_DAYS = 180

/**
 * Rend la liste des positions bornée dans le temps et en nombre.
 *
 * Sans elle, chaque fichier ouvert une fois resterait dans le fichier de
 * données pour toujours — un dossier de séries entier finirait par y tenir.
 * Les plus récentes gagnent : c'est ce qu'on est en train de regarder.
 */
export function prunePositions(
  positions: Record<string, Position>,
  now = Date.now(),
  max = MAX_POSITIONS,
  maxAgeDays = MAX_AGE_DAYS
): Record<string, Position> {
  const cutoff = now - maxAgeDays * 86_400_000
  const kept = Object.entries(positions)
    .filter(([, pos]) => pos.updatedAt >= cutoff && worthRemembering(pos.at, pos.duration))
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .slice(0, max)
  return Object.fromEntries(kept)
}
