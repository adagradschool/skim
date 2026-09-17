import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * The first thing a new reader sees. A closed book opens into a spread; the
 * first sentence is marked; the cover fades and the page itself turns into
 * the reading screen, the marked sentence growing into the first card. The
 * cards play through, the scene fades, and it starts again.
 *
 * Everything is one element tree: nothing is swapped out, so every step is a
 * transition, and the lift is measured from the sentence's real position.
 */

const BOOK = 'Pride and Prejudice'
const AUTHOR = 'Jane Austen'
const COVER = 'https://standardebooks.org/images/covers/jane-austen_pride-and-prejudice/495dd49502f1fd5609a27a16f5af2f0a387accb4/cover.jpg'
/* Skeleton text: line widths in percent. The first MARKED page lines become card 0. */
const PAGE_LINES = [92, 84, 96, 70, 88, 94, 80, 90, 62, 86, 78]
const MARKED = 3
const CARDS: number[][] = [
  [92, 84, 96],
  [88, 96, 74, 50],
  [90, 80, 95, 68],
  [86, 60],
]
/* geometry of the morphing block, in px */
const PAD = 12
const PAGE_LINE = { h: 4, gap: 5, top: 26 }
const CARD_LINE = { h: 9, gap: 10 }

const W = 184
const H = 276

type Phase = 'closed' | 'open' | 'mark' | 'lift' | 'cards' | 'reset'
const T: Record<Phase, number> = { closed: 1400, open: 1300, mark: 800, lift: 1000, cards: 2600, reset: 700 }
const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)'

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

