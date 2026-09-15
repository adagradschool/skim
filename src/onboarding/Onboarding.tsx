import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { importService } from '@/importer/ImportService'
import { gamification, type ReaderProfile } from '@/gamification/score'
import { ReaderCard } from '@/components/ReaderCard'
import { INTERESTS, STARTER_BOOKS, recommendedFor, type Interest } from './starterBooks'

interface OnboardingProps {
  onDone: () => void
}

type Step = 'intro' | 'interests' | 'target' | 'shelf' | 'card'
const STEPS: Step[] = ['intro', 'interests', 'target', 'shelf', 'card']

const TARGETS = [
  { minutes: 10, label: '10 min', note: 'A chapter of something short' },
  { minutes: 20, label: '20 min', note: 'A book every few weeks' },
  { minutes: 30, label: '30 min', note: 'Serious reader' },
]

export function Onboarding({ onDone }: OnboardingProps) {
  const [step, setStep] = useState<Step>('intro')
  const [interests, setInterests] = useState<Interest[]>([])
  const [target, setTarget] = useState<number>(20)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState<{ current: string; done: number; total: number } | null>(null)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [profile, setProfile] = useState<ReaderProfile | null>(null)
  const [lit, setLit] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setLit(true), 250)
    return () => window.clearTimeout(t)
  }, [])

  const recommended = useMemo(() => recommendedFor(interests), [interests])

  useEffect(() => {
    if (step === 'shelf') {
      setPicked((prev) => (prev.size === 0 ? new Set(recommended) : prev))
    }
  }, [step, recommended])

  const stepIndex = STEPS.indexOf(step)
  const next = useCallback(() => setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)]!), [stepIndex])

  const toggleInterest = (id: Interest) =>
    setInterests((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))

  const togglePick = (id: string) =>
    setPicked((prev) => {
      const nextSet = new Set(prev)
      if (nextSet.has(id)) nextSet.delete(id)
      else nextSet.add(id)
      return nextSet
    })

  const mintProfile = useCallback(async (): Promise<ReaderProfile> => {
    const existing = await gamification.getProfile()
    if (existing) return existing
    const created: ReaderProfile = {
      readerNumber: 1000 + Math.floor(Math.random() * 9000),
      joinedAt: Date.now(),
      interests,
      targetMinutes: target,
    }
    await gamification.saveProfile(created)
    return created
  }, [interests, target])

  const importPicked = useCallback(async () => {
    const books = STARTER_BOOKS.filter((b) => picked.has(b.id))
    const errors: string[] = []
    setImporting({ current: '', done: 0, total: books.length })
    for (let i = 0; i < books.length; i++) {
      const book = books[i]!
      setImporting({ current: book.title, done: i, total: books.length })
      try {
        const res = await fetch(book.file)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        const file = new File([blob], `${book.id}.epub`, { type: 'application/epub+zip' })
        await importService.import(file)
      } catch (err) {
        console.error('Starter import failed', book.id, err)
        errors.push(book.title)
      }
    }
    setImportErrors(errors)
    setImporting(null)
    const created = await mintProfile()
    setProfile(created)
    setStep('card')
  }, [picked, mintProfile])

  const finish = useCallback(async () => {
    if (!profile) await mintProfile()
    onDone()
  }, [profile, mintProfile, onDone])

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black text-white">
      {/* the "orb": a card that grows out of the dark */}
      <div
        className={`pointer-events-none absolute left-1/2 top-1/2 h-[140vmax] w-[140vmax] -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg bg-dots transition-transform duration-[1200ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
          lit ? 'scale-100' : 'scale-0'
        }`}
      />

      <div className="relative mx-auto flex min-h-full w-full max-w-md flex-col px-6 pb-10 pt-12 text-black">
        {/* progress dots */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex gap-2">
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={`h-2.5 w-2.5 rounded-nb border-2 border-border ${i <= stepIndex ? 'bg-black' : 'bg-white'}`}
              />
            ))}
          </div>
          {step !== 'card' && step !== 'intro' && !importing ? (
            <button type="button" className="text-xs font-extrabold uppercase tracking-widest underline decoration-2 underline-offset-4" onClick={finish}>
              Skip
            </button>
          ) : null}
        </div>

        {step === 'intro' && (
          <div className={`flex flex-1 flex-col justify-center transition-all duration-700 ${lit ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`}>
            <div className="nb-box-lg inline-flex w-fit rotate-[-3deg] items-center bg-yellow px-5 py-3 font-display text-4xl uppercase text-black">
              Skim
            </div>
            <h1 className="mt-8 font-display text-4xl leading-[1.05] uppercase">
              One thought
              <br />
              at a time.
            </h1>
            <p className="mt-4 text-base font-semibold text-fg-muted">
              Books, cut into slides. Tap or press a volume button to turn the page. No feed, no noise.
            </p>
            <button type="button" className="nb-btn nb-btn-main mt-10 w-full px-5 py-3.5 text-base" onClick={next}>
              Let’s go <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
        )}

        {step === 'interests' && (
          <div className="flex flex-1 flex-col animate-slide-up">
            <h2 className="font-display text-3xl uppercase leading-tight">What do you like to read?</h2>
            <p className="mt-2 text-sm font-semibold text-fg-muted">Pick a few. We’ll suggest a shelf.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              {INTERESTS.map((i) => {
                const on = interests.includes(i.id)
                return (
                  <button
                    key={i.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleInterest(i.id)}
                    className={`nb-btn px-4 py-2 text-sm ${on ? 'nb-btn-lime' : 'nb-btn-neutral'}`}
                  >
                    {on ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
                    {i.label}
                  </button>
                )
              })}
            </div>
            <button type="button" className="nb-btn nb-btn-main mt-auto w-full px-5 py-3.5 text-base" onClick={next}>
              Next <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
        )}

        {step === 'target' && (
          <div className="flex flex-1 flex-col animate-slide-up">
            <h2 className="font-display text-3xl uppercase leading-tight">How much, each day?</h2>
            <p className="mt-2 text-sm font-semibold text-fg-muted">You earn a bonus every day you hit it. No penalty when you don’t.</p>
            <div className="mt-6 flex flex-col gap-4">
              {TARGETS.map((t) => {
                const on = target === t.minutes
                return (
                  <button
                    key={t.minutes}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTarget(t.minutes)}
                    className={`nb-btn w-full justify-between px-5 py-4 text-left ${on ? 'nb-btn-yellow' : 'nb-btn-neutral'}`}
                  >
                    <span>
                      <span className="block font-display text-2xl">{t.label}</span>
                      <span className="block text-xs font-bold opacity-70">{t.note}</span>
                    </span>
                    {on ? <Check className="h-6 w-6" strokeWidth={3} /> : null}
                  </button>
                )
              })}
            </div>
            <button type="button" className="nb-btn nb-btn-main mt-auto w-full px-5 py-3.5 text-base" onClick={next}>
              Next <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
        )}

        {step === 'shelf' && (
          <div className="flex flex-1 flex-col animate-slide-up">
            <h2 className="font-display text-3xl uppercase leading-tight">Start with a few free books</h2>
            <p className="mt-2 text-sm font-semibold text-fg-muted">
              Great editions, no strings. Tap to choose. You can always add your own EPUBs later.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-4">
              {STARTER_BOOKS.map((b) => {
                const on = picked.has(b.id)
                const rec = recommended.has(b.id)
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={on}
                    disabled={!!importing}
                    onClick={() => togglePick(b.id)}
                    className={`nb-btn relative flex-col items-stretch overflow-hidden p-0 text-left ${on ? 'nb-btn-lime' : 'nb-btn-neutral'}`}
                  >
                    <img src={b.cover} alt="" className="block aspect-[300/420] w-full border-b-2 border-border bg-white object-cover" draggable={false} />
                    <span className="p-2.5">
                      <span className="block text-sm font-extrabold leading-tight">{b.title}</span>
                      <span className="block text-xs font-semibold opacity-70">{b.author}</span>
                    </span>
                    {on ? (
                      <span className="nb-box absolute right-2 top-2 flex h-7 w-7 items-center justify-center bg-yellow text-black">
                        <Check className="h-4 w-4" strokeWidth={3} />
                      </span>
                    ) : rec ? (
                      <span className="nb-chip absolute left-2 top-2 bg-yellow text-black">For you</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
            <div className="sticky bottom-0 mt-6 bg-bg pb-1 pt-3">
              {importing ? (
                <div className="nb-box p-4">
                  <div className="flex items-center gap-3 text-sm font-bold">
                    <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.5} />
                    Adding {importing.current || 'books'}… {importing.done}/{importing.total}
                  </div>
                  <div className="nb-track mt-3">
                    <div className="nb-track-fill transition-all" style={{ width: `${(importing.done / Math.max(1, importing.total)) * 100}%` }} />
                  </div>
                </div>
              ) : (
                <button type="button" className="nb-btn nb-btn-main w-full px-5 py-3.5 text-base" onClick={importPicked}>
                  {picked.size === 0 ? 'Continue without books' : `Add ${picked.size} ${picked.size === 1 ? 'book' : 'books'}`}
                  <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'card' && profile && (
          <div className="flex flex-1 flex-col animate-slide-up">
            <h2 className="font-display text-3xl uppercase leading-tight">You’re in.</h2>
            <p className="mt-2 text-sm font-semibold text-fg-muted">Your reader card. It fills up as you read.</p>
            <div className="mt-8 rotate-[-2deg] animate-[pop_0.5s_cubic-bezier(0.2,0.9,0.3,1.3)]">
              <ReaderCard profile={profile} points={0} booksFinished={0} />
            </div>
            {importErrors.length > 0 ? (
              <p className="nb-box-flat mt-6 bg-danger p-3 text-xs font-bold text-black">
                Couldn’t add: {importErrors.join(', ')}. You can add them again from the shelf later.
              </p>
            ) : null}
            <button type="button" className="nb-btn nb-btn-main mt-auto w-full px-5 py-3.5 text-base" onClick={finish}>
              Start reading <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
