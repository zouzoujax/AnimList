import {
  Bell,
  Database,
  FileDown,
  FileUp,
  FolderOpen,
  HardDrive,
  Languages,
  Layers,
  Palette,
  Sparkles,
  Trash2,
  Upload,
  Zap
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { LAYOUTS, THEMES, type ImportReport, type LayoutId, type TitleLang } from '@shared/types'
import { Modal } from '@/components/ui'
import TvTimeImport from '@/components/TvTimeImport'
import UpdatePanel from '@/components/UpdatePanel'
import { ACCENT_PRESETS } from '@/lib/color'
import { minutesToHuman } from '@/lib/format'
import { useApp } from '@/store/app'

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

function Card({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }): React.JSX.Element {
  return (
    <section className="glass mb-4 rounded-[20px] p-5">
      <h2 className="mb-4 flex items-center gap-2 text-[0.98rem] font-semibold">
        <span className="text-[var(--accent-2)]">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): React.JSX.Element {
  return (
    <div
      className="flex items-center justify-between gap-6 border-t py-3 first:border-t-0 first:pt-0"
      style={{ borderColor: 'var(--line)' }}
    >
      <div className="min-w-0">
        <p className="text-[0.85rem] font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-[0.74rem] leading-snug text-faint">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): React.JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="relative h-[26px] w-[46px] rounded-full transition-colors duration-200"
      style={{
        background: on ? 'linear-gradient(135deg, var(--accent), var(--accent-2))' : 'rgba(255,255,255,.1)',
        boxShadow: on ? '0 0 18px -6px var(--glow)' : 'inset 0 1px 0 rgba(255,255,255,.06)'
      }}
    >
      <span
        className="absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all duration-200"
        style={{ left: on ? 23 : 3 }}
      />
    </button>
  )
}

export default function SettingsPage(): React.JSX.Element {
  const prefs = useApp((s) => s.prefs)
  const setPrefs = useApp((s) => s.setPrefs)
  const toast = useApp((s) => s.toast)
  const entries = useApp((s) => s.entries)
  const events = useApp((s) => s.events)

  const [info, setInfo] = useState<Awaited<ReturnType<typeof window.api.app.info>> | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    void window.api.app.info().then(setInfo)
  }, [])

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
      toast((err as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-[820px] px-7 py-7">
      <h1 className="title-xl mb-1 text-[1.85rem]">Réglages</h1>
      <p className="mb-7 text-[0.85rem] text-muted">
        {entries.size} titres et {events.length} épisodes stockés sur ce PC.
      </p>

      <Card title="Apparence" icon={<Palette size={17} />}>
        <div className="border-t py-3 first:border-t-0 first:pt-0" style={{ borderColor: 'var(--line)' }}>
          <p className="text-[0.85rem] font-medium">Thème</p>
          <p className="mt-0.5 text-[0.74rem] text-faint">
            Change toute l'interface : couleurs, typographie, arrondis, effets de fond.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {THEMES.map((theme) => {
              const active = prefs.theme === theme.id
              return (
                <button
                  key={theme.id}
                  onClick={() => setPrefs({ theme: theme.id })}
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

        <div className="border-t py-3" style={{ borderColor: 'var(--line)' }}>
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
          </div>
        </Row>

        <Row label="Transparence Mica" hint="Laisse le fond d'écran Windows 11 transparaître derrière l'app.">
          <Toggle on={prefs.mica} onChange={(mica) => setPrefs({ mica })} />
        </Row>

        <Row label="Réduire les animations" hint="Coupe les transitions et le fond animé.">
          <Toggle on={prefs.reduceMotion} onChange={(reduceMotion) => setPrefs({ reduceMotion })} />
        </Row>
      </Card>

      <Card title="Affichage" icon={<Languages size={17} />}>
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

      <Card title="Notifications" icon={<Bell size={17} />}>
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

      <Card title="Suites" icon={<Layers size={17} />}>
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
                  toast((err as Error).message, 'error')
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

      <Card title="Mes données" icon={<Database size={17} />}>
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

        <TvTimeImport />

        <Row label="Dossier de données" hint={info?.dbPath ?? '—'}>
          <button className="btn" onClick={() => window.api.data.reveal()}>
            <FolderOpen size={14} />
            Ouvrir
          </button>
        </Row>

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

      <Card title="À propos" icon={<HardDrive size={17} />}>
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
    </div>
  )
}
