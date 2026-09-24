/**
 * Les règles de la sauvegarde automatique : comment un fichier s'appelle, et
 * lesquels on garde.
 *
 * Pures et testées, comme les migrations et pour la même raison : c'est le
 * code qui décide d'effacer une copie de la bibliothèque. Une erreur ici ne se
 * voit pas à l'usage — elle se découvre le jour où on a besoin du fichier qui
 * n'est plus là.
 *
 * Le nom porte l'heure locale et non un ISO en UTC : c'est un fichier qu'on
 * lit dans un explorateur, et « hier soir » doit y ressembler à hier soir.
 */

/** Le début du nom, qui sert aussi à reconnaître nos fichiers dans le dossier. */
export const BACKUP_PREFIX = 'animelist-'

/** Les sauvegardes récentes gardées quoi qu'il arrive. */
export const KEEP_RECENT = 7

const NAME = /^animelist-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.json$/

const two = (n: number): string => String(n).padStart(2, '0')

/** `animelist-2026-09-24-1432.json` */
export function backupName(at: number): string {
  const d = new Date(at)
  return `${BACKUP_PREFIX}${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}.json`
}

export interface BackupStamp {
  name: string
  /** Millisecondes, relues depuis le nom : le dossier peut avoir été recopié, et les dates de fichier avec lui. */
  at: number
  /** `2026-09` : ce qui définit « une par mois ». */
  month: string
  /** `2026-09-24` : ce qui définit « une par jour ». */
  day: string
}

/** Lit un nom, ou rend `null` si ce fichier n'est pas des nôtres. */
export function stampOf(name: string): BackupStamp | null {
  const m = NAME.exec(name)
  if (!m) return null
  const [, y, mo, d, hh, mm] = m.map(Number)
  const at = new Date(y, mo - 1, d, hh, mm).getTime()
  if (Number.isNaN(at)) return null
  return { name, at, month: `${m[1]}-${m[2]}`, day: `${m[1]}-${m[2]}-${m[3]}` }
}

/** Nos fichiers, du plus récent au plus ancien ; le reste du dossier est ignoré. */
export function listBackups(names: string[]): BackupStamp[] {
  return names
    .map(stampOf)
    .filter((s): s is BackupStamp => s !== null)
    .sort((a, b) => b.at - a.at)
}

/**
 * Ce qu'on efface.
 *
 * Les `keep` dernières restent, quelles que soient leurs dates : c'est la
 * semaine écoulée, celle où une bêtise se rattrape encore. Au-delà, une seule
 * par mois — la plus récente du mois, la plus proche de ce qu'on avait.
 *
 * Rien n'est effacé pour cause de vieillesse : une sauvegarde d'il y a deux
 * ans ne coûte qu'un fichier, et c'est la seule qui reste le jour où on
 * découvre un dégât ancien.
 */
export function toDelete(names: string[], keep = KEEP_RECENT): string[] {
  const monthsKept = new Set<string>()
  const drop: string[] = []
  // Les `keep` premières ne sont jamais candidates, même si leur mois est déjà pris.
  listBackups(names).forEach((stamp, i) => {
    if (i < keep) return
    if (monthsKept.has(stamp.month)) drop.push(stamp.name)
    else monthsKept.add(stamp.month)
  })
  return drop
}

/**
 * Faut-il sauvegarder maintenant ?
 *
 * Une fois par jour suffit. Sans cette règle, ouvrir et fermer l'app huit fois
 * dans la journée pousserait les sept copies gardées hors du lot et effacerait
 * la semaine entière en une après-midi.
 */
export function isDue(names: string[], now: number): boolean {
  const today = stampOf(backupName(now))?.day
  return !listBackups(names).some((s) => s.day === today)
}
