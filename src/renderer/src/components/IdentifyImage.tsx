/**
 * « C'est quoi, cet anime ? »
 *
 * On colle une capture, on la dépose, ou on la choisit : l'app rend la série,
 * l'épisode et la seconde exacte.
 *
 * Le point délicat n'est pas de chercher, c'est de dire ce qu'on a trouvé.
 * Le service rend toujours dix réponses, même pour une photo de vacances —
 * une liste sans avertissement affirmerait n'importe quoi. Trois états, donc,
 * et le troisième est écrit aussi soigneusement que les deux autres : ne rien
 * avoir trouvé est une réponse.
 */

import { useEffect, useRef, useState } from 'react'
import { ImageUp, ScanSearch, TriangleAlert } from 'lucide-react'
import type { Identification } from '@shared/types'
import { isReliable, verdictOf } from '@shared/identify'
import { clock } from '@shared/playback'
import { ErrorBox, Poster, Spinner } from '@/components/ui'
import { titleOf } from '@/lib/format'
import { useApp } from '@/store/app'

/** Ce que le presse-papier et le sélecteur ont le droit de contenir. */
const ACCEPTED = 'image/png,image/jpeg,image/webp,image/gif'

export default function IdentifyImage({ initial }: { initial?: File | null }): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)

  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [found, setFound] = useState<Identification | null>(null)
  const [dragging, setDragging] = useState(false)
  const picker = useRef<HTMLInputElement>(null)

  const search = async (file: File): Promise<void> => {
    setError(null)
    setFound(null)
    setBusy(true)
    // L'aperçu local part avant la requête : voir ce qu'on vient d'envoyer
    // rend l'attente lisible, et dit tout de suite si on s'est trompé d'image.
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(file)
    })
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      setFound(await window.api.anime.identify(bytes, file.type))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /**
   * Une image passée à l'ouverture — collée depuis la page — part sans clic.
   *
   * La recherche est repoussée d'un tour de boucle plutôt que lancée dans
   * l'effet : elle commence par poser trois états, et les poser pendant le
   * rendu déclencherait une cascade. Le report l'annule aussi proprement si la
   * fenêtre se referme dans la seconde.
   */
  useEffect(() => {
    if (!initial) return
    const id = setTimeout(() => void search(initial), 0)
    return () => clearTimeout(id)
  }, [initial])

  // Coller marche partout dans la fenêtre tant qu'elle est ouverte : c'est le
  // geste qu'on fait sans y penser après une capture d'écran.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (file) void search(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  useEffect(() => () => setPreview((old) => (old && URL.revokeObjectURL(old), null)), [])

  const verdict = found ? verdictOf(found.matches.map((m) => ({ ...m, anilist: m.media.id, image: m.preview }))) : null

  return (
    <div className="p-5">
      <div className="mb-4 flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px]"
          style={{ background: 'color-mix(in oklab, var(--accent) 20%, transparent)' }}
        >
          <ScanSearch size={19} />
        </span>
        <div className="min-w-0">
          <h2 className="title-xl text-[1.2rem] leading-tight">Identifier une image</h2>
          <p className="mt-0.5 text-[0.78rem] text-muted">
            Colle une capture, dépose-la ou choisis un fichier : l’app dit la série, l’épisode et la seconde.
          </p>
        </div>
      </div>

      <input
        ref={picker}
        type="file"
        accept={ACCEPTED}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void search(file)
          e.target.value = ''
        }}
      />

      <button
        onClick={() => picker.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))
          if (file) void search(file)
        }}
        className="grid w-full place-items-center rounded-[16px] border border-dashed p-6 text-center transition"
        style={{
          borderColor: dragging ? 'var(--accent)' : 'var(--line-2)',
          background: dragging ? 'color-mix(in oklab, var(--accent) 10%, transparent)' : 'transparent'
        }}
      >
        {preview ? (
          <img src={preview} alt="" className="max-h-[180px] rounded-[10px] object-contain" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-[0.82rem] text-faint">
            <ImageUp size={22} />
            Colle (Ctrl+V), dépose une image, ou clique pour en choisir une
          </span>
        )}
      </button>

      {busy && <Spinner label="Recherche de la scène…" />}
      {error && (
        <div className="mt-4">
          <ErrorBox message={error} />
        </div>
      )}

      {found && !busy && (
        <div className="mt-4">
          {verdict === 'none' ? (
            /* Ne rien avoir trouvé est une réponse. Le dire clairement vaut
               mieux que d'afficher dix candidats à cinquante pour cent. */
            <p className="py-6 text-center text-[0.84rem] leading-relaxed text-muted">
              Aucune scène ne correspond. L’index ne couvre que les anime : une image de manga, un fan art ou une photo
              n’y sont pas.
            </p>
          ) : (
            <>
              {verdict === 'unsure' && (
                <p
                  className="mb-3 flex items-start gap-2 rounded-[12px] px-3 py-2 text-[0.78rem] leading-relaxed"
                  style={{ background: 'rgba(255,176,56,.12)', color: '#ffb038' }}
                >
                  <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                  Rien de sûr ici. Ces titres se ressemblent un peu, sans plus — une image plus nette, ou une scène plus
                  caractéristique, donnerait mieux.
                </p>
              )}

              <div className="flex flex-col gap-2">
                {found.matches.map((m) => (
                  <button
                    key={`${m.media.id}:${m.from}`}
                    onClick={() => navigate({ name: 'anime', id: m.media.id })}
                    className="glass flex items-center gap-3 rounded-[12px] p-2 text-left transition hover:brightness-125"
                  >
                    <Poster src={m.media.cover.large} alt="" className="h-[62px] w-[44px] shrink-0" />
                    {/* La vignette de la scène trouvée : c'est elle qui permet
                        de vérifier d'un coup d'œil, bien mieux qu'un pourcentage. */}
                    {m.preview && (
                      <img
                        src={m.preview}
                        alt=""
                        className="hidden h-[62px] w-[110px] rounded-[8px] object-cover sm:block"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="clamp-2 block text-[0.85rem] font-semibold leading-snug">
                        {titleOf(m.media, lang)}
                      </span>
                      <span className="mt-0.5 block text-[0.72rem] text-faint">
                        {m.episode !== null ? `Épisode ${m.episode} · ` : ''}
                        {clock(m.from)}
                      </span>
                    </span>
                    <span
                      className="shrink-0 text-[0.72rem] font-semibold tabular-nums"
                      style={{ color: isReliable(m.similarity) ? 'var(--accent-2)' : '#ffb038' }}
                    >
                      {Math.round(m.similarity * 100)} %
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {found.quota && (
            <p className="mt-3 text-center text-[0.7rem] text-faint">
              {Math.max(0, found.quota.total - found.quota.used)} recherches restantes ce mois-ci
            </p>
          )}
        </div>
      )}
    </div>
  )
}
