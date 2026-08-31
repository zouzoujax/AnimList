import { ArrowUpRight, Clock, Compass, Play, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { Media } from '@shared/types'
import { AnimeCard, ContinueCard } from '@/components/AnimeCard'
import { EmptyState, ErrorBox, PosterSkeletons, Poster, RowScroller, Section } from '@/components/ui'
import { rgba, toneAccent } from '@/lib/color'
import { airingLabel, countdown, isUnaired, relativeDay, titleOf } from '@/lib/format'
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
      className="spotlight span-all relative mb-9 overflow-hidden rounded-[26px]"
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
          <p className="label mb-2" style={{ color: rgba(glow, 1) }}>
            {resumeAt ? (pending ? 'En attente' : 'Reprendre') : 'À la une'}
          </p>
          <h1 className="title-xl clamp-2 max-w-2xl text-[2.1rem] leading-[1.08]">{titleOf(media, lang)}</h1>

          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[0.76rem] text-muted">
            {[
              media.averageScore !== null ? (
                <span className="font-semibold" style={{ color: rgba(glow, 1) }}>
                  {media.averageScore}% d'appréciation
                </span>
              ) : null,
              media.studios[0] ? <span>{media.studios[0]}</span> : null,
              media.episodes ? <span>{media.episodes} épisodes</span> : null,
              media.seasonYear ? <span>{media.seasonYear}</span> : null
            ]
              .filter((node): node is React.JSX.Element => node !== null)
              .map((node, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-faint">·</span>}
                  {node}
                </span>
              ))}
          </div>

          {media.description && (
            <p className="clamp-2 mt-3 max-w-2xl text-[0.85rem] leading-relaxed text-muted">{media.description}</p>
          )}

          <div className="mt-5 flex flex-wrap gap-2.5">
            {pending && media.nextAiring ? (
              <span
                className="btn !cursor-default"
                style={{ background: rgba(glow, 0.16), borderColor: rgba(glow, 0.4), color: rgba(glow, 1) }}
              >
                <Clock size={14} />
                Prochain épisode {media.nextAiring.episode} · {airingLabel(media.nextAiring.airingAt)}
              </span>
            ) : resumeAt ? (
              <button
                className="btn btn-primary"
                onClick={async () => {
                  await toggleEpisode(media.id, resumeAt)
                  toast(`Épisode ${resumeAt} coché · ${titleOf(media, lang)}`)
                }}
              >
                <Play size={14} fill="currentColor" strokeWidth={0} />
                Marquer l'épisode {resumeAt}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => navigate({ name: 'anime', id: media.id })}>
                <Sparkles size={14} />
                Découvrir
              </button>
            )}
            <button className="btn" onClick={() => navigate({ name: 'anime', id: media.id })}>
              Voir la fiche
              <ArrowUpRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function UpcomingCard({
  media,
  index,
  onHover
}: {
  media: Media
  index: number
  onHover: (media: Media | null) => void
}): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const glow = toneAccent(media.cover.color)
  const airing = media.nextAiring!

  return (
    <motion.button
      onClick={() => navigate({ name: 'anime', id: media.id })}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      whileHover={{ y: -4 }}
      onMouseEnter={() => onHover(media)}
      onMouseLeave={() => onHover(null)}
      className="glass flex w-[268px] shrink-0 items-center gap-3 rounded-[16px] p-2.5 text-left"
    >
      <Poster src={media.cover.large} alt="" className="h-[68px] w-[46px] shrink-0" rounded="rounded-[10px]" />
      <div className="min-w-0 flex-1">
        <p className="label !text-[0.62rem]" style={{ color: rgba(glow, 1) }}>
          {relativeDay(airing.airingAt * 1000)}
        </p>
        <p className="clamp-2 mt-0.5 text-[0.79rem] font-semibold leading-snug">{titleOf(media, lang)}</p>
        <p className="mt-1 text-[0.7rem] text-faint">
          Épisode {airing.episode} · {countdown(airing.airingAt)}
        </p>
      </div>
    </motion.button>
  )
}

