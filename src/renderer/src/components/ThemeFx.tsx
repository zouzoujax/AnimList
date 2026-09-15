import { useEffect, useRef } from 'react'
import { useApp } from '@/store/app'

/*
 * Fonds animés des thèmes « UI UX Pro Max ». Chacun reprend un composant du
 * catalogue Magic UI, lu par son serveur MCP, puis réécrit ici : sans `cn`,
 * sans tirage au hasard à chaque rendu, et avec les couleurs du thème actif.
 *
 * Les effets qui tiennent en CSS (Border Beam, Shine Border, Magic Card, Dot
 * Pattern, Aurora Text) vivent dans themes/ui-ux-pro-max.css.
 */

/** Même graine, même ciel : une capture refaite doit retomber pareil. */
function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const accent = (): string => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c5cff'

/** Prépare un dessin pour une taille donnée et rend la fonction appelée à chaque image. */
type Painter = (ctx: CanvasRenderingContext2D, width: number, height: number) => (now: number) => void

function Canvas({ paint, mask }: { paint: Painter; mask?: string }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduceMotion = useApp((s) => s.prefs.reduceMotion)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let step: (now: number) => void = () => {}
    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      step = paint(ctx, canvas.clientWidth, canvas.clientHeight)
      step(performance.now())
    }
    resize()
    window.addEventListener('resize', resize)

    // Mouvement réduit : la première image reste, rien ne bouge ensuite.
    let frame = 0
    if (!reduceMotion) {
      const loop = (now: number): void => {
        step(now)
        frame = requestAnimationFrame(loop)
      }
      frame = requestAnimationFrame(loop)
    }
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [paint, reduceMotion])

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" style={{ maskImage: mask }} />
}

/** Magic UI « Flickering Grid » : une trame de pixels qui s'allument et s'éteignent. */
const flicker: Painter = (ctx, width, height) => {
  const size = 4
  const pitch = 11
  const cols = Math.ceil(width / pitch)
  const rows = Math.ceil(height / pitch)
  const rand = seeded(11)
  const alpha = Float32Array.from({ length: cols * rows }, () => rand() * 0.28)
  // L'accent du thème, et le rouge et le bleu de la palette Pixel Art.
  const palette = [accent(), '#dc2626', '#2563eb']
  let last = -Infinity

  return (now) => {
    // Une dizaine d'images par seconde : un écran d'arcade clignote, il ne coule pas.
    if (now - last < 110) return
    last = now
    for (let k = 0; k < alpha.length * 0.03; k += 1) alpha[Math.floor(rand() * alpha.length)] = rand() * 0.28
    ctx.clearRect(0, 0, width, height)
    for (let i = 0; i < alpha.length; i += 1) {
      ctx.globalAlpha = alpha[i]
      ctx.fillStyle = palette[i % 13 === 0 ? 1 : i % 7 === 0 ? 2 : 0]
      ctx.fillRect((i % cols) * pitch, Math.floor(i / cols) * pitch, size, size)
    }
  }
}

