/**
 * Le journal : ce que tu as regardé, dans l'ordre où tu l'as regardé.
 *
 * Chaque épisode coché laisse une trace — une date, une durée, parfois un
 * ressenti ou quelques lignes écrites depuis sa fiche. Jusqu'ici ces notes ne
 * se relisaient que série par série, à condition de se souvenir de laquelle il
 * s'agissait. Ici elles reviennent toutes, à leur date, et un clic rouvre
 * l'épisode pour les corriger.
 */

import { NotebookPen, Pencil, Search, Star, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EMOTIONS, type EmotionId, type Media, type WatchEvent } from '@shared/types'
import EpisodeEditor from '@/components/EpisodeEditor'
import { EmptyState, Poster } from '@/components/ui'
import { formatTime, minutesToHuman, pluralize, relativeDay, startOfDay, titleOf } from '@/lib/format'
import { useSessionState } from '@/lib/hooks'
import { useApp } from '@/store/app'

type Filter = 'all' | 'notes' | 'pinned'

const FILTERS: { id: Filter; label: string; hint: string }[] = [
  { id: 'all', label: 'Tout', hint: 'Chaque épisode coché, du plus récent au plus ancien.' },
  { id: 'notes', label: 'Avec une note', hint: 'Les épisodes dont tu as écrit quelque chose.' },
  { id: 'pinned', label: 'À revoir', hint: 'Les épisodes que tu as mis de côté.' }
]

/** Un pas de lecture : assez pour remplir l'écran, assez peu pour rester vif. */
const PAGE = 120

const EMOTION_BY_ID = new Map(EMOTIONS.map((e) => [e.id, e]))

const passLabel = (pass: number): string => (pass === 1 ? '2ᵉ visionnage' : `${pass + 1}ᵉ visionnage`)

interface Row {
  event: WatchEvent
  media: Media
}

function Emotions({ ids }: { ids: EmotionId[] }): React.JSX.Element {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {ids.map((id) => {
        const emotion = EMOTION_BY_ID.get(id)
        if (!emotion) return null
        return (
          <span key={id} title={emotion.label} className="text-[0.85rem] leading-none">
            <span aria-hidden>{emotion.emoji}</span>
            <span className="sr-only">{emotion.label}</span>
          </span>
        )
      })}
    </span>
  )
}

