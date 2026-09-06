/**
 * L'arbre d'une franchise — ESSAI.
 *
 * Tout est réuni ici, exprès : ce composant, `@shared/franchise` avec son test,
 * `src/main/franchise.ts`, une ligne d'IPC, une ligne de préchargement et un
 * bouton sur la fiche. Retirer l'essai revient à supprimer ces fichiers et ces
 * trois lignes ; rien d'autre n'en dépend.
 *
 * Le dessin suit ce que l'arbre raconte : un rail vertical pour le tronc, où
 * chaque saison est un nœud, et les branches accrochées à droite du nœud
 * auquel elles se rattachent. Les traits sont des bordures, pas des SVG — un
 * arbre qui doit se replier sur une fenêtre étroite se plie mieux en HTML.
 */

import { CircleDot, GitBranch, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BRANCH_LABELS, type Node, type Tree } from '@shared/franchise'
import { humanMessage } from '@shared/api-outage'
import { Poster, Spinner } from '@/components/ui'
import { rgba, toneAccent } from '@/lib/color'

/** L'avancement d'une série, en une barre et un chiffre. */
function Bar({ seen, total }: { seen: number; total: number | null }): React.JSX.Element | null {
  if (!total || total <= 0) return null
  const part = Math.min(1, seen / total)
  const glow = toneAccent(null)
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="h-[3px] flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.09)' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${part * 100}%`, background: part === 1 ? glow : rgba(glow, 0.65) }}
        />
      </div>
      <span className="shrink-0 text-[0.68rem] tabular-nums text-faint">
        {seen}/{total}
      </span>
    </div>
  )
}

/** Une série d'une branche : un point dit son état, sans occuper de place. */
function Leaf({ node, onOpen }: { node: Node; onOpen: (id: number) => void }): React.JSX.Element {
  const complet = node.total !== null && node.total > 0 && node.seen >= node.total
  const glow = toneAccent(null)
  return (
    <button
      onClick={() => onOpen(node.id)}
      title={node.tracked ? `${node.seen} vu${node.seen > 1 ? 's' : ''}` : 'Pas dans ta bibliothèque'}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-white/6"
    >
      <span
        className="h-[6px] w-[6px] shrink-0 rounded-full"
        style={{
          background: complet ? glow : node.seen > 0 ? rgba(glow, 0.5) : 'transparent',
          border: node.seen > 0 ? 'none' : '1px solid var(--line-2)'
        }}
      />
      <span className={`truncate text-[0.76rem] ${node.tracked ? 'text-muted' : 'text-faint'}`}>{node.title}</span>
      {node.format && <span className="shrink-0 text-[0.66rem] text-faint">{node.format}</span>}
    </button>
  )
}

export function Franchise({ animeId, onOpen }: { animeId: number; onOpen: (id: number) => void }): React.JSX.Element {
  /**
   * L'identifiant voyage avec la réponse.
   *
   * Remettre l'état à zéro dans le corps de l'effet relancerait un rendu pour
   * rien ; c'est aussi ce que le reste de l'app évite. Retenir pour quelle
   * série la réponse a été obtenue suffit à savoir si elle est encore d'actualité.
   */
  const [held, setHeld] = useState<{ id: number; tree: Tree | null; error: string | null }>({
    id: 0,
    tree: null,
    error: null
  })

  useEffect(() => {
    let alive = true
    window.api.anime
      .franchise(animeId)
      .then((t) => alive && setHeld({ id: animeId, tree: t, error: null }))
      .catch((err: Error) => alive && setHeld({ id: animeId, tree: null, error: humanMessage(err.message) }))
    return () => {
      alive = false
    }
  }, [animeId])

  const ready = held.id === animeId
  const error = ready ? held.error : null
  const tree = ready ? held.tree : null

  if (error) {
    return (
      <div className="flex items-start gap-3 p-8 text-sm">
        <TriangleAlert size={18} className="mt-0.5 shrink-0 text-amber-300" />
        <span className="text-muted">{error}</span>
      </div>
    )
  }

  if (tree === null) return <Spinner label="Construction de l’arbre…" />

  if (tree.trunk.length === 0) {
    return (
      <p className="p-8 text-sm text-muted">
        Rien à dessiner : AniList ne rattache cette série à aucune autre, ou sa fiche n’a pas encore été chargée.
      </p>
    )
  }

  const glow = toneAccent(null)
  const pct = tree.total > 0 ? Math.round((tree.seen / tree.total) * 100) : 0

  return (
    <div className="max-h-[68vh] overflow-y-auto p-5">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: rgba(glow, 0.16) }}>
          <GitBranch size={17} />
        </span>
        <div>
          <p className="text-[0.95rem] font-semibold">Arbre de la franchise</p>
          <p className="text-[0.78rem] text-faint">
            {tree.count} séries · {tree.seen} épisodes vus sur {tree.total}
            {tree.total > 0 ? ` · ${pct} %` : ''}
          </p>
        </div>
      </div>

      <ol className="flex flex-col">
        {tree.trunk.map((season, i) => (
          <li key={season.id} className="relative flex gap-3">
            {/* Le rail : un trait continu qui s'arrête au dernier nœud. */}
            <div className="relative flex w-4 shrink-0 flex-col items-center">
              <CircleDot size={15} className="relative z-10 mt-4 shrink-0" style={{ color: glow }} />
              {i < tree.trunk.length - 1 && (
                <div className="w-px flex-1" style={{ background: 'var(--line)' }} aria-hidden />
              )}
            </div>

            <div className="min-w-0 flex-1 pb-4">
              <button
                onClick={() => onOpen(season.id)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/6"
              >
                {season.cover && (
                  <Poster src={season.cover} alt="" className="h-[52px] w-[36px] shrink-0" rounded="rounded-md" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="shrink-0 text-[0.7rem] font-semibold tabular-nums" style={{ color: glow }}>
                      S{season.number}
                      {season.part ? `.${season.part}` : ''}
                    </span>
                    <span className="truncate text-[0.86rem] font-medium">{season.title}</span>
                    {season.year && <span className="shrink-0 text-[0.7rem] text-faint">{season.year}</span>}
                  </span>
                  {season.tracked ? (
                    <Bar seen={season.seen} total={season.total} />
                  ) : (
                    <span className="mt-1 block text-[0.7rem] text-faint">Pas dans ta bibliothèque</span>
                  )}
                </span>
              </button>

              {season.branches.map((branch) => (
                <div key={branch.kind} className="mt-1.5 ml-3 pl-3" style={{ borderLeft: '1px solid var(--line)' }}>
                  <p className="label mb-1 text-[0.66rem]">
                    {BRANCH_LABELS[branch.kind]} · {branch.nodes.length}
                  </p>
                  {branch.nodes.map((node) => (
                    <Leaf key={node.id} node={node} onOpen={onOpen} />
                  ))}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-2 text-[0.7rem] text-faint">
        Les branches viennent des relations qu’AniList déclare. Un point plein signale une série finie, un point creux
        une série commencée, rien du tout une série absente de ta bibliothèque.
      </p>
    </div>
  )
}
