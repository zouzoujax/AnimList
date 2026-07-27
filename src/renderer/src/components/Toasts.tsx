import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useApp } from '@/store/app'

const ICONS = {
  ok: CircleCheck,
  error: TriangleAlert,
  info: Info
} as const

const TINTS = {
  ok: 'var(--accent-2)',
  error: '#ff6b6b',
  info: 'var(--accent)'
} as const

export function Toasts(): React.JSX.Element {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[min(380px,90vw)] flex-col gap-2.5">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const Icon = ICONS[toast.kind]
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 24, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="glass-blur pointer-events-auto flex items-start gap-3 rounded-2xl px-3.5 py-3 shadow-2xl"
            >
              <Icon size={17} style={{ color: TINTS[toast.kind] }} className="mt-0.5 shrink-0" />
              <p className="flex-1 text-[0.82rem] leading-snug">{toast.message}</p>
              <button className="icon-btn !h-6 !w-6" onClick={() => dismiss(toast.id)} aria-label="Fermer">
                <X size={13} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
