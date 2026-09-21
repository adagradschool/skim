import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { storageService } from '@/db/StorageService'
import type { Book, Progress } from '@/db/types'
import { importService, type ImportProgressUpdate } from '@/importer/ImportService'
import { AlertTriangle, BookOpen, Check, Circle, Loader2, MoreVertical, Plus, Trash2, Upload, X, Bookmark, Settings, Store } from 'lucide-react'
import { ReaderPage } from '@/pages/ReaderPage'
import { useTheme } from '@/hooks/useTheme'
import { gamification, levelFor, weekMinutes, todayStats, EVENT_LABELS, POINTS, emptyState, type ReaderProfile, type ScoreState, type ScoreEvent } from '@/gamification/score'
import { ReaderCard } from '@/components/ReaderCard'
import { LIBRARY_CHANGED_EVENT } from '@/shared/sharedFiles'
import { SettingsSheet } from '@/components/SettingsSheet'
import { StorePage } from '@/store/StorePage'
import { ArticlesPage } from '@/articles/ArticlesPage'
import { Newspaper, ChevronRight } from 'lucide-react'

interface LibraryEntry {
  id: string
  title: string
  author?: string
  coverUrl?: string
  progressPercent?: number
  actionLabel: string
  lastUpdated: number
}

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB limit

const IMPORT_STAGES = ['reading', 'parsing', 'chunking', 'storing', 'complete'] as const
const STAGE_LABELS: Record<(typeof IMPORT_STAGES)[number], string> = {
  reading: 'Reading file',
  parsing: 'Parsing chapters',
  chunking: 'Chunking slides',
  storing: 'Saving to library',
  complete: 'Done',
}

type ImportStage = (typeof IMPORT_STAGES)[number] | 'idle'

type StepStatus = 'pending' | 'active' | 'done' | 'error'

