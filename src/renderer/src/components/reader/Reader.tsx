/**
 * Le lecteur de manga, en plein écran par-dessus l'app.
 *
 * Dans <body> comme le lecteur vidéo : un `transform` posé par une transition
 * de page ferait d'un `position: fixed` un faux plein écran. Et `no-drag`
 * pour la même raison que lui — la bande de titre de la fenêtre avale les
 * clics, et l'habillage y pose ses boutons.
 */

import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import type { LocalSeries } from '@shared/types'
import { Spinner } from '@/components/ui'
import { useReader } from './useReader'
import { Cinema, Epure, Livre } from './skins'
import './reader.css'

export default function Reader({
  series,
  volume,
  onClose
}: {
  series: LocalSeries
  volume: string
  onClose: () => void
}): React.JSX.Element {
  const ctl = useReader(series, volume, onClose)
  const Skin = ctl.skin === 'livre' ? Livre : ctl.skin === 'epure' ? Epure : Cinema

  return createPortal(
    <motion.div
      className="rd-root no-drag fixed inset-0 z-[60]"
      data-reader
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
    >
      <Skin ctl={ctl} />
      {ctl.loading && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Spinner label="Ouverture du tome…" />
        </div>
      )}
    </motion.div>,
    document.body
  )
}
