/**
 * « J'ai deux heures. » — la soirée composée d'un clic.
 *
 * L'accueil répondait déjà à trois questions voisines : ce qui est en cours, ce
 * qui est sorti sans être vu, ce qui arrive. Aucune ne dit dans quel ordre, ni
 * combien tiennent dans le temps qu'on a — si bien qu'on refaisait le calcul
 * de tête, chaque soir, devant la même liste.
 *
 * La règle vit dans `@shared/soiree`, à part et testée. Ce fichier ne fait que
 * la montrer : rassembler ce qui est regardable, afficher la proposition, et
 * ouvrir le premier épisode. Rien n'est écrit dans la bibliothèque tant que la
 * lecture n'a pas commencé.
 */

import { Check, Clapperboard, Clock, Dices, Play, RotateCcw, Square, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { isUnaired } from '@shared/airing'
import { buildSession, usualEvening, type Candidate, type Reason, type Slot } from '@shared/soiree'
import { Poster } from '@/components/ui'
// Celui de `lib/watch`, pas celui de `@shared/titles` : c'est la forme que la
// résolution Anime-Sama attend, et celle qu'emploie déjà `useAnimeSama`.
import { searchTitles } from '@/lib/watch'
import { minutesToHuman, titleOf } from '@/lib/format'
import { rgba, toneAccent } from '@/lib/color'
import { useApp } from '@/store/app'

/** Assez pour la plus longue soirée possible, sans parcourir cent épisodes. */
const MAX_PER_SERIES = 12

const CHOICES: { label: string; value: number | 'auto' }[] = [
  { label: '30 min', value: 30 },
  { label: '1 h', value: 60 },
  { label: '2 h', value: 120 },
  { label: 'Aucune idée', value: 'auto' }
]

const REASONS: Record<Reason, string> = {
  retard: 'en retard',
  reprise: 'tu y étais',
  decouverte: 'jamais commencée',
  suite: 'la suite'
}

export function Soiree(): React.JSX.Element | null {
  const entries = useApp((s) => s.entries)
  const mediaMap = useApp((s) => s.media)
  const watchedMap = useApp((s) => s.watched)
  const events = useApp((s) => s.events)
  const lang = useApp((s) => s.prefs.titleLang)
  const runtime = useApp((s) => s.prefs.defaultRuntime)
  const navigate = useApp((s) => s.navigate)
  const toast = useApp((s) => s.toast)

  const [choice, setChoice] = useState<number | 'auto' | null>(null)
  const [dropped, setDropped] = useState<number[]>([])

  /**
   * La soirée lancée, figée telle qu'elle est partie.
   *
   * La proposition, elle, se recompose à chaque coche : l'épisode qui vient
   * d'être vu sort des candidats et un autre vient combler le temps libéré.
   * C'est ce qu'on veut d'une proposition — pas de ce qui joue. Sans cette
   * copie, la liste affichée s'éloignait de celle que le processus principal
   * suit vraiment, et on voyait apparaître des épisodes que personne n'allait
   * regarder.
   */
  const [running, setRunning] = useState<Slot[] | null>(null)

  /**
   * La dernière séance sur chaque série.
   *
   * Les lignes importées sont mises à part : deux cents épisodes cochés le même
   * jour par une autre app diraient que toute la bibliothèque est également
   * fraîche. Elles servent quand même de repli — c'est mieux que rien pour une
   * série qu'on n'a jamais ouverte ici.
   */
  const lastSeen = useMemo(() => {
    const real = new Map<number, number>()
    const fallback = new Map<number, number>()
    for (const e of events) {
      const target = e.imported ? fallback : real
      if ((target.get(e.animeId) ?? 0) < e.at) target.set(e.animeId, e.at)
    }
    return { real, fallback }
  }, [events])

  const candidates = useMemo<Candidate[]>(() => {
    const out: Candidate[] = []
    for (const entry of entries.values()) {
      if (entry.status !== 'watching' && entry.status !== 'planned') continue
      const media = mediaMap.get(entry.animeId)
      if (!media) continue

      // Sans total connu, l'épisode annoncé donne quand même une borne.
      const cap = media.episodes ?? media.nextAiring?.episode ?? 0
      if (cap <= 0) continue

      const seen = watchedMap.get(media.id)
      const episodes: number[] = []
      for (let n = 1; n <= cap && episodes.length < MAX_PER_SERIES; n += 1) {
        if (seen?.has(n)) continue
        // Le premier épisode à venir arrête tout : ceux d'après le sont aussi.
        if (isUnaired(media, n)) break
        episodes.push(n)
      }
      if (episodes.length === 0) continue

      out.push({
        animeId: media.id,
        title: titleOf(media, lang),
        episodes,
        minutes: media.duration ?? runtime,
        airing: media.nextAiring !== null,
        lastWatchedAt: lastSeen.real.get(media.id) ?? lastSeen.fallback.get(media.id) ?? 0
      })
    }
    return out
  }, [entries, mediaMap, watchedMap, lang, runtime, lastSeen])

  const usual = useMemo(() => usualEvening(events), [events])
  const budget = choice === 'auto' ? usual : choice
  const session = useMemo(
    () =>
      budget === null
        ? null
        : buildSession(
            candidates.filter((c) => !dropped.includes(c.animeId)),
            budget
          ),
    [candidates, dropped, budget]
  )

  /**
   * Reste-t-il quelque chose une fois la tête écartée ?
   *
   * Répondre en composant vraiment la soirée suivante, plutôt qu'en comptant
   * les séries : un budget de trente minutes peut n'avoir aucune place pour ce
   * qui reste, et un bouton qui promet une autre idée doit en avoir une.
   */
  const alternative = useMemo(() => {
    if (session === null || session.slots.length === 0 || budget === null) return false
    const sans = [...dropped, ...new Set(session.slots.map((x) => x.animeId))]
    return (
      buildSession(
        candidates.filter((c) => !sans.includes(c.animeId)),
        budget
      ).slots.length > 0
    )
  }, [session, candidates, dropped, budget])

  /**
   * Ce que la carte montre : la soirée lancée si elle tourne, la proposition
   * sinon. Une seule liste à l'écran, jamais deux qui se contredisent.
   */
  const rows = running ?? session?.slots ?? []
  const seen = (slot: Slot): boolean => watchedMap.get(slot.animeId)?.has(slot.episode) ?? false
  const done = running ? running.filter(seen).length : 0

  // Rien à proposer : la carte ne s'affiche pas plutôt que de s'excuser.
  if (candidates.length === 0 && running === null) return null

  /**
   * Ouvre un épisode, et confie le reste de la liste au processus principal.
   *
   * Déposée avant l'ouverture, pas après : c'est lui qui enchaîne, et une liste
   * arrivée en retard laisserait le premier épisode se terminer sous l'ancien
   * régime — le numéro d'après, sans fin. Retirée si l'ouverture échoue, pour
   * ne pas laisser une soirée fantôme gouverner la prochaine lecture.
   */
  async function launch(index: number): Promise<void> {
    const slot = rows[index]
    const media = slot ? mediaMap.get(slot.animeId) : undefined
    if (!slot || !media) return

    const suite = rows.slice(index)
    await window.api.watch.setSoiree(suite)

    const target = await window.api.watch.animeSama(media.id, searchTitles(media))
    if (!target?.url || !target.episodes) {
      await window.api.watch.setSoiree([])
      toast('Anime-Sama ne donne pas de page d’épisodes pour cette série.', 'info')
      navigate({ name: 'anime', id: media.id })
      return
    }
    const ok = await window.api.watch.openEpisode(target.url, slot.episode, media.id)
    if (!ok) {
      await window.api.watch.setSoiree([])
      toast('Cet épisode n’a pas pu être ouvert.', 'error')
      return
    }
    setRunning(suite)
  }

  async function stopRunning(): Promise<void> {
    setRunning(null)
    await window.api.watch.setSoiree([])
  }

  return (
    <div className="glass span-all mb-9 rounded-[22px] p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
          style={{ background: rgba(toneAccent(null), 0.16) }}
        >
          <Clapperboard size={17} />
        </span>
        <div className="mr-auto">
          <p className="text-[0.95rem] font-semibold">Soirée anime</p>
          <p className="text-[0.78rem] text-faint">
            {running !== null
              ? `Soirée en cours · ${done} sur ${running.length} vus`
              : session === null
                ? 'Dis combien de temps tu as, l’app compose la suite'
                : `${session.slots.length} épisode${session.slots.length > 1 ? 's' : ''} · ${minutesToHuman(session.minutes)}`}
          </p>
        </div>

        {running !== null && (
          <button className="btn !h-8 text-[0.75rem]" onClick={() => void stopRunning()}>
            <Square size={12} />
            Arrêter la soirée
          </button>
        )}

        {running === null && session !== null && (
          <>
            {/* Pas un tirage au sort : la proposition est la meilleure que la
                règle sache faire, et la rejouer à l'identique rendrait la même
                liste. « Autre idée » écarte donc toutes les séries proposées,
                pas seulement celle en tête — sinon le format court qui bouche
                le trou de fin revient à chaque appui, et la moitié de la
                soirée ne change jamais. */}
            <button
              className="btn !h-8 text-[0.75rem]"
              disabled={!alternative}
              title={
                alternative ? 'Écarter la série en tête et recomposer' : 'Plus rien d’autre à proposer pour cette durée'
              }
              onClick={() => setDropped((d) => [...d, ...new Set(session.slots.map((x) => x.animeId))])}
            >
              <Dices size={13} />
              Autre idée
            </button>

            <button
              className="btn !h-8 text-[0.75rem]"
              onClick={() => {
                setChoice(null)
                setDropped([])
              }}
            >
              <RotateCcw size={13} />
              Changer la durée
            </button>
          </>
        )}
      </div>

      {rows.length === 0 ? (
        session === null ? (
          <div className="flex flex-wrap gap-2">
            {CHOICES.map((c) => (
              <button key={String(c.value)} className="btn !h-9" onClick={() => setChoice(c.value)}>
                {c.value === 'auto' ? <Clock size={14} /> : null}
                {c.label}
                {c.value === 'auto' && <span className="text-faint">· {minutesToHuman(usual)}</span>}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[0.82rem] text-muted">
            Rien d’assez court pour {minutesToHuman(budget as number)}. Essaie un créneau plus large — le plus court de
            tes épisodes disponibles dure plus longtemps que ça.
          </p>
        )
      ) : (
        <>
          {running === null && choice === 'auto' && (
            <p className="mb-3 text-[0.76rem] text-faint">
              Aucune idée, donc {minutesToHuman(usual)} : c’est la durée médiane de tes journées de visionnage.
            </p>
          )}

          <ul className="flex flex-col gap-2">
            {rows.map((slot, i) => {
              const media = mediaMap.get(slot.animeId)
              const vu = running !== null && seen(slot)
              return (
                <li
                  key={`${slot.animeId}:${slot.episode}`}
                  className={`flex items-center gap-3 rounded-2xl px-2.5 py-2 ${vu ? 'opacity-45' : ''}`}
                  style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--line)' }}
                >
                  <span className="grid w-4 shrink-0 place-items-center text-[0.72rem] tabular-nums text-faint">
                    {vu ? <Check size={13} strokeWidth={3} /> : i + 1}
                  </span>
                  {media && (
                    <Poster
                      src={media.cover.large}
                      alt=""
                      className="h-[46px] w-[32px] shrink-0"
                      rounded="rounded-lg"
                    />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.84rem] font-medium">{slot.title}</p>
                    <p className="text-[0.74rem] text-faint">
                      Épisode {slot.episode} · {slot.minutes} min · {REASONS[slot.reason]}
                    </p>
                  </div>

                  <button
                    className="btn !h-8 !px-2.5"
                    title={`Commencer la soirée ici, à l’épisode ${slot.episode}`}
                    onClick={() => void launch(i)}
                  >
                    <Play size={13} />
                  </button>
                  {running === null && (
                    <button
                      className="btn !h-8 !px-2.5"
                      title="Retirer cette série de la soirée"
                      onClick={() => setDropped((d) => [...d, slot.animeId])}
                    >
                      <X size={13} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="mt-3.5 flex flex-wrap items-center gap-3">
            {running === null ? (
              <>
                <button className="btn btn-primary !h-9" onClick={() => void launch(0)}>
                  <Play size={14} />
                  Lancer la soirée
                </button>
                <p className="text-[0.76rem] text-faint">
                  {minutesToHuman(session?.minutes ?? 0)} pour {minutesToHuman(budget as number)} demandées
                  {(session?.minutes ?? 0) > (budget as number) ? ' — un épisode de rab' : ''}
                </p>
              </>
            ) : (
              <p className="text-[0.76rem] text-faint">
                L’app enchaîne toute seule et fermera la fenêtre au bout de la liste. Cette liste-ci ne bouge plus :
                elle est celle qui joue.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
