/**
 * Le bas de la barre latérale, entre la navigation et « Ces 7 jours ».
 *
 * Quatre formules au choix (réglage `sidebarWidget`) : « À suivre », les
 * sorties d'aujourd'hui et de demain, les deux ensemble, ou les listes perso.
 *
 * Tout tient dans une colonne de 200 pixels : une ligne par élément, une petite
 * jaquette, le titre coupé plutôt que replié.
 */

import { ListVideo, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { AiringItem, Media, SidebarWidget as Kind } from '@shared/types'
import { Poster } from '@/components/ui'
import { countdown, formatTime, titleOf } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import { nextEpisodeOf, useApp } from '@/store/app'

const DAY_MS = 86_400_000

/** Une ligne : jaquette, titre, et ce qu'il y a à dire en dessous. */
function Row({
  media,
  detail,
  faded = false,
  onClick
}: {
  media: Media
  detail: React.ReactNode
  faded?: boolean
  onClick: () => void
}): React.JSX.Element {
  const lang = useApp((s) => s.prefs.titleLang)
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-1 text-left transition hover:bg-white/6"
      style={faded ? { opacity: 0.55 } : undefined}
    >
      <Poster src={media.cover.large} alt="" className="h-[38px] w-[27px] shrink-0" rounded="rounded-[6px]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.76rem] font-medium leading-tight">{titleOf(media, lang)}</p>
        <p className="mt-0.5 truncate text-[0.68rem] tabular-nums text-faint">{detail}</p>
      </div>
    </button>
  )
}

/**
 * Les séries en cours dont un épisode sorti attend : la dernière regardée
 * d'abord. Un épisode programmé pour jeudi n'est pas « à suivre ».
 */
function NextUp({ limit }: { limit: number }): React.JSX.Element | null {
  const entries = useApp((s) => s.entries)
  const media = useApp((s) => s.media)
  const events = useApp((s) => s.events)
  const watched = useApp((s) => s.watched)
  const navigate = useApp((s) => s.navigate)

  const rows = useMemo(() => {
    const last = new Map<number, number>()
    for (const ev of events) last.set(ev.animeId, Math.max(last.get(ev.animeId) ?? 0, ev.at))
    const state = useApp.getState()
    const out: { media: Media; episode: number; behind: number; at: number }[] = []
    for (const entry of entries.values()) {
      if (entry.status !== 'watching') continue
      const m = media.get(entry.animeId)
      if (!m) continue
      const episode = nextEpisodeOf(state, m.id, m.episodes)
      const aired = m.nextAiring ? m.nextAiring.episode - 1 : (m.episodes ?? Number.MAX_SAFE_INTEGER)
      if (episode === null || episode > aired) continue
      const seen = watched.get(m.id)
      let behind = 0
      if (aired !== Number.MAX_SAFE_INTEGER) for (let n = episode; n <= aired; n += 1) if (!seen?.has(n)) behind += 1
      out.push({ media: m, episode, behind, at: last.get(m.id) ?? entry.updatedAt })
    }
    return out.sort((a, b) => b.at - a.at).slice(0, limit)
  }, [entries, media, events, watched, limit])

  if (!rows.length) return null
  return (
    <section>
      <p className="label mb-1.5 px-1.5">À suivre</p>
      {rows.map(({ media: m, episode, behind }) => (
        <Row
          key={m.id}
          media={m}
          detail={`Ép. ${episode}${behind > 1 ? ` · ${behind} en retard` : ''}`}
          onClick={() => navigate({ name: 'anime', id: m.id })}
        />
      ))}
    </section>
  )
}

/**
 * Les épisodes de ma liste qui sortent aujourd'hui et demain. Ceux déjà sortis
 * restent, estompés : on voit la journée entière d'un coup d'œil. Demain est là
 * parce qu'une journée sans sortie — un samedi sur deux — laisserait sinon une
 * section vide.
 */
