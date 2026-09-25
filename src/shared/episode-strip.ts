/**
 * La frise d'une série, dite en une chaîne : un caractère par épisode.
 *
 * `s` vu, `a` sorti sans toi, `u` pas encore diffusé. La page du téléphone la
 * dessine un trait par caractère ; l'envoyer en texte coûte un octet par
 * épisode, quand une liste de numéros vus en coûterait quatre.
 *
 * Pure et testée : c'est le même vocabulaire que la frise du nouveau design,
 * et deux écrans qui ne comptent pas pareil diraient deux vérités.
 */

/** Au-delà, la frise d'une série au long cours se lirait comme un code-barres. */
export const STRIP_MAX = 400

export function episodeStrip(seen: ReadonlySet<number> | undefined, total: number | null, aired: number): string {
  let highest = 0
  for (const n of seen ?? []) if (n > highest) highest = n
  // Sans total annoncé, la frise va jusqu'au dernier épisode connu, plus le
  // prochain s'il est programmé : c'est ce qu'on sait, rien de plus.
  const length = Math.min(STRIP_MAX, total && total > 0 ? total : Math.max(aired + 1, highest))
  let out = ''
  for (let n = 1; n <= length; n += 1) {
    out += seen?.has(n) ? 's' : n <= aired ? 'a' : 'u'
  }
  return out
}
