import { Search } from 'lucide-react'
import { useMemo } from 'react'
import { STATUS_LABELS, type Media } from '@shared/types'
import { airingLabel, formatLabel, minutesToHuman, titleOf } from '@/lib/format'
import { useBrowse } from '@/lib/hooks'
import { nextEpisodeOf, useApp, type Route } from '@/store/app'
import { useBehind, useContinue, useShelf, useTotals, useUpcoming } from './data'
import type { Experience } from '.'

/*
 * MAGAZINE — la bibliothèque lue comme un numéro papier : une manchette, une
 * « une » en colonnes avec article principal, brèves numérotées et programme
 * de la semaine, et une bibliothèque rangée comme l'index d'un annuaire.
 */

const NAV: { route: Route; label: string }[] = [
  { route: { name: 'home' }, label: 'À la une' },
  { route: { name: 'library' }, label: 'Index' },
  { route: { name: 'discover' }, label: 'Critiques' },
  { route: { name: 'calendar' }, label: 'Programme' },
  { route: { name: 'manga' }, label: 'Manga' },
  { route: { name: 'stats' }, label: 'Chiffres' },
  { route: { name: 'settings' }, label: 'Rédaction' }
]

function issueNumber(): number {
  // Un numéro par semaine depuis le début de l'année : il change sans qu'on y pense.
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  return Math.ceil((now.getTime() - start.getTime()) / (7 * 86_400_000))
}

