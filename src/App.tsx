import { useEffect, useState } from 'react'
import { App as KonstaApp } from 'konsta/react'
import { HomePage } from '@/pages/HomePage'
import { InstallPrompt } from '@/components/InstallPrompt'
import { ReaderPage } from '@/pages/ReaderPage'
import { storageService } from '@/db/StorageService'
import { Loader2 } from 'lucide-react'
import { Onboarding } from '@/onboarding/Onboarding'
import { importService } from '@/importer/ImportService'
import { isAcceptedFile, notifyLibraryChanged, onSharedFile, takeSharedFiles } from '@/shared/sharedFiles'

function App() {
  const [initialBookId, setInitialBookId] = useState<string | null | undefined>(undefined)
  const [isCheckingLastBook, setIsCheckingLastBook] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [sharing, setSharing] = useState<{ name: string; error?: string } | null>(null)

  // Files shared to Skim (Android share sheet / Open with, or the PWA share target)
  useEffect(() => {
    let cancelled = false
    const drain = async () => {
      let files: File[] = []
      try {
        files = await takeSharedFiles()
      } catch (err) {
        console.error('Shared file read failed', err)
        const message = err instanceof Error ? err.message : String(err)
        setSharing({ name: 'shared file', error: message })
      }
      if (cancelled || files.length === 0) return
      for (const file of files) {
        if (!isAcceptedFile(file)) {
          setSharing({ name: file.name, error: 'Only EPUB and PDF files can be added.' })
          continue
        }
        setSharing({ name: file.name })
        try {
          const bookId = await importService.import(file)
          await storageService.setKV('onboardingDone', true)
          await storageService.setKV('lastOpenedBookId', bookId)
          setNeedsOnboarding(false)
          setInitialBookId(bookId)
          notifyLibraryChanged()
          setSharing(null)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          setSharing({ name: file.name, error: message })
        }
      }
      if (window.location.search.includes('shared=1')) {
        window.history.replaceState(null, '', '/')
      }
    }
    void drain()
    const off = onSharedFile(() => void drain())
    return () => {
      cancelled = true
      off()
    }
  }, [])

  useEffect(() => {
    const checkLastOpenedBook = async () => {
      try {
        const onboarded = await storageService.getKV('onboardingDone')
        if (!onboarded) {
          // Existing libraries skip onboarding; only a truly fresh install sees it.
          const books = await storageService.getAllBooks()
          if (books.length === 0) {
            setNeedsOnboarding(true)
          } else {
            await storageService.setKV('onboardingDone', true)
          }
        }

        // Get the last opened book ID from storage
        const lastBookId = await storageService.getKV('lastOpenedBookId')

        if (lastBookId) {
          // Verify the book still exists
          const book = await storageService.getBook(lastBookId)
          if (book) {
            setInitialBookId(lastBookId)
          } else {
            // Book was deleted, clear the stored ID
            await storageService.deleteKV('lastOpenedBookId')
            setInitialBookId(null)
          }
        } else {
          setInitialBookId(null)
        }
      } catch (err) {
        console.error('Failed to check last opened book', err)
        setInitialBookId(null)
      } finally {
        setIsCheckingLastBook(false)
      }
    }

    checkLastOpenedBook()
  }, [])

  const handleExitReader = () => {
    setInitialBookId(null)
  }

  const sharingOverlay = sharing ? (
    <div className="nb-overlay" role="status" aria-live="polite">
      <div className="nb-modal max-w-sm p-5">
        {sharing.error ? (
          <>
            <h2 className="text-lg font-extrabold">Couldn’t add {sharing.name}</h2>
            <p className="mt-2 text-sm font-semibold text-fg-muted dark:text-fg-muted-dark">{sharing.error}</p>
            <button type="button" className="nb-btn nb-btn-main mt-5 w-full px-4 py-2.5 text-sm" onClick={() => setSharing(null)}>
              OK
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="nb-box flex h-11 w-11 shrink-0 items-center justify-center bg-yellow">
              <Loader2 className="h-5 w-5 animate-spin text-black" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-extrabold">Adding to your library</div>
              <div className="truncate text-xs font-semibold text-fg-muted dark:text-fg-muted-dark">{sharing.name}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null

  if (isCheckingLastBook) {
    return (
      <KonstaApp theme="ios" safeAreas>
        <div className="flex h-screen items-center justify-center bg-bg dark:bg-bg-dark">
          <div className="nb-box flex h-16 w-16 items-center justify-center bg-yellow dark:bg-yellow">
            <Loader2 className="h-8 w-8 animate-spin text-black" strokeWidth={2.5} />
          </div>
        </div>
        <InstallPrompt />
        {sharingOverlay}
      </KonstaApp>
    )
  }

  if (needsOnboarding) {
    return (
      <KonstaApp theme="ios" safeAreas>
        <Onboarding
          onDone={async () => {
            await storageService.setKV('onboardingDone', true)
            setNeedsOnboarding(false)
          }}
        />
        {sharingOverlay}
      </KonstaApp>
    )
  }

  if (initialBookId) {
    return (
      <KonstaApp theme="ios" safeAreas>
        <ReaderPage key={initialBookId} bookId={initialBookId} onExit={handleExitReader} />
        <InstallPrompt />
        {sharingOverlay}
      </KonstaApp>
    )
  }

  return (
    <KonstaApp theme="ios" safeAreas>
      <HomePage />
      <InstallPrompt />
      {sharingOverlay}
    </KonstaApp>
  )
}

export default App
