import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ArrowRight, Download, Loader2, Smartphone, Upload } from 'lucide-react'
import { importService } from '@/importer/ImportService'
import { gamification, type ReaderProfile } from '@/gamification/score'
import { ANDROID_APK_URL, NATIVE_APP_PITCH, isAndroidBrowser } from '@/platform'
import { CatalogBrowser } from '@/store/CatalogBrowser'
import { SkimDemo } from './SkimDemo'

interface OnboardingProps {
  /** Pass the book id to drop the reader straight into it. */
  onDone: (bookId?: string) => void
}

type Step = 'install' | 'intro' | 'pick'

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024
const DEFAULT_TARGET_MINUTES = 20
/** How many of the most popular titles to show before the user searches. */
const FIRST_PICKS = 12

/**
 * Onboarding is one job: get a book open. One line on what Skim is, then the catalog.
 * Reading-target and interests live in settings now; the profile is minted
 * with defaults so the score and card work from the first slide.
 */
export function Onboarding({ onDone }: OnboardingProps) {
  const [step, setStep] = useState<Step>(isAndroidBrowser ? 'install' : 'intro')
  const [lit, setLit] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setLit(true), 200)
    return () => window.clearTimeout(t)
  }, [])

  const ensureProfile = useCallback(async () => {
    const existing = await gamification.getProfile()
    if (existing) return
    const created: ReaderProfile = {
      readerNumber: 1000 + Math.floor(Math.random() * 9000),
      joinedAt: Date.now(),
      interests: [],
      targetMinutes: DEFAULT_TARGET_MINUTES,
    }
    await gamification.saveProfile(created)
  }, [])

  const finish = useCallback(
    async (bookId?: string) => {
      await ensureProfile()
      onDone(bookId)
    },
    [ensureProfile, onDone]
  )

  const handleOwnFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      const name = file.name.toLowerCase()
      const ok = name.endsWith('.epub') || name.endsWith('.pdf') || file.type === 'application/epub+zip' || file.type === 'application/pdf'
      if (!ok) {
        setUploadError('That file is not an EPUB or PDF')
        return
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setUploadError('That file is over 20 MB')
        return
      }
      setUploadError(null)
      setUploading(file.name)
      try {
        const bookId = await importService.import(file)
        await finish(bookId)
      } catch (err) {
        console.error('Own import failed', err)
        setUploadError(`Couldn’t add ${file.name}`)
        setUploading(null)
      }
    },
    [finish]
  )

  return (
    <div className="fixed inset-0 z-[60] overflow-x-hidden overflow-y-auto bg-black text-white">
      {/* the "orb": a page that grows out of the dark */}
      <div
        className={`pointer-events-none fixed left-1/2 top-1/2 h-[140vmax] w-[140vmax] -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg bg-dots transition-transform duration-[1200ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
          lit ? 'scale-100' : 'scale-0'
        }`}
      />

      <div className="relative mx-auto flex min-h-full w-full max-w-md flex-col px-6 pb-10 pt-10 text-black">
        {step === 'install' && (
          <div className={`flex flex-1 flex-col transition-opacity duration-700 ${lit ? 'opacity-100' : 'opacity-0'}`}>
            <div className="nb-box flex h-14 w-14 items-center justify-center bg-lime text-black">
              <Smartphone className="h-7 w-7" strokeWidth={2.5} />
            </div>
            <h2 className="mt-6 font-display text-3xl uppercase leading-tight">{NATIVE_APP_PITCH.title}</h2>
            <p className="mt-3 text-base font-semibold text-fg-muted">{NATIVE_APP_PITCH.body}</p>
            <div className="mt-auto flex flex-col gap-3 pt-8">
              <a href={ANDROID_APK_URL} className="nb-btn nb-btn-main w-full px-5 py-3.5 text-base">
                <Download className="h-5 w-5" strokeWidth={2.5} /> {NATIVE_APP_PITCH.cta}
              </a>
              <button type="button" className="nb-btn nb-btn-neutral w-full px-5 py-3 text-sm" onClick={() => setStep('intro')}>
                Continue in the browser
              </button>
            </div>
          </div>
        )}

        {step === 'intro' && (
          <div className={`flex flex-1 flex-col transition-opacity duration-700 ${lit ? 'opacity-100' : 'opacity-0'}`}>
            <div className="nb-box-lg inline-flex w-fit rotate-[-3deg] items-center bg-yellow px-4 py-2 font-display text-2xl uppercase text-black">
              Skim
            </div>
            <h1 className="mt-7 font-display text-4xl leading-[1.05] uppercase">
              Scroll less,
              <br />
              read more.
            </h1>
            <p className="mt-3 text-base font-semibold text-fg-muted">
              Whole books, in short cards that play like stories.
            </p>
            <div className="flex flex-1 items-center justify-center py-8">
              <SkimDemo />
            </div>
            <button type="button" className="nb-btn nb-btn-main w-full px-5 py-3.5 text-base" onClick={() => setStep('pick')}>
              Pick a book <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
        )}

        {/* Fade only: a transform on this box would make it the containing block for the book sheet's fixed overlay. */}
        {step === 'pick' && (
          <div className={`flex flex-1 flex-col transition-opacity duration-700 ${lit ? 'opacity-100' : 'opacity-0'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="nb-box-lg inline-flex w-fit rotate-[-3deg] items-center bg-yellow px-4 py-2 font-display text-2xl uppercase text-black">
                Skim
              </div>
              <button
                type="button"
                className="mt-2 text-xs font-extrabold uppercase tracking-widest underline decoration-2 underline-offset-4"
                onClick={() => finish()}
                disabled={!!uploading}
              >
                Skip
              </button>
            </div>
            <h1 className="mt-6 font-display text-3xl leading-[1.05] uppercase">Pick your first book.</h1>

            <div className="mt-5">
              <CatalogBrowser
                initialLimit={FIRST_PICKS}
                showTags={false}
                onRead={(bookId) => void finish(bookId)}
              />
            </div>

            <div className="mt-6 border-t-2 border-border pt-5">
              <button
                type="button"
                disabled={!!uploading}
                onClick={() => fileInputRef.current?.click()}
                className="nb-btn nb-btn-neutral w-full justify-start gap-4 px-4 py-3 text-left"
              >
                <span className="nb-box-flat flex h-10 w-10 shrink-0 items-center justify-center bg-main text-black">
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.5} /> : <Upload className="h-5 w-5" strokeWidth={2.5} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold">{uploading ? `Adding ${uploading}…` : 'Upload my own'}</span>
                  <span className="block truncate text-xs font-semibold opacity-70">EPUB or PDF, up to 20 MB</span>
                </span>
                {!uploading ? <ArrowRight className="ml-auto h-4 w-4 shrink-0" strokeWidth={2.5} /> : null}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".epub,.pdf,application/epub+zip,application/pdf"
                className="hidden"
                onChange={handleOwnFile}
              />
              {uploadError ? <p className="nb-box-flat mt-3 bg-danger p-3 text-xs font-bold text-black">{uploadError}</p> : null}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
