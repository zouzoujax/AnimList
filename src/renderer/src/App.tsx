import { AnimatePresence, motion } from 'motion/react'
import { Suspense, lazy, useCallback, useEffect } from 'react'
import { Intro } from '@/components/Intro'
import { NextUp } from '@/components/NextUp'
import { CommandPalette } from '@/components/CommandPalette'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import Shortcuts, { useShortcutsKey } from '@/components/Shortcuts'
import { Aurora, NAV, Sidebar, TitleBar } from '@/components/Shell'
import { PAGE_MOTION, useExperienceState } from '@/experiences'
import { Toasts } from '@/components/Toasts'
import { Spinner } from '@/components/ui'
import HomePage from '@/pages/Home'
import { useNewDesign } from '@/lib/nd'
import { restoreScroll } from '@/lib/scroll'
import { routeKeyOf, useApp } from '@/store/app'

/**
 * Only the home page is in the entry bundle — it is what the window opens on.
 *
 * Everything else is fetched on first visit. The pages differ wildly in weight:
 * Stats pulls in the whole charting layer and Detail the trailer and cast views,
 * neither of which most sessions ever open.
 */
/*
 * Le nouveau design, page par page (Réglages › Apparence). Chaque page vit
 * dans son propre morceau : qui ne l'allume pas ne le télécharge jamais.
 */
const NdHomePage = lazy(() => import('@/pages/nd/Home'))
const NdLibraryPage = lazy(() => import('@/pages/nd/Library'))
const NdDiscoverPage = lazy(() => import('@/pages/nd/Discover'))
const NdCalendarPage = lazy(() => import('@/pages/nd/Calendar'))
const NdMangaPage = lazy(() => import('@/pages/nd/Manga'))
const NdStatsPage = lazy(() => import('@/pages/nd/Stats'))
const NdStudioPage = lazy(() => import('@/pages/nd/Studio'))
const NdPersonPage = lazy(() => import('@/pages/nd/Person'))
const DiscoverPage = lazy(() => import('@/pages/Discover'))
const LibraryPage = lazy(() => import('@/pages/Library'))
const StudioPage = lazy(() => import('@/pages/Studio'))
const PersonPage = lazy(() => import('@/pages/Person'))
const MangaPage = lazy(() => import('@/pages/Manga'))
const CalendarPage = lazy(() => import('@/pages/Calendar'))
const StatsPage = lazy(() => import('@/pages/Stats'))
const SettingsPage = lazy(() => import('@/pages/Settings'))
const SeasonPage = lazy(() => import('@/pages/Season'))
const DetailPage = lazy(() => import('@/pages/Detail'))

/**
 * Monté avec la page, donc après la sortie de la précédente : la ramener à sa
 * position plus tôt ferait défiler l'ancienne pendant qu'elle s'efface.
 */
