/**
 * Le journal, en lignes.
 *
 * Même contenu que la page d'origine — `lib/journal` le décide pour les deux —
 * mais raconté plutôt qu'étiqueté : une phrase en tête, des journées annoncées
 * en toutes lettres, et des visionnages séparés par un filet au lieu d'être
 * posés chacun sur sa carte. Ce qu'on a écrit se lit au même rang que le reste,
 * parce que c'est pour ça qu'on ouvre cette page.
 */

import { NotebookPen, Pencil, Search, Star } from 'lucide-react'
import { useState } from 'react'
import { EMOTIONS, type EmotionId } from '@shared/types'
import EpisodeEditor from '@/components/EpisodeEditor'
import { JournalExport } from '@/components/JournalExport'
import { NdHeader, plural, spokenDuration } from '@/components/nd'
import { EmptyState, Poster } from '@/components/ui'
import { formatTime, relativeDay, titleOf } from '@/lib/format'
import { JOURNAL_FILTERS, emotionOf, passLabel, useJournal } from '@/lib/journal'
import { useApp } from '@/store/app'

function Emotions({ ids }: { ids: EmotionId[] }): React.JSX.Element {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {ids.map((id) => {
        const emotion = emotionOf(id)
        if (!emotion) return null
        return (
          <span key={id} title={emotion.label} className="text-[0.88rem] leading-none">
            <span aria-hidden>{emotion.emoji}</span>
            <span className="sr-only">{emotion.label}</span>
          </span>
        )
      })}
    </span>
  )
}

/** La phrase du haut : ce que le journal contient, dit d'une traite. */
function summary(total: number, noted: number, pinned: number): string {
  if (total === 0) return 'Chaque épisode que tu coches viendra se poser ici, à sa date.'
  const start = `Tu as regardé ${plural(total, 'épisode')}.`
  if (noted === 0 && pinned === 0) return `${start} Ouvre-en un pour écrire ce que tu veux en retenir.`
  const bits: string[] = []
  if (noted > 0) bits.push(plural(noted, 'porte une note', 'portent une note'))
  if (pinned > 0) bits.push(plural(pinned, 'attend d’être revu', 'attendent d’être revus'))
  return `${start} ${bits.join(', et ')}.`
}

