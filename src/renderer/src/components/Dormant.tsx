import { Check, Moon, Play, X } from 'lucide-react'
import { dormantVerdict, sleepLabel } from '@shared/dormant'
import { Poster, Section } from '@/components/ui'
import { useDormant, type DormantRow } from '@/lib/dormant'
import { titleOf } from '@/lib/format'
import { useApp } from '@/store/app'

/** « il reste 12 épisodes », « tout est vu », ou l'aveu qu'on ne sait pas. */
function restLabel(row: DormantRow): string {
  const { remaining } = row.series
  if (remaining === null) return 'on ne sait pas combien il en reste'
  if (remaining === 0) return 'tu as vu tout ce qui existe'
  return `il reste ${remaining} épisode${remaining > 1 ? 's' : ''}`
}

function DormantCard({ row }: { row: DormantRow }): React.JSX.Element {
  const lang = useApp((s) => s.prefs.titleLang)
  const navigate = useApp((s) => s.navigate)
  const saveEntry = useApp((s) => s.saveEntry)
  const toast = useApp((s) => s.toast)
  const { media, series } = row
  const title = titleOf(media, lang)
  const finish = dormantVerdict(series) === 'finish'

  const settle = (status: 'watching' | 'completed' | 'dropped', said: string): void => {
    void saveEntry(media.id, { status }).then(() => toast(`${title} · ${said}`, 'ok'))
  }

  return (
    <li className="glass flex gap-3.5 rounded-[16px] p-3">
      <button
        className="shrink-0"
        onClick={() => navigate({ name: 'anime', id: media.id })}
        aria-label={`Ouvrir ${title}`}
      >
        <Poster src={media.cover.large} alt="" className="h-[102px] w-[70px]" rounded="rounded-[11px]" />
      </button>

      <div className="flex min-w-0 flex-1 flex-col">
        <button
          className="clamp-2 text-left text-[0.88rem] font-semibold leading-snug hover:underline"
          onClick={() => navigate({ name: 'anime', id: media.id })}
        >
          {title}
        </button>
        <p className="mt-1 text-[0.76rem] leading-snug text-muted">
          Dort depuis {sleepLabel(series.days)} · {restLabel(row)}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2.5">
          {finish ? (
            <button className="btn !h-7 !px-2.5 text-[0.74rem]" onClick={() => settle('completed', 'marquée terminée')}>
              <Check size={13} />
              Terminée
            </button>
          ) : (
            <button className="btn !h-7 !px-2.5 text-[0.74rem]" onClick={() => settle('watching', 'reprise')}>
              <Play size={13} />
              Reprendre
            </button>
          )}
          <button
            className="btn !h-7 !px-2.5 text-[0.74rem]"
            title="Elle quitte les séries en cours, et cesse de te le rappeler"
            onClick={() => settle('dropped', 'abandonnée')}
          >
            <X size={13} />
            Abandonner
          </button>
        </div>
      </div>
    </li>
  )
}

/**
 * Les séries en pause qu'on a oubliées.
 *
 * « En pause » est le seul des cinq statuts dont rien ne parlait : ni la file
 * « à rattraper », qui ne regarde que ce qu'on suit, ni les notifications, qui
 * annoncent des diffusions. Une série mise en pause un soir y restait pour de
 * bon.
 *
 * La section ne demande pas de reprendre — elle demande de trancher. Les deux
 * boutons referment la série, et l'un d'eux la sort de la liste sans culpabilité.
 * Rien à afficher tant que rien ne dort : c'est le cas normal.
 */
export function Dormant(): React.JSX.Element | null {
  const rows = useDormant()
  if (rows.length === 0) return null

  const oldest = rows[0]
  return (
    <Section
      id="en-pause"
      title="Laissées en plan"
      subtitle={
        rows.length === 1
          ? `Une série en pause depuis ${sleepLabel(oldest.series.days)}. La reprendre, ou la refermer.`
          : `${rows.length} séries en pause, la plus ancienne depuis ${sleepLabel(oldest.series.days)}. Les reprendre, ou les refermer.`
      }
      action={
        <span className="flex shrink-0 items-center gap-1.5 text-[0.74rem] text-faint">
          <Moon size={13} />
          En pause
        </span>
      }
    >
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-2.5">
        {rows.map((row) => (
          <DormantCard key={row.media.id} row={row} />
        ))}
      </ul>
    </Section>
  )
}
