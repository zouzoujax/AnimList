/**
 * « Et maintenant ? » — la modale qui suit une série terminée.
 *
 * Le magasin repère le moment où une série passe « terminée », quel que soit
 * l'écran qui a coché : la fiche, la grille, une carte, la coche automatique
 * d'Anime-Sama ou la télécommande. Ce composant va alors chercher l'arbre de sa
 * franchise et demande à `@shared/next-up` par où continuer.
 *
 * **Silencieuse quand il n'y a rien à dire.** Pas d'arbre lisible — catalogue
 * coupé, série sans suite —, ou rien qui ne soit déjà vu, et une note déjà
 * donnée : la modale ne s'ouvre pas. Une fenêtre qui s'ouvre pour annoncer
 * qu'elle n'a rien à proposer interrompt pour rien.
 *
 * **La note, au moment où l'avis est frais.** Une série terminée sans note
 * se voit proposer les étoiles, sans insister : « Plus tard » suffit. La
 * bibliothèque n'avait presque aucune note, et « Pour toi » s'en nourrit.
 */

import { ArrowRight, PartyPopper } from 'lucide-react'
import { useEffect, useState } from 'react'
import { nextUp, type NextKind, type Suggestion } from '@shared/next-up'
import { Stars } from '@/components/Stars'
import { Modal, Poster } from '@/components/ui'
import { rgba, toneAccent } from '@/lib/color'
import { titleOf } from '@/lib/format'
import { useApp } from '@/store/app'

/**
 * Une couleur par nature de suite, prise dans la palette des accents.
 *
 * Tous les libellés prenaient la teinte de l'affiche : film, OVA et saison se
 * confondaient d'un coup d'œil. La saison garde la teinte de la série — c'est
 * la suite directe ; le reste se distingue sans avoir à lire.
 */
const KIND_COLORS: Record<Exclude<NextKind, 'season'>, string> = {
  film: '#ffb038',
  ova: '#22d3ee',
  spinoff: '#ff4d8d',
  alternative: '#34e5a5'
}

export function NextUp(): React.JSX.Element | null {
  const finished = useApp((s) => s.finished)
  const dismiss = useApp((s) => s.dismissFinished)
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const media = useApp((s) => (finished === null ? undefined : s.media.get(finished)))
  const saveEntry = useApp((s) => s.saveEntry)
  /**
   * Sans note à l'ouverture : figé à ce moment-là, sinon donner une note
   * ferait disparaître les étoiles sous le curseur.
   */
  const [unrated, setUnrated] = useState<{ id: number; score: number | null } | null>(null)

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
        const score = useApp.getState().entries.get(finished)?.score ?? null
        if (score === null) setUnrated({ id: finished, score: null })
        if (list.length === 0 && score !== null) dismiss()
        else setHeld({ id: finished, list })
      })
      .catch(() => {
        if (!alive) return
        // Pas de suites lisibles : la note seule vaut encore la question.
        if ((useApp.getState().entries.get(finished)?.score ?? null) !== null) return dismiss()
        setUnrated({ id: finished, score: null })
        setHeld({ id: finished, list: [] })
      })
    return () => {
      alive = false
    }
  }, [finished, dismiss])

  const list = held && held.id === finished ? held.list : null
  const open = list !== null
  const rating = unrated && unrated.id === finished ? unrated : null

  const rate = (score: number | null): void => {
    if (finished === null) return
    setUnrated({ id: finished, score })
    void saveEntry(finished, { score })
  }
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

          {rating && (
            <div
              className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-3.5 py-3"
              style={{ border: '1px solid var(--line)' }}
            >
              <p className="text-[0.84rem] text-muted">
                {rating.score === null ? 'Ta note, tant que c’est frais ?' : 'Note gardée. Merci !'}
              </p>
              <Stars value={rating.score} onChange={rate} />
            </div>
          )}

          {list.length > 0 && (
            <p className="mb-3 text-[0.84rem] text-muted">Pour continuer, dans l’ordre de la franchise :</p>
          )}

          {/* Jusqu'à huit conseils : la liste défile plutôt que de pousser
              « Plus tard » hors de l'écran. */}
          {list.length > 0 && (
            <ul className="-mr-2 flex max-h-[52vh] flex-col gap-2 overflow-y-auto pr-2">
              {list.map((s) => {
                const tint = s.kind === 'season' ? glow : KIND_COLORS[s.kind]
                return (
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
                        <span
                          className="mb-1 inline-block rounded-full px-2 py-[1px] text-[0.66rem] font-semibold tracking-wide uppercase"
                          style={{ color: tint, background: rgba(tint, 0.14) }}
                        >
                          {s.label}
                        </span>
                        <span className="block truncate text-[0.88rem] font-medium">{s.title}</span>
                      </span>
                      <ArrowRight size={16} className="shrink-0 text-faint" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="mt-5 flex justify-end">
            <button className="btn !h-9" onClick={dismiss}>
              {rating?.score != null && list.length === 0 ? 'Fermer' : 'Plus tard'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