function ScrollOnArrival({ routeKey }: { routeKey: string }): null {
  useEffect(() => restoreScroll(routeKey, useApp.getState().returning), [routeKey])
  return null
}

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
  const forward = useApp((s) => s.forward)
  const navigate = useApp((s) => s.navigate)
  const toast = useApp((s) => s.toast)
  const setPalette = useApp((s) => s.setPalette)
  const paletteOpen = useApp((s) => s.paletteOpen)
  const nd = {
    home: useNewDesign('home'),
    library: useNewDesign('library'),
    discover: useNewDesign('discover'),
    calendar: useNewDesign('calendar'),
    manga: useNewDesign('manga'),
    stats: useNewDesign('stats'),
    studio: useNewDesign('studio'),
    person: useNewDesign('person')
  }
  // Un thème « expérience » remplace la navigation, l'accueil, la bibliothèque
  // et les transitions ; les autres pages restent celles de l'app.
  const { xp, pending: xpPending } = useExperienceState()

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
      // Ctrl+1 à Ctrl+7 : les pages du menu, dans son ordre.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        const target = NAV[Number(e.key) - 1]
        if (target) {
          e.preventDefault()
          navigate(target.route)
        }
      }
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        back()
      }
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        forward()
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
  }, [back, forward, navigate, setPalette, paletteOpen, runUndo])

  // Les boutons latéraux de la souris, comme dans un navigateur. Retenus dès
  // l'appui : Chromium y attache sa propre navigation, qui n'a rien à faire ici.
  useEffect(() => {
    const swallow = (e: MouseEvent): void => {
      if (e.button === 3 || e.button === 4) e.preventDefault()
    }
    const onUp = (e: MouseEvent): void => {
      if (e.button === 3) back()
      else if (e.button === 4) forward()
      else return
      e.preventDefault()
    }
    window.addEventListener('mousedown', swallow)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousedown', swallow)
      window.removeEventListener('mouseup', onUp)
    }
  }, [back, forward])

  const routeKey = routeKeyOf(route)

  return (
    <div className="flex h-full flex-col">
      {/* Par-dessus tout, et démonté ensuite : l'app se charge derrière, si
          bien que l'ouverture couvre un travail qui avait lieu de toute façon
          plutôt que de s'y ajouter. */}
      <Intro />
      {/* Au-dessus des pages : une série se termine depuis n'importe quel écran. */}
      <NextUp />
      <Aurora />
      <TitleBar />

      {!ready || xpPending ? (
        <Boot />
      ) : (
        <div className={xp ? 'xp-frame relative flex min-h-0 flex-1' : 'flex min-h-0 flex-1'}>
          {/* First thing Tab reaches, so the whole navigation can be skipped. */}
          <a href="#contenu" className="skip-link">
            Aller au contenu
          </a>
          {xp ? <xp.Nav /> : <Sidebar />}
          <main id="contenu" className="scroll-y relative flex-1" tabIndex={-1}>
            <AnimatePresence mode="wait">
              <motion.div key={routeKey} {...(xp?.motion ?? PAGE_MOTION)}>
                <ScrollOnArrival routeKey={routeKey} />
                <ErrorBoundary resetKey={routeKey} onGoHome={() => navigate({ name: 'home' })}>
                  <Suspense fallback={<Spinner label="Chargement de la page…" />}>
                    {route.name === 'home' && (xp ? <xp.Home /> : nd.home ? <NdHomePage /> : <HomePage />)}
                    {route.name === 'discover' &&
                      (xp?.Discover ? (
                        <xp.Discover initialSearch={route.search} />
                      ) : nd.discover ? (
                        <NdDiscoverPage initialSearch={route.search} />
                      ) : (
                        <DiscoverPage initialSearch={route.search} />
                      ))}
                    {route.name === 'library' &&
                      (xp ? (
                        <xp.Library />
                      ) : nd.library ? (
                        <NdLibraryPage initialGenre={route.genre} />
                      ) : (
                        <LibraryPage initialGenre={route.genre} />
                      ))}
                    {route.name === 'studio' &&
                      (nd.studio ? <NdStudioPage studio={route.studio} /> : <StudioPage studio={route.studio} />)}
                    {route.name === 'person' &&
                      (nd.person ? (
                        <NdPersonPage kind={route.kind} id={route.id} />
                      ) : (
                        <PersonPage kind={route.kind} id={route.id} />
                      ))}
                    {route.name === 'manga' && (xp?.Manga ? <xp.Manga /> : nd.manga ? <NdMangaPage /> : <MangaPage />)}
                    {route.name === 'calendar' &&
                      (xp?.Calendar ? <xp.Calendar /> : nd.calendar ? <NdCalendarPage /> : <CalendarPage />)}
                    {route.name === 'stats' && (xp?.Stats ? <xp.Stats /> : nd.stats ? <NdStatsPage /> : <StatsPage />)}
                    {route.name === 'badges' &&
                      (xp?.Badges ? <xp.Badges /> : nd.stats ? <NdStatsPage focus="badges" /> : <StatsPage />)}
                    {route.name === 'settings' && <SettingsPage />}
                    {route.name === 'season' && <SeasonPage />}
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
