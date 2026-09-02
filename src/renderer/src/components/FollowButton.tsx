/**
 * Suivre une personne ou un studio, depuis sa page.
 *
 * Partagé par les deux pages plutôt que recopié : le geste est le même, et la
 * phrase qui explique ce qu'on vient de déclencher doit l'être aussi. Suivre
 * ne montre rien sur le moment — c'est ce qui rend le message important.
 */

import { useEffect, useState } from 'react'
import { Bell, BellRing } from 'lucide-react'
import type { FollowKind } from '@shared/types'
import { useApp } from '@/store/app'

export function FollowButton({
  kind,
  target,
  name,
  className = 'btn'
}: {
  kind: FollowKind
  /** L'identifiant AniList pour une personne, le nom pour un studio. */
  target: number | string
  name: string
  className?: string
}): React.JSX.Element {
  const toast = useApp((s) => s.toast)
  const key = `${kind}:${target}`
  // `undefined` tant qu'on ne sait pas : le bouton ne doit pas afficher
  // « Suivre » une demi-seconde à quelqu'un qui suit déjà.
  const [following, setFollowing] = useState<boolean | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    void window.api.follows
      .list()
      .then((list) => alive && setFollowing(list.some((f) => f.key === key)))
      .catch(() => alive && setFollowing(false))
    return () => {
      alive = false
    }
  }, [key])

  const toggle = async (): Promise<void> => {
    if (busy || following === undefined) return
    setBusy(true)
    try {
      if (following) {
        await window.api.follows.remove(key)
        setFollowing(false)
        toast(`Tu ne suis plus ${name}.`, 'ok')
      } else {
        const added = await window.api.follows.add(kind, target, name)
        if (!added) {
          toast('AniList ne répond pas pour cette fiche.', 'error')
          return
        }
        setFollowing(true)
        // Dire ce qui va se passer, parce qu'il ne se passe rien tout de suite.
        toast(`Tu suis ${added.name}. Ses prochaines sorties te seront annoncées.`, 'ok')
      }
    } finally {
      setBusy(false)
    }
  }

  if (following === undefined) return <span className={className} style={{ opacity: 0.4 }} />

  return (
    <button
      className={className}
      data-on={following}
      disabled={busy}
      onClick={() => void toggle()}
      title={
        following
          ? 'Ne plus être prévenu de ses nouvelles sorties'
          : 'Être prévenu quand une nouvelle série est annoncée'
      }
    >
      {busy ? <Bell size={14} /> : following ? <BellRing size={14} /> : <Bell size={14} />}
      {following ? 'Suivi' : 'Suivre'}
    </button>
  )
}
