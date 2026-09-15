import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { ArrowRight, Check, Download, Loader2, Plus, Smartphone, Upload } from 'lucide-react'
import { importService } from '@/importer/ImportService'
import { gamification, type ReaderProfile } from '@/gamification/score'
import { ReaderCard } from '@/components/ReaderCard'
import { ANDROID_APK_URL, NATIVE_APP_PITCH, isAndroidBrowser } from '@/platform'
import { INTERESTS, STARTER_BOOKS, recommendedFor, type Interest } from './starterBooks'

interface OnboardingProps {
  onDone: () => void
}

type Step = 'intro' | 'install' | 'interests' | 'target' | 'source' | 'shelf' | 'card'

const TARGETS = [
  { minutes: 10, label: '10 min', note: 'A chapter of something short' },
  { minutes: 20, label: '20 min', note: 'A book every few weeks' },
  { minutes: 30, label: '30 min', note: 'Serious reader' },
]

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024

export function Onboarding({ onDone }: OnboardingProps) {
  const steps = useMemo<Step[]>(
    () => (isAndroidBrowser ? ['intro', 'install', 'interests', 'target', 'source', 'shelf', 'card'] : ['intro', 'interests', 'target', 'source', 'shelf', 'card']),
    []
  )
  const [step, setStep] = useState<Step>('intro')
  const [interests, setInterests] = useState<Interest[]>([])
  const [target, setTarget] = useState<number>(20)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState<{ current: string; done: number; total: number } | null>(null)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [importedCount, setImportedCount] = useState(0)
  const [profile, setProfile] = useState<ReaderProfile | null>(null)
  const [lit, setLit] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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

  const stepIndex = steps.indexOf(step)
  const goTo = useCallback((s: Step) => setStep(s), [])
  const next = useCallback(() => setStep(steps[Math.min(steps.length - 1, stepIndex + 1)]!), [steps, stepIndex])

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

  const finishToCard = useCallback(async () => {
    const created = await mintProfile()
    setProfile(created)
    setStep('card')
  }, [mintProfile])

  const importPicked = useCallback(async () => {
    const books = STARTER_BOOKS.filter((b) => picked.has(b.id))
    const errors: string[] = []
    let ok = 0
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
        ok++
      } catch (err) {
        console.error('Starter import failed', book.id, err)
        errors.push(book.title)
      }
    }
    setImportErrors(errors)
    setImportedCount((n) => n + ok)
    setImporting(null)
    await finishToCard()
  }, [picked, finishToCard])

  const handleOwnFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      const name = file.name.toLowerCase()
      const ok = name.endsWith('.epub') || name.endsWith('.pdf') || file.type === 'application/epub+zip' || file.type === 'application/pdf'
      if (!ok) {
        setImportErrors(['That file is not an EPUB or PDF'])
        return
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setImportErrors(['That file is over 20 MB'])
        return
      }
      setImportErrors([])
      setImporting({ current: file.name, done: 0, total: 1 })
      try {
        await importService.import(file)
        setImportedCount((n) => n + 1)
        setImporting(null)
        await finishToCard()
      } catch (err) {
        console.error('Own import failed', err)
        setImportErrors([file.name])
        setImporting(null)
      }
    },
    [finishToCard]
  )

  const finish = useCallback(async () => {
    if (!profile) await mintProfile()
    onDone()
  }, [profile, mintProfile, onDone])

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black text-white">
      {/* the "orb": a page that grows out of the dark */}
      <div
        className={`pointer-events-none absolute left-1/2 top-1/2 h-[140vmax] w-[140vmax] -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg bg-dots transition-transform duration-[1200ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
          lit ? 'scale-100' : 'scale-0'
        }`}
      />

      <div className="relative mx-auto flex min-h-full w-full max-w-md flex-col px-6 pb-10 pt-12 text-black">
        {/* progress dots */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex gap-2">
            {steps.map((s, i) => (
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
              Books, cut into slides. Tap or press a button to turn the page. No feed, no noise.
            </p>
            <button type="button" className="nb-btn nb-btn-main mt-10 w-full px-5 py-3.5 text-base" onClick={next}>
              Let’s go <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
        )}

        {step === 'install' && (
          <div className="flex flex-1 flex-col animate-slide-up">
            <div className="nb-box flex h-14 w-14 items-center justify-center bg-lime text-black">
              <Smartphone className="h-7 w-7" strokeWidth={2.5} />
            </div>
            <h2 className="mt-6 font-display text-3xl uppercase leading-tight">{NATIVE_APP_PITCH.title}</h2>
            <p className="mt-3 text-base font-semibold text-fg-muted">{NATIVE_APP_PITCH.body}</p>
            <p className="mt-3 text-sm font-semibold text-fg-muted">
              Install it first and do this setup once, in the app.
            </p>
            <div className="mt-auto flex flex-col gap-3">
              <a href={ANDROID_APK_URL} className="nb-btn nb-btn-main w-full px-5 py-3.5 text-base">
                <Download className="h-5 w-5" strokeWidth={2.5} /> {NATIVE_APP_PITCH.cta}
              </a>
              <button type="button" className="nb-btn nb-btn-neutral w-full px-5 py-3 text-sm" onClick={next}>
                Continue in the browser
              </button>
            </div>
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

        {step === 'source' && (
          <div className="flex flex-1 flex-col animate-slide-up">
            <h2 className="font-display text-3xl uppercase leading-tight">Your first book</h2>
            <p className="mt-2 text-sm font-semibold text-fg-muted">Bring your own, or pick from a shelf of free classics.</p>
            <div className="mt-6 flex flex-col gap-4">
              <button
                type="button"
                disabled={!!importing}
                onClick={() => fileInputRef.current?.click()}
                className="nb-btn nb-btn-neutral w-full justify-start gap-4 px-5 py-4 text-left"
              >
                <span className="nb-box-flat flex h-12 w-12 shrink-0 items-center justify-center bg-main text-black">
                  <Upload className="h-6 w-6" strokeWidth={2.5} />
                </span>
                <span>
                  <span className="block text-base font-extrabold">Upload my own</span>
                  <span className="block text-xs font-semibold opacity-70">An EPUB or PDF from this device, up to 20 MB</span>
                </span>
              </button>
              <button
                type="button"
                disabled={!!importing}
                onClick={() => goTo('shelf')}
                className="nb-btn nb-btn-neutral w-full justify-start gap-4 px-5 py-4 text-left"
              >
                <span className="nb-box-flat flex h-12 w-12 shrink-0 items-center justify-center bg-yellow text-black">
                  <Plus className="h-6 w-6" strokeWidth={2.5} />
                </span>
                <span>
                  <span className="block text-base font-extrabold">Pick from the shelf</span>
                  <span className="block text-xs font-semibold opacity-70">Eight great free editions, ready to read</span>
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".epub,.pdf,application/epub+zip,application/pdf"
                className="hidden"
                onChange={handleOwnFile}
              />
            </div>
            {importing ? (
              <div className="nb-box mt-6 p-4">
                <div className="flex items-center gap-3 text-sm font-bold">
                  <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.5} />
                  Adding {importing.current}…
                </div>
              </div>
            ) : null}
            {importErrors.length > 0 ? (
              <p className="nb-box-flat mt-6 bg-danger p-3 text-xs font-bold text-black">{importErrors.join(', ')}</p>
            ) : null}
            <button
              type="button"
              className="mt-auto text-center text-xs font-extrabold uppercase tracking-widest underline decoration-2 underline-offset-4"
              onClick={finishToCard}
              disabled={!!importing}
            >
              I’ll add books later
            </button>
          </div>
        )}

        {step === 'shelf' && (
          <div className="flex flex-1 flex-col animate-slide-up">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-3xl uppercase leading-tight">Pick from the shelf</h2>
              <span className="nb-chip mt-1 shrink-0 bg-lime text-black" aria-live="polite">
                {picked.size} chosen
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold text-fg-muted">
              Tap a book to add it or take it off. Suggested ones are already on.
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
                    className={`nb-btn relative flex-col items-stretch overflow-hidden p-0 text-left transition-opacity ${
                      on ? 'nb-btn-lime' : 'nb-btn-neutral'
                    }`}
                  >
                    <img
                      src={b.cover}
                      alt=""
                      className={`block aspect-[300/420] w-full border-b-2 border-border bg-white object-cover transition ${on ? '' : 'opacity-50 grayscale-[35%]'}`}
                      draggable={false}
                    />
                    <span className="p-2.5">
                      <span className="block text-sm font-extrabold leading-tight">{b.title}</span>
                      <span className="block text-xs font-semibold opacity-70">{b.author}</span>
                    </span>
                    <span
                      className={`flex items-center justify-center gap-1.5 border-t-2 border-border py-2 text-xs font-extrabold uppercase tracking-wider ${
                        on ? 'bg-black text-lime' : 'bg-surface-muted text-black'
                      }`}
                    >
                      {on ? (
                        <>
                          <Check className="h-4 w-4" strokeWidth={3} /> Added
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4" strokeWidth={3} /> Add
                        </>
                      )}
                    </span>
                    {rec && !on ? <span className="nb-chip absolute left-2 top-2 bg-yellow text-black">For you</span> : null}
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
                <div className="flex gap-3">
                  <button type="button" className="nb-btn nb-btn-neutral px-4 py-3.5 text-sm" onClick={() => goTo('source')}>
                    Back
                  </button>
                  <button type="button" className="nb-btn nb-btn-main flex-1 px-5 py-3.5 text-base" onClick={picked.size === 0 ? finishToCard : importPicked}>
                    {picked.size === 0 ? 'Continue without books' : `Add ${picked.size} ${picked.size === 1 ? 'book' : 'books'}`}
                    <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'card' && profile && (
          <div className="flex flex-1 flex-col animate-slide-up">
            <h2 className="font-display text-3xl uppercase leading-tight">You’re in.</h2>
            <p className="mt-2 text-sm font-semibold text-fg-muted">
              Your reader card. It fills up as you read.
              {importedCount > 0 ? ` ${importedCount} ${importedCount === 1 ? 'book is' : 'books are'} on your shelf.` : ''}
            </p>
            <div className="mt-8 rotate-[-2deg] animate-[pop_0.5s_cubic-bezier(0.2,0.9,0.3,1.3)]">
              <ReaderCard profile={profile} points={0} booksFinished={0} />
            </div>
            {importErrors.length > 0 ? (
              <p className="nb-box-flat mt-6 bg-danger p-3 text-xs font-bold text-black">
                Couldn’t add: {importErrors.join(', ')}. You can add them again later.
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
