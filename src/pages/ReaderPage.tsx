import { useCallback, useEffect, useRef, useState } from 'react'
import { storageService } from '@/db/StorageService'
import type { Slide } from '@/db/types'
import { AlertTriangle, Loader2, Settings, ArrowLeft } from 'lucide-react'
import { ReadingTimeEstimator } from '@/utils/ReadingTimeEstimator'

interface ReaderPageProps {
  bookId: string
  onExit: () => void
}

export function ReaderPage({ bookId, onExit }: ReaderPageProps) {
  const [currentSlide, setCurrentSlide] = useState<Slide | null>(null)
  const [currentIndex, setCurrentIndex] = useState<number>(0)
  const [totalSlides, setTotalSlides] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bookTitle, setBookTitle] = useState<string>('')
  const [isAutoSwipeEnabled, setIsAutoSwipeEnabled] = useState(false) // Will be loaded from storage
  const [autoAdvanceSeconds, setAutoAdvanceSeconds] = useState(9)
  const [showSettings, setShowSettings] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [chapterMarks, setChapterMarks] = useState<number[]>([])
  const [isPaused, setIsPaused] = useState(false)
  const [progressPercent, setProgressPercent] = useState(0)
  const [selectedFont, setSelectedFont] = useState<'inter' | 'literata' | 'merriweather'>('inter')

  // Reading time estimation
  const readingEstimator = useRef(new ReadingTimeEstimator())
  const slideEntryTime = useRef<number>(0)

  // Touch state for tap/swipe detection
  const touchStartX = useRef<number | null>(null)
  const touchStartTime = useRef<number>(0)
  const autoAdvanceTimerRef = useRef<number | null>(null)
  const progressIntervalRef = useRef<number | null>(null)
  const controlsTimeoutRef = useRef<number | null>(null)
  const isHolding = useRef<boolean>(false)

  // Load initial slide and progress
  useEffect(() => {
    const loadReaderState = async () => {
      try {
        setLoading(true)
        setError(null)

        // Get book metadata
        const book = await storageService.getBook(bookId)
        if (book) {
          setBookTitle(book.title)
        }

        // Load auto-advance setting from storage (default to true if not set)
        const autoAdvanceSetting = await storageService.getKV('autoAdvanceEnabled')
        setIsAutoSwipeEnabled(autoAdvanceSetting ?? true)

        // Load font preference from storage (default to 'inter' if not set)
        const savedFont = await storageService.getKV('selectedFont')
        if (savedFont && ['inter', 'literata', 'merriweather'].includes(savedFont)) {
          setSelectedFont(savedFont as 'inter' | 'literata' | 'merriweather')
        }

        // Get progress to determine starting slide
        const progress = await storageService.getProgress(bookId)
        const startIndex = progress?.slideIndex ?? 0

        // Get total slide count
        const count = await storageService.countSlides(bookId)
        setTotalSlides(count)

        // Load all slides to determine chapter boundaries
        const allSlides = await storageService.getAllSlides(bookId)
        const marks: number[] = []
        let lastChapter = -1
        allSlides.forEach((slide) => {
          if (slide.chapter !== lastChapter && lastChapter !== -1) {
            marks.push(slide.slideIndex)
          }
          lastChapter = slide.chapter
        })
        setChapterMarks(marks)

        // Load the starting slide
        const slide = await storageService.getSlide(bookId, startIndex)
        if (!slide) {
          throw new Error('Slide not found')
        }

        setCurrentSlide(slide)
        setCurrentIndex(startIndex)

        // Mark slide entry time
        slideEntryTime.current = Date.now()
      } catch (err) {
        console.error('Failed to load reader state', err)
        setError('Unable to load book. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    loadReaderState()
  }, [bookId])

  // Navigate to specific slide index
  const goToSlide = useCallback(
    async (index: number) => {
      if (index < 0 || index >= totalSlides) {
        return
      }

      // Record time spent on previous slide before navigating
      if (slideEntryTime.current > 0) {
        const timeSpentSeconds = (Date.now() - slideEntryTime.current) / 1000
        readingEstimator.current.addObservation(timeSpentSeconds)
      }

      try {
        const slide = await storageService.getSlide(bookId, index)
        if (!slide) {
          console.error('Slide not found at index', index)
          return
        }

        setCurrentSlide(slide)
        setCurrentIndex(index)

        // Mark new slide entry time
        slideEntryTime.current = Date.now()

        // Persist progress
        await storageService.setProgress(bookId, index)
      } catch (err) {
        console.error('Failed to navigate to slide', err)
        setError('Unable to load slide. Please try again.')
      }
    },
    [bookId, totalSlides]
  )

  const goToPrevious = useCallback(() => {
    goToSlide(currentIndex - 1)
  }, [currentIndex, goToSlide])

  const goToNext = useCallback(() => {
    goToSlide(currentIndex + 1)
  }, [currentIndex, goToSlide])

  // Auto-advance functionality with progress bar
  const stopAutoAdvance = useCallback(() => {
    if (autoAdvanceTimerRef.current !== null) {
      clearTimeout(autoAdvanceTimerRef.current)
      autoAdvanceTimerRef.current = null
    }
    if (progressIntervalRef.current !== null) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
    setProgressPercent(0)
  }, [])

  const startAutoAdvance = useCallback(() => {
    stopAutoAdvance()
    setProgressPercent(0)

    // Use predicted time from estimator
    const duration = readingEstimator.current.predict() * 1000

    const startTime = Date.now()

    // Update progress bar every 50ms
    progressIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime
      const percent = Math.min((elapsed / duration) * 100, 100)
      setProgressPercent(percent)
    }, 50)

    // Auto-advance to next slide
    autoAdvanceTimerRef.current = window.setTimeout(() => {
      goToNext()
    }, duration)
  }, [goToNext, stopAutoAdvance])

  // Start auto-advance when enabled AND we have enough observations
  useEffect(() => {
    const shouldAutoAdvance =
      isAutoSwipeEnabled &&
      !isPaused &&
      currentIndex < totalSlides - 1 &&
      !loading &&
      readingEstimator.current.shouldEnableAutoplay()

    if (shouldAutoAdvance) {
      startAutoAdvance()
    } else {
      stopAutoAdvance()
    }
    return () => stopAutoAdvance()
  }, [isAutoSwipeEnabled, isPaused, currentIndex, totalSlides, loading, startAutoAdvance, stopAutoAdvance])

  // Hide controls after 3 seconds
  useEffect(() => {
    if (showControls) {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current)
      }
      controlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false)
      }, 3000)
    }
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current)
      }
    }
  }, [showControls])

  // Touch event handlers for swipe and hold gestures
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    if (!touch) return
    touchStartX.current = touch.clientX
    touchStartTime.current = Date.now()
    isHolding.current = true

    // Pause immediately when touch starts if auto-swipe is enabled
    if (isAutoSwipeEnabled) {
      setIsPaused(true)
    }
  }, [isAutoSwipeEnabled])

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const wasHolding = isHolding.current
      isHolding.current = false

      if (touchStartX.current === null) {
        return
      }

      const touch = e.changedTouches[0]
      if (!touch) return

      const deltaX = touch.clientX - touchStartX.current
      const touchDuration = Date.now() - touchStartTime.current

      // Get tap position for zone-based navigation
      const tapX = touch.clientX
      const screenWidth = window.innerWidth

      // Reset touch state
      touchStartX.current = null

      // Check for tap (small movement and quick)
      if (Math.abs(deltaX) < 10 && touchDuration < 300) {
        // Small movement and quick - treat as tap
        // Left third = previous, right third = next, middle = toggle controls
        const leftThird = screenWidth / 3
        const rightThird = (screenWidth * 2) / 3

        if (tapX < leftThird) {
          // Tap on left - go to previous slide, resume auto-swipe
          goToPrevious()
          setIsPaused(false)
        } else if (tapX > rightThird) {
          // Tap on right - go to next slide, resume auto-swipe
          goToNext()
          setIsPaused(false)
        } else {
          // Tap in middle - toggle controls, DON'T change pause state
          setShowControls((prev) => !prev)
          // Keep current pause state - don't call setIsPaused
        }
      } else {
        // Any other touch end - resume auto-swipe
        setIsPaused(false)
      }
    },
    [goToNext, goToPrevious, onExit]
  )

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !currentSlide) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-950 px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 text-red-400">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-white">Failed to Load Book</h2>
        <p className="mt-2 text-center text-sm text-slate-400">{error}</p>
        <button
          type="button"
          className="mt-6 rounded-full bg-indigo-500 px-6 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
          onClick={onExit}
        >
          Back to Library
        </button>
      </div>
    )
  }

  return (
    <div
      className="relative flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-100"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'none' }}
    >
      {/* Thin progress bar at top */}
      <div className="absolute left-0 right-0 top-0 z-20 h-1 bg-slate-900">
        <div
          className="h-full bg-white transition-all duration-100 ease-linear"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Main slide content area - full screen, centered, non-scrollable */}
      <main className="flex flex-1 flex-col items-center justify-center overflow-hidden px-8 py-20">
        <div className="w-full max-w-2xl flex-1 flex items-center">
          <p
            className="text-xl leading-relaxed text-slate-100 sm:text-2xl sm:leading-relaxed"
            style={{
              fontFamily:
                selectedFont === 'inter'
                  ? 'Inter, sans-serif'
                  : selectedFont === 'literata'
                    ? 'Literata, serif'
                    : 'Merriweather, serif',
            }}
          >
            {currentSlide.text}
          </p>
        </div>
        {bookTitle && (
          <div className="w-full max-w-2xl pt-4">
            <h2 className="text-sm text-slate-400">{bookTitle}</h2>
          </div>
        )}
      </main>

      {/* Top bar with back button and settings - only show when controls are visible */}
      {showControls && (
        <>
          <div className="absolute left-4 top-4 z-10">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/80 text-slate-300 backdrop-blur-sm transition hover:bg-slate-800 hover:text-slate-100"
              aria-label="Back to Library"
              onClick={(e) => {
                e.stopPropagation()
                onExit()
              }}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          </div>
          <div className="absolute right-4 top-4 z-10">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/80 text-slate-300 backdrop-blur-sm transition hover:bg-slate-800 hover:text-slate-100"
              aria-label="Settings"
              onClick={(e) => {
                e.stopPropagation()
                setShowSettings(!showSettings)
              }}
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </>
      )}

      {/* Footer with interactive progress slider - only show when controls are visible */}
      {showControls && (
        <footer className="absolute bottom-0 left-0 right-0 z-10 px-6 pb-6">
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
              <span>
                Slide {currentIndex + 1} of {totalSlides}
              </span>
              <span>{Math.round(((currentIndex + 1) / totalSlides) * 100)}%</span>
            </div>
            <div className="relative h-8 touch-none">
              {/* Clickable track area */}
              <div
                className="absolute left-0 right-0 top-3 h-2 cursor-pointer rounded-full bg-slate-800"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const clickX = e.clientX - rect.left
                  const percent = clickX / rect.width
                  const targetIndex = Math.floor(percent * totalSlides)
                  goToSlide(Math.max(0, Math.min(totalSlides - 1, targetIndex)))
                }}
              >
                {/* Chapter notches */}
                {chapterMarks.map((mark) => (
                  <div
                    key={mark}
                    className="absolute top-0 h-full w-0.5 bg-slate-600"
                    style={{ left: `${(mark / totalSlides) * 100}%` }}
                  />
                ))}
                {/* Progress fill */}
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / totalSlides) * 100}%` }}
                />
              </div>
              {/* Draggable thumb */}
              <input
                type="range"
                min="0"
                max={totalSlides - 1}
                value={currentIndex}
                onChange={(e) => {
                  const targetIndex = Number(e.target.value)
                  goToSlide(targetIndex)
                }}
                className="absolute left-0 top-0 h-8 w-full cursor-pointer appearance-none bg-transparent"
                style={{
                  WebkitAppearance: 'none',
                }}
              />
            </div>
          </div>
        </footer>
      )}

      {/* Settings panel */}
      {showSettings ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowSettings(false)
            }
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-xl">
            <h2 className="text-lg font-semibold">Reader Settings</h2>

            {/* Auto-swipe toggle */}
            <div className="mt-6 flex items-center justify-between">
              <label className="text-sm font-medium text-slate-300">Auto-swipe</label>
              <button
                type="button"
                role="switch"
                aria-checked={isAutoSwipeEnabled}
                onClick={async () => {
                  const newValue = !isAutoSwipeEnabled
                  setIsAutoSwipeEnabled(newValue)
                  // Save to IndexedDB
                  await storageService.setKV('autoAdvanceEnabled', newValue)
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  isAutoSwipeEnabled ? 'bg-indigo-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    isAutoSwipeEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Reading time status */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-slate-300">
                Auto-swipe timing
              </label>
              <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800 p-3">
                {readingEstimator.current.shouldEnableAutoplay() ? (
                  <div className="text-sm text-slate-300">
                    <div className="flex items-center justify-between">
                      <span>Predicted time:</span>
                      <span className="font-semibold text-indigo-400">
                        {readingEstimator.current.predict().toFixed(1)}s
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      Based on {readingEstimator.current.getObservationCount()} slides read
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-400">
                    Learning your reading speed...
                    <div className="mt-1 text-xs">
                      {readingEstimator.current.getObservationCount()} of 5 slides
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Font picker */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-slate-300">Font</label>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    setSelectedFont('inter')
                    await storageService.setKV('selectedFont', 'inter')
                  }}
                  className={`flex h-16 flex-1 items-center justify-center rounded-lg border transition ${
                    selectedFont === 'inter'
                      ? 'border-indigo-500 bg-indigo-500/20'
                      : 'border-slate-700 bg-slate-800 hover:bg-slate-700'
                  }`}
                >
                  <span className="text-2xl font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Aa
                  </span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setSelectedFont('literata')
                    await storageService.setKV('selectedFont', 'literata')
                  }}
                  className={`flex h-16 flex-1 items-center justify-center rounded-lg border transition ${
                    selectedFont === 'literata'
                      ? 'border-indigo-500 bg-indigo-500/20'
                      : 'border-slate-700 bg-slate-800 hover:bg-slate-700'
                  }`}
                >
                  <span className="text-2xl font-medium" style={{ fontFamily: 'Literata, serif' }}>
                    Aa
                  </span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setSelectedFont('merriweather')
                    await storageService.setKV('selectedFont', 'merriweather')
                  }}
                  className={`flex h-16 flex-1 items-center justify-center rounded-lg border transition ${
                    selectedFont === 'merriweather'
                      ? 'border-indigo-500 bg-indigo-500/20'
                      : 'border-slate-700 bg-slate-800 hover:bg-slate-700'
                  }`}
                >
                  <span className="text-2xl font-medium" style={{ fontFamily: 'Merriweather, serif' }}>
                    Aa
                  </span>
                </button>
              </div>
            </div>

            <button
              type="button"
              className="mt-6 w-full rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
              onClick={() => setShowSettings(false)}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default ReaderPage