function Nav(): React.JSX.Element {
  const route = useApp((s) => s.route)
  const navigate = useApp((s) => s.navigate)
  const setPalette = useApp((s) => s.setPalette)
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })

  return (
    <nav aria-label="Navigation principale" className="xm-nav shrink-0 px-12 pt-5">
      <div className="xm-rule flex items-center justify-between pb-1.5 text-[0.72rem] uppercase tracking-[0.18em]">
        <span>N° {issueNumber()}</span>
        <span>{today}</span>
        <button className="flex items-center gap-1.5 uppercase" onClick={() => setPalette(true)}>
          <Search size={12} /> Rechercher
        </button>
      </div>
      <p className="xm-masthead select-none text-center">AnimeList</p>
      <div className="xm-rule-double flex justify-center gap-8 py-2">
        {NAV.map(({ route: target, label }) => (
          <button
            key={target.name}
            onClick={() => navigate(target)}
            aria-current={route.name === target.name ? 'page' : undefined}
            className="xm-section"
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  )
}

function Cover({ media }: { media: Media }): React.JSX.Element {
  const state = useApp()
  const lang = state.prefs.titleLang
  const next = nextEpisodeOf(state, media.id, media.episodes)
  const seen = state.watched.get(media.id)?.size ?? 0

  return (
    <article className="xm-cover col-span-2 row-span-2 pr-8">
      <p className="xm-kicker">Grand dossier · {formatLabel(media.format)}</p>
      <button className="block text-left" onClick={() => state.navigate({ name: 'anime', id: media.id })}>
        <h1 className="xm-headline mt-2">{titleOf(media, lang)}</h1>
      </button>
      <p className="xm-deck mt-3">
        {seen > 0
          ? `Tu en es à ${seen} épisode${seen > 1 ? 's' : ''} sur ${media.episodes ?? '?'}. ${next ? `L’épisode ${next} t’attend.` : ''}`
          : 'La série dont tout le monde parle cette semaine.'}
      </p>
      <figure className="mt-5">
        <img src={media.banner ?? media.cover.xl} alt="" className="xm-photo aspect-[16/8] w-full object-cover" />
        <figcaption className="xm-caption mt-1.5">
          {media.studios[0] ?? 'Studio inconnu'} · {media.seasonYear ?? ''}
          {media.averageScore !== null && ` · ${media.averageScore}/100 d’appréciation`}
        </figcaption>
      </figure>
      {media.description && <p className="xm-body xm-dropcap mt-4 columns-2 gap-8">{media.description}</p>}
    </article>
  )
}

function Home(): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const continuing = useContinue()
  const behind = useBehind()
  const upcoming = useUpcoming()
  const totals = useTotals()
  const trending = useBrowse({ kind: 'trending', perPage: 10 })
  const season = useBrowse({ kind: 'season', perPage: 8 })
  const lead = continuing[0] ?? trending.items[0]

  return (
    <div className="px-12 pb-16 pt-8">
      <div className="grid grid-cols-3 gap-y-8">
        {lead ? <Cover media={lead} /> : <div className="skeleton col-span-2 row-span-2 h-[520px]" />}

        <aside className="xm-column pl-8">
          <p className="xm-kicker">En bref</p>
          <ol className="mt-3">
            {behind.slice(0, 6).map(({ media, behind: n }, i) => (
              <li key={media.id} className="xm-brief">
                <span className="xm-num">{i + 1}</span>
                <button className="text-left" onClick={() => navigate({ name: 'anime', id: media.id })}>
                  <span className="xm-brief-title">{titleOf(media, lang)}</span>
                  <span className="xm-caption block">
                    {n} épisode{n > 1 ? 's' : ''} en retard
                  </span>
                </button>
              </li>
            ))}
            {behind.length === 0 && <li className="xm-caption">Aucun retard à signaler.</li>}
          </ol>
        </aside>

        <aside className="xm-column pl-8">
          <p className="xm-kicker">Au programme</p>
          <ul className="mt-3">
            {upcoming.slice(0, 6).map((media) => (
              <li key={media.id} className="xm-listing">
                <span className="xm-listing-time">{airingLabel(media.nextAiring!.airingAt)}</span>
                <span className="xm-leader" />
                <button className="text-left font-semibold" onClick={() => navigate({ name: 'anime', id: media.id })}>
                  {titleOf(media, lang)} <span className="font-normal">· ép. {media.nextAiring!.episode}</span>
                </button>
              </li>
            ))}
            {upcoming.length === 0 && <li className="xm-caption">Relâche cette semaine.</li>}
          </ul>
          <div className="xm-stat mt-6">
            <p className="xm-kicker">Le chiffre</p>
            <p className="xm-big">{totals.week}</p>
            <p className="xm-caption">
              épisodes vus ces sept derniers jours, soit {minutesToHuman(totals.weekMinutes)}.
            </p>
          </div>
        </aside>
      </div>

      <div className="xm-rule-double mt-10 pt-6">
        <p className="xm-kicker">Critiques de la saison</p>
        <div className="mt-4 grid grid-cols-4 gap-8">
          {season.items.slice(0, 4).map((media) => (
            <article key={media.id} className="xm-review">
              <button className="text-left" onClick={() => navigate({ name: 'anime', id: media.id })}>
                <img src={media.cover.large} alt="" className="xm-photo aspect-[4/5] w-full object-cover" />
                <h3 className="xm-review-title mt-3">{titleOf(media, lang)}</h3>
              </button>
              {media.description && <p className="xm-body clamp-3 mt-1.5">{media.description}</p>}
            </article>
          ))}
        </div>
      </div>

      <div className="xm-rule-double mt-10 grid grid-cols-2 gap-12 pt-6">
        <div>
          <p className="xm-kicker">Palmarès de la semaine</p>
          <ol className="mt-3">
            {trending.items.map((media, i) => (
              <li key={media.id} className="xm-chart">
                <span className="xm-chart-rank">{String(i + 1).padStart(2, '0')}</span>
                <button className="text-left" onClick={() => navigate({ name: 'anime', id: media.id })}>
                  {titleOf(media, lang)}
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className="xm-kicker">Sur la table de chevet</p>
          <div className="mt-3 grid grid-cols-3 gap-4">
            {continuing.slice(1, 7).map((media) => (
              <button key={media.id} className="text-left" onClick={() => navigate({ name: 'anime', id: media.id })}>
                <img src={media.cover.large} alt="" className="xm-photo aspect-[2/3] w-full object-cover" />
                <span className="xm-caption clamp-2 mt-1 block">{titleOf(media, lang)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Library(): React.JSX.Element {
  const shelf = useShelf()
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const watched = useApp((s) => s.watched)

  // Un index se lit dans l'ordre alphabétique, rangé sous sa lettre.
  const letters = useMemo(() => {
    const groups = new Map<string, typeof shelf>()
    const sorted = [...shelf].sort((a, b) => titleOf(a.media, lang).localeCompare(titleOf(b.media, lang), 'fr'))
    for (const row of sorted) {
      const first = titleOf(row.media, lang).charAt(0).toUpperCase()
      const key = /[A-Z]/.test(first) ? first : '#'
      groups.set(key, [...(groups.get(key) ?? []), row])
    }
    return [...groups.entries()]
  }, [shelf, lang])

  return (
    <div className="px-12 pb-16 pt-8">
      <h1 className="xm-headline">Index</h1>
      <p className="xm-deck mt-2">{shelf.length} titres, de A à Z.</p>
      <div className="mt-8 columns-3 gap-10">
        {letters.map(([letter, rows]) => (
          <section key={letter} className="mb-6 break-inside-avoid">
            <h2 className="xm-letter">{letter}</h2>
            {rows.map(({ media, entry }) => (
              <button key={media.id} className="xm-entry" onClick={() => navigate({ name: 'anime', id: media.id })}>
                <span className="xm-entry-title">{titleOf(media, lang)}</span>
                <span className="xm-leader" />
                <span className="xm-entry-page">
                  {watched.get(media.id)?.size ?? 0}/{media.episodes ?? '?'}
                </span>
                <span className="xm-caption col-span-3 block">{STATUS_LABELS[entry.status]}</span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}

export const magazine: Experience = {
  Nav,
  Home,
  Library,
  motion: {
    initial: { opacity: 0, rotateY: -8, x: 30, transformPerspective: 1400, originX: 0 },
    animate: { opacity: 1, rotateY: 0, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { duration: 0.5, ease: [0.25, 1, 0.5, 1] }
  }
}
