import { ArrowUpRight, Check, Compass, Dices } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FollowNews, Media } from '@shared/types'
import { MIN_BEHIND } from '@shared/catch-up'
import { AnimeCard, MiniCard } from '@/components/AnimeCard'
import { EmptyState, ErrorBox, PosterSkeletons, Poster, RowScroller, Section } from '@/components/ui'
import { EpisodeStrip, SeriesRow, plural } from '@/components/nd'
import { Soiree } from '@/components/Soiree'
import { Dormant } from '@/components/Dormant'
import { PlanGrid, dayName, planSentence, useCatchUpPlan } from '@/components/CatchUp'
import { rgba, toneAccent } from '@/lib/color'
import { airingLabel, formatTime, isUnaired, startOfDay, titleOf } from '@/lib/format'
import { useBrowse, useNow } from '@/lib/hooks'
import { setLume } from '@/lib/lume'
import { nextEpisodeOf, useApp } from '@/store/app'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return 'Bonne nuit'
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

function Spotlight({ media, resumeAt }: { media: Media; resumeAt: number | null }): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const reduceMotion = useApp((s) => s.prefs.reduceMotion)
  const toggleEpisode = useApp((s) => s.toggleEpisode)
  const toast = useApp((s) => s.toast)
  const seenCount = useApp((s) => s.watched.get(media.id)?.size ?? 0)
  const glow = toneAccent(media.cover.color)
  const frame = useRef<HTMLDivElement>(null)

  // Écrit sur le DOM, jamais dans un état : ça se déclenche à chaque pixel
  // parcouru et ne doit pas redessiner la une. Même geste que sur les cartes.
  const onMove = (event: React.MouseEvent): void => {
    const el = frame.current
    if (!el || reduceMotion) return
    const box = el.getBoundingClientRect()
    el.style.setProperty('--px', String((event.clientX - box.left) / box.width - 0.5))
    el.style.setProperty('--py', String((event.clientY - box.top) / box.height - 0.5))
  }

  const onLeave = (): void => {
    const el = frame.current
    if (!el) return
    el.style.setProperty('--px', '0')
    el.style.setProperty('--py', '0')
  }

  // L'épisode suivant n'est pas toujours sorti : proposer de le cocher ferait
  // inventer un visionnage. La fiche l'interdit déjà, la une doit s'aligner.
  const pending = resumeAt !== null && isUnaired(media, resumeAt)

  return (
    <motion.div
      ref={frame}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      initial={{ opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 180, damping: 26 }}
      className="spotlight on-art span-all relative mb-9 overflow-hidden rounded-[26px]"
      style={{ border: `1px solid ${rgba(glow, 0.25)}`, boxShadow: `0 40px 90px -50px ${rgba(glow, 1)}` }}
    >
      <div className="sp-plane sp-back absolute inset-0">
        <img
          src={media.banner ?? media.cover.xl}
          alt=""
          draggable={false}
          className="sp-drift h-full w-full object-cover"
        />
      </div>
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(95deg, rgba(5,6,12,.97) 30%, rgba(5,6,12,.5) 62%, ${rgba(glow, 0.35)})` }}
      />

      <div className="relative flex items-end gap-6 p-7">
        <div className="sp-plane sp-fore shrink-0">
          <Poster
            src={media.cover.xl}
            alt=""
            className="sp-poster hidden h-[236px] w-[158px] sm:block"
            rounded="rounded-[16px]"
          />
        </div>

        <div className="sp-plane sp-mid min-w-0 flex-1 pb-1">
          <h1 className="title-xl clamp-2 max-w-2xl text-[2.3rem] leading-[1.05]">{titleOf(media, lang)}</h1>

          {resumeAt !== null ? (
            <>
              <p className="mt-3 text-[0.86rem] text-muted">
                {pending && media.nextAiring
                  ? `Tu es à jour. L'épisode ${resumeAt} sort ${airingLabel(media.nextAiring.airingAt).toLowerCase()}.`
                  : `${plural(seenCount, 'épisode')} vu${seenCount > 1 ? 's' : ''}${media.episodes ? ` sur ${media.episodes}` : ''}. Le suivant est l'épisode ${resumeAt}.`}
              </p>
              <div className="mt-3 max-w-2xl">
                <EpisodeStrip media={media} next={resumeAt} size="lg" />
              </div>
            </>
          ) : (
            media.description && (
              <p className="clamp-3 mt-3 max-w-[62ch] text-[0.86rem] leading-relaxed text-muted">{media.description}</p>
            )
          )}

          <div className="mt-5 flex flex-wrap gap-2.5">
            {resumeAt !== null && !pending && (
              <button
                className="btn btn-primary"
                onClick={async () => {
                  await toggleEpisode(media.id, resumeAt)
                  toast(`Épisode ${resumeAt} coché · ${titleOf(media, lang)}`)
                }}
              >
                <Check size={15} />
                Cocher l'épisode {resumeAt}
              </button>
            )}
            <button
              className={resumeAt === null ? 'btn btn-primary' : 'btn'}
              onClick={() => navigate({ name: 'anime', id: media.id })}
            >
              Voir la fiche
            </button>
          </div>
        </div>
      </div>
      {/* Magic UI « Border Beam » : éteint, sauf dans les thèmes qui l'allument. */}
      <span aria-hidden className="fx-beam" />
    </motion.div>
  )
}

