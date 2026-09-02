/**
 * La traduction française des textes d'AniList.
 *
 * AniList ne publie ses résumés et ses titres d'épisodes qu'en anglais. Toute
 * l'interface étant en français, c'était la dernière incohérence de langue qui
 * restait — et sur la partie de l'écran qu'on lit vraiment.
 *
 * Le service est DeepL, avec une clé que l'utilisateur colle lui-même dans les
 * réglages. Aucune clé n'est embarquée : en glisser une dans un dépôt public
 * reviendrait à l'offrir, et une traduction facturée à quelqu'un d'autre n'est
 * pas gratuite pour autant. Sans clé, la fonction reste simplement éteinte et
 * les textes restent anglais — l'app marche exactement comme avant.
 *
 * Tout est gardé sur le disque, par empreinte du texte source : redemander une
 * traduction déjà obtenue est la seule façon d'épuiser un quota pour rien. Une
 * empreinte suit le texte, pas la fiche, si bien qu'un résumé corrigé chez
 * AniList se retraduit tout seul et que deux fiches qui partagent un résumé ne
 * le paient qu'une fois.
 */

import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { batches, deeplHost, fingerprint, worthTranslating } from '@shared/translate'
import { getPrefs } from './store'

/** Au-delà, le fichier de traductions pèse plus qu'il ne rend service. */
const MAX_ENTRIES = 4000

let cache = new Map<string, string>()
let file = ''
let dirty = false
let saveTimer: NodeJS.Timeout | null = null

export function initTranslate(): void {
  file = join(app.getPath('userData'), 'translations.json')
  if (!existsSync(file)) return
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>
    cache = new Map(Object.entries(raw))
  } catch (err) {
    // Un fichier de cache illisible ne vaut pas qu'on refuse de démarrer : on
    // repart de zéro, et la première fiche ouverte le reconstruit.
    console.error('[translate] cache illisible, ignoré', err)
  }
}

function persist(): void {
  if (!dirty || !file) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    dirty = false

    // Les plus anciennes partent en premier : `Map` garde l'ordre d'insertion,
    // et ce qu'on a traduit récemment est ce qu'on relira.
    if (cache.size > MAX_ENTRIES) {
      cache = new Map([...cache.entries()].slice(cache.size - MAX_ENTRIES))
    }

    void fs
      .writeFile(file, JSON.stringify(Object.fromEntries(cache)), 'utf8')
      .catch((err) => console.error('[translate] écriture impossible', err))
  }, 1500)
}

/** Vrai quand une clé est posée : l'écran s'en sert pour proposer ou se taire. */
export function canTranslate(): boolean {
  return !!getPrefs().deeplKey?.trim()
}

interface DeeplResponse {
  translations?: { text: string }[]
  message?: string
}

async function callDeepl(key: string, texts: string[]): Promise<string[]> {
  const res = await fetch(`${deeplHost(key)}/v2/translate`, {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: texts,
      target_lang: 'FR',
      // Les résumés portent des noms propres japonais entre balises ou non ;
      // sans indication de source, DeepL bascule parfois sur du japonais et
      // rend un charabia.
      source_lang: 'EN'
    })
  })

  if (res.status === 403) throw new Error('Clé DeepL refusée. Vérifie-la dans les réglages.')
  if (res.status === 456) throw new Error('Quota DeepL épuisé pour ce mois-ci.')
  if (res.status === 429) throw new Error('Trop de traductions d’un coup — réessaie dans un instant.')
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as DeeplResponse
    throw new Error(body.message ? `DeepL : ${body.message}` : `DeepL a répondu ${res.status}.`)
  }

  const body = (await res.json()) as DeeplResponse
  return (body.translations ?? []).map((t) => t.text)
}

/**
 * Traduit une liste de textes, dans l'ordre reçu.
 *
 * Rend toujours un tableau de la même longueur : un texte qu'on ne traduit pas
 * — trop court, déjà en cache, ou service muet — ressort tel quel. L'appelant
 * n'a donc jamais à rapprocher les deux listes lui-même, et une panne rend
 * l'anglais plutôt qu'un trou.
 */
export async function translate(texts: string[]): Promise<string[]> {
  const key = getPrefs().deeplKey?.trim()
  if (!key) return texts

  const out = [...texts]

  // Ce qui manque vraiment, sans doublon : deux épisodes au même titre ne se
  // paient pas deux fois.
  const missing: string[] = []
  for (const text of texts) {
    if (!worthTranslating(text)) continue
    const id = fingerprint(text)
    if (cache.has(id) || missing.includes(text)) continue
    missing.push(text)
  }

  for (const batch of batches(missing)) {
    const done = await callDeepl(key, batch)
    batch.forEach((source, i) => {
      const translated = done[i]
      if (!translated) return
      cache.set(fingerprint(source), translated)
      dirty = true
    })
  }
  persist()

  for (let i = 0; i < out.length; i += 1) {
    const held = worthTranslating(out[i]) ? cache.get(fingerprint(out[i])) : undefined
    if (held) out[i] = held
  }
  return out
}

/** Vide le cache, quand on change de clé ou qu'on veut retraduire. */
export async function purgeTranslations(): Promise<number> {
  const had = cache.size
  cache = new Map()
  dirty = false
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (file) await fs.rm(file, { force: true }).catch(() => undefined)
  return had
}
