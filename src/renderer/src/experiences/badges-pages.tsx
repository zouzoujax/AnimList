import { motion } from 'motion/react'
import { useState } from 'react'
import { BADGE_GROUPS, badgeTitle, useBadgeWall, type Badge } from '@/lib/badges'

/*
 * Le mur des badges, une fois par expérience.
 *
 * Mêmes badges et mêmes progressions que la page Statistiques classique
 * (lib/badges.ts) ; seule la vitrine change : médailles en rangées pour
 * Streaming, liste de trophées pour Console, palmarès typographique pour
 * Magazine, décorations de bord pour Cockpit, album d'autocollants pour Carnet.
 */

type Filter = 'all' | 'done' | 'todo'

function useWall(filter: Filter): {
  badges: Badge[]
  unlocked: number
  groups: { group: string; list: Badge[]; done: number; total: number }[]
} {
  const { badges } = useBadgeWall()
  const unlocked = badges.filter((b) => b.progress >= 1).length
  const shown =
    filter === 'done'
      ? badges.filter((b) => b.progress >= 1)
      : filter === 'todo'
        ? badges.filter((b) => b.progress < 1).sort((a, b) => b.progress - a.progress)
        : badges
  const groups = BADGE_GROUPS.map((group) => {
    const whole = badges.filter((b) => b.group === group)
    return {
      group,
      list: shown.filter((b) => b.group === group),
      done: whole.filter((b) => b.progress >= 1).length,
      total: whole.length
    }
  }).filter((g) => g.list.length > 0)
  return { badges, unlocked, groups }
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'done', label: 'Débloqués' },
  { id: 'todo', label: 'À faire' }
]

const pct = (b: Badge): number => Math.round(Math.min(1, Math.max(0, b.progress)) * 100)

