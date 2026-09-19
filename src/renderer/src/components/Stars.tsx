import { Star } from 'lucide-react'
import { useState } from 'react'

/**
 * Une note sur dix, en cinq étoiles coupées en deux.
 *
 * Sortie de la fiche : la fenêtre « Série terminée » la propose aussi, au
 * moment où l'avis est le plus frais. Recliquer la note donnée l'efface.
 */
export function Stars({
  value,
  onChange
}: {
  value: number | null
  onChange: (v: number | null) => void
}): React.JSX.Element {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0

  return (
    <div className="flex items-center gap-2">
      <div className="flex" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((star) => {
          const full = shown >= star * 2
          const half = !full && shown >= star * 2 - 1
          return (
            <span key={star} className="relative h-7 w-7">
              <Star size={26} className="absolute inset-0 text-white/14" fill="currentColor" strokeWidth={0} />
              {(full || half) && (
                <span className="absolute inset-0 overflow-hidden" style={{ width: full ? '100%' : '50%' }}>
                  <Star size={26} className="text-amber-300" fill="currentColor" strokeWidth={0} />
                </span>
              )}
              {[star * 2 - 1, star * 2].map((score, i) => (
                <button
                  key={score}
                  onMouseEnter={() => setHover(score)}
                  onClick={() => onChange(value === score ? null : score)}
                  aria-label={`Noter ${score} sur 10`}
                  className="absolute top-0 h-full w-1/2"
                  style={{ left: i === 0 ? 0 : '50%' }}
                />
              ))}
            </span>
          )
        })}
      </div>
      <span className="w-14 text-[0.82rem] font-semibold tabular-nums">
        {shown > 0 ? `${shown}/10` : <span className="text-faint">—</span>}
      </span>
    </div>
  )
}
