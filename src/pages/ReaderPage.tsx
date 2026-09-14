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
import { useHardwareNav } from '@/hooks/useHardwareNav'

interface ReaderPageProps {
  bookId: string
  onExit: () => void
  openBookmarksOnMount?: boolean
}

const ICON_STROKE = 2.5

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
  const [isHardwareNavEnabled, setIsHardwareNavEnabled] = useState(false)
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

        const hardwareNavSetting =
          await storageService.getKV('hardwareNavEnabled')
        setIsHardwareNavEnabled(hardwareNavSetting ?? false)

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

  const isPanelOpen =
    showSettings || showIndex || showAddBookmark || showBookmarks

  // Hardware buttons (volume rocker where exposed, headset / BT remotes via Media Session)
  useHardwareNav({
    enabled: isHardwareNavEnabled && !loading && !isPanelOpen,
    onNext: () => {
      goToNext()
      setIsPaused(false)
    },
    onPrevious: () => {
      goToPrevious()
      setIsPaused(false)
    },
    title: bookTitle,
  })

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

      const panelOpen =
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
      if (panelOpen) return

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
      <div className="flex h-screen items-center justify-center bg-bg dark:bg-bg-dark">
        <div className="nb-box flex h-16 w-16 items-center justify-center bg-yellow dark:bg-yellow">
          <Loader2 className="h-8 w-8 animate-spin text-black" strokeWidth={ICON_STROKE} />
        </div>
      </div>
    )
  }

  if (error || slides.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-bg px-6 text-fg dark:bg-bg-dark dark:text-fg-dark">
        <div className="nb-box flex h-16 w-16 items-center justify-center bg-danger text-black dark:bg-danger-dark">
          <AlertTriangle className="h-8 w-8" strokeWidth={ICON_STROKE} />
        </div>
        <h2 className="mt-5 text-xl font-extrabold uppercase">
          Failed to Load Book
        </h2>
        <p className="mt-2 text-center text-sm font-semibold text-fg-muted dark:text-fg-muted-dark">{error}</p>
        <button
          type="button"
          className="nb-btn nb-btn-main mt-6 px-6 py-2.5 text-sm"
          onClick={onExit}
        >
          Back to Library
        </button>
      </div>
    )
  }

  return (
    <div
      className="relative flex h-screen flex-col overflow-hidden bg-bg bg-dots text-fg dark:bg-bg-dark dark:bg-dots-dark dark:text-fg-dark"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'none' }}
    >
      {/* Auto-advance progress bar */}
      <div className="absolute left-0 right-0 top-0 z-20 h-2 border-b-2 border-border bg-surface dark:bg-surface-muted-dark">
        <div
          className="h-full bg-main transition-all duration-100 ease-linear dark:bg-main-dark"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Main slide content */}
      <main className="flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-20">
        <div className="nb-box-lg flex w-full max-w-2xl flex-1 items-center overflow-hidden px-6 py-8 sm:px-10">
          <p
            className="w-full text-xl font-medium leading-relaxed sm:text-2xl sm:leading-relaxed"
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
            <span className="nb-chip bg-surface dark:bg-surface-dark">{bookTitle}</span>
          </div>
        )}
      </main>

      {/* Top bar with back button, index, and settings */}
      {showControls && (
        <>
          <div className="absolute left-4 top-6 z-10">
            <button
              type="button"
              className="nb-icon-btn nb-btn-neutral"
              aria-label="Back to Library"
              onClick={(e) => {
                e.stopPropagation()
                onExit()
              }}
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={ICON_STROKE} />
            </button>
          </div>
          <div className="absolute right-4 top-6 z-10 flex gap-3">
            {isCurrentSlideBookmarked && (
              <div className="nb-box flex h-11 w-11 items-center justify-center bg-yellow text-black dark:bg-yellow">
                <BookmarkCheck className="h-5 w-5" strokeWidth={ICON_STROKE} />
              </div>
            )}
            <button
              type="button"
              className="nb-icon-btn nb-btn-neutral"
              aria-label="Chapter Index"
              onClick={(e) => {
                e.stopPropagation()
                setShowIndex(!showIndex)
              }}
            >
              <List className="h-5 w-5" strokeWidth={ICON_STROKE} />
            </button>
            <button
              type="button"
              className="nb-icon-btn nb-btn-neutral"
              aria-label="Settings"
              onClick={(e) => {
                e.stopPropagation()
                setShowSettings(!showSettings)
              }}
            >
              <Settings className="h-5 w-5" strokeWidth={ICON_STROKE} />
            </button>
          </div>
        </>
      )}

      {/* Footer with progress percentage */}
      {showControls && (
        <footer className="absolute bottom-0 left-0 right-0 z-10 px-6 pb-6">
          <div className="mx-auto flex max-w-2xl items-center justify-center">
            <span className="nb-chip bg-lime text-black">{Math.round(currentProgress)}% complete</span>
          </div>
        </footer>
      )}

      {/* Chapter Index panel */}
      {showIndex ? (
        <div
          className="nb-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowIndex(false)
            }
          }}
        >
          <div className="nb-modal flex max-h-[80vh] max-w-md flex-col overflow-hidden">
            <div className="border-b-2 border-border bg-main p-5 text-black dark:bg-main-dark">
              <h2 className="text-xl font-extrabold uppercase">Chapters</h2>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
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
                    className={`nb-btn mb-3 w-full justify-start px-4 py-3 text-left ${
                      isActive ? 'nb-btn-yellow' : 'nb-btn-neutral'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-extrabold">
                          {chapter.title}
                        </div>
                        <div className="mt-1 text-xs font-semibold opacity-70">
                          {chapter.slideCount}{' '}
                          {chapter.slideCount === 1 ? 'slide' : 'slides'}
                        </div>
                      </div>
                      {isActive && (
                        <span className="nb-chip ml-3 bg-surface text-black">
                          Current
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="border-t-2 border-border p-4">
              <button
                type="button"
                className="nb-btn nb-btn-main w-full px-4 py-2.5 text-sm"
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
          className="nb-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowSettings(false)
            }
          }}
        >
          <div className="nb-modal max-h-[85vh] max-w-sm overflow-y-auto p-6">
            <h2 className="text-xl font-extrabold uppercase">Reader Settings</h2>

            {/* Auto-swipe toggle */}
            <div className="mt-6 flex items-center justify-between">
              <label className="text-sm font-bold">Auto-swipe</label>
              <Toggle
                checked={isAutoSwipeEnabled}
                onChange={async (newValue) => {
                  setIsAutoSwipeEnabled(newValue)
                  await storageService.setKV('autoAdvanceEnabled', newValue)
                }}
              />
            </div>

            {/* Hardware buttons toggle */}
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold">Volume buttons turn pages</label>
                <Toggle
                  checked={isHardwareNavEnabled}
                  onChange={async (newValue) => {
                    setIsHardwareNavEnabled(newValue)
                    await storageService.setKV('hardwareNavEnabled', newValue)
                  }}
                />
              </div>
              <p className="mt-2 text-xs font-semibold leading-snug text-fg-muted dark:text-fg-muted-dark">
                Up = next, down = previous. In the Skim Android app the rocker
                is captured directly. In a browser, Chrome on Android and iOS
                Safari keep the rocker for themselves, so there this only reaches
                headset and Bluetooth page-turner buttons via a silent media session.
              </p>
            </div>

            {/* Reading time status */}
            <div className="mt-6">
              <label className="block text-sm font-bold">Auto-swipe timing</label>
              <div className="nb-muted mt-3 p-3">
                {readingEstimator.current.shouldEnableAutoplay() ? (
                  <div className="text-sm font-semibold">
                    <div className="flex items-center justify-between">
                      <span>Predicted time:</span>
                      <span className="nb-chip bg-lime text-black">
                        {readingEstimator.current
                          .predict(slides[currentSlideIndex]?.words ?? 0)
                          .toFixed(1)}
                        s
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-fg-muted dark:text-fg-muted-dark">
                      Based on {readingEstimator.current.getObservationCount()}{' '}
                      slides read
                    </div>
                  </div>
                ) : (
                  <div className="text-sm font-semibold">
                    Learning your reading speed...
                    <div className="mt-1 text-xs text-fg-muted dark:text-fg-muted-dark">
                      {readingEstimator.current.getObservationCount()} of 5
                      slides
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Font picker */}
            <div className="mt-6">
              <label className="block text-sm font-bold">Font</label>
              <div className="mt-3 flex gap-3">
                {(
                  [
                    ['inter', 'Inter, sans-serif'],
                    ['literata', 'Literata, serif'],
                    ['merriweather', 'Merriweather, serif'],
                  ] as const
                ).map(([font, family]) => (
                  <button
                    key={font}
                    type="button"
                    aria-pressed={selectedFont === font}
                    onClick={async () => {
                      setSelectedFont(font)
                      await storageService.setKV('selectedFont', font)
                    }}
                    className={`nb-btn h-16 flex-1 ${
                      selectedFont === font ? 'nb-btn-main' : 'nb-btn-neutral'
                    }`}
                  >
                    <span className="text-2xl font-medium" style={{ fontFamily: family }}>
                      Aa
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <label className="text-sm font-bold">Appearance</label>
              <button
                type="button"
                onClick={toggleTheme}
                className="nb-btn nb-btn-yellow px-3 py-2 text-xs uppercase tracking-wider"
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {theme === 'dark' ? 'Dark' : 'Light'}
              </button>
            </div>

            <button
              type="button"
              className="nb-btn nb-btn-main mt-6 w-full px-4 py-2.5 text-sm"
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

interface ToggleProps {
  checked: boolean
  onChange: (value: boolean) => void
}

function Toggle({ checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-nb border-2 border-border transition-colors ${
        checked ? 'bg-lime' : 'bg-surface-muted dark:bg-surface-muted-dark'
      }`}
      style={{ boxShadow: 'var(--shadow-nb-sm)' }}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-nb border-2 border-border bg-surface transition-transform dark:bg-fg-dark ${
          checked ? 'translate-x-7' : 'translate-x-1'
        }`}
      />
    </button>
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
      className="nb-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="nb-modal flex max-h-[80vh] max-w-md flex-col overflow-hidden">
        <div className="border-b-2 border-border bg-yellow p-5 text-black">
          <h2 className="text-xl font-extrabold uppercase">Bookmarks</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {bookmarks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BookmarkX className="mb-3 h-12 w-12" strokeWidth={2} />
              <p className="text-sm font-extrabold">No bookmarks yet</p>
              <p className="mt-1 text-xs font-semibold text-fg-muted dark:text-fg-muted-dark">
                Double-tap a slide to save it
              </p>
            </div>
          ) : (
            bookmarks.map((bookmark) => {
              const chapter = getChapterForSlide(bookmark.slideIndex)
              return (
                <div
                  key={bookmark.id}
                  className="nb-box mb-4 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      className="flex-1 text-left"
                      onClick={() => onNavigate(bookmark.slideIndex)}
                    >
                      <span className="nb-chip mb-2 bg-main text-black dark:bg-main-dark">
                        {chapter?.title || 'Unknown Chapter'} · Slide{' '}
                        {bookmark.slideIndex + 1}
                      </span>
                      <div className="mb-2 line-clamp-2 text-sm font-semibold">
                        {bookmark.snippet}
                      </div>
                      {bookmark.annotation && (
                        <div className="mt-2 border-l-4 border-border pl-3 text-sm font-medium italic text-fg-muted dark:text-fg-muted-dark">
                          {bookmark.annotation}
                        </div>
                      )}
                    </button>
                    <button
                      type="button"
                      className="nb-btn nb-btn-danger h-9 w-9 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(bookmark.id)
                      }}
                      aria-label="Delete bookmark"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={ICON_STROKE} />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
        <div className="border-t-2 border-border p-4">
          <button
            type="button"
            className="nb-btn nb-btn-main w-full px-4 py-2.5 text-sm"
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
      className="nb-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel()
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="nb-modal max-w-md p-6">
        <h2 className="text-xl font-extrabold uppercase">
          {isEditing ? 'Edit Bookmark' : 'Add Bookmark'}
        </h2>

        <div className="mt-4">
          <label className="block text-sm font-bold">Slide content</label>
          <div className="nb-muted mt-2 max-h-32 overflow-y-auto p-3 text-sm font-medium">
            {slideText}
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="annotation" className="block text-sm font-bold">
            Your note (optional)
          </label>
          <textarea
            id="annotation"
            className="nb-input mt-2"
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
            className="nb-btn nb-btn-neutral flex-1 px-4 py-2 text-sm"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="nb-btn nb-btn-main flex-1 px-4 py-2 text-sm"
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
