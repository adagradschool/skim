import { useCallback, useEffect, useRef, useState } from 'react'
import { storageService } from '@/db/StorageService'
import type { Slide, Chapter, Bookmark as BookmarkType } from '@/db/types'
import {
  AlertTriangle,
  Loader2,
  Settings,
  ArrowLeft,
  List,
  BookmarkCheck,
  Trash2,
  BookmarkX,
} from 'lucide-react'
import { ReadingTimeEstimator } from '@/utils/ReadingTimeEstimator'
import { useTheme } from '@/hooks/useTheme'

interface ReaderPageProps {
  bookId: string
  onExit: () => void
  openBookmarksOnMount?: boolean
}

export function ReaderPage({
  bookId,
  onExit,
  openBookmarksOnMount = false,
}: ReaderPageProps) {
  // Core state
  const [slides, setSlides] = useState<Slide[]>([])
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0)
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>([])

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
  const [selectedFont, setSelectedFont] = useState<
    'inter' | 'literata' | 'merriweather'
  >('literata')
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [showAddBookmark, setShowAddBookmark] = useState(false)
  const { theme, toggleTheme } = useTheme()

  // Reading time estimation
  const readingEstimator = useRef(new ReadingTimeEstimator())
  const slideEntryTime = useRef<number>(0)

  // Touch state
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const touchStartTime = useRef<number>(0)
  const autoAdvanceTimerRef = useRef<number | null>(null)
  const progressIntervalRef = useRef<number | null>(null)
  const controlsTimeoutRef = useRef<number | null>(null)
  const isHolding = useRef<boolean>(false)
  const lastTapTime = useRef<number>(0)

  // Wake lock state
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const inactivityTimerRef = useRef<number | null>(null)
  const INACTIVITY_TIMEOUT = 40 * 60 * 1000 // 40 minutes in milliseconds

  // Wake lock functions
  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) {
      return
    }

    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
      wakeLockRef.current.addEventListener('release', () => {
        wakeLockRef.current = null
      })
    } catch (err) {
      // Wake lock request failed, silently continue
      console.error('Wake lock request failed:', err)
    }
  }, [])

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release()
      wakeLockRef.current = null
    }
  }, [])

  const resetInactivityTimer = useCallback(() => {
    // Clear existing timer
    if (inactivityTimerRef.current !== null) {
      clearTimeout(inactivityTimerRef.current)
    }

    // Set new timer to release wake lock after 40 minutes
    inactivityTimerRef.current = window.setTimeout(() => {
      releaseWakeLock()
    }, INACTIVITY_TIMEOUT)
  }, [releaseWakeLock, INACTIVITY_TIMEOUT])

  // Load bookmarks
  const loadBookmarks = useCallback(async () => {
    const allBookmarks = await storageService.getAllBookmarks(bookId)
    setBookmarks(allBookmarks)
  }, [bookId])

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

        // Load all slides and chapters
        const [allSlides, allChapters] = await Promise.all([
          storageService.getAllSlides(bookId),
          storageService.getAllChapters(bookId),
        ])

        if (allSlides.length === 0) {
          throw new Error('No slides found')
        }
        setSlides(allSlides)
        setChapters(allChapters)

        // Load preferences
        const autoAdvanceSetting =
          await storageService.getKV('autoAdvanceEnabled')
        setIsAutoSwipeEnabled(autoAdvanceSetting ?? true)

        const savedFont = await storageService.getKV('selectedFont')
        if (
          savedFont &&
          ['inter', 'literata', 'merriweather'].includes(savedFont)
        ) {
          setSelectedFont(savedFont as 'inter' | 'literata' | 'merriweather')
        }

        // Get progress
        const progress = await storageService.getProgress(bookId)
        const startSlideIndex = progress?.slideIndex ?? 0
        setCurrentSlideIndex(startSlideIndex)

        // Load bookmarks
        await loadBookmarks()

        // Open bookmarks panel if requested
        if (openBookmarksOnMount) {
          setShowBookmarks(true)
          setShowControls(true)
        }

        slideEntryTime.current = Date.now()
      } catch (err) {
        console.error('Failed to load reader state', err)
        setError('Unable to load book. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    loadReaderState()
  }, [bookId, loadBookmarks, openBookmarksOnMount])

  useEffect(() => {
    readingEstimator.current.reset()
    slideEntryTime.current = Date.now()
  }, [bookId])

  // Wake lock initialization and visibility handling
  useEffect(() => {
    // Request wake lock on mount
    requestWakeLock()
    resetInactivityTimer()

    // Handle visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Reacquire wake lock when page becomes visible
        requestWakeLock()
        resetInactivityTimer()
      } else {
        // Release wake lock when page is hidden
        releaseWakeLock()
        if (inactivityTimerRef.current !== null) {
          clearTimeout(inactivityTimerRef.current)
          inactivityTimerRef.current = null
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Cleanup on unmount
    return () => {
      releaseWakeLock()
      if (inactivityTimerRef.current !== null) {
        clearTimeout(inactivityTimerRef.current)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [requestWakeLock, releaseWakeLock, resetInactivityTimer])

  // Navigate to next slide
  const goToNext = useCallback(async () => {
    if (slides.length === 0) return

    // Reset inactivity timer on user interaction
    resetInactivityTimer()

    // Record time spent on slide
    if (slideEntryTime.current > 0) {
      const timeSpent = (Date.now() - slideEntryTime.current) / 1000
      const currentWords = slides[currentSlideIndex]?.words ?? 0
      readingEstimator.current.addObservation(timeSpent, currentWords)
    }
    slideEntryTime.current = Date.now()

    // Move to next slide if not at end
    if (currentSlideIndex < slides.length - 1) {
      const newIndex = currentSlideIndex + 1
      setCurrentSlideIndex(newIndex)
      await storageService.setProgress(bookId, newIndex)
    }
  }, [slides, currentSlideIndex, bookId, resetInactivityTimer])

  // Navigate to previous slide
  const goToPrevious = useCallback(async () => {
    if (slides.length === 0) return

    // Reset inactivity timer on user interaction
    resetInactivityTimer()

    slideEntryTime.current = Date.now()

    // Move to previous slide if not at start
    if (currentSlideIndex > 0) {
      const newIndex = currentSlideIndex - 1
      setCurrentSlideIndex(newIndex)
      await storageService.setProgress(bookId, newIndex)
    }
  }, [slides, currentSlideIndex, bookId, resetInactivityTimer])

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

    const currentWords = slides[currentSlideIndex]?.words ?? 0
    const duration = readingEstimator.current.predict(currentWords) * 1000
    const startTime = Date.now()

    progressIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime
      const percent = Math.min((elapsed / duration) * 100, 100)
      setProgressPercent(percent)
    }, 50)

    autoAdvanceTimerRef.current = window.setTimeout(() => {
      goToNext()
    }, duration)
  }, [currentSlideIndex, goToNext, slides, stopAutoAdvance])

  useEffect(() => {
    const shouldAutoAdvance =
      isAutoSwipeEnabled &&
      !isPaused &&
      !showSettings &&
      !showIndex &&
      !showAddBookmark &&
      !showBookmarks &&
      currentSlideIndex < slides.length &&
      !loading &&
      readingEstimator.current.shouldEnableAutoplay()

    if (shouldAutoAdvance) {
      startAutoAdvance()
    } else {
      stopAutoAdvance()
    }
    return () => stopAutoAdvance()
  }, [
    isAutoSwipeEnabled,
    isPaused,
    showSettings,
    showIndex,
    showAddBookmark,
    showBookmarks,
    currentSlideIndex,
    slides.length,
    loading,
    startAutoAdvance,
    stopAutoAdvance,
  ])

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
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0]
      if (!touch) return
      touchStartX.current = touch.clientX
      touchStartY.current = touch.clientY
      touchStartTime.current = Date.now()
      isHolding.current = true

      // Reset inactivity timer on user interaction
      resetInactivityTimer()

      if (isAutoSwipeEnabled) {
        setIsPaused(true)
      }
    },
    [isAutoSwipeEnabled, resetInactivityTimer]
  )

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      isHolding.current = false

      if (touchStartX.current === null || touchStartY.current === null) {
        return
      }

      const touch = e.changedTouches[0]
      if (!touch) return

      const deltaX = touch.clientX - touchStartX.current
      const deltaY = touch.clientY - touchStartY.current
      const touchDuration = Date.now() - touchStartTime.current
      const tapX = touch.clientX
      const screenWidth = window.innerWidth

      touchStartX.current = null
      touchStartY.current = null

      // Check for tap
      if (
        Math.abs(deltaX) < 10 &&
        Math.abs(deltaY) < 10 &&
        touchDuration < 300
      ) {
        const currentTime = Date.now()
        const timeSinceLastTap = currentTime - lastTapTime.current

        // Check for double-tap (bookmark gesture)
        if (timeSinceLastTap < 200) {
          setShowAddBookmark(true)
          lastTapTime.current = 0 // Reset to prevent triple-tap from triggering
          return
        }

        lastTapTime.current = currentTime

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return

      const target = event.target as HTMLElement | null
      const isEditableTarget =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)

      const isPanelOpen =
        showSettings || showIndex || showAddBookmark || showBookmarks

      if (event.key === 'Escape') {
        event.preventDefault()
        if (showAddBookmark) {
          setShowAddBookmark(false)
        } else if (showBookmarks) {
          setShowBookmarks(false)
        } else if (showIndex) {
          setShowIndex(false)
        } else if (showSettings) {
          setShowSettings(false)
        } else {
          setShowControls(false)
        }
        return
      }

      if (isEditableTarget) return
      if (isPanelOpen) return

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goToNext()
        setIsPaused(false)
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goToPrevious()
        setIsPaused(false)
      }

      if (event.code === 'Space') {
        event.preventDefault()
        setIsPaused((prev) => !prev)
      }

      if (event.key.toLowerCase() === 'b') {
        event.preventDefault()
        setShowAddBookmark(true)
        setShowControls(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    goToNext,
    goToPrevious,
    showSettings,
    showIndex,
    showAddBookmark,
    showBookmarks,
  ])

  // Calculate current progress (match HomePage calculation)
  const currentProgress =
    slides.length > 0
      ? Math.min(
          100,
          Math.round((currentSlideIndex / Math.max(slides.length - 1, 1)) * 100)
        )
      : 0

  // Get current slide text
  const currentSlideText =
    slides.length > 0 && currentSlideIndex < slides.length
      ? slides[currentSlideIndex].text
      : ''

  // Get current chapter
  const currentChapter = slides[currentSlideIndex]?.chapter

  // Check if current slide is bookmarked
  const currentSlideBookmark = bookmarks.find(
    (b) => b.slideIndex === currentSlideIndex
  )
  const isCurrentSlideBookmarked = !!currentSlideBookmark

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500 dark:text-gray-400" />
      </div>
    )
  }

  if (error || slides.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-gray-50 px-6 text-gray-800 dark:bg-gray-900 dark:text-gray-100">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-error-50 text-error-600 dark:bg-error-900/40 dark:text-error-200">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Failed to Load Book
        </h2>
        <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">{error}</p>
        <button
          type="button"
          className="mt-6 rounded-full bg-primary-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-primary-500 dark:bg-primary-500 dark:hover:bg-primary-400"
          onClick={onExit}
        >
          Back to Library
        </button>
      </div>
    )
  }

  return (
    <div
      className="relative flex h-screen flex-col overflow-hidden bg-gray-50 text-gray-800 dark:bg-gray-900 dark:text-gray-100"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'none' }}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid-light dark:bg-grid-dark" />
      <div className="pointer-events-none absolute inset-0 -z-20 page-glow dark:page-glow-dark" />
      {/* Progress bar */}
      <div className="absolute left-0 right-0 top-0 z-20 h-1 bg-gray-200 dark:bg-gray-800">
        <div
          className="h-full bg-primary-500 transition-all duration-100 ease-linear dark:bg-primary-400"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Main slide content */}
      <main className="flex flex-1 flex-col items-center justify-center overflow-hidden px-8 py-20">
        <div className="w-full max-w-2xl flex-1 flex items-center">
          <p
            className="text-xl leading-relaxed text-gray-800 sm:text-2xl sm:leading-relaxed dark:text-gray-100"
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
            <h2 className="text-sm text-gray-500 dark:text-gray-400">{bookTitle}</h2>
          </div>
        )}
      </main>

      {/* Top bar with back button, index, and settings */}
      {showControls && (
        <>
          <div className="absolute left-4 top-4 z-10">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-gray-700 shadow-sm transition hover:bg-white dark:bg-gray-800/80 dark:text-gray-200 dark:hover:bg-gray-800"
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
            {isCurrentSlideBookmarked && (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-700 shadow-sm dark:bg-primary-900/50 dark:text-primary-200">
                <BookmarkCheck className="h-5 w-5" />
              </div>
            )}
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-gray-700 shadow-sm transition hover:bg-white dark:bg-gray-800/80 dark:text-gray-200 dark:hover:bg-gray-800"
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
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-gray-700 shadow-sm transition hover:bg-white dark:bg-gray-800/80 dark:text-gray-200 dark:hover:bg-gray-800"
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
            <div className="flex items-center justify-center text-xs text-gray-500 dark:text-gray-400">
              <span>{Math.round(currentProgress)}% complete</span>
            </div>
          </div>
        </footer>
      )}

      {/* Chapter Index panel */}
      {showIndex ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-primary-900/30 px-4 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowIndex(false)
            }
          }}
        >
          <div className="w-full max-w-md rounded-3xl border border-gray-200 glass-card text-gray-800 shadow-xl overflow-hidden flex flex-col max-h-[80vh] animate-in slide-in-from-bottom-4 duration-300 dark:border-gray-700 dark:glass-card-dark dark:text-gray-100">
            <div className="p-6 pb-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Chapters</h2>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-2">
              {chapters.map((chapter) => {
                const isActive = chapter.chapterIndex === currentChapter
                return (
                  <button
                    key={chapter.chapterIndex}
                    type="button"
                    onClick={async () => {
                      setCurrentSlideIndex(chapter.firstSlideIndex)
                      await storageService.setProgress(
                        bookId,
                        chapter.firstSlideIndex
                      )
                      setShowIndex(false)
                      slideEntryTime.current = Date.now()
                    }}
                    className={`w-full text-left px-4 py-3 rounded-xl transition mb-2 ${
                      isActive
                        ? 'bg-primary-100 border border-primary-300 dark:bg-primary-900/50 dark:border-primary-700'
                        : 'bg-white/70 hover:bg-white dark:bg-gray-900/60 dark:hover:bg-gray-900/80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                          {chapter.title}
                        </div>
                        <div className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                          {chapter.slideCount}{' '}
                          {chapter.slideCount === 1 ? 'slide' : 'slides'}
                        </div>
                      </div>
                      {isActive && (
                        <div className="ml-3 text-xs font-semibold text-primary-600 dark:text-primary-300">
                          Current
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                className="w-full rounded-full bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-500 dark:bg-primary-500 dark:hover:bg-primary-400"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-primary-900/30 px-4 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowSettings(false)
            }
          }}
        >
          <div className="w-full max-w-sm rounded-3xl border border-gray-200 glass-card p-6 text-gray-800 shadow-xl animate-in slide-in-from-bottom-4 duration-300 dark:border-gray-700 dark:glass-card-dark dark:text-gray-100">
            <h2 className="text-lg font-semibold">Reader Settings</h2>

            {/* Auto-swipe toggle */}
            <div className="mt-6 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Auto-swipe
              </label>
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
                  isAutoSwipeEnabled ? 'bg-primary-500' : 'bg-gray-200 dark:bg-gray-800'
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
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">
                Auto-swipe timing
              </label>
              <div className="mt-3 rounded-xl border border-gray-200 bg-white/70 p-3 dark:border-gray-700 dark:bg-gray-900/60">
                {readingEstimator.current.shouldEnableAutoplay() ? (
                  <div className="text-sm text-gray-700 dark:text-gray-200">
                    <div className="flex items-center justify-between">
                      <span>Predicted time:</span>
                      <span className="font-semibold text-primary-600 dark:text-primary-300">
                        {readingEstimator.current
                          .predict(slides[currentSlideIndex]?.words ?? 0)
                          .toFixed(1)}
                        s
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Based on {readingEstimator.current.getObservationCount()}{' '}
                      slides read
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Learning your reading speed...
                    <div className="mt-1 text-xs">
                      {readingEstimator.current.getObservationCount()} of 5
                      slides
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Font picker */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">
                Font
              </label>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    setSelectedFont('inter')
                    await storageService.setKV('selectedFont', 'inter')
                  }}
                  className={`flex h-16 flex-1 items-center justify-center rounded-lg border transition ${
                    selectedFont === 'inter'
                      ? 'border-primary-400 bg-primary-100 dark:border-primary-700 dark:bg-primary-900/50'
                      : 'border-gray-200 bg-white/70 hover:bg-white dark:border-gray-700 dark:bg-gray-900/60 dark:hover:bg-gray-900/80'
                  }`}
                >
                  <span
                    className="text-2xl font-medium"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
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
                      ? 'border-primary-400 bg-primary-100 dark:border-primary-700 dark:bg-primary-900/50'
                      : 'border-gray-200 bg-white/70 hover:bg-white dark:border-gray-700 dark:bg-gray-900/60 dark:hover:bg-gray-900/80'
                  }`}
                >
                  <span
                    className="text-2xl font-medium"
                    style={{ fontFamily: 'Literata, serif' }}
                  >
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
                      ? 'border-primary-400 bg-primary-100 dark:border-primary-700 dark:bg-primary-900/50'
                      : 'border-gray-200 bg-white/70 hover:bg-white dark:border-gray-700 dark:bg-gray-900/60 dark:hover:bg-gray-900/80'
                  }`}
                >
                  <span
                    className="text-2xl font-medium"
                    style={{ fontFamily: 'Merriweather, serif' }}
                  >
                    Aa
                  </span>
                </button>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Appearance
              </label>
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/80 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-white dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-200 dark:hover:bg-gray-900/80"
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {theme === 'dark' ? 'Dark' : 'Light'}
              </button>
            </div>

            <button
              type="button"
              className="mt-6 w-full rounded-full bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-500 dark:bg-primary-500 dark:hover:bg-primary-400"
              onClick={() => setShowSettings(false)}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      {/* Add/Edit Bookmark Modal */}
      {showAddBookmark ? (
        <AddBookmarkModal
          slideText={currentSlideText}
          existingAnnotation={currentSlideBookmark?.annotation || ''}
          isEditing={isCurrentSlideBookmarked}
          onSave={async (annotation) => {
            if (currentSlideBookmark) {
              // Update existing bookmark
              await storageService.deleteBookmark(currentSlideBookmark.id)
            }
            await storageService.createBookmark({
              bookId,
              slideIndex: currentSlideIndex,
              annotation,
              snippet: currentSlideText.substring(0, 200),
            })
            setShowAddBookmark(false)
            await loadBookmarks()
          }}
          onCancel={() => {
            setShowAddBookmark(false)
          }}
        />
      ) : null}

      {/* Bookmarks Panel */}
      {showBookmarks ? (
        <BookmarksPanel
          bookmarks={bookmarks}
          chapters={chapters}
          onNavigate={async (slideIndex) => {
            setCurrentSlideIndex(slideIndex)
            await storageService.setProgress(bookId, slideIndex)
            setShowBookmarks(false)
            slideEntryTime.current = Date.now()
          }}
          onDelete={async (bookmarkId) => {
            await storageService.deleteBookmark(bookmarkId)
            await loadBookmarks()
          }}
          onClose={() => setShowBookmarks(false)}
          onOpen={() => loadBookmarks()}
        />
      ) : null}
    </div>
  )
}

interface BookmarksPanelProps {
  bookmarks: BookmarkType[]
  chapters: Chapter[]
  onNavigate: (slideIndex: number) => void
  onDelete: (bookmarkId: string) => void
  onClose: () => void
  onOpen: () => void
}

function BookmarksPanel({
  bookmarks,
  chapters,
  onNavigate,
  onDelete,
  onClose,
  onOpen,
}: BookmarksPanelProps) {
  useEffect(() => {
    onOpen()
  }, [onOpen])

  const getChapterForSlide = (slideIndex: number): Chapter | undefined => {
    return chapters.find(
      (ch) =>
        slideIndex >= ch.firstSlideIndex &&
        slideIndex < ch.firstSlideIndex + ch.slideCount
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary-900/30 px-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="w-full max-w-md rounded-3xl border border-gray-200 glass-card text-gray-800 shadow-xl overflow-hidden flex flex-col max-h-[80vh] animate-in slide-in-from-bottom-4 duration-300 dark:border-gray-700 dark:glass-card-dark dark:text-gray-100">
        <div className="p-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold">Bookmarks</h2>
        </div>
        <div className="overflow-y-auto flex-1 px-4 py-2">
          {bookmarks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500 dark:text-gray-400">
              <BookmarkX className="h-12 w-12 mb-3" />
              <p className="text-sm">No bookmarks yet</p>
              <p className="text-xs mt-1">
                Tap the bookmark icon to save slides
              </p>
            </div>
          ) : (
            bookmarks.map((bookmark) => {
              const chapter = getChapterForSlide(bookmark.slideIndex)
              return (
                <div
                  key={bookmark.id}
                  className="mb-3 rounded-xl border border-gray-200 bg-white/70 p-4 transition hover:bg-white dark:border-gray-700 dark:bg-gray-900/60 dark:hover:bg-gray-900/80"
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      className="flex-1 text-left"
                      onClick={() => onNavigate(bookmark.slideIndex)}
                    >
                      <div className="text-xs font-medium text-primary-600 mb-2 dark:text-primary-300">
                        {chapter?.title || 'Unknown Chapter'} · Slide{' '}
                        {bookmark.slideIndex + 1}
                      </div>
                      <div className="text-sm text-gray-700 mb-2 line-clamp-2 dark:text-gray-200">
                        {bookmark.snippet}
                      </div>
                      {bookmark.annotation && (
                        <div className="text-sm text-gray-500 italic mt-2 border-l-2 border-gray-200 pl-2 dark:text-gray-400 dark:border-gray-700">
                          {bookmark.annotation}
                        </div>
                      )}
                    </button>
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-error-500 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-error-300"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(bookmark.id)
                      }}
                      aria-label="Delete bookmark"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
        <div className="p-4 border-t border-gray-200">
          <button
            type="button"
            className="w-full rounded-full bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-500"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

interface AddBookmarkModalProps {
  slideText: string
  existingAnnotation: string
  isEditing: boolean
  onSave: (annotation: string) => void
  onCancel: () => void
}

function AddBookmarkModal({
  slideText,
  existingAnnotation,
  isEditing,
  onSave,
  onCancel,
}: AddBookmarkModalProps) {
  const [annotation, setAnnotation] = useState(existingAnnotation)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary-900/30 px-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel()
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-3xl border border-gray-200 glass-card p-6 text-gray-800 shadow-xl animate-in slide-in-from-bottom-4 duration-300 dark:border-gray-700 dark:glass-card-dark dark:text-gray-100">
        <h2 className="text-lg font-semibold">
          {isEditing ? 'Edit Bookmark' : 'Add Bookmark'}
        </h2>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">
            Slide content
          </label>
          <div className="mt-2 rounded-lg bg-white/80 p-3 text-sm text-gray-700 max-h-32 overflow-y-auto dark:bg-gray-900/60 dark:text-gray-200">
            {slideText}
          </div>
        </div>

        <div className="mt-4">
          <label
            htmlFor="annotation"
            className="block text-sm font-medium text-gray-600"
          >
            Your note (optional)
          </label>
          <textarea
            id="annotation"
            className="mt-2 w-full rounded-lg border border-gray-200 bg-white/80 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="Add your thoughts or notes about this slide..."
            rows={3}
            value={annotation}
            onChange={(e) => setAnnotation(e.target.value)}
            autoFocus
          />
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            className="flex-1 rounded-full border border-gray-200 bg-white/80 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-white"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="flex-1 rounded-full bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-500"
            onClick={() => onSave(annotation)}
          >
            {isEditing ? 'Update' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ReaderPage