function Tonight(): React.JSX.Element | null {
  const entries = useApp((s) => s.entries)
  const media = useApp((s) => s.media)
  const navigate = useApp((s) => s.navigate)
  const now = useNow()

  const dayStart = new Date(now).setHours(0, 0, 0, 0)
  const ids = useMemo(
    () =>
      [...entries.values()]
        .filter((e) => e.status === 'watching' || e.status === 'planned')
        .map((e) => e.animeId)
        .slice(0, 200),
    [entries]
  )
  const key = `${dayStart}|${ids.join()}`
  const [held, setHeld] = useState<{ key: string; items: AiringItem[] }>({ key: '', items: [] })

  useEffect(() => {
    if (!ids.length) return
    let alive = true
    window.api.anime
      .airing(ids, Math.floor(dayStart / 1000), Math.floor((dayStart + 2 * DAY_MS) / 1000))
      .then((items) => alive && setHeld({ key, items }))
      // Sans réponse, la section se tait : ce n'est qu'un aperçu du calendrier.
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [key, ids, dayStart])

  if (held.key !== key) return null
  const rows = held.items
    .map((item) => ({ item, media: media.get(item.mediaId) }))
    .filter((r): r is { item: AiringItem; media: Media } => !!r.media)
    .sort((a, b) => a.item.airingAt - b.item.airingAt)
    .slice(0, 6)
  const tomorrow = dayStart + DAY_MS
  const days = [
    { label: 'Aujourd’hui', rows: rows.filter((r) => r.item.airingAt * 1000 < tomorrow) },
    { label: 'Demain', rows: rows.filter((r) => r.item.airingAt * 1000 >= tomorrow) }
  ].filter((d) => d.rows.length > 0)

  if (!days.length) {
    return (
      <section>
        <p className="label mb-1.5 px-1.5">Aujourd’hui</p>
        <p className="px-1.5 text-[0.72rem] text-faint">Rien ne sort aujourd’hui ni demain dans ta liste.</p>
      </section>
    )
  }
  return (
    <>
      {days.map((day) => (
        <section key={day.label}>
          <p className="label mb-1.5 px-1.5">{day.label}</p>
          {day.rows.map(({ item, media: m }) => {
            const aired = item.airingAt * 1000 <= now
            return (
              <Row
                key={`${m.id}-${item.episode}`}
                media={m}
                faded={aired}
                detail={`${formatTime(item.airingAt * 1000)} · ép. ${item.episode}${aired ? ' · sorti' : day.label === 'Demain' ? '' : ` · ${countdown(item.airingAt)}`}`}
                onClick={() => navigate({ name: 'anime', id: m.id })}
              />
            )
          })}
        </section>
      ))}
    </>
  )
}

/** Les listes perso, comme les playlists d'un lecteur de musique. */
function Lists(): React.JSX.Element {
  const lists = useApp((s) => s.lists)
  const navigate = useApp((s) => s.navigate)
  return (
    <section>
      <p className="label mb-1.5 px-1.5">Mes listes</p>
      {lists.map((list) => (
        <button
          key={list.id}
          onClick={() => navigate({ name: 'library', list: list.id })}
          className="flex h-[34px] w-full items-center gap-2.5 rounded-[10px] px-2 text-left text-[0.8rem] transition hover:bg-white/6"
          style={{ color: 'var(--color-muted)' }}
        >
          {list.emoji ? (
            <span className="w-[15px] shrink-0 text-center text-[0.85rem]">{list.emoji}</span>
          ) : (
            <ListVideo size={15} className="shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate">{list.name}</span>
          <span className="text-[0.7rem] tabular-nums text-faint">{list.animeIds.length}</span>
        </button>
      ))}
      <button
        onClick={() => navigate({ name: 'library' })}
        className="flex h-[34px] w-full items-center gap-2.5 rounded-[10px] px-2 text-left text-[0.8rem] transition hover:bg-white/6"
        style={{ color: 'var(--color-faint)' }}
      >
        <Plus size={15} className="shrink-0" />
        {lists.length ? 'Gérer mes listes' : 'Créer une liste'}
      </button>
    </section>
  )
}

export function SidebarWidget({ kind }: { kind: Kind }): React.JSX.Element | null {
  if (kind === 'none') return null
  return (
    <div className="nav-widget mt-5 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      {kind === 'next' && <NextUp limit={4} />}
      {kind === 'tonight' && <Tonight />}
      {kind === 'both' && (
        <>
          <NextUp limit={2} />
          <Tonight />
        </>
      )}
      {kind === 'lists' && <Lists />}
    </div>
  )
}
