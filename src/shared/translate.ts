/**
 * Traduire ce qu'AniList ne sait dire qu'en anglais.
 *
 * Toute l'interface est en français ; le contenu ne l'est pas — résumés,
 * titres d'épisodes. C'est la dernière incohérence de langue qui reste, et
 * elle saute aux yeux sur la seule partie de l'écran qu'on lit vraiment.
 *
 * Les règles sont ici, sans réseau : quoi traduire, comment regrouper les
 * envois, et comment retrouver une traduction déjà faite. Une traduction coûte
 * des caractères comptés par le service — en redemander une déjà obtenue est
 * la seule façon d'épuiser un quota pour rien.
 */

/**
 * L'hôte dépend de la clé.
 *
 * DeepL termine les clés gratuites par `:fx` et refuse ces clés sur l'hôte
 * payant, avec une erreur d'authentification qui n'explique rien. Le suffixe
 * est le seul indice, et il est documenté comme tel.
 */
export function deeplHost(key: string): string {
  return key.trim().endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com'
}

/** En deçà, il n'y a rien à traduire : un titre vide, un tiret, un numéro. */
const MIN_LENGTH = 3

/**
 * Ce qui mérite un aller-retour.
 *
 * Un texte déjà français passerait quand même — le service le détecterait et
 * le rendrait tel quel — mais au prix de ses caractères. Faute de pouvoir en
 * juger sûrement, on ne filtre que ce qui est vide ou trop court.
 */
export function worthTranslating(text: string | null | undefined): boolean {
  return typeof text === 'string' && text.trim().length >= MIN_LENGTH
}

/** Plafond d'un envoi. DeepL accepte davantage, mais les réponses s'allongent. */
export const MAX_BATCH_CHARS = 20_000

/** Nombre maximum de textes par envoi, imposé par l'API. */
export const MAX_BATCH_TEXTS = 50

/**
 * Regroupe les textes en envois.
 *
 * Un envoi par texte multiplierait les allers-retours ; un seul envoi géant
 * serait refusé. Un texte à lui seul plus gros que le plafond part quand même
 * dans son propre envoi : le tronquer rendrait une phrase coupée.
 */
export function batches(texts: string[], maxChars = MAX_BATCH_CHARS, maxTexts = MAX_BATCH_TEXTS): string[][] {
  const out: string[][] = []
  let current: string[] = []
  let size = 0

  for (const text of texts) {
    const tooMany = current.length >= maxTexts
    const tooBig = current.length > 0 && size + text.length > maxChars
    if (tooMany || tooBig) {
      out.push(current)
      current = []
      size = 0
    }
    current.push(text)
    size += text.length
  }

  if (current.length) out.push(current)
  return out
}

/**
 * La clé sous laquelle ranger une traduction.
 *
 * Le texte source lui-même, réduit à une empreinte courte : deux fiches
 * partageant un résumé — une saison et son édition remasterisée — ne le font
 * traduire qu'une fois, et un résumé corrigé chez AniList change d'empreinte
 * et se retraduit tout seul.
 */
export function fingerprint(text: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x85ebca6b)
  }
  const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, '0')
  return `${hex(h1)}${hex(h2)}:${text.length}`
}
