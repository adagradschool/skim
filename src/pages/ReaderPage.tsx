import { useCallback, useEffect, useRef, useState } from 'react'
import { storageService } from '@/db/StorageService'
import type { Chapter } from '@/db/types'
import { AlertTriangle, Loader2, Settings, ArrowLeft, List } from 'lucide-react'
import { ReadingTimeEstimator } from '@/utils/ReadingTimeEstimator'
import { chunkerService } from '@/chunker/ChunkerService'
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
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0)
  const [slides, setSlides] = useState<string[]>([])
  const [chunkConfig, setChunkConfig] = useState<ChunkConfig>(DEFAULT_CHUNK_CONFIG)

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bookTitle, setBookTitle] = useState<string>('')
  const [isAutoSwipeEnabled, setIsAutoSwipeEnabled] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showIndex, setShowIndex] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [progressPercent, setProgressPercent] = useState(0)
  const [selectedFont, setSelectedFont] = useState<'inter' | 'literata' | 'merriweather'>('literata')

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

  // Helper: Convert word offset to slide index
  const wordOffsetToSlideIndex = useCallback((wordOffset: number, slides: string[]): number => {
    let currentWordCount = 0
    for (let i = 0; i < slides.length; i++) {
      const slideWordCount = slides[i].split(/\s+/).filter(w => w.trim().length > 0).length
      if (currentWordCount + slideWordCount > wordOffset) {
        return i
      }
      currentWordCount += slideWordCount
    }
    return Math.max(0, slides.length - 1)
  }, [])

  // Helper: Convert slide index to word offset
  const slideIndexToWordOffset = useCallback((slideIndex: number, slides: string[]): number => {
    let wordOffset = 0
    for (let i = 0; i < slideIndex && i < slides.length; i++) {
      wordOffset += slides[i].split(/\s+/).filter(w => w.trim().length > 0).length
    }
    return wordOffset
  }, [])

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
        const config = savedChunkSize && typeof savedChunkSize === 'number'
          ? { maxWords: savedChunkSize }
          : DEFAULT_CHUNK_CONFIG
        if (savedChunkSize && typeof savedChunkSize === 'number') {
          setChunkConfig(config)
        }

        // Get progress
        const progress = await storageService.getProgress(bookId)
        const startChapterIndex = progress?.chapterIndex ?? 0
        const startWordOffset = progress?.wordOffset ?? 0

        setCurrentChapterIndex(startChapterIndex)

        // Chunk the initial chapter
        const initialChapter = allChapters[startChapterIndex]
        const initialSlides = chunkerService.chunkText(initialChapter.text, config)
        setSlides(initialSlides)

        // Find the slide index for the word offset
        const initialSlideIndex = wordOffsetToSlideIndex(startWordOffset, initialSlides)
        setCurrentSlideIndex(initialSlideIndex)

        slideEntryTime.current = Date.now()
      } catch (err) {
        console.error('Failed to load reader state', err)
        setError('Unable to load book. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    loadReaderState()
  }, [bookId, wordOffsetToSlideIndex])

  // Rechunk entire chapter when chapter or config changes
  useEffect(() => {
    if (chapters.length === 0 || currentChapterIndex >= chapters.length) {
      return
    }

    const currentChapter = chapters[currentChapterIndex]
    const newSlides = chunkerService.chunkText(currentChapter.text, chunkConfig)

    // Only update if slides actually changed
    const slidesChanged = newSlides.length !== slides.length ||
      newSlides.some((slide, i) => slide !== slides[i])

    if (!slidesChanged) {
      return
    }

    setSlides(newSlides)

    // When config changes, try to maintain approximate position
    // by converting current position to word offset and back
    if (slides.length > 0 && currentSlideIndex < slides.length) {
      const wordOffset = slideIndexToWordOffset(currentSlideIndex, slides)
      const newSlideIndex = wordOffsetToSlideIndex(wordOffset, newSlides)
      setCurrentSlideIndex(newSlideIndex)
    } else {
      // First load or invalid state, start at 0
      setCurrentSlideIndex(0)
    }
  }, [chapters, currentChapterIndex, chunkConfig, slides, currentSlideIndex, wordOffsetToSlideIndex, slideIndexToWordOffset])

  // Navigate to next slide
  const goToNext = useCallback(async () => {
    if (slides.length === 0 || chapters.length === 0 || currentChapterIndex >= chapters.length) return

    // Record time spent on slide
    if (slideEntryTime.current > 0) {
      const timeSpent = (Date.now() - slideEntryTime.current) / 1000
      readingEstimator.current.addObservation(timeSpent)
    }
    slideEntryTime.current = Date.now()

    // Check if we can move to next slide in current chapter
    if (currentSlideIndex < slides.length - 1) {
      // Move to next slide
      setCurrentSlideIndex(currentSlideIndex + 1)
      const wordOffset = slideIndexToWordOffset(currentSlideIndex + 1, slides)
      await storageService.setProgress(bookId, currentChapterIndex, wordOffset)
    } else {
      // At end of chapter, move to next chapter
      if (currentChapterIndex < chapters.length - 1) {
        setCurrentChapterIndex(currentChapterIndex + 1)
        setCurrentSlideIndex(0)
        await storageService.setProgress(bookId, currentChapterIndex + 1, 0)
      }
    }
  }, [slides, chapters, currentSlideIndex, currentChapterIndex, bookId, slideIndexToWordOffset])

  // Navigate to previous slide
  const goToPrevious = useCallback(async () => {
    if (slides.length === 0 || chapters.length === 0 || currentChapterIndex >= chapters.length) return

    slideEntryTime.current = Date.now()

    // Check if we can move to previous slide in current chapter
    if (currentSlideIndex > 0) {
      // Move to previous slide
      setCurrentSlideIndex(currentSlideIndex - 1)
      const wordOffset = slideIndexToWordOffset(currentSlideIndex - 1, slides)
      await storageService.setProgress(bookId, currentChapterIndex, wordOffset)
    } else {
      // At start of chapter, move to previous chapter
      if (currentChapterIndex > 0) {
        const prevChapterIndex = currentChapterIndex - 1
        setCurrentChapterIndex(prevChapterIndex)

        // Chunk the previous chapter to find its last slide
        const prevChapter = chapters[prevChapterIndex]
        const prevSlides = chunkerService.chunkText(prevChapter.text, chunkConfig)
        const lastSlideIndex = Math.max(0, prevSlides.length - 1)
        setCurrentSlideIndex(lastSlideIndex)

        const wordOffset = slideIndexToWordOffset(lastSlideIndex, prevSlides)
        await storageService.setProgress(bookId, prevChapterIndex, wordOffset)
      }
    }
  }, [slides, chapters, currentSlideIndex, currentChapterIndex, bookId, chunkConfig, slideIndexToWordOffset])

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
      !showSettings &&
      !showIndex &&
      currentChapterIndex < chapters.length &&
      !loading &&
      readingEstimator.current.shouldEnableAutoplay()

    if (shouldAutoAdvance) {
      startAutoAdvance()
    } else {
      stopAutoAdvance()
    }
    return () => stopAutoAdvance()
  }, [isAutoSwipeEnabled, isPaused, showSettings, showIndex, currentChapterIndex, chapters.length, loading, startAutoAdvance, stopAutoAdvance])

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

  // Helper: Get total words across all chapters
  const getTotalWords = useCallback((chapters: Chapter[]): number => {
    return chapters.reduce((sum, ch) => sum + ch.words, 0)
  }, [])

  // Helper: Get words before a chapter
  const getWordsBeforeChapter = useCallback((chapters: Chapter[], chapterIndex: number): number => {
    return chapters.slice(0, chapterIndex).reduce((sum, ch) => sum + ch.words, 0)
  }, [])

  // Calculate current progress
  const currentProgress = chapters.length > 0
    ? (() => {
        const totalWords = getTotalWords(chapters)
        if (totalWords === 0) return 0
        const wordsBefore = getWordsBeforeChapter(chapters, currentChapterIndex)
        const currentWordOffset = slideIndexToWordOffset(currentSlideIndex, slides)
        const currentPosition = wordsBefore + currentWordOffset
        return (currentPosition / totalWords) * 100
      })()
    : 0

  // Get current slide text
  const currentSlideText = slides.length > 0 && currentSlideIndex < slides.length
    ? slides[currentSlideIndex]
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

      {/* Top bar with back button, index, and settings */}
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
          <div className="absolute right-4 top-4 z-10 flex gap-2">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/80 text-slate-300 backdrop-blur-sm transition hover:bg-slate-800 hover:text-slate-100"
              aria-label="Chapter Index"
              onClick={(e) => {
                e.stopPropagation()
                setShowIndex(!showIndex)
              }}
            >
              <List className="h-5 w-5" />
            </button>
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

      {/* Footer with progress percentage */}
      {showControls && (
        <footer className="absolute bottom-0 left-0 right-0 z-10 px-6 pb-6">
          <div className="mx-auto max-w-2xl">
            <div className="flex items-center justify-center text-xs text-slate-400">
              <span>{Math.round(currentProgress)}% complete</span>
            </div>
          </div>
        </footer>
      )}

      {/* Chapter Index panel */}
      {showIndex ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowIndex(false)
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-6 pb-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold">Chapters</h2>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-2">
              {chapters.map((chapter, index) => {
                const isActive = index === currentChapterIndex
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={async () => {
                      setCurrentChapterIndex(index)
                      setCurrentSlideIndex(0)
                      await storageService.setProgress(bookId, index, 0)
                      setShowIndex(false)
                      slideEntryTime.current = Date.now()
                    }}
                    className={`w-full text-left px-4 py-3 rounded-lg transition mb-2 ${
                      isActive
                        ? 'bg-indigo-500/20 border border-indigo-500'
                        : 'bg-slate-800 hover:bg-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-slate-100">
                          {chapter.title || `Chapter ${index + 1}`}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {chapter.words.toLocaleString()} words
                        </div>
                      </div>
                      {isActive && (
                        <div className="ml-3 text-xs font-semibold text-indigo-400">
                          Current
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="p-4 border-t border-slate-700">
              <button
                type="button"
                className="w-full rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
                onClick={() => setShowIndex(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
