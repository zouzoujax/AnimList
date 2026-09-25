import { CloudOff, Hourglass, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ApiStatus } from '@shared/types'
import { ageLabel } from '@shared/api-recovery'
import { useNow } from '@/lib/hooks'

/** « 12 min », « 40 s » : ce qu'il reste avant que le catalogue réponde. */
function remaining(until: number, now: number): string {
  const s = Math.max(0, Math.round((until - now) / 1000))
  return s >= 90 ? `${Math.round(s / 60)} min` : `${s} s`
}

/**
 * Le témoin du catalogue AniList, dans la barre de titre.
 *
 * Invisible tant que tout va bien. Sinon il dit ce qui se passe, depuis quand
 * date ce qu'on a sous les yeux, et quand ça reprend ; son infobulle rappelle
 * ce qui marche encore : une panne de leur côté ne doit pas se lire comme une
 * app cassée du nôtre.
 *
 * Un clic réessaie tout de suite, sans attendre la sonde : c'est le geste de
 * quelqu'un qui vient de rebrancher sa box.
 */
export function ApiStatusBadge(): React.JSX.Element | null {
  const [status, setStatus] = useState<ApiStatus>({ state: 'ok' })
  const [online, setOnline] = useState(() => navigator.onLine)
  const [trying, setTrying] = useState(false)
  // Toutes les secondes seulement quand un compte à rebours s'affiche.
  const counting = status.state !== 'ok'
  const now = useNow(counting ? 1000 : 60_000)

  useEffect(() => {
    void window.api.anilist.status().then(setStatus)
    const off = window.api.anilist.onStatus(setStatus)
    const up = (): void => {
      setOnline(true)
      // Le réseau revient : inutile d'attendre la sonde pour le vérifier.
      void window.api.anilist.probe().then(setStatus)
    }
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

  // Ce qu'on a sous les yeux, et ce qui se rattrapera : les deux questions
  // qu'on se pose devant une page servie hors ligne.
  const lines = [hint]
  if (status.staleAt) {
    const age = ageLabel(status.staleAt, now)
    label += age.startsWith('il y a') ? ` · données d’${age}` : ' · données récentes'
    lines.push(
      `Les pages du catalogue montrent leur dernière version enregistrée, la plus ancienne ${ageLabel(status.staleAt, now)}.`
    )
  }
  if (status.pending) {
    lines.push(
      status.pending > 1
        ? `${status.pending} pages se remettront à jour d’elles-mêmes au retour d’AniList.`
        : 'Une page se remettra à jour d’elle-même au retour d’AniList.'
    )
  }
  if (status.probeAt && status.probeAt > now && status.state === 'offline') {
    lines.push(`Prochain essai dans ${remaining(status.probeAt, now)}.`)
  }
  lines.push('Clique pour réessayer maintenant.')

  const Icon = trying ? RefreshCw : status.state === 'throttled' && online ? Hourglass : CloudOff
  return (
    <button
      type="button"
      role="status"
      title={lines.join('\n')}
      disabled={trying}
      onClick={() => {
        setTrying(true)
        void window.api.anilist
          .probe()
          .then(setStatus)
          .finally(() => setTrying(false))
      }}
      className="no-drag flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[0.72rem] font-medium text-muted"
      style={{ borderColor: 'color-mix(in oklab, #ffb038 45%, var(--line))', background: 'rgba(255,176,56,.1)' }}
    >
      <Icon size={13} className={trying ? 'animate-spin' : undefined} style={{ color: '#ffb038' }} />
      {label}
    </button>
  )
}
