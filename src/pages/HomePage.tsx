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
import { AlertTriangle, BookOpen, Check, Circle, Loader2, MoreVertical, Plus, Trash2, Upload, X, Bookmark } from 'lucide-react'
import { ReaderPage } from '@/pages/ReaderPage'

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
  const [entries, setEntries] = useState<LibraryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isUploadOpen, setUploadOpen] = useState(false)
  const [deleteBookId, setDeleteBookId] = useState<string | null>(null)
  const [readingBookId, setReadingBookId] = useState<string | null>(null)
  const [showBookmarksOnOpen, setShowBookmarksOnOpen] = useState(false)

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

      const books = await storageService.getAllBooks()
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
    return () => revokeCoverUrls()
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-center px-6 pt-6 pb-4">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">Skim</p>
        </div>
      </header>

      <main className="flex-1 px-6 pb-24">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-950/40 p-4 text-sm text-red-200">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" /> Error
            </div>
            {error}
          </div>
        ) : entries.length === 0 ? (
          <EmptyLibrary onUpload={() => setUploadOpen(true)} />
        ) : (
          <ul className="space-y-4">
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
        className="fixed bottom-6 right-6 inline-flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg transition hover:bg-indigo-400"
        aria-label="Upload Document"
        onClick={() => setUploadOpen(true)}
      >
        <Plus className="h-6 w-6" />
      </button>

      {isUploadOpen ? (
        <UploadOverlay
          onClose={handleCloseUpload}
          onImported={async (bookId) => {
            await refreshLibrary()
            handleCloseUpload()
          }}
        />
      ) : null}

      {deleteBookId ? (
        <DeleteConfirmationModal
          onConfirm={() => handleDeleteBook(deleteBookId)}
          onCancel={() => setDeleteBookId(null)}
        />
      ) : null}
    </div>
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
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 transition hover:bg-slate-800"
    >
      {children}
    </button>
  )
}

interface UploadOverlayProps {
  onClose: () => void
  onImported: (bookId: string) => Promise<void> | void
}

function UploadOverlay({ onClose, onImported }: UploadOverlayProps) {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Import Document</h2>
            <p className="mt-1 text-sm text-slate-400">Add an EPUB or PDF from your device.</p>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-slate-400 transition hover:text-slate-100"
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
          className={`mt-6 flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition ${
            dragActive ? 'border-slate-200 bg-slate-800/60' : 'border-slate-700 bg-slate-800/40'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-300">
            <Upload className="h-6 w-6" />
          </div>
          <p className="mt-4 text-base font-medium">Drag & drop your document</p>
          <p className="mt-1 text-sm text-slate-400">or</p>
          <button
            type="button"
            className="mt-4 inline-flex items-center rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
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
          <p className="mt-4 text-xs text-slate-400">EPUB or PDF · Up to 20 MB</p>
          {fileName ? <p className="mt-3 text-sm text-slate-300">Selected: {fileName}</p> : null}
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-slate-300">
              {progressStage !== 'idle' ? STAGE_LABELS[progressStage as ImportStage] : 'Ready'}
            </span>
            <span className="text-slate-400">
              {progressStage !== 'idle' && progressStage !== 'complete'
                ? `${IMPORT_STAGES.indexOf(progressStage as ImportStage) + 1}/${IMPORT_STAGES.length}`
                : ''}
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="absolute left-0 top-0 h-full bg-indigo-500 transition-all duration-300"
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
          <p className="mt-3 text-sm text-slate-400">{progressMessage}</p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg bg-red-500/20 px-4 py-2 text-sm text-red-200">{error}</p>
        ) : null}

        <div className="mt-6 flex items-center justify-between text-sm">
          <button
            type="button"
            className="text-slate-300 transition hover:text-white disabled:text-slate-600"
            onClick={handleCancel}
            disabled={!isUploading}
          >
            Cancel import
          </button>

          <button
            type="button"
            className={`inline-flex items-center rounded-full px-4 py-2 font-semibold transition ${
              canDismiss ? 'bg-slate-100 text-slate-900 hover:bg-white' : 'bg-slate-700 text-slate-400'
            }`}
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
    <div className="flex items-center gap-3 rounded-lg bg-slate-800/60 px-4 py-3">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-sm">
        {statusIcon(status)}
      </span>
      <span className="text-sm text-slate-200">{label}</span>
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
      className="relative cursor-pointer rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-slate-700 hover:bg-slate-900"
      onClick={onOpen}
    >
      <div className="absolute right-2 top-2 z-10">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
          aria-label="Book options"
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen(!menuOpen)
          }}
        >
          <MoreVertical className="h-5 w-5" />
        </button>
        {menuOpen ? (
          <>
            <div className="fixed inset-0 z-10" onClick={(e) => {
              e.stopPropagation()
              setMenuOpen(false)
            }} />
            <div className="absolute right-0 top-10 z-20 w-48 rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl">
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-slate-300 transition hover:bg-slate-700"
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
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-red-400 transition hover:bg-slate-700"
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
        <div className="h-20 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-slate-800">
          {entry.coverUrl ? (
            <img src={entry.coverUrl} alt="Book cover" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-400">
              <BookOpen className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col pr-8">
          <h3 className="text-base font-semibold text-white">{entry.title}</h3>
          {entry.author ? <p className="mt-1 text-sm text-slate-400">{entry.author}</p> : null}
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
    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
      <div className="absolute left-0 top-0 h-full bg-slate-200" style={{ width: `${clamped}%` }} />
    </div>
  )
}

function EmptyLibrary({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 px-6 py-16 text-center text-slate-300">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 text-slate-300">
        <Upload className="h-7 w-7" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-white">Upload your first book</h2>
      <p className="mt-2 text-sm text-slate-400">
        Import an EPUB or PDF to start reading quick-slide chapters.
      </p>
      <button
        type="button"
        className="mt-6 inline-flex items-center rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
        onClick={onUpload}
      >
        Add a book
      </button>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel()
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20 text-red-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold">Delete Book</h2>
        </div>
        <p className="mt-4 text-sm text-slate-300">
          Are you sure you want to delete this book? This will remove all your progress and cannot be undone.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            className="flex-1 rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="flex-1 rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-400"
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