export default function NdJournalPage(): React.JSX.Element {
  const lang = useApp((s) => s.prefs.titleLang)
  const j = useJournal()
  const [editing, setEditing] = useState<{ animeId: number; episode: number } | null>(null)

  return (
    <div className="page mx-auto max-w-[980px] px-7 py-7">
      <NdHeader
        title="Journal"
        sub={
          <>
            {summary(j.total, j.noted, j.pinned)}
            {/* Dit une fois, sans y revenir : sans cette phrase, quelqu'un qui
                a importé sa liste croirait à des épisodes perdus. */}
            {j.imported > 0 && (
              <span className="mt-1 block text-[0.8rem] text-faint">
                {plural(j.imported, 'ligne importée reste', 'lignes importées restent')} en dehors : leur date est celle
                du pointage dans l'app d'origine, pas celle d'une soirée. La corriger depuis sa fiche la fait entrer
                ici.
              </span>
            )}
          </>
        }
      />

      {j.total > 0 && (
        <>
          <div className="nd-toolbar">
            <label className="nd-search">
              <Search size={15} />
              <input
                type="search"
                placeholder="Chercher dans tes notes et tes séries…"
                value={j.search}
                onChange={(e) => j.setSearch(e.target.value)}
                aria-label="Chercher dans le journal"
              />
            </label>
            <div className="nd-seg" role="group" aria-label="Ce qu'on montre">
              {JOURNAL_FILTERS.map((f) => (
                <button key={f.id} aria-pressed={j.filter === f.id} title={f.hint} onClick={() => j.setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            <JournalExport rows={j.rows} filtered={j.rows.length !== j.total} />
          </div>

          {j.emotionCounts.size > 0 && (
            <div className="nd-seg mb-6" role="group" aria-label="Filtrer par ressenti">
              {EMOTIONS.filter((e) => j.emotionCounts.has(e.id)).map((e) => (
                <button
                  key={e.id}
                  aria-pressed={j.emotion === e.id}
                  // Recliquer sur le filtre actif l'enlève : sans ça, il
                  // faudrait chercher un bouton « tous » qui n'existe pas.
                  onClick={() => j.setEmotion(j.emotion === e.id ? null : e.id)}
                >
                  <span aria-hidden className="mr-1">
                    {e.emoji}
                  </span>
                  {e.label}
                  <span className="nd-tab-count">{j.emotionCounts.get(e.id)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {j.total === 0 ? (
        <EmptyState
          icon={<NotebookPen size={22} />}
          title={j.imported > 0 ? 'Rien de daté pour l’instant' : 'Ton journal est vide'}
          hint={
            j.imported > 0
              ? "Tout ton historique vient d'un import, et ces dates sont celles du pointage, pas du visionnage. Le prochain épisode que tu coches ici ouvrira le journal."
              : "Coche un épisode et il apparaîtra ici. Depuis sa fiche, tu peux lui ajouter un ressenti et quelques lignes — c'est ce que cette page te redonne, des mois plus tard."
          }
        />
      ) : j.rows.length === 0 ? (
        <EmptyState
          icon={<Search size={22} />}
          title="Rien ne correspond"
          hint={JOURNAL_FILTERS.find((f) => f.id === j.filter)?.hint}
          action={
            <button className="btn mt-1" onClick={j.reset}>
              Tout afficher
            </button>
          }
        />
      ) : (
        <>
          {j.days.map(({ day, rows: dayRows }) => {
            const minutes = dayRows.reduce((sum, r) => sum + r.event.minutes, 0)
            return (
              <section key={day} className="nd-part mb-9">
                <header className="mb-1 px-1">
                  <h2 className="title-xl text-[1.1rem] leading-tight first-letter:uppercase">{relativeDay(day)}</h2>
                  <p className="mt-0.5 text-[0.8rem] text-muted">
                    {plural(dayRows.length, 'épisode')}
                    {minutes > 0 && `, ${spokenDuration(minutes)}`}
                  </p>
                </header>

                <ol className="nd-timeline">
                  {dayRows.map(({ event, media: m }) => {
                    const pass = event.pass ?? 0
                    const note = event.note?.trim()
                    return (
                      <li key={`${event.animeId}:${event.episode}:${pass}`}>
                        <button
                          className="nd-chip-series group !w-full !items-start"
                          onClick={() => setEditing({ animeId: event.animeId, episode: event.episode })}
                          title="Ouvrir cet épisode"
                        >
                          <Poster
                            src={m.cover.large}
                            alt=""
                            className="h-[52px] w-[36px] shrink-0"
                            rounded="rounded-[6px]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline gap-2">
                              <span className="truncate text-[0.88rem] font-semibold">{titleOf(m, lang)}</span>
                              <span className="ml-auto shrink-0 text-[0.75rem] tabular-nums text-faint">
                                {formatTime(event.at)}
                              </span>
                            </span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.78rem] text-muted">
                              <span>
                                Épisode {event.episode}
                                {pass > 0 && `, ${passLabel(pass).toLowerCase()}`}
                              </span>
                              {event.pinned && (
                                <span className="flex items-center gap-1 text-[0.75rem] text-faint">
                                  <Star size={11} fill="currentColor" />À revoir
                                </span>
                              )}
                              {event.emotions && event.emotions.length > 0 && <Emotions ids={event.emotions} />}
                            </span>
                            {note && (
                              <span className="mt-1.5 block max-w-[70ch] whitespace-pre-wrap text-[0.83rem] leading-relaxed">
                                {note}
                              </span>
                            )}
                          </span>
                          <Pencil
                            size={13}
                            className="mt-1 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
                          />
                        </button>
                      </li>
                    )
                  })}
                </ol>
              </section>
            )
          })}

          {j.remaining > 0 && (
            <div className="flex justify-center py-2">
              <button className="btn" onClick={j.more}>
                Afficher {j.remaining > 120 ? 'les 120 suivants' : `les ${j.remaining} derniers`}
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