/** Magic UI « Particles » : des bulles pastel qui remontent lentement. */
const bubbles: Painter = (ctx, width, height) => {
  const rand = seeded(3)
  const palette = [accent(), '#0284c7', '#f9a8d4', '#c4b5fd', '#fcd34d']
  const dots = Array.from({ length: 70 }, (_, i) => ({
    x: rand() * width,
    y: rand() * height,
    r: 1.5 + rand() * 4,
    dx: (rand() - 0.5) * 0.25,
    dy: -0.1 - rand() * 0.3,
    a: 0.25 + rand() * 0.45,
    color: palette[i % palette.length]
  }))

  return () => {
    ctx.clearRect(0, 0, width, height)
    for (const dot of dots) {
      dot.x += dot.dx
      dot.y += dot.dy
      if (dot.y < -10) {
        dot.y = height + 10
        dot.x = rand() * width
      }
      if (dot.x < -10) dot.x = width + 10
      else if (dot.x > width + 10) dot.x = -10
      ctx.globalAlpha = dot.a
      ctx.fillStyle = dot.color
      ctx.beginPath()
      ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

const METEORS = (() => {
  const rand = seeded(7)
  return Array.from({ length: 16 }, () => ({
    left: `${Math.round(rand() * 115)}%`,
    delay: `${(rand() * 8).toFixed(2)}s`,
    duration: `${(4 + rand() * 7).toFixed(2)}s`
  }))
})()

/** Magic UI « Meteors ». */
function Meteors(): React.JSX.Element {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {METEORS.map((m, i) => (
        <span
          key={i}
          className="fx-meteor"
          style={{ left: m.left, animationDelay: m.delay, animationDuration: m.duration }}
        />
      ))}
    </div>
  )
}

const CELL = 40
const CELLS = (() => {
  const rand = seeded(23)
  return Array.from({ length: 34 }, () => ({
    x: Math.floor(rand() * 48) * CELL,
    y: Math.floor(rand() * 28) * CELL,
    delay: `${(rand() * 8).toFixed(2)}s`
  }))
})()

/** Magic UI « Animated Grid Pattern » : une grille dont des cases s'allument. */
function AnimatedGrid(): React.JSX.Element {
  return (
    <svg
      aria-hidden
      className="absolute inset-0 h-full w-full"
      style={{ maskImage: 'radial-gradient(ellipse 85% 70% at 50% 25%, #000, transparent)' }}
    >
      <defs>
        <pattern id="fx-grid-pattern" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
          <path d={`M.5 ${CELL}V.5H${CELL}`} fill="none" style={{ stroke: 'var(--fx-grid-line)' }} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#fx-grid-pattern)" />
      {CELLS.map((c, i) => (
        <rect
          key={i}
          className="fx-grid-cell"
          x={c.x + 1}
          y={c.y + 1}
          width={CELL - 1}
          height={CELL - 1}
          style={{ animationDelay: c.delay }}
        />
      ))}
    </svg>
  )
}

/** Magic UI « Ripple » : des cercles concentriques, comme un sable ratissé. */
function Ripple(): React.JSX.Element {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ maskImage: 'linear-gradient(to bottom, #000, transparent)' }}
    >
      {Array.from({ length: 8 }, (_, i) => (
        <span
          key={i}
          className="fx-ripple"
          style={{
            width: 220 + i * 110,
            height: 220 + i * 110,
            opacity: 0.5 - i * 0.055,
            animationDelay: `${i * 0.06}s`,
            borderStyle: i === 7 ? 'dashed' : 'solid'
          }}
        />
      ))}
    </div>
  )
}

const RAYS = (() => {
  const rand = seeded(5)
  return Array.from({ length: 8 }, (_, i) => {
    const duration = 14 * (0.75 + rand() * 0.5)
    return {
      left: `${8 + rand() * 84}%`,
      width: 160 + rand() * 160,
      rotate: -28 + rand() * 56,
      swing: 0.8 + rand() * 1.8,
      intensity: 0.6 + rand() * 0.5,
      delay: `${(rand() * 14).toFixed(2)}s`,
      duration: `${duration.toFixed(2)}s`,
      alt: i % 3 === 2
    }
  })
})()

/** Magic UI « Light Rays » : des rideaux de lumière qui descendent du haut. */
function LightRays(): React.JSX.Element {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {RAYS.map((ray, i) => (
        <span
          key={i}
          className={ray.alt ? 'fx-ray fx-ray-alt' : 'fx-ray'}
          style={
            {
              left: ray.left,
              width: ray.width,
              animationDelay: ray.delay,
              animationDuration: ray.duration,
              '--ray-rotate': `${ray.rotate}deg`,
              '--ray-swing': `${ray.swing}deg`,
              '--ray-intensity': ray.intensity
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}

export function ThemeFx(): React.JSX.Element | null {
  const theme = useApp((s) => s.prefs.theme)
  switch (theme) {
    case 'oled':
      return <Meteors />
    case 'arcade':
      return <Canvas paint={flicker} mask="radial-gradient(ellipse 90% 75% at 50% 0%, #000, transparent)" />
    case 'kawaii':
      return <Canvas paint={bubbles} />
    case 'cyber':
      return <AnimatedGrid />
    case 'washi':
      return <Ripple />
    case 'boreal':
      return <LightRays />
    default:
      return null
  }
}