export function HomePage() {
  useTheme() // keeps the document theme applied on this page
  const [showSettings, setShowSettings] = useState(false)
  const [entries, setEntries] = useState<LibraryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isUploadOpen, setUploadOpen] = useState(false)
  const [deleteBookId, setDeleteBookId] = useState<string | null>(null)
  const [readingBookId, setReadingBookId] = useState<string | null>(null)
  const [showBookmarksOnOpen, setShowBookmarksOnOpen] = useState(false)
  const [score, setScore] = useState<ScoreState>(emptyState())
  const [profile, setProfile] = useState<ReaderProfile | null>(null)
  const [showCard, setShowCard] = useState(false)
  const [showStore, setShowStore] = useState(false)
  const [showArticles, setShowArticles] = useState(false)
  const [articles, setArticles] = useState<Book[]>([])

  useEffect(() => {
    let alive = true
    gamification.getState().then((s) => alive && setScore(s))
    gamification.getProfile().then((p) => alive && setProfile(p))
    const unsub = gamification.subscribe((s) => alive && setScore(s))
    return () => {
      alive = false
      unsub()
    }
  }, [readingBookId])

  const coverUrlsRef = useRef<string[]>([])

  const revokeCoverUrls = useCallback(() => {
    coverUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    coverUrlsRef.current = []
  }, [])

  const buildLibraryEntry = useCallback(
    async (book: Book): Promise<LibraryEntry> => {
      const [progress, totalSlides] = await Promise.all([
        storageService.getProgress(book.id),
        storageService.countSlides(book.id),
      ])

      const { percent, actionLabel } = deriveProgress(progress, totalSlides)

      let coverUrl: string | undefined
      if (book.coverBlob) {
        coverUrl = URL.createObjectURL(book.coverBlob)
        coverUrlsRef.current.push(coverUrl)
      }

      return {
        id: book.id,
        title: book.title,
        author: book.author,
        coverUrl,
        progressPercent: percent,
        actionLabel,
        lastUpdated: book.modifiedAt,
      }
    },
    []
  )

  const refreshLibrary = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      revokeCoverUrls()

      const all = await storageService.getAllBooks()
      const books = all.filter((b) => b.kind !== 'article')
      setArticles(all.filter((b) => b.kind === 'article'))
      const items = await Promise.all(books.map((book) => buildLibraryEntry(book)))

      setEntries(items)
    } catch (err) {
      console.error('Failed to load library', err)
      setError('Unable to load your library. Try again in a moment.')
    } finally {
      setLoading(false)
    }
  }, [buildLibraryEntry, revokeCoverUrls])

  useEffect(() => {
    refreshLibrary()
    const onChanged = () => void refreshLibrary()
    window.addEventListener(LIBRARY_CHANGED_EVENT, onChanged)
    return () => {
      window.removeEventListener(LIBRARY_CHANGED_EVENT, onChanged)
      revokeCoverUrls()
    }
  }, [refreshLibrary, revokeCoverUrls])

  const handleCloseUpload = useCallback(() => setUploadOpen(false), [])

  const handleDeleteBook = useCallback(async (bookId: string) => {
    try {
      await storageService.deleteBook(bookId)
      await refreshLibrary()
      setDeleteBookId(null)
    } catch (err) {
      console.error('Failed to delete book', err)
      setError('Unable to delete book. Try again in a moment.')
    }
  }, [refreshLibrary])

  const handleOpenBook = useCallback(async (bookId: string, openBookmarks = false) => {
    // Track last opened book
    await storageService.setKV('lastOpenedBookId', bookId)
    setShowBookmarksOnOpen(openBookmarks)
    setReadingBookId(bookId)
  }, [])

  const handleExitReader = useCallback(() => {
    setReadingBookId(null)
    refreshLibrary() // Refresh to update progress
  }, [refreshLibrary])

  // Show reader if a book is selected
  if (readingBookId) {
    return <ReaderPage bookId={readingBookId} onExit={handleExitReader} openBookmarksOnMount={showBookmarksOnOpen} />
  }

  if (showArticles) {
    return (
      <ArticlesPage
        onClose={() => {
          setShowArticles(false)
          void refreshLibrary()
        }}
        onRead={(bookId) => {
          setShowArticles(false)
          void handleOpenBook(bookId)
        }}
      />
    )
  }

  if (showStore) {
    return (
      <StorePage
        onClose={() => {
          setShowStore(false)
          void refreshLibrary()
        }}
        onRead={(bookId) => {
          setShowStore(false)
          void handleOpenBook(bookId)
        }}
      />
    )
  }

  return (
    <div className="relative min-h-screen bg-bg bg-dots text-fg dark:bg-bg-dark dark:bg-dots-dark dark:text-fg-dark">

      <header className="flex items-start justify-between px-6 pt-8 pb-6">
        <div className="min-w-0 pr-3">
          <span className="nb-chip bg-yellow text-black">Skim</span>
          <h1 className="mt-3 font-display text-2xl uppercase leading-none tracking-tight sm:text-3xl">Your Library</h1>
          <p className="mt-2 text-sm font-semibold text-fg-muted dark:text-fg-muted-dark">Pick up where you left off or start something new.</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowStore(true)}
              aria-label="Store"
              className="nb-icon-btn nb-btn-yellow"
            >
              <Store className="h-5 w-5" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              aria-label="Settings"
              className="nb-icon-btn nb-btn-neutral"
            >
              <Settings className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowCard(true)}
            aria-label="Reader card and score"
            className="nb-btn nb-btn-yellow px-3 py-1.5 text-xs uppercase tracking-wider"
          >
            {levelFor(score.points).name} · {score.points.toLocaleString()}
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 pb-24">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2.5} />
          </div>
        ) : error ? (
          <div className="nb-box bg-danger p-4 text-sm font-semibold text-black dark:bg-danger-dark dark:text-black">
            <div className="mb-2 flex items-center gap-2 font-extrabold uppercase">
              <AlertTriangle className="h-4 w-4" strokeWidth={2.5} /> Error
            </div>
            {error}
          </div>
        ) : entries.length === 0 && articles.length === 0 ? (
          <EmptyLibrary onUpload={() => setUploadOpen(true)} onStore={() => setShowStore(true)} />
        ) : (
          <ul className="space-y-4">
            {articles.length > 0 ? (
              <li>
                <ArticlesFolder articles={articles} onOpen={() => setShowArticles(true)} />
              </li>
            ) : null}
            {entries.map((entry) => (
              <li key={entry.id}>
                <LibraryCard
                  entry={entry}
                  onDelete={() => setDeleteBookId(entry.id)}
                  onOpen={() => handleOpenBook(entry.id)}
                  onViewBookmarks={() => handleOpenBook(entry.id, true)}
                />
              </li>
            ))}
          </ul>
        )}
      </main>

      <button
        type="button"
        className="nb-btn nb-btn-main fixed bottom-6 right-6 h-14 w-14"
        aria-label="Upload Document"
        onClick={() => setUploadOpen(true)}
      >
        <Plus className="h-7 w-7" strokeWidth={3} />
      </button>

      {isUploadOpen ? (
        <UploadOverlay
          onClose={handleCloseUpload}
          onOpenStore={() => {
            handleCloseUpload()
            setShowStore(true)
          }}
          onImported={async () => {
            await refreshLibrary()
            handleCloseUpload()
          }}
        />
      ) : null}

      {showCard ? (
        <ScoreSheet score={score} profile={profile} onClose={() => setShowCard(false)} />
      ) : null}

      {showSettings ? <SettingsSheet onClose={() => setShowSettings(false)} /> : null}

      {deleteBookId ? (
        <DeleteConfirmationModal
          onConfirm={() => handleDeleteBook(deleteBookId)}
          onCancel={() => setDeleteBookId(null)}
        />
      ) : null}
    </div>
  )
}

