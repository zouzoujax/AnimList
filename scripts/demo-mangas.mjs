/**
 * Des mangas inventés pour les captures du lecteur.
 *
 * Rien n'est tiré d'une œuvre réelle : les pages sont dessinées ici, en SVG —
 * des cases, de la trame, des silhouettes et des bulles. Assez pour juger une
 * interface de lecture, sans verser une seule planche protégée dans un dépôt
 * public.
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

const W = 1200
const H = 1700
const INK = '#16161a'
const PAPER = '#f3efe6'

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const DEFS = `<defs>
  <pattern id="tone" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="6" cy="6" r="2.4" fill="${INK}" opacity=".55"/></pattern>
  <pattern id="tone2" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1.3" fill="${INK}" opacity=".5"/></pattern>
  <pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="3" height="10" fill="${INK}" opacity=".35"/></pattern>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9d4c7"/><stop offset="1" stop-color="${PAPER}"/></linearGradient>
</defs>`

/** Une case : un décor, parfois un personnage, parfois une bulle. */
function panel(x, y, w, h, r, lines) {
  const id = `c${Math.floor(r() * 1e9)}`
  const parts = [
    `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath><g clip-path="url(#${id})">`
  ]
  parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#sky)"/>`)
  const kind = Math.floor(r() * 4)
  if (kind === 0) {
    // Des lignes de vitesse vers un point.
    const cx = x + w * (0.3 + r() * 0.4)
    const cy = y + h * (0.3 + r() * 0.4)
    for (let i = 0; i < 46; i += 1) {
      const a = (i / 46) * Math.PI * 2 + r() * 0.05
      const len = Math.max(w, h)
      parts.push(
        `<line x1="${cx + Math.cos(a) * len * 0.18}" y1="${cy + Math.sin(a) * len * 0.18}" x2="${cx + Math.cos(a) * len}" y2="${cy + Math.sin(a) * len}" stroke="${INK}" stroke-width="${1 + r() * 3}" opacity=".7"/>`
      )
    }
  } else if (kind === 1) {
    // Un horizon, des toits, de la trame au ciel.
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h * 0.55}" fill="url(#tone2)"/>`)
    let px = x
    while (px < x + w) {
      const bw = 40 + r() * 110
      const bh = h * (0.2 + r() * 0.35)
      parts.push(
        `<rect x="${px}" y="${y + h - bh}" width="${bw}" height="${bh}" fill="${INK}" opacity="${0.75 + r() * 0.25}"/>`
      )
      px += bw + 4
    }
  } else if (kind === 2) {
    // La mer, des vagues.
    parts.push(`<rect x="${x}" y="${y + h * 0.5}" width="${w}" height="${h * 0.5}" fill="url(#hatch)"/>`)
    for (let i = 0; i < 6; i += 1) {
      const wy = y + h * (0.52 + i * 0.08)
      let d = `M ${x} ${wy}`
      for (let wx = x; wx <= x + w; wx += 60) d += ` q 15 -14 30 0 t 30 0`
      parts.push(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="3" opacity=".7"/>`)
    }
    parts.push(
      `<circle cx="${x + w * 0.75}" cy="${y + h * 0.28}" r="${Math.min(w, h) * 0.12}" fill="${PAPER}" stroke="${INK}" stroke-width="4"/>`
    )
  } else {
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#tone)"/>`)
  }
  if (r() > 0.35) {
    // Une silhouette : tête, épaules, une mèche.
    const s = Math.min(w, h) * (0.45 + r() * 0.3)
    const cx = x + w * (0.25 + r() * 0.5)
    const base = y + h
    parts.push(
      `<path d="M ${cx - s * 0.55} ${base} C ${cx - s * 0.5} ${base - s * 0.5}, ${cx - s * 0.25} ${base - s * 0.55}, ${cx} ${base - s * 0.56} C ${cx + s * 0.25} ${base - s * 0.55}, ${cx + s * 0.5} ${base - s * 0.5}, ${cx + s * 0.55} ${base} Z" fill="${INK}"/>`,
      `<ellipse cx="${cx}" cy="${base - s * 0.78}" rx="${s * 0.2}" ry="${s * 0.24}" fill="${PAPER}" stroke="${INK}" stroke-width="5"/>`,
      `<path d="M ${cx - s * 0.22} ${base - s * 0.86} Q ${cx} ${base - s * 1.12} ${cx + s * 0.24} ${base - s * 0.84} L ${cx + s * 0.1} ${base - s * 0.9} L ${cx + s * 0.02} ${base - s * 0.8} L ${cx - s * 0.08} ${base - s * 0.9} Z" fill="${INK}"/>`
    )
  }
  if (lines && r() > 0.3) {
    const text = lines[Math.floor(r() * lines.length)]
    const bw = Math.min(w * 0.46, 250)
    const words = text.split(' ')
    const rows = []
    let row = ''
    for (const word of words) {
      if ((row + ' ' + word).trim().length > 12) {
        rows.push(row.trim())
        row = word
      } else row += ' ' + word
    }
    rows.push(row.trim())
    const bh = 40 + rows.length * 30
    const bx = x + (r() > 0.5 ? 24 : w - bw - 24)
    const by = y + 24
    parts.push(
      `<ellipse cx="${bx + bw / 2}" cy="${by + bh / 2}" rx="${bw / 2 + 14}" ry="${bh / 2 + 10}" fill="#fff" stroke="${INK}" stroke-width="4"/>`,
      ...rows.map(
        (t, i) =>
          `<text x="${bx + bw / 2}" y="${by + 44 + i * 30}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="25" font-weight="600" fill="${INK}">${esc(t)}</text>`
      )
    )
  }
  parts.push('</g>')
  parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${INK}" stroke-width="7"/>`)
  return parts.join('')
}

/** Une planche : trois à cinq bandes, découpées en cases. */
function page(seed, lines, width = W) {
  const r = rng(seed)
  const m = 60
  const gap = 22
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${H}" width="${width}" height="${H}">`,
    DEFS
  ]
  out.push(`<rect width="${width}" height="${H}" fill="${PAPER}"/>`)
  const bands = 3 + Math.floor(r() * 2)
  const weights = Array.from({ length: bands }, () => 0.7 + r())
  const total = weights.reduce((a, b) => a + b, 0)
  let y = m
  const usable = H - m * 2 - gap * (bands - 1)
  for (const wgt of weights) {
    const h = (usable * wgt) / total
    const cells = width > W ? 1 + Math.floor(r() * 3) : 1 + Math.floor(r() * 2.6)
    let x = m
    const cw = (width - m * 2 - gap * (cells - 1)) / cells
    for (let c = 0; c < cells; c += 1) {
      out.push(panel(x, y, cw, h, r, lines))
      x += cw + gap
    }
    y += h + gap
  }
  out.push(
    `<text x="${width / 2}" y="${H - 22}" text-anchor="middle" font-family="Segoe UI" font-size="20" fill="${INK}" opacity=".5">${seed % 1000}</text>`
  )
  out.push('</svg>')
  return out.join('')
}

