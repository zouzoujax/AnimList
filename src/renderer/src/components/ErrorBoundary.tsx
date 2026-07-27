import { House, RotateCcw, TriangleAlert } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Changing this clears a caught error — used to recover on navigation. */
  resetKey?: string
  /** Shown when the shell itself is what crashed, so navigation is unavailable. */
  fatal?: boolean
  onGoHome?: () => void
}

interface State {
  error: Error | null
  stack: string | null
}

function ErrorPanel({
  error,
  stack,
  fatal,
  onRetry,
  onGoHome
}: {
  error: Error
  stack: string | null
  fatal: boolean
  onRetry: () => void
  onGoHome?: () => void
}): React.JSX.Element {
  const detail = [`${error.name}: ${error.message}`, error.stack ?? '', stack ? `\nComposants:${stack}` : '']
    .filter(Boolean)
    .join('\n')

  return (
    <div className="grid min-h-[60vh] place-items-center p-7">
      <div className="glass w-full max-w-[720px] rounded-[22px] p-6">
        <div className="mb-4 flex items-center gap-3">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
            style={{ background: 'rgba(255,107,107,.14)', color: '#ff8080' }}
          >
            <TriangleAlert size={21} />
          </span>
          <div>
            <h2 className="title-xl text-[1.15rem]">
              {fatal ? "L'application a rencontré une erreur" : 'Cette page a rencontré une erreur'}
            </h2>
            <p className="mt-0.5 text-[0.8rem] text-muted">
              {fatal
                ? 'Recharge la fenêtre pour repartir. Tes données sur le disque ne sont pas affectées.'
                : 'Le reste de l’application fonctionne toujours. Tes données ne sont pas affectées.'}
            </p>
          </div>
        </div>

        <p
          className="mb-3 rounded-[12px] px-3 py-2.5 font-mono text-[0.78rem] leading-relaxed"
          style={{ background: 'rgba(0,0,0,.3)' }}
        >
          {error.name}: {error.message}
        </p>

        {(error.stack || stack) && (
          <details className="mb-4">
            <summary className="cursor-pointer text-[0.78rem] font-semibold text-muted">Détail technique</summary>
            <pre
              className="scroll-y mt-2 max-h-[220px] whitespace-pre-wrap rounded-[12px] px-3 py-2.5 font-mono text-[0.7rem] leading-relaxed text-faint"
              style={{ background: 'rgba(0,0,0,.3)' }}
            >
              {detail}
            </pre>
          </details>
        )}

        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={onRetry}>
            <RotateCcw size={14} />
            Réessayer
          </button>
          {onGoHome && !fatal && (
            <button className="btn" onClick={onGoHome}>
              <House size={14} />
              Retour à l’accueil
            </button>
          )}
          <button className="btn" onClick={() => window.location.reload()}>
            Recharger la fenêtre
          </button>
          <button className="btn btn-ghost" onClick={() => void navigator.clipboard.writeText(detail)}>
            Copier le détail
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * React unmounts the whole tree on an uncaught render error, which on a local
 * app with no telemetry means a blank window and no clue. This keeps the shell
 * alive, shows what broke, and clears itself when the route changes.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, stack: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[render]', error, info.componentStack)
    this.setState({ stack: info.componentStack ?? null })
  }

  override componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null, stack: null })
    }
  }

  private readonly retry = (): void => this.setState({ error: null, stack: null })

  override render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <ErrorPanel
        error={this.state.error}
        stack={this.state.stack}
        fatal={!!this.props.fatal}
        onRetry={this.retry}
        onGoHome={
          this.props.onGoHome &&
          ((): void => {
            this.retry()
            this.props.onGoHome?.()
          })
        }
      />
    )
  }
}