export function SkimDemo({ className = '' }: { className?: string }) {
  const [phase, setPhase] = useState<Phase>(() => (reducedMotion() ? 'cards' : 'closed'))
  const [card, setCard] = useState(0)
  const [prevCard, setPrevCard] = useState<number | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const prevRef = useRef<HTMLDivElement>(null)

  // timeline
  useEffect(() => {
    if (reducedMotion()) return
    const t = window.setTimeout(() => {
      switch (phase) {
        case 'closed': return setPhase('open')
        case 'open': return setPhase('mark')
        case 'mark': return setPhase('lift')
        case 'lift': return setPhase('cards')
        case 'cards':
          if (card + 1 < CARDS.length) {
            setPrevCard(card)
            setCard(card + 1)
          } else setPhase('reset')
          return
        case 'reset':
          setCard(0)
          setPrevCard(null)
          setPhase('closed')
      }
    }, T[phase])
    return () => window.clearTimeout(t)
  }, [phase, card])

  // card advance: previous slides up and out, next slides in from below
  useLayoutEffect(() => {
    if (prevCard === null || reducedMotion()) return
    prevRef.current?.animate(
      [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-36px)', opacity: 0 }],
      { duration: 450, easing: EASE, fill: 'forwards' }
    )
    cardRef.current?.animate(
      [{ transform: 'translateY(36px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 450, easing: EASE, fill: 'both' }
    )
    const t = window.setTimeout(() => setPrevCard(null), 500)
    return () => window.clearTimeout(t)
  }, [prevCard, card])

  const open = phase !== 'closed' && phase !== 'reset'
  const spread = phase === 'open' || phase === 'mark'
  const marked = phase === 'mark'
  const screen = phase === 'lift' || phase === 'cards' || phase === 'reset'
  const chromeOn = phase === 'cards' || phase === 'reset'
  const sceneShift = spread ? -W / 2 : -W

  return (
    <div
      className={`demo-fade relative mx-auto ${phase === 'reset' ? 'opacity-0' : 'opacity-100'} ${className}`}
      style={{ width: W, height: H }}
      aria-hidden="true"
    >
      <div className="demo-scene demo-ease absolute left-0 top-0" style={{ width: W * 2, height: H, transform: `translateX(${sceneShift}px)` }}>
        {/* page edges (paper only) */}
        <span
          className={`demo-fade absolute inset-y-[4px] -right-[4px] w-[4px] rounded-r-sm border-y-2 border-r-2 border-border bg-[#e8e2d0] ${screen ? 'opacity-0' : 'opacity-100'}`}
          style={{ left: W * 2 - 2 }}
        />

        {/* the page, which becomes the screen */}
        <div
          className={`demo-page absolute top-0 flex h-full flex-col overflow-hidden rounded-nb border-2 border-border p-3 ${screen ? 'bg-bg bg-dots' : 'bg-[#fffdf7]'}`}
          style={{ left: W, width: W, boxShadow: screen ? 'var(--shadow-nb-lg)' : 'none' }}
        >
          {/* paper text */}
          <div className={`demo-fade absolute inset-3 ${screen ? 'opacity-0' : 'opacity-100'}`}>
            <span className="block h-[4px] w-[34%] rounded-full bg-black/35" />
            {/* room for the marked block, which is rendered separately so it can morph */}
            <div style={{ height: MARKED * PAGE_LINE.h + (MARKED - 1) * PAGE_LINE.gap + 8, marginTop: 10 }} />
            <div className="mt-[5px] px-1">
              {PAGE_LINES.slice(MARKED).map((w, i) => (
                <span key={i} className="mb-[5px] block h-[4px] rounded-full bg-black/80" style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>

          {/* the marked lines: one element that morphs from its place on the page into the first card */}
          <MorphBlock marked={marked} lifted={screen} hidden={screen && card > 0} />

          {/* reader chrome */}
          <div className={`demo-fade flex gap-1 ${chromeOn ? 'opacity-100' : 'opacity-0'}`}>
            {CARDS.map((_, i) => (
              <span key={i} className="relative h-1.5 flex-1 overflow-hidden rounded-full border border-border bg-white">
                {i < card ? <span className="absolute inset-0 bg-black" /> : null}
                {i === card && phase === 'cards' ? (
                  <span key={card} className="demo-progress absolute inset-y-0 left-0 bg-black" style={{ animationDuration: `${T.cards}ms` }} />
                ) : null}
              </span>
            ))}
          </div>
          <span className={`demo-fade mt-2.5 block h-[4px] w-[40%] rounded-full bg-black/35 ${chromeOn ? 'opacity-100' : 'opacity-0'}`} />

          {/* the card text; rendered only once the screen exists so the lift can measure it */}
          <div className="relative flex flex-1 items-center">
            {prevCard !== null ? (
              <div ref={prevRef} className="absolute inset-x-0">
                <Bars widths={CARDS[prevCard]!} />
              </div>
            ) : null}
            {screen && card > 0 ? (
              <div ref={cardRef} key={card} className="w-full">
                <Bars widths={CARDS[card]!} />
              </div>
            ) : null}
          </div>
          <div className={`demo-fade text-center text-[8px] font-extrabold uppercase tracking-widest text-fg-muted/70 ${chromeOn ? 'opacity-100' : 'opacity-0'}`}>
            {BOOK}
          </div>
        </div>

        {/* the cover, hinged on the spine */}
        <div className={`demo-cover absolute top-0 h-full ${open ? 'open' : ''}`} style={{ left: W, width: W }}>
          <div className={`demo-face rounded-nb border-2 border-border bg-black shadow-[var(--shadow-nb-lg)] ${screen ? 'opacity-0' : 'opacity-100'}`}>
            <CoverArt />
          </div>
          <div className={`demo-face demo-face-back rounded-nb border-2 border-border bg-[#f4efe0] p-3 ${screen ? 'opacity-0' : 'opacity-100'}`}>
            <div className="mt-10 text-center font-display text-[10px] uppercase leading-tight text-black/70">{BOOK}</div>
            <div className="mt-1.5 text-center text-[6.5px] font-extrabold uppercase tracking-widest text-black/50">{AUTHOR}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MorphBlock({ marked, lifted, hidden }: { marked: boolean; lifted: boolean; hidden: boolean }) {
  const widths = CARDS[0]!
  const line = lifted ? CARD_LINE : PAGE_LINE
  const blockH = widths.length * line.h + (widths.length - 1) * line.gap
  const top = lifted ? (H - 4 - blockH) / 2 : PAGE_LINE.top
  return (
    <div
      className="demo-morph absolute rounded-[3px]"
      style={{
        left: PAD,
        right: PAD,
        top,
        padding: lifted ? 0 : 4,
        margin: lifted ? 0 : -4,
        backgroundColor: marked ? 'var(--color-yellow)' : 'transparent',
        opacity: hidden ? 0 : 1,
        transitionProperty: 'top, padding, margin, background-color, opacity',
        transitionDuration: '0.9s, 0.9s, 0.9s, 0.5s, 0s',
      }}
    >
      {widths.map((w, i) => (
        <span
          key={i}
          className="demo-morph block rounded-full"
          style={{
            width: `${w}%`,
            height: line.h,
            marginBottom: i < widths.length - 1 ? line.gap : 0,
            backgroundColor: lifted ? '#000' : 'rgba(0,0,0,0.8)',
            transitionProperty: 'height, margin-bottom, background-color',
            transitionDuration: '0.9s',
          }}
        />
      ))}
    </div>
  )
}

function Bars({ widths }: { widths: number[] }) {
  return (
    <div>
      {widths.map((w, i) => (
        <span key={i} className="mb-2.5 block h-[9px] rounded-full bg-black last:mb-0" style={{ width: `${w}%` }} />
      ))}
    </div>
  )
}

function CoverArt() {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className="flex h-full flex-col justify-end bg-yellow p-3 text-black">
        <div className="font-display text-[13px] uppercase leading-tight">{BOOK}</div>
        <div className="mt-1 text-[7px] font-extrabold uppercase tracking-widest">{AUTHOR}</div>
      </div>
    )
  }
  return <img src={COVER} alt="" draggable={false} onError={() => setFailed(true)} className="h-full w-full object-cover" />
}