/** La couverture : un aplat de couleur, un grand titre, le numéro du tome. */
function cover(title, label, hue, seed) {
  const r = rng(seed)
  const shapes = []
  for (let i = 0; i < 16; i += 1) {
    shapes.push(
      `<circle cx="${r() * W}" cy="${r() * H}" r="${40 + r() * 260}" fill="hsl(${hue + r() * 40 - 20} 70% ${35 + r() * 30}%)" opacity="${0.25 + r() * 0.4}"/>`
    )
  }
  const s = 760
  const cx = W / 2
  const base = H - 80
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 55% 22%)"/><stop offset="1" stop-color="hsl(${hue + 40} 60% 12%)"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>${shapes.join('')}
  <path d="M ${cx - s * 0.55} ${base} C ${cx - s * 0.5} ${base - s * 0.5}, ${cx - s * 0.25} ${base - s * 0.55}, ${cx} ${base - s * 0.56} C ${cx + s * 0.25} ${base - s * 0.55}, ${cx + s * 0.5} ${base - s * 0.5}, ${cx + s * 0.55} ${base} Z" fill="#0b0b10"/>
  <ellipse cx="${cx}" cy="${base - s * 0.78}" rx="${s * 0.2}" ry="${s * 0.24}" fill="hsl(${hue} 30% 85%)"/>
  <path d="M ${cx - s * 0.24} ${base - s * 0.84} Q ${cx} ${base - s * 1.16} ${cx + s * 0.26} ${base - s * 0.82} L ${cx + s * 0.1} ${base - s * 0.9} L ${cx} ${base - s * 0.78} L ${cx - s * 0.1} ${base - s * 0.9} Z" fill="#0b0b10"/>
  <rect x="0" y="${H - 80}" width="${W}" height="80" fill="#0b0b10"/>
  <text x="70" y="190" font-family="Segoe UI, sans-serif" font-size="${title.length > 16 ? 92 : 118}" font-weight="800" fill="#fff" letter-spacing="-2">${esc(title)}</text>
  <text x="74" y="262" font-family="Segoe UI, sans-serif" font-size="44" font-weight="600" fill="hsl(${hue} 80% 75%)">${esc(label)}</text>
