import { ArrowLeft, Search } from 'lucide-react'
import { useState } from 'react'
import {
  STATUS_LABELS,
  type BrowseKind,
  type LibraryStatus,
  type Manga,
  type MangaKind,
  type Media
} from '@shared/types'
import { MangaSheet } from '@/components/MangaSheet'
import { Modal } from '@/components/ui'
import { formatLabel, formatTime, seasonLabel, titleOf } from '@/lib/format'
import { useApp } from '@/store/app'
import { useCatalogue, useForYou, useMangaList, useWeek } from './pages-data'
import type { DetailHeroProps } from '.'

/*
 * MAGAZINE — les rubriques du numéro : les critiques, le programme télé de la
 * semaine, le cahier manga, et la fiche d'un anime ouverte comme un article.
 */

/** Une note sur cinq étoiles, lue dans l'appréciation AniList. */
function stars(score: number | null): string {
  if (score === null) return '—'
  const full = Math.round(score / 20)
  return '★'.repeat(full) + '☆'.repeat(5 - full)
}

const SECTIONS: { kind: BrowseKind; label: string }[] = [
  { kind: 'trending', label: 'L’actualité' },
  { kind: 'season', label: 'La saison' },
  { kind: 'popular', label: 'Les incontournables' },
  { kind: 'top', label: 'Les chefs-d’œuvre' },
  { kind: 'upcoming', label: 'Les sorties à venir' }
]

function Review({ media, lead = false }: { media: Media; lead?: boolean }): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  return (
    <article className={lead ? 'xm-lead grid grid-cols-2 gap-8' : 'xm-review'}>
      <button className="text-left" onClick={() => navigate({ name: 'anime', id: media.id })}>
        <img
          src={lead ? (media.banner ?? media.cover.xl) : media.cover.large}
          alt=""
          className={`xm-photo w-full object-cover ${lead ? 'aspect-[4/3]' : 'aspect-[4/5]'}`}
        />
      </button>
      <div>
        <p className="xm-kicker mt-3">
          {formatLabel(media.format)} · <span className="xm-stars">{stars(media.averageScore)}</span>
        </p>
        <button className="text-left" onClick={() => navigate({ name: 'anime', id: media.id })}>
          <h3 className={lead ? 'xm-headline mt-2 !text-[3rem]' : 'xm-review-title mt-2'}>{titleOf(media, lang)}</h3>
        </button>
        {media.description && (
          <p className={`xm-body mt-2 ${lead ? 'xm-dropcap clamp-[8]' : 'clamp-4'}`}>{media.description}</p>
        )}
      </div>
    </article>
  )
}

