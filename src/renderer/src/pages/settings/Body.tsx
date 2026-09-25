/**
 * Le contenu des Réglages : onze sections, et tout ce qui les fait marcher.
 *
 * À part de la page pour une raison de taille : mille trois cents lignes de
 * réglages et de mise en page dans le même fichier, c'est ce qu'était cette
 * page avant, et on n'y retrouvait plus rien. Ici les réglages ; dans
 * `pages/Settings.tsx`, le titre, la recherche et le sommaire.
 */

import { humanMessage } from '@shared/api-outage'
import {
  AtSign,
  Bell,
  CalendarPlus,
  Smartphone,
  Languages as LanguagesIcon,
  BellOff,
  BellRing,
  Database,
  FileDown,
  FileUp,
  FolderOpen,
  Keyboard,
  MessageCircle,
  Stethoscope,
  HardDrive,
  History,
  Languages,
  Layers,
  Palette,
  ShieldCheck,
  PlayCircle,
  Sparkles,
  Trash2,
  Upload,
  X,
  Zap
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import {
  DEFAULT_PREFS,
  LAYOUTS,
  NEW_DESIGN_PAGES,
  THEMES,
  accentFor,
  type Follow,
  type ImportReport,
  type LayoutId,
  type BackupStatus,
  type RemoteStatus,
  type TitleLang
} from '@shared/types'
import { looksLikeAppId, type DiscordStatus } from '@shared/discord'
import { checkChosen } from '@shared/remote'
import { Modal } from '@/components/ui'
import QrCode from '@/components/QrCode'
import TvTimeImport from '@/components/TvTimeImport'
import UpdatePanel from '@/components/UpdatePanel'
import { ACCENT_PRESETS } from '@/lib/color'
import { minutesToHuman, pluralize, relativeDay } from '@/lib/format'
import Health from '@/components/Health'
import RestoreBackup from '@/components/RestoreBackup'
import { SETTINGS_SECTIONS, type SettingsSection } from '@/lib/settings-sections'
import { useApp } from '@/store/app'

/**
 * Une section : son nom en grand, et rien autour.
 *
 * La page posait autrefois chaque section dans une carte de verre, avec son
 * icône en couleur et un titre de la taille d'une ligne. Onze boîtes les unes
 * sous les autres, toutes de la même importance. Désormais la section s'annonce
 * comme un chapitre — un titre qu'on lit de loin, un trait, puis les réglages
 * — et son icône passe en gris : elle accompagne le titre au lieu de le
 * concurrencer, la navigation étant l'affaire du sommaire.
 */
function Card({
  id,
  title,
  icon,
  children
}: {
  id: SettingsSection
  title: string
  icon: ReactNode
  children: ReactNode
}): React.JSX.Element {
  const keywords = SETTINGS_SECTIONS.find((section) => section.id === id)?.keywords ?? ''
  return (
    <section
      id={`reglages-${id}`}
      data-settings-section={id}
      data-keywords={`${title} ${keywords}`}
      className="nd-set-section"
    >
      <h2 className="title-xl text-[1.32rem] leading-tight">
        <span className="nd-set-icon" aria-hidden>
          {icon}
        </span>
        {title}
      </h2>
      <div className="mt-3.5">{children}</div>
    </section>
  )
}

/** Un réglage : ce qu'il fait à gauche en une phrase, de quoi le changer à droite. */
function Row({
  label,
  hint,
  badge,
  children
}: {
  label: string
  hint?: string
  /** « WIP » et compagnie : dire qu'un réglage n'est pas encore stabilisé. */
  badge?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <div data-settings-row className="nd-set-row">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[0.88rem] font-semibold">
          {label}
          {badge && <span className="nd-set-badge">{badge}</span>}
        </p>
        {hint && <p className="mt-1 max-w-[62ch] text-[0.78rem] leading-relaxed text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** L'interrupteur : un trait qui se remplit, sans halo ni dégradé. */
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): React.JSX.Element {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className="nd-switch" data-on={on}>
      <span />
    </button>
  )
}

/** Tiny wireframe so the option is legible without trying it. */
function LayoutPreview({ id }: { id: LayoutId }): React.JSX.Element {
  const bar = 'rgba(127,127,127,.55)'
  const block = 'rgba(127,127,127,.28)'
  const nav = { background: bar }
  const cell = { background: block, borderRadius: 2 }

  return (
    <span
      className="flex h-11 w-full gap-1 overflow-hidden rounded-[8px] p-1"
      style={{ border: '1px solid var(--line)', background: 'rgba(127,127,127,.08)' }}
    >
      {id !== 'topbar' && (
        <span className="h-full shrink-0 rounded-[2px]" style={{ ...nav, width: id === 'rail' ? 4 : 11 }} />
      )}
      <span className="flex h-full flex-1 flex-col gap-1">
        {id === 'topbar' && <span className="h-1 w-full shrink-0 rounded-[2px]" style={nav} />}
        {id === 'dashboard' ? (
          <span className="grid h-full grid-cols-2 grid-rows-2 gap-1">
            <span style={cell} />
            <span style={cell} />
            <span style={cell} />
            <span style={cell} />
          </span>
        ) : (
          <span className="flex h-full flex-col gap-1">
            <span className="flex-[1.6]" style={cell} />
            <span className="flex-1" style={cell} />
            <span className="flex-1" style={cell} />
          </span>
        )}
      </span>
    </span>
  )
}

/**
 * Le cache AniList, dit et purgeable.
 *
 * Il s'auto-limite désormais, mais le voir grossir sans jamais pouvoir le
 * regarder était une boîte noire de plus. Le vider ne perd rien : tout se
 * retélécharge à la demande.
 */
function CacheRow(): React.JSX.Element {
  const [stats, setStats] = useState<{ entries: number; bytes: number } | null>(null)
  const toast = useApp((s) => s.toast)

  useEffect(() => {
    let alive = true
    void window.api.cache.stats().then((next) => alive && setStats(next))
    return () => {
      alive = false
    }
  }, [])

  const weight = stats ? `${(stats.bytes / 1048576).toFixed(1).replace('.', ',')} Mo` : '—'
  const hint = stats
    ? `${stats.entries} réponses d'AniList gardées hors ligne, ${weight}. Les plus vieilles partent d'elles-mêmes.`
    : 'Lecture…'

  return (
    <Row label="Cache des données" hint={hint}>
      <button
        className="btn"
        disabled={!stats || stats.entries === 0}
        onClick={() => {
          void window.api.cache.purge().then(async () => {
            setStats(await window.api.cache.stats())
            toast('Cache vidé. Tout se retéléchargera à la demande.', 'ok')
          })
        }}
      >
        <Trash2 size={14} />
        Vider
      </button>
    </Row>
  )
}

/**
 * La sauvegarde automatique : le dossier, la dernière copie, et de quoi en
 * forcer une.
 *
 * Une ligne plutôt qu'un interrupteur : il n'y a rien à allumer, seulement un
 * dossier à désigner. Tant qu'il n'y en a pas, la ligne le dit — c'est la
 * seule façon de découvrir que la protection n'existe pas encore.
 */
function BackupRow(): React.JSX.Element {
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const toast = useApp((s) => s.toast)

  useEffect(() => {
    let alive = true
    void window.api.backup.status().then((next) => alive && setStatus(next))
    return () => {
      alive = false
    }
  }, [])

  const run = (action: () => Promise<BackupStatus>, done: string): void => {
    setBusy(true)
    void action()
      .then((next) => {
        setStatus(next)
        if (next.error) toast(next.error, 'error')
        else if (next.folder) toast(done, 'ok')
      })
      .finally(() => setBusy(false))
  }

  const hint = !status
    ? 'Lecture…'
    : status.error
      ? status.error
      : !status.folder
        ? 'Aucun dossier choisi : la bibliothèque n’a aucune copie hors du dossier de données.'
        : status.lastAt
          ? `Dernière sauvegarde ${relativeDay(status.lastAt).toLowerCase()} · ${pluralize(status.count, 'copie gardée', 'copies gardées')} dans ${status.folder}`
          : `Aucune copie encore dans ${status.folder}.`

  return (
    <Row label="Sauvegarde automatique" hint={hint}>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {status?.folder && (
          <>
            <button className="btn" disabled={busy} onClick={() => window.api.backup.reveal()}>
              <FolderOpen size={14} />
              Ouvrir
            </button>
            {status.count > 0 && (
              <button
                className="btn"
                disabled={busy}
                title="Choisir une copie, voir ce qui changerait, puis restaurer"
                onClick={() => setRestoring(true)}
              >
                <History size={14} />
                Restaurer…
              </button>
            )}
            <button
              className="btn"
              disabled={busy}
              onClick={() => run(() => window.api.backup.now(), 'Sauvegarde écrite.')}
            >
              {busy ? 'Copie…' : 'Sauvegarder'}
            </button>
          </>
        )}
        <button
          className={status?.folder ? 'btn' : 'btn btn-primary'}
          disabled={busy}
          onClick={() => run(() => window.api.backup.choose(), 'Dossier choisi, première copie écrite.')}
        >
          <ShieldCheck size={14} />
          {status?.folder ? 'Changer' : 'Choisir un dossier'}
        </button>
        {status?.folder && (
          <button
            className="btn"
            disabled={busy}
            title="Ne plus sauvegarder automatiquement. Les copies déjà écrites restent."
            onClick={() => run(() => window.api.backup.forget(), 'Sauvegarde automatique arrêtée.')}
          >
            <X size={14} />
          </button>
        )}
      </div>
      <RestoreBackup
        open={restoring}
        onClose={() => setRestoring(false)}
        onDone={() => void window.api.backup.status().then(setStatus)}
      />
    </Row>
  )
}

export default function SettingsBody(): React.JSX.Element {
  const prefs = useApp((s) => s.prefs)
  const setHelp = useApp((s) => s.setHelp)
  const [healthOpen, setHealthOpen] = useState(false)
  const setPrefs = useApp((s) => s.setPrefs)
  const toast = useApp((s) => s.toast)
  const entries = useApp((s) => s.entries)
  const events = useApp((s) => s.events)

  const [info, setInfo] = useState<Awaited<ReturnType<typeof window.api.app.info>> | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [follows, setFollows] = useState<Follow[]>([])
  const [handle, setHandle] = useState('')
  const [remote, setRemote] = useState<RemoteStatus | null>(null)
  /**
   * Le mot de passe en cours de frappe.
   *
   * À part des préférences tant qu'on tape : l'enregistrer à chaque touche
   * validerait « m », puis « mo », puis « mot » — trois refus pour un mot de
   * passe qu'on est en train d'écrire. Il part quand on quitte le champ.
   */
  const [password, setPassword] = useState(prefs.remotePassword)
  const [discord, setDiscord] = useState<DiscordStatus | null>(null)
  /**
   * L'état réel du statut, relu tant que la carte est ouverte.
   *
   * Il ne dépend pas que de nous : Discord peut être fermé, ou se fermer
   * pendant qu'on regarde l'écran. Une seule lecture au montage afficherait
   * un état périmé sans jamais se corriger.
   */
  useEffect(() => {
    if (!prefs.discord) return
    let alive = true
    const read = (): void => {
      void window.api.discord
        .status()
        .then((next) => alive && setDiscord(next))
        .catch(() => undefined)
    }
    read()
    const timer = setInterval(read, 3000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [prefs.discord, prefs.discordAppId])

  useEffect(() => {
    let alive = true
    void window.api.remote
      .status()
      .then((next) => alive && setRemote(next))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    void window.api.follows
      .list()
      .then((list) => alive && setFollows(list))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    void window.api.app.info().then(setInfo)
  }, [])

  /**
   * Enregistre le mot de passe choisi, quand on quitte le champ.
   *
   * Le serveur porte le sien depuis son allumage : changer la préférence ne
   * suffit pas, il faut le rallumer. On le fait tout de suite plutôt que de
   * laisser affiché un réglage qui n'est pas celui qui protège — et on dit que
   * le lien a changé, parce que le téléphone déjà connecté vient d'être
   * déconnecté.
   */
  async function applyPassword(): Promise<void> {
    const typed = password.trim()
    if (typed === prefs.remotePassword) {
      // Les espaces autour, eux, n'ont pas à rester dans le champ.
      setPassword(typed)
      return
    }

    let chosen = ''
    if (typed) {
      const checked = checkChosen(typed)
      if (!checked.ok) {
        toast(checked.error, 'error')
        setPassword(prefs.remotePassword)
        return
      }
      chosen = checked.token
    }

    // Attendu, pas lancé : c'est le processus principal qui relit la
    // préférence en rallumant, et il la lirait encore vide.
    await setPrefs({ remotePassword: chosen })
    setPassword(chosen)

    const kept = chosen ? 'Mot de passe enregistré.' : 'Mot de passe effacé : il sera de nouveau tiré au hasard.'
    if (!remote?.on) {
      toast(`${kept} Il servira au prochain allumage.`, 'ok')
      return
    }

    await window.api.remote.stop()
    const next = await window.api.remote.start()
    setRemote(next)
    if (next.error) toast(next.error, 'error')
    else toast(`${kept} Le lien a changé : rescanne le QR code.`, 'ok')
  }

  const media = useApp((s) => s.media)
  const muted = [...entries.values()].filter((e) => e.notify === false)
  const mutedNames = muted
    .map((e) => media.get(e.animeId)?.title.romaji ?? `#${e.animeId}`)
    .slice(0, 4)
    .join(', ')

  const run = async (id: string, action: () => Promise<ImportReport>): Promise<void> => {
    setBusy(id)
    try {
      const report = await action()
      if (report.message) toast(report.message, report.ok ? 'ok' : 'info')
    } catch (err) {
      toast(humanMessage((err as Error).message), 'error')
    } finally {
      setBusy(null)
    }
  }

  /**
   * Ce que la carte Discord dit d'elle-même.
   *
   * Trois causes possibles derrière « rien ne s'affiche », et elles ne se
   * corrigent pas au même endroit : un identifiant mal collé, Discord fermé,
   * ou simplement rien en cours de lecture. Le message les sépare.
   */
  const badId = prefs.discord && !looksLikeAppId(prefs.discordAppId)
  const discordNote = badId
    ? 'Cet identifiant n’en est pas un : dix-sept à vingt chiffres, sans espace.'
    : discord?.connected
      ? 'Relié à Discord. Le statut apparaît dès qu’un épisode ou une bande-annonce démarre, et disparaît à la fermeture du lecteur.'
      : (discord?.error ?? 'Recherche de Discord sur ce PC…')
  const discordTone = badId || (discord?.error && !discord.connected) ? '#ff8f8f' : 'var(--color-muted)'

  return (
    <>
      <Card id="apparence" title="Apparence" icon={<Palette size={17} />}>
        <div
          data-settings-row
          className="border-t py-3 first:border-t-0 first:pt-0"
          style={{ borderColor: 'var(--line)' }}
        >
          <p className="text-[0.85rem] font-medium">Thème</p>
          <p className="mt-0.5 text-[0.74rem] text-faint">
            Change toute l'interface : couleurs, typographie, arrondis, effets de fond.
          </p>
          {[
            { key: 'themes', title: '', hint: '', items: THEMES.filter((t) => !t.experience) },
            {
              key: 'experiences',
              title: 'Expériences',
              hint: 'Une autre app : navigation, accueil, bibliothèque et transitions refaits',
              items: THEMES.filter((t) => t.experience)
            }
          ].map((group) => (
            <div key={group.key} className={group.title ? 'mt-5' : undefined}>
              {group.title && (
                <>
                  <p className="label">{group.title}</p>
                  <p className="mt-0.5 text-[0.7rem] text-faint">{group.hint}</p>
                </>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {group.items.map((theme) => {
                  const active = prefs.theme === theme.id
                  return (
                    <button
                      key={theme.id}
                      onClick={() => setPrefs({ theme: theme.id, accent: theme.accent ?? DEFAULT_PREFS.accent })}
                      className="rounded-[14px] border p-2.5 text-left transition"
                      style={{
                        borderColor: active ? 'color-mix(in oklab, var(--accent) 55%, transparent)' : 'var(--line)',
                        background: active ? 'color-mix(in oklab, var(--accent) 12%, transparent)' : 'var(--panel)'
                      }}
                    >
                      <span
                        className="mb-2 flex h-10 w-full overflow-hidden rounded-[9px]"
                        style={{ border: '1px solid var(--line)' }}
                      >
                        <span className="h-full flex-1" style={{ background: theme.swatch[0] }} />
                        <span className="h-full w-1/3" style={{ background: theme.swatch[1] }} />
                      </span>
                      <span className="block text-[0.8rem] font-semibold">{theme.name}</span>
                      <span className="mt-0.5 block text-[0.68rem] leading-snug text-faint">{theme.hint}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div data-settings-row className="border-t py-3" style={{ borderColor: 'var(--line)' }}>
          <p className="text-[0.85rem] font-medium">Disposition</p>
          <p className="mt-0.5 text-[0.74rem] text-faint">
            Déplace la navigation et recompose les pages. Indépendant du thème.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {LAYOUTS.map((layout) => {
              const active = prefs.layout === layout.id
              return (
                <button
                  key={layout.id}
                  onClick={() => setPrefs({ layout: layout.id })}
                  className="rounded-[14px] border p-2.5 text-left transition"
                  style={{
                    borderColor: active ? 'color-mix(in oklab, var(--accent) 55%, transparent)' : 'var(--line)',
                    background: active ? 'color-mix(in oklab, var(--accent) 12%, transparent)' : 'var(--panel)'
                  }}
                >
                  <LayoutPreview id={layout.id} />
                  <span className="mt-2 block text-[0.8rem] font-semibold">{layout.name}</span>
                  <span className="mt-0.5 block text-[0.68rem] leading-snug text-faint">{layout.hint}</span>
                </button>
              )
            })}
          </div>
        </div>

        <Row label="Couleur d'accent" hint="Toute l'interface s'accorde à cette teinte.">
          <div className="flex items-center gap-1.5">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setPrefs({ accent: preset.value })}
                title={preset.name}
                className="h-7 w-7 rounded-full transition-transform hover:scale-110"
                style={{
                  background: preset.value,
                  outline: prefs.accent === preset.value ? '2px solid #fff' : '1px solid rgba(255,255,255,.2)',
                  outlineOffset: 2
                }}
              />
            ))}
            <label
              className="ml-1 grid h-7 w-7 cursor-pointer place-items-center rounded-full"
              style={{ background: 'rgba(255,255,255,.08)' }}
              title="Couleur personnalisée"
            >
              <Sparkles size={13} />
              <input
                type="color"
                value={prefs.accent}
                onChange={(e) => setPrefs({ accent: e.target.value })}
                className="absolute h-0 w-0 opacity-0"
              />
            </label>
            {/* Chaque thème a sa couleur de départ : on peut toujours y revenir. */}
            <button
              className="btn ml-2 !h-7 !px-2.5 !text-[0.72rem]"
              disabled={prefs.accent.toLowerCase() === accentFor(prefs.theme).toLowerCase()}
              onClick={() => setPrefs({ accent: accentFor(prefs.theme) })}
              title="Revenir à la couleur par défaut du thème"
            >
              <span className="h-3 w-3 rounded-full" style={{ background: accentFor(prefs.theme) }} />
              Couleur du thème
            </button>
          </div>
        </Row>

        <Row label="Transparence Mica" hint="Laisse le fond d'écran Windows 11 transparaître derrière l'app.">
          <Toggle on={prefs.mica} onChange={(mica) => setPrefs({ mica })} />
        </Row>

        <Row label="Réduire les animations" hint="Coupe les transitions et le fond animé.">
          <Toggle on={prefs.reduceMotion} onChange={(reduceMotion) => setPrefs({ reduceMotion })} />
        </Row>

        <Row
          label="Un son quand un badge tombe"
          hint="Trois notes, très courtes, avec le carton qui annonce le badge. Le carton reste si tu coupes le son ; « Réduire les animations » le calme sans le faire taire."
        >
          <Toggle on={prefs.badgeSound} onChange={(badgeSound) => setPrefs({ badgeSound })} />
        </Row>

        <Row
          label="Nouveau design"
          hint="Frise d'épisodes, phrases plutôt qu'étiquettes, une ligne par série. Allumé, tu choisis ci-dessous les pages qui changent. Sans effet dans les expériences, qui ont leurs propres pages."
        >
          <Toggle on={prefs.newDesign} onChange={(newDesign) => setPrefs({ newDesign })} />
        </Row>

        {prefs.newDesign && (
          <div className="mb-1 ml-1 border-l-2 pl-4" style={{ borderColor: 'var(--accent)' }}>
            {NEW_DESIGN_PAGES.map((page) => (
              <Row key={page.id} label={page.label} hint={page.hint}>
                <Toggle
                  on={prefs.newDesignPages?.[page.id] !== false}
                  onChange={(on) => setPrefs({ newDesignPages: { ...prefs.newDesignPages, [page.id]: on } })}
                />
              </Row>
            ))}
          </div>
        )}
      </Card>

      <Card id="affichage" title="Affichage" icon={<Languages size={17} />}>
        <Row label="Langue des titres">
          <div className="flex gap-1.5">
            {(
              [
                ['romaji', 'Rōmaji'],
                ['english', 'Anglais'],
                ['native', '日本語']
              ] as [TitleLang, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                data-on={prefs.titleLang === value}
                className="chip"
                onClick={() => setPrefs({ titleLang: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </Row>

        <Row label="Premier jour de la semaine">
          <div className="flex gap-1.5">
            {(
              [
                [1, 'Lundi'],
                [0, 'Dimanche']
              ] as [0 | 1, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                data-on={prefs.weekStart === value}
                className="chip"
                onClick={() => setPrefs({ weekStart: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </Row>

        <Row label="Durée par défaut d'un épisode" hint="Utilisée quand AniList ne connaît pas la durée.">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={180}
              value={prefs.defaultRuntime}
              onChange={(e) => setPrefs({ defaultRuntime: Math.max(1, Math.min(180, Number(e.target.value) || 24)) })}
              className="field w-[84px] text-center"
            />
            <span className="text-[0.78rem] text-faint">min</span>
          </div>
        </Row>

        <Row label="Afficher le contenu adulte" hint="Inclut les titres classés 18+ dans Découvrir.">
          <Toggle on={prefs.showAdult} onChange={(showAdult) => setPrefs({ showAdult })} />
        </Row>
      </Card>

      <Card id="notifications" title="Notifications" icon={<Bell size={17} />}>
        <Row
          label="Prévenir quand un épisode sort"
          hint="Notification Windows pour les séries en cours ou à voir. Chaque série peut être coupée individuellement depuis sa fiche."
        >
          <Toggle on={prefs.notifications} onChange={(notifications) => setPrefs({ notifications })} />
        </Row>

        <Row
          label="Prévenir à l'avance"
          hint="Ne vaut que pour les épisodes dont AniList connaît l'heure de diffusion ; les autres sont annoncés au rattrapage."
        >
          <select
            className="field !w-[9.5rem]"
            value={prefs.notifyLeadMinutes}
            disabled={!prefs.notifications}
            onChange={(e) => setPrefs({ notifyLeadMinutes: Number(e.target.value) })}
          >
            {[0, 15, 30, 60, 180, 720, 1440].map((minutes) => (
              <option key={minutes} value={minutes} style={{ background: '#0b0e1a' }}>
                {minutes === 0 ? 'À la diffusion' : minutesToHuman(minutes)}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Fréquence de vérification" hint="Plus court = plus réactif, mais plus de requêtes vers AniList.">
          <select
            className="field !w-[9.5rem]"
            value={prefs.notifyEveryMinutes}
            disabled={!prefs.notifications}
            onChange={(e) => setPrefs({ notifyEveryMinutes: Number(e.target.value) })}
          >
            {[5, 15, 30, 60, 180].map((minutes) => (
              <option key={minutes} value={minutes} style={{ background: '#0b0e1a' }}>
                {minutesToHuman(minutes)}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Séries en silence" hint={mutedNames || 'Aucune série coupée pour l’instant.'}>
          <span className="text-[0.8rem] tabular-nums text-muted">{muted.length}</span>
        </Row>
      </Card>

      <Card id="lecture" title="Lecture" icon={<PlayCircle size={17} />}>
        <Row
          label="Cocher l’épisode fini"
          hint="Aux neuf dixièmes de la lecture chez Anime-Sama, l’épisode est marqué vu sans que tu aies à y penser. Ce qui reste après, c’est le générique de fin. Un épisode pas encore diffusé n’est jamais coché."
        >
          <Toggle on={prefs.autoTick} onChange={(autoTick) => setPrefs({ autoTick })} />
        </Row>

        <Row
          label="Enchaîner l’épisode suivant"
          hint="À la fin d’un épisode, le suivant démarre dans la fenêtre déjà ouverte, après huit secondes qu’un bouton « Annuler » suffit à interrompre. Une pause volontaire dans le générique n’enchaîne rien, et une saison finie s’arrête d’elle-même."
        >
          <Toggle on={prefs.autoNext} onChange={(autoNext) => setPrefs({ autoNext })} />
        </Row>

        <Row
          badge="WIP"
          label="Proposer de passer les génériques"
          hint="En chantier. Un bouton dans le coin du lecteur pendant l’opening et le générique de fin, quand un minutage existe. Les minutages viennent d’AniSkip, une base tenue par des bénévoles : environ neuf séries sur dix en ont un, et rien ne s’affiche pour les autres. Un contributeur peut se tromper d’étiquette — sur l’épisode 1 de Naruto, le prologue narré est donné pour un générique."
        >
          <Toggle on={prefs.skipHint} onChange={(skipHint) => setPrefs({ skipHint })} />
        </Row>

        <Row
          badge="WIP"
          label="Les passer sans rien demander"
          hint="Éteint volontairement. Le minutage est relevé par des inconnus, sur une copie qui n’est pas forcément celle que tu regardes : un bouton ignoré ne coûte rien, un saut de travers coupe une scène. L’app refuse déjà de proposer quand la durée de référence s’écarte trop de la tienne."
        >
          <Toggle on={prefs.autoSkip} onChange={(autoSkip) => setPrefs({ autoSkip })} />
        </Row>
      </Card>

      <Card id="suites" title="Suites" icon={<Layers size={17} />}>
        <Row
          label="Ajouter les nouvelles saisons"
          hint="Quand une suite d'une série que tu as regardée sort, elle rejoint ta bibliothèque en « À voir ». Une suite que tu retires n'est jamais remise."
        >
          <Toggle on={prefs.autoSequels} onChange={(autoSequels) => setPrefs({ autoSequels })} />
        </Row>

        <Row
          label="Chercher maintenant"
          hint={
            prefs.lastSequelSweep
              ? `Dernière recherche : ${new Date(prefs.lastSequelSweep).toLocaleString('fr-FR')}`
              : 'Jamais lancée. La recherche automatique tourne une fois par jour.'
          }
        >
          <button
            className="btn"
            disabled={busy === 'sequels'}
            onClick={() =>
              void (async () => {
                setBusy('sequels')
                try {
                  const res = await window.api.anime.sweepSequels()
                  toast(
                    res.added.length
                      ? `${res.added.length} suite${res.added.length > 1 ? 's' : ''} ajoutée${res.added.length > 1 ? 's' : ''} à ta bibliothèque.`
                      : `Aucune nouvelle suite parmi tes ${res.checked} séries suivies.`,
                    'ok'
                  )
                } catch (err) {
                  toast(humanMessage((err as Error).message), 'error')
                } finally {
                  setBusy(null)
                }
              })()
            }
          >
            <Layers size={14} />
            {busy === 'sequels' ? 'Recherche…' : 'Chercher'}
          </button>
        </Row>
      </Card>

      <Card id="telecommande" title="Télécommande" icon={<Smartphone size={17} />}>
        {/* Éteinte à chaque démarrage, jamais retenue : allumer expose la
            bibliothèque à tout ce qui est branché sur la même box, et ça se
            décide à chaque fois plutôt qu'une fois pour toutes. */}
        <Row
          label="Piloter depuis le téléphone"
          hint="Ouvre une petite page sur le réseau local : voir ce qu’il reste à reprendre, cocher un épisode, faire ouvrir une fiche sur le PC. Protégée par un mot de passe, tiré au hasard à chaque allumage tant que tu n’en choisis pas un. Toujours éteinte au démarrage."
        >
          <Toggle
            on={remote?.on ?? false}
            onChange={(on) =>
              void (on ? window.api.remote.start() : window.api.remote.stop()).then((next) => {
                setRemote(next)
                if (on && next.error) toast(next.error, 'error')
              })
            }
          />
        </Row>

        {/* Le mot de passe tiré au hasard est le meilleur des deux, et il
            reste la valeur par défaut. En choisir un se paie d'un secret qui
            dure : c'est dit, et c'est à l'utilisateur de trancher. */}
        <Row
          label="Choisir le mot de passe"
          hint="Laissé vide, il est tiré au hasard à chaque allumage — le plus sûr, mais il faut rescanner le QR code à chaque fois. Rempli, le lien ne change plus et se met en favori sur le téléphone. Au moins 8 caractères, lettres et chiffres."
        >
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => void applyPassword()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              // Échap rend le champ à ce qui est enregistré : on s'est ravisé.
              if (e.key === 'Escape') {
                setPassword(prefs.remotePassword)
                e.currentTarget.blur()
              }
            }}
            placeholder="tiré au hasard"
            className="field !h-[34px] w-[190px]"
            spellCheck={false}
            autoComplete="off"
          />
        </Row>

        {remote?.on && remote.url && (
          <div className="mt-1 flex flex-wrap items-center gap-4 px-1 py-3">
            {/* Scanner évite de recopier vingt caractères à la main sur un
                clavier de téléphone — c'était le seul point pénible. */}
            <QrCode text={remote.url} label="Adresse de la télécommande" />
            <div className="min-w-[200px] flex-1">
              <p className="text-[0.84rem] font-semibold">Scanne depuis ton téléphone</p>
              <p className="mt-1 text-[0.78rem] leading-relaxed text-muted">
                Il doit être sur le même wifi. Le mot de passe est dans le lien : rien d’autre à taper.
              </p>
              <code
                className="mt-2 block break-all rounded-[8px] px-2 py-1.5 text-[0.7rem]"
                style={{ background: 'var(--panel-2)', color: 'var(--color-muted)' }}
              >
                {remote.url}
              </code>
              <button
                className="chip mt-2"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(remote.url as string)
                    .then(() => toast('Adresse copiée.', 'ok'))
                    .catch(() => toast('Copie refusée.', 'error'))
                }
              >
                Copier le lien
              </button>
            </div>
          </div>
        )}

        {/* L'abonnement se prend une fois et travaille tout seul ensuite :
            les sorties de la semaine arrivent dans l'agenda du téléphone sans
            ouvrir le PC, et sans que rien ne quitte le réseau local. */}
        {remote?.on && remote.ics && (
          <div
            className="mt-1 flex flex-wrap items-center gap-4 border-t px-1 py-3"
            style={{ borderColor: 'var(--line)' }}
          >
            <QrCode text={remote.ics} label="Adresse du calendrier" />
            <div className="min-w-[200px] flex-1">
              <p className="text-[0.84rem] font-semibold">Le calendrier dans ton agenda</p>
              <p className="mt-1 text-[0.78rem] leading-relaxed text-muted">
                Un abonnement à cette adresse pose les prochains épisodes de tes séries dans l’agenda du téléphone. Sur
                iPhone : Réglages › Applications › Calendrier › Comptes › Ajouter un compte › Autre › Ajouter un
                calendrier avec abonnement. L’agenda vient chercher le fichier ici, donc il ne se met à jour que sur ton
                réseau, l’app ouverte et la télécommande allumée — un agenda hébergé ailleurs, comme celui de Google, ne
                sait pas joindre une adresse locale.
              </p>
              <code
                className="mt-2 block break-all rounded-[8px] px-2 py-1.5 text-[0.7rem]"
                style={{ background: 'var(--panel-2)', color: 'var(--color-muted)' }}
              >
                {remote.ics}
              </code>
              <button
                className="chip mt-2"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(remote.ics as string)
                    .then(() => toast('Adresse du calendrier copiée.', 'ok'))
                    .catch(() => toast('Copie refusée.', 'error'))
                }
              >
                <CalendarPlus size={13} />
                Copier l’adresse
              </button>
            </div>
          </div>
        )}

        {remote?.error && !remote.on && (
          <p className="px-1 py-2 text-[0.8rem]" style={{ color: '#ff8f8f' }}>
            {remote.error}
          </p>
        )}
      </Card>

      <Card id="discord" title="Statut Discord" icon={<MessageCircle size={17} />}>
        {/* La seule chose de cette app qui sorte du PC d'elle-même : tous ceux
            qui voient ton profil verront le titre. D'où l'extinction par
            défaut, et le mode discret juste en dessous. */}
        <Row
          label="Annoncer ce que je regarde"
          hint="Affiche sur ton profil Discord la série, l’épisode, la jaquette et le temps restant — pendant une lecture seulement, et jamais autrement. Discord doit tourner sur ce PC."
        >
          <Toggle
            on={prefs.discord}
            onChange={(on) => {
              setDiscord(null)
              void setPrefs({ discord: on })
            }}
          />
        </Row>

        {prefs.discord && (
          <>
            <Row
              label="Sans le titre"
              hint="N’annonce que « Un anime » : ni série, ni épisode, ni jaquette, ni horloge. Le fait de regarder, rien d’autre."
            >
              <Toggle on={prefs.discordHideTitle} onChange={(discordHideTitle) => setPrefs({ discordHideTitle })} />
            </Row>

            <Row
              label="Identifiant de l’application"
              hint="Celui qui donne le nom affiché en gros, créé sur discord.com/developers. Celui d’origine convient : il est public par nature, puisqu’il voyage dans le statut."
            >
              <input
                value={prefs.discordAppId}
                onChange={(e) => setPrefs({ discordAppId: e.target.value })}
                placeholder="1544850319878656161"
                className="field !h-[34px] w-[190px]"
                spellCheck={false}
                inputMode="numeric"
              />
            </Row>

            {/* Ce qui est demandé et ce qui est vrai sont deux choses : Discord
                peut être fermé, ou l'identifiant faux. Le dire évite de
                chercher pourquoi rien ne s'affiche. */}
            <p className="px-1 py-2 text-[0.8rem]" style={{ color: discordTone }}>
              {discordNote}
            </p>

            {/* Ce que Discord a réellement reçu. Sans cette ligne, « je ne vois
                rien sur mon profil » n'a pas de réponse : l'app qui n'envoie
                rien et Discord qui n'affiche rien se ressemblent exactement. */}
            {discord?.connected && (
              <div
                className="mt-1 rounded-[10px] px-3 py-2.5 text-[0.78rem] leading-relaxed"
                style={{ background: 'var(--panel-2)' }}
              >
                {discord.showing ? (
                  <>
                    <span className="text-faint">Envoyé à Discord : </span>
                    <span className="font-semibold">{discord.showing}</span>
                  </>
                ) : (
                  <span className="text-muted">
                    Rien en cours de lecture. Lance un épisode : cette ligne dira ce qui part sur ton profil. Si elle se
                    remplit et que Discord n’affiche toujours rien, c’est son réglage «&nbsp;Statut d’activité&nbsp;»
                    qui est en cause, pas l’app.
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </Card>

      <Card id="traduction" title="Traduction" icon={<LanguagesIcon size={17} />}>
        <Row
          label="Résumés et titres d’épisodes en français"
          hint="AniList ne les publie qu’en anglais. Avec une clé, ils sont traduits une fois puis gardés sur ce PC — rien n’est retraduit deux fois."
        >
          <Toggle on={prefs.translate} onChange={(translate) => setPrefs({ translate })} />
        </Row>

        {/* Aucune clé n'est embarquée : en glisser une dans un dépôt public
            reviendrait à l'offrir, et une traduction facturée à quelqu'un
            d'autre n'est pas gratuite pour autant. */}
        <Row
          label="Clé DeepL"
          hint="À créer gratuitement sur deepl.com/pro-api — 500 000 caractères par mois, de quoi traduire des centaines de fiches. Sans clé, les textes restent anglais et le reste de l’app ne change pas."
        >
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <input
              type="password"
              value={prefs.deeplKey}
              onChange={(e) => setPrefs({ deeplKey: e.target.value })}
              placeholder="collée ici"
              className="field !h-[34px] w-[190px]"
              spellCheck={false}
            />
            <button
              className="chip"
              title="Vider les traductions gardées et tout retraduire"
              onClick={() =>
                void window.api.translate
                  .purge()
                  .then((n) => toast(n ? `${n} traductions oubliées.` : 'Rien à oublier.', 'ok'))
              }
            >
              <Trash2 size={12} />
              Vider
            </button>
          </div>
        </Row>
      </Card>

      <Card id="suivis" title="Ce que tu suis" icon={<BellRing size={17} />}>
        {follows.length === 0 ? (
          <p className="px-1 py-2 text-[0.82rem] leading-relaxed text-muted">
            Aucun suivi. Sur la page d’un studio ou d’un doubleur, « Suivre » te fera prévenir de ses prochaines sorties
            — et elles remonteront sur l’accueil.
          </p>
        ) : (
          <div className="mb-3 flex flex-col gap-1.5">
            {follows.map((follow) => (
              <div key={follow.key} className="glass flex items-center gap-3 rounded-[12px] px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.83rem] font-semibold">{follow.name}</span>
                  <span className="text-[0.7rem] text-faint">
                    {follow.kind === 'studio' ? 'Studio' : 'Personne'} · {follow.known.length} œuvres connues
                    {follow.fresh.length > 0 &&
                      ` · ${follow.fresh.length} nouveauté${follow.fresh.length > 1 ? 's' : ''}`}
                  </span>
                </span>
                <button
                  className="chip shrink-0"
                  onClick={() =>
                    void window.api.follows.remove(follow.key).then(() => {
                      setFollows((prev) => prev.filter((f) => f.key !== follow.key))
                      toast(`Tu ne suis plus ${follow.name}.`, 'ok')
                    })
                  }
                >
                  <BellOff size={12} />
                  Retirer
                </button>
              </div>
            ))}
          </div>
        )}

        <Row
          label="Chercher maintenant"
          hint="La recherche tourne deux fois par jour d’elle-même. Une nouveauté déjà annoncée ne l’est jamais deux fois."
        >
          <button
            className="btn"
            disabled={busy === 'follows' || follows.length === 0}
            onClick={() =>
              void (async () => {
                setBusy('follows')
                try {
                  const found = await window.api.follows.sweep()
                  setFollows(await window.api.follows.list())
                  toast(
                    found.length
                      ? `${found.length} nouveauté${found.length > 1 ? 's' : ''} chez ceux que tu suis.`
                      : 'Rien de neuf chez ceux que tu suis.',
                    'ok'
                  )
                } catch (err) {
                  toast(humanMessage((err as Error).message), 'error')
                } finally {
                  setBusy(null)
                }
              })()
            }
          >
            <BellRing size={14} />
            {busy === 'follows' ? 'Recherche…' : 'Chercher'}
          </button>
        </Row>
      </Card>

      {info?.schema.readOnly && (
        <section
          className="mb-4 rounded-[20px] p-5"
          style={{ background: 'rgba(255,107,107,.1)', border: '1px solid rgba(255,107,107,.35)' }}
        >
          <h2 className="mb-1.5 flex items-center gap-2 text-[0.98rem] font-semibold" style={{ color: '#ff9a9a' }}>
            <Database size={17} />
            Bibliothèque en lecture seule
          </h2>
          <p className="text-[0.8rem] leading-relaxed text-muted">
            Ton fichier de données est en schéma v{info.schema.version}, alors que cette version de l’app gère v
            {info.schema.expected}. Il a donc été écrit par une version plus récente. Rien n’est enregistré pour
            l’instant, afin de ne pas écraser des données que ce build ne sait pas lire. Installe la version la plus
            récente pour repasser en écriture.
          </p>
        </section>
      )}

      <Card id="donnees" title="Mes données" icon={<Database size={17} />}>
        <BackupRow />

        <Row label="Exporter une sauvegarde" hint="Un fichier JSON avec toute ta bibliothèque et ton historique.">
          <button
            className="btn"
            disabled={busy !== null}
            onClick={() => run('export', () => window.api.data.export())}
          >
            <FileDown size={14} />
            Exporter
          </button>
        </Row>

        <Row label="Restaurer une sauvegarde" hint="Fusionne avec l'existant, ou remplace tout.">
          <div className="flex gap-1.5">
            <button
              className="btn"
              disabled={busy !== null}
              onClick={() => run('merge', () => window.api.data.import('merge'))}
            >
              <FileUp size={14} />
              Fusionner
            </button>
            <button
              className="btn"
              disabled={busy !== null}
              onClick={() => run('replace', () => window.api.data.import('replace'))}
            >
              Remplacer
            </button>
          </div>
        </Row>

        <Row
          label="Importer depuis MyAnimeList"
          hint="Le fichier animelist_*.xml (ou .xml.gz) exporté depuis MAL. Les correspondances AniList sont retrouvées automatiquement."
        >
          <button
            className="btn btn-primary"
            disabled={busy !== null}
            onClick={() => run('mal', () => window.api.data.importMal())}
          >
            <Upload size={14} />
            {busy === 'mal' ? 'Import en cours…' : 'Importer'}
          </button>
        </Row>

        {/* Un pseudo suffit : ces deux services publient les listes publiques
            sans compte ni clé, ce qui est de loin le chemin le plus court pour
            amener des années d'historique. */}
        <Row
          label="Importer depuis un pseudo"
          hint="AniList ou Kitsu, si la liste est publique. AniList donne ses propres identifiants — l'import est exact. Kitsu passe par MyAnimeList ; une série sans correspondance est ignorée plutôt que devinée."
        >
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="pseudo"
              className="field !h-[34px] w-[150px]"
            />
            <button
              className="btn"
              disabled={busy !== null || !handle.trim()}
              onClick={() => run('anilist', () => window.api.data.importAniList(handle))}
            >
              <AtSign size={14} />
              {busy === 'anilist' ? 'Import…' : 'AniList'}
            </button>
            <button
              className="btn"
              disabled={busy !== null || !handle.trim()}
              onClick={() => run('kitsu', () => window.api.data.importKitsu(handle))}
            >
              {busy === 'kitsu' ? 'Import…' : 'Kitsu'}
            </button>
          </div>
        </Row>

        <TvTimeImport />

        <Row
          label="Santé de la bibliothèque"
          hint="Fiches manquantes, visionnages orphelins, doublons, fichiers résiduels"
        >
          <button className="btn" onClick={() => setHealthOpen(true)}>
            <Stethoscope size={14} />
            Examiner
          </button>
        </Row>

        <Row label="Raccourcis" hint="Clavier et souris, y compris les gestes qu'on ne devine pas seul">
          <button className="btn" onClick={() => setHelp(true)}>
            <Keyboard size={14} />
            Voir
          </button>
        </Row>

        <Row label="Dossier de données" hint={info?.dbPath ?? '—'}>
          <button className="btn" onClick={() => window.api.data.reveal()}>
            <FolderOpen size={14} />
            Ouvrir
          </button>
        </Row>

        <CacheRow />

        <Row label="Tout effacer" hint="Supprime la bibliothèque et l'historique. Irréversible.">
          <button
            className="btn"
            style={{ color: '#ff8080', borderColor: 'rgba(255,128,128,.3)' }}
            onClick={() => setConfirmReset(true)}
          >
            <Trash2 size={14} />
            Réinitialiser
          </button>
        </Row>
      </Card>

      <Card id="a-propos" title="À propos" icon={<HardDrive size={17} />}>
        <Row label="AnimeList" hint="Suivi d'animes local-first. Données : AniList. Aucun compte, aucun tracking.">
          <span className="text-[0.8rem] tabular-nums text-muted">v{info?.version ?? '—'}</span>
        </Row>
        <Row label="Auteur">
          <span className="text-[0.82rem] font-semibold">Zaidal</span>
        </Row>
        <Row
          label="Mise à jour automatique"
          hint="Une nouvelle version publiée sur GitHub est téléchargée seule et installée à la fermeture de l'app. Coupé, elle n'est que signalée."
        >
          <Toggle on={prefs.autoUpdate} onChange={(autoUpdate) => setPrefs({ autoUpdate })} />
        </Row>
        <UpdatePanel version={info?.version ?? null} />
        <Row label="Schéma de données" hint="Version du format de ton fichier local.">
          <span className="text-[0.8rem] tabular-nums text-muted">
            v{info?.schema.version ?? '—'}
            {info && info.schema.applied.length > 0 && (
              <span className="ml-2 text-[0.72rem]" style={{ color: 'var(--accent-2)' }}>
                {info.schema.applied.length} migration{info.schema.applied.length > 1 ? 's' : ''} appliquée
                {info.schema.applied.length > 1 ? 's' : ''}
              </span>
            )}
          </span>
        </Row>
        <Row label="Moteur">
          <span className="flex items-center gap-1.5 text-[0.78rem] tabular-nums text-faint">
            <Zap size={12} />
            Electron {info?.electron ?? '—'} · Chromium {info?.chrome?.split('.')[0] ?? '—'}
          </span>
        </Row>
      </Card>
      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} width={440}>
        <div className="p-6">
          <h3 className="title-xl mb-2 text-[1.1rem]">Tout effacer ?</h3>
          <p className="mb-6 text-[0.84rem] leading-relaxed text-muted">
            Tes {entries.size} titres et {events.length} épisodes cochés seront supprimés définitivement. Pense à
            exporter une sauvegarde avant.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={() => setConfirmReset(false)}>
              Annuler
            </button>
            <button
              className="btn"
              style={{ background: 'rgba(255,80,80,.16)', borderColor: 'rgba(255,80,80,.4)', color: '#ff9a9a' }}
              onClick={async () => {
                await window.api.data.reset()
                setConfirmReset(false)
                toast('Bibliothèque réinitialisée', 'info')
              }}
            >
              Effacer définitivement
            </button>
          </div>
        </div>
      </Modal>
      <Health open={healthOpen} onClose={() => setHealthOpen(false)} />
    </>
  )
}
