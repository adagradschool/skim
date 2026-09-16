import type { ReaderProfile } from '@/gamification/score'
import { levelFor } from '@/gamification/score'
import { INTERESTS } from '@/onboarding/interests'

interface ReaderCardProps {
  profile: ReaderProfile
  points: number
  booksFinished: number
  className?: string
}

/**
 * The membership card: minted at the end of onboarding, kept on the library
 * page. Pure HTML so the text always has room; sized with container units so
 * it scales with its parent width.
 */
export function ReaderCard({ profile, points, booksFinished, className = '' }: ReaderCardProps) {
  const level = levelFor(points)
  const joined = new Date(profile.joinedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const interests = profile.interests
    .map((id) => INTERESTS.find((i) => i.id === id)?.label)
    .filter(Boolean)
    .slice(0, 3)
    .join(' · ')

  return (
    <div className={`w-full select-none [container-type:inline-size] ${className}`}>
      <div
        className="relative aspect-[400/240] w-full overflow-hidden rounded-nb border-2 border-border bg-yellow text-black"
        style={{ boxShadow: 'var(--shadow-nb-lg)' }}
      >
        {/* corner stripes */}
        <div
          className="pointer-events-none absolute -right-[10cqw] -top-[10cqw] h-[34cqw] w-[34cqw] rotate-45 border-2 border-border"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, #fd9745 0 3cqw, #000 3cqw 3.9cqw)',
          }}
        />

        <div className="absolute inset-0 flex flex-col justify-between p-[5cqw]">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[2.7cqw] font-extrabold uppercase tracking-[0.28em] opacity-70">Skim reader</div>
              <div className="font-display text-[10cqw] leading-none">#{String(profile.readerNumber).padStart(4, '0')}</div>
            </div>
            <div className="nb-chip relative z-10 bg-white text-[2.6cqw] text-black">{level.name}</div>
          </div>

          <div className="flex items-end justify-between gap-[4cqw]">
            <div className="flex min-w-0 items-end gap-[3cqw]">
              <BookStack className="h-[13cqw] w-[15cqw] shrink-0" />
              <div className="min-w-0">
                <div className="truncate text-[3.4cqw] font-extrabold leading-tight">{interests || 'Curious about everything'}</div>
                <div className="mt-[1cqw] text-[2.5cqw] font-extrabold uppercase tracking-[0.16em] opacity-70">
                  Since {joined} · {profile.targetMinutes} min/day
                </div>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-display text-[8cqw] leading-none tabular-nums">{points.toLocaleString()}</div>
              <div className="text-[2.4cqw] font-extrabold uppercase tracking-[0.2em] opacity-70">
                pts · {booksFinished} {booksFinished === 1 ? 'book' : 'books'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function BookStack({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 52" className={className} aria-hidden="true">
      <g stroke="#000" strokeWidth="4" strokeLinejoin="round">
        <path d="M6 42 L14 30 L54 30 L46 42 Z" fill="#88aaee" />
        <path d="M10 30 L18 18 L58 18 L50 30 Z" fill="#a3e636" />
        <path d="M14 18 L22 6 L62 6 L54 18 Z" fill="#ff6b9d" />
      </g>
    </svg>
  )
}
