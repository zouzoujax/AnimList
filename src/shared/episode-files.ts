/**
 * Reconnaît le numéro d'épisode dans un nom de fichier.
 *
 * Les fichiers d'anime portent des noms écrits par des humains pressés :
 *
 *     [Groupe] Titre - 05 [1080p][x265][A1B2C3D4].mkv
 *     Titre.S01E05.VOSTFR.1080p.WEB-DL.x264.mp4
 *     Titre Ep. 5 (2026).mkv
 *
 * Tout le piège est là : `1080`, `265`, `264`, `2026` et le CRC à huit chiffres
 * sont des nombres qui ne sont pas des épisodes. On retire donc d'abord ce
 * qu'on sait ne pas être un numéro, puis on cherche — du motif le plus explicite
 * au plus vague, et jamais l'inverse.
 */

export const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.webm', '.m4v', '.avi', '.mov', '.ogv']
export const SUBTITLE_EXTENSIONS = ['.vtt', '.srt', '.ass', '.ssa']

/** Ce que Chromium sait décoder. Le reste part vers le lecteur du système. */
export const PLAYABLE_EXTENSIONS = ['.mkv', '.mp4', '.webm', '.m4v']

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

export function isVideo(name: string): boolean {
  return VIDEO_EXTENSIONS.includes(extensionOf(name))
}

/**
 * Tout ce qui ressemble à un nombre sans en être un : définition, codec,
 * profondeur, canaux audio, année, CRC, version d'encodage.
 */
const NOISE = [
  /\b\d{3,4}[pi]\b/gi, // 1080p, 720p, 480i
  /\bx\s?26[45]\b/gi, // x264, x265
  /\bh\.?26[45]\b/gi, // h264, h.265
  /\bhevc\b|\bavc\b/gi,
  /\b10\s?bits?\b/gi,
  /\b(?:aac|ac3|eac3|flac|opus|dts)(?:\s?[257]\.[01])?\b/gi,
  /\b[257]\.[01]\b/g, // 5.1, 2.0
  /\[[0-9a-f]{8}\]/gi, // CRC
  /\b(?:19|20)\d{2}\b/g, // année
  /\bv\d\b/gi, // v2, une réédition
  /\b\d+\s?(?:bit|fps|kbps|mb|gb)\b/gi
]

function scrub(name: string): string {
  let out = name.slice(0, name.lastIndexOf('.') === -1 ? undefined : name.lastIndexOf('.'))
  // « 08v2 » : la révision est collée au numéro, donc aucune limite de mot ne
  // la sépare. Elle doit tomber avant le reste, sinon elle emporte l'épisode.
  out = out.replace(/(\d)v\d\b/gi, '$1 ')
  for (const pattern of NOISE) out = out.replace(pattern, ' ')
  return out
}

/**
 * Du plus sûr au plus hasardeux. Le dernier motif — un nombre isolé — n'est
 * consulté qu'en dernier recours, et c'est le seul qui puisse se tromper.
 */
const PATTERNS = [
  /\bS\d{1,2}\s?E(\d{1,4})\b/i, // S01E05
  /\bE(?:p(?:isode)?)?\.?\s?(\d{1,4})\b/i, // E05, Ep05, Episode 5
  /\b[ée]pisodes?\s?\.?\s?(\d{1,4})\b/i, // Épisode 5
  /\s-\s(\d{1,4})(?:\s|$)/, // Titre - 05
  /\[(\d{1,4})\]/, // [05]
  /\((\d{1,4})\)/, // (05)
  /\s(\d{1,4})\s*$/ // … 05
]

export function episodeFromName(name: string): number | null {
  const text = scrub(name)
  for (const pattern of PATTERNS) {
    const match = pattern.exec(text)
    if (!match) continue
    const n = Number(match[1])
    // Un épisode 0 existe (les préquels le font), au-delà de 9999 c'est du bruit.
    if (Number.isInteger(n) && n >= 0 && n < 10_000) return n
  }
  return null
}

/**
 * Le sous-titrage embarqué dans un MKV ne s'affiche pas dans un `<video>` :
 * Chromium ne lit pas les pistes internes. Un fichier posé à côté, oui.
 */
export function subtitleTwin(videoName: string, names: string[]): string | null {
  const base = videoName.slice(0, videoName.lastIndexOf('.')).toLowerCase()
  const twins = names.filter((n) => {
    const ext = extensionOf(n)
    if (!SUBTITLE_EXTENSIONS.includes(ext)) return false
    const stem = n.slice(0, n.lastIndexOf('.')).toLowerCase()
    // « Titre - 05.fr.srt » accompagne « Titre - 05.mkv » : le suffixe de langue
    // est courant et ne doit pas casser l'appariement.
    return stem === base || stem.startsWith(base + '.')
  })
  // .vtt d'abord : c'est le seul que la balise <track> lit sans conversion.
  return (
    twins.sort(
      (a, b) => SUBTITLE_EXTENSIONS.indexOf(extensionOf(a)) - SUBTITLE_EXTENSIONS.indexOf(extensionOf(b))
    )[0] ?? null
  )
}

/**
 * SubRip vers WebVTT. Deux différences seulement : un en-tête, et la virgule
 * des millisecondes qui devient un point.
 */
export function srtToVtt(srt: string): string {
  const body = srt
    // Le BOM en tête d'un .srt ferait rater la première réplique.
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
  return `WEBVTT\n\n${body.trim()}\n`
}