export default function HomePage(): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const entries = useApp((s) => s.entries)
  const mediaMap = useApp((s) => s.media)
  const events = useApp((s) => s.events)
  const watchedMap = useApp((s) => s.watched)
  const state = useApp()
  const refreshed = useRef(false)
  const now = useNow()

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
   * « Bientôt » annonce les épisodes à venir, « Continuer » range les séries en
   * cours par date de dernière séance — mais aucune des deux ne répond à la
   * question qu'on se pose en ouvrant l'app : qu'est-ce qui est sorti et que je
   * n'ai pas vu ?
   *
   * Le retard se compte sur les épisodes **diffusés** : un épisode programmé
   * pour jeudi n'est pas un retard. Les séries encore en diffusion passent
   * devant, ce sont elles qui accumulent pendant qu'on regarde ailleurs.
   */
  const behindList = useMemo(() => {
    const out: { media: Media; behind: number; airing: boolean }[] = []
    for (const entry of entries.values()) {
      if (entry.status !== 'watching') continue
      const media = mediaMap.get(entry.animeId)
      if (!media) continue
      const aired = media.nextAiring ? media.nextAiring.episode - 1 : (media.episodes ?? 0)
      if (aired <= 0) continue
      const seen = watchedMap.get(media.id)
      let behind = 0
      for (let n = 1; n <= aired; n += 1) if (!seen?.has(n)) behind += 1
      if (behind > 0) out.push({ media, behind, airing: media.nextAiring !== null })
    }
    return out.sort((a, b) => Number(b.airing) - Number(a.airing) || b.behind - a.behind).slice(0, 12)
  }, [entries, mediaMap, watchedMap])

  const behindTotal = behindList.reduce((sum, row) => sum + row.behind, 0)

  const continueList = useMemo(() => {
    return [...entries.values()]
      .filter((e) => e.status === 'watching')
      .map((e) => mediaMap.get(e.animeId))
      .filter((m): m is Media => !!m)
      .sort((a, b) => (lastWatchAt.get(b.id) ?? 0) - (lastWatchAt.get(a.id) ?? 0))
  }, [entries, mediaMap, lastWatchAt])

  const upcoming = useMemo(() => {
    const horizon = now / 1000 + 8 * 86_400
    return [...entries.values()]
      .filter((e) => e.status === 'watching' || e.status === 'planned')
      .map((e) => mediaMap.get(e.animeId))
      .filter((m): m is Media => !!m?.nextAiring && m.nextAiring.airingAt < horizon)
      .sort((a, b) => a.nextAiring!.airingAt - b.nextAiring!.airingAt)
      .slice(0, 12)
  }, [entries, mediaMap, now])

  const heroMedia = continueList[0] ?? trending.items[0]
  const heroResume = heroMedia && continueList[0] ? nextEpisodeOf(state, heroMedia.id, heroMedia.episodes) : null
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

  return (
    <div className="page">
      <p className="label mb-1.5">
        {greeting()} · {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

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

        {behindList.length > 0 && (
          <Section
            title="À rattraper"
            subtitle={`${behindTotal} épisode${behindTotal > 1 ? 's' : ''} déjà sorti${behindTotal > 1 ? 's' : ''} que tu n'as pas vu${behindTotal > 1 ? 's' : ''}`}
          >
            <RowScroller>
              {behindList.map((row, i) => (
                <ContinueCard
                  key={row.media.id}
                  media={row.media}
                  index={i}
                  note={`${row.behind} en retard`}
                  onHover={lightUp}
                />
              ))}
            </RowScroller>
          </Section>
        )}

        {continueList.length > 0 && (
          <Section title="Continuer" subtitle={`${continueList.length} séries en cours`}>
            <RowScroller>
              {continueList.map((media, i) => (
                <ContinueCard key={media.id} media={media} index={i} onHover={lightUp} />
              ))}
            </RowScroller>
          </Section>
        )}

        {upcoming.length > 0 && (
          <Section
            title="Bientôt"
            subtitle="Les prochains épisodes de tes séries"
            action={
              <button className="btn btn-ghost" onClick={() => navigate({ name: 'calendar' })}>
                Calendrier <ArrowUpRight size={14} />
              </button>
            }
          >
            <RowScroller>
              {upcoming.map((media, i) => (
                <UpcomingCard key={media.id} media={media} index={i} onHover={lightUp} />
              ))}
            </RowScroller>
          </Section>
        )}

        <Section
          title="Tendances"
          subtitle="Ce que tout le monde regarde en ce moment"
          action={
            <button className="btn btn-ghost" onClick={() => navigate({ name: 'discover' })}>
              Tout voir <ArrowUpRight size={14} />
            </button>
          }
        >
          {trending.loading ? (
            <PosterSkeletons />
          ) : trending.error ? (
            <ErrorBox message={trending.error} onRetry={trending.retry} />
          ) : (
            <RowScroller>
              {trending.items.map((media, i) => (
                <AnimeCard key={media.id} media={media} index={i} onHover={lightUp} />
              ))}
            </RowScroller>
          )}
        </Section>

        <Section title="La saison en cours" subtitle="Les sorties du moment">
          {season.loading ? (
            <PosterSkeletons />
          ) : season.error ? (
            <ErrorBox message={season.error} onRetry={season.retry} />
          ) : (
            <RowScroller>
              {season.items.map((media, i) => (
                <AnimeCard key={media.id} media={media} index={i} onHover={lightUp} />
              ))}
            </RowScroller>
          )}
        </Section>
      </div>
    </div>
  )
}
