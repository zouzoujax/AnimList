/**
 * La position de défilement de chaque page, pour la retrouver au retour.
 *
 * Relevée au moment de partir, pas à chaque défilement : pendant la sortie
 * d'une page, la nouvelle raccourcit le conteneur et le navigateur rabote la
 * position, ce qui écraserait la vraie par une fausse.
 */
const positions = new Map<string, number>()

function container(): HTMLElement | null {
  return document.getElementById('contenu')
}

export function rememberScroll(key: string): void {
  const box = container()
  if (box) positions.set(key, box.scrollTop)
}

/**
 * Ramène la page à sa position, ou en haut pour une page neuve.
 *
 * La page arrive par morceaux (code chargé à la demande, puis données) : tant
 * qu'elle n'est pas assez haute, on réessaie à chaque image, deux secondes au
 * plus. Un geste de l'utilisateur arrête tout : il a déjà repris la main.
 */
export function restoreScroll(key: string, returning: boolean): () => void {
  const box = container()
  if (!box) return () => {}
  const target = returning ? (positions.get(key) ?? 0) : 0
  box.scrollTo({ top: target })
  if (target === 0) return () => {}

  let frame = 0
  const started = performance.now()
  const stop = (): void => {
    cancelAnimationFrame(frame)
    box.removeEventListener('wheel', stop)
    box.removeEventListener('pointerdown', stop)
    window.removeEventListener('keydown', stop)
  }
  const tick = (): void => {
    box.scrollTo({ top: target })
    if (Math.abs(box.scrollTop - target) < 2 || performance.now() - started > 2000) return stop()
    frame = requestAnimationFrame(tick)
  }
  box.addEventListener('wheel', stop, { passive: true })
  box.addEventListener('pointerdown', stop)
  window.addEventListener('keydown', stop)
  frame = requestAnimationFrame(tick)
  return stop
}
