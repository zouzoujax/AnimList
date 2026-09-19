import { CloudOff, Hourglass } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ApiStatus } from '@shared/types'
import { useNow } from '@/lib/hooks'

/** « 12 min », « 40 s » : ce qu'il reste avant que le catalogue réponde. */
function remaining(until: number, now: number): string {
  const s = Math.max(0, Math.round((until - now) / 1000))
  return s >= 90 ? `${Math.round(s / 60)} min` : `${s} s`
}

/**
 * Le témoin du catalogue AniList, dans la barre de titre.
 *
 * Invisible tant que tout va bien. Sinon il dit ce qui se passe et quand ça
 * reprend, et son infobulle rappelle ce qui marche encore : une panne de leur
 * côté ne doit pas se lire comme une app cassée du nôtre.
 */
export function ApiStatusBadge(): React.JSX.Element | null {
  const [status, setStatus] = useState<ApiStatus>({ state: 'ok' })
  const [online, setOnline] = useState(() => navigator.onLine)
  // Toutes les secondes seulement quand un compte à rebours s'affiche.
  const counting = status.state === 'paused' || status.state === 'throttled'
  const now = useNow(counting ? 1000 : 60_000)

  useEffect(() => {
    void window.api.anilist.status().then(setStatus)
    const off = window.api.anilist.onStatus(setStatus)
    const up = (): void => setOnline(true)
    const down = (): void => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      off()
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  const expired = status.until !== undefined && status.until <= now
  let label: string | null = null
  let hint = ''
  if (!online || status.state === 'offline') {
    label = 'Hors ligne'
    hint = 'Le catalogue AniList est injoignable. Ta bibliothèque, tes épisodes et tes statistiques restent là.'
  } else if (status.state === 'paused' && status.until && !expired) {
    label = `AniList en pause · ${remaining(status.until, now)}`
    hint = `${status.message ?? 'AniList ne répond plus.'} Nouvel essai dans ${remaining(status.until, now)}.`
  } else if (status.state === 'throttled' && status.until && !expired) {
    label = `AniList ralentit · ${remaining(status.until, now)}`
    hint =
      'Trop de demandes en peu de temps : AniList en accepte une trentaine par minute. Les pages en attente se rempliront toutes seules.'
  }
  if (!label) return null

  const Icon = status.state === 'throttled' && online ? Hourglass : CloudOff
  return (
    <span
      role="status"
      title={hint}
      className="no-drag flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[0.72rem] font-medium text-muted"
      style={{ borderColor: 'color-mix(in oklab, #ffb038 45%, var(--line))', background: 'rgba(255,176,56,.1)' }}
    >
      <Icon size={13} style={{ color: '#ffb038' }} />
      {label}
    </span>
  )
}