interface ArticlesFolderProps {
  articles: Book[]
  onOpen: () => void
}

/** The folder row on the library page. Articles never mix with books. */
function ArticlesFolder({ articles, onOpen }: ArticlesFolderProps) {
  const newest = [...articles].sort((a, b) => b.modifiedAt - a.modifiedAt)[0]
  return (
    <button
      type="button"
      onClick={onOpen}
      className="nb-box flex w-full items-center gap-4 bg-pink p-4 text-left text-black transition-[transform,box-shadow] duration-100 hover:translate-x-[2px] hover:translate-y-[2px] hover:[box-shadow:var(--shadow-nb-sm)] active:translate-x-[4px] active:translate-y-[4px] active:[box-shadow:var(--shadow-nb-none)] dark:bg-pink dark:text-black"
      aria-label={`Articles, ${articles.length} saved`}
    >
      <span className="nb-box-flat flex h-20 w-16 shrink-0 items-center justify-center bg-white text-black">
        <Newspaper className="h-7 w-7" strokeWidth={2.5} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-base font-extrabold">Articles</span>
          <span className="nb-chip bg-white text-black">{articles.length}</span>
        </span>
        {newest ? (
          <span className="mt-1 block truncate text-sm font-semibold opacity-80">{newest.title}</span>
        ) : null}
        <span className="mt-1 block text-xs font-bold uppercase tracking-wider opacity-70">Saved from the web</span>
      </span>
      <ChevronRight className="h-6 w-6 shrink-0" strokeWidth={3} />
    </button>
  )
}

interface IconButtonProps {
  label: string
  children: ReactNode
}

function IconButton({ label, children }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className="nb-icon-btn nb-btn-neutral"
    >
      {children}
    </button>
  )
}

interface UploadOverlayProps {
  onClose: () => void
  onOpenStore: () => void
  onImported: (bookId: string) => Promise<void> | void
}

