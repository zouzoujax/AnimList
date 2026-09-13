/**
 * « Et maintenant ? » — la modale qui suit une série terminée.
 *
 * Le magasin repère le moment où une série passe « terminée », quel que soit
 * l'écran qui a coché : la fiche, la grille, une carte, la coche automatique
 * d'Anime-Sama ou la télécommande. Ce composant va alors chercher l'arbre de sa
 * franchise et demande à `@shared/next-up` par où continuer.
 *
 * **Silencieuse quand il n'y a rien à dire.** Pas d'arbre lisible — catalogue
 * coupé, série sans suite —, ou rien qui ne soit déjà vu : la modale ne
 * s'ouvre pas. Une fenêtre qui s'ouvre pour annoncer qu'elle n'a rien à
 * proposer interrompt pour rien.
 */

import { ArrowRight, PartyPopper } from 'lucide-react'
import { useEffect, useState } from 'react'
import { nextUp, type Suggestion } from '@shared/next-up'
import { Modal, Poster } from '@/components/ui'
import { rgba, toneAccent } from '@/lib/color'
import { titleOf } from '@/lib/format'
import { useApp } from '@/store/app'

export function NextUp(): React.JSX.Element | null {
  const finished = useApp((s) => s.finished)
  const dismiss = useApp((s) => s.dismissFinished)
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const media = useApp((s) => (finished === null ? undefined : s.media.get(finished)))

  /** La réponse voyage avec la série qu'elle concerne, comme ailleurs dans l'app. */
  const [held, setHeld] = useState<{ id: number; list: Suggestion[] } | null>(null)

  useEffect(() => {
    if (finished === null) return
    let alive = true
    window.api.anime
      .franchise(finished)
      .then((tree) => {
        if (!alive) return
        const list = nextUp(tree, finished)
        if (list.length === 0) dismiss()
        else setHeld({ id: finished, list })
      })
      .catch(() => alive && dismiss())
    return () => {
      alive = false
    }
  }, [finished, dismiss])

  const list = held && held.id === finished ? held.list : null
  const open = list !== null
  const glow = toneAccent(media?.cover.color ?? null)

  const go = (id: number): void => {
    dismiss()
    navigate({ name: 'anime', id })
  }

  return (
    <Modal open={open} onClose={dismiss} width={520}>
      {list && (
        <div className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
              style={{ background: rgba(glow, 0.18), color: glow }}
            >
              <PartyPopper size={19} />
            </span>
            <div className="min-w-0">
              <p className="text-[1rem] font-semibold">Série terminée</p>
              {media && <p className="truncate text-[0.8rem] text-faint">{titleOf(media, lang)}</p>}
            </div>
          </div>

          <p className="mb-3 text-[0.84rem] text-muted">Pour continuer, dans l’ordre de la franchise :</p>

          {/* Jusqu'à huit conseils : la liste défile plutôt que de pousser
              « Plus tard » hors de l'écran. */}
          <ul className="-mr-2 flex max-h-[52vh] flex-col gap-2 overflow-y-auto pr-2">
            {list.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => go(s.id)}
                  className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition-colors hover:bg-white/6"
                  style={{ border: '1px solid var(--line)' }}
                >
                  {s.cover ? (
                    <Poster src={s.cover} alt="" className="h-[58px] w-[40px] shrink-0" rounded="rounded-lg" />
                  ) : (
                    <span className="h-[58px] w-[40px] shrink-0 rounded-lg" style={{ background: 'var(--line)' }} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.7rem] font-semibold tracking-wide uppercase" style={{ color: glow }}>
                      {s.label}
                    </span>
                    <span className="block truncate text-[0.88rem] font-medium">{s.title}</span>
                  </span>
                  <ArrowRight size={16} className="shrink-0 text-faint" />
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex justify-end">
            <button className="btn !h-9" onClick={dismiss}>
              Plus tard
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
