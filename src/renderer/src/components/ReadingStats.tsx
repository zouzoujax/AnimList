/**
 * La lecture, dans les statistiques.
 *
 * À part des chiffres du visionnage, et sans les mêler : un chapitre ne dure
 * rien de connu, l'additionner à des heures ne voudrait rien dire. Absente
 * tant qu'aucun manga n'est suivi — une section de zéros n'apprend rien.
 */

import { BookCheck, BookOpen, CalendarDays, Library } from 'lucide-react'
import { useMemo } from 'react'
import { readingStats } from '@shared/reading'
import { MonthlyColumns, StatTile } from '@/components/Charts'
import { Section } from '@/components/ui'
import { monthLabel, num } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import { useApp } from '@/store/app'

export function ReadingStats(): React.JSX.Element | null {
  const entries = useApp((s) => s.mangaEntries)
  const reads = useApp((s) => s.reads)
  const navigate = useApp((s) => s.navigate)
  const now = useNow(3_600_000)

  const stats = useMemo(() => readingStats([...entries.values()], reads, now), [entries, reads, now])
  if (!stats.total) return null

  const months = stats.months.map((m) => ({
    // L'abréviation d'usage : trois lettres confondaient juin et juillet.
    label: new Date(m.year, m.month, 1).toLocaleDateString('fr-FR', { month: 'short' }),
    value: m.chapters,
    detail: `${monthLabel(new Date(m.year, m.month, 1))} · ${num(m.chapters)} chapitre${m.chapters > 1 ? 's' : ''}`
  }))
  const read = stats.months.some((m) => m.chapters > 0)

  return (
    <Section
      id="lecture"
      title="Lecture"
      subtitle={`${num(stats.total)} manga${stats.total > 1 ? 's' : ''} suivi${stats.total > 1 ? 's' : ''} · rattrapages comptés au total, pas au mois`}
      action={
        <button className="chip shrink-0" onClick={() => navigate({ name: 'manga' })}>
          <BookOpen size={13} />
          Ma lecture
        </button>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Chapitres lus" value={num(stats.chapters)} icon={<BookOpen size={15} />} />
        <StatTile
          label="Ce mois-ci"
          value={num(stats.thisMonth)}
          hint={`${num(stats.activeDays)} jour${stats.activeDays > 1 ? 's' : ''} de lecture en tout`}
          icon={<CalendarDays size={15} />}
        />
        <StatTile
          label="En lecture"
          value={num(stats.byStatus.watching)}
          hint={`${num(stats.byStatus.planned)} à lire · ${num(stats.byStatus.paused)} en pause`}
          icon={<Library size={15} />}
        />
        <StatTile
          label="Lus"
          value={num(stats.byStatus.completed)}
          hint={stats.volumes > 0 ? `${num(stats.volumes)} tome${stats.volumes > 1 ? 's' : ''}` : undefined}
          icon={<BookCheck size={15} />}
        />
      </div>
      {read && (
        <div className="glass rounded-[20px] p-5">
          <MonthlyColumns data={months} unit="Chapitres lus par mois" />
        </div>
      )}
    </Section>
  )
}
