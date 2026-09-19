/*
 * Polices des thèmes ajoutés en septembre 2026, embarquées avec l'app : elle
 * marche hors ligne, et un lien Google Fonts laisserait un thème sans sa
 * typographie.
 *
 * Seuls les alphabets latin et latin étendu sont gardés : les feuilles de
 * Fontsource déclarent aussi le cyrillique, le grec, le vietnamien ou le
 * devanagari, que l'app n'affiche jamais et qui doublaient le poids des polices.
 * Fichier généré depuis les feuilles de Fontsource — relancer le script plutôt
 * que de le modifier à la main.
 *
 * Chaque police est déclarée par l'API FontFace : comme une règle @font-face,
 * elle n'est téléchargée que lorsqu'un texte l'utilise.
 */
import '@fontsource/press-start-2p/latin-400.css'
import '@fontsource/vt323/latin-400.css'
import f0 from '@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2?url'
import f1 from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'
import f2 from '@fontsource-variable/dm-sans/files/dm-sans-latin-ext-wght-normal.woff2?url'
import f3 from '@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2?url'
import f4 from '@fontsource-variable/space-grotesk/files/space-grotesk-latin-ext-wght-normal.woff2?url'
import f5 from '@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2?url'
import f6 from '@fontsource-variable/baloo-2/files/baloo-2-latin-ext-wght-normal.woff2?url'
import f7 from '@fontsource-variable/baloo-2/files/baloo-2-latin-wght-normal.woff2?url'
import f8 from '@fontsource-variable/orbitron/files/orbitron-latin-wght-normal.woff2?url'
import f9 from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-normal.woff2?url'
import f10 from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url'
import f11 from '@fontsource-variable/outfit/files/outfit-latin-ext-wght-normal.woff2?url'
import f12 from '@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2?url'
import f13 from '@fontsource-variable/work-sans/files/work-sans-latin-ext-wght-normal.woff2?url'
import f14 from '@fontsource-variable/work-sans/files/work-sans-latin-wght-normal.woff2?url'
import f15 from '@fontsource-variable/cormorant/files/cormorant-latin-ext-wght-normal.woff2?url'
import f16 from '@fontsource-variable/cormorant/files/cormorant-latin-wght-normal.woff2?url'
import f17 from '@fontsource-variable/montserrat/files/montserrat-latin-ext-wght-normal.woff2?url'
import f18 from '@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2?url'
import f19 from '@fontsource-variable/playfair-display/files/playfair-display-latin-ext-wght-italic.woff2?url'
import f20 from '@fontsource-variable/playfair-display/files/playfair-display-latin-wght-italic.woff2?url'

const FACES: [family: string, url: string, style: string, weight: string, unicodeRange: string][] = [
  [
    'Inter Variable',
    f0,
    'normal',
    '100 900',
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'
  ],
  [
    'Inter Variable',
    f1,
    'normal',
    '100 900',
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
  ],
  [
    'DM Sans Variable',
    f2,
    'normal',
    '100 1000',
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'
  ],
  [
    'DM Sans Variable',
    f3,
    'normal',
    '100 1000',
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
  ],
  [
    'Space Grotesk Variable',
    f4,
    'normal',
    '300 700',
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'
  ],
  [
    'Space Grotesk Variable',
    f5,
    'normal',
    '300 700',
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
  ],
  [
    'Baloo 2 Variable',
    f6,
    'normal',
    '400 800',
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'
  ],
  [
    'Baloo 2 Variable',
    f7,
    'normal',
    '400 800',
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
  ],
  [
    'Orbitron Variable',
    f8,
    'normal',
    '400 900',
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
  ],
  [
    'JetBrains Mono Variable',
    f9,
    'normal',
    '100 800',
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'
  ],
  [
    'JetBrains Mono Variable',
    f10,
    'normal',
    '100 800',
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
  ],
  [
    'Outfit Variable',
    f11,
    'normal',
    '100 900',
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'
  ],
  [
    'Outfit Variable',
    f12,
    'normal',
    '100 900',
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
  ],
  [
    'Work Sans Variable',
    f13,
    'normal',
    '100 900',
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'
  ],
  [
    'Work Sans Variable',
    f14,
    'normal',
    '100 900',
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
  ],
  [
    'Cormorant Variable',
    f15,
    'normal',
    '300 700',
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'
  ],
  [
    'Cormorant Variable',
    f16,
    'normal',
    '300 700',
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
  ],
  [
    'Montserrat Variable',
    f17,
    'normal',
    '100 900',
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'
  ],
  [
    'Montserrat Variable',
    f18,
    'normal',
    '100 900',
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
  ],
  [
    'Playfair Display Variable',
    f19,
    'italic',
    '400 900',
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'
  ],
  [
    'Playfair Display Variable',
    f20,
    'italic',
    '400 900',
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
  ]
]

for (const [family, url, style, weight, unicodeRange] of FACES) {
  document.fonts.add(
    new FontFace(family, `url(${url}) format('woff2')`, { style, weight, unicodeRange, display: 'swap' })
  )
}