function UploadOverlay({ onClose, onOpenStore, onImported }: UploadOverlayProps) {
  const [dragActive, setDragActive] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [progressStage, setProgressStage] = useState<ImportStage>('idle')
  const [progressMessage, setProgressMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setUploading] = useState(false)
  const [importedBookId, setImportedBookId] = useState<string | null>(null)
  const [controller, setController] = useState<AbortController | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const resetState = useCallback(() => {
    setFileName(null)
    setProgressStage('idle')
    setProgressMessage('')
    setError(null)
    setUploading(false)
    setImportedBookId(null)
    controller?.abort()
    setController(null)
  }, [controller])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isUploading) {
        resetState()
        onClose()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isUploading, onClose, resetState])

  const handleOverlayClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget && !isUploading) {
        resetState()
        onClose()
      }
    },
    [isUploading, onClose, resetState]
  )

  const handleFile = useCallback(
    async (file: File) => {
      if (!file) return

      const fileName = file.name.toLowerCase()
      const isEpub = fileName.endsWith('.epub') || file.type === 'application/epub+zip'
      const isPdf = fileName.endsWith('.pdf') || file.type === 'application/pdf'

      if (!isEpub && !isPdf) {
        setError('Please choose an EPUB or PDF file')
        return
      }

      // Check file size
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError('File is too large (max 20 MB)')
        return
      }

      setError(null)
      setFileName(file.name)
      setProgressStage('reading')
      setProgressMessage('Reading file...')
      setUploading(true)

      const abortController = new AbortController()
      setController(abortController)

      try {
        const bookId = await importService.import(file, {
          signal: abortController.signal,
          onProgress: (update: ImportProgressUpdate) => {
            setProgressStage(update.stage)
            setProgressMessage(update.message)
          },
        })

        setImportedBookId(bookId)
        setProgressStage('complete')
        setProgressMessage('Import complete. Ready to read!')
        await onImported(bookId)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setError('Import cancelled')
        } else {
          const message = err instanceof Error ? err.message : String(err)
          setError(message)
        }
      } finally {
        setUploading(false)
        setController(null)
      }
    },
    [onImported]
  )

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setDragActive(false)
      if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
        void handleFile(event.dataTransfer.files[0])
      }
    },
    [handleFile]
  )

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragActive(false)
  }, [])

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file) {
        void handleFile(file)
      }
    },
    [handleFile]
  )

  const handleCancel = useCallback(() => {
    if (controller) {
      controller.abort()
    }
  }, [controller])

  const stepStatuses = useMemo<StepStatus[]>(() => {
    if (progressStage === 'idle') {
      return IMPORT_STAGES.map(() => 'pending')
    }

    const activeIndex = IMPORT_STAGES.indexOf(progressStage as ImportStage)

    return IMPORT_STAGES.map((stage, index) => {
      if (importedBookId && progressStage === 'complete') {
        return 'done'
      }

      if (error && activeIndex === index) {
        return 'error'
      }

      if (index < activeIndex) {
        return 'done'
      }

      if (index === activeIndex) {
        return error ? 'error' : 'active'
      }

      return 'pending'
    })
  }, [error, importedBookId, progressStage])

  const canDismiss = !isUploading

  return (
    <div
      className="nb-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
    >
      <div className="nb-modal max-w-md p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold uppercase">Import Document</h2>
            <p className="mt-1 text-sm font-semibold text-fg-muted dark:text-fg-muted-dark">Add an EPUB or PDF from your device.</p>
          </div>
          <button
            type="button"
            className="nb-btn nb-btn-neutral h-9 w-9 shrink-0"
            aria-label="Close"
            onClick={() => {
              if (!canDismiss) return
              resetState()
              onClose()
            }}
            disabled={!canDismiss}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className={`mt-6 flex flex-col items-center justify-center rounded-nb border-2 border-dashed border-border p-8 text-center transition ${
            dragActive
              ? 'bg-lime dark:bg-lime dark:text-black'
              : 'bg-surface-muted dark:bg-surface-muted-dark'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="nb-box flex h-12 w-12 items-center justify-center bg-main text-black dark:bg-main-dark">
            <Upload className="h-6 w-6" strokeWidth={2.5} />
          </div>
          <p className="mt-4 text-base font-extrabold">Drag & drop your document</p>
          <p className="mt-1 text-sm font-semibold text-fg-muted dark:text-fg-muted-dark">or</p>
          <button
            type="button"
            className="nb-btn nb-btn-main mt-4 px-4 py-2 text-sm"
            onClick={handleBrowseClick}
            disabled={isUploading}
          >
            Browse files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub,.pdf,application/epub+zip,application/pdf"
            className="hidden"
            onChange={handleFileInputChange}
          />
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-fg-muted dark:text-fg-muted-dark">EPUB or PDF · Up to 20 MB</p>
          {fileName ? <p className="mt-3 text-sm font-semibold">Selected: {fileName}</p> : null}
        </div>

        {!isUploading && !importedBookId ? (
          <button
            type="button"
            onClick={onOpenStore}
            className="nb-btn nb-btn-yellow mt-4 w-full justify-start gap-3 px-4 py-3 text-left"
          >
            <Store className="h-5 w-5 shrink-0" strokeWidth={2.5} />
            <span>
              <span className="block text-sm font-extrabold">Nothing on hand? Browse the Store</span>
              <span className="block text-xs font-semibold opacity-70">Hundreds of free classics, ready to read</span>
            </span>
          </button>
        ) : null}

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-sm font-bold">
            <span>
              {progressStage !== 'idle' ? STAGE_LABELS[progressStage as ImportStage] : 'Ready'}
            </span>
            <span className="text-fg-muted dark:text-fg-muted-dark">
              {progressStage !== 'idle' && progressStage !== 'complete'
                ? `${IMPORT_STAGES.indexOf(progressStage as ImportStage) + 1}/${IMPORT_STAGES.length}`
                : ''}
            </span>
          </div>
          <div className="nb-track">
            <div
              className="nb-track-fill transition-all duration-300"
              style={{
                width: `${
                  progressStage === 'idle'
                    ? 0
                    : progressStage === 'complete'
                      ? 100
                      : ((IMPORT_STAGES.indexOf(progressStage as ImportStage) + 1) / IMPORT_STAGES.length) * 100
                }%`,
              }}
            />
          </div>
        </div>

        {progressMessage ? (
          <p className="mt-3 text-sm font-semibold text-fg-muted dark:text-fg-muted-dark">{progressMessage}</p>
        ) : null}

        {error ? (
          <p className="nb-box-flat mt-3 bg-danger px-4 py-2 text-sm font-bold text-black dark:bg-danger-dark dark:text-black">{error}</p>
        ) : null}

        <div className="mt-6 flex items-center justify-between text-sm">
          <button
            type="button"
            className="font-bold underline decoration-2 underline-offset-4 disabled:opacity-40"
            onClick={handleCancel}
            disabled={!isUploading}
          >
            Cancel import
          </button>

          <button
            type="button"
            className="nb-btn nb-btn-main px-4 py-2"
            onClick={() => {
              if (!canDismiss) return
              resetState()
              onClose()
            }}
            disabled={!canDismiss}
          >
            {importedBookId ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface ProgressStepProps {
  label: string
  status: StepStatus
}

function ProgressStep({ label, status }: ProgressStepProps) {
  return (
    <div className="nb-box-flat flex items-center gap-3 px-4 py-3">
      <span className="nb-box-flat inline-flex h-7 w-7 items-center justify-center bg-main text-sm text-black dark:bg-main-dark">
        {statusIcon(status)}
      </span>
      <span className="text-sm font-bold">{label}</span>
    </div>
  )
}

function statusIcon(status: StepStatus) {
  switch (status) {
    case 'done':
      return <Check className="h-4 w-4" />
    case 'active':
      return <Loader2 className="h-4 w-4 animate-spin" />
    case 'error':
      return <AlertTriangle className="h-4 w-4" />
    default:
      return <Circle className="h-4 w-4" />
  }
}

interface LibraryCardProps {
  entry: LibraryEntry
  onDelete: () => void
  onOpen: () => void
  onViewBookmarks: () => void
}

function LibraryCard({ entry, onDelete, onOpen, onViewBookmarks }: LibraryCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <article
      className="nb-box relative cursor-pointer p-4 transition-[transform,box-shadow] duration-100 hover:translate-x-[2px] hover:translate-y-[2px] hover:[box-shadow:var(--shadow-nb-sm)] active:translate-x-[4px] active:translate-y-[4px] active:[box-shadow:var(--shadow-nb-none)]"
      onClick={onOpen}
    >
      <div className="absolute right-2 top-2 z-10">
        <button
          type="button"
          className="nb-btn nb-btn-neutral h-8 w-8"
          aria-label="Book options"
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen(!menuOpen)
          }}
        >
          <MoreVertical className="h-5 w-5" strokeWidth={2.5} />
        </button>
        {menuOpen ? (
          <>
            <div className="fixed inset-0 z-10" onClick={(e) => {
              e.stopPropagation()
              setMenuOpen(false)
            }} />
            <div className="nb-box absolute right-0 top-11 z-20 w-48 overflow-hidden p-0">
              <button
                type="button"
                className="flex w-full items-center gap-3 border-b-2 border-border px-4 py-2.5 text-left text-sm font-bold transition hover:bg-main hover:text-black dark:hover:bg-main-dark"
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuOpen(false)
                  onViewBookmarks()
                }}
              >
                <Bookmark className="h-4 w-4" />
                View Bookmarks
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-bold transition hover:bg-danger hover:text-black dark:hover:bg-danger-dark"
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuOpen(false)
                  onDelete()
                }}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-4">
        <div className="nb-box-flat h-20 w-16 flex-shrink-0 overflow-hidden bg-main dark:bg-main-dark">
          {entry.coverUrl ? (
            <img src={entry.coverUrl} alt="Book cover" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-black">
              <BookOpen className="h-6 w-6" strokeWidth={2.5} />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col pr-8">
          <h3 className="text-base font-extrabold leading-tight">{entry.title}</h3>
          {entry.author ? <p className="mt-1 text-sm font-semibold text-fg-muted dark:text-fg-muted-dark">{entry.author}</p> : null}
          <div className="mt-3">
            <ProgressBar percent={entry.progressPercent ?? 0} />
          </div>
        </div>
      </div>
    </article>
  )
}

interface ProgressBarProps {
  percent: number
}

function ProgressBar({ percent }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(percent)))
  return (
    <div className="nb-track flex-1">
      <div className="nb-track-fill" style={{ width: `${clamped}%` }} />
    </div>
  )
}

function EmptyLibrary({ onUpload, onStore }: { onUpload: () => void; onStore: () => void }) {
  return (
    <div className="nb-box-lg flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="nb-box flex h-16 w-16 items-center justify-center bg-yellow text-black dark:bg-yellow">
        <Store className="h-7 w-7" strokeWidth={2.5} />
      </div>
      <h2 className="mt-5 text-xl font-extrabold uppercase">Your shelf is empty</h2>
      <p className="mt-2 text-sm font-semibold text-fg-muted dark:text-fg-muted-dark">
        Pick a free classic from the Store, or bring your own EPUB or PDF.
      </p>
      <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <button type="button" className="nb-btn nb-btn-main px-5 py-2.5 text-sm" onClick={onStore}>
          <Store className="h-4 w-4" strokeWidth={2.5} /> Browse the Store
        </button>
        <button type="button" className="nb-btn nb-btn-neutral px-5 py-2.5 text-sm" onClick={onUpload}>
          <Upload className="h-4 w-4" strokeWidth={2.5} /> Upload a file
        </button>
      </div>
    </div>
  )
}

interface ScoreSheetProps {
  score: ScoreState
  profile: ReaderProfile | null
  onClose: () => void
}

function ScoreSheet({ score, profile, onClose }: ScoreSheetProps) {
  const level = levelFor(score.points)
  const week = weekMinutes(score)
  const today = todayStats(score)
  const maxMin = Math.max(1, ...week)
  const events: ScoreEvent[] = ['slide_read', 'chapter_done', 'book_done', 'note_saved', 'book_added', 'goal_hit']

  return (
    <div
      className="nb-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="nb-modal flex max-h-[88vh] max-w-md flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5">
          {profile ? (
            <div className="[container-type:inline-size]">
              <ReaderCard profile={profile} points={score.points} booksFinished={score.finishedBooks.length} />
            </div>
          ) : null}

          <div className="mt-5 flex items-end justify-between">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-widest text-fg-muted dark:text-fg-muted-dark">Level</div>
              <div className="font-display text-2xl">{level.name}</div>
            </div>
            <div className="text-right">
              <div className="font-display text-2xl tabular-nums">{score.points.toLocaleString()}</div>
              <div className="text-xs font-extrabold uppercase tracking-widest text-fg-muted dark:text-fg-muted-dark">
                {level.next ? `${(level.next - score.points).toLocaleString()} to next` : 'top level'}
              </div>
            </div>
          </div>
          <div className="nb-track mt-2">
            <div className="nb-track-fill" style={{ width: `${level.progress * 100}%` }} />
          </div>

          <div className="mt-5 flex items-end justify-between">
            <div className="text-xs font-extrabold uppercase tracking-widest text-fg-muted dark:text-fg-muted-dark">This week</div>
            <div className="text-xs font-bold">
              Today {Math.round(today.seconds / 60)} min{profile ? ` of ${profile.targetMinutes}` : ''}
              {today.goalHit ? ' · target hit' : ''}
            </div>
          </div>
          <div className="mt-2 flex h-16 items-end gap-1.5">
            {week.map((m, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={`w-full rounded-nb border-2 border-border ${i === 6 ? 'bg-main dark:bg-main-dark' : 'bg-surface-muted dark:bg-surface-muted-dark'}`}
                  style={{ height: `${Math.max(8, (m / maxMin) * 100)}%` }}
                  title={`${m} min`}
                />
              </div>
            ))}
          </div>

          <div className="mt-5 text-xs font-extrabold uppercase tracking-widest text-fg-muted dark:text-fg-muted-dark">How points work</div>
          <ul className="mt-2 divide-y-2 divide-border border-2 border-border rounded-nb">
            {events.map((e) => (
              <li key={e} className="flex items-center justify-between px-3 py-2 text-sm font-semibold">
                <span>{EVENT_LABELS[e]}</span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-fg-muted dark:text-fg-muted-dark">×{score.counts[e].toLocaleString()}</span>
                  <span className="nb-chip bg-lime text-black">+{POINTS[e]}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t-2 border-border p-4">
          <button type="button" className="nb-btn nb-btn-main w-full px-4 py-2.5 text-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function deriveProgress(progress: Progress | undefined, totalSlides: number) {
  if (!progress || progress.slideIndex <= 0 || totalSlides <= 0) {
    return {
      percent: 0,
      actionLabel: 'Start',
    }
  }

  const denominator = Math.max(totalSlides - 1, 1)
  const percent = Math.min(100, Math.round((progress.slideIndex / denominator) * 100))

  return {
    percent,
    actionLabel: `Resume ${percent}%`,
  }
}

interface DeleteConfirmationModalProps {
  onConfirm: () => void
  onCancel: () => void
}

function DeleteConfirmationModal({ onConfirm, onCancel }: DeleteConfirmationModalProps) {
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
      <div className="nb-modal max-w-sm p-6">
        <div className="flex items-center gap-3">
          <div className="nb-box-flat flex h-10 w-10 items-center justify-center bg-danger text-black dark:bg-danger-dark">
            <AlertTriangle className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <h2 className="text-xl font-extrabold uppercase">Delete Book</h2>
        </div>
        <p className="mt-4 text-sm font-semibold text-fg-muted dark:text-fg-muted-dark">
          Are you sure you want to delete this book? This will remove all your progress and cannot be undone.
        </p>
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
            className="nb-btn nb-btn-danger flex-1 px-4 py-2 text-sm"
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export { deriveProgress }

export default HomePage