export default function JournalPage(): React.JSX.Element {
  const events = useApp((s) => s.events)
  const media = useApp((s) => s.media)
  const lang = useApp((s) => s.prefs.titleLang)

  const [filter, setFilter] = useSessionState<Filter>('journal.filter', 'all')
  const [emotion, setEmotion] = useSessionState<EmotionId | null>('journal.emotion', null)
  const [search, setSearch] = useSessionState<string>('journal.search', '')
  const [shown, setShown] = useState(PAGE)
  const [editing, setEditing] = useState<{ animeId: number; episode: number } | null>(null)

  // Le journal entier, une fois : c'est lui qu'on filtre ensuite, et le tri
  // d'un historique de plusieurs milliers de lignes n'a pas à recommencer à
  // chaque frappe dans la recherche.
  const all = useMemo(
    () =>
      events
        .map((event) => ({ event, media: media.get(event.animeId) }))
        .filter((row): row is Row => !!row.media)
        .sort((a, b) => b.event.at - a.event.at),
    [events, media]
  )

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return all.filter(({ event, media: m }) => {
      if (filter === 'notes' && !event.note?.trim()) return false
      if (filter === 'pinned' && !event.pinned) return false
      if (emotion && !event.emotions?.includes(emotion)) return false
      if (!needle) return true
      // La recherche porte sur ce qu'on a écrit autant que sur le titre : on
      // cherche « ce passage du train » sans savoir de quelle série il venait.
      return titleOf(m, lang).toLowerCase().includes(needle) || (event.note?.toLowerCase().includes(needle) ?? false)
    })
  }, [all, filter, emotion, search, lang])

  // Les émotions jamais posées ne servent à rien comme filtre : elles ne
  // donneraient qu'une page vide. Seules celles du journal sont proposées.
  const emotionCounts = useMemo(() => {
    const tally = new Map<EmotionId, number>()
    for (const { event } of all) for (const id of event.emotions ?? []) tally.set(id, (tally.get(id) ?? 0) + 1)
    return tally
  }, [all])

  const visible = rows.slice(0, shown)

  /** Découpé en journées : c'est l'unité dans laquelle on se souvient. */
  const days = useMemo(() => {
    const out: { day: number; rows: Row[] }[] = []
    for (const row of visible) {
      const day = startOfDay(row.event.at)
      const last = out[out.length - 1]
      if (last && last.day === day) last.rows.push(row)
      else out.push({ day, rows: [row] })
    }
    return out
  }, [visible])

  const noted = useMemo(() => all.filter(({ event }) => event.note?.trim()).length, [all])
  const pinnedCount = useMemo(() => all.filter(({ event }) => event.pinned).length, [all])

  const reset = (): void => {
    setFilter('all')
    setEmotion(null)
    setSearch('')
    setShown(PAGE)
  }

  const change = <T,>(set: (value: T) => void, value: T): void => {
    set(value)
    setShown(PAGE)
  }

  return (
    <div className="mx-auto max-w-[900px] px-7 py-7">
      <h1 className="title-xl mb-1 text-[1.85rem]">Journal</h1>
      <p className="mb-6 text-[0.88rem] text-muted">
        {all.length === 0
          ? 'Chaque épisode coché viendra se poser ici, à sa date.'
          : `${pluralize(all.length, 'épisode regardé', 'épisodes regardés')}, dont ${pluralize(noted, 'porte une note', 'portent une note')}${pinnedCount > 0 ? ` et ${pluralize(pinnedCount, 'est à revoir', 'sont à revoir')}` : ''}.`}
      </p>

      {all.length > 0 && (
        <div className="mb-6 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[16rem] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                type="search"
                className="field w-full !pl-9"
                placeholder="Chercher dans tes notes et tes séries…"
                value={search}
                onChange={(e) => change(setSearch, e.target.value)}
              />
            </div>
            {FILTERS.map((f) => (
              <button
                key={f.id}
                data-on={filter === f.id}
                className="chip"
                title={f.hint}
                onClick={() => change(setFilter, f.id)}
              >
                {f.id === 'pinned' && <Star size={12} fill={filter === 'pinned' ? 'currentColor' : 'none'} />}
                {f.label}
              </button>
            ))}
          </div>

          {emotionCounts.size > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="label mr-1">Ressenti</span>
              {EMOTIONS.filter((e) => emotionCounts.has(e.id)).map((e) => (
                <button
                  key={e.id}
                  data-on={emotion === e.id}
                  className="chip !h-7 text-[0.72rem]"
                  // Recliquer sur le filtre actif l'enlève : sans ça, il
                  // faudrait chercher un bouton « tous » qui n'existe pas.
                  onClick={() => change(setEmotion, emotion === e.id ? null : e.id)}
                >
                  <span aria-hidden>{e.emoji}</span>
                  {e.label}
                  <span className="ml-0.5 tabular-nums text-faint">{emotionCounts.get(e.id)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {all.length === 0 ? (
        <EmptyState
          icon={<NotebookPen size={22} />}
          title="Ton journal est vide"
          hint="Coche un épisode et il apparaîtra ici. Depuis sa fiche, tu peux lui ajouter un ressenti et quelques lignes — c'est ce que cette page te redonne, des mois plus tard."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Search size={22} />}
          title="Rien ne correspond"
          hint={FILTERS.find((f) => f.id === filter)?.hint}
          action={
            <button className="btn mt-1" onClick={reset}>
              <X size={13} />
              Tout afficher
            </button>
          }
        />
      ) : (
        <>
          {days.map(({ day, rows: dayRows }) => {
            const minutes = dayRows.reduce((sum, r) => sum + r.event.minutes, 0)
            return (
              <section key={day} className="mb-7">
                <header className="mb-2.5 flex items-baseline gap-2 px-1">
                  <h2 className="text-[0.92rem] font-semibold">
                    {relativeDay(day).replace(/^./, (c) => c.toUpperCase())}
                  </h2>
                  <span className="text-[0.74rem] text-faint">
                    {pluralize(dayRows.length, 'épisode', 'épisodes')}
                    {minutes > 0 && ` · ${minutesToHuman(minutes)}`}
                  </span>
                </header>

                <ul className="flex flex-col gap-1.5">
                  {dayRows.map(({ event, media: m }) => {
                    const pass = event.pass ?? 0
                    const note = event.note?.trim()
                    return (
                      <li key={`${event.animeId}:${event.episode}:${pass}`}>
                        <button
                          className="glass group flex w-full gap-3 rounded-2xl p-2.5 text-left transition-colors hover:bg-white/5"
                          onClick={() => setEditing({ animeId: event.animeId, episode: event.episode })}
                          title="Ouvrir cet épisode"
                        >
                          <Poster
                            src={m.cover.large}
                            alt=""
                            className="h-[62px] w-[44px] shrink-0"
                            rounded="rounded-lg"
                          />
                          {/* Centré verticalement : sans note, deux lignes de
                              texte contre une affiche de soixante pixels
                              laisseraient un creux sous le titre. */}
                          <div className="flex min-w-0 flex-1 flex-col justify-center">
                            <div className="flex items-baseline gap-2">
                              <span className="truncate text-[0.86rem] font-semibold">{titleOf(m, lang)}</span>
                              <span className="ml-auto shrink-0 text-[0.72rem] tabular-nums text-faint">
                                {/* Une ligne importée porte la date du pointage
                                    dans l'app d'origine, pas une heure vécue :
                                    l'afficher donnerait une fausse précision. */}
                                {event.imported ? 'importé' : formatTime(event.at)}
                              </span>
                            </div>
                            <p className="mt-0.5 flex items-center gap-1.5 text-[0.75rem] text-muted">
                              <span>Épisode {event.episode}</span>
                              {pass > 0 && (
                                <span
                                  className="rounded-full px-1.5 py-px text-[0.66rem] text-faint"
                                  style={{ background: 'var(--line)' }}
                                >
                                  {passLabel(pass)}
                                </span>
                              )}
                              {event.pinned && (
                                <span className="flex items-center gap-0.5 text-[0.7rem] text-faint" title="À revoir">
                                  <Star size={11} fill="currentColor" />À revoir
                                </span>
                              )}
                              {event.emotions && event.emotions.length > 0 && <Emotions ids={event.emotions} />}
                            </p>
                            {note && (
                              <p className="mt-1.5 whitespace-pre-wrap text-[0.78rem] leading-relaxed text-muted">
                                {note}
                              </p>
                            )}
                          </div>
                          <Pencil
                            size={13}
                            className="mt-0.5 shrink-0 self-center text-faint opacity-0 transition-opacity group-hover:opacity-100"
                          />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}

          {rows.length > visible.length && (
            <div className="flex justify-center py-2">
              <button className="btn" onClick={() => setShown(shown + PAGE)}>
                Afficher plus ({rows.length - visible.length} restants)
              </button>
            </div>
          )}
        </>
      )}

      {editing && (
        <EpisodeEditor
          animeId={editing.animeId}
          episode={editing.episode}
          title={null}
          url={null}
          thumbnail={null}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
