import { useEffect, useState } from 'react'
import { App as KonstaApp } from 'konsta/react'
import { HomePage } from '@/pages/HomePage'
import { InstallPrompt } from '@/components/InstallPrompt'
import { ReaderPage } from '@/pages/ReaderPage'
import { storageService } from '@/db/StorageService'
import { Loader2 } from 'lucide-react'
import { Onboarding } from '@/onboarding/Onboarding'
import { importService } from '@/importer/ImportService'
import { isAcceptedFile, notifyLibraryChanged, onSharedItem, takeSharedItems, type SharedItem } from '@/shared/sharedFiles'
import { saveArticleFromUrl, hostOf } from '@/articles/ArticleService'

function App() {
  const [initialBookId, setInitialBookId] = useState<string | null | undefined>(undefined)
  const [isCheckingLastBook, setIsCheckingLastBook] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [sharing, setSharing] = useState<{ name: string; label?: string; error?: string; url?: string } | null>(null)

  // Things shared to Skim: files (EPUB/PDF) and web pages, via the Android
  // share sheet / Open with, or the PWA share target.
  useEffect(() => {
    let cancelled = false
    const openBook = async (bookId: string) => {
      await storageService.setKV('onboardingDone', true)
      await storageService.setKV('lastOpenedBookId', bookId)
      setNeedsOnboarding(false)
      setInitialBookId(bookId)
      notifyLibraryChanged()
      setSharing(null)
    }
    const handle = async (item: SharedItem) => {
      if (item.kind === 'file') {
        if (!isAcceptedFile(item.file)) {
          setSharing({ name: item.file.name, error: 'Only EPUB and PDF files can be added.' })
          return
        }
        setSharing({ name: item.file.name, label: 'Adding to your library' })
        try {
          await openBook(await importService.import(item.file))
        } catch (err) {
          setSharing({ name: item.file.name, error: err instanceof Error ? err.message : String(err) })
        }
        return
      }
      setSharing({ name: item.title || hostOf(item.url), label: 'Saving article', url: item.url })
      try {
        const bookId = await saveArticleFromUrl(item.url, {
          onStage: (stage, detail) =>
            setSharing({
              name: detail || item.title || hostOf(item.url),
              label: stage === 'fetching' ? 'Fetching page' : stage === 'extracting' ? 'Reading the page' : 'Saving article',
              url: item.url,
            }),
        })
        await openBook(bookId)
      } catch (err) {
        setSharing({ name: item.title || hostOf(item.url), error: err instanceof Error ? err.message : String(err), url: item.url })
      }
    }
    const drain = async () => {
      let items: SharedItem[] = []
      try {
        items = await takeSharedItems()
      } catch (err) {
        console.error('Shared item read failed', err)
        setSharing({ name: 'shared item', error: err instanceof Error ? err.message : String(err) })
      }
      if (cancelled || items.length === 0) return
      for (const item of items) await handle(item)
      if (window.location.search.includes('shared=1')) {
        window.history.replaceState(null, '', '/')
      }
    }
    void drain()
    const off = onSharedItem(() => void drain())
    return () => {
      cancelled = true
      off()
    }
  }, [])

  useEffect(() => {
    const checkOnboarding = async () => {
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
      } catch (err) {
        console.error('Failed to check onboarding state', err)
      } finally {
        // Always land on the library; a book opens only when the reader asks for one.
        setInitialBookId(null)
        setIsCheckingLastBook(false)
      }
    }

    checkOnboarding()
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
            <div className="mt-5 flex gap-3">
              {sharing.url ? (
                <a href={sharing.url} target="_blank" rel="noreferrer" className="nb-btn nb-btn-neutral flex-1 px-4 py-2.5 text-sm">
                  Open in browser
                </a>
              ) : null}
              <button type="button" className="nb-btn nb-btn-main flex-1 px-4 py-2.5 text-sm" onClick={() => setSharing(null)}>
                OK
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="nb-box flex h-11 w-11 shrink-0 items-center justify-center bg-yellow">
              <Loader2 className="h-5 w-5 animate-spin text-black" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-extrabold">{sharing.label || 'Adding to your library'}</div>
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
          onDone={async (bookId) => {
            await storageService.setKV('onboardingDone', true)
            if (bookId) {
              await storageService.setKV('lastOpenedBookId', bookId)
              setInitialBookId(bookId)
            }
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
