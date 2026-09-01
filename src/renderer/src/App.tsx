import { AnimatePresence, motion } from 'motion/react'
import { Suspense, lazy, useCallback, useEffect, useRef } from 'react'
import { CommandPalette } from '@/components/CommandPalette'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import Shortcuts, { useShortcutsKey } from '@/components/Shortcuts'
import { Aurora, Sidebar, TitleBar } from '@/components/Shell'
import { Toasts } from '@/components/Toasts'
import { Spinner } from '@/components/ui'
import HomePage from '@/pages/Home'
import { useApp } from '@/store/app'

/**
 * Only the home page is in the entry bundle — it is what the window opens on.
 *
 * Everything else is fetched on first visit. The pages differ wildly in weight:
 * Stats pulls in the whole charting layer and Detail the trailer and cast views,
 * neither of which most sessions ever open.
 */
const DiscoverPage = lazy(() => import('@/pages/Discover'))
const LibraryPage = lazy(() => import('@/pages/Library'))
const StudioPage = lazy(() => import('@/pages/Studio'))
const PersonPage = lazy(() => import('@/pages/Person'))
const CalendarPage = lazy(() => import('@/pages/Calendar'))
const StatsPage = lazy(() => import('@/pages/Stats'))
const SettingsPage = lazy(() => import('@/pages/Settings'))
const DetailPage = lazy(() => import('@/pages/Detail'))

function Boot(): React.JSX.Element {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex flex-col items-center gap-4">
        <div
          className="h-11 w-11 rounded-2xl"
          style={{
            background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
            animation: 'drift-c 2.4s ease-in-out infinite',
            boxShadow: '0 0 40px -6px var(--glow)'
          }}
        />
        <p className="text-[0.8rem] text-faint">Ouverture de ta bibliothèque…</p>
      </div>
    </div>
  )
}

export default function App(): React.JSX.Element {
  const ready = useApp((s) => s.ready)
  const route = useApp((s) => s.route)
  const init = useApp((s) => s.init)
  const back = useApp((s) => s.back)
  const navigate = useApp((s) => s.navigate)
  const toast = useApp((s) => s.toast)
  const setPalette = useApp((s) => s.setPalette)
  const paletteOpen = useApp((s) => s.paletteOpen)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void init()
  }, [init])

  // Error boundaries only catch render errors. Async failures used to vanish
  // into a `.catch(() => {})`; now they at least surface as a toast.
  useEffect(() => {
    const onError = (event: ErrorEvent): void => {
      // Resource load failures (a 404 cover) leave `error` unset — ignore those.
      if (!event.error) return
      const message = event.error instanceof Error ? event.error.message : event.message
      toast(`Erreur : ${message}`, 'error')
    }
    const onRejection = (event: PromiseRejectionEvent): void => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason)
      toast(`Échec : ${reason}`, 'error')
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [toast])

  // Dans le magasin plutôt qu'ici : les Réglages doivent pouvoir l'ouvrir, et
  // un raccourci qu'on ne trouve que par hasard n'existe qu'à moitié.
  const helpOpen = useApp((s) => s.helpOpen)
  const setHelp = useApp((s) => s.setHelp)
  const runUndo = useApp((s) => s.runUndo)
  useShortcutsKey(useCallback(() => setHelp(true), [setHelp]))

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(!paletteOpen)
      }
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        back()
      }
      // Ctrl+Z sur la progression, jamais dans un champ : on y attend l'annulation
      // de la frappe, pas celle d'un épisode coché il y a dix minutes.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        const el = document.activeElement
        const typing =
          el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement)?.isContentEditable
        if (typing) return
        e.preventDefault()
        void runUndo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [back, setPalette, paletteOpen, runUndo])

  const routeKey =
    route.name === 'person'
      ? `person-${route.kind}-${route.id}`
      : route.name === 'anime'
        ? `anime-${route.id}`
        : route.name === 'studio'
          ? `studio-${route.studio}`
          : route.name === 'library'
            ? `library-${route.genre ?? ''}`
            : route.name

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [routeKey])

  return (
    <div className="flex h-full flex-col">
      <Aurora />
      <TitleBar />

      {!ready ? (
        <Boot />
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* First thing Tab reaches, so the whole navigation can be skipped. */}
          <a href="#contenu" className="skip-link">
            Aller au contenu
          </a>
          <Sidebar />
          <main id="contenu" ref={scrollRef} className="scroll-y relative flex-1" tabIndex={-1}>
            <AnimatePresence mode="wait">
              <motion.div
                key={routeKey}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: [0.22, 0.8, 0.24, 1] }}
              >
                <ErrorBoundary resetKey={routeKey} onGoHome={() => navigate({ name: 'home' })}>
                  <Suspense fallback={<Spinner label="Chargement de la page…" />}>
                    {route.name === 'home' && <HomePage />}
                    {route.name === 'discover' && <DiscoverPage initialSearch={route.search} />}
                    {route.name === 'library' && <LibraryPage initialGenre={route.genre} />}
                    {route.name === 'studio' && <StudioPage studio={route.studio} />}
                    {route.name === 'person' && <PersonPage kind={route.kind} id={route.id} />}
                    {route.name === 'calendar' && <CalendarPage />}
                    {route.name === 'stats' && <StatsPage />}
                    {route.name === 'settings' && <SettingsPage />}
                    {route.name === 'anime' && <DetailPage id={route.id} />}
                  </Suspense>
                </ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      )}

      <CommandPalette />
      <Shortcuts open={helpOpen} onClose={() => setHelp(false)} />
      <Toasts />
    </div>
  )
}
