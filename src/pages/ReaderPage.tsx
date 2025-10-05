import { useCallback, useEffect, useRef, useState } from 'react'
import { storageService } from '@/db/StorageService'
import type { Chapter } from '@/db/types'
import { AlertTriangle, Loader2, Settings, ArrowLeft } from 'lucide-react'
import { ReadingTimeEstimator } from '@/utils/ReadingTimeEstimator'
import { slidingWindowHelper, type SlideWindow } from '@/reader/SlidingWindowHelper'
import type { ChunkConfig } from '@/chunker/types'
import { DEFAULT_CHUNK_CONFIG } from '@/chunker/types'

interface ReaderPageProps {
  bookId: string
  onExit: () => void
}

export function ReaderPage({ bookId, onExit }: ReaderPageProps) {
  // Core state
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(0)
  const [wordOffset, setWordOffset] = useState<number>(0)
  const [slideWindow, setSlideWindow] = useState<SlideWindow | null>(null)
  const [chunkConfig, setChunkConfig] = useState<ChunkConfig>(DEFAULT_CHUNK_CONFIG)
  const [lastChunkConfig, setLastChunkConfig] = useState<ChunkConfig>(DEFAULT_CHUNK_CONFIG)

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bookTitle, setBookTitle] = useState<string>('')
  const [isAutoSwipeEnabled, setIsAutoSwipeEnabled] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [progressPercent, setProgressPercent] = useState(0)
  const [selectedFont, setSelectedFont] = useState<'inter' | 'literata' | 'merriweather'>('inter')

  // Reading time estimation
  const readingEstimator = useRef(new ReadingTimeEstimator())
  const slideEntryTime = useRef<number>(0)

  // Touch state
  const touchStartX = useRef<number | null>(null)
  const touchStartTime = useRef<number>(0)
  const autoAdvanceTimerRef = useRef<number | null>(null)
  const progressIntervalRef = useRef<number | null>(null)
  const controlsTimeoutRef = useRef<number | null>(null)
  const isHolding = useRef<boolean>(false)

  // Load initial state
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

        // Load all chapters
        const allChapters = await storageService.getAllChapters(bookId)
        if (allChapters.length === 0) {
          throw new Error('No chapters found')
        }
        setChapters(allChapters)

        // Load preferences
        const autoAdvanceSetting = await storageService.getKV('autoAdvanceEnabled')
        setIsAutoSwipeEnabled(autoAdvanceSetting ?? true)

        const savedFont = await storageService.getKV('selectedFont')
        if (savedFont && ['inter', 'literata', 'merriweather'].includes(savedFont)) {
          setSelectedFont(savedFont as 'inter' | 'literata' | 'merriweather')
        }

        const savedChunkSize = await storageService.getKV('chunkSize')
        if (savedChunkSize && typeof savedChunkSize === 'number') {
          setChunkConfig({ maxWords: savedChunkSize })
          setLastChunkConfig({ maxWords: savedChunkSize })
        }

        // Get progress
        const progress = await storageService.getProgress(bookId)
        const startChapterIndex = progress?.chapterIndex ?? 0
        const startWordOffset = progress?.wordOffset ?? 0

        setCurrentChapterIndex(startChapterIndex)
        setWordOffset(startWordOffset)

        // Compute initial window
        const initialWindow = slidingWindowHelper.computeWindow(
          allChapters[startChapterIndex],
          startWordOffset,
          savedChunkSize ? { maxWords: savedChunkSize } : DEFAULT_CHUNK_CONFIG
        )
        setSlideWindow(initialWindow)

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

  // Update window when position or config changes
  useEffect(() => {
    if (chapters.length === 0 || currentChapterIndex >= chapters.length) {
      return
    }

    const currentChapter = chapters[currentChapterIndex]
    const configChanged = chunkConfig.maxWords !== lastChunkConfig.maxWords

    if (configChanged) {
      // Config changed, recompute entire window
      const newWindow = slidingWindowHelper.computeWindow(
        currentChapter,
        wordOffset,
        chunkConfig
      )
      setSlideWindow(newWindow)
      setLastChunkConfig(chunkConfig)
      return
    }

    if (!slideWindow) {
      // No window yet, compute initial
      const newWindow = slidingWindowHelper.computeWindow(
        currentChapter,
        wordOffset,
        chunkConfig
      )
      setSlideWindow(newWindow)
      return
    }

    // Check if we need to shift window
    if (slideWindow.chapterIndex !== currentChapterIndex ||
        !slidingWindowHelper.isWithinWindow(slideWindow, wordOffset)) {
      // Out of window, recompute
      const newWindow = slidingWindowHelper.computeWindow(
        currentChapter,
        wordOffset,
        chunkConfig
      )
      setSlideWindow(newWindow)
    }
  }, [chapters, currentChapterIndex, wordOffset, chunkConfig, lastChunkConfig])

  // Navigate to next slide
  const goToNext = useCallback(async () => {
    if (!slideWindow || chapters.length === 0 || currentChapterIndex >= chapters.length) return

    const currentChapter = chapters[currentChapterIndex]
    const currentSlideIndex = slidingWindowHelper.findSlideIndexAtOffset(slideWindow, wordOffset)

    // Calculate the offset where the next slide would start
    const nextSlideOffset = slidingWindowHelper.getOffsetAtSlideIndex(slideWindow, currentSlideIndex + 1)

    // Record time spent on slide
    if (slideEntryTime.current > 0) {
      const timeSpent = (Date.now() - slideEntryTime.current) / 1000
      readingEstimator.current.addObservation(timeSpent)
    }
    slideEntryTime.current = Date.now()

    // Check if next slide would be within the current chapter
    if (nextSlideOffset < currentChapter.words) {
      // Stay in current chapter, move to next slide
      setWordOffset(nextSlideOffset)
      await storageService.setProgress(bookId, currentChapterIndex, nextSlideOffset)
    } else {
      // We've reached the end of this chapter, move to next chapter
      if (currentChapterIndex < chapters.length - 1) {
        setCurrentChapterIndex(currentChapterIndex + 1)
        setWordOffset(0)
        await storageService.setProgress(bookId, currentChapterIndex + 1, 0)
      }
    }
  }, [slideWindow, chapters, wordOffset, currentChapterIndex, bookId])

  // Navigate to previous slide
  const goToPrevious = useCallback(async () => {
    if (!slideWindow || chapters.length === 0 || currentChapterIndex >= chapters.length) return

    const currentSlideIndex = slidingWindowHelper.findSlideIndexAtOffset(slideWindow, wordOffset)

    slideEntryTime.current = Date.now()

    // Check if we can move to previous slide in current chapter
    if (currentSlideIndex > 0) {
      // Move to previous slide in window
      const prevSlideOffset = slidingWindowHelper.getOffsetAtSlideIndex(slideWindow, currentSlideIndex - 1)
      setWordOffset(prevSlideOffset)
      await storageService.setProgress(bookId, currentChapterIndex, prevSlideOffset)
    } else if (wordOffset > 0) {
      // We're at the start of the window but not at the start of the chapter
      // Move back and let the window recompute
      setWordOffset(Math.max(0, wordOffset - 1))
      await storageService.setProgress(bookId, currentChapterIndex, Math.max(0, wordOffset - 1))
    } else {
      // At start of chapter, move to previous chapter
      if (currentChapterIndex > 0) {
        const prevChapter = chapters[currentChapterIndex - 1]
        setCurrentChapterIndex(currentChapterIndex - 1)
        setWordOffset(prevChapter.words)
        await storageService.setProgress(bookId, currentChapterIndex - 1, prevChapter.words)
      }
    }
  }, [slideWindow, chapters, wordOffset, currentChapterIndex, bookId])

  // Auto-advance functionality
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

    const duration = readingEstimator.current.predict() * 1000
    const startTime = Date.now()

    progressIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime
      const percent = Math.min((elapsed / duration) * 100, 100)
      setProgressPercent(percent)
    }, 50)

    autoAdvanceTimerRef.current = window.setTimeout(() => {
      goToNext()
    }, duration)
  }, [goToNext, stopAutoAdvance])

  useEffect(() => {
    const shouldAutoAdvance =
      isAutoSwipeEnabled &&
      !isPaused &&
      currentChapterIndex < chapters.length &&
      !loading &&
      readingEstimator.current.shouldEnableAutoplay()

    if (shouldAutoAdvance) {
      startAutoAdvance()
    } else {
      stopAutoAdvance()
    }
    return () => stopAutoAdvance()
  }, [isAutoSwipeEnabled, isPaused, currentChapterIndex, chapters.length, loading, startAutoAdvance, stopAutoAdvance])

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

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    if (!touch) return
    touchStartX.current = touch.clientX
    touchStartTime.current = Date.now()
    isHolding.current = true

    if (isAutoSwipeEnabled) {
      setIsPaused(true)
    }
  }, [isAutoSwipeEnabled])

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      isHolding.current = false

      if (touchStartX.current === null) {
        return
      }

      const touch = e.changedTouches[0]
      if (!touch) return

      const deltaX = touch.clientX - touchStartX.current
      const touchDuration = Date.now() - touchStartTime.current
      const tapX = touch.clientX
      const screenWidth = window.innerWidth

      touchStartX.current = null

      // Check for tap
      if (Math.abs(deltaX) < 10 && touchDuration < 300) {
        const leftThird = screenWidth / 3
        const rightThird = (screenWidth * 2) / 3

        if (tapX < leftThird) {
          goToPrevious()
          setIsPaused(false)
        } else if (tapX > rightThird) {
          goToNext()
          setIsPaused(false)
        } else {
          setShowControls((prev) => !prev)
        }
      } else {
        setIsPaused(false)
      }
    },
    [goToNext, goToPrevious]
  )

  // Progress slider handler
  const handleProgressSliderChange = useCallback(async (percentage: number) => {
    if (chapters.length === 0) return

    const position = slidingWindowHelper.findPositionFromProgress(chapters, percentage)
    setCurrentChapterIndex(position.chapterIndex)
    setWordOffset(position.wordOffset)
    slideEntryTime.current = Date.now()
    await storageService.setProgress(bookId, position.chapterIndex, position.wordOffset)
  }, [chapters, bookId])

  // Calculate current progress
  const currentProgress = chapters.length > 0
    ? slidingWindowHelper.calculateProgress(chapters, currentChapterIndex, wordOffset)
    : 0

  // Get current slide text
  const currentSlideText = slideWindow
    ? slideWindow.slides[slidingWindowHelper.findSlideIndexAtOffset(slideWindow, wordOffset)] || ''
    : ''

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || chapters.length === 0) {
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
      {/* Progress bar */}
      <div className="absolute left-0 right-0 top-0 z-20 h-1 bg-slate-900">
        <div
          className="h-full bg-white transition-all duration-100 ease-linear"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Main slide content */}
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
            {currentSlideText}
          </p>
        </div>
        {bookTitle && (
          <div className="w-full max-w-2xl pt-4">
            <h2 className="text-sm text-slate-400">{bookTitle}</h2>
          </div>
        )}
      </main>

      {/* Top bar with back button and settings */}
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

      {/* Footer with progress slider */}
      {showControls && (
        <footer className="absolute bottom-0 left-0 right-0 z-10 px-6 pb-6">
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
              <span>Chapter {currentChapterIndex + 1} of {chapters.length}</span>
              <span>{Math.round(currentProgress)}%</span>
            </div>
            <div className="relative h-8 touch-none">
              <div
                className="absolute left-0 right-0 top-3 h-2 cursor-pointer rounded-full bg-slate-800"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const clickX = e.clientX - rect.left
                  const percent = (clickX / rect.width) * 100
                  handleProgressSliderChange(percent)
                }}
              >
                {/* Progress fill */}
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${currentProgress}%` }}
                />
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={currentProgress}
                onChange={(e) => {
                  const percent = Number(e.target.value)
                  handleProgressSliderChange(percent)
                }}
                className="absolute left-0 top-0 h-8 w-full cursor-pointer appearance-none bg-transparent"
                style={{ WebkitAppearance: 'none' }}
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

            {/* Slide size slider */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-slate-300">Slide Size</label>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-xs text-slate-400">Smaller</span>
                <input
                  type="range"
                  min="20"
                  max="100"
                  step="10"
                  value={chunkConfig.maxWords}
                  onChange={async (e) => {
                    const newSize = Number(e.target.value)
                    setChunkConfig({ maxWords: newSize })
                    await storageService.setKV('chunkSize', newSize)
                  }}
                  className="flex-1"
                />
                <span className="text-xs text-slate-400">Larger</span>
              </div>
              <div className="mt-2 text-center text-xs text-slate-400">
                {chunkConfig.maxWords} words per slide
              </div>
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