/**
 * La semaine de diffusion, jour par jour.
 *
 * Une rangée de cartes rangées par date se lisait comme n'importe quelle liste ;
 * sept colonnes montrent d'un coup d'œil les soirs chargés et les soirs vides,
 * ce qui est la vraie question quand on prévoit sa semaine.
 */
function WeekGrid({
  upcoming,
  now,
  onHover
}: {
  upcoming: Media[]
  now: number
  onHover: (media: Media | null) => void
}): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const today = startOfDay(now)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    return d.getTime()
  })

  return (
    <div className="week-grid">
      {days.map((day, i) => {
        const end = days[i + 1] ?? day + 86_400_000
        const items = upcoming.filter((m) => {
          const at = m.nextAiring!.airingAt * 1000
          return at >= day && at < end
        })
        const label = dayName(i, day)
        return (
          <div key={day} className="week-day" data-empty={items.length === 0}>
            <p className="week-day-name">{label}</p>
            {items.map((media) => (
              <button
                key={media.id}
                className="week-item"
                onClick={() => navigate({ name: 'anime', id: media.id })}
                onMouseEnter={() => onHover(media)}
                onMouseLeave={() => onHover(null)}
              >
                <Poster src={media.cover.large} alt="" className="h-[52px] w-[36px] shrink-0" rounded="rounded-[7px]" />
                <span className="min-w-0">
                  <span className="clamp-2 text-[0.76rem] font-semibold leading-snug">{titleOf(media, lang)}</span>
                  <span className="mt-0.5 block text-[0.7rem] text-faint">
                    Ép. {media.nextAiring!.episode}, {formatTime(media.nextAiring!.airingAt * 1000)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}

/** Au-delà, la file se replie : la page doit rester un accueil, pas la bibliothèque. */
const QUEUE_FOLD = 8

export default function HomePage(): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const entries = useApp((s) => s.entries)
  const mediaMap = useApp((s) => s.media)
  const events = useApp((s) => s.events)
  const watchedMap = useApp((s) => s.watched)
  const lang = useApp((s) => s.prefs.titleLang)
  const state = useApp()
  const refreshed = useRef(false)
  const now = useNow()
  const [discoverTab, setDiscoverTab] = useState<'trending' | 'season'>('trending')
  const [queueOpen, setQueueOpen] = useState(false)
  const [weekTab, setWeekTab] = useState<'airing' | 'plan'>('airing')

  const trending = useBrowse({ kind: 'trending', perPage: 20 })
  const season = useBrowse({ kind: 'season', perPage: 20 })

  // Airing dates go stale fast; top the library back up once per launch.
  useEffect(() => {
    if (refreshed.current) return
    refreshed.current = true
    const stale = [...entries.values()]
      .filter((e) => e.status === 'watching' || e.status === 'planned')
      .map((e) => mediaMap.get(e.animeId))
      .filter((m): m is Media => !!m && Date.now() - m.cachedAt > 6 * 3600_000)
      .map((m) => m.id)
    if (stale.length) void window.api.anime.refresh(stale.slice(0, 100)).catch(() => {})
  }, [entries, mediaMap])

  const lastWatchAt = useMemo(() => {
    const map = new Map<number, number>()
    for (const ev of events) map.set(ev.animeId, Math.max(map.get(ev.animeId) ?? 0, ev.at))
    return map
  }, [events])

  /**
   * Ce qui t'attend vraiment.
   *
   * Le retard se compte sur les épisodes **diffusés** : un épisode programmé
   * pour jeudi n'est pas un retard.
   */
  const behindOf = useMemo(() => {
    const map = new Map<number, number>()
    for (const entry of entries.values()) {
      if (entry.status !== 'watching') continue
      const media = mediaMap.get(entry.animeId)
      if (!media) continue
      const aired = media.nextAiring ? media.nextAiring.episode - 1 : (media.episodes ?? 0)
      const seen = watchedMap.get(media.id)
      let behind = 0
      for (let n = 1; n <= aired; n += 1) if (!seen?.has(n)) behind += 1
      map.set(media.id, behind)
    }
    return map
  }, [entries, mediaMap, watchedMap])

  const behindTotal = [...behindOf.values()].reduce((sum, n) => sum + n, 0)

  /**
   * Les épisodes mis de côté pour y revenir.
   *
   * Marquer ne sert à rien si on ne peut pas retrouver : la marque se pose sur
   * la fiche, elle se relit ici, sans avoir à se souvenir de quelle série il
   * s'agissait.
   */
  const pinned = useMemo(
    () =>
      events
        .filter((ev) => ev.pinned)
        .sort((a, b) => b.at - a.at)
        .map((ev) => ({ ev, media: mediaMap.get(ev.animeId) }))
        .filter((row): row is { ev: (typeof events)[number]; media: Media } => !!row.media)
        .slice(0, 12),
    [events, mediaMap]
  )

  /*
   * « À rattraper » et « Continuer » montraient les mêmes séries deux fois, triées
   * autrement. Une seule file, dans l'ordre où tu les regardes ; le retard de
   * chacune est écrit sur sa ligne.
   */
  const continueList = useMemo(() => {
    return [...entries.values()]
      .filter((e) => e.status === 'watching')
      .map((e) => mediaMap.get(e.animeId))
      .filter((m): m is Media => !!m)
      .sort((a, b) => (lastWatchAt.get(b.id) ?? 0) - (lastWatchAt.get(a.id) ?? 0))
  }, [entries, mediaMap, lastWatchAt])

  const upcoming = useMemo(() => {
    const horizon = startOfDay(now) + 7 * 86_400_000
    return [...entries.values()]
      .filter((e) => e.status === 'watching' || e.status === 'planned')
      .map((e) => mediaMap.get(e.animeId))
      .filter((m): m is Media => !!m?.nextAiring && m.nextAiring.airingAt * 1000 < horizon)
      .sort((a, b) => a.nextAiring!.airingAt - b.nextAiring!.airingAt)
  }, [entries, mediaMap, now])

  const plan = useCatchUpPlan(now)
  const planWorth = plan.behind.episodes >= MIN_BEHIND
  const showPlan = planWorth && weekTab === 'plan'

  const heroMedia = continueList[0] ?? trending.items[0]
  const heroResume = heroMedia && continueList[0] ? nextEpisodeOf(state, heroMedia.id, heroMedia.episodes) : null
  const queue = continueList.slice(1)
  const shownQueue = queueOpen ? queue : queue.slice(0, QUEUE_FOLD)
  const empty = entries.size === 0

  /*
   * La page est éclairée par la série dont elle parle : à la une par défaut,
   * par l'affiche survolée le temps du survol. On rend la main à l'accent en
   * quittant l'accueil, sinon la teinte suivrait l'utilisateur ailleurs.
   */
  const heroCover = heroMedia?.cover.color ?? null
  useEffect(() => {
    setLume(heroCover)
    return () => setLume(null)
  }, [heroCover])

  const lightUp = useCallback(
    (media: Media | null): void => setLume(media ? media.cover.color : heroCover),
    [heroCover]
  )

  /**
   * Ce que les personnes et studios suivis ont sorti depuis la dernière visite.
   *
   * Demandé une fois à l'ouverture de l'accueil, jamais en boucle : le
   * balayage qui les trouve tourne dans le processus principal toutes les
   * douze heures, la fenêtre ne fait que lire son résultat.
   */
  const [news, setNews] = useState<FollowNews[]>([])
  useEffect(() => {
    let alive = true
    void window.api.follows
      .news()
      .then((rows) => alive && setNews(rows))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])
  const newsTotal = news.reduce((n, row) => n + row.media.length, 0)

  const headline = empty
    ? `${greeting()}.`
    : behindTotal > 0
      ? `${greeting()}, ${plural(behindTotal, 'épisode')} ${behindTotal > 1 ? "t'attendent" : "t'attend"}.`
      : continueList.length > 0
        ? `${greeting()}, tu es à jour.`
        : `${greeting()}.`

  const behindSeries = continueList.filter((m) => (behindOf.get(m.id) ?? 0) > 0)
  const shelf = discoverTab === 'trending' ? trending : season

  return (
    <div className="page">
      <p className="title-xl mb-4 px-1 text-[1.45rem] leading-tight">{headline}</p>

      <div className="page-flow">
        {heroMedia ? (
          <Spotlight media={heroMedia} resumeAt={heroResume} />
        ) : (
          <div className="skeleton span-all mb-9 h-[300px] rounded-[26px]" />
        )}

        {empty && (
          <div className="span-all mb-9">
            <EmptyState
              icon={<Compass size={24} />}
              title="Ta bibliothèque est vide"
              hint="Cherche un anime avec Ctrl+K, ou pioche dans les tendances ci-dessous. Tu peux aussi importer ta liste MyAnimeList depuis les réglages."
              action={
                <div className="mt-1 flex gap-2">
                  <button className="btn btn-primary" onClick={() => navigate({ name: 'discover' })}>
                    Explorer
                  </button>
                  <button className="btn" onClick={() => navigate({ name: 'settings' })}>
                    Importer ma liste
                  </button>
                </div>
              }
            />
          </div>
        )}

        {queue.length > 0 && (
          <Section
            title="À regarder"
            subtitle={`Tes autres séries en cours, de la plus récente à la plus ancienne`}
            action={
              behindSeries.length > 1 ? (
                <button
                  className="chip shrink-0"
                  title="Ouvre une série au hasard parmi celles où des épisodes t'attendent"
                  onClick={() => {
                    // Choisir est un travail aussi : trente-trois séries en
                    // retard, ce sont trente-trois décisions avant de regarder.
                    const pick = behindSeries[Math.floor(Math.random() * behindSeries.length)]
                    navigate({ name: 'anime', id: pick.id })
                  }}
                >
                  <Dices size={13} />
                  Au hasard
                </button>
              ) : undefined
            }
          >
            <ul className="home-queue">
              {shownQueue.map((media) => (
                <SeriesRow key={media.id} media={media} behind={behindOf.get(media.id) ?? 0} onHover={lightUp} />
              ))}
            </ul>
            {queue.length > QUEUE_FOLD && (
              <button className="btn btn-ghost mt-2" onClick={() => setQueueOpen((open) => !open)}>
                {queueOpen ? 'Replier la liste' : `Afficher les ${queue.length - QUEUE_FOLD} autres`}
              </button>
            )}
          </Section>
        )}

        {/* Après la file des séries en cours : celles-ci n'en sont plus, et
            ce qu'on leur demande n'est pas de continuer mais de se refermer. */}
        <Dormant />

        {(upcoming.length > 0 || planWorth) && (
          <section id="semaine" className="span-all mb-9">
            <header className="mb-3.5 flex items-end justify-between gap-4 px-1">
              <div>
                {planWorth ? (
                  <div className="flex items-center gap-3" role="tablist" aria-label="Que montrer de la semaine">
                    <button
                      role="tab"
                      aria-selected={!showPlan}
                      className="home-tab title-xl"
                      onClick={() => setWeekTab('airing')}
                    >
                      Cette semaine
                    </button>
                    <button
                      role="tab"
                      aria-selected={showPlan}
                      className="home-tab title-xl"
                      onClick={() => setWeekTab('plan')}
                    >
                      Rattrapage
                    </button>
                  </div>
                ) : (
                  <h2 className="title-xl text-[1.32rem] leading-tight">Cette semaine</h2>
                )}
                <p className="mt-0.5 text-[0.8rem] text-muted">
                  {showPlan ? planSentence(plan, now) : 'Les prochains épisodes de tes séries, jour par jour'}
                </p>
              </div>
              <button className="btn btn-ghost" onClick={() => navigate({ name: 'calendar' })}>
                Calendrier <ArrowUpRight size={14} />
              </button>
            </header>
            {showPlan ? (
              <PlanGrid plan={plan} now={now} onHover={lightUp} />
            ) : (
              <WeekGrid upcoming={upcoming} now={now} onHover={lightUp} />
            )}
          </section>
        )}

        {!empty && <Soiree />}

        {news.length > 0 && (
          <Section
            title="Chez ceux que tu suis"
            subtitle={
              newsTotal > 1
                ? `${newsTotal} nouveautés depuis ta dernière visite`
                : 'Une nouveauté depuis ta dernière visite'
            }
            action={
              <button
                className="chip shrink-0"
                title="Ne plus les faire remonter ici"
                onClick={() => {
                  // Vidé tout de suite à l'écran : attendre la réponse ferait
                  // rester la rangée une seconde de trop après le clic.
                  setNews([])
                  void window.api.follows.seen()
                }}
              >
                <Check size={13} />
                J’ai vu
              </button>
            }
          >
            <RowScroller>
              {news.flatMap((row) =>
                row.media.map((media, i) => (
                  <MiniCard
                    key={`${row.follow.key}:${media.id}`}
                    id={media.id}
                    title={titleOf(media, lang)}
                    cover={media.cover.large}
                    caption={row.follow.name}
                    index={i}
                  />
                ))
              )}
            </RowScroller>
          </Section>
        )}

        {pinned.length > 0 && (
          <Section
            title="À revoir"
            subtitle="Les épisodes que tu as mis de côté"
            action={
              <button
                className="chip shrink-0"
                title="Tout ce que tu as regardé, avec tes notes"
                onClick={() => navigate({ name: 'journal' })}
              >
                Le journal
              </button>
            }
          >
            <RowScroller>
              {pinned.map((row, i) => (
                <MiniCard
                  key={`${row.ev.animeId}:${row.ev.episode}:${row.ev.pass ?? 0}`}
                  id={row.media.id}
                  title={titleOf(row.media, lang)}
                  cover={row.media.cover.large}
                  caption={`Épisode ${row.ev.episode}`}
                  index={i}
                />
              ))}
            </RowScroller>
          </Section>
        )}

        <section className="span-all mb-9">
          <header className="mb-3.5 flex flex-wrap items-end justify-between gap-3 px-1">
            <div className="flex items-center gap-2" role="tablist" aria-label="Que montrer">
              <button
                role="tab"
                aria-selected={discoverTab === 'trending'}
                className="home-tab title-xl"
                onClick={() => setDiscoverTab('trending')}
              >
                Tendances
              </button>
              <button
                role="tab"
                aria-selected={discoverTab === 'season'}
                className="home-tab title-xl"
                onClick={() => setDiscoverTab('season')}
              >
                Cette saison
              </button>
            </div>
            <button className="btn btn-ghost" onClick={() => navigate({ name: 'discover' })}>
              Tout voir <ArrowUpRight size={14} />
            </button>
          </header>
          {shelf.loading ? (
            <PosterSkeletons />
          ) : shelf.error ? (
            <ErrorBox message={shelf.error} onRetry={shelf.retry} />
          ) : (
            <RowScroller key={discoverTab}>
              {shelf.items.map((media, i) => (
                <AnimeCard key={media.id} media={media} index={i} onHover={lightUp} />
              ))}
            </RowScroller>
          )}
        </section>
      </div>
    </div>
  )
}