/* ─────────────────────────────── STREAMING */
export function StreamingBadges(): React.JSX.Element {
  const [filter, setFilter] = useState<Filter>('all')
  const { badges, unlocked, groups } = useWall(filter)
  return (
    <div className="xs-page pb-16 pt-24">
      <div className="px-10">
        <p className="xs-kicker">Ta collection de badges</p>
        <p className="xs-mega !text-[8rem]">{unlocked}</p>
        <p className="text-[1.5rem] font-bold">sur {badges.length} débloqués</p>
        <div className="mt-6 flex gap-2">
          {FILTERS.map((f) => (
            <button key={f.id} className="xs-tab" data-on={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {groups.map(({ group, list, done, total }) => (
        <section key={group} className="mt-10">
          <h2 className="mb-3 px-10 text-[1.3rem] font-bold">
            {group}{' '}
            <span className="text-[0.95rem] font-normal text-faint">
              · {done}/{total}
            </span>
          </h2>
          <div className="scroll-x flex gap-4 px-10 py-4">
            {list.map((badge) => {
              const Icon = badge.icon
              const on = badge.progress >= 1
              return (
                <motion.div
                  key={badge.id}
                  className="xs-medal shrink-0"
                  data-on={on}
                  whileHover={{ scale: 1.08 }}
                  title={badgeTitle(badge)}
                >
                  <span className="xs-medal-disc" style={{ '--p': `${pct(badge)}%` } as React.CSSProperties}>
                    <Icon size={30} />
                  </span>
                  <span className="mt-2 block text-[0.85rem] font-bold">{badge.label}</span>
                  <span className="block text-[0.72rem] text-faint">{on ? badge.hint : `${pct(badge)} %`}</span>
                </motion.div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

/* ─────────────────────────────── CONSOLE */
const TIERS = ['bronze', 'silver', 'gold', 'platinum'] as const

export function ConsoleBadges(): React.JSX.Element {
  const [filter, setFilter] = useState<Filter>('all')
  const { badges, unlocked, groups } = useWall(filter)
  return (
    <div className="px-12 pb-16 pt-28">
      <section className="xc-card flex items-center gap-8 !p-7">
        <span className="xc-cup xc-platinum !h-20 !w-20" aria-hidden />
        <div className="flex-1">
          <p className="xc-card-kicker">Progression des trophées</p>
          <p className="title-xl mt-1 text-[2.2rem]">
            {unlocked} / {badges.length} trophées
          </p>
          <div className="xc-meter mt-3 !max-w-none">
            <motion.span
              initial={{ width: 0 }}
              animate={{ width: `${(unlocked / Math.max(1, badges.length)) * 100}%` }}
              transition={{ duration: 1 }}
            />
          </div>
        </div>
      </section>
      <div className="mt-6 flex gap-2">
        {FILTERS.map((f) => (
          <button key={f.id} className="xc-filter" data-on={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      {groups.map(({ group, list, done, total }, gi) => (
        <section key={group} className="mt-8">
          <h2 className="title-xl mb-3 text-[1.4rem]">
            {group}{' '}
            <span className="text-[1rem] font-normal text-faint">
              {done}/{total}
            </span>
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
            {list.map((badge, i) => {
              const Icon = badge.icon
              const on = badge.progress >= 1
              return (
                <motion.div
                  key={badge.id}
                  className="xc-card flex items-center gap-4"
                  data-locked={!on}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: on ? 1 : 0.55, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                >
                  <span className={`xc-cup xc-${TIERS[gi % TIERS.length]} grid place-items-center text-[#07102b]`}>
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{badge.label}</span>
                    <span className="block text-[0.8rem] text-faint">{badge.hint}</span>
                    {!on && (
                      <span className="xc-meter mt-2 block">
                        <span style={{ width: `${pct(badge)}%` }} />
                      </span>
                    )}
                  </span>
                  <span className="text-[0.85rem] font-semibold">{on ? '✓' : `${pct(badge)} %`}</span>
                </motion.div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

/* ─────────────────────────────── MAGAZINE */
export function MagazineBadges(): React.JSX.Element {
  const [filter, setFilter] = useState<Filter>('all')
  const { badges, unlocked, groups } = useWall(filter)
  return (
    <div className="px-12 pb-16 pt-8">
      <p className="xm-kicker">Hors-série</p>
      <h1 className="xm-headline mt-2">Le palmarès</h1>
      <p className="xm-deck mt-3">
        {unlocked} distinctions obtenues sur {badges.length}, et celles qui restent à conquérir.
      </p>
      <div className="xm-rule-double mt-6 flex gap-8 py-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className="xm-section"
            aria-current={filter === f.id ? 'page' : undefined}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="mt-8 columns-3 gap-10">
        {groups.map(({ group, list, done, total }) => (
          <section key={group} className="mb-8 break-inside-avoid">
            <h2 className="xm-letter !text-[2rem]">
              {group}{' '}
              <span className="xm-caption">
                {done}/{total}
              </span>
            </h2>
            {list.map((badge) => {
              const on = badge.progress >= 1
              return (
                <div key={badge.id} className="xm-entry" title={badgeTitle(badge)}>
                  <span className="xm-entry-title" style={on ? undefined : { color: '#8a847b' }}>
                    {badge.label}
                  </span>
                  <span className="xm-leader" />
                  <span className="xm-entry-page" style={on ? { color: 'var(--accent)', fontWeight: 700 } : undefined}>
                    {on ? '✓' : `${pct(badge)} %`}
                  </span>
                  <span className="xm-caption col-span-3 block">{badge.hint}</span>
                </div>
              )
            })}
          </section>
        ))}
      </div>
    </div>
  )
}

/* ─────────────────────────────── COCKPIT */
export function HudBadges(): React.JSX.Element {
  const [filter, setFilter] = useState<Filter>('all')
  const { badges, unlocked, groups } = useWall(filter)
  return (
    <div className="xh-screen grid grid-cols-12 gap-3 p-5">
      <section className="xh-panel relative col-span-12 flex items-center gap-6 p-4">
        <div>
          <p className="xh-code">DÉCORATIONS OBTENUES</p>
          <p className="xh-value xh-value-big mt-1">
            {unlocked} / {badges.length}
          </p>
        </div>
        <div className="xh-segments flex-1" style={{ gridTemplateColumns: `repeat(${badges.length}, 1fr)` }}>
          {badges.map((b) => (
            <span key={b.id} data-on={b.progress >= 1} title={badgeTitle(b)} />
          ))}
        </div>
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button key={f.id} className="xh-cmd" data-on={filter === f.id} onClick={() => setFilter(f.id)}>
              [{f.label.toUpperCase()}]
            </button>
          ))}
        </div>
      </section>
      {groups.map(({ group, list, done, total }, gi) => (
        <section key={group} className="xh-panel relative col-span-12 p-4">
          <header className="mb-3 flex items-baseline justify-between">
            <h2 className="xh-title">{group}</h2>
            <span className="xh-code">
              G-{String(gi + 1).padStart(2, '0')} · {done}/{total}
            </span>
          </header>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
            {list.map((badge, i) => {
              const Icon = badge.icon
              const on = badge.progress >= 1
              return (
                <div key={badge.id} className="xh-badge" data-on={on} title={badgeTitle(badge)}>
                  <span className="xh-badge-icon">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="xh-code block">
                      B-{String(gi + 1).padStart(2, '0')}
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="block truncate text-[0.8rem] font-semibold">{badge.label}</span>
                    <span className="xh-meter mt-1 !w-full">
                      <span style={{ width: `${pct(badge)}%` }} />
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

/* ─────────────────────────────── CARNET */
const tilt = (i: number): number => ((i * 37) % 7) - 3
const INKS = ['#c8553d', '#e0a458', '#588b8b', '#8f5d9a', '#6b8f4e', '#3f6c9e', '#b5838d']

export function CarnetBadges(): React.JSX.Element {
  const [filter, setFilter] = useState<Filter>('all')
  const { badges, unlocked, groups } = useWall(filter)
  return (
    <div className="px-8 py-8">
      <div className="xk-page relative mx-auto max-w-[1180px] px-16 py-12">
        <span className="xk-rings" aria-hidden />
        <p className="xk-note">Album d’autocollants</p>
        <h1 className="xk-title">Mes badges</h1>
        <p className="xk-hand mt-1">
          {unlocked} collés sur {badges.length} emplacements
        </p>
        <div className="mt-5 flex gap-3">
          {FILTERS.map((f, i) => (
            <button
              key={f.id}
              className="xk-tag"
              style={{ background: INKS[i] }}
              data-on={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {groups.map(({ group, list, done, total }, gi) => (
          <section key={group} className="mt-10">
            <h2 className="xk-heading">
              {group}{' '}
              <span className="xk-note">
                {done}/{total}
              </span>
            </h2>
            <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-6">
              {list.map((badge, i) => {
                const Icon = badge.icon
                const on = badge.progress >= 1
                return (
                  <motion.div
                    key={badge.id}
                    className="text-center"
                    title={badgeTitle(badge)}
                    whileHover={on ? { rotate: 0, scale: 1.1 } : undefined}
                    style={{ rotate: on ? tilt(i + gi) * 2 : 0 }}
                  >
                    <span
                      className="xk-sticker"
                      data-on={on}
                      style={on ? { background: INKS[(gi + i) % INKS.length] } : undefined}
                    >
                      <Icon size={30} />
                    </span>
                    <span className="xk-hand mt-2 block !text-[1rem]">{badge.label}</span>
                    <span className="xk-note block">{on ? badge.hint : `${pct(badge)} % · ${badge.hint}`}</span>
                  </motion.div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