</svg>`
}

const SERIES = [
  {
    title: 'Le Veilleur des marées',
    hue: 195,
    volumes: [
      { name: 'Tome 01', pages: 20, spread: 7 },
      { name: 'Tome 02', pages: 10 },
      { name: 'Tome 03', pages: 8 }
    ],
    lines: [
      'La marée monte déjà.',
      'Tu entends ça ?',
      'Pas encore…',
      'Le phare s’est éteint.',
      'On part à l’aube.',
      'Attends-moi !'
    ]
  },
  {
    title: 'Nuit d’acier',
    hue: 350,
    volumes: [
      { name: 'Tome 01', pages: 9 },
      { name: 'Tome 02', pages: 9 }
    ],
    lines: ['Ils arrivent.', 'Recule !', 'C’est maintenant ou jamais.', 'Encore une fois…']
  },
  {
    title: 'Petites saisons',
    hue: 95,
    volumes: [
      { name: 'Chapitre 1', pages: 7 },
      { name: 'Chapitre 2', pages: 7 },
      { name: 'Chapitre 3', pages: 7 },
      { name: 'Chapitre 4', pages: 7 }
    ],
    lines: ['Il neige !', 'Le thé est prêt.', 'On se voit demain ?', 'Quelle belle journée.']
  },
  {
    title: 'Hors-champ',
    hue: 40,
    oneShot: 8,
    lines: ['Coupez !', 'On la refait.', 'Silence, ça tourne.']
  }
]

/**
 * Écrit la bibliothèque de démonstration sous `dir/mangas` et rend le fichier
 * de progression qui va avec : un tome fini, un en cours, un ouvert il y a
 * longtemps, le reste jamais ouvert.
 */
export async function writeDemoMangas(dir) {
  const root = join(dir, 'mangas')
  let seed = 11
  const paths = {}
  for (const series of SERIES) {
    const folder = join(root, series.title)
    await fs.mkdir(folder, { recursive: true })
    const volumes = series.oneShot ? [{ name: null, pages: series.oneShot }] : series.volumes
    for (const volume of volumes) {
      const target = volume.name ? join(folder, volume.name) : folder
      await fs.mkdir(target, { recursive: true })
      const label = volume.name ?? 'One-shot'
      for (let i = 0; i < volume.pages; i += 1) {
        seed += 1
        const svg =
          i === 0
            ? cover(series.title, label, series.hue, seed)
            : page(seed, series.lines, volume.spread === i ? W * 2 : W)
        await fs.writeFile(join(target, `${String(i + 1).padStart(3, '0')}.svg`), svg, 'utf8')
      }
      paths[`${series.title}/${label}`] = { path: target, pages: volume.pages }
    }
  }

  const now = Date.now()
  const at = (key, page, hoursAgo) => [
    paths[key].path,
    { page, pages: paths[key].pages, updatedAt: now - hoursAgo * 3600_000 }
  ]
  const progress = Object.fromEntries([
    at('Le Veilleur des marées/Tome 01', 19, 30),
    at('Le Veilleur des marées/Tome 02', 5, 2),
    at('Nuit d’acier/Tome 01', 3, 24 * 9)
  ])
  await fs.writeFile(join(dir, 'animelist-manga.json'), JSON.stringify({ root, progress }), 'utf8')
}