export function MagazineDiscover({ initialSearch }: { initialSearch?: string }): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const [tab, setTab] = useState<BrowseKind>('trending')
  const [search, setSearch] = useState(initialSearch ?? '')
  const { items, loading, hasMore, loadMore, searching, error } = useCatalogue(tab, search)
  const rec = useForYou()

  return (
    <div className="px-12 pb-16 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="xm-kicker">Rubrique</p>
          <h1 className="xm-headline mt-2">{searching ? 'Aux archives' : 'Critiques'}</h1>
        </div>
        <label className="xm-searchline">
          <Search size={15} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Chercher dans les archives…" />
        </label>
      </div>
      {!searching && (
        <div className="xm-rule-double mt-6 flex flex-wrap gap-8 py-2">
          {SECTIONS.map((s) => (
            <button
              key={s.kind}
              className="xm-section"
              aria-current={tab === s.kind ? 'page' : undefined}
              onClick={() => setTab(s.kind)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-8 grid grid-cols-[1fr_300px] gap-10">
        <div>
          {items[0] && <Review media={items[0]} lead />}
          <div className="xm-rule-double mt-8 grid grid-cols-3 gap-8 pt-6">
            {items.slice(1).map((media) => (
              <Review key={media.id} media={media} />
            ))}
          </div>
          {loading && items.length === 0 && <p className="xm-caption">Mise sous presse…</p>}
          {error && <p className="xm-caption">{error}</p>}
          {hasMore && !loading && (
            <button className="xm-more mt-8" onClick={loadMore}>
              Lire la suite du dossier →
            </button>
          )}
        </div>

        <aside className="xm-column border-l pl-8" style={{ borderColor: 'rgba(26,26,26,.2)' }}>
          <p className="xm-kicker">Nos recommandations</p>
          <ol className="mt-3">
            {(rec?.picks ?? []).slice(0, 8).map((pick, i) => (
              <li key={pick.media.id} className="xm-brief">
                <span className="xm-num">{i + 1}</span>
                <button className="text-left" onClick={() => navigate({ name: 'anime', id: pick.media.id })}>
                  <span className="xm-brief-title">{titleOf(pick.media, lang)}</span>
                  {pick.from[0] && <span className="xm-caption block">Si tu as aimé {pick.from[0]}</span>}
                </button>
              </li>
            ))}
            {!rec && <li className="xm-caption">La rédaction prépare ta sélection…</li>}
          </ol>
        </aside>
      </div>
    </div>
  )
}

const dayTitle = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

export function MagazineCalendar(): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const [scope, setScope] = useState<'library' | 'all'>('library')
  const [offset, setOffset] = useState(0)
  const week = useWeek(scope, offset)
  const today = new Date().setHours(0, 0, 0, 0)

  return (
    <div className="px-12 pb-16 pt-8">
      <p className="xm-kicker">Guide de la semaine</p>
      <h1 className="xm-headline mt-2">Le programme</h1>
      <div className="xm-rule-double mt-6 flex flex-wrap items-center gap-8 py-2">
        <button
          className="xm-section"
          aria-current={scope === 'library' ? 'page' : undefined}
          onClick={() => setScope('library')}
        >
          Ta sélection
        </button>
        <button
          className="xm-section"
          aria-current={scope === 'all' ? 'page' : undefined}
          onClick={() => setScope('all')}
        >
          Toutes les chaînes
        </button>
        <span className="ml-auto flex gap-6">
          <button className="xm-section" onClick={() => setOffset((o) => o - 1)}>
            ← Semaine précédente
          </button>
          <button className="xm-section" onClick={() => setOffset(0)} aria-current={offset === 0 ? 'page' : undefined}>
            Cette semaine
          </button>
          <button className="xm-section" onClick={() => setOffset((o) => o + 1)}>
            Semaine suivante →
          </button>
        </span>
      </div>
      <p className="xm-deck mt-4">
        {week.loading ? 'Impression en cours…' : `${week.total} diffusion${week.total > 1 ? 's' : ''} au programme.`}
      </p>
      {week.error && <p className="xm-caption">{week.error}</p>}

      <div className="mt-8 columns-2 gap-12">
        {week.days.map((day) => (
          <section key={day.date} className="mb-8 break-inside-avoid">
            <h2 className="xm-day" data-today={day.date === today}>
              {dayTitle.format(day.date)}
            </h2>
            {day.items.map((slot) => (
              <button
                key={`${slot.mediaId}-${slot.episode}`}
                className="xm-listing-row"
                onClick={() => navigate({ name: 'anime', id: slot.media.id })}
              >
                <span className="xm-listing-time">{formatTime(slot.airingAt * 1000)}</span>
                <span className="xm-leader" />
                <span className="font-semibold">{titleOf(slot.media, lang)}</span>
                <span className="xm-caption whitespace-nowrap">ép. {slot.episode}</span>
              </button>
            ))}
            {day.items.length === 0 && !week.loading && <p className="xm-caption">Relâche.</p>}
          </section>
        ))}
      </div>
    </div>
  )
}

const MANGA_TABS: { kind: MangaKind; label: string }[] = [
  { kind: 'trending', label: 'On en parle' },
  { kind: 'popular', label: 'Les plus lus' },
  { kind: 'top', label: 'Les mieux notés' }
]

export function MagazineManga(): React.JSX.Element {
  const [tab, setTab] = useState<MangaKind>('trending')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<Manga | null>(null)
  const { items, loading, error } = useMangaList(tab, search)
  const lead = items[0]

  return (
    <div className="px-12 pb-16 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="xm-kicker">Supplément</p>
          <h1 className="xm-headline mt-2">Le cahier manga</h1>
        </div>
        <label className="xm-searchline">
          <Search size={15} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Chercher un titre…" />
        </label>
      </div>
      <div className="xm-rule-double mt-6 flex gap-8 py-2">
        {MANGA_TABS.map((t) => (
          <button
            key={t.kind}
            className="xm-section"
            aria-current={tab === t.kind ? 'page' : undefined}
            onClick={() => setTab(t.kind)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {lead && (
        <button
          className="xm-lead mt-8 grid w-full grid-cols-[260px_1fr] gap-8 text-left"
          onClick={() => setOpen(lead)}
        >
          <img src={lead.cover.xl} alt="" className="xm-photo aspect-[2/3] w-full object-cover" />
          <span>
            <span className="xm-kicker block">À la une du cahier</span>
            <span className="xm-headline mt-2 block !text-[3.2rem]">{lead.title.english ?? lead.title.romaji}</span>
            {lead.description && <span className="xm-body xm-dropcap clamp-[7] mt-4 block">{lead.description}</span>}
          </span>
        </button>
      )}

      <div className="xm-rule-double mt-10 columns-4 gap-8 pt-6">
        {items.slice(1).map((manga) => (
          <button
            key={manga.id}
            className="mb-6 block w-full break-inside-avoid text-left"
            onClick={() => setOpen(manga)}
          >
            <img src={manga.cover.large} alt="" className="xm-photo w-full object-cover" />
            <span className="xm-review-title mt-2 block">{manga.title.english ?? manga.title.romaji}</span>
            <span className="xm-caption block">
              {manga.chapters ? `${manga.chapters} chapitres` : 'En cours de parution'}
              {manga.startYear ? ` · depuis ${manga.startYear}` : ''}
            </span>
          </button>
        ))}
      </div>
      {loading && <p className="xm-caption">Mise sous presse…</p>}
      {error && <p className="xm-caption">{error}</p>}
      <Modal open={open !== null} onClose={() => setOpen(null)} width={640}>
        {open && <MangaSheet manga={open} onClose={() => setOpen(null)} />}
      </Modal>
    </div>
  )
}

const STATUSES: LibraryStatus[] = ['watching', 'planned', 'completed', 'paused', 'dropped']

export function MagazineDetailHero(props: DetailHeroProps): React.JSX.Element {
  const { media, entry, next, seen, total } = props
  const lang = useApp((s) => s.prefs.titleLang)

  return (
    <header className="px-12 pt-8">
      <button className="xm-section mb-6 flex items-center gap-2" onClick={props.onBack}>
        <ArrowLeft size={14} /> Retour au numéro
      </button>
      <p className="xm-kicker">
        {formatLabel(media.format)} · {seasonLabel(media.season, media.seasonYear)}
      </p>
      <h1 className="xm-headline mt-2 !text-[5rem]">{titleOf(media, lang)}</h1>
      <p className="xm-deck mt-3">
        {props.alsoKnownAs[0] ?? media.studios[0] ?? 'Une série à découvrir'}
        {media.studios[0] && props.alsoKnownAs[0] ? ` — produit par ${media.studios[0]}` : ''}
      </p>

      <div className="xm-rule-double mt-6 grid grid-cols-[1fr_300px] gap-10 pt-6">
        <figure>
          <img src={media.banner ?? media.cover.xl} alt="" className="xm-photo aspect-[16/7] w-full object-cover" />
          <figcaption className="xm-caption mt-1.5">
            {titleOf(media, lang)} · {media.studios[0] ?? 'Studio inconnu'}
          </figcaption>
        </figure>

        <aside className="xm-stat">
          <p className="xm-kicker">Fiche technique</p>
          <dl className="mt-2 text-[0.9rem]">
            {[
              ['Note', stars(media.averageScore)],
              ['Épisodes', total ? String(total) : '—'],
              ['Studio', media.studios[0] ?? '—'],
              ['Statut', entry ? STATUS_LABELS[entry.status] : 'Pas dans ta bibliothèque']
            ].map(([k, v]) => (
              <div key={k} className="xm-entry !grid-cols-[auto_1fr_auto]">
                <dt className="xm-caption">{k}</dt>
                <span className="xm-leader" />
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>

          <p className="xm-kicker mt-6">Ta lecture</p>
          {entry && total ? (
            <p className="xm-big mt-1 !text-[3.4rem]">
              {seen}
              <span className="xm-caption !text-[1rem]"> / {total}</span>
            </p>
          ) : (
            <p className="xm-caption mt-1">Tu n’as pas encore commencé.</p>
          )}
          <div className="mt-3 flex flex-col items-start gap-2">
            {next !== null && (
              <button className="xm-more" onClick={props.onMark}>
                Cocher l’épisode {next} →
              </button>
            )}
            {!entry && (
              <button className="xm-more" onClick={props.onAdd}>
                Ajouter à ma pile de lecture →
              </button>
            )}
            <button className="xm-section" onClick={props.onFavorite}>
              {entry?.favorite ? '♥ Coup de cœur' : '♡ Marquer comme coup de cœur'}
            </button>
            {entry && (
              <button className="xm-section" onClick={props.onLists}>
                Ranger dans une liste{props.inLists > 0 ? ` (${props.inLists})` : ''}
              </button>
            )}
          </div>
          {entry && (
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
              {STATUSES.map((status) => (
                <button
                  key={status}
                  className="xm-section"
                  aria-current={entry.status === status ? 'page' : undefined}
                  onClick={() => props.onStatus(status)}
                >
                  {STATUS_LABELS[status]}
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </header>
  )
}
