/**
 * Un QR code, dessiné sur place.
 *
 * L'encodage vient de `qrcode-generator` — sans dépendance, embarqué : la
 * politique de sécurité de la fenêtre n'autorise aucun script venu d'ailleurs,
 * et un QR servi par une image distante enverrait l'adresse de la
 * télécommande, mot de passe compris, à un site tiers.
 *
 * Le fond est blanc et les modules noirs, quel que soit le thème. Ce n'est pas
 * un oubli : un lecteur cherche du sombre sur du clair, et un code teinté à
 * l'accent de l'app sur fond nuit est joli et illisible.
 */

import { useMemo } from 'react'
import qrcode from 'qrcode-generator'
import { qrPath, qrSize } from '@shared/qr'

export default function QrCode({
  text,
  size = 168,
  label
}: {
  text: string
  size?: number
  /** Description pour qui n'aperçoit pas l'image. */
  label?: string
}): React.JSX.Element | null {
  const drawn = useMemo(() => {
    try {
      // Type 0 : la bibliothèque choisit la plus petite version qui contient
      // le texte. Correction « M » — le compromis d'usage, qui tolère un écran
      // sale ou un angle de prise de vue moyen sans grossir le code.
      const code = qrcode(0, 'M')
      code.addData(text)
      code.make()
      const count = code.getModuleCount()
      return { path: qrPath((row, col) => code.isDark(row, col), count), side: qrSize(count) }
    } catch {
      // Un texte trop long pour la plus grande version : rien à dessiner, et
      // l'adresse reste affichée juste à côté de toute façon.
      return null
    }
  }, [text])

  if (!drawn) return null

  return (
    <svg
      viewBox={`0 0 ${drawn.side} ${drawn.side}`}
      width={size}
      height={size}
      role="img"
      aria-label={label ?? 'QR code'}
      shapeRendering="crispEdges"
      className="rounded-[10px]"
      style={{ background: '#fff' }}
    >
      <path d={drawn.path} fill="#000" />
    </svg>
  )
}
